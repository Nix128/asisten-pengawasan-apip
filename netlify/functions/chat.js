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
    // Panggil fungsi RPC `match_documents` di Supabase untuk pencarian vektor
    const { data: kbData, error: kbError } = await supabase.rpc('match_documents', {
        query_embedding: promptEmbedding,
        match_threshold: 0.7, // Ambang batas kesamaan: 0.7 (70% mirip atau lebih). Sesuaikan jika perlu.
        match_count: 3        // Jumlah dokumen paling relevan yang ingin diambil dari KB
    });

    if (kbError) {
      console.error('Supabase KB search error:', kbError);
      // Jika ada error database, kita akan anggap tidak ada konteks dari KB dan akan beralih ke fallback
    }

    let contextText = '';
    // Tentukan panjang minimum konteks agar dianggap "cukup" relevan dari knowledge base.
    const MIN_RELEVANT_CONTEXT_LENGTH = 50; // Misalnya, minimal 50 karakter teks relevan

    if (kbData && kbData.length > 0) {
      // Filter chunk yang mungkin kosong atau hanya spasi, lalu gabungkan
      const relevantChunks = kbData.filter(doc => doc.content && doc.content.trim().length > 0);
      contextText = relevantChunks.map(doc => doc.content).join('\n---\n');
      console.log('Context from knowledge base:', contextText); // Untuk debugging di log Netlify
    }

    let finalResponse;
    let currentSystemInstruction;
    let currentFullPrompt;

    // --- Implementasi Logika Dua Tahap: Knowledge Base Dulu, Baru Fallback ke Model Dasar ---
    // Jika konteks yang ditemukan cukup panjang (di atas MIN_RELEVANT_CONTEXT_LENGTH) dan tidak ada error KB
    if (contextText.length > MIN_RELEVANT_CONTEXT_LENGTH && !kbError) {
      // Logic 1: Gunakan Knowledge Base (RAG) untuk analisis dan rekomendasi
      currentSystemInstruction = `Anda adalah AI Asisten pengawasan yang bertugas menganalisis data, mencari temuan terhadap ketidakpatuhan aturan, dan memberikan rekomendasi perbaikan.
      Ikuti instruksi berikut:
      1. Jawab pertanyaan pengguna HANYA berdasarkan informasi yang terdapat dalam "Informasi terkait" yang diberikan.
      2. Jika informasi yang dibutuhkan TIDAK ada dalam "Informasi terkait", katakan dengan sopan bahwa Anda "tidak memiliki informasi yang relevan dalam data pengawasan Anda untuk menjawab pertanyaan tersebut dari konteks yang ada". JANGAN MENGADA-NGADA jawaban.
      3. Lakukan analisis mendalam terhadap informasi yang diberikan untuk mencari temuan ketidakpatuhan aturan atau anomali.
      4. Berikan rekomendasi perbaikan yang konkret, jelas, dan dapat ditindaklanjuti berdasarkan analisis Anda.
      5. Rangkum dan sintetiskan informasi dari konteks jika relevan untuk mendukung temuan dan rekomendasi.
      6. Berikan jawaban yang jelas, akurat, komprehensif, dan langsung ke inti permasalahan.
      7. Jaga nada bicara profesional, objektif, dan informatif.`;

      currentFullPrompt = `${currentSystemInstruction}\n\nInformasi terkait:\n${contextText}\n\nPertanyaan pengguna: ${prompt}`;
      console.log('Using RAG prompt for analysis and recommendations.'); // Untuk debugging
    } else {
      // Logic 2: Fallback ke Base Model AI (Gemini 1.5 Pro Latest)
      // Ini akan digunakan jika tidak ada konteks relevan dari KB atau terjadi error KB
      console.log('No sufficient context found in knowledge base or KB error. Falling back to base AI model.');
      currentSystemInstruction = `Anda adalah AI Asisten pengawasan yang informatif, cerdas, dan membantu. Jawab pertanyaan pengguna dengan pengetahuan umum Anda. Jika Anda tidak yakin, berikan jawaban terbaik yang Anda bisa atau tanyakan klarifikasi. Berikan jawaban yang relevan dan berguna.`;

      currentFullPrompt = `${currentSystemInstruction}\n\nPertanyaan pengguna: ${prompt}`;
    }

    // --- Panggil Gemini 1.5 Pro dengan prompt dan parameter generasi yang sesuai ---
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: currentFullPrompt }] }], // Bungkus prompt dalam format contents
      generationConfig: {
        temperature: 0.2,       // Rendah untuk menjaga akurasi, presisi, dan konsistensi
        maxOutputTokens: 2000,  // Ditingkatkan untuk respons yang lebih panjang, detail, dan komprehensif
        topP: 0.9,              // Mengontrol diversitas pemilihan kata, membuang yang terlalu tidak mungkin
        topK: 40,               // Mengontrol diversitas pemilihan kata, membatasi pada 40 pilihan teratas
      },
      // safetySettings: [
      //   // Opsional: Untuk mengontrol kategori konten berbahaya yang dihasilkan.
      //   // Contoh: { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      //   // Anda bisa menyesuaikan ini jika AI menghasilkan respons yang tidak pantas.
      // ]
    });

    finalResponse = result.response.text(); // Ambil teks respons dari Gemini

    // --- Simpan histori percakapan ke Supabase ---
    const { error: dbError } = await supabase
      .from('conversation_history')
      .insert({
        user_id: userId || null,
        prompt: prompt,
        response: finalResponse // Simpan respons akhir AI (dari RAG atau fallback)
      });

    if (dbError) {
      console.error('Error saving conversation history:', dbError);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: finalResponse })
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
