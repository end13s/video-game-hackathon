// TV audio: sound effects, music, the anchor, and the spoken-line queue.
// It plays audioUrl from question:ask and hearing:line and sends question:done /
// hearing:done when each one ends, so tv.js must not play those itself.
//
// In tv.html, before tv.js:   <script src="/sound.js"></script>
// In tv.js, after io():        PressAudio.attach(socket);
//
// Subtitles: by default it shows its own subtitle bar at the bottom of the screen. To draw
// them yourself, pass callbacks instead:
//   PressAudio.attach(socket, {
//     onSubtitle({ kind, speaker, text, playerId }) {},   // kind: 'question' | 'hearing' | 'anchor'
//     onSubtitleEnd() {},
//   });
// Sound effects by hand: PressAudio.sfx('gasp'). Names are the files in public/audio/.
(function () {
  // ---- content: anchor lines ----------------------------------------------------
  // {name} is a character name. Square brackets are ElevenLabs audio tags.
  const ANCHOR = {
    roundResult: [
      'And the people have spoken... {name} takes the round!',
      '[excited] Well, well, well. {name} wins this one!',
      'A stunning performance from {name}. The press room is in shock.',
      '[laughs] {name}, somehow, gets away with it!',
    ],
    tie: ['A tie! Nobody wins, which is very on brand for politics.', '[sighs] A tie. Nobody learned anything.'],
    noVotes: ['Not a single vote. [sighs] Democracy is tired tonight.'],
    final: [
      '[excited] Ladies and gentlemen, your new leader of the free world... {name}! God help us all.',
      'The votes are in, the scandals are out. {name} wins the press conference!',
    ],
  };

  // ---- sounds -------------------------------------------------------------------
  // name -> volume (0..1). Files are public/audio/<name>.mp3, made by `npm run audio:sfx`.
  const VOLUME = {
    shutter: 0.7, murmur: 0.25, boo: 0.5, gasp: 0.6, laugh: 0.5, applause: 0.6,
    sting: 0.8, countdown: 0.6, join: 0.6, intro: 0.35, victory: 0.6,
  };
  const SPEECH_VOLUME = 1;
  const REACTIONS = ['laugh', 'laugh', 'gasp', 'applause', 'boo'];
  const COUNTDOWN_MS = 5000; // length of countdown.mp3, it starts this long before the timer ends
  const MAX_LINE_MS = 25000; // give up on a line that never ends
  const PAUSE_AFTER_LINE_MS = 700;

  let socket = null;
  let opts = {};
  let voiceEnabled = false;
  const sfxCache = new Map();
  const loops = new Map(); // name -> Audio, for murmur and music

  function sfx(name, volume) {
    let base = sfxCache.get(name);
    if (!base) {
      base = new Audio(`/audio/${name}.mp3`);
      base.preload = 'auto';
      sfxCache.set(name, base);
    }
    // Clone so the same sound can overlap itself.
    const a = base.cloneNode();
    a.volume = volume ?? VOLUME[name] ?? 0.6;
    a.play().catch(() => {});
    return a;
  }

  function loop(name, on, volume) {
    let a = loops.get(name);
    if (!on) {
      if (a) fade(a, 0, 800, () => a.pause());
      return;
    }
    if (!a) {
      a = new Audio(`/audio/${name}.mp3`);
      a.loop = true;
      loops.set(name, a);
    }
    const target = volume ?? VOLUME[name] ?? 0.3;
    if (a.paused) {
      a.volume = 0;
      a.play().catch(() => {});
    }
    fade(a, target, 800);
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

  // Browsers block sound until the page has been clicked once. Any click or key unlocks it.
  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    const silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
    silent.play().catch(() => {});
    for (const a of loops.values()) if (!a.paused || a.volume > 0) a.play().catch(() => {});
    if (lastPhase === 'lobby') loop('intro', true);
  }
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);

  // ---- subtitles ----------------------------------------------------------------

  let bar = null;
  function showSubtitle(line) {
    if (opts.onSubtitle) return opts.onSubtitle(line);
    if (!bar) {
      bar = document.createElement('div');
      bar.style.cssText =
        'position:fixed;left:50%;bottom:6vh;transform:translateX(-50%);max-width:80vw;padding:18px 32px;' +
        'border-radius:16px;background:rgba(0,0,0,.82);color:#fff;font:600 clamp(24px,3.2vw,52px)/1.25 system-ui,sans-serif;' +
        'text-align:center;z-index:1000;pointer-events:none;box-shadow:0 10px 40px rgba(0,0,0,.5)';
      document.body.appendChild(bar);
    }
    const speaker = document.createElement('div');
    speaker.style.cssText = 'font-size:.55em;opacity:.7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px';
    speaker.textContent = line.speaker || '';
    const text = document.createElement('div');
    // Audio tags are for the voice, not for reading.
    text.textContent = line.text.replace(/\[[^\]]*\]\s*/g, '');
    bar.replaceChildren(speaker, text);
    bar.style.display = '';
  }
  function hideSubtitle() {
    if (opts.onSubtitleEnd) return opts.onSubtitleEnd();
    if (bar) bar.style.display = 'none';
  }

  // ---- speech queue -------------------------------------------------------------
  // One voice at a time. Game lines (question, hearing) cut off whatever is playing,
  // because the server has already moved on; anchor lines wait their turn.

  const voice = new Audio();
  const queue = [];
  let current = null;

  function say(item, { interrupt = false } = {}) {
    if (interrupt) {
      queue.length = 0;
      if (current) finish(current, false);
    }
    queue.push(item);
    if (!current) next();
  }

  function next() {
    const item = queue.shift();
    if (!item) return;
    current = item;
    showSubtitle(item);
    if (loops.get('murmur')) fade(loops.get('murmur'), 0.08, 400);

    const end = () => finish(item, true);
    // Without audio, leave the subtitle up for about as long as it would take to say it.
    const readMs = Math.min(MAX_LINE_MS, 2000 + item.text.length * 65);
    item.timer = setTimeout(end, item.url ? MAX_LINE_MS : readMs);
    if (!item.url) return;

    voice.src = item.url;
    voice.volume = SPEECH_VOLUME;
    voice.onended = end;
    voice.onerror = () => {
      clearTimeout(item.timer);
      item.timer = setTimeout(end, readMs);
    };
    voice.play().catch(() => voice.onerror());
  }

  function finish(item, natural) {
    if (current !== item) return;
    clearTimeout(item.timer);
    voice.onended = voice.onerror = null;
    voice.pause();
    current = null;
    hideSubtitle();
    if (loops.get('murmur') && ['hearing', 'vote', 'question', 'answer'].includes(lastPhase)) fade(loops.get('murmur'), VOLUME.murmur, 800);
    if (natural && item.onEnd) item.onEnd();
    next();
  }

  async function anchorSay(key, name) {
    const list = ANCHOR[key];
    const text = list[Math.floor(Math.random() * list.length)].replace('{name}', name || '');
    let url = null;
    if (voiceEnabled) {
      try {
        const res = await fetch('/api/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: 'anchor' }),
        });
        if (res.ok) url = (await res.json()).url;
      } catch {}
    }
    say({ kind: 'anchor', speaker: 'Anchor', text, url });
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
    if (phase === 'lobby' && state.players.length > lastPlayerCount && lastPhase !== null) sfx('join');
    lastPlayerCount = state.players.length;

    // Countdown before answering or voting closes. Rescheduled on every state, since
    // the server resends the remaining time.
    clearTimeout(countdownTimer);
    if ((phase === 'answer' || phase === 'vote') && state.remainingMs != null) {
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

    if (phase === 'lobby') {
      queue.length = 0;
      if (current) finish(current, false);
      loop('murmur', false);
      loop('intro', true);
    } else {
      loop('intro', false);
    }

    if (['question', 'answer', 'hearing', 'vote'].includes(phase)) loop('murmur', true);

    if (phase === 'results' || phase === 'final') {
      loop('murmur', false);
      const { votes = {}, winners = [] } = state.results || {};
      sfx('sting');
      setTimeout(() => sfx('applause'), 600);
      if (phase === 'final') {
        setTimeout(() => sfx('victory'), 1200);
        const top = [...state.players].sort((a, b) => b.score - a.score)[0];
        anchorSay('final', top ? nameOf(state, top.id) : '');
      } else if (!Object.keys(votes).length) {
        anchorSay('noVotes');
      } else if (winners.length > 1) {
        anchorSay('tie');
      } else {
        anchorSay('roundResult', nameOf(state, winners[0]));
      }
    }

    if (phase === 'vote' && from === 'hearing') sfx('sting', 0.5);
  }

  function onQuestion({ round, text, journalist, audioUrl }) {
    sfx('shutter');
    // Let the shutters land before the journalist talks.
    setTimeout(() => {
      say(
        {
          kind: 'question',
          speaker: journalist ? `${journalist.name}, ${journalist.outlet}` : 'Question',
          text,
          url: audioUrl,
          onEnd: () => socket.emit('question:done', { round }),
        },
        { interrupt: true },
      );
    }, 900);
  }

  function onHearing({ index, playerId, character, text, audioUrl }) {
    say(
      {
        kind: 'hearing',
        speaker: character ? character.name : '',
        playerId,
        text,
        url: audioUrl,
        onEnd: () => {
          sfx(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]);
          setTimeout(() => socket.emit('hearing:done', { index }), PAUSE_AFTER_LINE_MS);
        },
      },
      { interrupt: true },
    );
  }

  function attach(s, options = {}) {
    socket = s;
    opts = options;
    fetch('/config')
      .then((r) => r.json())
      .then((c) => (voiceEnabled = Boolean(c.voiceEnabled)))
      .catch(() => {});
    socket.on('game:state', onState);
    socket.on('question:ask', onQuestion);
    socket.on('hearing:line', onHearing);
    // Preload the short effects so the first one isn't late.
    for (const name of Object.keys(VOLUME)) if (!['murmur', 'intro', 'victory'].includes(name)) sfxCache.set(name, Object.assign(new Audio(`/audio/${name}.mp3`), { preload: 'auto' }));
  }

  window.PressAudio = { attach, sfx, loop, say, anchorSay, unlock };
})();
