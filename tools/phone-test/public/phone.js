const $ = (id) => document.getElementById(id);
const socket = io();

// ---- device identity -------------------------------------------------------

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function guessLabel() {
  const ua = navigator.userAgent;
  let os = 'Desktop';
  if (/iPhone/.test(ua)) os = 'iPhone';
  else if (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1) os = 'iPad';
  else if (/Android/.test(ua)) os = 'Android';
  let browser = 'browser';
  if (/SamsungBrowser/.test(ua)) browser = 'Samsung';
  else if (/CriOS|Chrome/.test(ua)) browser = 'Chrome';
  else if (/FxiOS|Firefox/.test(ua)) browser = 'Firefox';
  else if (/Safari/.test(ua)) browser = 'Safari';
  return `${os} ${browser}`;
}

let deviceId = storageGet('phoneTestDeviceId');
if (!deviceId) {
  deviceId = randomId();
  storageSet('phoneTestDeviceId', deviceId);
}
let label = storageGet('phoneTestLabel') || `${guessLabel()} #${deviceId.slice(0, 4)}`;
$('device-label').textContent = `${label} ✎`;
$('device-label').onclick = () => {
  const name = prompt('Name this device (e.g. "Ana iPhone 13")', label);
  if (!name) return;
  label = name.slice(0, 60);
  storageSet('phoneTestLabel', label);
  $('device-label').textContent = `${label} ✎`;
  hello();
};

function hello() {
  socket.emit('device:hello', { deviceId, label, ua: navigator.userAgent });
}

// Last result per test, re-sent after a reconnect.
const results = {};

function report(name, ok, value) {
  results[name] = { name, ok, value };
  const btn = document.querySelector(`[data-test="${name}"]`);
  btn.classList.remove('ok', 'fail', 'warn');
  btn.classList.add(ok === true ? 'ok' : ok === false ? 'fail' : 'warn');
  $(`s-${name}`).textContent = value;
  socket.emit('result', { name, ok, value });
}

let config = { voiceEnabled: false, models: [] };

socket.on('connect', () => {
  $('conn').textContent = '● online';
  $('conn').className = 'on';
  hello();
  for (const r of Object.values(results)) socket.emit('result', r);
});
socket.on('disconnect', () => {
  $('conn').textContent = '● offline';
  $('conn').className = 'off';
});
socket.on('config', (c) => {
  config = c;
  $('voice-off').classList.toggle('hidden', c.voiceEnabled);
  $('voice-on').classList.toggle('hidden', !c.voiceEnabled);
  $('voice-model').innerHTML = c.models.map((m) => `<option>${m}</option>`).join('');
});

// ---- panel switching -------------------------------------------------------

function showPanel(name) {
  for (const s of document.querySelectorAll('[data-panel]')) s.classList.toggle('hidden', s.dataset.panel !== name);
  for (const b of document.querySelectorAll('[data-test]')) b.classList.toggle('active', b.dataset.test === name);
}
for (const b of document.querySelectorAll('[data-test]')) {
  b.addEventListener('click', () => {
    showPanel(b.dataset.test);
    if (b.dataset.test === 'vibrate') testVibrate();
    if (b.dataset.test === 'touch') touchInfo();
  });
}

// iOS Safari ignores user-scalable=no, so block pinch and double-tap zoom here too.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// ---- 1. HTTPS --------------------------------------------------------------

function testHttps() {
  const secure = window.isSecureContext;
  $('https-secure').textContent = `secure: ${secure ? 'yes' : 'no'}`;
  $('https-proto').textContent = location.protocol;
  $('https-ua').textContent = navigator.userAgent;
  report('https', secure, `secure: ${secure ? 'yes' : 'no'} | ${navigator.userAgent}`);
}
testHttps();
showPanel('https');

// ---- 2. Motion -------------------------------------------------------------

let shakePeak = 0;
let motionEvents = 0;
let orientationEvents = 0;
let lastMotionReport = 0;

$('motion-btn').addEventListener('click', async () => {
  const status = $('motion-status');
  // requestPermission must be called straight from the tap, before any await.
  const needsPermission = typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
  let perms = ['not needed'];
  if (needsPermission) {
    const requests = [DeviceMotionEvent.requestPermission()];
    if (typeof DeviceOrientationEvent.requestPermission === 'function') requests.push(DeviceOrientationEvent.requestPermission());
    try {
      perms = await Promise.all(requests);
    } catch (err) {
      status.textContent = `Permission error: ${err.message}`;
      return report('motion', false, `permission error: ${err.message}`);
    }
    if (perms.some((p) => p !== 'granted')) {
      status.textContent = `Permission: ${perms.join(', ')}`;
      return report('motion', false, `permission: ${perms.join(', ')}`);
    }
  }
  status.textContent = `Permission: ${perms.join(', ')}. Waiting for events…`;
  window.addEventListener('deviceorientation', onOrientation);
  window.addEventListener('devicemotion', onMotion);
  setTimeout(() => {
    const ok = orientationEvents > 0 && motionEvents > 0;
    status.textContent = `Permission: ${perms.join(', ')}. Orientation events: ${orientationEvents}, motion events: ${motionEvents}`;
    report('motion', ok, ok ? `events ok (permission ${perms.join('/')}), shake peak ${shakePeak.toFixed(1)}` : `no events after 2s (orientation ${orientationEvents}, motion ${motionEvents})`);
  }, 2000);
});

function onOrientation(e) {
  orientationEvents++;
  $('tilt-beta').textContent = e.beta == null ? 'null' : `${e.beta.toFixed(0)}°`;
  $('tilt-gamma').textContent = e.gamma == null ? 'null' : `${e.gamma.toFixed(0)}°`;
}

function onMotion(e) {
  motionEvents++;
  // Shake strength in m/s², gravity removed when the browser gives us that.
  let strength = 0;
  const a = e.acceleration;
  if (a && a.x != null) {
    strength = Math.hypot(a.x, a.y, a.z);
  } else if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.x != null) {
    const g = e.accelerationIncludingGravity;
    strength = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
  }
  shakePeak = Math.max(shakePeak, strength);
  $('shake-now').textContent = strength.toFixed(1);
  $('shake-peak').textContent = shakePeak.toFixed(1);
  const now = Date.now();
  if (now - lastMotionReport > 3000 && shakePeak > 0) {
    lastMotionReport = now;
    report('motion', true, `events ok, shake peak ${shakePeak.toFixed(1)} m/s²`);
  }
}

// ---- 3. Wake lock ----------------------------------------------------------

let wakeLock = null;
let wantWakeLock = false;
let wakeLockReacquired = 0;

async function requestWakeLock(isRetry) {
  const out = $('wakelock-status');
  if (!('wakeLock' in navigator)) {
    out.textContent = 'not supported';
    return report('wakelock', false, 'not supported');
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    if (isRetry) wakeLockReacquired++;
    out.textContent = 'active';
    report('wakelock', true, `active${wakeLockReacquired ? `, re-acquired ${wakeLockReacquired}x` : ''}`);
    wakeLock.addEventListener('release', () => {
      out.textContent = 'released';
      report('wakelock', null, 'released (waiting to re-acquire)');
    });
  } catch (err) {
    out.textContent = `error: ${err.name}`;
    report('wakelock', false, `${err.name}: ${err.message}`);
  }
}

$('wakelock-btn').addEventListener('click', () => {
  wantWakeLock = true;
  requestWakeLock(false);
});
document.addEventListener('visibilitychange', () => {
  if (wantWakeLock && document.visibilityState === 'visible') requestWakeLock(true);
});

// ---- 4. Touch --------------------------------------------------------------

const touchArea = $('touch-area');
const dots = new Map();
let maxTouches = 0;

function touchInfo() {
  $('touch-info').textContent = `maxTouchPoints: ${navigator.maxTouchPoints}`;
}

function drawTouches(e) {
  e.preventDefault();
  const rect = touchArea.getBoundingClientRect();
  const seen = new Set();
  for (const t of e.touches) {
    seen.add(t.identifier);
    let dot = dots.get(t.identifier);
    if (!dot) {
      dot = document.createElement('div');
      dot.className = 'dot';
      touchArea.appendChild(dot);
      dots.set(t.identifier, dot);
    }
    dot.style.left = `${t.clientX - rect.left}px`;
    dot.style.top = `${t.clientY - rect.top}px`;
  }
  for (const [id, dot] of dots) {
    if (!seen.has(id)) {
      dot.remove();
      dots.delete(id);
    }
  }
  let i = 1;
  for (const dot of dots.values()) dot.textContent = i++;
  if (e.touches.length > maxTouches) {
    maxTouches = e.touches.length;
    report('touch', true, `max simultaneous touches: ${maxTouches} (maxTouchPoints ${navigator.maxTouchPoints})`);
  }
}
for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
  touchArea.addEventListener(type, drawTouches, { passive: false });
}

// ---- 5. Vibration ----------------------------------------------------------

function testVibrate() {
  const supported = typeof navigator.vibrate === 'function';
  $('vibrate-supported').textContent = `supported: ${supported ? 'yes' : 'no'}`;
  report('vibrate', supported, `supported: ${supported ? 'yes' : 'no'}`);
}
$('vibrate-btn').addEventListener('click', () => {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(200);
});

// ---- 6. Latency ------------------------------------------------------------

let avgRtt = null;

function ping() {
  return new Promise((resolve) => {
    const t0 = performance.now();
    socket.timeout(3000).emit('latency:ping', (err) => resolve(err ? null : performance.now() - t0));
  });
}

$('latency-btn').addEventListener('click', async () => {
  const btn = $('latency-btn');
  btn.disabled = true;
  const times = [];
  let lost = 0;
  for (let i = 0; i < 20; i++) {
    const rtt = await ping();
    if (rtt === null) lost++;
    else times.push(rtt);
    $('latency-avg').textContent = `${i + 1}/20…`;
  }
  btn.disabled = false;
  if (!times.length) {
    $('latency-avg').textContent = 'all lost';
    return report('latency', false, 'all 20 pings lost');
  }
  avgRtt = times.reduce((a, b) => a + b, 0) / times.length;
  const detail = `min ${Math.min(...times).toFixed(0)} / max ${Math.max(...times).toFixed(0)} ms, lost ${lost}`;
  $('latency-avg').textContent = `${avgRtt.toFixed(0)} ms avg`;
  $('latency-detail').textContent = detail;
  report('latency', avgRtt < 150 && lost === 0 ? true : null, `avg ${avgRtt.toFixed(0)} ms, ${detail}`);
});

// ---- 7. Voice --------------------------------------------------------------

let pendingVoice = null;

for (const b of document.querySelectorAll('[data-sample]')) {
  b.addEventListener('click', () => { $('voice-text').value = b.dataset.sample; });
}

$('voice-btn').addEventListener('click', () => {
  if (!config.voiceEnabled) return;
  const text = $('voice-text').value.trim();
  if (!text) return;
  const modelId = $('voice-model').value;
  pendingVoice = { t0: performance.now(), modelId, text, id: null };
  $('voice-result').textContent = 'generating…';
  $('voice-detail').textContent = '';
  socket.emit('voice:speak', { text, modelId }, (res) => {
    if (res.error) {
      $('voice-result').textContent = 'error';
      $('voice-detail').textContent = res.error;
      pendingVoice = null;
      return report('voice', false, res.error);
    }
    if (pendingVoice) pendingVoice.id = res.id;
  });
});

socket.on('voice:timing', ({ id, modelId, firstByteMs, playingMs }) => {
  if (!pendingVoice || pendingVoice.id !== id) return;
  const roundTrip = performance.now() - pendingVoice.t0;
  // roundTrip includes the trip back to this phone, which isn't part of what we want to measure.
  const returnHop = avgRtt != null ? avgRtt / 2 : 0;
  const pressToPlay = roundTrip - returnHop;
  $('voice-result').textContent = `${pressToPlay.toFixed(0)} ms to playback`;
  $('voice-detail').textContent =
    `${modelId}. ElevenLabs first byte ${firstByteMs} ms, laptop started playing ${playingMs} ms after the server got the text. ` +
    (avgRtt != null ? `Return hop of ~${returnHop.toFixed(0)} ms subtracted (run the latency test for a better estimate).` : 'Run the latency test first for a more accurate number.');
  const tags = /\[[^\]]+\]/.test(pendingVoice.text) ? ' (with audio tags: listen for them on the laptop)' : '';
  report('voice', true, `${modelId}: ${pressToPlay.toFixed(0)} ms press to playback, first byte ${firstByteMs} ms${tags}`);
  pendingVoice = null;
});

socket.on('voice:error', ({ id, error }) => {
  if (pendingVoice && pendingVoice.id && pendingVoice.id !== id) return;
  $('voice-result').textContent = 'error';
  $('voice-detail').textContent = error;
  report('voice', false, error);
  pendingVoice = null;
});
