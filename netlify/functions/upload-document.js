// netlify/functions/upload-document.js
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
        const { fileName, fileType, fileData } = JSON.parse(event.body);
        const buffer = Buffer.from(fileData, 'base64');
        const storagePath = `public/${Date.now()}_${fileName}`;

        // 1. Upload file ke Supabase Storage
        const { error: uploadError } = await supabase.storage.from('knowledge_base').upload(storagePath, buffer, { contentType: fileType });
        if (uploadError) throw uploadError;

        // 2. Parse konten teks
        const textContent = await parseContent(buffer, fileType);

        // 3. Simpan metadata & konten teks ke database
        const { error: dbError } = await supabase.from('documents').insert({
            file_name: fileName,
            file_type: fileType,
            storage_path: storagePath,
            text_content: textContent,
        });
        if (dbError) throw dbError;

        return { statusCode: 200, body: JSON.stringify({ message: `Dokumen '${fileName}' berhasil ditambahkan ke Knowledge Base.` }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};