// Phone controller. Redraws from the latest game:state plus `you` (this
// player's role, own question and votes).
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
let you = null; // { player, role, question, votes: { question, dodge } }
let endsAt = null;
let editingQuestion = false;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
function charName(p) {
  return p?.character?.name || p?.name || '???';
}
function playerById(id) {
  return state?.players.find((p) => p.id === id);
}
function setAll(selector, text) {
  for (const el of document.querySelectorAll(selector)) el.textContent = text;
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
  if (state && (s.phase !== state.phase || s.round !== state.round)) editingQuestion = false;
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
    setAll('.char-name', charName(p));
    setAll('.char-title', p.character?.title || '');
  }
  render();
}

// ---- screens ---------------------------------------------------------------

function show(screen) {
  document.body.dataset.screen = screen;
}

function look(kicker, text, sub = '', avatarOf = null) {
  $('look-kicker').textContent = kicker;
  $('look-text').textContent = text;
  $('look-sub').textContent = sub;
  $('look-avatar').classList.toggle('hidden', !avatarOf);
  if (avatarOf) $('look-avatar').innerHTML = avatarSvg(avatarOf.look, avatarOf.color);
  show('look');
}

function render() {
  if (!you?.player || !state) return show('join');
  const me = playerById(you.player.id) || you.player;
  const politician = playerById(state.politicianId);
  const atPodium = state.politicianId === me.id;
  setAll('.politician-name', charName(politician));
  setAll('.headline', state.headline || '');

  switch (state.phase) {
    case 'lobby':
      renderCreator(me);
      return show('create');
    case 'ask':
      if (atPodium) return show('podium');
      return renderAsk();
    case 'pick':
      if (atPodium) return look('You\'re at the podium', 'The press is picking your question…', 'Get your dodge ready.', me);
      return renderPick(me);
    case 'question':
      if (atPodium) return look('Incoming question', 'Look at the TV', 'Your answer box opens next.', me);
      return look('Eyes on the TV', 'The question is being asked…', '', politician);
    case 'answer':
      if (atPodium) return renderAnswer();
      return look('Eyes on the TV', `${charName(politician)} is writing a dodge…`, '', politician);
    case 'hearing':
      if (atPodium) return look('You have the floor', '🎤 Your answer is playing', 'Look at the TV.', me);
      return look('Eyes on the TV', `${charName(politician)} responds`, '', politician);
    case 'rate':
      if (atPodium) return look('The press is rating you', 'How did your dodge land?', '', me);
      return renderRate();
    case 'results':
    case 'final':
      return renderResults(me);
  }
}

// ---- create your politician -----------------------------------------------

function renderCreator(me) {
  $('my-avatar').innerHTML = avatarSvg(me.look, me.color);
  $('look-options').innerHTML = Object.entries(LOOK_OPTIONS).map(([key, list]) => {
    const i = me.look?.[key] ?? 0;
    const value = list[i];
    const label = value.startsWith('#') ? `<span class="swatch" style="background:${value}"></span>` : esc(value);
    return `<div class="look-row">
      <span class="look-label">${LOOK_LABELS[key]}</span>
      <button type="button" data-key="${key}" data-step="-1">◀</button>
      <span class="look-value">${label}</span>
      <button type="button" data-key="${key}" data-step="1">▶</button>
    </div>`;
  }).join('');
}

function sendLook(look) {
  // Draw right away; the server echoes it back to everyone.
  you.player.look = look;
  const me = playerById(you.player.id);
  if (me) me.look = look;
  render();
  socket.emit('player:look', { look }, () => {});
}

$('look-options').onclick = (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const key = btn.dataset.key;
  const n = LOOK_OPTIONS[key].length;
  const current = (playerById(you.player.id) || you.player).look || {};
  sendLook({ ...current, [key]: ((current[key] ?? 0) + Number(btn.dataset.step) + n) % n });
};
$('randomise').onclick = () => sendLook(randomLook());

// ---- ask (journalists) -----------------------------------------------------

function renderAsk() {
  const sent = Boolean(you.question) && !editingQuestion;
  $('ask-form').classList.toggle('hidden', sent);
  $('ask-sent').classList.toggle('hidden', !sent);
  $('my-question').textContent = you.question || '';
  show('ask');
}

$('question').oninput = () => ($('question-count').textContent = `${$('question').value.length} / 160`);
submitOnEnter($('question'), $('ask-form'));
$('ask-form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('question').value.trim();
  if (!text) return $('question').focus();
  $('question').blur();
  socket.emit('question:submit', { text }, (res) => {
    $('ask-error').textContent = res?.error || '';
    if (res?.error) return;
    editingQuestion = false;
    $('question').value = '';
    $('question').oninput();
  });
};
$('edit-question').onclick = () => {
  editingQuestion = true;
  $('question').value = you.question || '';
  $('question').oninput();
  renderAsk();
  $('question').focus();
};

// ---- pick (journalists) ---------------------------------------------------

// Questions are anonymous while picking; your own is shown but can't be picked.
function renderPick(me) {
  $('pick-list').innerHTML = state.questions.map((q) => {
    const own = q.id === me.id;
    const picked = you.votes?.question === q.id ? 'picked' : '';
    return `<button class="${picked}" data-id="${esc(q.id)}" ${own ? 'disabled' : ''}>${own ? '<span class="who">Your question</span>' : ''}${esc(q.text)}</button>`;
  }).join('');
  $('pick-done').classList.toggle('hidden', !you.votes?.question);
  show('pick');
}

// You can change your vote until time is up.
$('pick-list').onclick = (e) => {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled || btn.dataset.id === you.votes?.question) return;
  socket.emit('vote:question', { targetId: btn.dataset.id }, (res) => {
    $('pick-error').textContent = res?.error || '';
    if (!res?.error) navigator.vibrate?.(40);
  });
};

// ---- answer (politician) ---------------------------------------------------

let answeringRound = null;

function renderAnswer() {
  const c = state.chosen;
  const asker = playerById(c?.journalistId);
  setAll('.asker', asker ? `${asker.name}, ${asker.outlet}` : 'The press');
  setAll('.question-text', c?.question || '');
  // A new round clears the box.
  if (answeringRound !== state.round) {
    answeringRound = state.round;
    $('answer').value = '';
    $('answer').oninput();
    $('answer-error').textContent = '';
  }
  show('answer');
}

$('answer').oninput = () => ($('answer-count').textContent = `${$('answer').value.length} / 200`);
submitOnEnter($('answer'), $('answer-form'));
$('answer-form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('answer').value.trim();
  if (!text) return $('answer').focus();
  $('answer').blur();
  socket.emit('answer:submit', { text }, (res) => {
    $('answer-error').textContent = res?.error || '';
    if (!res?.error) navigator.vibrate?.(40);
  });
};

function submitOnEnter(box, form) {
  box.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  };
}

// ---- rate (journalists) ----------------------------------------------------

function renderRate() {
  $('rate-answer').textContent = state.chosen?.answer || '';
  const rating = you.votes?.stars || 0;
  $('stars').innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" data-stars="${n}" class="${n <= rating ? 'on' : ''}">★</button>`).join('');
  $('rate-done').classList.toggle('hidden', !rating);
  show('rate');
}

// You can change your rating until time is up.
$('stars').onclick = (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  socket.emit('answer:rate', { stars: Number(btn.dataset.stars) }, (res) => {
    $('rate-error').textContent = res?.error || '';
    if (!res?.error) navigator.vibrate?.(40);
  });
};

// ---- results ---------------------------------------------------------------

function renderResults(me) {
  const final = state.phase === 'final';
  const { bestQuestion = null, rating = {}, points = {} } = state.results || {};
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const rank = ranked.findIndex((p) => p.id === me.id) + 1;
  const wasPolitician = state.politicianId === me.id;
  $('result-avatar').innerHTML = avatarSvg(me.look, me.color);

  if (final) {
    $('result-kicker').textContent = 'Final results';
    $('result-rank').textContent = rank === 1 && me.score > 0 ? 'You won the press conference!' : `You finished #${rank}`;
    $('result-score').textContent = `${me.score} points`;
  } else {
    $('result-kicker').textContent = `Round ${state.round} results`;
    if (wasPolitician) {
      const n = Math.round(rating.average || 0);
      $('result-rank').textContent = rating.count ? `Your answer: ${'★'.repeat(n)}${'☆'.repeat(5 - n)} (${rating.average})` : 'Nobody rated you';
    } else {
      $('result-rank').textContent = bestQuestion === me.id ? 'Your question won!' : 'Your question wasn\'t picked';
    }
    $('result-score').textContent = `+${points[me.id] || 0} this round · ${me.score} points · #${rank}`;
  }
  if (rank === 1 && final) navigator.vibrate?.([80, 60, 80]);
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
