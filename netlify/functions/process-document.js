require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function parseContent(buffer, fileType) {
    if (fileType === 'application/pdf') return (await pdf(buffer)).text;
    if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return (await mammoth.extractRawText({ buffer })).value;
    if (fileType.startsWith('text/')) return buffer.toString('utf-8');
    throw new Error('Tipe file tidak didukung untuk ekstraksi konten.');
}

exports.handler = async function(event) {
    try {
        const { storagePath, fileName, fileType, sessionId } = JSON.parse(event.body);

        // 1. Download file dari Supabase Storage (koneksi server-to-server, sangat cepat)
        const { data: blob, error: downloadError } = await supabase.storage
            .from('knowledge-base').download(storagePath);
        if (downloadError) throw downloadError;
        const buffer = Buffer.from(await blob.arrayBuffer());

        // 2. Parse konten teks
        const textContent = await parseContent(buffer, fileType);

        // 3. Simpan metadata ke database. Perhatikan kolom session_id.
        const { error: dbError } = await supabase.from('documents').insert({
            file_name: fileName,
            file_type: fileType,
            storage_path: storagePath,
            text_content: textContent,
            session_id: sessionId || null // Akan null jika untuk KB, atau berisi ID jika kontekstual
        });
        if (dbError) throw dbError;

        return { statusCode: 200, body: JSON.stringify({ message: `Dokumen '${fileName}' berhasil diproses dan siap digunakan.` }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};