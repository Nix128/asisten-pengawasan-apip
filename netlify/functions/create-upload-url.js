require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async function(event) {
    try {
        const { fileName } = JSON.parse(event.body);
        // Buat path unik untuk mencegah penimpaan file
        const storagePath = `public/${Date.now()}_${fileName}`;

        // Minta URL upload khusus (Signed URL) yang valid selama 60 detik
        const { data, error } = await supabase.storage
            .from('knowledge-base')
            .createSignedUploadUrl(storagePath);

        if (error) throw error;

        // Kirim kembali URL dan path ke frontend
        return {
            statusCode: 200,
            body: JSON.stringify({ signedUrl: data.signedUrl, path: data.path }),
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};