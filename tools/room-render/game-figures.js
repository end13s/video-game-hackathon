// Renders the Press Conference cast as transparent sprites. Same body as the character picker.
import * as THREE from 'three';
import { AVG, buildHead } from './game-heads.js';
const q = new URLSearchParams(location.search), N = +(q.get('n') || 24), only = q.get('only');
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .82, flatShading: true, ...o });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FACE = { brow: .78, eyeSize: .66, noseW: .68, noseLen: .42, mouthW: .55 };
function limb(g, a, b, r, m) { const d = b.clone().sub(a), x = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, d.length(), 6), m); x.position.copy(a).addScaledVector(d, .5); x.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); x.castShadow = x.receiveShadow = true; g.add(x); return x; }
function character(c) {
  const g = new THREE.Group(), top = M(c.suit), skin = M(c.skin), darker = new THREE.Color(c.suit).multiplyScalar(.8);
  const add = (geo, m, pos, sc, rot) => { const x = new THREE.Mesh(geo, m); x.position.set(...pos); if (sc) x.scale.set(...sc); if (rot) x.rotation.set(...rot); x.castShadow = x.receiveShadow = true; g.add(x); return x; };
  const hd = buildHead({ ...AVG, ...FACE, ears: c.bigEars ? .95 : .5 }, c); hd.position.y = -.1; g.add(hd);
  add(new THREE.CylinderGeometry(.36, .42, .6, 6), skin, [0, -1.1, 0]);
  add(new THREE.CylinderGeometry(1.2, .98, 3.3, 8), top, [0, -3.0, 0], null, [0, Math.PI / 8, 0]);
  const flat = (pts, col, pos, rx = -.1) => { const v = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? v.lineTo(x, y) : v.moveTo(x, y))); v.closePath(); return add(new THREE.ShapeGeometry(v), M(col), pos, null, [rx, 0, 0]); };
  flat([[-.46, 0], [.46, 0], [0, -1.25]], c.shirt || '#F5E9D2', [0, -1.36, 1.14]);
  if (c.tie) { flat([[-.15, 0], [.15, 0], [.09, -.17], [-.09, -.17]], c.tie, [0, -1.38, 1.16]); flat([[-.09, 0], [.09, 0], [.17, -.72], [0, -.92], [-.17, -.72]], c.tie, [0, -1.55, 1.17]); }
  for (const s of [-1, 1]) flat([[s * .46, 0], [s * .78, -.05], [s * .5, -.7], [0, -1.32], [s * .03, -1.2]], '#' + darker.getHexString(), [0, -1.34, 1.16]).material.side = THREE.DoubleSide;
  if (c.pearls) for (let i = 0; i < 11; i++) { const a = (i / 10 - .5) * 2.5; add(new THREE.IcosahedronGeometry(.085, 0), M('#F4EFE4'), [Math.sin(a) * .5, -1.42 - Math.cos(a) * .34, 1.2]); }
  for (const s of [-1, 1]) add(new THREE.IcosahedronGeometry(.5, 1), top, [s * 1.16, -1.72, 0], [1, .92, 1]);
  const hand = (p) => add(new THREE.IcosahedronGeometry(.29, 1), skin, [p.x, p.y, p.z], [.92, 1.12, .8]);
  // right arm of the picture: down at the side, or holding a camera up
  if (c.pose === 'camera') {
    const e = V(1.72, -2.5, .4), h = V(1.2, -1.2, 1.1); add(new THREE.IcosahedronGeometry(.37, 1), top, [e.x, e.y, e.z]); limb(g, V(1.2, -1.75, 0), e, .36, top); limb(g, e, h, .33, top);
    const e2 = V(-1.72, -2.5, .4), h2 = V(-.9, -1.2, 1.1); add(new THREE.IcosahedronGeometry(.37, 1), top, [e2.x, e2.y, e2.z]); limb(g, V(-1.2, -1.75, 0), e2, .36, top); limb(g, e2, h2, .33, top);
    add(new THREE.BoxGeometry(1.5, .95, .8), M('#24262B'), [1.5, .1, .8]); add(new THREE.BoxGeometry(.5, .32, .5), M('#D9D9D9'), [1.7, .74, .8]);
  } else {
    add(new THREE.IcosahedronGeometry(.37, 1), top, [1.48, -3.0, .12]); limb(g, V(1.2, -1.75, 0), V(1.48, -3.0, .12), .36, top); limb(g, V(1.48, -3.0, .12), V(1.34, -4.3, .5), .33, top); hand(V(1.32, -4.58, .54));
    // the other arm: raised, or down when seated
    if (c.pose === 'wave' || c.pose === 'raise') {
      add(new THREE.IcosahedronGeometry(.37, 1), top, [-1.86, -2.62, .3]); limb(g, V(-1.2, -1.75, 0), V(-1.86, -2.62, .3), .36, top); limb(g, V(-1.86, -2.62, .3), V(-2.02, -1.2, .46), .32, top); hand(V(-2.04, -.92, .48));
      if (c.pose === 'raise') { limb(g, V(-2.04, -1.1, .48), V(-2.04, .2, .48), .09, M('#222228')); add(new THREE.IcosahedronGeometry(.3, 1), M('#333338'), [-2.04, .36, .48]); }
    } else { add(new THREE.IcosahedronGeometry(.37, 1), top, [-1.48, -3.0, .12]); limb(g, V(-1.2, -1.75, 0), V(-1.48, -3.0, .12), .36, top); limb(g, V(-1.48, -3.0, .12), V(-1.34, -4.3, .5), .33, top); hand(V(-1.32, -4.58, .54)); }
  }
  if (c.legs) { const tr = M('#' + new THREE.Color(c.suit).multiplyScalar(.72).getHexString()); for (const s of [-1, 1]) { limb(g, V(s * .46, -4.5, 0), V(s * .5, -7.2, 0), .4, tr); add(new THREE.BoxGeometry(.72, .34, 1.15), M('#1A1412'), [s * .5, -7.3, .18]); } }
  return g;
}
const CAST = {
  swoop: { skin: '#f2a65e', style: 'swoop', hair: '#f0c75a', suit: '#1e2a4a', tie: '#d7263d', tan: true, mouth: 'Pout' },
  buzz: { skin: '#8a5a3c', style: 'buzz', hair: '#4a4542', suit: '#3a3f4b', tie: '#3b82f6', bigEars: true, mouth: 'Grin' },
  combed: { skin: '#f6d3b8', style: 'combed', hair: '#ececec', suit: '#1e2a4a', tie: '#2a5ab8', shades: true, mouth: 'Grin' },
  sidepart: { skin: '#f3cdb2', style: 'side', hair: '#3a2a1e', suit: '#1e2a4a', tie: '#d7263d', beard: 'full', mouth: 'Smile' },
  tufts: { skin: '#f3c9b0', style: 'tufts', hair: '#f2f2f2', suit: '#5a5f69', tie: '#3a3f4b', glasses: '#23304A', mouth: 'Shouting' },
  bob: { skin: '#a8714a', style: 'bob', hair: '#2a1d17', suit: '#1b1f2a', pearls: true, mouth: 'Grin' },
  wig: { skin: '#f3d2b8', style: 'wig', hair: '#f1efea', suit: '#1e2a4a', tie: '#f5f5f5', mouth: 'Smirk' },
  short: { skin: '#e2b48c', style: 'short', hair: '#1f1a17', suit: '#141418', tie: '#141418', beard: 'chin', hat: true, mouth: 'Smirk' },
};
const GOLD = { skin: '#E9B48C', style: 'bun', hair: '#4A2F22', suit: '#E0A93A', tie: '#2C5FA8', beard: 'full' };
const FRONT = { w: 5.2, top: 2.8, bottom: -7.2, ppu: 110, tilt: 0 }, SEAT = { w: 5.6, top: 2.9, bottom: -4.9, ppu: 66, tilt: .13 }, WALK = { w: 5.6, top: 2.3, bottom: -7.7, ppu: 60, tilt: .1 };
const list = [];
for (const [k, c] of Object.entries(CAST)) {
  list.push([`fig-front-${k}.png`, { ...c, pose: 'wave', legs: true }, FRONT, -.14]);
  list.push([`fig-back-${k}.png`, { ...c, pose: null }, SEAT, Math.PI]);
  list.push([`fig-back-${k}-raise.png`, { ...c, pose: 'raise' }, SEAT, Math.PI]);
}
list.push(['fig-front-gold.png', { ...GOLD, pose: 'wave', legs: true }, FRONT, -.14]);
const SUITS = ['#1e2a4a', '#3a3f4b', '#7a1f2b', '#2f5233', '#e8e4d8', '#5b3f8c', '#E0A93A', '#2C5FA8'], SKINS = ['#f8d5b5', '#eab68c', '#c98d5e', '#a86b3c', '#7a4a28', '#4f2f1a'], HAIRC = ['#1f1a17', '#5b3a21', '#a0522d', '#e2b13c', '#d9d9d9', '#c0392b'], STY = ['short', 'long', 'bun', 'curly', 'side', 'bald', 'buzz', 'bob'];
for (let i = 0; i < 12; i++) list.push([`fig-crowd-${String(i).padStart(2, '0')}.png`, { skin: SKINS[(i * 5 + 1) % 6], style: STY[i % 8], hair: HAIRC[(i * 7 + 2) % 6], suit: SUITS[(i * 3) % 8], pose: null }, SEAT, Math.PI]);
for (let i = 0; i < 2; i++) list.push([`fig-walker-${i}.png`, { skin: SKINS[i * 3 + 1], style: i ? 'bun' : 'short', hair: HAIRC[i + 1], suit: SUITS[i ? 2 : 1], pose: 'camera', legs: true }, WALK, Math.PI]);
const todo = only ? list.filter(([n]) => only.split(',').some((t) => n.includes(t))) : list;
const scene = new THREE.Scene();
const r = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: true, alpha: true }); r.setPixelRatio(1); r.setClearColor(0, 0);
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.NoToneMapping; document.body.appendChild(r.domElement);
scene.add(new THREE.HemisphereLight('#FFFFFF', '#CDBFAE', 1.9));
const key = new THREE.DirectionalLight('#FFFFFF', 1.5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 }); key.shadow.bias = -.0006; key.shadow.normalBias = .02; scene.add(key, key.target);
const gl = r.getContext();
for (const [name, spec, f, rot] of todo) {
  const W = Math.round(f.w * f.ppu), H = Math.round((f.top - f.bottom) * f.ppu); r.setSize(W, H, false);
  const cam = new THREE.OrthographicCamera(-f.w / 2, f.w / 2, f.top, f.bottom, .1, 100); cam.position.set(0, Math.sin(f.tilt) * 30, Math.cos(f.tilt) * 30); cam.lookAt(0, 0, 0);
  const ch = character(spec); ch.rotation.y = rot; scene.add(ch);
  const acc = new Float32Array(W * H * 4), buf = new Uint8Array(W * H * 4);
  for (let i = 0; i < N; i++) {
    cam.setViewOffset(W, H, Math.random() - .5, Math.random() - .5, W, H);
    key.position.set(-5 + (Math.random() - .5) * 5, 6 + (Math.random() - .5) * 4, 12);
    r.render(scene, cam); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    for (let k = 0; k < buf.length; k++) acc[k] += buf[k];
  }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d'), im = x.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const s = ((H - 1 - y) * W + xx) * 4, d = (y * W + xx) * 4, al = acc[s + 3] || 1; im.data[d] = acc[s] / al * 255; im.data[d + 1] = acc[s + 1] / al * 255; im.data[d + 2] = acc[s + 2] / al * 255; im.data[d + 3] = acc[s + 3] / N; }
  x.putImageData(im, 0, 0);
  await fetch('/save?name=' + name, { method: 'POST', body: await new Promise((res) => cv.toBlob(res, 'image/png')) });
  scene.remove(ch); document.getElementById('s').textContent = 'did ' + name; await new Promise((res) => setTimeout(res));
}
document.getElementById('s').textContent = 'DONE';
