/**
 * M-02 語音辨識填表
 * 架構說明：
 *   - 支援 Google STT / Azure STT，透過環境變數切換
 *   - 未設定 API Key 時回傳 provider:'mock'，前端顯示提示
 *   - 設定方式：.env 加入 STT_PROVIDER=google 並填入 GOOGLE_STT_API_KEY
 */
const express = require('express');
const multer = require('multer');

const router = express.Router();

// 音訊暫存於記憶體（不寫入磁碟）
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// POST /api/voice/recognize
router.post('/recognize', audioUpload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未提供音訊資料' });

  const language = req.body.language || 'zh-TW';
  const provider = process.env.STT_PROVIDER;

  try {
    // ── Google Speech-to-Text ───────────────────────────────────────
    if (provider === 'google' && process.env.GOOGLE_STT_API_KEY) {
      const transcript = await recognizeWithGoogle(req.file.buffer, req.file.mimetype, language);
      return res.json({ transcript, confidence: 0.92, provider: 'google' });
    }

    // ── Azure Cognitive Services ────────────────────────────────────
    if (provider === 'azure' && process.env.AZURE_STT_KEY) {
      const transcript = await recognizeWithAzure(req.file.buffer, language);
      return res.json({ transcript, confidence: 0.91, provider: 'azure' });
    }

    // ── Mock（未設定 API Key 時）──────────────────────────────────────
    return res.json({
      transcript: '',
      confidence: 0,
      provider: 'mock',
      setup_required: true,
      message: '語音辨識尚未設定，請在後端 .env 加入 STT_PROVIDER 及對應 API Key',
      docs: {
        google: 'STT_PROVIDER=google\nGOOGLE_STT_API_KEY=your_key',
        azure: 'STT_PROVIDER=azure\nAZURE_STT_KEY=your_key\nAZURE_STT_REGION=eastasia',
      },
    });
  } catch (err) {
    console.error('[STT]', err.message);
    res.status(500).json({ error: '語音辨識失敗', message: err.message });
  }
});

// GET /api/voice/status - 回傳目前 STT 設定狀態
router.get('/status', (req, res) => {
  const provider = process.env.STT_PROVIDER;
  const configured =
    (provider === 'google' && !!process.env.GOOGLE_STT_API_KEY) ||
    (provider === 'azure' && !!process.env.AZURE_STT_KEY);

  res.json({
    provider: provider || 'none',
    configured,
    supported_languages: ['zh-TW', 'zh-CN', 'en-US'],
    max_audio_size_mb: 50,
    max_duration_seconds: 300,
  });
});

// ──────────────────────────────────────────────────────────────────
// STT Provider 實作（設定 API Key 後自動啟用）
// ──────────────────────────────────────────────────────────────────

async function recognizeWithGoogle(audioBuffer, mimeType, language) {
  // 動態 require，避免未安裝時報錯
  let SpeechClient;
  try { SpeechClient = require('@google-cloud/speech').SpeechClient; }
  catch { throw new Error('請先執行：npm install @google-cloud/speech'); }

  const client = new SpeechClient({ apiKey: process.env.GOOGLE_STT_API_KEY });
  const encoding = mimeType.includes('webm') ? 'WEBM_OPUS'
    : mimeType.includes('ogg') ? 'OGG_OPUS'
    : mimeType.includes('wav') ? 'LINEAR16'
    : 'ENCODING_UNSPECIFIED';

  const [response] = await client.recognize({
    audio: { content: audioBuffer.toString('base64') },
    config: { encoding, languageCode: language, enableAutomaticPunctuation: true },
  });

  return response.results.map(r => r.alternatives[0]?.transcript || '').join(' ').trim();
}

async function recognizeWithAzure(audioBuffer, language) {
  const key = process.env.AZURE_STT_KEY;
  const region = process.env.AZURE_STT_REGION || 'eastasia';
  const axios = require('axios');

  // Azure REST API
  const langCode = language.replace('-', '_').toLowerCase();
  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${language}`;

  const response = await axios.post(url, audioBuffer, {
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'audio/wav',
      'Transfer-Encoding': 'chunked',
    },
  });

  return response.data?.DisplayText || '';
}

module.exports = router;
