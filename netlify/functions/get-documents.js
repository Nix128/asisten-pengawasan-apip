// netlify/functions/get-documents.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async function() {
    try {
        const { data, error } = await supabase
            .from('documents')
            .select('id, file_name, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};