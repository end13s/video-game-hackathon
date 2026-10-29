const $ = (id) => document.getElementById(id);
const socket = io();

const SEND_INTERVAL_MS = 50; // ~20 per second
const MAX_TILT_DEG = 30; // tilting this far counts as full input

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

// The id survives refreshes, so the server gives us back the same player.
let playerId = storageGet('playerId');
if (!playerId) {
  playerId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  storageSet('playerId', playerId);
}
$('name').value = storageGet('playerName') || '';
if ($('name').value) $('join-btn').textContent = 'Tap to rejoin';

let joined = false;
let wakeLock = null;

// ---- join -------------------------------------------------------------------

function requestMotionPermission() {
  // iOS only. Has to be called straight from the tap handler, before any await.
  const requests = [];
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    requests.push(DeviceMotionEvent.requestPermission());
  }
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    requests.push(DeviceOrientationEvent.requestPermission());
  }
  return Promise.all(requests).catch(() => ['denied']);
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (joined && document.visibilityState === 'visible') requestWakeLock();
});

function sendJoin() {
  socket.emit('player:join', { playerId, name: $('name').value }, (res) => {
    if (res.error) {
      $('join-error').textContent = res.error;
      return;
    }
    joined = true;
    $('join').classList.add('hidden');
    $('controller').classList.remove('hidden');
    $('player-name').textContent = res.player.name;
    $('swatch').style.background = res.player.color;
    showPhase(res.phase);
  });
}

$('join-btn').addEventListener('click', () => {
  const motion = requestMotionPermission();
  requestWakeLock();
  storageSet('playerName', $('name').value.trim());
  motion.then((perms) => {
    if (perms.some((p) => p !== 'granted')) $('tilt-readout').textContent = 'tilt: permission denied';
    window.addEventListener('deviceorientation', onOrientation);
  });
  sendJoin();
});
$('name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('join-btn').click();
});

socket.on('connect', () => {
  $('conn').textContent = '● connected';
  $('conn').className = 'on';
  if (joined) sendJoin(); // reconnect after a network drop
});
socket.on('disconnect', () => {
  $('conn').textContent = '● reconnecting…';
  $('conn').className = 'off';
});

// ---- phases -----------------------------------------------------------------

function showPhase(phase) {
  for (const el of document.querySelectorAll('[data-phase]')) el.classList.toggle('hidden', el.dataset.phase !== phase);
}
socket.on('phase', ({ phase }) => showPhase(phase));

// ---- tilt -------------------------------------------------------------------

const tilt = { x: 0, y: 0 };
let rawTilt = { beta: 0, gamma: 0 };
let tiltZero = { beta: 0, gamma: 0 };

function clamp(v) {
  return Math.max(-1, Math.min(1, v));
}

function onOrientation(e) {
  if (e.beta == null || e.gamma == null) return;
  rawTilt = { beta: e.beta, gamma: e.gamma };
  // Assumes the phone is held in portrait.
  tilt.x = clamp((e.gamma - tiltZero.gamma) / MAX_TILT_DEG);
  tilt.y = clamp((e.beta - tiltZero.beta) / MAX_TILT_DEG);
  $('tilt-readout').textContent = `tilt: x ${tilt.x.toFixed(2)}  y ${tilt.y.toFixed(2)}`;
}

// "Ready" makes however the player is holding the phone right now the zero point.
$('ready-btn').addEventListener('click', () => {
  tiltZero = { ...rawTilt };
  tilt.x = 0;
  tilt.y = 0;
});

// ---- joystick ---------------------------------------------------------------

const stick = $('stick');
const knob = $('knob');
const joy = { x: 0, y: 0 };
let stickPointer = null;

function moveStick(e) {
  const r = stick.getBoundingClientRect();
  const radius = r.width / 2;
  let dx = (e.clientX - (r.left + radius)) / radius;
  let dy = (e.clientY - (r.top + radius)) / radius;
  const len = Math.hypot(dx, dy);
  if (len > 1) {
    dx /= len;
    dy /= len;
  }
  joy.x = dx;
  joy.y = dy;
  knob.style.transform = `translate(${dx * radius * 0.62}px, ${dy * radius * 0.62}px)`;
}
function releaseStick(e) {
  if (e.pointerId !== stickPointer) return;
  stickPointer = null;
  joy.x = 0;
  joy.y = 0;
  knob.style.transform = '';
}
stick.addEventListener('pointerdown', (e) => {
  stickPointer = e.pointerId;
  stick.setPointerCapture(e.pointerId);
  moveStick(e);
});
stick.addEventListener('pointermove', (e) => {
  if (e.pointerId === stickPointer) moveStick(e);
});
stick.addEventListener('pointerup', releaseStick);
stick.addEventListener('pointercancel', releaseStick);

// ---- buttons and text -------------------------------------------------------

for (const btn of document.querySelectorAll('[data-button]')) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.classList.add('down');
    socket.emit('player:button', { button: btn.dataset.button });
    if (navigator.vibrate) navigator.vibrate(15);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    btn.addEventListener(type, () => btn.classList.remove('down'));
  }
}

$('text-row').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('text').value.trim();
  if (!text) return;
  socket.emit('player:text', { text });
  $('text').value = '';
});

// ---- input loop -------------------------------------------------------------

// Volatile: if a packet can't be sent right away it's dropped, the next one replaces it.
setInterval(() => {
  if (!joined || !socket.connected) return;
  socket.volatile.emit('player:input', {
    jx: +joy.x.toFixed(3),
    jy: +joy.y.toFixed(3),
    tx: +tilt.x.toFixed(3),
    ty: +tilt.y.toFixed(3),
  });
}, SEND_INTERVAL_MS);

document.addEventListener('gesturestart', (e) => e.preventDefault());
