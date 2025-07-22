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
        // Perbaikan: Hapus kurung kurawal ekstra di sekitar doc.storage_path
        [span_0](start_span)const { error: storageError } = await supabase.storage.from('knowledge-base').remove([doc.storage_path]);[span_0](end_span)
        [span_1](start_span)if (storageError) console.warn("Peringatan: Gagal menghapus file dari storage, mungkin sudah terhapus.", storageError.message);[span_1](end_span)
        // 3. Hapus record dari tabel database
        [span_2](start_span)const { error: dbError } = await supabase.from('documents').delete().eq('id', id);[span_2](end_span)
        [span_3](start_span)if (dbError) throw dbError;[span_3](end_span)

        [span_4](start_span)return { statusCode: 200, body: JSON.stringify({ message: 'Dokumen berhasil dihapus.' }) };[span_4](end_span)
    } catch (error) {
        [span_5](start_span)return { statusCode: 500, body: JSON.stringify({ error: error.message }) };[span_5](end_span)
    }
};
