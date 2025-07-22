require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const pdf = require('pdf-parse'); // Memastikan import di tingkat atas
const mammoth = require('mammoth');

// Inisialisasi klien Supabase di luar handler untuk efisiensi
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// --- Fungsi Handler Utama Netlify ---
exports.handler = async function(event) {
    // Selalu pastikan kita hanya memproses permintaan POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { storagePath, fileName, fileType, sessionId } = JSON.parse(event.body);

        // 1. Download file dari Supabase Storage sebagai Buffer
        const { data: blob, error: downloadError } = await supabase.storage
            .from('knowledge-base')
            .download(storagePath);

        if (downloadError) {
            throw new Error(`Gagal mengunduh file dari storage: ${downloadError.message}`);
        }

        // Konversi Blob ke Buffer Node.js
        const buffer = Buffer.from(await blob.arrayBuffer());

        // 2. Parse konten teks berdasarkan tipe file
        let textContent = '';
        if (fileType === 'application/pdf') {
            const data = await pdf(buffer);
            textContent = data.text;
        } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const { value } = await mammoth.extractRawText({ buffer });
            textContent = value;
        } else if (fileType.startsWith('text/')) {
            textContent = buffer.toString('utf-8');
        } else {
            throw new Error(`Tipe file '${fileType}' tidak didukung untuk ekstraksi konten.`);
        }

        // 3. Simpan metadata dan teks hasil ekstraksi ke database
        const { error: dbError } = await supabase.from('documents').insert({
            file_name: fileName,
            file_type: fileType,
            storage_path: storagePath,
            text_content: textContent,
            session_id: sessionId || null, // Akan null jika untuk KB, atau berisi ID jika kontekstual
        });

        if (dbError) {
            throw new Error(`Gagal menyimpan metadata ke database: ${dbError.message}`);
        }

        // 4. Kirim respons sukses ke frontend
        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Dokumen '${fileName}' berhasil diproses dan siap digunakan.` }),
        };

    } catch (error) {
        console.error('Error dalam fungsi process-document:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};