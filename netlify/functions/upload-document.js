// netlify/functions/upload-document.js
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse'); // Untuk PDF
const mammoth = require('mammoth'); // Untuk DOCX
const formidable = require('formidable'); // Untuk parsing form data file upload
const fs = require('fs'); // Untuk membaca file sementara yang diunggah

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

// Fungsi untuk mendapatkan embedding dari teks
async function getEmbedding(text) {
  try {
    const { embedding } = await embeddingModel.embedContent(text);
    return embedding.values;
  } catch (error) {
    console.error('Error getting embedding:', error);
    throw error;
  }
}

// Fungsi sederhana untuk membagi teks menjadi chunk.
function chunkText(text, chunkSize = 1000, overlap = 100) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        let chunk = text.substring(i, Math.min(i + chunkSize, text.length));
        chunks.push(chunk);
        if (i + chunkSize >= text.length && i < text.length) break; // Berhenti jika sudah di akhir teks
        i += (chunkSize - overlap);
        if (i < 0) i = 0; // Pastikan i tidak negatif
    }
    return chunks;
}

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Penting: Pastikan Replit sudah menginstal 'formidable' di package.json
  // Formidable digunakan untuk mengurai data multipart/form-data dari unggahan file
  const form = formidable();

  let fields;
  let files;

  try {
    // Netlify Functions mengirim body sebagai string, perlu Buffer untuk formidable
    // event.body bisa berupa string atau base64 encoded
    const bodyBuffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');

    // form.parse tidak mendukung callback dengan async/await, jadi kita pakai Promise
    [fields, files] = await new Promise((resolve, reject) => {
      form.parse(bodyBuffer, (err, flds, fls) => {
        if (err) return reject(err);
        resolve([flds, fls]);
      });
    });

  } catch (parseError) {
    console.error('Error parsing form data:', parseError);
    return { statusCode: 400, body: JSON.stringify({ error: 'Failed to parse form data. ' + parseError.message }) };
  }

  // Ambil documentName dari fields yang di-parse
  const documentName = fields.documentName ? fields.documentName[0] : null;
  const uploadedFile = files.documentFile ? files.documentFile[0] : null; // Ambil file yang diunggah
  const rawContentInput = fields.documentContent ? fields.documentContent[0] : null; // Konten teks jika tidak ada file

  let documentContent = '';

  if (!documentName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Document name is required.' }) };
  }

  if (uploadedFile) {
    const filePath = uploadedFile.filepath; // Path sementara file yang diunggah oleh formidable

    try {
      if (uploadedFile.mimetype === 'application/pdf') {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        documentContent = data.text;
      } else if (uploadedFile.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // Untuk DOCX, mammoth perlu membaca file dari path
        const result = await mammoth.extractRawText({ path: filePath });
        documentContent = result.value; // Teks yang diekstrak
      } else if (uploadedFile.mimetype === 'text/plain') {
        documentContent = fs.readFileSync(filePath, 'utf8');
      } else {
        // Jika jenis file tidak didukung
        return { statusCode: 400, body: JSON.stringify({ error: `Unsupported file type: ${uploadedFile.mimetype}. Please upload PDF, DOCX, or TXT.` }) };
      }
    } catch (fileProcessError) {
      console.error('Error processing uploaded file:', fileProcessError);
      return { statusCode: 500, body: JSON.stringify({ error: `Failed to process uploaded file: ${fileProcessError.message}` }) };
    }
  } else if (rawContentInput) {
    // Jika tidak ada file yang diunggah, gunakan konten dari textarea
    documentContent = rawContentInput;
  } else {
    // Jika tidak ada file dan tidak ada konten teks
    return { statusCode: 400, body: JSON.stringify({ error: 'No document file uploaded or content provided.' }) };
  }

  if (!documentContent.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Extracted document content is empty.' }) };
  }

  // --- Lanjutkan dengan chunking dan embedding seperti sebelumnya ---
  try {
    const textChunks = chunkText(documentContent, 1000, 100); // Sesuaikan ukuran chunk
    const recordsToInsert = [];

    if (textChunks.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'No text chunks could be created from the document.' }) };
    }

    for (const chunk of textChunks) {
      if (chunk.trim()) { // Pastikan chunk tidak kosong
          const embedding = await getEmbedding(chunk);
          recordsToInsert.push({
            document_name: documentName,
            content: chunk,
            embedding: embedding,
          });
      }
    }

    if (recordsToInsert.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'No valid chunks found to insert into knowledge base.' }) };
    }

    const { error } = await supabase
      .from('knowledge_base')
      .insert(recordsToInsert);

    if (error) {
        console.error('Supabase insert error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: `Failed to insert into Supabase: ${error.message}` }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Document '${documentName}' uploaded and processed successfully with ${recordsToInsert.length} chunks!` })
    };

  } catch (error) {
    console.error('Error processing document for knowledge base:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
