// TV screen. Redraws everything from the latest game:state; question:ask and
// hearing:line only add the audio and the subtitle.
const $ = (id) => document.getElementById(id);
const socket = io();

const params = new URLSearchParams(location.search);
let roomCode = params.get('room');
let state = { phase: 'lobby', players: [], round: 0, questions: [] };
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
socket.on('headline:read', onHeadline);
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

const SCREEN = { question: 'stage', answer: 'stage', hearing: 'stage', rate: 'stage', final: 'results' };

function render(s) {
  const prevPhase = state.phase;
  state = s;
  endsAt = s.remainingMs == null ? null : Date.now() + s.remainingMs;
  document.body.dataset.phase = s.phase;
  document.body.dataset.screen = SCREEN[s.phase] || s.phase;
  const entered = s.phase !== prevPhase;

  const politician = playerById(s.politicianId);
  const journalists = s.players.filter((p) => p.id !== s.politicianId && p.connected);
  setAll('.round-tag', s.round ? `Round ${s.round} of ${s.totalRounds}` : '');
  setAll('.total', s.players.filter((p) => p.connected).length);
  setAll('.headline', s.headline || '');
  setAll('.journalist-total', journalists.length);
  renderPodium(politician, s.phase === 'hearing');
  renderPress();

  if (s.phase === 'lobby') renderLobby();
  if (s.phase === 'ask') {
    $('asked').textContent = journalists.filter((p) => p.asked).length;
    $('ask-total').textContent = journalists.length;
    setAll('.politician-title', `${politician?.name}, as ${charName(politician)}`);
    if (entered) cameraFlashes(3);
  }
  if (s.phase === 'pick') {
    $('picked').textContent = journalists.filter((p) => p.voted).length;
    if (entered) renderPick();
  }
  if (['question', 'answer', 'hearing', 'rate'].includes(s.phase)) renderStage(politician, entered);
  if (s.phase === 'rate') $('rated').textContent = journalists.filter((p) => p.rated).length;
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

// ---- press room ------------------------------------------------------------

// Figures are only redrawn when something about them changes, so animations keep running.
let podiumKey = '';
function renderPodium(p, speaking) {
  const el = $('politician');
  const key = p ? `${p.id}:${JSON.stringify(p.look)}` : '';
  if (key !== podiumKey) {
    podiumKey = key;
    el.innerHTML = p ? personSvg(p.look, p.color) : '';
    el.classList.remove('enter');
    void el.offsetWidth;
    if (p) el.classList.add('enter');
  }
  el.classList.toggle('speaking', speaking);
}

// The room is seen from the back: rows of chairs face the podium, with an aisle
// down the middle. Players sit in the front row; the rows behind are filled with
// background reporters and a few empty chairs.
const BACK_ROWS = [
  { bottom: 13.2, w: 4.2, dim: 0.6, seats: [21, 27, 33, 39, 61, 67, 73, 79] },
  { bottom: 7.4, w: 5.8, dim: 0.72, seats: [13, 20.5, 28, 35.5, 64.5, 72, 79.5, 87] },
];
const FRONT_ROW = { bottom: 0.5, w: 8.2, seats: [6, 15, 24, 33, 67, 76, 85, 94] };
const FRONT_ORDER = [3, 4, 2, 5, 1, 6, 0, 7]; // players fill the seats next to the aisle first
const TIES = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#64748b'];

function chairSvg() {
  return `<div class="chair"><svg viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 44 L18 70M78 44 L82 70M50 44 L50 70" stroke="#55596a" stroke-width="3.5"/>
    <rect x="6" y="0" width="88" height="46" rx="12" fill="#1b2a5c"/>
    <rect x="6" y="0" width="88" height="46" rx="12" fill="url(#chairShade)"/>
    <path d="M14 6 Q50 0 86 6" stroke="#fff" stroke-width="2" opacity=".18" fill="none"/>
  </svg></div>`;
}

function seatHtml(x, row, inner, extra = '') {
  const dim = row.dim ? ` filter:brightness(${row.dim});` : '';
  return `<div class="seat ${extra}" style="left:${x}%; bottom:${row.bottom}rem; width:${row.w}rem; height:${row.w * 1.75}rem;${dim}">${inner}</div>`;
}

function buildRows() {
  let html = '';
  for (const row of BACK_ROWS) {
    for (const x of row.seats) {
      const person = Math.random() < 0.8
        ? `<div class="person" style="--d:-${(Math.random() * 4).toFixed(1)}s">${backSvg(randomLook(), TIES[Math.floor(Math.random() * TIES.length)])}</div>`
        : '';
      html += seatHtml(x, row, person + chairSvg());
    }
  }
  $('rows').innerHTML = html;
}

// The front row: one seat per player (everyone in the lobby, the journalists during a
// round), with their name on the chair. Whoever's question is up stands under a spotlight,
// and raises their mic while asking.
let pressKey = '';
function renderPress() {
  const inRound = state.phase !== 'lobby';
  const people = state.players.filter((p) => p.connected && (!inRound || p.id !== state.politicianId));
  const spotlightId = ['question', 'answer', 'hearing', 'rate'].includes(state.phase) ? state.chosen?.journalistId : null;
  const askerId = state.phase === 'question' ? spotlightId : null;
  const key = JSON.stringify([people.map((p) => [p.id, p.look]), inRound, spotlightId, askerId]);
  if (key === pressKey) return;
  pressKey = key;
  const bySeat = {};
  people.forEach((p, i) => (bySeat[FRONT_ORDER[i % FRONT_ORDER.length]] = p));
  $('press').innerHTML = FRONT_ROW.seats.map((x, i) => {
    const p = bySeat[i];
    if (!p) return seatHtml(x, FRONT_ROW, chairSvg());
    const standing = p.id === spotlightId;
    const figure = `<div class="person">${backSvg(p.look, p.color, { pose: p.id === askerId ? 'raise' : null })}</div>`;
    const plate = `<span class="plate" style="--c:${p.color}">${esc(p.name)}${inRound ? `<small>${esc(p.outlet)}</small>` : ''}</span>`;
    return seatHtml(x, FRONT_ROW, figure + chairSvg() + plate, standing ? 'standing' : '');
  }).join('');
}

// Photographers walk along the front of the stage and take photos.
const walkers = [];
function startWalkers() {
  ['camera', 'camera'].forEach((prop, i) => {
    const el = document.createElement('div');
    el.className = 'person';
    el.innerHTML = backSvg(randomLook(), TIES[i], { standing: true, prop });
    const w = { el, prop, x: offPodium() };
    el.style.left = `${w.x}%`;
    $('walkers').appendChild(el);
    walkers.push(w);
    setTimeout(() => wander(w), 400 + i * 1500);
  });
}

// A spot on the floor that isn't right in front of the podium.
function offPodium() {
  const x = 10 + Math.random() * 64;
  return x > 40 ? x + 20 : x;
}

// They walk past the podium but never stop in front of it.
function wander(w) {
  const target = offPodium();
  const secs = Math.abs(target - w.x) * 0.12 + 0.6;
  w.el.style.transition = `left ${secs}s linear`;
  w.el.style.transform = target < w.x ? 'scaleX(-1)' : '';
  w.el.classList.add('walking');
  w.el.style.left = `${target}%`;
  w.x = target;
  setTimeout(() => {
    w.el.classList.remove('walking');
    w.el.style.transform = '';
    if (w.prop === 'camera' && Math.random() < 0.5) shoot(w);
    setTimeout(() => wander(w), 1500 + Math.random() * 3500);
  }, secs * 1000);
}

function shoot(w) {
  w.el.classList.remove('shoot');
  void w.el.offsetWidth;
  w.el.classList.add('shoot');
}

buildRows();
startWalkers();

function renderStage(politician, entered) {
  const c = state.chosen;
  if (!c) return;
  const asker = playerById(c.journalistId);
  $('asker').textContent = asker ? `${asker.name} (${asker.outlet})` : 'The press';
  $('question-text').textContent = c.question;
  $('stage-status').textContent = state.phase === 'answer' ? `${charName(politician)} is writing a dodge…` : '';
  if (entered && ['question', 'answer'].includes(state.phase)) $('subtitle').classList.add('hidden');
  // The answer stays up while the press rates it, also after a TV refresh.
  if (state.phase === 'rate' && c.answer) showSubtitle(politician, c.answer);
}

function showSubtitle(p, text) {
  $('sub-name').textContent = `${charName(p)}${p ? ` (${p.name})` : ''}`;
  $('sub-text').textContent = text;
  $('subtitle').style.setProperty('--c', p?.color || '');
  $('subtitle').classList.remove('hidden');
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
    pick: 'Developing: the press room votes on the question to ask',
    hearing: 'Live: the politician responds · Fact checkers are on standby',
    rate: 'Viewers decide: how good was that dodge?',
    results: 'Polls are closed · Results are in',
    final: 'Final results · The press conference is over',
  };
  // During a round the ticker runs the headline.
  const text = state.headline && state.phase !== 'final' ? `Breaking: ${state.headline} · ${lines[state.phase]}` : lines[state.phase] || '';
  $('ticker-text').textContent = `${text}   ★   ${text}`;
}

// The crews' cameras go off, and the screen flickers a little.
function cameraFlashes(n) {
  const cameras = walkers.filter((w) => w.prop === 'camera');
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      if (cameras.length) shoot(cameras[Math.floor(Math.random() * cameras.length)]);
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

function onHeadline({ audioUrl }) {
  cameraFlashes(3);
  play(audioUrl, () => {});
}

function onQuestion({ round, audioUrl }) {
  cameraFlashes(3);
  play(audioUrl, () => socket.emit('question:done', { round }));
}

function onHearingLine({ round, playerId, text, audioUrl }) {
  showSubtitle(playerById(playerId), text);
  cameraFlashes(2);
  play(audioUrl, () => socket.emit('hearing:done', { round }));
}

// ---- pick and results ------------------------------------------------------

// Anonymous while the press votes, so nobody votes for a friend.
function renderPick() {
  $('pick-list').innerHTML = state.questions.map((q) => `<div class="q">“${esc(q.text)}”</div>`).join('');
}

function stars(avg) {
  const n = Math.round(avg);
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
}

function renderResults() {
  const final = state.phase === 'final';
  const { bestQuestion = null, rating = {}, points = {} } = state.results || {};
  const politician = playerById(state.politicianId);
  $('results-heading').textContent = final ? 'Final results' : `Round ${state.round} results`;
  $('again').classList.toggle('hidden', !final);

  const author = playerById(bestQuestion);
  const bestHtml = author
    ? `<div class="highlight">${face(author, 'small')}<span><small>Best question · +${points[author.id] || 0}</small><strong>${esc(author.name)}</strong>“${esc(state.chosen?.question)}”</span></div>`
    : '';
  const ratingHtml = politician && rating.count
    ? `<div class="highlight">${face(politician, 'small')}<span><small>Answer rating · +${points[politician.id] || 0}</small><strong>${esc(charName(politician))}</strong><span class="stars">${stars(rating.average)}</span> ${rating.average} / 5</span></div>`
    : '';
  $('highlights').innerHTML = final ? '' : ratingHtml + bestHtml;

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
