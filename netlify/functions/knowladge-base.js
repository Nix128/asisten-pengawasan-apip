const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async function(event, context) {
  try {
    const { document_name } = event.queryStringParameters || {};

    if (document_name) {
      // Get specific document chunks
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .eq('document_name', document_name)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return {
        statusCode: 200,
        body: JSON.stringify(data)
      };
    }

    // Get all documents grouped
    const { data: allData, error } = await supabase
      .from('knowledge_base')
      .select('id, document_name, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const documents = allData.reduce((acc, item) => {
      const existing = acc.find(d => d.document_name === item.document_name);
      if (existing) {
        existing.chunk_count++;
      } else {
        acc.push({
          id: item.id,
          document_name: item.document_name,
          created_at: item.created_at,
          chunk_count: 1
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