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
let roomCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
// Opened without a QR code: ask for the code, and offer to host.
$('room-code').classList.toggle('hidden', !!roomCode);
$('host-link').classList.toggle('hidden', !!roomCode);

let state = null;
let you = null; // { player, role, question, votes: { question } }
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
  roomCode = $('room-code').value.trim().toUpperCase() || roomCode;
  if (!roomCode) {
    $('join-error').textContent = 'Type the room code from the TV.';
    return show('join');
  }
  storageSet('pcLeft', '');
  socket.emit('player:join', { roomCode, playerId, name }, (res) => {
    if (res.error) {
      $('join-error').textContent = res.error;
      $('room-code').value = roomCode;
      $('room-code').classList.remove('hidden'); // the game may be over, so let them type a new code
      return show('join');
    }
    $('join-error').textContent = '';
    history.replaceState(null, '', `?room=${roomCode}`); // a refresh rejoins
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
  // Rejoin automatically after a refresh or a dropped connection, unless they pressed Exit.
  if (roomCode && storageGet('pcName') && !storageGet('pcLeft')) join();
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
    $('me-tag').textContent = p.name;
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
  if (avatarOf) $('look-avatar').innerHTML = cropped(avatarOf.avatarUrl, CROPS.hair);
  show('look');
}

function render() {
  $('exit').classList.toggle('hidden', !you?.player);
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
    case 'breaking':
      $('breaking-text').textContent = atPodium ? 'You\'re at the podium this round' : 'Watch the TV';
      $('breaking-sub').textContent = atPodium ? 'Watch the TV.' : `${charName(politician)} takes the podium next.`;
      return show('breaking');
    case 'ask':
      if (atPodium) return show('podium');
      return renderAsk();
    case 'pick':
      if (atPodium) return look('You\'re at the podium', 'The press is picking your question…', 'Get your dodge ready.', me);
      return renderPick(me);
    case 'question':
      if (atPodium) return look('Incoming question', 'Look at the TV', 'Your answer box opens next.', me);
      return look('Eyes on the TV', 'The question is being asked…', '', politician);
    case 'sabotage':
      if (you.saboteur) return renderSabotage();
      if (atPodium) return look('Uh oh', '😰 Your teleprompter is glitching…', 'Someone is writing how your answer starts.', me);
      return look('Psst', 'Someone is hacking the teleprompter…', 'Is it you? Is it them? Nobody knows.', politician);
    case 'answer':
      if (atPodium) return renderAnswer();
      return look('Eyes on the TV', `${charName(politician)} is writing a dodge…`, '', politician);
    case 'hearing':
      if (atPodium) return look('The hearing', 'Your answer is playing on the TV', 'Keep a straight face.', me);
      return renderReactions();
    case 'news':
      return look('Watch the TV', `Approval ${state.results?.approval}%`, '', politician);
    case 'final':
      return renderFinal(me);
  }
}

// ---- build your politician -------------------------------------------------

// Step 0 is the name, then one step per item, then the ready screen.
const ITEMS = ['suit', 'face', 'hair'];
const ITEM_TITLES = { suit: 'pick your suit', face: 'pick a face item', hair: 'pick your hair' };
const ITEM_LABELS = { suit: 'suit', face: 'face item', hair: 'hair' };
const READY_STEP = ITEMS.length + 1;
let pickStep = 1; // they just typed their name to join

// Where each item sits on the 640px avatar image: centre x, centre y, size.
const CROPS = { suit: [345, 440, 250], face: [349, 225, 215], hair: [349, 215, 285] };

function cropped(src, [x, y, size]) {
  const style = `width:${(640 / size) * 100}%;left:${(0.5 - x / size) * 100}%;top:${(0.5 - y / size) * 100}%`;
  return `<img class="crop" src="${esc(src)}" alt="" style="${style}">`;
}

function renderCreator(me) {
  const options = state.avatarOptions;
  if (!options) return;
  const item = ITEMS[pickStep - 1];
  const count = options.suit.length;
  const players = state.players.length;
  const nameStep = pickStep === 0;
  const ready = pickStep === READY_STEP;

  $('pick-img').src = me.avatarUrl;
  $('pick-img').alt = `Your politician: ${ITEMS.map((i) => options[i][me.avatar[i]]).join(', ')}`;
  $('pick-who').textContent = me.name;
  $('pick-title').textContent = nameStep ? 'type your name' : ready ? "you're ready" : ITEM_TITLES[item];
  $('pick-step').textContent = ready ? '' : `step ${pickStep + 1} of ${READY_STEP}`;
  $('pick-rule').textContent = ready ? 'The host starts the game on the TV.'
    : nameStep ? 'Call yourself whatever you want.'
    : `${count === players ? `${players} players, ` : ''}${count} options per item`;
  $('pick-name-form').classList.toggle('hidden', !nameStep);
  $('pick-tiles').classList.toggle('hidden', !item);
  $('pick-summary').classList.toggle('hidden', !ready);
  $('pick-next').classList.toggle('hidden', ready);
  $('pick-next').textContent = pickStep === ITEMS.length ? 'ready' : 'next';

  if (item) {
    $('pick-tiles').style.setProperty('--n', count);
    $('pick-tiles').innerHTML = options[item].map((label, i) => {
      const { suit, face, hair } = { ...me.avatar, [item]: i };
      const on = me.avatar[item] === i;
      return `<button type="button" data-item="${item}" data-index="${i}" aria-pressed="${on}" class="${on ? 'on' : ''}">
        <span class="tile">${cropped(`/avatars/${suit}-${face}-${hair}.webp`, CROPS[item])}</span>${esc(label)}</button>`;
    }).join('');
  }
  if (ready) {
    $('pick-summary').innerHTML = [['name', me.name], ...ITEMS.map((i) => [ITEM_LABELS[i], options[i][me.avatar[i]]])]
      .map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
  }
}

function goToStep(step) {
  pickStep = step;
  $('char-error').textContent = '';
  if (step === 0) $('pick-name').value = you.player.name;
  render();
}

function saveName() {
  const name = $('pick-name').value.trim();
  if (!name) {
    $('char-error').textContent = 'Type a name first';
    return $('pick-name').focus();
  }
  $('pick-name').blur();
  socket.emit('player:name', { name }, (res) => {
    if (res?.error) {
      $('char-error').textContent = res.error;
      return;
    }
    storageSet('pcName', name);
    goToStep(1);
  });
}

$('pick-name-form').onsubmit = (e) => {
  e.preventDefault();
  saveName();
};
$('pick-next').onclick = () => (pickStep === 0 ? saveName() : goToStep(pickStep + 1));
$('pick-back').onclick = () => goToStep(Math.max(0, pickStep - 1));

$('pick-tiles').onclick = (e) => {
  const btn = e.target.closest('button');
  if (!btn || btn.classList.contains('on')) return;
  socket.emit('player:avatar', { [btn.dataset.item]: Number(btn.dataset.index) }, (res) => {
    $('char-error').textContent = res?.error || '';
  });
};

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
  $('teleprompter').textContent = c?.opener || '';
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

// ---- sabotage (one journalist) -------------------------------------------

function renderSabotage() {
  setAll('.question-text', state.chosen?.question || '');
  show('sabotage');
}

$('opener').oninput = () => ($('opener-count').textContent = `${$('opener').value.length} / 90`);
submitOnEnter($('opener'), $('sabotage-form'));
$('sabotage-form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('opener').value.trim();
  if (!text) return $('opener').focus();
  $('opener').blur();
  socket.emit('opener:submit', { text }, (res) => {
    $('sabotage-error').textContent = res?.error || '';
    if (res?.error) return;
    $('opener').value = '';
    $('opener').oninput();
    navigator.vibrate?.(40);
  });
};

// ---- reactions (journalists, while the answer plays) ----------------------

function renderReactions() {
  const left = you.reactionsLeft;
  $('reactions-left').textContent = left ? `${left} ${left === 1 ? 'reaction' : 'reactions'} left` : 'No reactions left';
  for (const btn of document.querySelectorAll('.heckles button')) btn.disabled = !left;
  show('heckle');
}

const HECKLES = [['laugh', '😂'], ['applause', '👏'], ['cheer', '🙌'], ['boo', '👎'], ['tomato', '🍅'], ['liar', 'LIAR!']];
for (const el of document.querySelectorAll('.heckles')) {
  el.innerHTML = HECKLES.map(([type, label]) => `<button type="button" data-type="${type}" class="${label.length > 2 ? 'word' : ''}">${label}</button>`).join('');
  el.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    navigator.vibrate?.(15);
    socket.emit('crowd:react', { type: btn.dataset.type }, () => {});
  };
}

// ---- exit -----------------------------------------------------------------

// Tap twice: the first tap asks to confirm.
let exitTimer = null;
$('exit').onclick = () => {
  if (!$('exit').classList.contains('confirm')) {
    $('exit').classList.add('confirm');
    $('exit').textContent = 'Tap again to leave';
    exitTimer = setTimeout(resetExit, 3000);
    return;
  }
  resetExit();
  socket.emit('player:leave', {}, () => {});
  storageSet('pcLeft', '1');
  you = null;
  $('me-tag').textContent = '';
  render();
};
function resetExit() {
  clearTimeout(exitTimer);
  $('exit').classList.remove('confirm');
  $('exit').textContent = 'Exit';
}

// ---- final scores ----------------------------------------------------------

function renderFinal(me) {
  const rank = state.players.filter((p) => p.score > me.score).length + 1; // ties share a rank
  const tied = state.players.filter((p) => p.score === me.score).length > 1;
  $('result-avatar').innerHTML = cropped(me.avatarUrl, CROPS.hair);
  if (rank > 1) $('result-rank').textContent = `You finished #${rank}`;
  else $('result-rank').textContent = tied ? 'You tied for first!' : 'You won the press conference!';
  $('result-score').textContent = `Approval ${me.approvalPoints} + Press ${me.pressPoints} = ${me.score}`;
  if (rank === 1) navigator.vibrate?.([80, 60, 80]);
  show('final');
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
