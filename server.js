// Press Conference game server. The TV opens /tv and gets a room code;
// phones open /?room=CODE (the TV shows it as a QR code).
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
const EMPTY_ROOM_MS = 10 * 60 * 1000; // delete rooms nobody has been in for this long
const MAX_ROOMS = 30;
const POINTS_PER_VOTE = 100;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const MAX_NAME = 16;
const MAX_ANSWER = 200;
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];
const BOT_NAMES = content.botNames || ['Ada', 'Bruno', 'Chen', 'Dara', 'Emil', 'Fay'];
const BOT_ANSWERS = content.botAnswers || content.stockAnswers;

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

// The link is public, so cap what the open endpoint can spend.
let speakCount = 0;
setInterval(() => (speakCount = 0), 60 * 1000).unref();

app.post('/api/speak', (req, res) => {
  if (!API_KEY) return res.status(503).json({ error: 'ELEVENLABS_API_KEY is not set' });
  const text = String(req.body?.text || '').trim().slice(0, 300);
  const voiceId = voiceIdFor(String(req.body?.voice || 'anchor'));
  if (!text) return res.status(400).json({ error: 'Missing text' });
  if (!voiceId) return res.status(400).json({ error: 'Unknown voice' });
  if (++speakCount > 60) return res.status(429).json({ error: 'Too many speak requests, try again in a minute' });
  res.json({ url: speak(text, voiceId) });
});

// ---- helpers ------------------------------------------------------------------

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const randomMs = (min, max) => min + Math.random() * (max - min);

// Rough time to read a line aloud, used when the TV doesn't tell us it finished.
const speakingMs = (text, max) => Math.min(max, 3000 + text.length * 80);

const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || 'Player';

function characterInfo(characterId) {
  const c = content.politicians.find((p) => p.id === characterId);
  return c ? { id: c.id, name: c.name, title: c.title } : null;
}

const journalistInfo = (j) => ({ id: j.id, name: j.name, outlet: j.outlet });

// ---- rooms --------------------------------------------------------------------

const rooms = new Map(); // code -> Room

// No I or O, so codes can't be misread as 1 or 0.
function newRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

class Room {
  constructor(code) {
    this.code = code;
    // playerId -> { id, name, color, connected, disconnectedAt, score, characterId, bot, dropTimer }
    this.players = new Map();
    this.phase = 'lobby';
    this.round = 0;
    this.endsAt = null; // only for phases with a visible countdown
    this.timer = null;
    this.onTimeout = null;
    this.question = null; // { text, journalist }
    this.answers = new Map(); // playerId -> text, this round
    this.votes = new Map(); // voterId -> targetId, this round
    this.lines = []; // [{ playerId, text, audioUrl }] in hearing order
    this.hearingIndex = -1;
    this.results = null;
    this.questionsLeft = [];
    this.lastSeen = Date.now();
  }

  emit(event, data) {
    io.to(this.code).emit(event, data);
  }

  // ---- state ----

  publicPlayer(p) {
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      connected: p.connected,
      bot: p.bot,
      score: p.score,
      character: characterInfo(p.characterId),
      answered: this.answers.has(p.id),
      voted: this.votes.has(p.id),
    };
  }

  publicState() {
    const showAnswers = ['vote', 'results', 'final'].includes(this.phase);
    const hearingLine = this.phase === 'hearing' ? this.lines[this.hearingIndex] : null;
    return {
      roomCode: this.code,
      phase: this.phase,
      remainingMs: this.endsAt ? Math.max(0, this.endsAt - Date.now()) : null,
      round: this.round,
      totalRounds: ROUNDS,
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      question: this.question ? { text: this.question.text, journalist: journalistInfo(this.question.journalist) } : null,
      hearing: hearingLine ? { index: this.hearingIndex, total: this.lines.length, playerId: hearingLine.playerId } : null,
      answers: showAnswers ? this.lines.map(({ playerId, text }) => ({ playerId, text })) : [],
      results: this.results,
    };
  }

  broadcast() {
    this.emit('game:state', this.publicState());
  }

  youPayload(playerId) {
    const p = this.players.get(playerId);
    return {
      player: p ? this.publicPlayer(p) : null,
      answer: this.answers.get(playerId) || null,
      vote: this.votes.get(playerId) || null,
    };
  }

  sendYou(playerId) {
    io.to(`${this.code}:${playerId}`).emit('you', this.youPayload(playerId));
  }

  // timerMs: when the phase ends by itself. visible: whether screens show a countdown for it.
  setPhase(phase, { timerMs = null, visible = false, onTimeout = null } = {}) {
    clearTimeout(this.timer);
    this.phase = phase;
    this.onTimeout = onTimeout;
    this.timer = timerMs ? setTimeout(() => onTimeout(), timerMs) : null;
    this.endsAt = timerMs && visible ? Date.now() + timerMs : null;
    console.log(`[${this.code} round ${this.round}] ${phase}${timerMs ? ` (${Math.round(timerMs / 1000)}s)` : ''}`);
    this.broadcast();
    this.runBots();
  }

  connectedPlayers() {
    return [...this.players.values()].filter((p) => p.connected);
  }

  // Players we still wait for: connected, or dropped only a moment ago.
  activePlayers() {
    return [...this.players.values()].filter((p) => p.connected || Date.now() - p.disconnectedAt < GRACE_MS);
  }

  // Ends answering or voting early once everyone still playing is done.
  checkAllIn() {
    const active = this.activePlayers();
    if (this.phase === 'answer' && active.every((p) => this.answers.has(p.id))) this.closeAnswers();
    else if (this.phase === 'vote' && active.every((p) => this.votes.has(p.id))) this.finishVote();
  }

  // ---- phases ----

  startGame() {
    for (const p of this.players.values()) p.score = 0;
    this.round = 0;
    this.nextRound();
  }

  nextRound() {
    this.round++;
    this.answers.clear();
    this.votes.clear();
    this.lines = [];
    this.hearingIndex = -1;
    this.results = null;

    if (!this.questionsLeft.length) this.questionsLeft = shuffle(content.questions);
    const q = this.questionsLeft.pop();
    const journalist = content.journalists.find((j) => j.id === q.journalist) || pick(content.journalists);
    this.question = { text: q.text, journalist };

    const audioUrl = q.audio ? `/audio/${q.audio}` : speak(q.text, journalist.voiceId || DEFAULT_VOICE_ID);
    const round = this.round;
    this.setPhase('question', { timerMs: speakingMs(q.text, MAX_QUESTION_MS), onTimeout: () => this.startAnswer() });
    for (const id of this.players.keys()) this.sendYou(id);
    this.emit('question:ask', { round, text: q.text, journalist: journalistInfo(journalist), audioUrl });
  }

  startAnswer() {
    this.setPhase('answer', { timerMs: ANSWER_MS, visible: true, onTimeout: () => this.closeAnswers() });
  }

  submitAnswer(playerId, text) {
    if (this.phase !== 'answer') return { error: 'Answers are closed' };
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER);
    if (!text) return { error: 'Empty answer' };
    this.answers.set(playerId, text);
    this.sendYou(playerId);
    this.broadcast();
    this.checkAllIn();
    return { ok: true };
  }

  closeAnswers() {
    // Everyone still here gets a line, even if they didn't answer.
    const active = this.activePlayers();
    const speakers = [...this.players.values()].filter((p) => active.includes(p) || this.answers.has(p.id));
    this.lines = shuffle(speakers).map((p) => {
      const text = this.answers.get(p.id) || pick(content.stockAnswers);
      const character = content.politicians.find((c) => c.id === p.characterId);
      // Start every line now, so the audio is ready by the time its turn comes.
      return { playerId: p.id, text, audioUrl: speak(text, (character && character.voiceId) || DEFAULT_VOICE_ID) };
    });
    this.playLine(0);
  }

  playLine(index) {
    if (index >= this.lines.length) return this.startVote();
    this.hearingIndex = index;
    const line = this.lines[index];
    this.setPhase('hearing', { timerMs: speakingMs(line.text, MAX_LINE_MS), onTimeout: () => this.playLine(index + 1) });
    const p = this.players.get(line.playerId);
    this.emit('hearing:line', {
      index,
      total: this.lines.length,
      playerId: line.playerId,
      character: p ? characterInfo(p.characterId) : null,
      text: line.text,
      audioUrl: line.audioUrl,
    });
  }

  startVote() {
    if (this.lines.length < 2) return this.finishVote(); // nothing to choose between
    this.setPhase('vote', { timerMs: VOTE_MS, visible: true, onTimeout: () => this.finishVote() });
  }

  castVote(voterId, targetId) {
    if (this.phase !== 'vote') return { error: 'Voting is closed' };
    if (targetId === voterId) return { error: "You can't vote for yourself" };
    if (!this.lines.some((l) => l.playerId === targetId)) return { error: 'Unknown answer' };
    this.votes.set(voterId, targetId);
    this.sendYou(voterId);
    this.broadcast();
    this.checkAllIn();
    return { ok: true };
  }

  finishVote() {
    const votes = {};
    for (const target of this.votes.values()) votes[target] = (votes[target] || 0) + 1;
    const points = {};
    for (const [id, n] of Object.entries(votes)) {
      points[id] = n * POINTS_PER_VOTE;
      const p = this.players.get(id);
      if (p) p.score += points[id];
    }
    const top = Math.max(0, ...Object.values(votes));
    const winners = top > 0 ? Object.keys(votes).filter((id) => votes[id] === top) : [];
    this.results = { votes, points, winners };

    if (this.round >= ROUNDS) this.setPhase('final');
    else this.setPhase('results', { timerMs: RESULTS_MS, visible: true, onTimeout: () => this.nextRound() });
  }

  skipPhase() {
    if (this.phase === 'lobby') return this.startGame();
    if (this.onTimeout && this.timer) {
      clearTimeout(this.timer);
      this.onTimeout();
    }
  }

  reset() {
    clearTimeout(this.timer);
    for (const p of this.players.values()) p.score = 0;
    Object.assign(this, { round: 0, question: null, lines: [], hearingIndex: -1, results: null, endsAt: null, timer: null });
    this.answers.clear();
    this.votes.clear();
    this.setPhase('lobby');
    for (const id of this.players.keys()) this.sendYou(id);
  }

  // ---- players ----

  pickColor() {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return COLORS.find((c) => !used.has(c)) || COLORS[this.players.size % COLORS.length];
  }

  pickCharacter() {
    const used = new Set([...this.players.values()].map((p) => p.characterId));
    const free = content.politicians.find((c) => !used.has(c.id));
    return (free || content.politicians[this.players.size % content.politicians.length]).id;
  }

  addPlayer(id, name, bot = false) {
    const player = {
      id,
      name: cleanName(name),
      color: this.pickColor(),
      connected: true,
      disconnectedAt: 0,
      score: 0,
      characterId: this.pickCharacter(),
      bot,
    };
    this.players.set(id, player);
    return player;
  }

  addBot() {
    if (this.players.size >= MAX_PLAYERS) return { error: 'The room is full' };
    const used = new Set([...this.players.values()].map((p) => p.name));
    const name = BOT_NAMES.map((n) => `${n} (bot)`).find((n) => !used.has(n)) || 'Bot';
    this.botCount = (this.botCount || 0) + 1;
    const bot = this.addPlayer(`bot-${this.code}-${this.botCount}`, name, true);
    this.broadcast();
    return { ok: true, playerId: bot.id };
  }

  removeBot(playerId) {
    const p = this.players.get(playerId);
    if (!p || !p.bot) return { error: 'Not a bot' };
    if (this.phase !== 'lobby') return { error: 'Remove bots in the lobby' };
    this.players.delete(playerId);
    this.broadcast();
    return { ok: true };
  }

  // Bots answer and vote a few seconds into each phase, like slow humans.
  runBots() {
    const round = this.round;
    for (const bot of [...this.players.values()].filter((p) => p.bot)) {
      if (this.phase === 'answer') {
        setTimeout(() => {
          if (this.phase === 'answer' && this.round === round) this.submitAnswer(bot.id, pick(BOT_ANSWERS));
        }, randomMs(4000, 15000));
      }
      if (this.phase === 'vote') {
        setTimeout(() => {
          if (this.phase !== 'vote' || this.round !== round) return;
          const others = this.lines.filter((l) => l.playerId !== bot.id);
          if (others.length) this.castVote(bot.id, pick(others).playerId);
        }, randomMs(2000, 8000));
      }
    }
  }

  playerLeft(player) {
    player.connected = false;
    player.disconnectedAt = Date.now();
    // If they don't come back, stop waiting for their answer or vote.
    setTimeout(() => this.checkAllIn(), GRACE_MS + 100);
    if (this.phase === 'lobby') {
      player.dropTimer = setTimeout(() => {
        if (!player.connected && this.phase === 'lobby') {
          this.players.delete(player.id);
          this.broadcast();
        }
      }, LOBBY_DROP_MS);
    }
    this.broadcast();
  }

  destroy() {
    clearTimeout(this.timer);
    for (const p of this.players.values()) clearTimeout(p.dropTimer);
    rooms.delete(this.code);
    console.log(`[${this.code}] room closed`);
  }
}

// Rooms nobody is connected to anymore get cleaned up.
setInterval(() => {
  for (const room of rooms.values()) {
    if (io.sockets.adapter.rooms.get(room.code)?.size) room.lastSeen = Date.now();
    else if (Date.now() - room.lastSeen > EMPTY_ROOM_MS) room.destroy();
  }
}, 60 * 1000).unref();

// ---- sockets ------------------------------------------------------------------

io.on('connection', (socket) => {
  const room = () => rooms.get(socket.data.roomCode);
  const reply = (ack) => (typeof ack === 'function' ? ack : () => {});

  // The TV creates a room, or gets its old one back after a refresh.
  socket.on('tv:join', (data, ack) => {
    if (typeof data === 'function') [data, ack] = [{}, data];
    ack = reply(ack);
    let r = rooms.get(String(data?.roomCode || '').toUpperCase());
    if (!r) {
      if (rooms.size >= MAX_ROOMS) return ack({ error: 'Too many games running, try again in a few minutes' });
      r = new Room(newRoomCode());
      rooms.set(r.code, r);
      console.log(`[${r.code}] room opened`);
    }
    socket.data.roomCode = r.code;
    socket.data.tv = true;
    socket.join(r.code);
    ack({ roomCode: r.code, state: r.publicState() });
  });

  socket.on('player:join', ({ roomCode, playerId, name } = {}, ack) => {
    ack = reply(ack);
    const r = rooms.get(String(roomCode || '').toUpperCase());
    if (!r) return ack({ error: 'Room not found. Check the code on the TV' });
    if (typeof playerId !== 'string' || !/^[\w-]{6,64}$/.test(playerId)) return ack({ error: 'Bad player id' });

    let player = r.players.get(playerId);
    if (!player) {
      if (r.players.size >= MAX_PLAYERS) return ack({ error: 'The room is full' });
      player = r.addPlayer(playerId, name);
    } else if (name) {
      player.name = cleanName(name);
    }
    player.connected = true;
    clearTimeout(player.dropTimer);
    socket.data.roomCode = r.code;
    socket.data.playerId = playerId;
    socket.join(r.code);
    socket.join(`${r.code}:${playerId}`);
    ack({ roomCode: r.code, you: r.youPayload(playerId) });
    r.broadcast();
  });

  socket.on('answer:submit', ({ text } = {}, ack) => {
    ack = reply(ack);
    const r = room();
    if (!r || !r.players.has(socket.data.playerId)) return ack({ error: 'Join first' });
    ack(r.submitAnswer(socket.data.playerId, text));
  });

  socket.on('vote:cast', ({ targetId } = {}, ack) => {
    ack = reply(ack);
    const r = room();
    if (!r || !r.players.has(socket.data.playerId)) return ack({ error: 'Join first' });
    ack(r.castVote(socket.data.playerId, targetId));
  });

  // TV only from here on.
  const tvRoom = () => (socket.data.tv ? room() : null);

  socket.on('game:start', (ack) => {
    ack = reply(ack);
    const r = tvRoom();
    if (!r) return ack({ error: 'Not a TV' });
    if (r.phase !== 'lobby') return ack({ error: 'Game already running' });
    if (r.connectedPlayers().length < MIN_PLAYERS) return ack({ error: `Need at least ${MIN_PLAYERS} players (add a bot?)` });
    ack({ ok: true });
    r.startGame();
  });

  socket.on('bot:add', (ack) => {
    ack = reply(ack);
    const r = tvRoom();
    ack(r ? r.addBot() : { error: 'Not a TV' });
  });

  socket.on('bot:remove', ({ playerId } = {}, ack) => {
    ack = reply(ack);
    const r = tvRoom();
    ack(r ? r.removeBot(playerId) : { error: 'Not a TV' });
  });

  socket.on('question:done', ({ round } = {}) => {
    const r = tvRoom();
    if (r && r.phase === 'question' && round === r.round) r.startAnswer();
  });

  socket.on('hearing:done', ({ index } = {}) => {
    const r = tvRoom();
    if (r && r.phase === 'hearing' && index === r.hearingIndex) r.playLine(index + 1);
  });

  // Dev: skip the rest of the current phase. In the lobby, start with any number of players.
  socket.on('phase:next', () => tvRoom()?.skipPhase());
  socket.on('game:reset', () => tvRoom()?.reset());

  socket.on('disconnect', () => {
    const r = room();
    const player = r && r.players.get(socket.data.playerId);
    if (!player) return;
    // Another tab may still be connected as the same player.
    if (io.sockets.adapter.rooms.get(`${r.code}:${player.id}`)?.size) return;
    r.playerLeft(player);
  });
});

// Countdowns drift on slow phones, so resend the remaining time now and then.
setInterval(() => {
  for (const room of rooms.values()) if (room.endsAt) room.broadcast();
}, 5000).unref();

server.listen(PORT, () => {
  console.log(`Press Conference running on http://localhost:${PORT}`);
  console.log(`  TV:     http://localhost:${PORT}/tv   (each TV gets its own room)`);
  console.log(`  phones: scan the QR code on the TV page`);
  console.log(`  voice:  ${API_KEY ? `on (${TTS_MODEL})` : 'off (set ELEVENLABS_API_KEY in .env)'}`);
  console.log(`  rounds: ${ROUNDS}`);
});
