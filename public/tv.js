// TV screen. Redraws everything from the latest game:state; question:ask and
// hearing:line only add the audio and the subtitle.
const $ = (id) => document.getElementById(id);
const socket = io();

let state = { phase: 'lobby', players: [], round: 0 };
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

// ---- connection ------------------------------------------------------------

socket.on('connect', () => {
  $('offline').classList.add('hidden');
  socket.emit('tv:join', (res) => render(res.state));
});
socket.on('disconnect', () => $('offline').classList.remove('hidden'));
socket.on('game:state', render);
socket.on('question:ask', onQuestion);
socket.on('hearing:line', onHearingLine);

// ---- join QR ---------------------------------------------------------------

fetch('/config')
  .then((r) => r.json())
  .then((config) => {
    const joinUrl = `${(config.publicUrl || location.origin).replace(/\/$/, '')}/`;
    $('qr').innerHTML = `<img src="/qr.svg?text=${encodeURIComponent(joinUrl)}" alt="QR code to join" style="width:100%;height:100%">`;
    $('join-url').textContent = joinUrl;
    $('url-warning').classList.toggle('hidden', !/localhost|127\.0\.0\.1/.test(joinUrl));
  })
  .catch(() => ($('join-url').textContent = 'Could not load /config'));

// ---- render ----------------------------------------------------------------

function render(s) {
  const prev = state.phase;
  state = s;
  endsAt = s.remainingMs == null ? null : Date.now() + s.remainingMs;
  document.body.dataset.phase = s.phase;
  const entered = s.phase !== prev;

  const connected = s.players.filter((p) => p.connected);
  setAll('.total', connected.length);
  setAll('.round-tag', s.round ? `Round ${s.round} of ${s.totalRounds}` : '');
  if (s.question) {
    setAll('.journalist', `${s.question.journalist.name}, ${s.question.journalist.outlet}`);
    setAll('.question-text', s.question.text);
  }

  if (s.phase === 'lobby') renderLobby();
  if (s.phase === 'answer') $('answered').textContent = s.players.filter((p) => p.answered).length;
  if (s.phase === 'hearing') {
    if (entered) $('subtitle').classList.add('hidden');
    renderPodiums();
  }
  if (s.phase === 'vote') {
    $('voted').textContent = s.players.filter((p) => p.voted).length;
    if (entered) renderVoteAnswers();
  }
  if ((s.phase === 'results' || s.phase === 'final') && entered) renderResults();

  if (entered) setTicker();
}

function renderLobby() {
  const { players } = state;
  $('lobby-players').innerHTML = players.length
    ? players.map((p) => `<li style="--c:${p.color}" class="${p.connected ? '' : 'off'}">
        <span class="pname">${esc(p.name)}</span><span class="pchar">${esc(charName(p))}</span></li>`).join('')
    : '<li class="empty">Waiting for politicians…</li>';
  $('start').disabled = !players.some((p) => p.connected);
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
    lobby: 'Breaking: politicians gather for emergency press conference · Scan the QR code to take the podium',
    question: 'Developing: journalist asks the question everyone was afraid of',
    answer: 'Sources say the statements are being drafted right now',
    hearing: 'Live: the politicians respond · Fact checkers are on standby',
    vote: 'Viewers decide: vote on your phone for the best answer',
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

function onQuestion({ round, audioUrl }) {
  cameraFlashes(4);
  play(audioUrl, () => socket.emit('question:done', { round }));
}

// ---- hearing ---------------------------------------------------------------

function renderPodiums() {
  const speakingId = state.hearing?.playerId;
  $('podiums').innerHTML = state.players.map((p) => `
    <div class="podium ${p.id === speakingId ? 'speaking' : ''}" style="--c:${p.color}">
      <div class="head"></div>
      <div class="stand">${esc(charName(p))}</div>
    </div>`).join('');
}

function onHearingLine({ index, playerId, character, text, audioUrl }) {
  const p = playerById(playerId);
  $('sub-name').textContent = `${character?.name || charName(p)}${p ? ` (${p.name})` : ''}`;
  $('sub-text').textContent = text;
  $('subtitle').style.setProperty('--c', p?.color || '');
  $('subtitle').classList.remove('hidden');
  cameraFlashes(2);
  play(audioUrl, () => socket.emit('hearing:done', { index }));
}

// ---- vote and results ------------------------------------------------------

function renderVoteAnswers() {
  $('vote-answers').innerHTML = state.answers.map((a) => {
    const p = playerById(a.playerId);
    return `<div class="card" style="--c:${p?.color || '#999'}"><span class="who">${esc(charName(p))}</span>${esc(a.text)}</div>`;
  }).join('');
}

function renderResults() {
  const { votes = {}, winners = [] } = state.results || {};
  const final = state.phase === 'final';
  const names = winners.map((id) => charName(playerById(id)));
  $('winner-line').textContent = final
    ? `Final results`
    : names.length ? `${names.join(' and ')} won the room!` : 'Nobody convinced the press.';
  if (final) setAll('.round-tag', 'Game over');
  $('again').classList.toggle('hidden', !final);

  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score;
  $('scoreboard').innerHTML = ranked.map((p, i) => {
    const win = final ? p.score === top && top > 0 : winners.includes(p.id);
    const v = votes[p.id] || 0;
    return `<li class="${win ? 'winner' : ''}" style="--c:${p.color}; animation-delay:${i * 0.15}s">
      <span class="rank">${i + 1}</span>
      <span class="who">${esc(p.name)}<small>${esc(charName(p))}</small></span>
      <span class="delta">${v ? `+${v} vote${v > 1 ? 's' : ''}` : ''}</span>
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') start();
  if (e.key === 'n' || e.key === 'N') socket.emit('phase:next');
  if (e.key === 'r' || e.key === 'R') socket.emit('game:reset');
});
