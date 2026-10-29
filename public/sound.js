// TV sound design: effects, music, crowd reactions and the anchor. tv.js keeps playing
// the question and answer audio; this file only adds sound around it.
//
// In tv.html, before tv.js:   <script src="/sound.js"></script>
// In tv.js, after io():        PressAudio.attach(socket);
//
// The anchor's lines get their own subtitle bar. To draw them yourself, pass callbacks:
//   PressAudio.attach(socket, { onSubtitle({ speaker, text }) {}, onSubtitleEnd() {} });
// Sound effects by hand: PressAudio.sfx('gasp'). Names are the files in public/audio/.
(function () {
  // ---- content: anchor lines ----------------------------------------------------
  // {name} is a character name. Square brackets are ElevenLabs audio tags.
  // roundResult: the press rated the answer well. flop: they didn't.
  const ANCHOR = {
    roundResult: [
      'And the press has spoken... {name} takes the round!',
      '[excited] Well, well, well. {name} survives this one!',
      'A stunning performance from {name}. The press room is in shock.',
      '[laughs] {name}, somehow, gets away with it!',
    ],
    flop: [
      '[sighs] Oof. {name} did not dodge that one.',
      'The press room is not buying it, {name}.',
      '[laughs] That answer from {name} will be on every front page tomorrow.',
    ],
    noVotes: ['Not a single rating. [sighs] Democracy is tired tonight.'],
    final: [
      '[excited] Ladies and gentlemen, your new leader of the free world... {name}! God help us all.',
      'The votes are in, the scandals are out. {name} wins the press conference!',
    ],
  };

  // ---- sounds -------------------------------------------------------------------
  // name -> volume (0..1). Files are public/audio/<name>.mp3, made by `npm run audio:sfx`.
  const VOLUME = {
    shutter: 0.5, murmur: 0.18, boo: 0.45, gasp: 0.55, laugh: 0.45, applause: 0.55,
    sting: 0.7, countdown: 0.5, join: 0.6, intro: 0.3, victory: 0.55,
  };
  const MURMUR_UNDER_SPEECH = 0.06; // crowd volume while someone is on stage
  const REACTIONS = ['laugh', 'laugh', 'gasp', 'applause', 'boo'];
  const TIMED = ['ask', 'pick', 'sabotage', 'answer', 'rate']; // phases with a countdown
  const COUNTDOWN_MS = 5000; // length of countdown.mp3, it starts this long before the timer ends
  const MAX_LINE_MS = 20000; // give up on an anchor line that never ends

  let socket = null;
  let opts = {};
  let voiceEnabled = false;
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

  // ---- anchor -------------------------------------------------------------------

  let bar = null;
  function showSubtitle(line) {
    if (opts.onSubtitle) return opts.onSubtitle(line);
    if (!bar) {
      bar = document.createElement('div');
      bar.style.cssText =
        'position:fixed;left:50%;bottom:9vh;transform:translateX(-50%);max-width:80vw;padding:18px 32px;' +
        'border-radius:16px;background:rgba(0,0,0,.85);color:#fff;font:600 clamp(24px,3vw,48px)/1.25 system-ui,sans-serif;' +
        'text-align:center;z-index:1000;pointer-events:none;box-shadow:0 10px 40px rgba(0,0,0,.5)';
      document.body.appendChild(bar);
    }
    const speaker = document.createElement('div');
    speaker.style.cssText = 'font-size:.5em;opacity:.7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px';
    speaker.textContent = line.speaker;
    const text = document.createElement('div');
    text.textContent = line.text;
    bar.replaceChildren(speaker, text);
    bar.style.display = '';
  }
  function hideSubtitle() {
    if (opts.onSubtitleEnd) return opts.onSubtitleEnd();
    if (bar) bar.style.display = 'none';
  }

  const anchorVoice = new Audio();
  let anchorTimer = null;
  let anchorToken = 0;

  function stopAnchor() {
    anchorToken++;
    clearTimeout(anchorTimer);
    anchorVoice.onended = anchorVoice.onerror = null;
    anchorVoice.pause();
    hideSubtitle();
  }

  async function anchorSay(key, name) {
    stopAnchor();
    const token = anchorToken;
    const list = ANCHOR[key];
    const speech = list[Math.floor(Math.random() * list.length)].replace('{name}', name || '');
    const text = speech.replace(/\[[^\]]*\]\s*/g, ''); // tags are for the voice only
    let url = null;
    if (voiceEnabled) {
      try {
        const res = await fetch('/api/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: speech, voice: 'anchor' }),
        });
        if (res.ok) url = (await res.json()).url;
      } catch {}
    }
    if (token !== anchorToken) return; // something newer started meanwhile

    showSubtitle({ speaker: 'Anchor', text });
    const readMs = Math.min(MAX_LINE_MS, 2000 + text.length * 65);
    anchorTimer = setTimeout(stopAnchor, url ? MAX_LINE_MS : readMs);
    if (!url) return;
    anchorVoice.src = url;
    anchorVoice.onended = stopAnchor;
    anchorVoice.onerror = () => {
      clearTimeout(anchorTimer);
      anchorTimer = setTimeout(stopAnchor, readMs);
    };
    anchorVoice.play().catch(() => anchorVoice.onerror && anchorVoice.onerror());
  }

  // ---- game events --------------------------------------------------------------

  let lastPhase = null;
  let lastPlayerCount = 0;
  let countdownTimer = null;
  let countdownSound = null;

  const nameOf = (state, id) => {
    const p = state.players.find((pl) => pl.id === id);
    return p ? (p.character ? p.character.name : p.name) : 'Someone';
  };

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
    const from = lastPhase;
    lastPhase = phase;
    if (from === 'results' || from === 'final') stopAnchor();

    loop('intro', phase === 'lobby');
    if (['ask', 'pick', 'question', 'sabotage', 'answer', 'rate'].includes(phase)) loop('murmur', true);
    else if (phase === 'hearing') loop('murmur', true, MURMUR_UNDER_SPEECH);
    else loop('murmur', false);

    if (phase === 'rate' && from === 'hearing') sfx('sting', 0.4);

    if (phase === 'results' || phase === 'final') {
      const { rating = {} } = state.results || {};
      const politician = nameOf(state, state.politicianId);
      sfx('sting');
      setTimeout(() => sfx('applause'), 500);
      if (phase === 'final') {
        setTimeout(() => sfx('victory'), 1200);
        const top = [...state.players].sort((a, b) => b.score - a.score)[0];
        setTimeout(() => anchorSay('final', top ? nameOf(state, top.id) : ''), 1500);
      } else if (!rating.count) {
        setTimeout(() => anchorSay('noVotes'), 1200);
      } else {
        setTimeout(() => anchorSay(rating.average >= 3.5 ? 'roundResult' : 'flop', politician), 1200);
      }
    }
  }

  function attach(s, options = {}) {
    socket = s;
    opts = options;
    fetch('/config')
      .then((r) => r.json())
      .then((c) => (voiceEnabled = Boolean(c.voiceEnabled)))
      .catch(() => {});
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

  window.PressAudio = { attach, sfx, loop, anchorSay };
})();
