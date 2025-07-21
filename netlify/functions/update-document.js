const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

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
  if (event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { id, content } = JSON.parse(event.body);

  try {
    // Get embedding for the updated content
    const embedding = await getEmbedding(content);

    // Update the document chunk
    const { error } = await supabase
      .from('knowledge_base')
      .update({ content, embedding })
      .eq('id', id);

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Document updated' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};