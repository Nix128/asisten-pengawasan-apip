const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function getEmbedding(text) {
  try {
    const { embedding } = await embeddingModel.embedContent(text);
    return embedding.values;
  } catch (error) {
    console.error('Error getting embedding:', error);
    throw error;
  }
}

// Enhanced APIP Analysis Prompt
const APIP_SYSTEM_PROMPT = `Anda adalah AI Asisten Pengawasan APIP yang bertugas:
1. Menganalisis data dan dokumen untuk menemukan ketidakpatuhan terhadap:
   - Peraturan perundang-undangan
   - Standar Operasional Prosedur (SOP)
   - Prinsip tata kelola yang baik
2. Mengidentifikasi potensi temuan dan risiko
3. Memberikan rekomendasi perbaikan yang spesifik, terukur, dan dapat ditindaklanjuti
4. Berdasarkan pada kerangka kerja pengawasan:
   - UU No. 15 Tahun 2004 tentang Pemeriksaan Pengelolaan Keuangan Negara
   - Standar Pemeriksaan Keuangan Negara (SPKN)
   - Prinsip 3E (Ekonomi, Efisiensi, Efektivitas)
   - COSO Internal Control Framework

Analisis harus mencakup:
- Kesesuaian dengan peraturan
- Efektivitas pengendalian internal
- Efisiensi penggunaan sumber daya
- Pencapaian tujuan program/kegiatan
- Identifikasi indikasi penyimpangan

Langkah analisis:
1. Identifikasi masalah berdasarkan data
2. Analisis akar penyebab
3. Evaluasi dampak
4. Rekomendasi solusi berbasis bukti

Format respons:
### Temuan
[Deskripsi temuan]
### Analisis
[Analisis mendalam]
### Rekomendasi
[Rekomendasi spesifik]`;

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, files = [] } = JSON.parse(event.body);

    if (!prompt && files.length === 0) {
      return { statusCode: 400, body: 'Missing prompt or files' };
    }

    // Get relevant documents from knowledge base
    let contextText = '';
    if (prompt) {
      const promptEmbedding = await getEmbedding(prompt);

      const { data: kbData, error: kbError } = await supabase.rpc('match_documents', {
        query_embedding: promptEmbedding,
        match_threshold: 0.75,
        match_count: 5
      });

      if (!kbError && kbData && kbData.length > 0) {
        contextText = kbData.map(doc => 
          `[DOKUMEN: ${doc.document_name}]\n${doc.content}`
        ).join('\n\n');
      }
    }

    // Prepare the full prompt
    let fullPrompt = APIP_SYSTEM_PROMPT;

    if (contextText) {
      fullPrompt += `\n\nINFORMASI TERKAIT:\n${contextText}`;
    }

    if (files.length > 0) {
      fullPrompt += `\n\nDokumen yang diunggah: ${files.join(', ')}`;
    }

    fullPrompt += `\n\nPERTANYAAN: ${prompt || 'Analisis dokumen yang diunggah'}`;

    // Generate response
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4000,
        topP: 0.9,
        topK: 40
      }
    });

    const responseText = result.response.text();

    // Save to conversation history
    const userId = "admin"; // In a real app, get from session
    await supabase
      .from('conversation_history')
      .insert({
        user_id: userId,
        prompt: prompt || "Analisis dokumen",
        response: responseText
      });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: responseText })
    };

  } catch (error) {
    console.error('Error in chat function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};