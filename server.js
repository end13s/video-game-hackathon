// Press Conference game server. The TV opens /tv and gets a room code;
// phones open /?room=CODE (the TV shows it as a QR code).
// Each round one player is the politician at the podium. The others are journalists:
// they write questions about the round's headline and vote for the best one. One of them
// secretly writes how the politician's answer starts (the teleprompter), the politician
// finishes it, and the press heckles and rates the result.
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
const PICK_MS = 20000;
const SABOTAGE_MS = 25000;
const ANSWER_MS = 45000;
const RATE_MS = 20000;
const RESULTS_MS = 10000;
const MAX_QUESTION_MS = 20000;
const MAX_LINE_MS = 25000;
const LOBBY_DROP_MS = 30000; // forget players who leave the lobby and don't come back
const GRACE_MS = 15000; // a refresh or network blip doesn't count as leaving the round
const EMPTY_ROOM_MS = 10 * 60 * 1000; // delete rooms nobody has been in for this long
const MAX_ROOMS = 30;
const BEST_QUESTION_POINTS = 200; // the journalist whose question was picked
const POINTS_PER_STAR = 100; // politician: average rating times this
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const MAX_NAME = 16;
const MAX_QUESTION = 160;
const MAX_ANSWER = 200;
const MAX_OPENER = 90;
const REACT_GAP_MS = 400; // per player, so nobody floods the room
const REACTIONS = ['laugh', 'applause', 'gasp', 'boo', 'tomato', 'liar'];
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

// "My goose and I" + "Love long walks." reads "My goose and I love long walks."
function joinSentence(start, end) {
  end = end.trim();
  // Lower the first letter (after any [audio tags]), except for "I".
  if (!/[.!?…:]$/.test(start.trim())) {
    end = end.replace(/^((?:\[[^\]]*\]\s*)*)(\S+)/, (m, tags, word) =>
      tags + (/^I('|$)/.test(word) ? word : word.charAt(0).toLowerCase() + word.slice(1)));
  }
  return `${start} ${end}`.replace(/\s+/g, ' ').trim();
}

const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || 'Player';
const cleanText = (text, max) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);

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
    this.headline = null; // { text, questions } this round's scandal
    this.asks = new Map(); // journalistId -> question text
    this.questionVotes = new Map(); // voterId -> journalistId whose question they picked
    this.chosen = null; // { journalistId, question, opener, answer } the question that gets asked
    this.saboteurId = null; // the journalist writing the teleprompter this round
    this.ratings = new Map(); // journalistId -> 1..5 stars for the answer
    this.results = null;
    this.endsAt = null; // only for phases with a visible countdown
    this.timer = null;
    this.onTimeout = null;
    this.backupLeft = [];
    this.headlinesLeft = [];
    this.headlineQuestions = [];
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
      look: p.look,
      outlet: pressOf(p).outlet,
      asked: this.asks.has(p.id),
      voted: this.phase === 'pick' && this.questionVotes.has(p.id),
      rated: this.ratings.has(p.id),
    };
  }

  publicState() {
    const showQuestions = this.phase === 'pick';
    const showChosen = ['question', 'sabotage', 'answer', 'hearing', 'rate', 'results', 'final'].includes(this.phase);
    const showOpener = ['answer', 'hearing', 'rate', 'results', 'final'].includes(this.phase);
    const showAnswer = ['hearing', 'rate', 'results', 'final'].includes(this.phase);
    return {
      roomCode: this.code,
      phase: this.phase,
      remainingMs: this.endsAt ? Math.max(0, this.endsAt - Date.now()) : null,
      round: this.round,
      totalRounds: this.totalRounds,
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      politicianId: this.politicianId,
      headline: this.headline ? this.headline.text : null,
      // While picking, questions don't say who wrote them.
      questions: showQuestions ? [...this.asks.entries()].map(([id, text]) => ({ id, text })) : [],
      chosen: showChosen && this.chosen
        ? {
            journalistId: this.chosen.journalistId,
            question: this.chosen.question,
            opener: showOpener ? this.chosen.opener : null,
            answer: showAnswer ? this.chosen.answer : null,
          }
        : null,
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
      saboteur: this.phase === 'sabotage' && playerId === this.saboteurId,
      votes: { question: this.questionVotes.get(playerId) || null, stars: this.ratings.get(playerId) || null },
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

  // Journalists who can vote in the pick: anyone with a question to choose that isn't their own.
  canPick(id) {
    return [...this.asks.keys()].some((qid) => qid !== id);
  }

  // Ends a phase early once everyone still playing is done.
  checkAllIn() {
    const journalists = this.activeJournalists();
    if (this.phase === 'ask' && journalists.every((p) => this.asks.has(p.id))) this.closeAsks();
    else if (this.phase === 'pick' && journalists.every((p) => this.questionVotes.has(p.id) || !this.canPick(p.id))) this.closePick();
    else if (this.phase === 'rate' && journalists.every((p) => this.ratings.has(p.id))) this.finishRound();
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

  // Questions written for this round's headline first, then general ones.
  backupQuestion() {
    if (!this.backupLeft.length) this.backupLeft = shuffle(content.questions.map((q) => q.text));
    return this.headlineQuestions.pop() || this.backupLeft.pop();
  }

  nextHeadline() {
    if (!this.headlinesLeft.length) this.headlinesLeft = shuffle(content.headlines);
    return this.headlinesLeft.pop();
  }

  nextRound() {
    this.round++;
    this.politicianId = this.pickPolitician();
    // "{name}" in a headline becomes the politician's character name.
    const h = this.nextHeadline();
    const character = characterInfo(this.players.get(this.politicianId)?.characterId);
    this.headline = { text: h.text.replace(/\{name\}/g, character?.name || 'Politician'), questions: h.questions || [] };
    this.headlineQuestions = shuffle(this.headline.questions);
    this.asks.clear();
    this.questionVotes.clear();
    this.ratings.clear();
    this.chosen = null;
    this.pickTally = null;
    this.saboteurId = null;
    this.results = null;
    this.setPhase('ask', { timerMs: ASK_MS, visible: true, onTimeout: () => this.closeAsks() });
    this.sendYouAll();
    const text = this.headline.text;
    this.emit('headline:read', { round: this.round, text, audioUrl: speak(`Breaking news. ${text}.`, voiceIdFor('anchor')) });
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
    // Journalists still here who didn't write one get a backup question, so there's always a choice.
    for (const p of this.activeJournalists()) if (!this.asks.has(p.id)) this.asks.set(p.id, this.backupQuestion());
    if (!this.asks.size) this.asks.set(null, this.backupQuestion()); // nobody left to ask
    // Nothing to vote on with a single question.
    if (this.asks.size < 2) return this.closePick();
    this.setPhase('pick', { timerMs: PICK_MS, visible: true, onTimeout: () => this.closePick() });
    this.sendYouAll();
  }

  voteQuestion(voterId, targetId) {
    if (this.phase !== 'pick') return { error: 'Voting is closed' };
    if (voterId === this.politicianId) return { error: 'The press picks the question' };
    if (targetId === voterId) return { error: "You can't vote for your own question" };
    if (!this.asks.has(targetId)) return { error: 'Unknown question' };
    this.questionVotes.set(voterId, targetId);
    this.sendYou(voterId);
    this.broadcast();
    this.checkAllIn();
    return { ok: true };
  }

  // The question with the most votes gets asked; ties are settled at random.
  closePick() {
    const tally = new Map([...this.asks.keys()].map((id) => [id, 0]));
    for (const target of this.questionVotes.values()) tally.set(target, tally.get(target) + 1);
    const top = Math.max(...tally.values());
    const journalistId = pick([...tally.keys()].filter((id) => tally.get(id) === top));
    this.pickTally = Object.fromEntries([...tally].filter(([id]) => id));
    this.chosen = { journalistId, question: this.asks.get(journalistId), opener: null, answer: null };
    this.askQuestion();
  }

  askQuestion() {
    const p = this.players.get(this.chosen.journalistId);
    const question = this.chosen.question;
    const round = this.round;
    // Backup questions may have a pre-made MP3 (npm run audio:questions).
    const premade = content.questions.find((q) => q.text === question && q.audio);
    this.setPhase('question', { timerMs: speakingMs(question, MAX_QUESTION_MS), onTimeout: () => this.startSabotage() });
    this.emit('question:ask', {
      round,
      text: question,
      journalist: { playerId: p?.id || null, name: p?.name || 'The press', outlet: p ? pressOf(p).outlet : '' },
      audioUrl: premade ? `/audio/${premade.audio}` : speak(question, (p && pressOf(p).voiceId) || DEFAULT_VOICE_ID),
    });
  }

  // A journalist secretly writes how the politician's answer starts. Preferably not the
  // one whose question was picked, so more people get a turn.
  startSabotage() {
    const journalists = this.activeJournalists();
    const others = journalists.filter((p) => p.id !== this.chosen.journalistId);
    this.saboteurId = (pick(others.length ? others : journalists) || {}).id || null;
    if (!this.saboteurId) return this.closeSabotage();
    this.setPhase('sabotage', { timerMs: SABOTAGE_MS, visible: true, onTimeout: () => this.closeSabotage() });
    this.sendYouAll();
  }

  submitOpener(playerId, text) {
    if (this.phase !== 'sabotage') return { error: 'Too late, the teleprompter is locked' };
    if (playerId !== this.saboteurId) return { error: "It's not your turn to sabotage" };
    text = stripTags(cleanText(text, MAX_OPENER));
    if (!text) return { error: 'Write something' };
    this.chosen.opener = text;
    this.closeSabotage();
    return { ok: true };
  }

  closeSabotage() {
    if (!this.chosen.opener) this.chosen.opener = pick(content.openers);
    this.startAnswer();
  }

  startAnswer() {
    this.setPhase('answer', { timerMs: ANSWER_MS, visible: true, onTimeout: () => this.closeAnswer() });
    this.sendYouAll();
  }

  // The politician finishes the sentence the teleprompter started.
  submitAnswer(playerId, text) {
    if (this.phase !== 'answer') return { error: 'Not answering right now' };
    if (playerId !== this.politicianId) return { error: "You're not at the podium" };
    text = cleanText(text, MAX_ANSWER);
    if (!text) return { error: 'Empty answer' };
    this.closeAnswer(text);
    return { ok: true };
  }

  // If time runs out, a stock dodge finishes it for them.
  closeAnswer(ending = `... ${pick(content.stockAnswers)}`) {
    const text = joinSentence(this.chosen.opener, ending);
    const p = this.players.get(this.politicianId);
    const character = p && content.politicians.find((c) => c.id === p.characterId);
    const speech = addDelivery(text);
    const audioUrl = speak(speech, (character && character.voiceId) || DEFAULT_VOICE_ID);
    // Screens get the text without tags; only the voice hears them.
    this.chosen.answer = stripTags(text) || text;
    const round = this.round;
    this.setPhase('hearing', { timerMs: speakingMs(this.chosen.answer, MAX_LINE_MS) + 2000, onTimeout: () => this.startRating() });
    console.log(`[${this.code}]   says: ${speech}`);
    this.emit('hearing:line', {
      round,
      playerId: this.politicianId,
      character: p ? characterInfo(p.characterId) : null,
      text: this.chosen.answer,
      opener: this.chosen.opener,
      audioUrl,
    });
  }

  startRating() {
    if (!this.activeJournalists().length) return this.finishRound(); // nobody to rate
    this.setPhase('rate', { timerMs: RATE_MS, visible: true, onTimeout: () => this.finishRound() });
    this.sendYouAll();
  }

  rateAnswer(voterId, stars) {
    if (this.phase !== 'rate') return { error: 'Rating is closed' };
    if (voterId === this.politicianId) return { error: "You can't rate yourself" };
    stars = Math.round(Number(stars));
    if (!(stars >= 1 && stars <= 5)) return { error: 'Rate 1 to 5 stars' };
    this.ratings.set(voterId, stars);
    this.sendYou(voterId);
    this.broadcast();
    this.checkAllIn();
    return { ok: true };
  }

  finishRound() {
    const points = {};
    const author = this.chosen?.journalistId;
    if (author && this.players.has(author)) points[author] = BEST_QUESTION_POINTS;

    const stars = [...this.ratings.values()];
    const average = stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : 0;
    if (stars.length) points[this.politicianId] = Math.round(average * POINTS_PER_STAR);

    for (const [id, n] of Object.entries(points)) {
      const p = this.players.get(id);
      if (p) p.score += n;
    }
    this.results = {
      bestQuestion: author || null,
      saboteurId: this.saboteurId,
      questionVotes: this.pickTally || {},
      rating: { average: Math.round(average * 10) / 10, count: stars.length },
      points,
    };

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
    Object.assign(this, { round: 0, totalRounds: 0, politicianId: null, headline: null, chosen: null, saboteurId: null, results: null, endsAt: null, timer: null });
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

  // Bots ask, vote, sabotage, answer, heckle and rate a few seconds into each phase, like slow humans.
  runBots() {
    const round = this.round;
    const still = (phase) => this.phase === phase && this.round === round;
    for (const bot of [...this.players.values()].filter((p) => p.bot)) {
      const atPodium = bot.id === this.politicianId;
      if (this.phase === 'ask' && !atPodium) {
        setTimeout(() => still('ask') && this.submitQuestion(bot.id, this.backupQuestion()), randomMs(3000, 10000));
      }
      if (this.phase === 'pick' && !atPodium) {
        setTimeout(() => {
          const others = [...this.asks.keys()].filter((id) => id !== bot.id);
          if (still('pick') && others.length) this.voteQuestion(bot.id, pick(others));
        }, randomMs(2000, 7000));
      }
      if (this.phase === 'sabotage' && bot.id === this.saboteurId) {
        setTimeout(() => still('sabotage') && this.submitOpener(bot.id, pick(content.openers)), randomMs(3000, 8000));
      }
      if ((this.phase === 'hearing' || this.phase === 'rate') && !atPodium) {
        const phase = this.phase;
        for (let i = 0; i < 3; i++) setTimeout(() => still(phase) && this.react(bot.id, pick(REACTIONS)), randomMs(800, 7000));
      }
      if (this.phase === 'answer' && atPodium) {
        setTimeout(() => still('answer') && this.submitAnswer(bot.id, pick(content.botAnswers)), randomMs(3000, 8000));
      }
      if (this.phase === 'rate' && !atPodium) {
        setTimeout(() => still('rate') && this.rateAnswer(bot.id, 2 + Math.floor(Math.random() * 4)), randomMs(2000, 6000));
      }
    }
  }

  // Journalists heckle while the answer plays and while it's rated. The TV shows it.
  react(playerId, type) {
    if (!['hearing', 'rate'].includes(this.phase)) return { error: 'Not now' };
    if (playerId === this.politicianId) return { error: "You can't heckle yourself" };
    if (!REACTIONS.includes(type)) return { error: 'Unknown reaction' };
    const p = this.players.get(playerId);
    if (Date.now() - (p.lastReact || 0) < REACT_GAP_MS) return { error: 'Slow down' };
    p.lastReact = Date.now();
    this.emit('crowd:react', { playerId, type });
    return { ok: true };
  }

  // Exit button on the phone. In the lobby the player is gone for good; mid-game they
  // count as disconnected, so the round carries on without them.
  leave(playerId) {
    const p = this.players.get(playerId);
    if (this.phase === 'lobby') {
      clearTimeout(p.dropTimer);
      this.players.delete(playerId);
      this.broadcast();
    } else {
      this.playerLeft(p);
    }
    return { ok: true };
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
  playerAction('vote:question', (r, id, { targetId }) => r.voteQuestion(id, targetId));
  playerAction('answer:submit', (r, id, { text }) => r.submitAnswer(id, text));
  playerAction('answer:rate', (r, id, { stars }) => r.rateAnswer(id, stars));
  playerAction('opener:submit', (r, id, { text }) => r.submitOpener(id, text));
  playerAction('crowd:react', (r, id, { type }) => r.react(id, type));
  playerAction('player:leave', (r, id) => {
    socket.leave(`${r.code}:${id}`);
    socket.data.playerId = null;
    return r.leave(id);
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
    if (r && r.phase === 'question' && round === r.round) r.startSabotage();
  });

  socket.on('hearing:done', ({ round } = {}) => {
    const r = tvRoom();
    if (r && r.phase === 'hearing' && round === r.round) r.startRating();
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
