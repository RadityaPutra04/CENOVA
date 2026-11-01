import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.GEMINI_API_KEY;
const model = "gemini-3.8-flash";
const root = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "15mb" }));
app.use(express.static(root));

function requireApiKey(res) {
  if (!apiKey) {
    res.status(503).json({ error: "GEMINI_API_KEY belum dikonfigurasi di file .env server." });
    return false;
  }
  return true;
}

async function callGemini(contents) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Gemini mengembalikan status ${response.status}.`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Respons Gemini tidak berisi teks.");
  return text;
}

app.post("/api/generate-quiz", async (req, res) => {
  if (!requireApiKey(res)) return;
  const { pdfBase64, mimeType } = req.body;
  if (typeof pdfBase64 !== "string" || mimeType !== "application/pdf") {
    res.status(400).json({ error: "PDF materi tidak valid." });
    return;
  }
  try {
    const text = await callGemini([{
      parts: [
        { text: "Baca PDF materi ini sebagai satu-satunya sumber. Buat tepat 8 pertanyaan pilihan ganda dalam bahasa Indonesia untuk mahasiswa. Jangan gunakan pengetahuan dari luar PDF. Setiap item harus memiliki topic, text, options (tepat 4 string), dan answer (angka indeks 0-3). Kembalikan hanya JSON array tanpa markdown." },
        { inlineData: { mimeType, data: pdfBase64 } },
      ],
    }]);
    res.json({ text });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/analyze", async (req, res) => {
  if (!requireApiKey(res)) return;
  const { result } = req.body;
  if (!result || !Number.isInteger(result.correct) || !Number.isInteger(result.total) || !result.topics) {
    res.status(400).json({ error: "Hasil quiz tidak valid." });
    return;
  }
  const weakTopics = Object.entries(result.topics)
    .filter(([, data]) => data.correct < data.total)
    .map(([name, data]) => `${name}: ${data.correct}/${data.total}`)
    .join(", ") || "Tidak ada topik yang salah";
  try {
    const text = await callGemini([{
      parts: [{ text: `Kamu adalah tutor pemrograman yang ramah. Analisis hasil quiz siswa berikut dalam bahasa Indonesia. Skor: ${result.correct}/${result.total}. Topik yang perlu diperkuat: ${weakTopics}. Buat ringkasan singkat dengan format: 1) Kesimpulan kemampuan (2 kalimat), 2) Materi yang perlu dipelajari (bullet list), 3) Langkah belajar praktis (2 langkah). Jangan mengarang data di luar hasil ini.` }],
    }]);
    res.json({ text });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Digilearn berjalan di http://localhost:${port}`);
});
