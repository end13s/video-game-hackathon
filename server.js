// Press Conference game server. Phones open /, the TV opens /tv.
// Message list: docs/press-conference.md
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const http = require('http');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const tts = require('./tts');
const content = require('./content');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const API_KEY = process.env.ELEVENLABS_API_KEY || '';
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_TEST_VOICE_ID || '';
// https://elevenlabs.io/docs/overview/models
const TTS_MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_v4_turbo';

const ROUNDS = Number(process.env.ROUNDS) || 3;
const ANSWER_MS = 45000;
const VOTE_MS = 20000;
const RESULTS_MS = 10000;
const MAX_QUESTION_MS = 20000;
const MAX_LINE_MS = 25000;
const LOBBY_DROP_MS = 30000; // forget players who leave the lobby and don't come back
const GRACE_MS = 15000; // a refresh or network blip doesn't count as leaving the round
const POINTS_PER_VOTE = 100;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const MAX_NAME = 16;
const MAX_ANSWER = 200;
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '10kb' }));
app.use('/lib/phaser', express.static(path.join(__dirname, 'node_modules', 'phaser', 'dist')));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'phone.html')));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html')));
app.get('/config', (req, res) => res.json({ publicUrl: PUBLIC_URL, voiceEnabled: Boolean(API_KEY) }));
app.get('/speech/:id', tts.serveSpeech);

app.get('/qr.svg', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 500);
  if (!text) return res.status(400).send('Missing text');
  res.type('image/svg+xml').send(await QRCode.toString(text, { type: 'svg', margin: 1 }));
});

// ---- text-to-speech ---------------------------------------------------------

function voiceIdFor(key) {
  if (key === 'anchor') return content.anchor.voiceId || DEFAULT_VOICE_ID;
  const who = [...content.politicians, ...content.journalists].find((c) => c.id === key);
  if (!who) return null;
  return who.voiceId || DEFAULT_VOICE_ID;
}

// Starts generating right away and returns the URL the TV streams it from, or null without a key.
function speak(text, voiceId) {
  if (!API_KEY || !voiceId) return null;
  const job = tts.startSpeech({ apiKey: API_KEY, voiceId, modelId: TTS_MODEL, text });
  return `/speech/${job.id}`;
}

// The tunnel URL is public, so cap what the open endpoint can spend.
let speakCount = 0;
setInterval(() => (speakCount = 0), 60 * 1000).unref();

app.post('/api/speak', (req, res) => {
  if (!API_KEY) return res.status(503).json({ error: 'ELEVENLABS_API_KEY is not set' });
  const text = String(req.body?.text || '').trim().slice(0, 300);
  const voiceId = voiceIdFor(String(req.body?.voice || 'anchor'));
  if (!text) return res.status(400).json({ error: 'Missing text' });
  if (!voiceId) return res.status(400).json({ error: 'Unknown voice' });
  if (++speakCount > 30) return res.status(429).json({ error: 'Too many speak requests, try again in a minute' });
  res.json({ url: speak(text, voiceId) });
});

// ---- game state ---------------------------------------------------------------

// playerId -> { id, name, color, connected, score, characterId, dropTimer }
const players = new Map();

const game = {
  phase: 'lobby',
  round: 0,
  endsAt: null, // only for phases with a visible countdown
  timer: null,
  onTimeout: null,
  question: null, // { text, journalist, audio }
  answers: new Map(), // playerId -> text, this round
  votes: new Map(), // voterId -> targetId, this round
  lines: [], // [{ playerId, text, audioUrl }] in hearing order
  hearingIndex: -1,
  results: null,
  questionsLeft: [],
};

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Rough time to read a line aloud, used when the TV doesn't tell us it finished.
const speakingMs = (text, max) => Math.min(max, 3000 + text.length * 80);

function characterOf(player) {
  const c = content.politicians.find((p) => p.id === player.characterId);
  return c ? { id: c.id, name: c.name, title: c.title } : null;
}

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    connected: p.connected,
    score: p.score,
    character: characterOf(p),
    answered: game.answers.has(p.id),
    voted: game.votes.has(p.id),
  };
}

function journalistInfo(j) {
  return { id: j.id, name: j.name, outlet: j.outlet };
}

function publicState() {
  const showAnswers = ['vote', 'results', 'final'].includes(game.phase);
  const hearingLine = game.phase === 'hearing' ? game.lines[game.hearingIndex] : null;
  return {
    phase: game.phase,
    remainingMs: game.endsAt ? Math.max(0, game.endsAt - Date.now()) : null,
    round: game.round,
    totalRounds: ROUNDS,
    players: [...players.values()].map(publicPlayer),
    question: game.question ? { text: game.question.text, journalist: journalistInfo(game.question.journalist) } : null,
    hearing: hearingLine ? { index: game.hearingIndex, total: game.lines.length, playerId: hearingLine.playerId } : null,
    answers: showAnswers ? game.lines.map(({ playerId, text }) => ({ playerId, text })) : [],
    results: game.results,
  };
}

function broadcast() {
  io.emit('game:state', publicState());
}

function youPayload(playerId) {
  const p = players.get(playerId);
  return {
    player: p ? publicPlayer(p) : null,
    answer: game.answers.get(playerId) || null,
    vote: game.votes.get(playerId) || null,
  };
}

function sendYou(playerId) {
  io.to(`player:${playerId}`).emit('you', youPayload(playerId));
}

// timerMs: when the phase ends by itself. visible: whether screens show a countdown for it.
function setPhase(phase, { timerMs = null, visible = false, onTimeout = null } = {}) {
  clearTimeout(game.timer);
  game.phase = phase;
  game.onTimeout = onTimeout;
  game.timer = timerMs ? setTimeout(() => onTimeout(), timerMs) : null;
  game.endsAt = timerMs && visible ? Date.now() + timerMs : null;
  console.log(`[round ${game.round}] ${phase}${timerMs ? ` (${Math.round(timerMs / 1000)}s)` : ''}`);
  broadcast();
}

const connectedPlayers = () => [...players.values()].filter((p) => p.connected);
// Players we still wait for: connected, or dropped only a moment ago.
const activePlayers = () => [...players.values()].filter((p) => p.connected || Date.now() - p.disconnectedAt < GRACE_MS);

// Ends answering or voting early once everyone still playing is done.
function checkAllIn() {
  if (game.phase === 'answer' && activePlayers().every((p) => game.answers.has(p.id))) closeAnswers();
  else if (game.phase === 'vote' && activePlayers().every((p) => game.votes.has(p.id))) finishVote();
}

// ---- phases -------------------------------------------------------------------

function startGame() {
  for (const p of players.values()) p.score = 0;
  game.round = 0;
  nextRound();
}

function nextRound() {
  game.round++;
  game.answers.clear();
  game.votes.clear();
  game.lines = [];
  game.hearingIndex = -1;
  game.results = null;

  if (!game.questionsLeft.length) game.questionsLeft = shuffle(content.questions);
  const q = game.questionsLeft.pop();
  const journalist = content.journalists.find((j) => j.id === q.journalist) || pick(content.journalists);
  game.question = { text: q.text, journalist };

  const audioUrl = q.audio ? `/audio/${q.audio}` : speak(q.text, journalist.voiceId || DEFAULT_VOICE_ID);
  const round = game.round;
  setPhase('question', { timerMs: speakingMs(q.text, MAX_QUESTION_MS), onTimeout: startAnswer });
  for (const id of players.keys()) sendYou(id);
  io.emit('question:ask', { round, text: q.text, journalist: journalistInfo(journalist), audioUrl });
}

function startAnswer() {
  setPhase('answer', { timerMs: ANSWER_MS, visible: true, onTimeout: closeAnswers });
}

function closeAnswers() {
  // Everyone still here gets a line, even if they didn't answer.
  const speakers = [...players.values()].filter((p) => activePlayers().includes(p) || game.answers.has(p.id));
  game.lines = shuffle(speakers).map((p) => {
    const text = game.answers.get(p.id) || pick(content.stockAnswers);
    const character = content.politicians.find((c) => c.id === p.characterId);
    // Start every line now, so the audio is ready by the time its turn comes.
    return { playerId: p.id, text, audioUrl: speak(text, (character && character.voiceId) || DEFAULT_VOICE_ID) };
  });
  playLine(0);
}

function playLine(index) {
  if (index >= game.lines.length) return startVote();
  game.hearingIndex = index;
  const line = game.lines[index];
  setPhase('hearing', { timerMs: speakingMs(line.text, MAX_LINE_MS), onTimeout: () => playLine(index + 1) });
  const p = players.get(line.playerId);
  io.emit('hearing:line', {
    index,
    total: game.lines.length,
    playerId: line.playerId,
    character: p ? characterOf(p) : null,
    text: line.text,
    audioUrl: line.audioUrl,
  });
}

function startVote() {
  if (game.lines.length < 2) return finishVote(); // nothing to choose between
  setPhase('vote', { timerMs: VOTE_MS, visible: true, onTimeout: finishVote });
}

function finishVote() {
  const votes = {};
  for (const target of game.votes.values()) votes[target] = (votes[target] || 0) + 1;
  const points = {};
  for (const [id, n] of Object.entries(votes)) {
    points[id] = n * POINTS_PER_VOTE;
    const p = players.get(id);
    if (p) p.score += points[id];
  }
  const top = Math.max(0, ...Object.values(votes));
  const winners = top > 0 ? Object.keys(votes).filter((id) => votes[id] === top) : [];
  game.results = { votes, points, winners };

  if (game.round >= ROUNDS) setPhase('final');
  else setPhase('results', { timerMs: RESULTS_MS, visible: true, onTimeout: nextRound });
}

function resetGame() {
  clearTimeout(game.timer);
  for (const p of players.values()) p.score = 0;
  Object.assign(game, { round: 0, question: null, lines: [], hearingIndex: -1, results: null, endsAt: null, timer: null });
  game.answers.clear();
  game.votes.clear();
  setPhase('lobby');
  for (const id of players.keys()) sendYou(id);
}

// ---- players ------------------------------------------------------------------

function pickColor() {
  const used = new Set([...players.values()].map((p) => p.color));
  return COLORS.find((c) => !used.has(c)) || COLORS[players.size % COLORS.length];
}

function pickCharacter() {
  const used = new Set([...players.values()].map((p) => p.characterId));
  const free = content.politicians.find((c) => !used.has(c.id));
  return (free || content.politicians[players.size % content.politicians.length]).id;
}

const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || 'Player';

// ---- sockets ------------------------------------------------------------------

io.on('connection', (socket) => {
  const playerId = () => socket.data.playerId;

  socket.on('player:join', ({ playerId: id, name } = {}, ack) => {
    if (typeof ack !== 'function') return;
    if (typeof id !== 'string' || !/^[\w-]{6,64}$/.test(id)) return ack({ error: 'Bad player id' });

    let player = players.get(id);
    if (!player) {
      if (players.size >= MAX_PLAYERS) return ack({ error: 'The room is full' });
      player = { id, name: cleanName(name), color: pickColor(), connected: true, score: 0, characterId: pickCharacter() };
      players.set(id, player);
    } else if (name) {
      player.name = cleanName(name);
    }
    player.connected = true;
    clearTimeout(player.dropTimer);
    socket.data.playerId = id;
    socket.join(`player:${id}`);
    ack({ you: youPayload(id) });
    broadcast();
  });

  socket.on('answer:submit', ({ text } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const id = playerId();
    if (!players.has(id)) return reply({ error: 'Join first' });
    if (game.phase !== 'answer') return reply({ error: 'Answers are closed' });
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER);
    if (!text) return reply({ error: 'Empty answer' });
    game.answers.set(id, text);
    reply({ ok: true });
    sendYou(id);
    broadcast();
    checkAllIn();
  });

  socket.on('vote:cast', ({ targetId } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const id = playerId();
    if (!players.has(id)) return reply({ error: 'Join first' });
    if (game.phase !== 'vote') return reply({ error: 'Voting is closed' });
    if (targetId === id) return reply({ error: "You can't vote for yourself" });
    if (!game.lines.some((l) => l.playerId === targetId)) return reply({ error: 'Unknown answer' });
    game.votes.set(id, targetId);
    reply({ ok: true });
    sendYou(id);
    broadcast();
    checkAllIn();
  });

  socket.on('tv:join', (ack) => {
    socket.join('tv');
    if (typeof ack === 'function') ack({ state: publicState() });
  });

  socket.on('game:start', (ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (game.phase !== 'lobby') return reply({ error: 'Game already running' });
    if (connectedPlayers().length < MIN_PLAYERS) return reply({ error: `Need at least ${MIN_PLAYERS} players` });
    reply({ ok: true });
    startGame();
  });

  socket.on('question:done', ({ round } = {}) => {
    if (game.phase === 'question' && round === game.round) startAnswer();
  });

  socket.on('hearing:done', ({ index } = {}) => {
    if (game.phase === 'hearing' && index === game.hearingIndex) playLine(index + 1);
  });

  // Dev: skip the rest of the current phase. In the lobby, start with any number of players.
  socket.on('phase:next', () => {
    if (game.phase === 'lobby') return startGame();
    if (game.onTimeout && game.timer) {
      clearTimeout(game.timer);
      game.onTimeout();
    }
  });

  socket.on('game:reset', resetGame);

  socket.on('disconnect', () => {
    const player = players.get(playerId());
    if (!player) return;
    // Another tab may still be connected as the same player.
    if (io.sockets.adapter.rooms.get(`player:${player.id}`)?.size) return;
    player.connected = false;
    player.disconnectedAt = Date.now();
    // If they don't come back, stop waiting for their answer or vote.
    setTimeout(checkAllIn, GRACE_MS + 100);
    if (game.phase === 'lobby') {
      player.dropTimer = setTimeout(() => {
        if (!player.connected && game.phase === 'lobby') {
          players.delete(player.id);
          broadcast();
        }
      }, LOBBY_DROP_MS);
    }
    broadcast();
  });
});

// Countdowns drift on slow phones, so resend the remaining time now and then.
setInterval(() => {
  if (game.endsAt) broadcast();
}, 5000).unref();

server.listen(PORT, () => {
  console.log(`Press Conference running on http://localhost:${PORT}`);
  console.log(`  TV:     http://localhost:${PORT}/tv`);
  console.log(`  phones: scan the QR code on the TV page`);
  console.log(`  voice:  ${API_KEY ? `on (${TTS_MODEL})` : 'off (set ELEVENLABS_API_KEY in .env)'}`);
  console.log(`  rounds: ${ROUNDS}`);
});
