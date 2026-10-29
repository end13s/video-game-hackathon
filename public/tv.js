// TV screen. Redraws everything from the latest game:state; question:ask and
// hearing:line only add the audio and the subtitle.
const $ = (id) => document.getElementById(id);
const socket = io();

const params = new URLSearchParams(location.search);
let roomCode = params.get('room');
let state = { phase: 'lobby', players: [], round: 0, talkingPoints: [], transcript: [] };
let endsAt = null; // local time the current phase ends, from remainingMs

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
function playerById(id) {
  return state.players.find((p) => p.id === id);
}
function charName(p) {
  return p?.character?.name || p?.name || '???';
}
function setAll(selector, text) {
  for (const el of document.querySelectorAll(selector)) el.textContent = text;
}
function face(p, cls = '') {
  return `<span class="face ${cls}" style="--c:${p?.color || '#999'}">${avatarSvg(p?.look, p?.color)}</span>`;
}
// Wraps the talking point in an answer in <mark>, so the TV shows how it was worked in.
function highlight(text, point) {
  const safe = esc(text);
  if (!point) return safe;
  const pattern = esc(point).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^a-z0-9]+');
  return safe.replace(new RegExp(pattern, 'i'), (m) => `<mark>${m}</mark>`);
}

// ---- connection ------------------------------------------------------------

socket.on('connect', () => {
  $('offline').classList.add('hidden');
  // Keeps the room code in the URL so a refresh rejoins the same room.
  socket.emit('tv:join', { roomCode }, (res) => {
    if (res.error) return ($('start-error').textContent = res.error);
    roomCode = res.roomCode;
    params.set('room', roomCode);
    history.replaceState(null, '', `?${params}`);
    showJoinQr();
    render(res.state);
  });
});
socket.on('disconnect', () => $('offline').classList.remove('hidden'));
socket.on('game:state', render);
socket.on('question:ask', onQuestion);
socket.on('hearing:line', onHearingLine);

// ---- join QR ---------------------------------------------------------------

let publicUrl = '';
fetch('/config')
  .then((r) => r.json())
  .then((config) => {
    publicUrl = config.publicUrl;
    showJoinQr();
  })
  .catch(() => ($('join-url').textContent = 'Could not load /config'));

function showJoinQr() {
  if (!roomCode) return;
  const joinUrl = `${(publicUrl || location.origin).replace(/\/$/, '')}/?room=${roomCode}`;
  $('qr').innerHTML = `<img src="/qr.svg?text=${encodeURIComponent(joinUrl)}" alt="QR code to join" style="width:100%;height:100%">`;
  $('join-url').textContent = joinUrl;
  $('url-warning').classList.toggle('hidden', !/localhost|127\.0\.0\.1/.test(joinUrl));
}

// ---- render ----------------------------------------------------------------

const SCREEN = { question: 'stage', answer: 'stage', hearing: 'stage', final: 'results' };

function render(s) {
  const prevPhase = state.phase;
  const prevIndex = state.grill?.index;
  state = s;
  endsAt = s.remainingMs == null ? null : Date.now() + s.remainingMs;
  document.body.dataset.phase = s.phase;
  document.body.dataset.screen = SCREEN[s.phase] || s.phase;
  const entered = s.phase !== prevPhase;

  const politician = playerById(s.politicianId);
  const journalists = s.players.filter((p) => p.id !== s.politicianId && p.connected);
  setAll('.round-tag', s.round ? `Round ${s.round} of ${s.totalRounds}` : '');
  setAll('.total', s.players.filter((p) => p.connected).length);
  renderCards();
  renderPodium(politician, s.phase === 'hearing');

  if (s.phase === 'lobby') renderLobby();
  if (s.phase === 'ask') {
    $('asked').textContent = journalists.filter((p) => p.asked).length;
    $('ask-total').textContent = journalists.length;
    setAll('.politician-title', `${politician?.name}, as ${charName(politician)}`);
    if (entered) cameraFlashes(3);
  }
  if (['question', 'answer', 'hearing'].includes(s.phase)) renderStage(politician, entered || s.grill?.index !== prevIndex);
  if (s.phase === 'vote') {
    $('voted').textContent = s.players.filter((p) => p.voted).length;
    if (entered) renderTranscript();
  }
  if ((s.phase === 'results' || s.phase === 'final') && entered) renderResults();

  if (entered) setTicker();
}

function renderLobby() {
  const { players } = state;
  $('lobby-players').innerHTML = players.length
    ? players.map((p) => `<li style="--c:${p.color}" class="${p.connected ? '' : 'off'}">
        ${face(p)}<span><span class="pname">${esc(p.name)}</span><span class="pchar">${esc(charName(p))}</span></span></li>`).join('')
    : '<li class="empty">Waiting for politicians…</li>';
  $('start').disabled = !players.some((p) => p.connected);
}

function renderCards() {
  const html = (state.talkingPoints || []).map((c) => `<span class="tp ${c.used ? 'used' : ''}">${esc(c.text)}</span>`).join('');
  for (const el of document.querySelectorAll('.cards')) el.innerHTML = html;
}

function renderPodium(p, speaking) {
  const html = p
    ? `<div class="figure ${speaking ? 'speaking' : ''}">${face(p, 'big')}</div>
       <div class="lectern"><span class="seal">★</span><span class="plate">${esc(charName(p))}</span><small>${esc(p.name)}</small></div>`
    : '';
  for (const el of document.querySelectorAll('.podium-figure')) el.innerHTML = html;
}

function renderStage(politician, newLine) {
  const g = state.grill;
  if (!g) return;
  const asker = playerById(g.journalistId);
  $('q-count').textContent = `Question ${g.index + 1} of ${g.total}:`;
  $('asker').textContent = asker ? `${asker.name} (${asker.outlet})` : 'The press';
  $('question-text').textContent = g.question;
  const status = {
    question: '',
    answer: `${charName(politician)} is preparing a dodge…`,
    hearing: '',
  };
  $('stage-status').textContent = status[state.phase];
  if (newLine && state.phase !== 'hearing') $('subtitle').classList.add('hidden');
}

// Counts down locally from remainingMs, so phone and laptop clocks don't matter.
setInterval(() => {
  const left = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : null;
  $('timer').classList.toggle('hidden', left === null);
  if (left === null) return;
  $('timer-num').textContent = left;
  $('timer').classList.toggle('low', left <= 5);
}, 200);

function setTicker() {
  const lines = {
    lobby: 'Breaking: emergency press conference called · Scan the QR code and create your politician',
    ask: 'Developing: journalists sharpen their questions',
    question: 'Live: the press asks the question everyone was afraid of',
    answer: 'Sources say a dodge is being prepared',
    hearing: 'Live: the politician responds · Fact checkers are on standby',
    vote: 'Viewers decide: toughest question and best dodge',
    results: 'Polls are closed · Results are in',
    final: 'Final results · The press conference is over',
  };
  const text = lines[state.phase] || '';
  $('ticker-text').textContent = `${text}   ★   ${text}`;
}

function cameraFlashes(n) {
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      $('flash').classList.remove('on');
      void $('flash').offsetWidth;
      $('flash').classList.add('on');
    }, i * 250 + Math.random() * 150);
  }
}

// ---- audio -----------------------------------------------------------------

const audio = new Audio();

// Browsers block audio until the page has been clicked once.
function unlockSound() {
  audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  audio.play().then(() => $('sound').classList.add('hidden')).catch(() => {});
}
$('sound').onclick = unlockSound;

// Plays url and calls onDone when it ends. If there's no audio or it fails,
// onDone is skipped and the server moves on by itself after a reading time.
function play(url, onDone) {
  audio.onended = audio.onerror = null;
  if (!url) return;
  audio.src = url;
  audio.onended = onDone;
  audio.play().catch((err) => {
    console.warn('audio blocked, click "enable sound":', err.message);
    $('sound').classList.remove('hidden');
  });
}

function onQuestion({ round, index, audioUrl }) {
  cameraFlashes(3);
  play(audioUrl, () => socket.emit('question:done', { round, index }));
}

function onHearingLine({ round, index, playerId, character, text, talkingPoint, audioUrl }) {
  const p = playerById(playerId);
  $('sub-name').textContent = `${character?.name || charName(p)}${p ? ` (${p.name})` : ''}`;
  $('sub-text').innerHTML = highlight(text, talkingPoint);
  $('subtitle').style.setProperty('--c', p?.color || '');
  $('subtitle').classList.remove('hidden');
  cameraFlashes(2);
  play(audioUrl, () => socket.emit('hearing:done', { round, index }));
}

// ---- vote and results ------------------------------------------------------

function renderTranscript() {
  $('transcript').innerHTML = state.transcript.map((t) => {
    const asker = playerById(t.journalistId);
    return `<div class="exchange" style="--c:${asker?.color || '#999'}">
      <p class="q">${face(asker, 'small')}<span><small>${esc(asker?.name)} · ${esc(asker?.outlet)}</small>${esc(t.question)}</span></p>
      <p class="a">${highlight(t.answer || '', t.talkingPoint)}</p>
    </div>`;
  }).join('');
}

function stars(avg) {
  const n = Math.round(avg);
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
}

function renderResults() {
  const final = state.phase === 'final';
  const { bestQuestion = [], dodge = {}, points = {} } = state.results || {};
  const politician = playerById(state.politicianId);
  $('results-heading').textContent = final ? 'Final results' : `Round ${state.round} results`;
  $('again').classList.toggle('hidden', !final);

  const best = bestQuestion.map((id) => {
    const p = playerById(id);
    const t = state.transcript.find((x) => x.journalistId === id);
    return `<div class="highlight">${face(p, 'small')}<span><small>Toughest question · +${points[id] || 0}</small><strong>${esc(p?.name)}</strong>“${esc(t?.question)}”</span></div>`;
  }).join('');
  const dodgeHtml = politician && dodge.count
    ? `<div class="highlight">${face(politician, 'small')}<span><small>Dodge rating · +${points[politician.id] || 0}</small><strong>${esc(charName(politician))}</strong><span class="stars">${stars(dodge.average)}</span> ${dodge.average} / 5</span></div>`
    : '';
  $('highlights').innerHTML = final ? '' : dodgeHtml + best;

  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score;
  $('scoreboard').innerHTML = ranked.map((p, i) => {
    const win = final && p.score === top && top > 0;
    const gained = points[p.id] || 0;
    return `<li class="${win ? 'winner' : ''}" style="--c:${p.color}; animation-delay:${i * 0.15}s">
      <span class="rank">${i + 1}</span>
      ${face(p, 'small')}
      <span class="who">${esc(p.name)}<small>${esc(charName(p))}</small></span>
      <span class="delta">${!final && gained ? `+${gained}` : ''}</span>
      <span>${p.score}</span>
    </li>`;
  }).join('');
  cameraFlashes(final ? 8 : 4);
}

// ---- host controls ---------------------------------------------------------

function start() {
  unlockSound();
  if (state.phase === 'final') return socket.emit('game:reset');
  if (state.phase !== 'lobby') return;
  socket.emit('game:start', (res) => ($('start-error').textContent = res?.error || ''));
}
$('start').onclick = start;
$('again').onclick = start;
$('add-bot').onclick = () => socket.emit('bot:add', (res) => ($('start-error').textContent = res?.error || ''));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') start();
  if ((e.key === 'b' || e.key === 'B') && state.phase === 'lobby') $('add-bot').click();
  if (e.key === 'n' || e.key === 'N') socket.emit('phase:next');
  if (e.key === 'r' || e.key === 'R') socket.emit('game:reset');
});
