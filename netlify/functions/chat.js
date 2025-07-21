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

// Fungsi untuk mendapatkan embedding (vektor numerik) dari teks menggunakan model embedding Gemini
async function getEmbedding(text) {
  try {
    const { embedding } = await embeddingModel.embedContent(text);
    return embedding.values; // Mengembalikan array nilai-nilai vektor
  } catch (error) {
    console.error('Error getting embedding:', error);
    throw error; // Lempar error agar bisa ditangani di pemanggil
  }
}

// Handler utama untuk Netlify Function
exports.handler = async function(event, context) {
  // Pastikan request adalah POST method
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Parse body request JSON untuk mendapatkan prompt dan user ID
    const { prompt, userId } = JSON.parse(event.body);

    // Validasi: prompt tidak boleh kosong
    if (!prompt) {
      return { statusCode: 400, body: 'Missing prompt in request body' };
    }

    // --- Langkah 1: Buat embedding dari prompt (pertanyaan) pengguna ---
    const promptEmbedding = await getEmbedding(prompt);

    // --- Langkah 2: Cari dokumen paling relevan di knowledge_base menggunakan pencarian kesamaan vektor ---
    // Panggil fungsi RPC `match_documents` yang telah kita buat di Supabase SQL Editor.
    // Fungsi ini akan mencari embedding yang paling mirip di tabel knowledge_base.
    const { data: kbData, error: kbError } = await supabase.rpc('match_documents', {
        query_embedding: promptEmbedding, // Embedding dari pertanyaan pengguna
        match_threshold: 0.7,             // Ambang batas kesamaan (misal: 0.7 berarti 70% mirip atau lebih)
                                          // Anda bisa menyesuaikan nilai ini jika hasil pencarian terlalu banyak/sedikit
        match_count: 5                    // Jumlah dokumen paling relevan yang ingin diambil
    });

    // Tangani error jika terjadi saat mencari di Supabase knowledge base
    if (kbError) {
      console.error('Supabase KB search error:', kbError);
      // Meskipun ada error, kita bisa memutuskan untuk tetap melanjutkan tanpa konteks dokumen
      // atau mengembalikan error, tergantung kebijakan. Di sini kita lanjut tanpa konteks.
    }

    let contextText = '';
    // Jika ada data yang ditemukan dari knowledge base, gabungkan kontennya menjadi satu string
    if (kbData && kbData.length > 0) {
      contextText = kbData.map(doc => doc.content).join('\n---\n'); // Gabungkan dengan pemisah
      console.log('Context from knowledge base:', contextText); // Untuk debugging di log Netlify
    }

    // --- Langkah 3: Bangun prompt akhir untuk Gemini 1.5 Pro dengan konteks yang diambil ---
    const systemInstruction = `Anda adalah AI Asisten pengawasan. Jawab pertanyaan pengguna berdasarkan informasi yang diberikan. Jika informasi tidak tersedia dalam konteks, katakan bahwa Anda tidak memiliki informasi tersebut. Berikan jawaban yang ringkas dan langsung ke poin.`;

    let fullPrompt;
    if (contextText) {
      // Jika ada konteks dari knowledge base, tambahkan ke prompt
      fullPrompt = `${systemInstruction}\n\nInformasi terkait:\n${contextText}\n\nPertanyaan pengguna: ${prompt}`;
    } else {
      // Jika tidak ada konteks, hanya berikan instruksi sistem dan pertanyaan pengguna
      fullPrompt = `${systemInstruction}\n\nPertanyaan pengguna: ${prompt}`;
    }

    // --- Langkah 4: Panggil Gemini 1.5 Pro dengan prompt yang sudah lengkap ---
    const result = await model.generateContent(fullPrompt);
    const response = result.response.text(); // Ambil teks respons dari Gemini

    // --- Langkah 5: Simpan histori percakapan ke Supabase ---
    // Ini membantu melacak interaksi dan bisa digunakan untuk fitur lanjutan (misal: riwayat chat)
    const { error: dbError } = await supabase
      .from('conversation_history')
      .insert({
        user_id: userId || null, // Gunakan ID pengguna jika ada, jika tidak null
        prompt: prompt,          // Prompt asli dari pengguna
        response: response,      // Respons dari AI
        // timestamp akan otomatis diisi oleh default value di tabel Supabase
      });

    // Tangani error jika terjadi saat menyimpan histori percakapan (tidak akan menghentikan respons ke user)
    if (dbError) {
      console.error('Error saving conversation history:', dbError);
    }

    // Mengembalikan respons sukses ke frontend
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: response })
    };

  } catch (error) {
    // Menangkap error umum dan mengembalikan respons error ke frontend
    console.error('Error in chat function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
