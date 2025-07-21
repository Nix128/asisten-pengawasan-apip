const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { id } = event.queryStringParameters;

  try {
    const { error } = await supabase
      .from('knowledge_base')
      .delete()
      .eq('document_name', id); // In our case, id is document name

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Document deleted' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};