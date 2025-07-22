require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-key.json");

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.handler = async (event) => {
  const { user, message } = JSON.parse(event.body);
  const docs = await db.collection("dokumen_ai").get();
  const semuaIsi = docs.docs.map(d => d.data().isi).join("\n---\n");

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
  const result = await model.generateContent(`Berikut dokumen:\n${semuaIsi}\n\nPertanyaan: ${message}`);
  const response = await result.response;
  const reply = response.text();

  await db.collection("percakapan").add({ user, message, reply, waktu: new Date().toISOString() });

  return { statusCode: 200, body: JSON.stringify({ reply }) };
};