// Phone controller. Redraws from the latest game:state plus `you` (this
// player's own answer and vote).
const $ = (id) => document.getElementById(id);
const socket = io();

// ---- identity --------------------------------------------------------------

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

let playerId = storageGet('pcPlayerId');
if (!playerId) {
  playerId = Math.random().toString(36).slice(2, 12);
  storageSet('pcPlayerId', playerId);
}
$('name').value = storageGet('pcName') || '';
const roomCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase();

let state = null;
let you = null; // { player, answer, vote }
let endsAt = null;
let editing = false; // showing the answer box again after sending

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
function charName(p) {
  return p?.character?.name || p?.name || '???';
}

// ---- joining ---------------------------------------------------------------

function join() {
  const name = $('name').value.trim();
  if (!name) return $('name').focus();
  storageSet('pcName', name);
  if (!roomCode) {
    $('join-error').textContent = 'Scan the QR code on the TV to join.';
    return show('join');
  }
  socket.emit('player:join', { roomCode, playerId, name }, (res) => {
    if (res.error) {
      $('join-error').textContent = res.error;
      return show('join');
    }
    $('join-error').textContent = '';
    setYou(res.you);
  });
}

$('join-form').onsubmit = (e) => {
  e.preventDefault();
  $('name').blur();
  keepAwake();
  join();
};

socket.on('connect', () => {
  $('conn').className = 'on';
  // Rejoin automatically after a refresh or a dropped connection.
  if (storageGet('pcName')) join();
});
socket.on('disconnect', () => ($('conn').className = 'off'));
socket.on('you', setYou);
socket.on('game:state', (s) => {
  if (state && s.phase !== state.phase) editing = false;
  state = s;
  endsAt = s.remainingMs == null ? null : Date.now() + s.remainingMs;
  render();
});

function setYou(y) {
  you = y;
  const p = y.player;
  if (p) {
    document.body.style.setProperty('--c', p.color);
    $('me-tag').textContent = `${p.name} · ${charName(p)}`;
    document.querySelector('.char-name').textContent = charName(p);
    document.querySelector('.char-title').textContent = p.character?.title || '';
  }
  render();
}

// ---- screens ---------------------------------------------------------------

function show(screen) {
  document.body.dataset.screen = screen;
}

function look(kicker, text, sub = '') {
  $('look-kicker').textContent = kicker;
  $('look-text').textContent = text;
  $('look-sub').textContent = sub;
  show('look');
}

function render() {
  if (!you?.player || !state) return show('join');
  const me = state.players.find((p) => p.id === you.player.id) || you.player;

  if (state.question) {
    for (const el of document.querySelectorAll('.journalist')) el.textContent = state.question.journalist.name;
    for (const el of document.querySelectorAll('.question-text')) el.textContent = state.question.text;
  }

  switch (state.phase) {
    case 'lobby':
      return show('lobby');
    case 'question':
      return look('Eyes on the TV', 'A journalist has a question…', `Round ${state.round} of ${state.totalRounds}`);
    case 'answer':
      return renderAnswer();
    case 'hearing':
      if (state.hearing?.playerId === me.id) return look('You have the floor', '🎤 Your politician is speaking', 'Look at the TV.');
      return look('Eyes on the TV', 'The hearings have begun', 'Listen to the statements.');
    case 'vote':
      renderVote();
      return show('vote');
    case 'results':
    case 'final':
      return renderResults(me);
  }
}

// ---- answer ----------------------------------------------------------------

function renderAnswer() {
  const sent = Boolean(you.answer) && !editing;
  $('answer-form').classList.toggle('hidden', sent);
  $('answer-sent').classList.toggle('hidden', !sent);
  $('my-answer').textContent = you.answer || '';
  show('answer');
}

$('answer').oninput = () => ($('answer-count').textContent = `${$('answer').value.length} / 200`);
$('answer').onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('answer-form').requestSubmit();
  }
};
$('answer-form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('answer').value.trim();
  if (!text) return $('answer').focus();
  $('answer').blur();
  socket.emit('answer:submit', { text }, (res) => {
    $('answer-error').textContent = res?.error || '';
    if (res?.error) return;
    editing = false;
    $('answer').value = '';
    $('answer-count').textContent = '0 / 200';
    // `you` arrives with the new answer and redraws.
  });
};
$('edit-answer').onclick = () => {
  editing = true;
  $('answer').value = you.answer || '';
  $('answer').oninput();
  renderAnswer();
  $('answer').focus();
};

// ---- vote ------------------------------------------------------------------

function renderVote() {
  const others = state.answers.filter((a) => a.playerId !== you.player.id);
  $('vote-list').innerHTML = others.length
    ? others.map((a) => {
        const p = state.players.find((x) => x.id === a.playerId);
        const picked = you.vote === a.playerId ? 'picked' : '';
        return `<button class="${picked}" data-id="${esc(a.playerId)}" style="--vc:${p?.color || ''}"><span class="who">${esc(charName(p))}</span>${esc(a.text)}</button>`;
      }).join('')
    : '<p class="muted">No other answers to vote for.</p>';
}

// You can change your vote until time is up.
$('vote-list').onclick = (e) => {
  const btn = e.target.closest('button');
  if (!btn || btn.dataset.id === you.vote) return;
  socket.emit('vote:cast', { targetId: btn.dataset.id }, (res) => {
    $('vote-error').textContent = res?.error || '';
    if (!res?.error) navigator.vibrate?.(40);
  });
};

// ---- results ---------------------------------------------------------------

function renderResults(me) {
  const final = state.phase === 'final';
  const { votes = {}, points = {}, winners = [] } = state.results || {};
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const rank = ranked.findIndex((p) => p.id === me.id) + 1;
  const won = final ? rank === 1 && me.score > 0 : winners.includes(me.id);

  $('result-kicker').textContent = final ? 'Final results' : `Round ${state.round} results`;
  $('result-rank').textContent = won ? (final ? 'You won the press conference!' : 'You won the room!') : `You're #${rank}`;
  const v = votes[me.id] || 0;
  $('result-score').textContent = final
    ? `${me.score} points`
    : `${v} vote${v === 1 ? '' : 's'} · +${points[me.id] || 0} · ${me.score} points total`;
  if (won) navigator.vibrate?.([80, 60, 80]);
  show('results');
}

// ---- timer -----------------------------------------------------------------

setInterval(() => {
  const left = endsAt && you ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : null;
  $('timer').classList.toggle('hidden', left === null);
  if (left === null) return;
  $('timer').textContent = `${left}s`;
  $('timer').classList.toggle('low', left <= 5);
}, 250);

// ---- wake lock -------------------------------------------------------------

let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (wakeLock && document.visibilityState === 'visible') keepAwake();
});
