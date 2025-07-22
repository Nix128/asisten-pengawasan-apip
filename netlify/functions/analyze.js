require('dotenv').config();
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-key.json");

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.handler = async (event) => {
  try {
    const { documentId } = JSON.parse(event.body);
    const docSnap = await db.collection("dokumen_ai").doc(documentId).get();
    if (!docSnap.exists) return { statusCode: 404, body: "Dokumen tidak ditemukan." };
    const documentText = docSnap.data().isi;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const prompt = `Analisis dokumen secara mendalam dan berikan ringkasan serta pertanyaan kritis.\n\nDokumen:\n${documentText}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 2000,
        stopSequences: ["### AKHIR ANALISIS"]
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
      ]
    });

    const response = await result.response;
    return { statusCode: 200, body: JSON.stringify({ analisis: response.text() }) };

  } catch (error) {
    console.error("Gagal analisis dokumen:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};