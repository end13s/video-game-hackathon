// Press Conference game server. The TV opens /tv and gets a room code;
// phones open /?room=CODE (the TV shows it as a QR code).
// Each round one player is the politician at the podium. The others are journalists:
// they write questions about the round's headline and vote for the best one. One of them
// secretly writes how the politician's answer starts (the teleprompter), the politician
// finishes it, and the press reacts. The reactions set the politician's approval, and the news
// anchor delivers the verdict. All the scoring exists to reward funny answers.
// Message list: docs/press-conference.md
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const crypto = require('crypto');
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
const ANCHOR_VOICE_ID = content.anchor.voiceId || DEFAULT_VOICE_ID;
// The site is public and voices cost money, so stop speaking past this many characters a day.
// A four-player game uses about 2,500. The game carries on with subtitles only.
const TTS_DAILY_CHARS = Number(process.env.TTS_DAILY_CHARS) || 50000;

// Without ROUNDS, everyone takes the podium once.
const ROUNDS = Number(process.env.ROUNDS) || 0;
const ASK_MS = 40000;
const PICK_MS = 20000;
const SABOTAGE_MS = 25000;
const ANSWER_MS = 45000;
const REACTION_WINDOW_MS = 6000; // the press can still react this long after the line ends
const MAX_HEADLINE_MS = 14000;
const MAX_VERDICT_MS = 16000;
const HEADLINE_PAD_MS = 1000; // a beat on the anchor before the cut back to the press room
const MAX_QUESTION_MS = 20000;
const MAX_LINE_MS = 25000;
const LOBBY_DROP_MS = 30000; // forget players who leave the lobby and don't come back
const GRACE_MS = 15000; // a refresh or network blip doesn't count as leaving the round
const EMPTY_ROOM_MS = 10 * 60 * 1000; // delete rooms nobody has been in for this long
const MAX_ROOMS = 30;
const START_APPROVAL = 50;
const SWEAT_BELOW = 35; // approval at which the politician starts sweating
const REACTIONS_PER_ANSWER = 6; // per journalist
const VOTE_POINTS = 10; // a journalist's question gets a vote in the pick
const SETUP_SHARE = 0.5; // the asker's share of the approval above the start, so the podium stays the main way to win
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const MAX_NAME = 16;
const MAX_QUESTION = 160;
const MAX_ANSWER = 200;
const MAX_OPENER = 90;
const REACT_GAP_MS = 400; // per player, so nobody floods the room
const POSITIVE_REACTIONS = ['laugh', 'applause', 'cheer'];
const NEGATIVE_REACTIONS = ['boo', 'tomato', 'liar'];
const REACTIONS = [...POSITIVE_REACTIONS, ...NEGATIVE_REACTIONS];
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];
const BOT_NAMES = content.botNames || ['Ada', 'Bruno', 'Chen', 'Dara', 'Emil', 'Fay'];
const MEDIA_FILE = /\.(webp|png|jpe?g|mp3)$/;
// Players build their politician from these on their phone. The number of options per item
// matches the number of players, up to the art we have: public/avatars/{suit}-{face}-{hair}.webp.
const AVATAR_OPTIONS = {
  suit: ['blue', 'red', 'green', 'gold'],
  face: ['glasses', 'shades', 'moustache', 'beard'],
  hair: ['short', 'curly', 'long', 'bun'],
};
const AVATAR_ITEMS = Object.keys(AVATAR_OPTIONS);
const MAX_AVATAR_OPTIONS = 4;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 16 * 1024 }); // every message is a few hundred characters

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders: (res, file) => {
    if (MEDIA_FILE.test(file)) res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'phone.html')));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html')));
app.get('/healthz', (req, res) => res.send('ok'));
app.get('/config', (req, res) => res.json({ publicUrl: PUBLIC_URL }));
app.get('/speech/:id', tts.serveSpeech);

app.get('/qr.svg', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 500);
  if (!text) return res.status(400).send('Missing text');
  res.type('image/svg+xml').send(await QRCode.toString(text, { type: 'svg', margin: 1 }));
});

// ---- text-to-speech ---------------------------------------------------------

let ttsDay = '';
let ttsChars = 0;

// Starts generating right away and returns the URL the TV streams it from, or null without a key
// or past the daily limit.
function speak(text, voiceId) {
  if (!API_KEY || !voiceId) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (today !== ttsDay) [ttsDay, ttsChars] = [today, 0];
  if (ttsChars + text.length > TTS_DAILY_CHARS) {
    console.warn(`Voice limit reached (${TTS_DAILY_CHARS} characters today), skipping speech`);
    return null;
  }
  ttsChars += text.length;
  const job = tts.startSpeech({ apiKey: API_KEY, voiceId, modelId: TTS_MODEL, text });
  return `/speech/${job.id}`;
}


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

// Names are read aloud too, so square brackets (voice tags) go along with control characters.
const cleanName = (name) => [...String(name || '').replace(/[\[\]\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, MAX_NAME).join('').trim();
const cleanText = (text, max) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);

// What a player is called on screen and in headlines. characterId only picks their voice now.
const stageName = (p) => p.name.replace(/ \(bot\)$/, '');
const characterInfo = (p) => ({ id: p.characterId, name: stageName(p), title: '' });

// The anchor's verdict: which band of content.anchor.lines an approval falls in.
function verdictBand(approval) {
  if (approval < 30) return 'disaster';
  if (approval < 45) return 'poor';
  if (approval <= 55) return 'shrug';
  if (approval < 75) return 'good';
  return 'triumph';
}

const fillLine = (line, names) => line.replace(/\{(\w+)\}/g, (m, key) => names[key] ?? m);
// "Ada", "Ada and Bruno", "Ada, Bruno and Chen".
const listNames = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

const avatarUrl = ({ suit, face, hair }) => `/avatars/${suit}-${face}-${hair}.webp`;

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
    this.tvKey = crypto.randomBytes(8).toString('hex'); // players know the code, only the TV has this
    // playerId -> { id, name, color, connected, disconnectedAt, score, avatar, characterId, pressId, bot, dropTimer }
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
    this.approval = START_APPROVAL; // secret until the news response
    this.reactions = new Map(); // journalistId -> reactions used on this answer
    this.reactionPoints = 0; // what one positive reaction adds to approval this round
    this.lineDone = false; // the TV finished playing the answer
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
      approvalPoints: p.approvalPoints,
      pressPoints: p.pressPoints,
      character: characterInfo(p),
      avatar: p.avatar, // { suit, face, hair }: indexes into AVATAR_OPTIONS
      avatarUrl: avatarUrl(p.avatar),
      outlet: pressOf(p).outlet,
      asked: this.asks.has(p.id),
      voted: this.phase === 'pick' && this.questionVotes.has(p.id),
    };
  }

  publicState() {
    const showQuestions = this.phase === 'pick';
    const showChosen = ['question', 'sabotage', 'answer', 'hearing', 'news', 'final'].includes(this.phase);
    const showOpener = ['answer', 'hearing', 'news', 'final'].includes(this.phase);
    const showAnswer = ['hearing', 'news', 'final'].includes(this.phase);
    return {
      roomCode: this.code,
      phase: this.phase,
      remainingMs: this.endsAt ? Math.max(0, this.endsAt - Date.now()) : null,
      round: this.round,
      totalRounds: this.totalRounds,
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      // What phones can pick from in the lobby.
      avatarOptions: this.phase === 'lobby' ? this.avatarOptions() : null,
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
    if (this.phase === 'lobby') this.fitAvatars();
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
      votes: { question: this.questionVotes.get(playerId) || null },
      reactionsLeft: REACTIONS_PER_ANSWER - (this.reactions.get(playerId) || 0),
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
  }

  // ---- phases ----

  clearScores() {
    for (const p of this.players.values()) Object.assign(p, { score: 0, approvalPoints: 0, pressPoints: 0 });
  }

  startGame() {
    this.clearScores();
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
    // "{name}" in a headline becomes the politician's name.
    const h = this.nextHeadline();
    const politician = this.players.get(this.politicianId);
    this.headline = { text: h.text.replace(/\{name\}/g, politician ? stageName(politician) : 'Politician'), questions: h.questions || [] };
    this.headlineQuestions = shuffle(this.headline.questions);
    this.asks.clear();
    this.questionVotes.clear();
    this.reactions.clear();
    this.approval = START_APPROVAL;
    this.lineDone = false;
    // Bots lean the same way each round, so a room of them can make a hit or a flop.
    const lean = pick([0.9, 0.5, 0.1]);
    for (const p of this.players.values()) if (p.bot) p.mood = Math.min(1, Math.max(0, lean + (Math.random() - 0.5) * 0.2));
    this.chosen = null;
    this.saboteurId = null;
    this.results = null;
    const text = this.headline.text;
    const speech = `Breaking news. ${text}.`;
    this.setPhase('breaking', { timerMs: speakingMs(speech, MAX_HEADLINE_MS) + HEADLINE_PAD_MS, onTimeout: () => this.startAsk() });
    this.sendYouAll();
    this.emit('headline:read', { round: this.round, text, audioUrl: speak(speech, ANCHOR_VOICE_ID) });
  }

  startAsk() {
    this.setPhase('ask', { timerMs: ASK_MS, visible: true, onTimeout: () => this.closeAsks() });
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
    this.chosen.openerBy = playerId;
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
    // A full room of positive reactions takes approval from 50 to 100.
    this.reactionPoints = (100 - START_APPROVAL) / (Math.max(1, this.activeJournalists().length) * REACTIONS_PER_ANSWER);
    this.setPhase('hearing', { timerMs: speakingMs(this.chosen.answer, MAX_LINE_MS) + REACTION_WINDOW_MS, onTimeout: () => this.startNews() });
    console.log(`[${this.code}]   says: ${speech}`);
    this.emit('hearing:line', {
      round,
      playerId: this.politicianId,
      character: p ? characterInfo(p) : null,
      text: this.chosen.answer,
      opener: this.chosen.opener,
      audioUrl,
    });
  }

  // The TV finished playing the answer: the press gets a last moment to react.
  lineFinished() {
    if (this.lineDone) return;
    this.lineDone = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.startNews(), REACTION_WINDOW_MS);
  }

  // Reporters score for votes on their question, and for setting up an answer that landed.
  scoreRound(approval) {
    const press = new Map();
    const add = (id, n) => press.set(id, (press.get(id) || 0) + n);
    for (const target of this.questionVotes.values()) add(target, VOTE_POINTS);
    if (approval > START_APPROVAL) add(this.chosen.journalistId, Math.round((approval - START_APPROVAL) * SETUP_SHARE));
    for (const [id, n] of press) {
      const p = this.players.get(id);
      if (!p) continue;
      p.pressPoints += n;
      p.score += n;
    }
    const politician = this.players.get(this.politicianId);
    if (politician) {
      politician.approvalPoints += approval;
      politician.score += approval;
    }
  }

  // One sentence on how the answer landed, and one crediting the asker and the saboteur.
  verdict(approval) {
    const { lines } = content.anchor;
    const nameOf = (id) => (this.players.has(id) ? stageName(this.players.get(id)) : null);
    const asker = approval > START_APPROVAL ? nameOf(this.chosen.journalistId) : null;
    const saboteur = nameOf(this.chosen.openerBy);
    const list = this.reactions.size ? lines[verdictBand(approval)] : lines.noReactions;
    let credit = null;
    if (asker && asker === saboteur) credit = lines.creditSame;
    else if (asker && saboteur) credit = lines.creditBoth;
    else if (asker) credit = lines.creditAsker;
    else if (saboteur) credit = lines.creditSaboteur;
    const names = { name: nameOf(this.politicianId) || 'The politician', asker, saboteur };
    return [list, credit].filter(Boolean).map((l) => fillLine(pick(l), names)).join(' ');
  }

  // The anchor comes back with the verdict, and this is where approval is revealed.
  startNews() {
    const approval = Math.round(this.approval);
    this.scoreRound(approval);
    const speech = this.verdict(approval);
    const text = stripTags(speech);
    this.results = { approval, verdict: text };
    const round = this.round;
    this.setPhase('news', { timerMs: speakingMs(text, MAX_VERDICT_MS) + HEADLINE_PAD_MS, onTimeout: () => this.finishRound() });
    this.sendYouAll();
    console.log(`[${this.code}]   approval ${approval}: ${speech}`);
    this.emit('news:read', { round, text, audioUrl: speak(speech, ANCHOR_VOICE_ID) });
  }

  finishRound() {
    if (this.round < this.totalRounds) return this.nextRound();
    const players = [...this.players.values()];
    const top = Math.max(...players.map((p) => p.score));
    const winners = players.filter((p) => p.score === top).map(stageName);
    const { final, finalTie } = content.anchor.lines;
    const speech = fillLine(pick(winners.length > 1 ? finalTie : final), { name: winners[0], names: listNames(winners) });
    const text = stripTags(speech);
    this.results = { finalLine: text };
    this.setPhase('final');
    this.sendYouAll();
    this.emit('final:read', { audioUrl: speak(speech, ANCHOR_VOICE_ID) });
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
    this.clearScores();
    Object.assign(this, { round: 0, totalRounds: 0, politicianId: null, headline: null, chosen: null, saboteurId: null, results: null, endsAt: null, timer: null });
    this.asks.clear();
    this.questionVotes.clear();
    this.reactions.clear();
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
    const free = content.politicians.filter((c) => !used.has(c.id));
    return (free[Math.floor(Math.random() * free.length)] || content.politicians[this.players.size % content.politicians.length]).id;
  }

  pickPress() {
    const used = new Set([...this.players.values()].map((p) => p.pressId));
    const free = content.journalists.find((j) => !used.has(j.id));
    return (free || content.journalists[this.players.size % content.journalists.length]).id;
  }

  // One option per player, with at least two to choose from and no more than the art allows.
  avatarOptionCount() {
    return Math.min(MAX_AVATAR_OPTIONS, Math.max(MIN_PLAYERS, this.players.size));
  }

  avatarOptions() {
    const count = this.avatarOptionCount();
    return Object.fromEntries(AVATAR_ITEMS.map((item) => [item, AVATAR_OPTIONS[item].slice(0, count)]));
  }

  randomAvatar() {
    const count = this.avatarOptionCount();
    return Object.fromEntries(AVATAR_ITEMS.map((item) => [item, Math.floor(Math.random() * count)]));
  }

  // Fewer players means fewer options, so picks that no longer exist move to the last one left.
  fitAvatars() {
    const last = this.avatarOptionCount() - 1;
    for (const p of this.players.values()) {
      for (const item of AVATAR_ITEMS) p.avatar[item] = Math.min(p.avatar[item], last);
    }
  }

  addPlayer(id, name, bot = false) {
    const player = {
      id,
      name: cleanName(name),
      color: this.pickColor(),
      connected: true,
      disconnectedAt: 0,
      score: 0,
      approvalPoints: 0,
      pressPoints: 0,
      avatar: this.randomAvatar(),
      characterId: this.pickCharacter(),
      pressId: this.pickPress(),
      bot,
    };
    this.players.set(id, player);
    return player;
  }

  // Players can change their name and look until the game starts. Several players can pick
  // the same option; to make picks exclusive, reject taken ones in setAvatar.
  setName(playerId, name) {
    if (this.phase !== 'lobby') return { error: 'The game has started' };
    const clean = cleanName(name);
    if (!clean) return { error: 'Type a name first' };
    this.players.get(playerId).name = clean;
    this.sendYou(playerId);
    this.broadcast();
    return { ok: true };
  }

  setAvatar(playerId, picks) {
    if (this.phase !== 'lobby') return { error: 'The game has started' };
    const count = this.avatarOptionCount();
    const chosen = AVATAR_ITEMS.filter((item) => item in picks);
    if (!chosen.length || chosen.some((item) => !Number.isInteger(picks[item]) || picks[item] < 0 || picks[item] >= count)) return { error: 'Unknown option' };
    const p = this.players.get(playerId);
    for (const item of chosen) p.avatar[item] = picks[item];
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

  // Bots ask, vote, sabotage, answer and react a few seconds into each phase, like slow humans.
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
      if (this.phase === 'hearing' && !atPodium) {
        let wait = 0;
        for (let i = 0; i < REACTIONS_PER_ANSWER; i++) {
          wait += randomMs(500, 1400);
          const type = pick(Math.random() < (bot.mood ?? 0.5) ? POSITIVE_REACTIONS : NEGATIVE_REACTIONS);
          setTimeout(() => still('hearing') && this.react(bot.id, type), wait);
        }
      }
      if (this.phase === 'answer' && atPodium) {
        setTimeout(() => still('answer') && this.submitAnswer(bot.id, pick(content.botAnswers)), randomMs(3000, 8000));
      }
    }
  }

  // Journalists react while the answer plays and just after. Each reaction moves the secret
  // approval, and a negative one counts for half, so a big laugh beats booing a rival.
  react(playerId, type) {
    if (this.phase !== 'hearing') return { error: 'Not now' };
    if (playerId === this.politicianId) return { error: "You can't heckle yourself" };
    if (!REACTIONS.includes(type)) return { error: 'Unknown reaction' };
    const p = this.players.get(playerId);
    const used = this.reactions.get(playerId) || 0;
    if (used >= REACTIONS_PER_ANSWER) return { error: 'No reactions left' };
    if (Date.now() - (p.lastReact || 0) < REACT_GAP_MS) return { error: 'Slow down' };
    p.lastReact = Date.now();
    this.reactions.set(playerId, used + 1);
    const sweating = this.sweating();
    const change = POSITIVE_REACTIONS.includes(type) ? this.reactionPoints : -this.reactionPoints / 2;
    this.approval = Math.min(100, Math.max(0, this.approval + change));
    // TV only, so a phone can't work out the approval from the reactions.
    const tv = io.to(`${this.code}:tv`);
    tv.emit('crowd:react', { playerId, type });
    if (this.sweating() !== sweating) tv.emit('podium:sweat', this.sweating());
    this.sendYou(playerId);
    return { ok: true };
  }

  // All the TV learns about approval before the news response.
  sweating() {
    return this.phase === 'hearing' && this.approval < SWEAT_BELOW;
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
  // Anyone can send anything, and one bad message mustn't end every game on the server.
  const on = (event, handler) => socket.on(event, (...args) => {
    try {
      handler(...args);
    } catch (err) {
      console.error(`Bad ${event} message:`, err.message);
    }
  });

  // The TV creates a room, or gets its old one back after a refresh.
  on('tv:join', (data, ack) => {
    if (typeof data === 'function') [data, ack] = [{}, data];
    ack = reply(ack);
    let r = rooms.get(String(data?.roomCode || '').toUpperCase());
    if (r?.tvKey !== data?.key) r = null; // the code alone doesn't take over someone's game
    if (!r) {
      if (rooms.size >= MAX_ROOMS) return ack({ error: 'Too many games running, try again in a few minutes' });
      r = new Room(newRoomCode());
      rooms.set(r.code, r);
      console.log(`[${r.code}] room opened`);
    }
    socket.data.roomCode = r.code;
    socket.data.tv = true;
    socket.join(r.code);
    socket.join(`${r.code}:tv`);
    ack({ roomCode: r.code, key: r.tvKey, state: r.publicState(), sweating: r.sweating() });
  });

  on('player:join', ({ roomCode, playerId, name } = {}, ack) => {
    ack = reply(ack);
    const r = rooms.get(String(roomCode || '').toUpperCase());
    if (!r) return ack({ error: 'Room not found. Check the code on the TV' });
    if (typeof playerId !== 'string' || !/^[\w-]{6,64}$/.test(playerId)) return ack({ error: 'Bad player id' });

    let player = r.players.get(playerId);
    if (!player) {
      if (!cleanName(name)) return ack({ error: 'Type a name first' });
      if (r.players.size >= MAX_PLAYERS) return ack({ error: 'The room is full' });
      player = r.addPlayer(playerId, name);
    } else if (cleanName(name)) {
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
    on(event, (data = {}, ack) => {
      ack = reply(ack);
      const r = room();
      if (!r || !r.players.has(socket.data.playerId)) return ack({ error: 'Join first' });
      ack(handler(r, socket.data.playerId, data || {}));
    });
  };
  playerAction('player:name', (r, id, { name }) => r.setName(id, name));
  playerAction('player:avatar', (r, id, picks) => r.setAvatar(id, picks));
  playerAction('question:submit', (r, id, { text }) => r.submitQuestion(id, text));
  playerAction('vote:question', (r, id, { targetId }) => r.voteQuestion(id, targetId));
  playerAction('answer:submit', (r, id, { text }) => r.submitAnswer(id, text));
  playerAction('opener:submit', (r, id, { text }) => r.submitOpener(id, text));
  playerAction('crowd:react', (r, id, { type }) => r.react(id, type));
  playerAction('player:leave', (r, id) => {
    socket.leave(`${r.code}:${id}`);
    socket.data.playerId = null;
    return r.leave(id);
  });

  // TV only from here on.
  const tvRoom = () => (socket.data.tv ? room() : null);

  on('game:start', (ack) => {
    ack = reply(ack);
    const r = tvRoom();
    if (!r) return ack({ error: 'Not a TV' });
    if (r.phase !== 'lobby') return ack({ error: 'Game already running' });
    if (r.connectedPlayers().length < MIN_PLAYERS) return ack({ error: `Need at least ${MIN_PLAYERS} players (add a bot?)` });
    ack({ ok: true });
    r.startGame();
  });

  on('bot:add', (ack) => {
    ack = reply(ack);
    const r = tvRoom();
    ack(r ? r.addBot() : { error: 'Not a TV' });
  });

  on('bot:remove', ({ playerId } = {}, ack) => {
    ack = reply(ack);
    const r = tvRoom();
    ack(r ? r.removeBot(playerId) : { error: 'Not a TV' });
  });

  on('headline:done', ({ round } = {}) => {
    const r = tvRoom();
    if (r && r.phase === 'breaking' && round === r.round) r.startAsk();
  });

  on('question:done', ({ round } = {}) => {
    const r = tvRoom();
    if (r && r.phase === 'question' && round === r.round) r.startSabotage();
  });

  on('hearing:done', ({ round } = {}) => {
    const r = tvRoom();
    if (r && r.phase === 'hearing' && round === r.round) r.lineFinished();
  });

  on('news:done', ({ round } = {}) => {
    const r = tvRoom();
    if (r && r.phase === 'news' && round === r.round) r.finishRound();
  });

  // Dev: skip the rest of the current phase. In the lobby, start with any number of players.
  on('phase:next', () => tvRoom()?.skipPhase());
  on('game:reset', () => tvRoom()?.reset());

  on('disconnect', () => {
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

// A bug in one room's timer shouldn't take the other rooms down with it.
process.on('uncaughtException', (err) => console.error('Uncaught error:', err));

server.listen(PORT, () => {
  console.log(`Press Conference running on http://localhost:${PORT}`);
  console.log(`  TV:     http://localhost:${PORT}/tv   (each TV gets its own room)`);
  console.log(`  phones: scan the QR code on the TV page`);
  console.log(`  voice:  ${API_KEY ? `on (${TTS_MODEL}, ${TTS_DAILY_CHARS} characters a day)` : 'off (set ELEVENLABS_API_KEY in .env)'}`);
  console.log(`  rounds: ${ROUNDS || 'one per player'}`);
});
