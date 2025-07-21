const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { id, response } = JSON.parse(event.body);

  try {
    const { data, error } = await supabase
      .from('conversation_history')
      .update({ response })
      .eq('id', id);

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'History updated' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};