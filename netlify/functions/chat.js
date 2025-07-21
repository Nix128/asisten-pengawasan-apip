// netlify/functions/chat.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' }); // Tambahkan ini

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Fungsi untuk mendapatkan embedding dari teks (sama seperti di upload-document.js)
async function getEmbedding(text) {
  try {
    const { embedding } = await embeddingModel.embedContent(text);
    return embedding.values;
  } catch (error) {
    console.error('Error getting embedding:', error);
    throw error;
  }
}

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, userId } = JSON.parse(event.body);

    if (!prompt) {
      return { statusCode: 400, body: 'Missing prompt in request body' };
    }

    // --- Langkah 1: Buat embedding dari prompt pengguna ---
    const promptEmbedding = await getEmbedding(prompt);

    // --- Langkah 2: Cari dokumen paling relevan di knowledge_base menggunakan pencarian kesamaan vektor ---
    // Gunakan fungsi Supabase `match_documents` atau `match_vectors` jika Anda membuat itu.
    // Jika tidak, Anda bisa menggunakan `ORDER BY embedding <-> '[${promptEmbedding}]' LIMIT N`
    // untuk mencari vektor terdekat.

    const { data: kbData, error: kbError } = await supabase
      .from('knowledge_base')
      .select('content')
      // Penting: Pastikan kolom 'embedding' sudah ada dan 'pgvector' aktif di Supabase
      // dan 'promptEmbedding' adalah array of numbers.
      .order('embedding', { ascending: false, foreignTable: `knowledge_base` }) // Ini bisa sedikit berbeda tergantung versi pgvector
      .limit(5) // Ambil 5 dokumen teratas
      .rpc('match_documents', {
        query_embedding: promptEmbedding,
        match_threshold: 0.7, // Sesuaikan threshold kesamaan
        match_count: 5 // Jumlah dokumen yang ingin diambil
      });

    // Supabase RPC function `match_documents` perlu Anda buat sendiri di Supabase SQL Editor:
    /*
    CREATE OR REPLACE FUNCTION match_documents (query_embedding vector(1536), match_threshold float, match_count int)
    RETURNS TABLE (id uuid, content text, similarity float)
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN query
      SELECT
        knowledge_base.id,
        knowledge_base.content,
        1 - (knowledge_base.embedding <=> query_embedding) as similarity
      FROM knowledge_base
      WHERE 1 - (knowledge_base.embedding <=> query_embedding) > match_threshold
      ORDER BY similarity DESC
      LIMIT match_count;
    END;
    $$;
    */

    if (kbError) {
      console.error('Supabase KB search error:', kbError);
      // Lanjutkan tanpa konteks jika ada error Supabase
    }

    let contextText = '';
    if (kbData && kbData.length > 0) {
      contextText = kbData.map(doc => doc.content).join('\n---\n');
      console.log('Context from knowledge base:', contextText);
    }

    // --- Langkah 3: Bangun prompt dengan konteks yang diambil ---
    const systemInstruction = `Anda adalah AI Asisten pengawasan. Jawab pertanyaan pengguna berdasarkan informasi yang diberikan. Jika informasi tidak tersedia, katakan Anda tidak tahu.`;

    const fullPrompt = contextText
      ? `${systemInstruction}\n\nInformasi terkait:\n${contextText}\n\nPertanyaan pengguna: ${prompt}`
      : `${systemInstruction}\n\nPertanyaan pengguna: ${prompt}`; // Jika tidak ada konteks

    // --- Langkah 4: Panggil Gemini 1.5 Pro ---
    const result = await model.generateContent(fullPrompt);
    const response = result.response.text();

    // --- Simpan histori percakapan ke Supabase ---
    const { error: dbError } = await supabase
      .from('conversation_history')
      .insert({
        user_id: userId || null,
        prompt: prompt,
        response: response
      });

    if (dbError) {
      console.error('Error saving conversation history:', dbError);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: response })
    };

  } catch (error) {
    console.error('Error in chat function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
