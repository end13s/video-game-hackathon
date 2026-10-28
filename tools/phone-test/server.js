// Phone capability test. Open / on each phone (through the tunnel) and
// /results on the laptop.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const tts = require('./tts');

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.ELEVENLABS_API_KEY || '';
const VOICE_ID = process.env.ELEVENLABS_TEST_VOICE_ID || '';
const VOICE_ENABLED = Boolean(API_KEY && VOICE_ID);

// Model ids from https://elevenlabs.io/docs/overview/models
const MODELS = ['eleven_v4_turbo', 'eleven_v4', 'eleven_flash_v2_5'];
const MAX_TEXT = 300;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/results', (req, res) => res.sendFile(path.join(__dirname, 'public', 'results.html')));
app.get('/voice/:id', tts.serveSpeech);
app.get('/results.json', (req, res) => res.json(Object.fromEntries(devices)));

// deviceId -> { label, ua, connected, lastSeen, results: { testName: { ok, value, at } } }
const devices = new Map();

function sendState() {
  io.to('results').emit('results:state', { devices: Object.fromEntries(devices) });
}

io.on('connection', (socket) => {
  socket.emit('config', { voiceEnabled: VOICE_ENABLED, models: MODELS, maxText: MAX_TEXT });

  socket.on('results:join', () => {
    socket.join('results');
    socket.emit('results:state', { devices: Object.fromEntries(devices) });
  });

  socket.on('device:hello', ({ deviceId, label, ua } = {}) => {
    if (typeof deviceId !== 'string' || !deviceId) return;
    socket.data.deviceId = deviceId;
    const d = devices.get(deviceId) || { results: {} };
    Object.assign(d, { label: String(label || '').slice(0, 60), ua: String(ua || '').slice(0, 300), connected: true, lastSeen: Date.now() });
    devices.set(deviceId, d);
    sendState();
  });

  socket.on('result', ({ name, ok, value } = {}) => {
    const d = devices.get(socket.data.deviceId);
    if (!d || typeof name !== 'string') return;
    d.results[name.slice(0, 30)] = { ok: ok === null ? null : Boolean(ok), value: String(value).slice(0, 300), at: Date.now() };
    d.lastSeen = Date.now();
    sendState();
  });

  socket.on('latency:ping', (ack) => {
    if (typeof ack === 'function') ack();
  });

  socket.on('voice:speak', ({ text, modelId } = {}, ack) => {
    if (typeof ack !== 'function') return;
    if (!VOICE_ENABLED) return ack({ error: 'Voice test is off: set ELEVENLABS_API_KEY and ELEVENLABS_TEST_VOICE_ID in .env' });
    text = String(text || '').trim().slice(0, MAX_TEXT);
    if (!text) return ack({ error: 'Empty text' });
    if (!MODELS.includes(modelId)) modelId = MODELS[0];
    if (!io.sockets.adapter.rooms.get('results')) {
      return ack({ error: 'Open /results on the laptop first' });
    }

    const job = tts.startSpeech({ apiKey: API_KEY, voiceId: VOICE_ID, modelId, text });
    job.phoneSocket = socket.id;
    job.modelId = modelId;
    io.to('results').emit('voice:play', { id: job.id, url: `/voice/${job.id}`, text, modelId, from: devices.get(socket.data.deviceId)?.label || '?' });
    ack({ id: job.id });

    job.finished.then(() => {
      if (job.error) io.to(job.phoneSocket).to('results').emit('voice:error', { id: job.id, error: job.error });
    });
  });

  // Sent by the results page when its <audio> element fires "playing".
  socket.on('voice:playing', ({ id } = {}) => {
    const job = tts.getJob(id);
    if (!job || job.playingMs) return;
    job.playingMs = Date.now() - job.startedAt;
    io.to(job.phoneSocket).to('results').emit('voice:timing', {
      id,
      modelId: job.modelId,
      firstByteMs: job.firstByteMs,
      playingMs: job.playingMs,
    });
  });

  socket.on('voice:failed', ({ id, error } = {}) => {
    const job = tts.getJob(id);
    // A generation error has already been reported and explains the failure better.
    if (!job || job.error) return;
    io.to(job.phoneSocket).emit('voice:error', { id, error: `Laptop could not play: ${String(error).slice(0, 200)}` });
  });

  socket.on('disconnect', () => {
    const d = devices.get(socket.data.deviceId);
    if (d) {
      d.connected = false;
      sendState();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Phone test running on http://localhost:${PORT}`);
  console.log(`  phones:  /         (open through the tunnel URL)`);
  console.log(`  laptop:  http://localhost:${PORT}/results`);
  console.log(`  voice test: ${VOICE_ENABLED ? 'on' : 'off (set ELEVENLABS_API_KEY and ELEVENLABS_TEST_VOICE_ID in .env)'}`);
});
