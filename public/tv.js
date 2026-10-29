const $ = (id) => document.getElementById(id);
const socket = io();

const DOT_RADIUS = 24;
const DOT_SPEED = 8; // px per physics step at full input

let players = [];
let voiceEnabled = false;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- join QR ----------------------------------------------------------------

fetch('/config')
  .then((r) => r.json())
  .then((config) => {
    voiceEnabled = config.voiceEnabled;
    const joinUrl = `${config.publicUrl || window.location.origin}/`;
    $('qr').src = `/qr.svg?text=${encodeURIComponent(joinUrl)}`;
    $('join-url').textContent = joinUrl;
    const host = new URL(joinUrl).hostname;
    $('url-warning').classList.toggle('hidden', !['localhost', '127.0.0.1', '::1'].includes(host));
    if (!voiceEnabled) $('speak-text').disabled = true;
  });

// ---- players and phases -----------------------------------------------------

function renderPlayers() {
  $('player-count').textContent = `(${players.length})`;
  $('players').innerHTML = players
    .map((p) => `<li class="${p.connected ? '' : 'away'}"><i style="background:${p.color}"></i>${esc(p.name)}</li>`)
    .join('');
}

function showPhase(phase) {
  $('phase-name').textContent = phase;
  for (const el of document.querySelectorAll('[data-phase]')) el.classList.toggle('hidden', el.dataset.phase !== phase);
}

socket.on('connect', () => {
  socket.emit('tv:join', (state) => {
    players = state.players;
    renderPlayers();
    showPhase(state.phase);
  });
});
socket.on('players', (msg) => {
  players = msg.players;
  renderPlayers();
});
socket.on('phase', ({ phase }) => showPhase(phase));
$('next-phase').addEventListener('click', () => socket.emit('phase:next'));

// ---- input from phones ------------------------------------------------------

// playerId -> { jx, jy, tx, ty }
const inputs = new Map();
socket.on('player:input', ({ playerId, ...input }) => inputs.set(playerId, input));

const flashes = new Map(); // playerId -> time of last button press
socket.on('player:button', ({ playerId, button }) => flashes.set(playerId, { at: performance.now(), button }));

socket.on('player:text', ({ playerId, text }) => {
  const p = players.find((pl) => pl.id === playerId);
  const div = document.createElement('div');
  div.innerHTML = `<b style="color:${p ? p.color : '#fff'}">${esc(p ? p.name : '?')}:</b> ${esc(text)}`;
  $('feed').prepend(div);
  if ($('speak-text').checked) speak(text);
});

// ---- text-to-speech playback ------------------------------------------------

const audio = new Audio();
const speakQueue = [];
let speaking = false;

// Browsers block audio until the page has been clicked once.
$('sound-btn').addEventListener('click', () => {
  audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  audio.play().catch(() => {});
  $('sound-btn').textContent = 'Sound enabled';
  $('sound-btn').classList.add('on');
});

async function speak(text, voiceId) {
  if (!voiceEnabled) return;
  const res = await fetch('/api/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceId }),
  });
  const body = await res.json();
  if (!res.ok) return console.warn('speak failed:', body.error);
  speakQueue.push(body.url);
  playNext();
}

function playNext() {
  if (speaking || !speakQueue.length) return;
  speaking = true;
  audio.src = speakQueue.shift();
  audio.onended = audio.onerror = () => {
    speaking = false;
    playNext();
  };
  audio.play().catch((err) => {
    console.warn('audio blocked, click "Enable sound":', err.message);
    speaking = false;
  });
}

// ---- Phaser: one dot per player, moved by joystick or tilt -------------------

class InputScene extends Phaser.Scene {
  constructor() {
    super('input');
    this.dots = new Map(); // playerId -> { body, label }
  }

  create() {
    this.matter.world.setBounds(0, 0, this.scale.width, this.scale.height);
    this.scale.on('resize', (size) => this.matter.world.setBounds(0, 0, size.width, size.height));
  }

  addDot(player) {
    const x = Phaser.Math.Between(100, this.scale.width - 100);
    const y = Phaser.Math.Between(100, this.scale.height - 100);
    const color = Phaser.Display.Color.HexStringToColor(player.color).color;
    const circle = this.add.circle(x, y, DOT_RADIUS, color);
    const body = this.matter.add.gameObject(circle, { shape: { type: 'circle', radius: DOT_RADIUS }, frictionAir: 0.2 });
    body.setFixedRotation();
    const label = this.add.text(x, y - DOT_RADIUS - 16, player.name, { fontSize: '16px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    const dot = { body, label };
    this.dots.set(player.id, dot);
    return dot;
  }

  update() {
    const now = performance.now();
    const ids = new Set(players.map((p) => p.id));
    for (const [id, dot] of this.dots) {
      if (!ids.has(id)) {
        dot.body.destroy();
        dot.label.destroy();
        this.dots.delete(id);
      }
    }

    for (const player of players) {
      const dot = this.dots.get(player.id) || this.addDot(player);
      const input = inputs.get(player.id) || { jx: 0, jy: 0, tx: 0, ty: 0 };
      // Joystick wins while it's being used, otherwise tilt.
      const useStick = Math.hypot(input.jx, input.jy) > 0.05;
      const ix = useStick ? input.jx : input.tx;
      const iy = useStick ? input.jy : input.ty;
      dot.body.setVelocity(ix * DOT_SPEED, iy * DOT_SPEED);

      const flash = flashes.get(player.id);
      const pressed = flash && now - flash.at < 150;
      if (pressed) dot.body.setStrokeStyle(6, 0xffffff);
      else dot.body.setStrokeStyle();
      dot.body.setAlpha(player.connected ? 1 : 0.3);
      dot.label.setText(pressed ? `${player.name} [${flash.button.toUpperCase()}]` : player.name);
      dot.label.setPosition(dot.body.x, dot.body.y - DOT_RADIUS - 16);
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0d12',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  physics: { default: 'matter', matter: { gravity: { x: 0, y: 0 } } },
  scene: InputScene,
});
