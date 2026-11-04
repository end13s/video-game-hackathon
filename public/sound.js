// TV sound design: effects, music and crowd reactions. tv.js plays everything that's spoken;
// this file only adds sound around it.
//
// In tv.html, before tv.js:   <script src="/sound.js"></script>
// In tv.js, after io():        PressAudio.attach(socket);
//
// Sound effects by hand: PressAudio.sfx('gasp'). Names are the files in public/audio/.
(function () {
  // ---- sounds -------------------------------------------------------------------
  // name -> volume (0..1). Files are public/audio/<name>.mp3, made by `npm run audio:sfx`.
  const VOLUME = {
    shutter: 0.5, murmur: 0.18, boo: 0.45, gasp: 0.55, laugh: 0.45, applause: 0.55,
    sting: 0.7, countdown: 0.5, join: 0.6, intro: 0.3, victory: 0.55,
  };
  const MURMUR_UNDER_SPEECH = 0.06; // crowd volume while someone is on stage
  const REACTIONS = ['laugh', 'laugh', 'gasp', 'applause', 'boo'];
  const TIMED = ['ask', 'pick', 'sabotage', 'answer']; // phases with a countdown
  const COUNTDOWN_MS = 5000; // length of countdown.mp3, it starts this long before the timer ends

  let socket = null;
  const sfxCache = new Map();
  const loops = new Map(); // name -> Audio, for murmur and music

  function sfx(name, volume) {
    let base = sfxCache.get(name);
    if (!base) {
      base = Object.assign(new Audio(`/audio/${name}.mp3`), { preload: 'auto' });
      sfxCache.set(name, base);
    }
    // Clone so the same sound can overlap itself.
    const a = base.cloneNode();
    a.volume = volume ?? VOLUME[name] ?? 0.5;
    a.play().catch(() => {});
    return a;
  }

  function loop(name, on, volume) {
    let a = loops.get(name);
    if (!on) {
      if (a && !a.paused) fade(a, 0, 800, () => a.pause());
      else if (a) a.volume = 0; // never started (sound still locked), so don't start it on unlock
      return;
    }
    if (!a) {
      a = Object.assign(new Audio(`/audio/${name}.mp3`), { loop: true, volume: 0 });
      loops.set(name, a);
    }
    if (a.paused) {
      a.volume = 0;
      a.play().catch(() => {});
    }
    fade(a, volume ?? VOLUME[name] ?? 0.3, 800);
  }

  function fade(a, to, ms, done) {
    clearInterval(a._fade);
    const from = a.volume;
    const start = performance.now();
    a._fade = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / ms);
      a.volume = from + (to - from) * t;
      if (t === 1) {
        clearInterval(a._fade);
        if (done) done();
      }
    }, 40);
  }

  // Browsers block sound until the page has been clicked once. Any click or key unlocks
  // it, then whatever should be looping starts.
  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    for (const [name, a] of loops) if (a.paused && a.volume > 0) loop(name, true);
    if (lastPhase === 'lobby') loop('intro', true);
  }
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);

  // ---- game events --------------------------------------------------------------

  let lastPhase = null;
  let lastPlayerCount = 0;
  let countdownTimer = null;
  let countdownSound = null;

  function onState(state) {
    const phase = state.phase;
    const changed = phase !== lastPhase;

    // Join chime for every new player in the lobby.
    if (phase === 'lobby' && lastPhase === 'lobby' && state.players.length > lastPlayerCount) sfx('join');
    lastPlayerCount = state.players.length;

    // Countdown before a timed phase closes. Rescheduled on every state, since
    // the server resends the remaining time.
    clearTimeout(countdownTimer);
    if (TIMED.includes(phase) && state.remainingMs != null) {
      const wait = state.remainingMs - COUNTDOWN_MS;
      if (wait > 0) countdownTimer = setTimeout(() => (countdownSound = sfx('countdown')), wait);
    }
    if (changed && countdownSound) {
      countdownSound.pause();
      countdownSound = null;
    }

    if (!changed) return;
    lastPhase = phase;

    loop('intro', phase === 'lobby');
    if (['ask', 'pick', 'question', 'sabotage', 'answer'].includes(phase)) loop('murmur', true);
    else if (phase === 'hearing') loop('murmur', true, MURMUR_UNDER_SPEECH);
    else loop('murmur', false);

    if (phase === 'news') sfx('sting', 0.4);
    if (phase === 'final') {
      sfx('sting');
      setTimeout(() => sfx('applause'), 500);
      setTimeout(() => sfx('victory'), 1200);
    }
  }

  function attach(s) {
    socket = s;
    socket.on('game:state', onState);
    socket.on('question:ask', () => sfx('shutter'));
    socket.on('hearing:line', () => sfx('shutter', 0.25));

    // The crowd reacts when an answer finishes. tv.js reports that with hearing:done.
    const emit = socket.emit.bind(socket);
    socket.emit = (event, ...args) => {
      if (event === 'hearing:done') sfx(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]);
      return emit(event, ...args);
    };

    // Preload the short effects so the first one isn't late.
    for (const name of Object.keys(VOLUME)) if (!['murmur', 'intro', 'victory'].includes(name)) sfx(name, 0).pause();
  }

  window.PressAudio = { attach, sfx, loop };
})();
