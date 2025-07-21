const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const formidable = require('formidable');
const fs = require('fs');
const util = require('util');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

function chunkText(text, chunkSize = 1000, overlap = 100) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    chunks.push(text.substring(i, end));
    i += (chunkSize - overlap);
  }
  return chunks.filter(chunk => chunk.trim().length > 0);
}

// Convert formidable parse to promise
const parseForm = (event) => {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: true });
    const bodyBuffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
    form.parse(bodyBuffer, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
};

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let fields, files;
  try {
    ({ fields, files } = await parseForm(event));
  } catch (parseError) {
    console.error('Error parsing form data:', parseError);
    return { statusCode: 400, body: JSON.stringify({ error: 'Failed to parse form data' }) };
  }

  const documentName = fields.documentName ? fields.documentName[0] : null;
  const contentText = fields.content ? fields.content[0] : null;
  const uploadedFiles = Array.isArray(files.files) ? files.files : [files.files].filter(Boolean);

  if (!documentName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Document name is required' }) };
  }

  let allChunks = [];

  // Process text content
  if (contentText) {
    const chunks = chunkText(contentText);
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      allChunks.push({
        document_name: documentName,
        content: chunk,
        embedding
      });
    }
  }

  // Process uploaded files
  for (const file of uploadedFiles) {
    if (!file || !file.filepath) continue;

    const filePath = file.filepath;
    let fileContent = '';

    try {
      if (file.mimetype === 'application/pdf') {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        fileContent = data.text;
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ path: filePath });
        fileContent = result.value;
      } else if (file.mimetype === 'text/plain') {
        fileContent = fs.readFileSync(filePath, 'utf8');
      } else {
        console.warn(`Unsupported file type: ${file.mimetype}`);
        continue;
      }

      // Skip empty files
      if (!fileContent.trim()) {
        console.warn(`File ${file.originalFilename} is empty`);
        continue;
      }

      const chunks = chunkText(fileContent);
      for (const chunk of chunks) {
        const embedding = await getEmbedding(chunk);
        allChunks.push({
          document_name: documentName,
          content: chunk,
          embedding
        });
      }
    } catch (fileError) {
      console.error(`Error processing file ${file.originalFilename}:`, fileError);
    }
  }

  if (allChunks.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No valid content found' }) };
  }

  try {
    // Insert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const { error } = await supabase
        .from('knowledge_base')
        .insert(batch);

      if (error) {
        console.error('Supabase insert error:', error);
        return { 
          statusCode: 500, 
          body: JSON.stringify({ error: `Failed to insert into Supabase: ${error.message}` }) 
        };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: `Document '${documentName}' processed successfully with ${allChunks.length} chunks` 
      })
    };

  } catch (error) {
    console.error('Error processing document:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};