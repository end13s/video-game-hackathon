# Cheatsheet

Short snippets for the night. Versions in this repo: Phaser 3.90, Socket.io 4.8, Express 5.

## Phaser 3 + Matter.js

Docs: [Matter concepts](https://docs.phaser.io/phaser/concepts/physics/matter) · [Matter factory API (v3)](https://docs.phaser.io/api-documentation/3.88.2/class/physics-matter-factory). The docs site defaults to Phaser 4; make sure you're reading v3 pages.

`phaser.min.js` already includes Matter. Serve it with:

```js
app.use('/lib/phaser', express.static(path.join(__dirname, 'node_modules', 'phaser', 'dist')));
```

```html
<script src="/lib/phaser/phaser.min.js"></script>
```

**Config**

```js
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1920, height: 1080 },
  physics: { default: 'matter', matter: { gravity: { x: 0, y: 0 }, debug: false } },
  scene: MyScene,
});
```

**Create bodies**

```js
create() {
  this.matter.world.setBounds(0, 0, 1920, 1080);

  // Body only (no sprite), handy for walls and sensors
  const wall = this.matter.add.rectangle(960, 540, 400, 40, { isStatic: true });

  // Sprite with a physics body
  this.ship = this.matter.add.image(200, 540, 'ship', null, { frictionAir: 0.05 });

  // Any game object, e.g. a plain circle shape
  const dot = this.add.circle(300, 300, 24, 0xff0000);
  this.matter.add.gameObject(dot, { shape: { type: 'circle', radius: 24 } });

  // Sensor: detects overlaps, doesn't push
  const goal = this.matter.add.rectangle(1800, 540, 100, 300, { isStatic: true, isSensor: true, label: 'goal' });
}
```

**Move: force or velocity**

```js
update() {
  // Force is tiny, it's scaled by mass. Start around 0.001–0.01.
  this.ship.applyForce(new Phaser.Math.Vector2(steer.x * 0.005, steer.y * 0.005));

  // Or set velocity directly (px per step)
  this.ship.setVelocity(steer.x * 6, steer.y * 6);
  this.ship.setAngularVelocity(0);
}
```

**Collisions**

```js
// Every collision in the world
this.matter.world.on('collisionstart', (event) => {
  for (const { bodyA, bodyB } of event.pairs) {
    if (bodyA.label === 'goal' || bodyB.label === 'goal') reachedGoal();
  }
});

// Or per object
this.ship.setOnCollide((pair) => {
  const other = pair.bodyA === this.ship.body ? pair.bodyB : pair.bodyA;
  if (other.label === 'rock') hitRock();
});
```

## Socket.io

Docs: [Emit cheatsheet](https://socket.io/docs/v4/emit-cheatsheet/) · [Volatile events](https://socket.io/docs/v4/emitting-events/#volatile-events) · [Rooms](https://socket.io/docs/v4/rooms/)

```js
// server
io.on('connection', (socket) => {
  socket.emit('hello', { a: 1 });                 // this client only
  io.emit('phase', { phase: 'play' });            // everyone
  socket.broadcast.emit('players', list);         // everyone except this client
  socket.join('tv');                              // rooms
  io.to('tv').emit('player:text', { playerId, text });
  io.to(socket.id).emit('role:assign', { role }); // one specific client (private info)
  io.to('tv').volatile.emit('player:input', data); // may be dropped, fine for 20/s input

  // acknowledgement (request / response)
  socket.on('player:join', (data, ack) => ack({ ok: true }));
});
```

```js
// browser
const socket = io(); // same origin, served at /socket.io/socket.io.js
socket.emit('player:text', { text });
socket.volatile.emit('player:input', { tx, ty });
socket.emit('player:join', { playerId, name }, (res) => console.log(res));
const res = await socket.timeout(3000).emitWithAck('vote:cast', { targetId });
```

## DeviceOrientation (tilt)

Docs: [DeviceOrientationEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent) · [requestPermission()](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static) · [DeviceMotionEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent)

HTTPS only. On iOS the permission request must run **directly in a tap handler**, before any `await`.

```js
button.addEventListener('click', () => {
  const asks = [];
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') asks.push(DeviceOrientationEvent.requestPermission());
  if (typeof DeviceMotionEvent?.requestPermission === 'function') asks.push(DeviceMotionEvent.requestPermission());
  Promise.all(asks).then((results) => {
    if (results.every((r) => r === 'granted')) window.addEventListener('deviceorientation', onTilt);
  });
});

function onTilt(e) {
  // portrait: gamma = left/right (-90..90), beta = front/back (-180..180)
  const x = Math.max(-1, Math.min(1, (e.gamma - zero.gamma) / 30));
  const y = Math.max(-1, Math.min(1, (e.beta - zero.beta) / 30));
}
```

Shake: listen to `devicemotion` and use `Math.hypot(e.acceleration.x, e.acceleration.y, e.acceleration.z)` (m/s², gravity removed).

## Screen Wake Lock

Docs: [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)

```js
let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch (err) { console.warn(err.name, err.message); }
}
// The lock is dropped whenever the page is hidden; take it again when it's back.
document.addEventListener('visibilitychange', () => {
  if (wakeLock !== null && document.visibilityState === 'visible') keepAwake();
});
```

## ElevenLabs (server only)

Docs: [Models](https://elevenlabs.io/docs/overview/models) · [Text to speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) · [Stream speech](https://elevenlabs.io/docs/api-reference/text-to-speech/stream) · [Sound effects](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert) · [Best practices and audio tags](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)

Auth header: `xi-api-key: <ELEVENLABS_API_KEY>`. Never send the key to a browser; call from the server and send the browser a URL.

**Models** (checked Oct 28, 2026):

| Model | Use |
|---|---|
| `eleven_v4_turbo` | Real-time, expressive, audio tags. Our default for live lines |
| `eleven_v4` | Highest quality, audio tags. For pre-made lines, slower |
| `eleven_flash_v2_5` | Fastest (~75 ms), no audio tags |
| `eleven_multilingual_v2` | API default if `model_id` is left out |

**Text to speech** → MP3 bytes

```js
const res = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
  {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: '[sighs] Fine. One more question.',
      model_id: 'eleven_v4_turbo',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 }, // optional
    }),
  },
);
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const mp3 = Buffer.from(await res.arrayBuffer());
```

For lower latency use `/v1/text-to-speech/{voice_id}/stream` with the same body and pipe the chunks to the browser as they arrive. [tools/phone-test/tts.js](../tools/phone-test/tts.js) does that.

**Audio tags** (v4 / v4 Turbo): square brackets in the text, not parentheses.

- Voice: `[laughs]`, `[laughs harder]`, `[starts laughing]`, `[wheezing]`, `[sighs]`, `[exhales]`, `[whispers]`
- Emotion: `[sarcastic]`, `[curious]`, `[excited]`, `[crying]`, `[snorts]`, `[mischievously]`
- Sounds: `[applause]`, `[clapping]`, `[gulps]`, `[swallows]`
- Accent: `[strong French accent]`
- One tag per sentence part works best. Punctuation matters: `...` adds pauses, CAPS adds emphasis.
- If the tag is read out loud, the model doesn't support tags or the brackets are wrong.
- Tags work better when the voice already sounds like that. Test with the voices we pick.

**Sound effects** → MP3 bytes

```js
const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
  method: 'POST',
  headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Burst of press camera shutters and flashes in a crowded room',
    duration_seconds: 3,   // 0.5–30, optional (inferred from the prompt if left out)
    prompt_influence: 0.3, // 0–1, higher follows the prompt more closely
    loop: false,           // true for seamless loops (crowd murmur, music beds)
    model_id: 'eleven_text_to_sound_v2',
  }),
});
```

Simpler for the night: make the effects in the web app and save MP3s to `public/audio/`, then play them in Phaser:

```js
preload() { this.load.audio('boo', '/audio/boo.mp3'); }
create()  { this.sound.play('boo'); }
```

Browsers block sound until the page has been clicked once: give the TV a "Start" button.
