// The cast in the press room, as pre-rendered low-poly sprites. Players are drawn from their
// picks on the phone (made by tools/avatar-render); background reporters come from a small
// crowd set (made by tools/room-render).
const CROWD_NAMES = Array.from({ length: 12 }, (_, i) => `crowd-${String(i).padStart(2, '0')}`);
const figureImg = (name) => `<img src="/room/people/${name}.png" alt="">`;
const pickedImg = (name) => `<img src="/avatars/figures/${name}.webp" alt="">`;

function podiumFigure({ suit, face, hair }) {
  return pickedImg(`front-${suit}-${face}-${hair}`);
}

// opts.pose: 'raise' lifts a hand with a mic. The face item doesn't show from behind.
function pressFigure({ suit, hair }, opts = {}) {
  return pickedImg(`back-${suit}-${hair}${opts.pose === 'raise' ? '-raise' : ''}`);
}

function crowdFigure() {
  return figureImg(CROWD_NAMES[Math.floor(Math.random() * CROWD_NAMES.length)]);
}

// A photographer from behind, with a bulb for the flash.
function walkerFigure(i) {
  return `${figureImg(`walker-${i % 2}`)}<svg class="flash" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle class="flashbulb" cx="50" cy="50" r="46" fill="#fffbe6" opacity="0"/></svg>`;
}

// Fetch them up front so a figure doesn't pop in when it first appears.
const PICKS = [0, 1, 2, 3];
[...CROWD_NAMES, 'walker-0', 'walker-1'].forEach((name) => { new Image().src = `/room/people/${name}.png`; });
for (const suit of PICKS) for (const hair of PICKS) {
  for (const face of PICKS) new Image().src = `/avatars/figures/front-${suit}-${face}-${hair}.webp`;
  for (const pose of ['', '-raise']) new Image().src = `/avatars/figures/back-${suit}-${hair}${pose}.webp`;
}
