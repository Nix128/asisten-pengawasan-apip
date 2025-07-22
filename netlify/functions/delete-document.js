// netlify/functions/delete-document.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async function(event) {
    try {
        const { id } = JSON.parse(event.body);

        // 1. Dapatkan path file dari database
        const { data: doc, error: fetchError } = await supabase.from('documents').select('storage_path').eq('id', id).single();
        if (fetchError) throw new Error('Dokumen tidak ditemukan.');

        // 2. Hapus file dari Supabase Storage
        const { error: storageError } = await supabase.storage.from('knowledge_base').remove([doc.storage_path]);
        if (storageError) console.warn("Peringatan: Gagal menghapus file dari storage, mungkin sudah terhapus.", storageError.message);

        // 3. Hapus record dari tabel database
        const { error: dbError } = await supabase.from('documents').delete().eq('id', id);
        if (dbError) throw dbError;

        return { statusCode: 200, body: JSON.stringify({ message: 'Dokumen berhasil dihapus.' }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};