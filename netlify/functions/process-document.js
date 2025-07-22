require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async function(event) {
    console.log('CHECKPOINT 0: Fungsi process-document dipanggil.');

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { storagePath, fileName, fileType, sessionId } = JSON.parse(event.body);
        console.log(`CHECKPOINT 1: Memproses file '${fileName}' (${fileType}) dari path: ${storagePath}`);

        // Langkah 1: Download file dari Supabase Storage
        console.log('CHECKPOINT 2: Mengunduh file dari Supabase Storage...');
        const { data: blob, error: downloadError } = await supabase.storage
            .from('knowledge-base')
            .download(storagePath);

        if (downloadError) throw new Error(`Gagal mengunduh file: ${downloadError.message}`);
        console.log('CHECKPOINT 3: File berhasil diunduh. Ukuran blob: ' + blob.size + ' bytes.');

        // PERBAIKAN UTAMA: Konversi Blob ke Buffer yang benar
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log('CHECKPOINT 4: Berhasil mengonversi blob ke buffer.');

        // Langkah 3: Ekstraksi Teks
        let textContent = '';
        console.log(`CHECKPOINT 5: Memulai ekstraksi teks untuk tipe: ${fileType}`);

        try {
            if (fileType === 'application/pdf') {
                const data = await pdf(buffer);
                textContent = data.text;
            } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                const { value } = await mammoth.extractRawText({ buffer });
                textContent = value;
            } else if (fileType.startsWith('text/')) {
                textContent = buffer.toString('utf-8');
            } else {
                console.warn(`Peringatan: Tipe file '${fileType}' tidak didukung`);
                textContent = `Konten tidak dapat diekstrak untuk tipe file: ${fileType}.`;
            }
        } catch (extractionError) {
            console.error('Error ekstraksi teks:', extractionError);
            textContent = `Gagal mengekstrak konten: ${extractionError.message}`;
        }

        console.log('CHECKPOINT 6: Ekstraksi teks selesai. Panjang teks: ' + textContent.length + ' karakter.');

        // Langkah 4: Simpan ke Database
        console.log('CHECKPOINT 7: Menyimpan metadata ke database...');
        const { error: dbError } = await supabase.from('documents').insert({
            file_name: fileName,
            file_type: fileType,
            storage_path: storagePath,
            text_content: textContent,
            session_id: sessionId || null,
        });

        if (dbError) throw new Error(`Gagal menyimpan ke database: ${dbError.message}`);
        console.log('CHECKPOINT 8: Berhasil menyimpan ke database.');

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Dokumen '${fileName}' berhasil diproses.` }),
        };

    } catch (error) {
        console.error('FATAL ERROR dalam process-document:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};