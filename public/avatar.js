// Politician avatars, shared by the phone and the TV. A look is a set of option
// indexes ({ skin: 2, hair: 0, ... }); avatarSvg() draws it.
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

function avatarSvg(look = {}, tie = '#d7263d') {
  const opt = (key) => {
    const list = LOOK_OPTIONS[key];
    const i = Number(look[key]) || 0;
    return list[((i % list.length) + list.length) % list.length];
  };
  const skin = opt('skin');
  const hairC = opt('hairColor');
  const suit = opt('suit');
  const shirt = suit === '#e8e4d8' ? '#c9d6ea' : '#ffffff';

  const hair = {
    Bald: '',
    Short: `<path d="M28 44 Q28 18 50 17 Q72 18 72 44 Q66 30 50 30 Q34 30 28 44Z" fill="${hairC}"/>`,
    'Side part': `<path d="M27 46 Q25 16 52 16 Q75 18 73 46 L70 34 Q58 22 40 30 Q32 34 27 46Z" fill="${hairC}"/>`,
    Long: `<path d="M26 70 Q20 16 50 16 Q80 16 74 70 L68 70 L68 40 Q60 28 50 28 Q40 28 32 40 L32 70Z" fill="${hairC}"/>`,
    Bun: `<circle cx="50" cy="12" r="9" fill="${hairC}"/><path d="M28 42 Q28 18 50 18 Q72 18 72 42 Q64 28 50 28 Q36 28 28 42Z" fill="${hairC}"/>`,
    Pompadour: `<path d="M28 42 Q22 6 54 8 Q82 12 72 42 Q70 26 50 26 Q34 26 28 42Z" fill="${hairC}"/>`,
    Mohawk: `<path d="M44 30 L46 6 L50 2 L54 6 L56 30Z" fill="${hairC}"/>`,
  }[opt('hair')];

  const mouth = {
    Smile: '<path d="M41 60 Q50 68 59 60" stroke="#3b1f14" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    Smirk: '<path d="M42 62 Q52 64 59 58" stroke="#3b1f14" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    Grimace: '<rect x="40" y="58" width="20" height="7" rx="2" fill="#fff" stroke="#3b1f14" stroke-width="2"/><path d="M45 58v7M50 58v7M55 58v7" stroke="#3b1f14" stroke-width="1"/>',
    Shouting: '<ellipse cx="50" cy="62" rx="7" ry="6" fill="#3b1f14"/><ellipse cx="50" cy="65" rx="4" ry="2" fill="#d9534f"/>',
  }[opt('mouth')];

  const extra = {
    None: '',
    Glasses: '<g fill="none" stroke="#1f1a17" stroke-width="2"><circle cx="41" cy="47" r="6"/><circle cx="59" cy="47" r="6"/><path d="M47 47h6"/></g>',
    Mustache: `<path d="M38 56 Q44 51 50 55 Q56 51 62 56 Q56 59 50 57 Q44 59 38 56Z" fill="${hairC}"/>`,
    Sunglasses: '<g fill="#111"><rect x="33" y="42" width="14" height="9" rx="3"/><rect x="53" y="42" width="14" height="9" rx="3"/><rect x="46" y="44" width="8" height="2"/></g>',
    Beard: `<path d="M30 52 Q32 76 50 78 Q68 76 70 52 Q66 66 50 66 Q34 66 30 52Z" fill="${hairC}"/>`,
    Monocle: '<circle cx="59" cy="47" r="6.5" fill="none" stroke="#c9a227" stroke-width="2"/><path d="M65 50 Q68 62 64 74" stroke="#c9a227" stroke-width="1" fill="none"/>',
  }[opt('extra')];

  return `<svg viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg" class="avatar-svg">
    <path d="M10 110 Q12 82 50 80 Q88 82 90 110Z" fill="${suit}"/>
    <path d="M40 80 L50 96 L60 80Z" fill="${shirt}"/>
    <path d="M47 82 L53 82 L55 100 L50 106 L45 100Z" fill="${tie}"/>
    <rect x="43" y="66" width="14" height="16" fill="${skin}"/>
    <ellipse cx="28" cy="48" rx="4" ry="6" fill="${skin}"/><ellipse cx="72" cy="48" rx="4" ry="6" fill="${skin}"/>
    <ellipse cx="50" cy="46" rx="22" ry="25" fill="${skin}"/>
    ${hair}
    <circle cx="41" cy="47" r="2.6" fill="#1f1a17"/><circle cx="59" cy="47" r="2.6" fill="#1f1a17"/>
    <path d="M36 40 Q41 37 46 40M54 40 Q59 37 64 40" stroke="#3b1f14" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${mouth}
    ${extra}
  </svg>`;
}
