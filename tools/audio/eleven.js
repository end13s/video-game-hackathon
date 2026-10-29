// Shared bits for the audio scripts: the API key from .env and a small ElevenLabs client.
// API reference: https://elevenlabs.io/docs/api-reference
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });

const API_BASE = 'https://api.elevenlabs.io/v1';
const API_KEY = process.env.ELEVENLABS_API_KEY || '';
const AUDIO_DIR = path.join(ROOT, 'public', 'audio');

function requireKey() {
  if (API_KEY) return;
  console.error('ELEVENLABS_API_KEY is empty. Paste the key into .env and run this again.');
  process.exit(1);
}

async function api(method, route, body) {
  const res = await fetch(`${API_BASE}${route}`, {
    method,
    headers: { 'xi-api-key': API_KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} on ${route}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

async function saveMp3(res, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

module.exports = { ROOT, API_KEY, AUDIO_DIR, requireKey, api, saveMp3 };
