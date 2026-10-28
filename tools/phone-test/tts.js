// ElevenLabs text-to-speech, streamed through our own server.
// startSpeech() kicks off generation right away; serveSpeech() streams whatever
// has arrived so far and keeps writing as new chunks come in, so the browser
// can start playing before generation finishes.
// API reference: https://elevenlabs.io/docs/api-reference/text-to-speech/stream

const crypto = require('crypto');

const API_BASE = 'https://api.elevenlabs.io/v1';
const OUTPUT_FORMAT = 'mp3_44100_128';
const KEEP_MS = 5 * 60 * 1000;

const jobs = new Map();

function startSpeech({ apiKey, voiceId, modelId, text }) {
  const id = crypto.randomUUID();
  const job = {
    id,
    chunks: [],
    done: false,
    error: null,
    listeners: new Set(),
    startedAt: Date.now(),
    firstByteMs: null,
    totalMs: null,
  };
  jobs.set(id, job);
  setTimeout(() => jobs.delete(id), KEEP_MS).unref();

  const url = `${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=${OUTPUT_FORMAT}`;
  job.finished = (async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: modelId }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 300)}`);
      }
      for await (const chunk of res.body) {
        const buf = Buffer.from(chunk);
        if (job.firstByteMs === null) job.firstByteMs = Date.now() - job.startedAt;
        job.chunks.push(buf);
        for (const l of job.listeners) l.chunk(buf);
      }
    } catch (err) {
      job.error = err.message;
    }
    job.done = true;
    job.totalMs = Date.now() - job.startedAt;
    for (const l of job.listeners) l.end();
    job.listeners.clear();
  })();

  return job;
}

function getJob(id) {
  return jobs.get(id);
}

// Express handler body for GET /<prefix>/:id
function serveSpeech(req, res) {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).send('Not found');

  let headersSent = false;
  const sendHeaders = () => {
    if (headersSent) return;
    headersSent = true;
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
  };
  const listener = {
    chunk(buf) {
      sendHeaders();
      res.write(buf);
    },
    end() {
      if (!headersSent && job.error) return res.status(502).send(job.error);
      sendHeaders();
      res.end();
    },
  };

  for (const buf of job.chunks) listener.chunk(buf);
  if (job.done) return listener.end();
  job.listeners.add(listener);
  req.on('close', () => job.listeners.delete(listener));
}

module.exports = { startSpeech, getJob, serveSpeech };
