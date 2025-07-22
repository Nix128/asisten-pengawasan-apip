// netlify/functions/chat.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { google } = require('googleapis');

// --- Inisialisasi Klien ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const customsearch = google.customsearch('v1');

// --- Definisi "Alat" untuk Gemini: Google Search ---
async function googleSearch(query) {
    console.log(`Performing Google Search for: ${query}`);
    try {
        const response = await customsearch.cse.list({
            auth: process.env.GOOGLE_API_KEY,
            cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
            q: query,
            num: 3, // Ambil 3 hasil teratas
        });
        const items = response.data.items || [];
        return JSON.stringify(items.map(item => ({ title: item.title, link: item.link, snippet: item.snippet })));
    } catch (error) {
        console.error('Google Search API Error:', error.message);
        return 'Gagal melakukan pencarian Google.';
    }
}

const tools = [{
    functionDeclarations: [{
        name: 'googleSearch',
        description: 'Melakukan pencarian Google untuk mendapatkan informasi terkini terkait pengawasan internal pemerintah (APIP), peraturan, atau topik terkait.',
        parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'Kueri pencarian yang spesifik.' } }, required: ['query'] }
    }]
}];

// --- System Prompt yang Detail ---
const systemInstruction = `Anda adalah Asisten Ahli di bidang Pengawasan Internal Pemerintah (APIP) yang sangat profesional. Tugas Anda adalah memberikan jawaban yang akurat, terstruktur, dan mudah dipahami.

ATURAN WAJIB UNTUK SEMUA JAWABAN:
1.  Format Penulisan: Tulis jawaban Anda dalam paragraf yang jelas dan lengkap. Jika Anda perlu membuat daftar, gunakan format daftar bernomor (1., 2., 3.) atau poin-poin dengan tanda hubung (-).
2.  Gaya Bahasa: Gunakan gaya bahasa formal, lugas, dan profesional seperti sedang menyusun sebuah memo atau laporan resmi. Hindari bahasa gaul atau terlalu santai.
3.  LARANGAN KERAS: Jangan pernah menggunakan format markdown. Jangan gunakan tanda bintang (\`**\`) untuk menebalkan teks. Sampaikan poin penting melalui struktur kalimat yang baik.

ALUR PENCARIAN INFORMASI:
1.  Prioritas Utama: Selalu rujuk ke 'KONTEKS DOKUMEN' yang saya berikan. Ini adalah sumber kebenaran utama Anda.
2.  Prioritas Kedua: Jika jawaban tidak ada di konteks, gunakan basis pengetahuan internal Anda sebagai seorang ahli.
3.  Prioritas Terakhir: Jika kedua sumber di atas tidak cukup, gunakan alat \`googleSearch\` yang tersedia, tetapi hanya untuk kueri yang sangat spesifik terkait pengawasan APIP.`;

exports.handler = async (event) => {
    try {
        const { message, sessionId } = JSON.parse(event.body);

        // 1. Ambil Knowledge Base dari Supabase
        const { data: documents, error: docError } = await supabase.from('documents').select('file_name, text_content');
        if (docError) throw new Error(`Gagal mengambil dokumen: ${docError.message}`);

        let knowledgeBaseContext = "Tidak ada dokumen di knowledge base.";
        if (documents && documents.length > 0) {
            knowledgeBaseContext = documents.map(doc => `--- Dokumen: ${doc.file_name} ---\n${doc.text_content}`).join('\n\n');
        }
        const fullSystemInstruction = `${systemInstruction}\n\n--- KONTEKS DOKUMEN ---\n${knowledgeBaseContext}\n--- AKHIR KONTEKS ---`;

        // 2. Ambil Riwayat Chat
        const { data: historyData, error: historyError } = await supabase
            .from('chat_history').select('role, content').eq('session_id', sessionId).order('created_at', { ascending: true });
        if (historyError) throw new Error(`Gagal mengambil riwayat: ${historyError.message}`);

        const history = historyData.map(item => ({
            role: item.role,
            parts: [{ text: item.content }],
        }));

        // 3. Panggil Gemini dengan Konteks, Riwayat, dan Alat
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest", systemInstruction: fullSystemInstruction, tools });
        const chat = model.startChat({ history });
        const result = await chat.sendMessage(message);
        let response = result.response;

        // 4. Proses jika Gemini meminta menggunakan alat (Function Calling)
        const functionCall = response.candidates[0].content.parts.find(part => part.functionCall);
        if (functionCall) {
            const { name, args } = functionCall.functionCall;
            if (name === 'googleSearch') {
                const searchResult = await googleSearch(args.query);
                // Kirim hasil pencarian kembali ke Gemini untuk dirangkum
                const result2 = await chat.sendMessage([
                    { functionResponse: { name: 'googleSearch', response: { name: 'googleSearch', content: searchResult } } }
                ]);
                response = result2.response;
            }
        }

        const aiResponseText = response.text();

        // 5. Simpan percakapan ke Supabase
        await supabase.from('chat_history').insert([
            { session_id: sessionId, role: 'user', content: message },
            { session_id: sessionId, role: 'model', content: aiResponseText }
        ]);

        // 6. Kirim jawaban final (untuk sekarang non-streaming, lebih mudah diimplementasikan dahulu)
        return {
            statusCode: 200,
            body: JSON.stringify({ reply: aiResponseText }),
        };

    } catch (error) {
        console.error('Error in chat function:', error);
        return { statusCode: 500, body: JSON.stringify({ error: `Terjadi kesalahan di server: ${error.message}` }) };
    }
};

// Catatan: Implementasi streaming akan saya jelaskan sebagai langkah peningkatan setelah versi dasar ini berjalan.
// Versi ini lebih mudah untuk didebug terlebih dahulu.