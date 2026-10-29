// Politician and reporter figures, shared by the phone and the TV. A look is a set
// of option indexes ({ skin: 2, hair: 0, ... }) for background reporters, or the values
// themselves for the politicians in content.js ({ hair: 'Swoop', skin: '#f2a65e', ... }).
// avatarSvg() draws head and shoulders; personSvg() draws a full standing figure that
// can walk and hold props.
const LOOK_OPTIONS = {
  skin: ['#f8d5b5', '#eab68c', '#c98d5e', '#a86b3c', '#7a4a28', '#4f2f1a'],
  hair: ['Bald', 'Short', 'Side part', 'Long', 'Bun', 'Pompadour', 'Mohawk'],
  hairColor: ['#1f1a17', '#5b3a21', '#a0522d', '#e2b13c', '#d9d9d9', '#c0392b'],
  suit: ['#1e2a4a', '#3a3f4b', '#7a1f2b', '#2f5233', '#e8e4d8', '#5b3f8c'],
  extra: ['None', 'Glasses', 'Mustache', 'Sunglasses', 'Beard', 'Monocle'],
  mouth: ['Smile', 'Smirk', 'Grimace', 'Shouting'],
};
const LOOK_LABELS = { skin: 'Skin', hair: 'Hair', hairColor: 'Hair colour', suit: 'Suit', extra: 'Face', mouth: 'Expression' };

function randomLook() {
  const look = {};
  for (const [key, list] of Object.entries(LOOK_OPTIONS)) look[key] = Math.floor(Math.random() * list.length);
  return look;
}

// Gradients need ids that are unique on the page, since many figures share it.
let figureCount = 0;

// Lighter (amount > 0) or darker (amount < 0) version of a #rrggbb colour.
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const mix = (c) => Math.round((target - c) * p + c);
  const [r, g, b] = [mix(n >> 16), mix((n >> 8) & 255), mix(n & 255)];
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function lookParts(look = {}) {
  const opt = (key) => {
    const v = look[key];
    if (typeof v === 'string' || Array.isArray(v)) return v;
    const list = LOOK_OPTIONS[key];
    const i = Number(v) || 0;
    return list[((i % list.length) + list.length) % list.length];
  };
  const suit = opt('suit');
  return {
    skin: opt('skin'),
    hairC: opt('hairColor'),
    suit,
    shirt: suit === '#e8e4d8' ? '#c9d6ea' : '#ffffff',
    hair: opt('hair'),
    extras: [].concat(opt('extra')),
    mouth: opt('mouth'),
    bigEars: look.ears === 'Big',
    tie: look.tie || null, // 'none' for no tie
  };
}

const hasHat = (p) => p.extras.includes('Lincoln');

// Stovepipe hat, sitting on the head (top of the head is y 21).
const TOP_HAT = `<rect x="34" y="-16" width="32" height="38" rx="2" fill="#17171b"/><rect x="34" y="-16" width="9" height="38" fill="#fff" opacity=".07"/>
  <rect x="34" y="13" width="32" height="5" fill="#3a2a1a"/><ellipse cx="50" cy="21.5" rx="26" ry="4.5" fill="#17171b"/>`;

// Shared gradients for one figure: lit face, hair sheen, suit folds, tie.
function figureDefs(p, id, tie) {
  if (p.tie && p.tie !== 'none') tie = p.tie;
  return `<defs>
    <radialGradient id="face${id}" cx="42%" cy="36%" r="70%">
      <stop offset="0" stop-color="${shade(p.skin, 0.18)}"/><stop offset=".55" stop-color="${p.skin}"/><stop offset="1" stop-color="${shade(p.skin, -0.28)}"/>
    </radialGradient>
    <linearGradient id="hair${id}" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0" stop-color="${shade(p.hairC, 0.28)}"/><stop offset=".45" stop-color="${p.hairC}"/><stop offset="1" stop-color="${shade(p.hairC, -0.35)}"/>
    </linearGradient>
    <linearGradient id="suit${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${shade(p.suit, -0.35)}"/><stop offset=".35" stop-color="${shade(p.suit, 0.12)}"/><stop offset=".7" stop-color="${p.suit}"/><stop offset="1" stop-color="${shade(p.suit, -0.4)}"/>
    </linearGradient>
    <linearGradient id="tie${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${shade(tie, 0.25)}"/><stop offset="1" stop-color="${shade(tie, -0.3)}"/>
    </linearGradient>
  </defs>`;
}

// Head and neck. Head centre is (50, 46), the neck ends at y 84.
function headSvg(p, id) {
  const hairFill = `url(#hair${id})`;
  const back = {
    Long: `<path d="M25 72 Q18 14 50 14 Q82 14 75 72 Q66 78 64 70 L36 70 Q34 78 25 72Z" fill="${hairFill}"/>`,
    Bun: `<circle cx="50" cy="13" r="9.5" fill="${hairFill}"/><circle cx="47" cy="10" r="3" fill="#fff" opacity=".18"/>`,
    Bob: `<path d="M24 66 Q16 15 50 14 Q84 15 76 66 Q70 70 66 63 L34 63 Q30 70 24 66Z" fill="${hairFill}"/>`,
    Swoop: `<path d="M25 56 Q19 30 30 20 L70 20 Q81 30 75 56Z" fill="${hairFill}"/>`,
  }[p.hair] || '';
  const front = {
    Bald: `<ellipse cx="43" cy="30" rx="9" ry="5" fill="#fff" opacity=".22"/>`,
    Short: `<path d="M27 44 Q26 17 50 16 Q74 17 73 44 Q68 30 52 29 Q36 29 27 44Z" fill="${hairFill}"/>`,
    'Side part': `<path d="M26 47 Q23 15 52 15 Q77 17 74 47 L71 33 Q60 21 41 29 Q32 33 26 47Z" fill="${hairFill}"/><path d="M41 29 Q52 20 66 24" stroke="#fff" stroke-width="1.2" opacity=".25" fill="none"/>`,
    Long: `<path d="M28 44 Q28 18 50 17 Q72 18 72 44 Q64 27 50 27 Q36 27 28 44Z" fill="${hairFill}"/>`,
    Bun: `<path d="M28 42 Q28 18 50 18 Q72 18 72 42 Q64 28 50 28 Q36 28 28 42Z" fill="${hairFill}"/>`,
    Pompadour: `<path d="M27 42 Q21 4 55 7 Q84 12 73 42 Q70 25 50 25 Q34 25 27 42Z" fill="${hairFill}"/><path d="M36 15 Q52 6 70 14" stroke="#fff" stroke-width="2" opacity=".22" fill="none"/>`,
    Mohawk: `<path d="M44 30 L45 5 L50 0 L55 5 L56 30Z" fill="${hairFill}"/>`,
    // The famous politicians' hair.
    Swoop: `<path d="M25 46 Q18 18 42 12 Q68 7 79 23 Q82 32 75 44 Q73 33 63 30 Q48 36 34 31 Q28 36 25 46Z" fill="${hairFill}"/><path d="M29 30 Q45 15 76 22" stroke="#fff" stroke-width="2.5" opacity=".3" fill="none"/><path d="M33 33 Q50 24 70 27" stroke="${shade(p.hairC, -0.3)}" stroke-width="1.2" opacity=".6" fill="none"/>`,
    Buzz: `<path d="M28 42 Q27 19 50 19 Q73 19 72 42 Q70 30 62 27.5 Q50 26 38 27.5 Q30 30 28 42Z" fill="${hairFill}"/><path d="M30 34 Q31 24 38 22" stroke="#fff" stroke-width="1.2" opacity=".25" fill="none"/>`,
    Combed: `<path d="M28 43 Q27 22 41 19 Q58 16 70 23 Q74 31 72 43 Q69 31 59 27 Q47 26 37 30 Q31 34 28 43Z" fill="${hairFill}"/><path d="M38 24 Q52 18 66 24M36 28 Q50 22 68 28" stroke="${shade(p.hairC, -0.25)}" stroke-width=".9" fill="none"/>`,
    Bob: `<path d="M27 46 Q25 16 52 16 Q77 18 73 46 Q67 27 47 28 Q36 32 27 46Z" fill="${hairFill}"/><path d="M36 24 Q50 18 66 23" stroke="#fff" stroke-width="1.6" opacity=".25" fill="none"/>`,
    Tufts: `<ellipse cx="43" cy="28" rx="9" ry="4.5" fill="#fff" opacity=".22"/><g fill="${hairFill}"><path d="M30 47 Q21 46 22.5 39 Q18 33 24.5 30 Q24 23 32 25 Q29.5 31 32.5 36 Q28 41 30 47Z"/><path d="M70 47 Q79 46 77.5 39 Q82 33 75.5 30 Q76 23 68 25 Q70.5 31 67.5 36 Q72 41 70 47Z"/></g><path d="M23 33 q-4 -2 -4.5 -7M26 27 q-1 -5 2.5 -7.5M77 33 q4 -2 4.5 -7M74 27 q1 -5 -2.5 -7.5" stroke="${hairFill}" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M42 23 Q45 15 50 21 Q54 14 58 22" stroke="${hairFill}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  }[p.hair] || '';

  const ink = '#2a1810';
  const mouth = {
    Smile: `<path d="M42 61 Q50 67.5 58 61" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M44 62.5 Q50 66 56 62.5" stroke="#fff" stroke-width="1.2" fill="none" opacity=".8"/>`,
    Smirk: `<path d="M43 62.5 Q52 64.5 58.5 58.5" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    Grimace: `<rect x="41" y="58.5" width="18" height="6.5" rx="2.5" fill="#fff" stroke="${ink}" stroke-width="1.6"/><path d="M45.5 58.5v6.5M50 58.5v6.5M54.5 58.5v6.5" stroke="${ink}" stroke-width=".8"/>`,
    Shouting: `<ellipse cx="50" cy="62" rx="6.5" ry="5.5" fill="${ink}"/><ellipse cx="50" cy="65" rx="4" ry="2" fill="#c0504d"/><path d="M45 58.5 Q50 57.5 55 58.5" stroke="#fff" stroke-width="1.4" fill="none"/>`,
    Pout: `<ellipse cx="50" cy="62" rx="4.6" ry="3.4" fill="${shade(p.skin, -0.35)}"/><ellipse cx="50" cy="62" rx="2.2" ry="1.4" fill="${ink}"/>`,
    Grin: `<path d="M40 59 Q50 71 60 59Z" fill="#fff" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/><path d="M41.5 60 Q50 62 58.5 60" stroke="${ink}" stroke-width=".8" fill="none"/>`,
    Lipstick: `<path d="M42 61 Q50 68 58 61 Q50 63.5 42 61Z" fill="#c8102e"/><path d="M42 61 Q46 58 50 59.6 Q54 58 58 61 Q50 62.4 42 61Z" fill="#a50d26"/>`,
  }[p.mouth] || '';

  const extraSvg = {
    None: '',
    Glasses: `<g fill="#9ecbff" fill-opacity=".18" stroke="#1f1a17" stroke-width="1.8"><rect x="34" y="42" width="13" height="10" rx="4"/><rect x="53" y="42" width="13" height="10" rx="4"/></g><path d="M47 46h6" stroke="#1f1a17" stroke-width="1.8"/><path d="M36 44 l4 -1" stroke="#fff" stroke-width="1" opacity=".7"/>`,
    Mustache: `<path d="M38 56.5 Q44 51 50 55 Q56 51 62 56.5 Q56 59.5 50 57.5 Q44 59.5 38 56.5Z" fill="${hairFill}"/>`,
    Sunglasses: `<g fill="#0d0d12"><rect x="32.5" y="42" width="15" height="9.5" rx="3.5"/><rect x="52.5" y="42" width="15" height="9.5" rx="3.5"/><rect x="46" y="44" width="8" height="2"/></g><path d="M35 44.5 l5 -1.2M55 44.5 l5 -1.2" stroke="#fff" stroke-width="1.2" opacity=".55"/>`,
    Beard: `<path d="M29 50 Q30 78 50 80 Q70 78 71 50 Q67 66 50 67 Q33 66 29 50Z" fill="${hairFill}"/>`,
    Monocle: `<circle cx="59" cy="47" r="6.5" fill="#cfe6ff" fill-opacity=".2" stroke="#c9a227" stroke-width="1.8"/><path d="M65 50 Q68 62 64 74" stroke="#c9a227" stroke-width="1" fill="none"/>`,
    Aviators: `<g fill="#2b2f3a" fill-opacity=".9" stroke="#c9a227" stroke-width="1.4"><path d="M31.5 42.5 h16 q1 10 -7.5 10.5 q-8.5 0 -8.5 -10.5z"/><path d="M52.5 42.5 h16 q0 10.5 -8.5 10.5 q-8.5 -.5 -7.5 -10.5z"/></g><path d="M47.5 44h5" stroke="#c9a227" stroke-width="1.4"/><path d="M34 45 l5 -1.2M55 45 l5 -1.2" stroke="#fff" stroke-width="1.2" opacity=".5"/>`,
    Lincoln: `<path d="M29 50 Q29 82 50 84 Q71 82 71 50 Q69 62 63 67 Q57 71 50 71 Q43 71 37 67 Q31 62 29 50Z" fill="${hairFill}"/>${TOP_HAT}`,
    Pearls: Array.from({ length: 9 }, (_, i) => {
      const t = (i + 1) / 10;
      const x = 39 + 22 * t;
      const y = 74 + 18 * t * (1 - t);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.9" fill="#f7f3ea" stroke="#cfc6b4" stroke-width=".5"/>`;
    }).join(''),
    Hoops: `<g fill="none" stroke="#e2b13c" stroke-width="1.4"><circle cx="27" cy="58" r="4"/><circle cx="73" cy="58" r="4"/></g>`,
    'Tan lines': '', // drawn under the eyes, below
  };
  const extra = p.extras.map((e) => extraSvg[e] || '').join('');
  // Paler skin where the sunglasses were.
  const tanLines = p.extras.includes('Tan lines')
    ? `<ellipse cx="41" cy="47.5" rx="6.8" ry="4.6" fill="${shade(p.skin, 0.55)}" opacity=".85"/><ellipse cx="59" cy="47.5" rx="6.8" ry="4.6" fill="${shade(p.skin, 0.55)}" opacity=".85"/>`
    : '';
  const [earX, earRx, earRy] = p.bigEars ? [25.5, 6.5, 9] : [28, 4.2, 6.5];

  return `
    ${back}
    <path d="M42 64 L42 84 L58 84 L58 64Z" fill="${shade(p.skin, -0.12)}"/>
    <path d="M42 70 Q50 78 58 70 L58 76 Q50 82 42 76Z" fill="${shade(p.skin, -0.32)}" opacity=".6"/>
    <ellipse cx="${earX}" cy="48" rx="${earRx}" ry="${earRy}" fill="${shade(p.skin, -0.12)}"/><ellipse cx="${100 - earX}" cy="48" rx="${earRx}" ry="${earRy}" fill="${shade(p.skin, -0.2)}"/>
    <path d="M${earX - 0.5} 46 q2 2 0 5M${100.5 - earX} 46 q-2 2 0 5" stroke="${shade(p.skin, -0.4)}" stroke-width="1" fill="none"/>
    <ellipse cx="50" cy="46" rx="22" ry="25" fill="url(#face${id})"/>
    ${front}
    ${tanLines}
    <ellipse cx="41" cy="47.5" rx="3.8" ry="2.7" fill="#fff"/><ellipse cx="59" cy="47.5" rx="3.8" ry="2.7" fill="#fff"/>
    <circle cx="41.6" cy="47.6" r="2" fill="#3b2a1f"/><circle cx="59.6" cy="47.6" r="2" fill="#3b2a1f"/>
    <circle cx="42.3" cy="46.9" r=".7" fill="#fff"/><circle cx="60.3" cy="46.9" r=".7" fill="#fff"/>
    <path d="M37 44.6 Q41 43.4 45 44.6M55 44.6 Q59 43.4 63 44.6" stroke="${shade(p.skin, -0.3)}" stroke-width=".8" fill="none"/>
    <path d="M35.5 40.5 Q41 37.5 46.5 40M53.5 40 Q59 37.5 64.5 40.5" stroke="${p.hair === 'Bald' ? shade(p.skin, -0.45) : p.hairC}" stroke-width="2.3" fill="none" stroke-linecap="round"/>
    <path d="M50.5 47 Q47.5 54.5 49 56.5 Q51.5 57.5 53.5 55.5" stroke="${shade(p.skin, -0.32)}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <circle cx="36.5" cy="56" r="4.2" fill="#ff7a7a" opacity=".18"/><circle cx="63.5" cy="56" r="4.2" fill="#ff7a7a" opacity=".18"/>
    ${mouth}
    ${extra}`;
}

// Jacket, shirt and tie from the shoulders down to y (110 for a bust).
function torsoSvg(p, id, bottom) {
  return `
    <path d="M10 ${bottom} Q11 84 50 81 Q89 84 90 ${bottom}Z" fill="url(#suit${id})"/>
    <path d="M40 81 L50 98 L60 81Z" fill="${p.shirt}"/>
    <path d="M40 81 L50 98 L60 81" stroke="${shade(p.shirt, -0.15)}" stroke-width="1" fill="none"/>
    ${p.tie === 'none' ? '' : `<path d="M46.5 83 L53.5 83 L55.5 102 L50 109 L44.5 102Z" fill="url(#tie${id})"/>`}
    <path d="M40 81 L36 92 L47 103 L39 ${bottom}" stroke="${shade(p.suit, -0.45)}" stroke-width="1.6" fill="none" opacity=".7"/>
    <path d="M60 81 L64 92 L53 103 L61 ${bottom}" stroke="${shade(p.suit, -0.45)}" stroke-width="1.6" fill="none" opacity=".7"/>
    <path d="M20 95 Q24 104 22 ${bottom}" stroke="${shade(p.suit, -0.5)}" stroke-width="1.2" fill="none" opacity=".5"/>
    <path d="M80 95 Q76 104 78 ${bottom}" stroke="${shade(p.suit, -0.5)}" stroke-width="1.2" fill="none" opacity=".5"/>`;
}

function avatarSvg(look = {}, tie = '#d7263d') {
  const id = ++figureCount;
  const p = lookParts(look);
  // Taller box for a hat, so it isn't cut off.
  const box = hasHat(p) ? '0 -18 100 128' : '0 0 100 110';
  return `<svg viewBox="${box}" xmlns="http://www.w3.org/2000/svg" class="avatar-svg">
    ${figureDefs(p, id, tie)}
    ${torsoSvg(p, id, 110)}
    ${headSvg(p, id)}
  </svg>`;
}

// Full figure, 100 x 240. opts.prop: 'camera' | 'mic' | 'notepad' | null.
// opts.pose: 'raise' lifts the left arm. Classes leg-l, leg-r, arm-l, arm-r and
// flashbulb let the TV animate walking and camera flashes.
function personSvg(look = {}, tie = '#d7263d', opts = {}) {
  const id = ++figureCount;
  const p = lookParts(look);
  const sleeve = `url(#suit${id})`;
  const trousers = shade(p.suit, -0.3);
  const shoe = '#1a1412';
  const hand = shade(p.skin, -0.05);

  const leftArm = opts.pose === 'raise'
    ? `<g class="arm-l"><path d="M24 92 Q16 70 18 46" stroke="${sleeve}" stroke-width="12" stroke-linecap="round" fill="none"/><circle cx="18" cy="41" r="5.5" fill="${hand}"/></g>`
    : `<g class="arm-l"><path d="M23 92 Q18 120 20 146" stroke="${sleeve}" stroke-width="12" stroke-linecap="round" fill="none"/><circle cx="20" cy="150" r="5.5" fill="${hand}"/></g>`;

  // The right arm holds the prop up in front of the chest.
  let rightArm = `<g class="arm-r"><path d="M77 92 Q82 120 80 146" stroke="${sleeve}" stroke-width="12" stroke-linecap="round" fill="none"/><circle cx="80" cy="150" r="5.5" fill="${hand}"/></g>`;
  let prop = '';
  if (opts.prop === 'camera') {
    rightArm = `<g class="arm-r"><path d="M77 92 Q90 116 74 122" stroke="${sleeve}" stroke-width="12" stroke-linecap="round" fill="none"/></g>`;
    prop = `<g class="prop">
      <rect x="52" y="104" width="34" height="23" rx="3" fill="#24262b"/><rect x="52" y="104" width="34" height="5" rx="2" fill="#3a3d44"/>
      <circle cx="66" cy="116" r="8" fill="#111"/><circle cx="66" cy="116" r="5.5" fill="#2d4a7a"/><circle cx="64" cy="114" r="1.8" fill="#fff" opacity=".7"/>
      <rect x="74" y="96" width="10" height="9" rx="1.5" fill="#d9d9d9"/>
      <circle class="flashbulb" cx="79" cy="100" r="22" fill="#fffbe6" opacity="0"/>
      <circle cx="74" cy="122" r="5.5" fill="${hand}"/></g>`;
  } else if (opts.prop === 'mic') {
    rightArm = `<g class="arm-r"><path d="M77 92 Q86 112 70 114" stroke="${sleeve}" stroke-width="12" stroke-linecap="round" fill="none"/></g>`;
    prop = `<g class="prop"><rect x="64" y="72" width="5" height="44" rx="2" fill="#222" transform="rotate(-18 66 114)"/>
      <circle cx="58" cy="72" r="7" fill="#333"/><circle cx="56" cy="70" r="2.5" fill="#fff" opacity=".25"/>
      <rect x="54" y="80" width="12" height="9" rx="2" fill="${tie}" transform="rotate(-18 60 84)"/>
      <circle cx="69" cy="114" r="5.5" fill="${hand}"/></g>`;
  } else if (opts.prop === 'notepad') {
    rightArm = `<g class="arm-r"><path d="M77 92 Q88 116 70 124" stroke="${sleeve}" stroke-width="12" stroke-linecap="round" fill="none"/></g>`;
    prop = `<g class="prop"><rect x="54" y="108" width="22" height="28" rx="2" fill="#fbf7e8" transform="rotate(-8 65 122)"/>
      <path d="M58 116h14M58 121h14M58 126h10" stroke="#8aa0c8" stroke-width="1.2" transform="rotate(-8 65 122)"/>
      <circle cx="70" cy="124" r="5.5" fill="${hand}"/></g>`;
  }

  return `<svg viewBox="0 0 100 240" xmlns="http://www.w3.org/2000/svg" class="person-svg">
    ${figureDefs(p, id, tie)}
    <ellipse cx="50" cy="232" rx="34" ry="6" fill="#000" opacity=".35"/>
    <g class="leg-l"><path d="M36 148 L35 222" stroke="${trousers}" stroke-width="15" stroke-linecap="round"/><ellipse cx="32" cy="226" rx="11" ry="5.5" fill="${shoe}"/><ellipse cx="29" cy="224" rx="4" ry="1.6" fill="#fff" opacity=".2"/></g>
    <g class="leg-r"><path d="M64 148 L65 222" stroke="${shade(trousers, -0.15)}" stroke-width="15" stroke-linecap="round"/><ellipse cx="68" cy="226" rx="11" ry="5.5" fill="${shoe}"/><ellipse cx="65" cy="224" rx="4" ry="1.6" fill="#fff" opacity=".2"/></g>
    <g class="body">
      ${leftArm}
      ${torsoSvg(p, id, 156)}
      <rect x="18" y="148" width="64" height="9" rx="3" fill="${shade(p.suit, -0.25)}"/>
      ${headSvg(p, id)}
      ${rightArm}
      ${prop}
    </g>
  </svg>`;
}

// The same figure seen from behind, for reporters facing the podium. 100 x 140
// seated (waist up; a chair hides the rest) or 100 x 240 standing.
// opts.standing, opts.pose: 'raise' (hand up with a mic), opts.prop: 'camera'.
function backSvg(look = {}, tie = '#d7263d', opts = {}) {
  const id = ++figureCount;
  const p = lookParts(look);
  const hairFill = `url(#hair${id})`;
  const nape = shade(p.skin, -0.15);
  const bottom = opts.standing ? 156 : 140;
  const sleeve = `url(#suit${id})`;
  const hand = shade(p.skin, -0.05);

  const skull = `<ellipse cx="50" cy="40" rx="21" ry="24" fill="${nape}"/>`;
  const cap = (top = 15) => `<path d="M29 44 Q27 ${top} 50 ${top} Q73 ${top} 71 44 Q71 58 62 61 L38 61 Q29 58 29 44Z" fill="${hairFill}"/>`;
  const hair = {
    Bald: `<ellipse cx="50" cy="40" rx="21" ry="24" fill="url(#face${id})"/><ellipse cx="44" cy="27" rx="8" ry="4" fill="#fff" opacity=".22"/>`,
    Short: skull + cap(),
    'Side part': skull + cap(13) + `<path d="M40 16 Q46 30 44 44" stroke="${shade(p.hairC, -0.4)}" stroke-width="1.2" fill="none" opacity=".6"/>`,
    Long: `<path d="M27 42 Q26 13 50 13 Q74 13 73 42 L77 80 Q50 88 23 80Z" fill="${hairFill}"/>`,
    Bun: skull + cap() + `<circle cx="50" cy="22" r="10" fill="${hairFill}"/><circle cx="47" cy="19" r="3" fill="#fff" opacity=".18"/>`,
    Pompadour: skull + cap(8),
    Mohawk: skull + `<path d="M45 6 L55 6 L54 62 L46 62Z" fill="${hairFill}"/>`,
    Swoop: skull + cap(9) + `<path d="M30 30 Q50 16 72 26" stroke="#fff" stroke-width="2" opacity=".25" fill="none"/>`,
    Buzz: skull + cap(17),
    Combed: skull + cap(16) + `<path d="M38 20 Q46 36 44 54M50 18 Q54 36 52 56M60 20 Q62 36 60 54" stroke="${shade(p.hairC, -0.25)}" stroke-width=".9" fill="none"/>`,
    Bob: `<path d="M26 42 Q25 13 50 13 Q75 13 74 42 L76 64 Q50 70 24 64Z" fill="${hairFill}"/>`,
    Tufts: `<ellipse cx="50" cy="40" rx="21" ry="24" fill="url(#face${id})"/><ellipse cx="44" cy="27" rx="8" ry="4" fill="#fff" opacity=".22"/><path d="M28 40 Q28 62 50 63 Q72 62 72 40 Q70 52 50 54 Q30 52 28 40Z" fill="${hairFill}"/>`,
  }[p.hair] || skull + cap();

  let arms = `
    <path d="M17 88 Q12 112 14 ${bottom}" stroke="${sleeve}" stroke-width="13" stroke-linecap="round" fill="none"/>
    <path d="M83 88 Q88 112 86 ${bottom}" stroke="${sleeve}" stroke-width="13" stroke-linecap="round" fill="none"/>`;
  let prop = '';
  if (opts.pose === 'raise') {
    arms = `
      <path d="M17 88 Q12 112 14 ${bottom}" stroke="${sleeve}" stroke-width="13" stroke-linecap="round" fill="none"/>
      <path d="M82 86 Q92 60 86 26" stroke="${sleeve}" stroke-width="13" stroke-linecap="round" fill="none"/>
      <rect x="83" y="-4" width="5" height="22" rx="2" fill="#222"/><circle cx="85.5" cy="-6" r="6" fill="#333"/>
      <circle cx="86" cy="20" r="6" fill="${hand}"/>`;
  }
  if (opts.prop === 'camera') {
    arms = `
      <path d="M18 86 Q20 60 38 40" stroke="${sleeve}" stroke-width="12" stroke-linecap="round" fill="none"/>
      <path d="M82 86 Q80 60 62 40" stroke="${sleeve}" stroke-width="12" stroke-linecap="round" fill="none"/>`;
    prop = `<rect x="30" y="18" width="40" height="22" rx="3" fill="#24262b"/><rect x="30" y="18" width="40" height="5" rx="2" fill="#3a3d44"/>
      <rect x="56" y="8" width="11" height="10" rx="1.5" fill="#d9d9d9"/>
      <circle class="flashbulb" cx="61" cy="8" r="26" fill="#fffbe6" opacity="0"/>`;
  }

  const legs = opts.standing
    ? `<ellipse cx="50" cy="232" rx="34" ry="6" fill="#000" opacity=".35"/>
       <g class="leg-l"><path d="M37 148 L36 222" stroke="${shade(p.suit, -0.3)}" stroke-width="15" stroke-linecap="round"/><ellipse cx="36" cy="226" rx="9" ry="5" fill="#1a1412"/></g>
       <g class="leg-r"><path d="M63 148 L64 222" stroke="${shade(p.suit, -0.4)}" stroke-width="15" stroke-linecap="round"/><ellipse cx="64" cy="226" rx="9" ry="5" fill="#1a1412"/></g>`
    : '';

  return `<svg viewBox="0 0 100 ${opts.standing ? 240 : 140}" xmlns="http://www.w3.org/2000/svg" class="person-svg">
    ${figureDefs(p, id, tie)}
    ${legs}
    <g class="body">
      <ellipse cx="${p.bigEars ? 27 : 28.5}" cy="44" rx="${p.bigEars ? 6 : 4}" ry="${p.bigEars ? 8.5 : 6.5}" fill="${nape}"/><ellipse cx="${p.bigEars ? 73 : 71.5}" cy="44" rx="${p.bigEars ? 6 : 4}" ry="${p.bigEars ? 8.5 : 6.5}" fill="${shade(p.skin, -0.25)}"/>
      <rect x="41" y="56" width="18" height="18" fill="${shade(p.skin, -0.2)}"/>
      ${p.hair === 'Long' ? '' : hair}
      <path d="M10 ${bottom} Q10 76 50 72 Q90 76 90 ${bottom}Z" fill="url(#suit${id})"/>
      <path d="M41 71 Q50 76 59 71 L59 74 Q50 79 41 74Z" fill="${p.shirt}"/>
      ${p.hair === 'Long' ? hair : ''}
      ${hasHat(p) ? `<g transform="translate(0 -6)">${TOP_HAT}</g>` : ''}
      <path d="M50 79 L50 ${bottom}" stroke="${shade(p.suit, -0.45)}" stroke-width="1.4" opacity=".7"/>
      <path d="M26 92 Q32 104 30 120M74 92 Q68 104 70 120" stroke="${shade(p.suit, -0.4)}" stroke-width="1.2" fill="none" opacity=".45"/>
      ${arms}
      ${prop}
    </g>
  </svg>`;
}
