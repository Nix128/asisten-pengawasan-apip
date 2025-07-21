// netlify/functions/chat.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// Inisialisasi Google Generative AI dengan API Key dari variabel lingkungan
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Pilih model Gemini 1.5 Pro untuk generasi teks
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
// Pilih model embedding untuk mengubah teks menjadi vektor numerik
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

// Inisialisasi klien Supabase dengan URL dan Anon Key dari variabel lingkungan
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Fungsi untuk mendapatkan embedding (vektor numerik) dari teks
async function getEmbedding(text) {
  try {
    const { embedding } = await embeddingModel.embedContent(text);
    return embedding.values;
  } catch (error) {
    console.error('Error getting embedding:', error);
    throw error;
  }
}

// Handler utama untuk Netlify Function
exports.handler = async function(event, context) {
  // Pastikan request adalah POST method
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, userId } = JSON.parse(event.body);

    if (!prompt) {
      return { statusCode: 400, body: 'Missing prompt in request body' };
    }

    // --- Langkah 1: Buat embedding dari prompt (pertanyaan) pengguna ---
    const promptEmbedding = await getEmbedding(prompt);

    // --- Langkah 2: Cari dokumen paling relevan di knowledge_base (UPAYA RAG) ---
    // Panggil fungsi RPC `match_documents`
    const { data: kbData, error: kbError } = await supabase.rpc('match_documents', {
        query_embedding: promptEmbedding,
        match_threshold: 0.7, // Ambang batas kesamaan: 0.7 (70% mirip atau lebih). Bisa disesuaikan.
        match_count: 3        // Jumlah dokumen paling relevan yang ingin diambil dari KB
    });

    if (kbError) {
      console.error('Supabase KB search error:', kbError);
      // Jika ada error database, kita akan anggap tidak ada konteks dari KB dan akan fallback
    }

    let contextText = '';
    // Tentukan panjang minimum konteks agar dianggap "cukup".
    // Jika konteks yang ditemukan sangat pendek, mungkin tidak relevan.
    const MIN_RELEVANT_CONTEXT_LENGTH = 50; // Misalnya, minimal 50 karakter teks relevan

    if (kbData && kbData.length > 0) {
      // Filter chunk yang mungkin kosong atau hanya spasi
      const relevantChunks = kbData.filter(doc => doc.content && doc.content.trim().length > 0);
      contextText = relevantChunks.map(doc => doc.content).join('\n---\n');
      console.log('Context from knowledge base:', contextText); // Untuk debugging
    }

    let finalResponse;
    let currentSystemInstruction;
    let currentFullPrompt;

    // --- Implementasi Logika Dua Tahap: Knowledge Base Dulu, Baru Fallback ke Model Dasar ---
    // Jika konteks yang ditemukan cukup panjang dan ada data dari KB
    if (contextText.length > MIN_RELEVANT_CONTEXT_LENGTH && !kbError) {
      // Logic 1: Gunakan Knowledge Base (RAG)
      currentSystemInstruction = `Anda adalah AI Asisten pengawasan yang bertugas menganalisis dan merangkum informasi dari dokumen yang disediakan.
      Ikuti instruksi berikut:
      1. Jawab pertanyaan pengguna HANYA berdasarkan informasi yang terdapat dalam "Informasi terkait" yang diberikan.
      2. Jika pertanyaan pengguna TIDAK DAPAT dijawab dengan informasi yang tersedia dalam konteks, katakan dengan sopan bahwa Anda "tidak memiliki informasi yang relevan dalam data pengawasan Anda untuk menjawab pertanyaan tersebut dari konteks yang ada". JANGAN MENGADA-NGADA jawaban.
      3. Rangkum dan sintetiskan informasi dari konteks jika relevan.
      4. Berikan jawaban yang jelas, akurat, dan langsung ke inti permasalahan.
      5. Jaga nada bicara profesional dan informatif.`;

      currentFullPrompt = `${currentSystemInstruction}\n\nInformasi terkait:\n${contextText}\n\nPertanyaan pengguna: ${prompt}`;
      console.log('Using RAG prompt.'); // Untuk debugging
    } else {
      // Logic 2: Fallback ke Base Model AI (Gemini 1.5 Pro Last)
      console.log('No sufficient context found in knowledge base or KB error. Falling back to base AI model.');
      currentSystemInstruction = `Anda adalah AI Asisten pengawasan yang informatif, cerdas, dan membantu. Jawab pertanyaan pengguna dengan pengetahuan umum Anda. Jika Anda tidak yakin, berikan jawaban terbaik yang Anda bisa atau tanyakan klarifikasi. Berikan jawaban yang relevan dan berguna.`;

      currentFullPrompt = `${currentSystemInstruction}\n\nPertanyaan pengguna: ${prompt}`;
    }

    // --- Panggil Gemini 1.5 Pro dengan prompt yang sesuai ---
    const result = await model.generateContent(currentFullPrompt);
    finalResponse = result.response.text(); // Ambil teks respons dari Gemini

    // --- Simpan histori percakapan ke Supabase ---
    const { error: dbError } = await supabase
      .from('conversation_history')
      .insert({
        user_id: userId || null,
        prompt: prompt,
        response: finalResponse // Simpan respons akhir, baik dari RAG maupun fallback
      });

    if (dbError) {
      console.error('Error saving conversation history:', dbError);
    }

    // Mengembalikan respons sukses ke frontend
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: finalResponse })
    };

  } catch (error) {
    console.error('Error in chat function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
