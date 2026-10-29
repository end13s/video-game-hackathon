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
  renderCards(atPodium);

  switch (state.phase) {
    case 'lobby':
      renderCreator(me);
      return show('create');
    case 'ask':
      if (atPodium) return show('podium');
      return renderAsk();
    case 'question':
      if (atPodium) return look('Incoming question', 'Look at the TV', 'Get your talking points ready.', me);
      return look('Eyes on the TV', 'A question for the podium…', '', politician);
    case 'answer':
      if (atPodium) return renderAnswer();
      return look('Eyes on the TV', `${charName(politician)} is preparing a dodge…`, '', politician);
    case 'hearing':
      if (atPodium) return look('You have the floor', '🎤 Your answer is playing', 'Look at the TV.', me);
      return look('Eyes on the TV', `${charName(politician)} responds`, '', politician);
    case 'vote':
      return renderVote(me);
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

// ---- talking points --------------------------------------------------------

function renderCards(atPodium) {
  const cards = state.talkingPoints || [];
  const html = cards.map((c) => `<button type="button" class="card-btn ${c.used ? 'used' : ''}" data-text="${esc(c.text)}" ${c.used ? 'disabled' : ''}>${esc(c.text)}</button>`).join('');
  for (const el of document.querySelectorAll('.cards')) el.innerHTML = html;
  // Journalists see the hand too, so they can aim questions at it.
  for (const el of document.querySelectorAll('.small-cards')) el.classList.toggle('hidden', atPodium || !cards.length);
}

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

// ---- answer (politician) ---------------------------------------------------

let answeringIndex = null;

function renderAnswer() {
  const g = state.grill;
  const asker = playerById(g?.journalistId);
  setAll('.asker', asker ? `${asker.name}, ${asker.outlet}` : 'A journalist');
  setAll('.question-text', g?.question || '');
  // A new question clears the box.
  if (answeringIndex !== g?.index) {
    answeringIndex = g?.index;
    $('answer').value = '';
    $('answer').oninput();
    $('answer-error').textContent = '';
  }
  show('answer');
}

$('answer').oninput = () => ($('answer-count').textContent = `${$('answer').value.length} / 200`);
submitOnEnter($('answer'), $('answer-form'));

// Tapping a talking point drops it into the answer where the cursor is.
$('answer-cards').onclick = (e) => {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  const box = $('answer');
  const text = btn.dataset.text;
  const start = box.selectionStart ?? box.value.length;
  const end = box.selectionEnd ?? box.value.length;
  const before = box.value.slice(0, start);
  const insert = `${before && !before.endsWith(' ') ? ' ' : ''}${text} `;
  box.value = (before + insert + box.value.slice(end)).slice(0, 200);
  box.focus();
  const pos = Math.min(200, before.length + insert.length);
  box.setSelectionRange(pos, pos);
  box.oninput();
};

$('answer-form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('answer').value.trim();
  if (!text) return $('answer').focus();
  socket.emit('answer:submit', { text }, (res) => {
    $('answer-error').textContent = res?.error || '';
    if (!res?.error) $('answer').blur();
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

// ---- vote ------------------------------------------------------------------

function renderVote(me) {
  const others = state.transcript.filter((t) => t.journalistId !== me.id);
  const atPodium = state.politicianId === me.id;
  $('vote-question-block').classList.toggle('hidden', !others.length);
  $('vote-dodge-block').classList.toggle('hidden', atPodium);

  $('vote-list').innerHTML = others.map((t) => {
    const p = playerById(t.journalistId);
    const picked = you.votes?.question === t.journalistId ? 'picked' : '';
    return `<button class="${picked}" data-id="${esc(t.journalistId)}" style="--vc:${p?.color || ''}"><span class="who">${esc(p?.name)} · ${esc(p?.outlet)}</span>${esc(t.question)}</button>`;
  }).join('');

  const rating = you.votes?.dodge || 0;
  $('stars').innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" data-stars="${n}" class="${n <= rating ? 'on' : ''}">★</button>`).join('');

  const done = (!others.length || you.votes?.question) && (atPodium || you.votes?.dodge);
  $('vote-done').classList.toggle('hidden', !done);
  show('vote');
}

// You can change your votes until time is up.
$('vote-list').onclick = (e) => {
  const btn = e.target.closest('button');
  if (!btn || btn.dataset.id === you.votes?.question) return;
  socket.emit('vote:question', { targetId: btn.dataset.id }, (res) => {
    $('vote-error').textContent = res?.error || '';
    if (!res?.error) navigator.vibrate?.(40);
  });
};
$('stars').onclick = (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  socket.emit('vote:dodge', { stars: Number(btn.dataset.stars) }, (res) => {
    $('vote-error').textContent = res?.error || '';
    if (!res?.error) navigator.vibrate?.(40);
  });
};

// ---- results ---------------------------------------------------------------

function renderResults(me) {
  const final = state.phase === 'final';
  const { questionVotes = {}, bestQuestion = [], dodge = {}, points = {} } = state.results || {};
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
      $('result-rank').textContent = dodge.count ? `Your dodge: ${'★'.repeat(Math.round(dodge.average))}${'☆'.repeat(5 - Math.round(dodge.average))}` : 'Nobody rated you';
    } else {
      const v = questionVotes[me.id] || 0;
      $('result-rank').textContent = bestQuestion.includes(me.id) ? 'Toughest question!' : `${v} vote${v === 1 ? '' : 's'} for your question`;
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
