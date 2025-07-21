const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function getEmbedding(text) {
  try {
    const model = genAI.getGenerativeModel({ model: 'embedding-001' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error('Error getting embedding:', error);
    throw error;
  }
}

// Fallback untuk ekstraksi teks dari PDF
function extractTextFromPDFFallback(buffer) {
  const text = buffer.toString('ascii', 0, 1024 * 1024); // Ambil 1MB pertama
  return text.replace(/[^\x20-\x7E]/g, '');
}

const APIP_SYSTEM_PROMPT = `Anda adalah AI Asisten Pengawasan APIP yang bertugas:
1. Menganalisis data dan dokumen untuk menemukan ketidakpatuhan
2. Mengidentifikasi potensi temuan dan risiko
3. Memberikan rekomendasi perbaikan
4. Berdasarkan pada kerangka kerja pengawasan

Analisis harus mencakup:
- Kesesuaian dengan peraturan
- Efektivitas pengendalian internal
- Efisiensi penggunaan sumber daya

Format respons:
### Temuan
[Deskripsi temuan]
### Analisis
[Analisis mendalam]
### Rekomendasi
[Rekomendasi spesifik]`;

// Fungsi untuk membaca konten file
async function readFileContent(filePath, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      try {
        const data = await pdf(dataBuffer);
        return data.text;
      } catch (pdfError) {
        console.error('PDF parse error, using fallback:', pdfError);
        return extractTextFromPDFFallback(dataBuffer);
      }
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } else if (mimetype === 'text/plain') {
      return fs.readFileSync(filePath, 'utf8');
    }
    return '';
  } catch (error) {
    console.error('Error reading file:', error);
    return 'Konten tidak dapat dibaca';
  }
}

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

      if (kbError) {
        console.error('Error matching documents:', kbError);
        throw kbError;
      }

      if (kbData && kbData.length > 0) {
        contextText = kbData.map(doc => 
          `[DOKUMEN: ${doc.document_name}]\n${doc.content.substring(0, 500)}...`
        ).join('\n\n');
      }
    }

    // Prepare the full prompt
    let fullPrompt = APIP_SYSTEM_PROMPT;

    if (contextText) {
      fullPrompt += `\n\nINFORMASI TERKAIT:\n${contextText}`;
    }

    // Process uploaded files in chat
    if (files.length > 0) {
      fullPrompt += `\n\nDokumen yang diupload pengguna:`;
      for (const file of files) {
        const content = await readFileContent(file.path, file.mimetype);
        fullPrompt += `\n\n[FILE: ${file.name}]\n${content.substring(0, 1000)}...`;
      }
    }

    fullPrompt += `\n\nPERTANYAAN: ${prompt || 'Analisis dokumen yang diupload'}`;

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

    if (!result.response) {
      throw new Error('No response from Gemini API');
    }

    const responseText = await result.response.text();

    // Save to conversation history
    const userId = "admin";
    const { error: insertError } = await supabase
      .from('conversation_history')
      .insert({
        user_id: userId,
        prompt: prompt || "Analisis dokumen",
        response: responseText
      });

    if (insertError) {
      console.error('Error saving history:', insertError);
    }

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