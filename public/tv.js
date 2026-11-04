// TV screen. Redraws everything from the latest game:state; the events that carry
// audio (headline:read, question:ask, hearing:line, news:read, final:read) only add that.
const $ = (id) => document.getElementById(id);
const socket = io();
PressAudio.attach(socket); // sound effects, music and the anchor (public/sound.js)

const params = new URLSearchParams(location.search);
let roomCode = params.get('room');
let tvKey = params.get('key');
// N and R are for testing: one stray press of R would wipe a real game.
const DEV = params.has('dev') || /^(localhost|127\.|10\.|192\.168\.)/.test(location.hostname);
$('dev').classList.toggle('hidden', !DEV);
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
  return `<span class="face ${cls}" style="--c:${p?.color || '#999'}">${p?.avatarUrl ? `<img src="${p.avatarUrl}" alt="">` : ''}</span>`;
}

// ---- connection ------------------------------------------------------------

socket.on('connect', () => {
  $('offline').classList.add('hidden');
  // Keeps the room in the URL so a refresh rejoins it.
  socket.emit('tv:join', { roomCode, key: tvKey }, (res) => {
    if (res.error) return ($('start-error').textContent = res.error);
    ({ roomCode, key: tvKey } = res);
    params.set('room', roomCode);
    params.set('key', tvKey);
    history.replaceState(null, '', `?${params}`);
    showJoinQr();
    render(res.state);
    setSweat(res.sweating);
  });
});
socket.on('disconnect', () => $('offline').classList.remove('hidden'));
socket.on('game:state', render);
socket.on('headline:read', onHeadline);
socket.on('question:ask', onQuestion);
socket.on('hearing:line', onHearingLine);
socket.on('news:read', onNews);
socket.on('final:read', onFinal);
socket.on('crowd:react', onReact);
socket.on('podium:sweat', setSweat);

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
  const site = (publicUrl || location.origin).replace(/\/$/, '');
  const joinUrl = `${site}/?room=${roomCode}`;
  $('qr').innerHTML = `<img src="/qr.svg?text=${encodeURIComponent(joinUrl)}" alt="QR code to join" style="width:100%;height:100%">`;
  $('join-url').textContent = `${site.replace(/^https?:\/\//, '')} · room ${roomCode}`;
  $('url-warning').classList.toggle('hidden', !/localhost|127\.0\.0\.1/.test(joinUrl));
}

// ---- render ----------------------------------------------------------------

const SCREEN = { question: 'stage', sabotage: 'stage', answer: 'stage', hearing: 'stage' };

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
  setAll('.headline', s.headline || '');
  renderPodium(politician, s.phase === 'hearing');
  renderPress();

  if (entered && ['breaking', 'news'].includes(prevPhase)) audio.pause(); // N can cut the anchor off
  if (s.phase !== 'hearing') setSweat(false);
  if (s.phase === 'lobby') renderLobby();
  if (s.phase === 'breaking') setAll('.politician-title', charName(politician));
  if (s.phase === 'ask') {
    $('asked').textContent = journalists.filter((p) => p.asked).length;
    $('ask-total').textContent = journalists.length;
    setAll('.politician-title', charName(politician));
    if (entered) cameraFlashes(3);
  }
  if (['question', 'sabotage', 'answer', 'hearing'].includes(s.phase)) renderStage(politician, entered);
  if (s.phase === 'news') renderNews();
  if (s.phase === 'final' && entered) renderFinal();

  if (entered) setTicker();
}

function renderLobby() {
  const { players } = state;
  $('lobby-players').innerHTML = players.length
    ? players.map((p) => `<li style="--c:${p.color}" class="${p.connected ? '' : 'off'}">
        ${face(p)}<span class="pname">${esc(p.name)}</span></li>`).join('')
    : '<li class="empty">Waiting for politicians…</li>';
  $('start').disabled = !players.some((p) => p.connected);
}

// ---- press room ------------------------------------------------------------

// Figures are only redrawn when something about them changes, so animations keep running.
let podiumKey = '';
function renderPodium(p, speaking) {
  const el = $('politician');
  const key = p ? `${p.id}:${JSON.stringify(p.avatar)}` : '';
  if (key !== podiumKey) {
    podiumKey = key;
    el.innerHTML = p ? podiumFigure(p.avatar) : '';
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
  { bottom: 12.2, w: 4.2, seats: [21, 27, 33, 39, 61, 67, 73, 79] },
  { bottom: 6.8, w: 5.8, seats: [13, 20.5, 28, 35.5, 64.5, 72, 79.5, 87] },
];
const FRONT_ROW = { bottom: 0.5, w: 8.2, seats: [6, 15, 24, 33, 67, 76, 85, 94] };
const FRONT_ORDER = [3, 4, 2, 5, 1, 6, 0, 7]; // players fill the seats next to the aisle first

function chairHtml() {
  return '<div class="chair"><img src="/room/chair.png" alt=""></div>';
}

function seatHtml(x, row, inner, extra = '', playerId = '') {
  return `<div class="seat ${extra}" ${playerId ? `data-id="${esc(playerId)}"` : ''} style="left:${x}%; bottom:${row.bottom}rem; width:${row.w}rem; height:${row.w * 1.75}rem;">${inner}</div>`;
}

function buildRows() {
  let html = '';
  for (const row of BACK_ROWS) {
    for (const x of row.seats) {
      const person = Math.random() < 0.8
        ? `<div class="person" style="--d:-${(Math.random() * 4).toFixed(1)}s">${crowdFigure()}</div>`
        : '';
      html += seatHtml(x, row, person + chairHtml());
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
  const spotlightId = ['question', 'sabotage', 'answer', 'hearing'].includes(state.phase) ? state.chosen?.journalistId : null;
  const askerId = state.phase === 'question' ? spotlightId : null;
  const key = JSON.stringify([people.map((p) => [p.id, p.avatar]), inRound, spotlightId, askerId]);
  if (key === pressKey) return;
  pressKey = key;
  const bySeat = {};
  people.forEach((p, i) => (bySeat[FRONT_ORDER[i % FRONT_ORDER.length]] = p));
  $('press').innerHTML = FRONT_ROW.seats.map((x, i) => {
    const p = bySeat[i];
    if (!p) return seatHtml(x, FRONT_ROW, chairHtml());
    const standing = p.id === spotlightId;
    const figure = `<div class="person">${pressFigure(p.avatar, { pose: p.id === askerId ? 'raise' : null })}</div>`;
    const plate = `<span class="plate" style="--c:${p.color}">${esc(p.name)}${inRound ? `<small>${esc(p.outlet)}</small>` : ''}</span>`;
    return seatHtml(x, FRONT_ROW, figure + chairHtml() + plate, standing ? 'standing' : '', p.id);
  }).join('');
}

// Photographers walk along the front of the stage and take photos.
const walkers = [];
function startWalkers() {
  ['camera', 'camera'].forEach((prop, i) => {
    const el = document.createElement('div');
    el.className = 'person';
    el.innerHTML = walkerFigure(i);
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
  const status = {
    sabotage: '⚠ Someone in the press is hacking the teleprompter…',
    answer: `${charName(politician)} has to finish the teleprompter's sentence…`,
  };
  $('stage-status').textContent = status[state.phase] || '';
  if (entered && ['question', 'sabotage', 'answer'].includes(state.phase)) $('subtitle').classList.add('hidden');
  // The teleprompter glitches while it's being hacked, then shows what was written.
  $('prompter-text').classList.toggle('hacking', state.phase === 'sabotage');
  $('prompter-text').textContent = state.phase === 'sabotage' ? '▓▒░ H4CK1NG ░▒▓' : `${c.opener || ''}…`;
  if (entered && state.phase === 'sabotage') cameraFlashes(2);
  // The answer stays up while the press reacts, also after a TV refresh.
  if (state.phase === 'hearing' && c.answer) showSubtitle(politician, c.answer);
}

function showSubtitle(p, text) {
  $('sub-name').textContent = charName(p);
  $('sub-text').textContent = text;
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
    breaking: 'Live from the news desk',
    ask: 'Developing: journalists sharpen their questions',
    question: 'Live: the press asks the question everyone was afraid of',
    answer: 'Sources say a dodge is being prepared',
    pick: 'Developing: the press room is getting ready',
    sabotage: 'Technical difficulties: the teleprompter appears to have been tampered with',
    hearing: 'Live: the politician responds · Fact checkers are on standby',
    news: 'Live from the news desk · The verdict is in',
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
const HEADLINE_HOLD_MS = 500; // stay on the anchor a moment after the last word

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

function onHeadline({ round, audioUrl }) {
  play(audioUrl, () => setTimeout(() => socket.emit('headline:done', { round }), HEADLINE_HOLD_MS));
}

function onNews({ round, audioUrl }) {
  play(audioUrl, () => setTimeout(() => socket.emit('news:done', { round }), HEADLINE_HOLD_MS));
}

function onFinal({ audioUrl }) {
  play(audioUrl);
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

// ---- news response and final scores -----------------------------------------

function renderNews() {
  const { approval, verdict } = state.results || {};
  $('news-approval').textContent = `Approval ${approval}%`;
  $('news-verdict').textContent = verdict || '';
}

function renderFinal() {
  $('final-line').textContent = state.results?.finalLine || '';
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score;
  $('scoreboard').innerHTML = ranked.map((p, i) => {
    const rank = ranked.findIndex((other) => other.score === p.score) + 1; // ties share a rank
    return `<li class="${p.score === top ? 'winner' : ''}" style="--c:${p.color}; animation-delay:${i * 0.15}s">
      <span class="rank">${rank}</span>
      ${face(p, 'small')}
      <span class="who">${esc(p.name)}</span>
      <span class="breakdown">Approval ${p.approvalPoints} + Press ${p.pressPoints} =</span>
      <span>${p.score}</span>
    </li>`;
  }).join('');
  cameraFlashes(8);
}

// ---- heckling -------------------------------------------------------------

const HECKLE = {
  laugh: { icon: '😂', sound: 'laugh' },
  applause: { icon: '👏', sound: 'applause' },
  cheer: { icon: '🙌', sound: 'applause' },
  boo: { icon: '👎', sound: 'boo' },
  tomato: { icon: '🍅', sound: 'boo' },
  liar: { icon: 'LIAR!', sound: 'gasp' },
};

// The server keeps approval secret until the news response; this is all the TV gets.
function setSweat(on) {
  $('politician').classList.toggle('sweat', Boolean(on));
}

// Where on screen something comes from or flies to.
function centerOf(el, yFrac = 0.3) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * yFrac };
}

function onReact({ playerId, type }) {
  const h = HECKLE[type];
  if (!h) return;
  const seat = document.querySelector(`#press .seat[data-id="${CSS.escape(playerId)}"]`);
  const from = seat ? centerOf(seat) : { x: innerWidth * (0.2 + Math.random() * 0.6), y: innerHeight * 0.85 };
  window.PressAudio?.sfx(h.sound, 0.35);
  if (type === 'tomato') return throwTomato(from);
  const el = document.createElement('div');
  el.className = `pop${h.icon.length > 2 ? ' word' : ''}`;
  el.textContent = h.icon;
  el.style.left = `${from.x + (Math.random() - 0.5) * 40}px`;
  el.style.top = `${from.y}px`;
  $('fx').appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

// A tomato arcs from the reporter's seat to the podium and splats.
function throwTomato(from) {
  const to = centerOf($('politician'), 0.25);
  to.x += (Math.random() - 0.5) * 80;
  const el = document.createElement('div');
  el.className = 'tomato';
  el.textContent = '🍅';
  $('fx').appendChild(el);
  const peak = Math.min(from.y, to.y) - 160;
  const flight = el.animate([
    { left: `${from.x}px`, top: `${from.y}px`, transform: 'translate(-50%, -50%) rotate(0deg)' },
    { left: `${(from.x + to.x) / 2}px`, top: `${peak}px`, transform: 'translate(-50%, -50%) rotate(360deg)' },
    { left: `${to.x}px`, top: `${to.y}px`, transform: 'translate(-50%, -50%) rotate(720deg)' },
  ], { duration: 700, easing: 'ease-in' });
  flight.onfinish = () => {
    el.remove();
    const splat = document.createElement('div');
    splat.className = 'splat';
    splat.textContent = '💥';
    splat.style.left = `${to.x}px`;
    splat.style.top = `${to.y}px`;
    $('fx').appendChild(splat);
    setTimeout(() => splat.remove(), 1300);
    $('politician').classList.remove('hit');
    void $('politician').offsetWidth;
    $('politician').classList.add('hit');
  };
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
// Exit to the lobby (the main menu). Press twice: the first press asks to confirm.
let exitTimer = null;
function exitToMenu() {
  if (state.phase === 'lobby') return;
  if (!$('exit').classList.contains('confirm')) {
    $('exit').classList.add('confirm');
    $('exit').textContent = 'Press again to end the game';
    exitTimer = setTimeout(resetExit, 3000);
    return;
  }
  resetExit();
  socket.emit('game:reset');
}
function resetExit() {
  clearTimeout(exitTimer);
  $('exit').classList.remove('confirm');
  $('exit').textContent = 'Exit to menu (Esc)';
}
$('exit').onclick = exitToMenu;

$('add-bot').onclick = () => socket.emit('bot:add', (res) => ($('start-error').textContent = res?.error || ''));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') start();
  if ((e.key === 'b' || e.key === 'B') && state.phase === 'lobby') $('add-bot').click();
  if (DEV && (e.key === 'n' || e.key === 'N')) socket.emit('phase:next');
  if (DEV && (e.key === 'r' || e.key === 'R')) socket.emit('game:reset');
  if (e.key === 'Escape') exitToMenu();
});
