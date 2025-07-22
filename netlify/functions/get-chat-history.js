require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async function(event) {
    try {
        const sessionId = event.queryStringParameters.sessionId;
        if (!sessionId) throw new Error('Parameter sessionId diperlukan');

        const { data, error } = await supabase
            .from('chat_history')
            .select('role, content')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};