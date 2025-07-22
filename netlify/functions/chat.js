// Mengimpor modul yang diperlukan
require('dotenv').config();
[span_0](start_span)const { createClient } = require('@supabase/supabase-js');[span_0](end_span)
[span_1](start_span)const { GoogleGenerativeAI } = require('@google/generative-ai');[span_1](end_span)
[span_2](start_span)const { google } = require('googleapis');[span_2](end_span)

// --- Inisialisasi Klien ---
// Klien ini akan digunakan untuk semua interaksi dengan layanan eksternal
[span_3](start_span)const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);[span_3](end_span)
[span_4](start_span)const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);[span_4](end_span)
[span_5](start_span)const customsearch = google.customsearch('v1');[span_5](end_span)

// --- Definisi "Alat" untuk Gemini: Google Search ---
// Fungsi ini akan dipanggil oleh AI jika ia memutuskan perlu mencari informasi di Google
async function googleSearch(query) {
    console.log(`Melakukan Pencarian Google untuk: ${query}`);
    [span_6](start_span)try {[span_6](end_span)
        const response = await customsearch.cse.list({
            auth: process.env.GOOGLE_API_KEY,
            cx: process.env.Google Search_ENGINE_ID,
            q: query,
            num: 3, // Ambil 3 hasil teratas agar konteks tidak terlalu panjang
        });
        const items = response.data.items || [span_7](start_span)[];[span_7](end_span)
        // Format hasil menjadi string JSON agar mudah dibaca oleh AI
        return JSON.stringify(items.map(item => ({ title: item.title, link: item.link, snippet: item.snippet })));
    [span_8](start_span)} catch (error) {[span_8](end_span)
        console.error('Google Search API Error:', error.message);
        [span_9](start_span)return 'Gagal melakukan pencarian Google.';[span_9](end_span)
    }
}

// Mendefinisikan struktur alat agar Gemini tahu cara menggunakannya
const tools = [{
    functionDeclarations: [{
        name: 'googleSearch',
        description: 'Melakukan pencarian Google untuk mendapatkan informasi terkini terkait pengawasan internal pemerintah (APIP), peraturan, atau topik terkait.',
        parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'Kueri pencarian yang spesifik.'
        [span_10](start_span)} }, required: ['query'] }[span_10](end_span)
    }]
}];

// --- System Prompt yang Detail ---
// Instruksi ini adalah "jiwa" dari AI kita, menentukan kepribadian dan aturannya
const systemInstruction = `Anda adalah Asisten Ahli di bidang Pengawasan Internal Pemerintah (APIP) yang sangat profesional.
[span_11](start_span)Tugas Anda adalah memberikan jawaban yang akurat, terstruktur, dan mudah dipahami.[span_11](end_span)
[span_12](start_span)ATURAN WAJIB UNTUK SEMUA JAWABAN:[span_12](end_span)
1.  [span_13](start_span)Format Penulisan: Tulis jawaban Anda dalam paragraf yang jelas dan lengkap.[span_13](end_span)
[span_14](start_span)Jika Anda perlu membuat daftar, gunakan format daftar bernomor (1., 2., 3.) atau poin-poin dengan tanda hubung (-).[span_14](end_span)
2.  [span_15](start_span)Gaya Bahasa: Gunakan gaya bahasa formal, lugas, dan profesional seperti sedang menyusun sebuah memo atau laporan resmi.[span_15](end_span)
[span_16](start_span)Hindari bahasa gaul atau terlalu santai.[span_16](end_span)
3.  [span_17](start_span)LARANGAN KERAS: Jangan pernah menggunakan format markdown.[span_17](end_span)
Jangan gunakan tanda bintang (\`**\`) untuk menebalkan teks. [span_18](start_span)Sampaikan poin penting melalui struktur kalimat yang baik.[span_18](end_span)
[span_19](start_span)ALUR PENCARIAN INFORMASI:[span_19](end_span)
1.  Prioritas Utama: Selalu rujuk ke 'KONTEKS DOKUMEN' yang saya berikan. [span_20](start_span)Ini adalah sumber kebenaran utama Anda.[span_20](end_span)
2.  [span_21](start_span)Prioritas Kedua: Jika jawaban tidak ada di konteks, gunakan basis pengetahuan internal Anda sebagai seorang ahli.[span_21](end_span)
3.  [span_22](start_span)Prioritas Terakhir: Jika kedua sumber di atas tidak cukup, gunakan alat \`googleSearch\` yang tersedia, tetapi hanya untuk kueri yang sangat spesifik terkait pengawasan APIP.`;[span_22](end_span)
// --- Fungsi Handler Utama Netlify ---
// Ini adalah titik masuk utama yang akan dijalankan oleh Netlify setiap kali ada permintaan
[span_23](start_span)exports.handler = async (event) => {[span_23](end_span)
    try {
        // Ambil pesan dan ID sesi dari permintaan frontend
        const { message, sessionId } = JSON.parse(event.body);
        // 1. Ambil Konteks Dokumen (Permanen + Kontekstual untuk Sesi Ini)
        const { data: documents, error: docError } = await supabase
            .from('documents')
            .select('file_name, text_content')
            .or(`session_id.eq.${sessionId},session_id.is.null`);
        [span_24](start_span)// Logika KUNCI: ambil dokumen permanen ATAU dokumen sesi ini[span_24](end_span)

        if (docError) throw new Error(`Gagal mengambil dokumen: ${docError.message}`);
        // Gabungkan semua teks dokumen menjadi satu blok konteks
        [span_25](start_span)let knowledgeBaseContext = "Tidak ada dokumen di knowledge base.";[span_25](end_span)
        [span_26](start_span)if (documents && documents.length > 0) {[span_26](end_span)
            knowledgeBaseContext = documents.map(doc => `--- Dokumen: ${doc.file_name} ---\n${doc.text_content}`).join('\n\n');
        }
        [span_27](start_span)const fullSystemInstruction = `${systemInstruction}\n\n--- KONTEKS DOKUMEN ---\n${knowledgeBaseContext}\n--- AKHIR KONTEKS ---`;[span_27](end_span)
        // 2. Ambil Riwayat Chat untuk sesi ini
        const { data: historyData, error: historyError } = await supabase
            [span_28](start_span).from('chat_history').select('role, content').eq('session_id', sessionId).order('created_at', { ascending: true });[span_28](end_span)
        if (historyError) throw new Error(`Gagal mengambil riwayat: ${historyError.message}`);

        [span_29](start_span)const history = historyData.map(item => ({ role: item.role, parts: [{ text: item.content }] }));[span_29](end_span)
        // 3. Cek apakah ini percakapan baru untuk membuat judul nanti
        [span_30](start_span)const { data: conversation, error: convError } = await supabase.from('conversations').select('session_id').eq('session_id', sessionId).single();[span_30](end_span)
        // 4. Panggil Gemini dengan semua konteks yang telah disiapkan
        [span_31](start_span)const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest", systemInstruction: fullSystemInstruction, tools });[span_31](end_span)
        [span_32](start_span)const chat = model.startChat({ history });[span_32](end_span)
        const result = await chat.sendMessage(message);
        [span_33](start_span)let response = result.response;[span_33](end_span)
        // 5. Proses jika Gemini meminta menggunakan alat (Function Calling)
        [span_34](start_span)const functionCall = response.candidates[0].content.parts.find(part => part.functionCall);[span_34](end_span)
        if (functionCall) {
            [span_35](start_span)const { name, args } = functionCall.functionCall;[span_35](end_span)
            if (name === 'googleSearch') {
                [span_36](start_span)const searchResult = await googleSearch(args.query);[span_36](end_span)
                // Kirim hasil pencarian kembali ke Gemini untuk dirangkum
                [span_37](start_span)const result2 = await chat.sendMessage([ { functionResponse: { name: 'googleSearch', response: { name: 'googleSearch', content: searchResult } } } ]);[span_37](end_span)
                [span_38](start_span)response = result2.response;[span_38](end_span)
            }
        }

        [span_39](start_span)const aiResponseText = response.text();[span_39](end_span)
        // 6. Jika ini percakapan baru, buat dan simpan judul
        if (!conversation && !convError) { // `!convError` memastikan tidak ada error saat pengecekan
            // Menggunakan model yang sama dengan chat utama untuk pembuatan judul
            const titleGenModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
            [span_40](start_span)const titlePrompt = `Buat judul yang sangat singkat (maksimal 5 kata) untuk percakapan yang diawali dengan ini:\n\nPENGGUNA: "${message}"\n\nJUDUL:`;[span_40](end_span)
            [span_41](start_span)const titleResult = await titleGenModel.generateContent(titlePrompt);[span_41](end_span)
            [span_42](start_span)const title = titleResult.response.text().replace(/"/g, '').trim();[span_42](end_span)
            [span_43](start_span)await supabase.from('conversations').insert({ session_id: sessionId, title: title || "Percakapan Baru" });[span_43](end_span)
        }

        // 7. Simpan pesan baru ke riwayat percakapan
        await supabase.from('chat_history').insert([
            { session_id: sessionId, role: 'user', content: message },
            { session_id: sessionId, role: 'model', content: aiResponseText
            [span_44](start_span)}
        ]);

        // 8. Kirim jawaban final ke frontend
        return {
            statusCode: 200,
            body: JSON.stringify({ reply: aiResponseText }),
        };

    } catch (error) {
        // Tangani semua kemungkinan error dalam satu blok
        console.error('Error in ', error);[span_44](end_span)
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Terjadi kesalahan di server: ${error.message}` })
        };
    }
};
