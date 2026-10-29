// Press Conference game server. The TV opens /tv and gets a room code;
// phones open /?room=CODE (the TV shows it as a QR code).
// Each round one player is the politician at the podium and the others are journalists.
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

// Without ROUNDS, everyone takes the podium once.
const ROUNDS = Number(process.env.ROUNDS) || 0;
const ASK_MS = 40000;
const ANSWER_MS = 40000;
const VOTE_MS = 25000;
const RESULTS_MS = 10000;
const MAX_QUESTION_MS = 20000;
const MAX_LINE_MS = 25000;
const LOBBY_DROP_MS = 30000; // forget players who leave the lobby and don't come back
const GRACE_MS = 15000; // a refresh or network blip doesn't count as leaving the round
const EMPTY_ROOM_MS = 10 * 60 * 1000; // delete rooms nobody has been in for this long
const MAX_ROOMS = 30;
const POINTS_PER_VOTE = 100; // journalists: per vote for toughest question
const POINTS_PER_STAR = 100; // politician: average dodge rating times this
const MIN_HAND = 3;
const MAX_HAND = 4;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const MAX_NAME = 16;
const MAX_QUESTION = 160;
const MAX_ANSWER = 200;
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];
const BOT_NAMES = content.botNames || ['Ada', 'Bruno', 'Chen', 'Dara', 'Emil', 'Fay'];
// Number of choices per avatar part; must match LOOK_OPTIONS in public/avatar.js.
const LOOK_SIZES = { skin: 6, hair: 7, hairColor: 6, suit: 6, extra: 6, mouth: 4 };

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

// Models that act out [tags] instead of reading them aloud.
const TAG_MODELS = ['eleven_v4', 'eleven_v4_turbo', 'eleven_v3', 'eleven_v3_conversational'];
const ANSWER_TAGS = content.answerTags || [];

const stripTags = (text) => text.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

// Gives an answer a random delivery: a tag up front, sometimes another before a later sentence.
// Answers that already have tags (typed by the player) are left as they are.
function addDelivery(text) {
  if (!TAG_MODELS.includes(TTS_MODEL)) return stripTags(text) || text;
  if (/\[[^\]]+\]/.test(text) || !ANSWER_TAGS.length) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const first = pick(ANSWER_TAGS);
  sentences[0] = `${first} ${sentences[0]}`;
  if (sentences.length > 1 && Math.random() < (content.secondTagChance ?? 0.5)) {
    const i = 1 + Math.floor(Math.random() * (sentences.length - 1));
    const second = pick(ANSWER_TAGS.filter((t) => t !== first));
    sentences[i] = `${second} ${sentences[i]}`;
  }
  return sentences.join(' ');
}

// Rough time to read a line aloud, used when the TV doesn't tell us it finished.
const speakingMs = (text, max) => Math.min(max, 3000 + text.length * 80);

const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || 'Player';
const cleanText = (text, max) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);

// "Family values!" matches "family values", so punctuation and case don't matter.
const words = (s) => ` ${String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
const mentions = (text, point) => words(text).includes(words(point));

function characterInfo(characterId) {
  const c = content.politicians.find((p) => p.id === characterId);
  return c ? { id: c.id, name: c.name, title: c.title } : null;
}

const randomLook = () => Object.fromEntries(Object.entries(LOOK_SIZES).map(([k, n]) => [k, Math.floor(Math.random() * n)]));

// Keeps only known parts with in-range choices; anything else keeps the old value.
function cleanLook(look, old) {
  const out = { ...old };
  for (const [k, n] of Object.entries(LOOK_SIZES)) {
    const v = Number(look?.[k]);
    if (Number.isInteger(v) && v >= 0 && v < n) out[k] = v;
  }
  return out;
}

const pressOf = (p) => content.journalists.find((j) => j.id === p.pressId) || content.journalists[0];

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
    // playerId -> { id, name, color, connected, disconnectedAt, score, characterId, pressId, bot, dropTimer }
    this.players = new Map();
    this.phase = 'lobby';
    this.round = 0;
    this.totalRounds = 0;
    this.order = []; // playerIds, whose turn it is at the podium
    this.politicianId = null;
    this.hand = []; // [{ text, used }] the politician's talking points this round
    this.asks = new Map(); // journalistId -> question text, while asking
    this.grill = []; // [{ journalistId, question, questionAudio, answer, talkingPoint }] in asking order
    this.grillIndex = -1;
    this.questionVotes = new Map(); // voterId -> journalistId
    this.ratings = new Map(); // journalistId -> 1..5
    this.results = null;
    this.endsAt = null; // only for phases with a visible countdown
    this.timer = null;
    this.onTimeout = null;
    this.backupLeft = [];
    this.pointsLeft = [];
    this.lastSeen = Date.now();
  }

  emit(event, data) {
    io.to(this.code).emit(event, data);
  }

  // ---- state ----

  // Every vote a player still owes this round.
  ballots(id) {
    return {
      question: this.grill.some((g) => g.journalistId !== id),
      dodge: id !== this.politicianId,
    };
  }

  hasVoted(id) {
    const need = this.ballots(id);
    return (!need.question || this.questionVotes.has(id)) && (!need.dodge || this.ratings.has(id));
  }

  publicPlayer(p) {
    const press = pressOf(p);
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      connected: p.connected,
      bot: p.bot,
      score: p.score,
      character: characterInfo(p.characterId),
      look: p.look,
      outlet: press.outlet,
      asked: this.asks.has(p.id),
      voted: this.phase === 'vote' && this.hasVoted(p.id),
    };
  }

  publicState() {
    const g = this.grill[this.grillIndex];
    const grilling = ['question', 'answer', 'hearing'].includes(this.phase) && g;
    const showTranscript = ['vote', 'results', 'final'].includes(this.phase);
    return {
      roomCode: this.code,
      phase: this.phase,
      remainingMs: this.endsAt ? Math.max(0, this.endsAt - Date.now()) : null,
      round: this.round,
      totalRounds: this.totalRounds,
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      politicianId: this.politicianId,
      talkingPoints: this.hand,
      grill: grilling
        ? {
            index: this.grillIndex,
            total: this.grill.length,
            journalistId: g.journalistId,
            question: g.question,
            answer: this.phase === 'hearing' ? g.answer : null,
            talkingPoint: this.phase === 'hearing' ? g.talkingPoint : null,
          }
        : null,
      transcript: showTranscript ? this.grill.map(({ journalistId, question, answer, talkingPoint }) => ({ journalistId, question, answer, talkingPoint })) : [],
      results: this.results,
    };
  }

  broadcast() {
    this.emit('game:state', this.publicState());
  }

  youPayload(playerId) {
    const p = this.players.get(playerId);
    let role = null;
    if (this.round) role = playerId === this.politicianId ? 'politician' : 'journalist';
    return {
      player: p ? this.publicPlayer(p) : null,
      role,
      question: this.asks.get(playerId) || null,
      votes: { question: this.questionVotes.get(playerId) || null, dodge: this.ratings.get(playerId) || null },
    };
  }

  sendYou(playerId) {
    io.to(`${this.code}:${playerId}`).emit('you', this.youPayload(playerId));
  }

  sendYouAll() {
    for (const id of this.players.keys()) this.sendYou(id);
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

  activeJournalists() {
    return this.activePlayers().filter((p) => p.id !== this.politicianId);
  }

  // Ends asking or voting early once everyone still playing is done.
  checkAllIn() {
    if (this.phase === 'ask' && this.activeJournalists().every((p) => this.asks.has(p.id))) this.closeAsks();
    else if (this.phase === 'vote' && this.activePlayers().every((p) => this.hasVoted(p.id))) this.finishVote();
  }

  // ---- phases ----

  startGame() {
    for (const p of this.players.values()) p.score = 0;
    this.order = this.connectedPlayers().map((p) => p.id);
    this.totalRounds = ROUNDS || this.order.length;
    this.round = 0;
    this.nextRound();
  }

  // The next player in turn who is still here takes the podium.
  pickPolitician() {
    for (let i = 0; i < this.order.length; i++) {
      const id = this.order[(this.round - 1 + i) % this.order.length];
      const p = this.players.get(id);
      if (p && p.connected) return id;
    }
    return this.order[(this.round - 1) % this.order.length] || [...this.players.keys()][0];
  }

  dealHand() {
    const size = Math.max(MIN_HAND, Math.min(MAX_HAND, this.activeJournalists().length));
    const hand = [];
    while (hand.length < size) {
      if (!this.pointsLeft.length) this.pointsLeft = shuffle(content.talkingPoints);
      const text = this.pointsLeft.pop();
      if (!hand.some((c) => c.text === text)) hand.push({ text, used: false });
    }
    return hand;
  }

  backupQuestion() {
    if (!this.backupLeft.length) this.backupLeft = shuffle(content.questions);
    return this.backupLeft.pop().text;
  }

  nextRound() {
    this.round++;
    this.politicianId = this.pickPolitician();
    this.hand = this.dealHand();
    this.asks.clear();
    this.grill = [];
    this.grillIndex = -1;
    this.questionVotes.clear();
    this.ratings.clear();
    this.results = null;
    this.setPhase('ask', { timerMs: ASK_MS, visible: true, onTimeout: () => this.closeAsks() });
    this.sendYouAll();
  }

  submitQuestion(playerId, text) {
    if (this.phase !== 'ask') return { error: 'Questions are closed' };
    if (playerId === this.politicianId) return { error: "You're at the podium this round" };
    text = cleanText(text, MAX_QUESTION);
    if (!text) return { error: 'Empty question' };
    this.asks.set(playerId, text);
    this.sendYou(playerId);
    this.broadcast();
    this.checkAllIn();
    return { ok: true };
  }

  closeAsks() {
    // Every journalist still here gets a question in, even if they didn't write one.
    const active = this.activeJournalists();
    const journalists = [...this.players.values()].filter((p) => p.id !== this.politicianId && (active.includes(p) || this.asks.has(p.id)));
    this.grill = shuffle(journalists).map((p) => {
      const question = this.asks.get(p.id) || this.backupQuestion();
      // Start every question now, so the audio is ready by the time its turn comes.
      return { journalistId: p.id, question, questionAudio: speak(question, pressOf(p).voiceId || DEFAULT_VOICE_ID), answer: null, talkingPoint: null };
    });
    this.askQuestion(0);
  }

  askQuestion(index) {
    if (index >= this.grill.length) return this.startVote();
    this.grillIndex = index;
    const g = this.grill[index];
    const p = this.players.get(g.journalistId);
    this.setPhase('question', { timerMs: speakingMs(g.question, MAX_QUESTION_MS), onTimeout: () => this.startAnswer() });
    this.emit('question:ask', {
      round: this.round,
      index,
      total: this.grill.length,
      text: g.question,
      journalist: { playerId: g.journalistId, name: p?.name || '', outlet: p ? pressOf(p).outlet : '' },
      audioUrl: g.questionAudio,
    });
  }

  startAnswer() {
    this.setPhase('answer', { timerMs: ANSWER_MS, visible: true, onTimeout: () => this.closeAnswer() });
  }

  // Unused talking points, or all of them once they've all been used.
  playableCards() {
    const fresh = this.hand.filter((c) => !c.used);
    return fresh.length ? fresh : this.hand;
  }

  submitAnswer(playerId, text) {
    if (this.phase !== 'answer') return { error: 'Not answering right now' };
    if (playerId !== this.politicianId) return { error: "You're not at the podium" };
    text = cleanText(text, MAX_ANSWER);
    if (!text) return { error: 'Empty answer' };
    const card = this.playableCards().find((c) => mentions(text, c.text));
    if (!card) return { error: 'Work in one of your talking points (tap a card)' };
    this.closeAnswer(text, card);
    return { ok: true };
  }

  // Without an answer (time ran out), the politician falls back on a talking point.
  closeAnswer(text = null, card = null) {
    const g = this.grill[this.grillIndex];
    if (!card) card = pick(this.playableCards());
    if (!text) text = `${card.text}. ${pick(content.stockAnswers)}`;
    card.used = true;
    g.answer = text;
    g.talkingPoint = card.text;

    const p = this.players.get(this.politicianId);
    const character = p && content.politicians.find((c) => c.id === p.characterId);
    const speech = addDelivery(text);
    const audioUrl = speak(speech, (character && character.voiceId) || DEFAULT_VOICE_ID);
    // Screens get the text without tags; only the voice hears them.
    g.answer = stripTags(text) || text;
    const index = this.grillIndex;
    this.setPhase('hearing', { timerMs: speakingMs(g.answer, MAX_LINE_MS) + 2000, onTimeout: () => this.askQuestion(index + 1) });
    console.log(`[${this.code}]   says: ${speech}`);
    this.emit('hearing:line', {
      round: this.round,
      index,
      total: this.grill.length,
      playerId: this.politicianId,
      character: p ? characterInfo(p.characterId) : null,
      text: g.answer,
      talkingPoint: g.talkingPoint,
      audioUrl,
    });
  }

  startVote() {
    if (!this.grill.length) return this.finishVote(); // nobody asked anything
    this.setPhase('vote', { timerMs: VOTE_MS, visible: true, onTimeout: () => this.finishVote() });
    this.sendYouAll();
  }

  voteQuestion(voterId, targetId) {
    if (this.phase !== 'vote') return { error: 'Voting is closed' };
    if (targetId === voterId) return { error: "You can't vote for your own question" };
    if (!this.grill.some((g) => g.journalistId === targetId)) return { error: 'Unknown question' };
    this.questionVotes.set(voterId, targetId);
    this.sendYou(voterId);
    this.broadcast();
    this.checkAllIn();
    return { ok: true };
  }

  rateDodge(voterId, stars) {
    if (this.phase !== 'vote') return { error: 'Voting is closed' };
    if (voterId === this.politicianId) return { error: "You can't rate yourself" };
    stars = Math.round(Number(stars));
    if (!(stars >= 1 && stars <= 5)) return { error: 'Rate 1 to 5 stars' };
    this.ratings.set(voterId, stars);
    this.sendYou(voterId);
    this.broadcast();
    this.checkAllIn();
    return { ok: true };
  }

  finishVote() {
    const questionVotes = {};
    for (const target of this.questionVotes.values()) questionVotes[target] = (questionVotes[target] || 0) + 1;
    const points = {};
    for (const [id, n] of Object.entries(questionVotes)) points[id] = n * POINTS_PER_VOTE;

    const stars = [...this.ratings.values()];
    const average = stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : 0;
    if (stars.length) points[this.politicianId] = Math.round(average * POINTS_PER_STAR);

    for (const [id, n] of Object.entries(points)) {
      const p = this.players.get(id);
      if (p) p.score += n;
    }
    const top = Math.max(0, ...Object.values(questionVotes));
    const bestQuestion = top > 0 ? Object.keys(questionVotes).filter((id) => questionVotes[id] === top) : [];
    this.results = { questionVotes, bestQuestion, dodge: { average: Math.round(average * 10) / 10, count: stars.length }, points };

    if (this.round >= this.totalRounds) this.setPhase('final');
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
    Object.assign(this, { round: 0, totalRounds: 0, politicianId: null, hand: [], grill: [], grillIndex: -1, results: null, endsAt: null, timer: null });
    this.asks.clear();
    this.questionVotes.clear();
    this.ratings.clear();
    this.setPhase('lobby');
    this.sendYouAll();
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

  pickPress() {
    const used = new Set([...this.players.values()].map((p) => p.pressId));
    const free = content.journalists.find((j) => !used.has(j.id));
    return (free || content.journalists[this.players.size % content.journalists.length]).id;
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
      pressId: this.pickPress(),
      look: randomLook(),
      bot,
    };
    this.players.set(id, player);
    return player;
  }

  // Players build their politician's look in the lobby.
  setLook(playerId, look) {
    if (this.phase !== 'lobby') return { error: 'The game has started' };
    const p = this.players.get(playerId);
    p.look = cleanLook(look, p.look);
    this.sendYou(playerId);
    this.broadcast();
    return { ok: true };
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

  // Bots ask, dodge and vote a few seconds into each phase, like slow humans.
  runBots() {
    const round = this.round;
    const index = this.grillIndex;
    const still = (phase) => this.phase === phase && this.round === round;
    for (const bot of [...this.players.values()].filter((p) => p.bot)) {
      if (this.phase === 'ask' && bot.id !== this.politicianId) {
        setTimeout(() => still('ask') && this.submitQuestion(bot.id, this.backupQuestion()), randomMs(3000, 10000));
      }
      if (this.phase === 'answer' && bot.id === this.politicianId) {
        setTimeout(() => {
          if (!still('answer') || this.grillIndex !== index) return;
          const card = pick(this.playableCards());
          this.submitAnswer(bot.id, pick(content.botDodges).replace('{point}', card.text));
        }, randomMs(3000, 8000));
      }
      if (this.phase === 'vote') {
        setTimeout(() => {
          if (!still('vote')) return;
          const others = this.grill.filter((g) => g.journalistId !== bot.id);
          if (others.length) this.voteQuestion(bot.id, pick(others).journalistId);
          if (bot.id !== this.politicianId) this.rateDodge(bot.id, 2 + Math.floor(Math.random() * 4));
        }, randomMs(2000, 8000));
      }
    }
  }

  playerLeft(player) {
    player.connected = false;
    player.disconnectedAt = Date.now();
    // If they don't come back, stop waiting for their question or vote.
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

  // Phone messages: the sender must have joined the room.
  const playerAction = (event, handler) => {
    socket.on(event, (data = {}, ack) => {
      ack = reply(ack);
      const r = room();
      if (!r || !r.players.has(socket.data.playerId)) return ack({ error: 'Join first' });
      ack(handler(r, socket.data.playerId, data || {}));
    });
  };
  playerAction('player:look', (r, id, { look }) => r.setLook(id, look));
  playerAction('question:submit', (r, id, { text }) => r.submitQuestion(id, text));
  playerAction('answer:submit', (r, id, { text }) => r.submitAnswer(id, text));
  playerAction('vote:question', (r, id, { targetId }) => r.voteQuestion(id, targetId));
  playerAction('vote:dodge', (r, id, { stars }) => r.rateDodge(id, stars));

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

  socket.on('question:done', ({ round, index } = {}) => {
    const r = tvRoom();
    if (r && r.phase === 'question' && round === r.round && index === r.grillIndex) r.startAnswer();
  });

  socket.on('hearing:done', ({ round, index } = {}) => {
    const r = tvRoom();
    if (r && r.phase === 'hearing' && round === r.round && index === r.grillIndex) r.askQuestion(index + 1);
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
  console.log(`  rounds: ${ROUNDS || 'one per player'}`);
});
