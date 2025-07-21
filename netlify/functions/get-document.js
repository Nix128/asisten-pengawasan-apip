const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async function(event, context) {
  try {
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('id, document_name, content, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Group by document name
    const documents = data.reduce((acc, item) => {
      const existing = acc.find(d => d.document_name === item.document_name);
      if (existing) {
        existing.chunk_count++;
      } else {
        acc.push({
          id: item.id,
          document_name: item.document_name,
          created_at: item.created_at,
          chunk_count: 1,
          content: item.content.substring(0, 300) + (item.content.length > 300 ? '...' : '')
        });
      }
      return acc;
    }, []);

    return {
      statusCode: 200,
      body: JSON.stringify(documents)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};