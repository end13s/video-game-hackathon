import * as THREE from 'three';

const q = new URLSearchParams(location.search);
const N = +(q.get('n') || 24), LAYER = q.get('layer') || 'room', SC = +(q.get('scale') || 1), W = 1920 * SC, H = 1400 * SC, F = 1080 * SC, OUT = q.get('out') || 'game-test.png';
await Promise.all(['500 60px "Fira Sans"', '600 60px "Fira Sans"', '700 60px "Fira Sans"'].map((f) => document.fonts.load(f))).catch(() => {});
let seed = 777;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const scene = new THREE.Scene();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .82, flatShading: true, ...o });
const shell = [];
function add(geo, m, p = scene, pos, scale, rot) {
  const x = new THREE.Mesh(geo, m);
  if (pos) x.position.set(...pos);
  if (scale) x.scale.set(...scale);
  if (rot) x.rotation.set(...rot);
  x.castShadow = x.receiveShadow = true;
  p.add(x); return x;
}
const B = (w, h, d, c, pos, p = scene, rot) => add(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? M(c) : c, p, pos, null, rot);
const S = (w, h, d, c, pos) => { const x = B(w, h, d, c, pos); shell.push(x); return x; };
function limb(p, a, b, r, m, seg = 6) {
  const d = b.clone().sub(a), x = add(new THREE.CylinderGeometry(r, r * 1.08, d.length(), seg), m, p);
  x.position.copy(a).addScaledVector(d, .5); x.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); return x;
}
function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function star(g, cx, cy, r, inner = .44) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * inner : r; g.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); } g.closePath(); g.fill(); }

const X = 8, ZB = -7, ZF = 16, CH = 6.6;
const CARPET = '#7E2C33', WOOD = '#96623C', WOOD2 = '#7F5232', GOLD = '#E8B24A', PLASTER = '#E7E1D6', TEAL = '#22637E', NAVY = '#1B4A8A';

// shell of the room
const fl = add(new THREE.PlaneGeometry(2 * X, ZF - ZB), M(CARPET), scene, [0, 0, (ZF + ZB) / 2], null, [-Math.PI / 2, 0, 0]); fl.castShadow = false;
add(new THREE.PlaneGeometry(2.1, 18), M('#9C3A40'), scene, [0, .012, 7.5], null, [-Math.PI / 2, 0, 0]).castShadow = false;
for (const s of [-1, 1]) add(new THREE.PlaneGeometry(.1, 18), M(GOLD), scene, [s * 1.08, .014, 7.5], null, [-Math.PI / 2, 0, 0]).castShadow = false;
S(2 * X, .3, ZF - ZB, '#5E4A3E', [0, CH + .15, (ZF + ZB) / 2]);
for (let z = ZB + 1.5; z < ZF; z += 3.2) S(2 * X, .34, .42, '#463529', [0, CH - .16, z]);
S(2 * X, CH, .2, '#14384C', [0, CH / 2, ZB - .1]);
// left wall: wainscot, rail, door, EXIT, lamp
S(.3, CH, ZF - ZB, PLASTER, [-X - .15, CH / 2, (ZF + ZB) / 2]);
for (let z = ZB + .35; z < ZF; z += .7) S(.1, 1.5, .66, rnd() < .5 ? WOOD : WOOD2, [-X + .04, .75, z]);
S(.14, .12, ZF - ZB, GOLD, [-X + .07, 1.56, (ZF + ZB) / 2]);
const DZ = 1.5;
S(.14, 3.1, 2.1, '#5A3020', [-X + .08, 1.55, DZ]); S(.16, 2.9, 1.8, '#7A3F24', [-X + .1, 1.45, DZ]);
S(.2, .09, 1.3, GOLD, [-X + .17, 1.25, DZ]);
const exitT = tex(256, 96, (c, w, h) => { c.fillStyle = '#C8312A'; c.fillRect(0, 0, w, h); c.fillStyle = '#FFF1D6'; c.font = '700 66px "Fira Sans"'; c.textAlign = 'center'; c.fillText('exit', w / 2, 70); });
const ex = add(new THREE.PlaneGeometry(1.05, .4), new THREE.MeshBasicMaterial({ map: exitT }), scene, [-X + .06, 3.45, DZ], null, [0, Math.PI / 2, 0]); ex.castShadow = false;
function sconce(z, s) { const x = s * (X - .14); B(.14, .34, .2, GOLD, [x, 2.75, z]); const m = add(new THREE.ConeGeometry(.26, .4, 6, 1, true), new THREE.MeshBasicMaterial({ color: '#F4EBD9', side: THREE.DoubleSide }), scene, [x - s * .16, 3.05, z], null, [Math.PI, 0, 0]); m.castShadow = false; }
sconce(-1.2, -1);

// right wall of tall windows
const WIN = [-3.4, 1.8, 7];
const wy0 = 1.3, wy1 = 5.3, ww = 1.45;
const edges = [ZB]; WIN.forEach((z) => edges.push(z - ww, z + ww)); edges.push(ZF);
for (let i = 0; i < edges.length; i += 2) { const a = edges[i], b = edges[i + 1]; S(.3, CH, b - a, PLASTER, [X + .15, CH / 2, (a + b) / 2]); }
for (const z of WIN) {
  S(.3, wy0, 2 * ww, PLASTER, [X + .15, wy0 / 2, z]); S(.3, CH - wy1, 2 * ww, PLASTER, [X + .15, (CH + wy1) / 2, z]);
  S(.34, .1, 2 * ww + .2, '#E9D7B4', [X + .02, wy0 - .04, z]);
  for (const dz of [-ww + .03, 0, ww - .03]) S(.1, wy1 - wy0, .08, '#5A3020', [X + .1, (wy0 + wy1) / 2, z + dz]);
  for (const y of [2.65, 4]) S(.1, .07, 2 * ww, '#5A3020', [X + .1, y, z]);
}
for (let z = ZB + .35; z < ZF; z += .7) S(.1, 1.2, .66, rnd() < .5 ? WOOD : WOOD2, [X - .04, .6, z]);
S(.14, .1, ZF - ZB, GOLD, [X - .07, 1.25, (ZF + ZB) / 2]);
// plain pale daylight behind the glass
const out = add(new THREE.PlaneGeometry(90, 31), new THREE.MeshBasicMaterial({ color: '#E4EEF3' }), scene, [24, 8, 4], null, [0, -Math.PI / 2, 0]); out.castShadow = false;

// back wall: faceted curtains, valance, seal
function curtain(w, h, cx, cy, cz, col, fold = .2, seg = 72) {
  const g = new THREE.PlaneGeometry(w, h, seg, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = Math.round((p.getX(i) + w / 2) / w * seg); p.setZ(i, (k % 2 ? fold : 0) + fold * .25 * Math.sin(k * 1.7)); }
  g.computeVertexNormals();
  return add(g, M(col, { side: THREE.DoubleSide }), scene, [cx, cy, cz]);
}
curtain(2 * X, CH, 0, CH / 2, ZB + .12, TEAL, .24, 84);
const val = curtain(2 * X, .56, 0, CH - .28, ZB + .5, '#17435A', .26, 60);
S(2 * X, .12, .36, GOLD, [0, CH - .56, ZB + .62]);
for (let x = -X + .1; x < X; x += .16) B(.08, .2, .05, '#D9A23E', [x, CH - .72, ZB + .78]);
const sealT = tex(1024, 1024, (c, w) => {
  c.fillStyle = '#E8B24A'; c.fillRect(0, 0, w, w); c.fillStyle = NAVY; c.beginPath(); c.arc(512, 512, 410, 0, 7); c.fill();
  c.strokeStyle = '#E8B24A'; c.lineWidth = 12; c.beginPath(); c.arc(512, 512, 270, 0, 7); c.stroke();
  c.fillStyle = '#E8B24A'; star(c, 512, 530, 215);
  c.font = '600 58px "Fira Sans"'; c.textAlign = 'center'; const t = 'OFFICE OF THE PRESS SECRETARY  ★  '; [...t].forEach((ch, i) => { const a = i / t.length * 6.283 - Math.PI / 2; c.save(); c.translate(512 + 338 * Math.cos(a), 512 + 338 * Math.sin(a)); c.rotate(a + Math.PI / 2); c.fillText(ch, 0, 20); c.restore(); });
});
const seal = add(new THREE.CylinderGeometry(1.58, 1.58, .16, 28), M('#C9913A'), scene, [0, 3.72, ZB + .55], null, [Math.PI / 2, 0, 0]);
add(new THREE.CircleGeometry(1.55, 48), new THREE.MeshStandardMaterial({ map: sealT, roughness: .7 }), scene, [0, 3.72, ZB + .645]).castShadow = false;

// riser, side steps
B(9.4, .26, 4.6, '#17478F', [0, .13, -4.5]); B(9.5, .06, 4.7, '#2C6BC4', [0, .29, -4.5]); B(3, .13, .7, '#2C6BC4', [0, .065, -1.9]);
const RY = .32;

// flags
function flag(x, col) {
  B(.09, 4, .09, GOLD, [x, RY + 2, -5.4]); add(new THREE.IcosahedronGeometry(.13, 0), M(GOLD), scene, [x, RY + 4.08, -5.4]);
  const g = new THREE.PlaneGeometry(1.3, 2.1, 7, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = p.getX(i) + .65, b = p.getY(i); p.setZ(i, .16 * Math.sin(a * 5 + b * 1.4) * (a / 1.3 + .1)); p.setY(i, b - a * a * .26); }
  g.computeVertexNormals();
  const t = tex(256, 416, (c, w, h) => { const st = ['#B5302D', '#F1E2C4']; for (let i = 0; i < 9; i++) { c.fillStyle = st[i % 2]; c.fillRect(0, i * h / 9, w, h / 9 + 1); } c.fillStyle = NAVY; c.fillRect(0, 0, 118, 190); c.fillStyle = '#F1E2C4'; star(c, 59, 94, 46); });
  add(g, M('#fff', { map: t, side: THREE.DoubleSide }), scene, [x + (x < 0 ? .7 : -.7), RY + 2.85, -5.4], null, [0, x < 0 ? 0 : Math.PI, 0]);
}
flag(-3.5); flag(3.5);

// people
function person(o) {
  const g = new THREE.Group(), top = M(o.top), skin = M(o.skin, o.skinOpts || {}), hair = M(o.hair), hip = o.seated ? .56 : .92;
  if (!o.seated) for (const s of [-1, 1]) { limb(g, V(s * .12, hip, 0), V(s * .13, .1, 0), .09, M(o.legs || '#2A2C3A')); B(.17, .1, .32, '#2A2230', [s * .13, .05, .06], g); }
  else for (const s of [-1, 1]) limb(g, V(s * .12, hip, 0), V(s * .13, hip, .42), .09, M(o.legs || '#2A2C3A'));
  add(new THREE.CylinderGeometry(.29, .21, .68, 7), top, g, [0, hip + .34, 0]);
  add(new THREE.CylinderGeometry(.075, .09, .14, 6), skin, g, [0, hip + .73, 0]);
  const hd = new THREE.Group(); hd.position.set(0, hip + .96, 0); g.add(hd);
  if (o.turn) hd.rotation.y = o.turn;
  add(new THREE.IcosahedronGeometry(.215, 1), skin, hd, null, [.94, 1.06, .98]);
  o.style(hd, hair);
  const sh = hip + .6;
  for (const s of [-1, 1]) {
    const end = (s < 0 ? o.lh : o.rh) || V(s * .32, hip + .02, .1), elbow = (s < 0 ? o.le : o.re) || V(s * .36, hip + .3, 0), a = V(s * .28, sh, 0);
    limb(g, a, elbow, .075, top); limb(g, elbow, end, .068, top);
    add(new THREE.IcosahedronGeometry(o.hand || .08, 1), skin, g, [end.x, end.y, end.z], [.9, 1.1, .75]);
  }
  if (o.extra) o.extra(g, hip);
  return g;
}
const hairShort = (hd, h) => { const c = add(new THREE.SphereGeometry(.232, 9, 6, 0, 6.3, 0, 1.45), h, hd, [0, .03, -.03], [.96, 1.08, 1], [-.45, 0, 0]); };
const hairFull = (hd, h) => { add(new THREE.IcosahedronGeometry(.24, 1), h, hd, [0, .03, -.05], [1, 1.1, 1]); };
const hairBun = (hd, h) => { hairFull(hd, h); add(new THREE.IcosahedronGeometry(.1, 1), h, hd, [0, .24, -.12]); };
const hairLong = (hd, h) => { hairFull(hd, h); add(new THREE.BoxGeometry(.4, .46, .14), h, hd, [0, -.22, -.14]); };
const hat = (c) => (hd, h) => { hairFull(hd, h); add(new THREE.CylinderGeometry(.38, .38, .03, 9), M(c), hd, [0, .16, 0]); add(new THREE.CylinderGeometry(.2, .23, .17, 8), M(c), hd, [0, .25, 0]); };

// the lectern (the game draws the politician, mics, seal and plate over it)
const LZ = -2.9;
const lec = new THREE.Group(); lec.position.set(0, RY, LZ); lec.scale.setScalar(1.14); scene.add(lec);
const bodyG = new THREE.CylinderGeometry(.74, .9, 1.42, 4); bodyG.rotateY(Math.PI / 4);
add(bodyG, M(WOOD), lec, [0, .71, 0], [1.1, 1, .66]);
B(1.82, .1, 1.12, '#BC7A3C', [0, 1.46, 0], lec); B(1.92, .06, 1.22, GOLD, [0, 1.39, 0], lec);

// TV cameras on tripods
function tvCam(x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
  for (let k = 0; k < 3; k++) { const a = k * 2.094 + .5; limb(g, V(0, 1.4, 0), V(.55 * Math.cos(a), 0, .55 * Math.sin(a)), .03, M('#2A2C3A'), 5); }
  B(.5, .46, .95, '#5A7C8C', [0, 1.68, 0], g); B(.34, .3, .1, '#23303F', [0, 1.72, -.52], g);
  add(new THREE.CylinderGeometry(.16, .2, .4, 8), M('#1E2030'), g, [0, 1.66, .64], null, [Math.PI / 2, 0, 0]);
  add(new THREE.IcosahedronGeometry(.05, 0), new THREE.MeshBasicMaterial({ color: '#FF3B30' }), g, [.15, 1.97, .3]);
  B(.08, .08, .7, '#2A2C3A', [.18, 1.45, -.6], g);
}
tvCam(-4.85, -.7, -.15 + Math.PI * .72); tvCam(4.85, -.7, .15 - Math.PI * .72);

// rows of reporters, seen from behind
const tops = ['#D9A23E', '#3F8F87', '#B5583F', '#EFE0C4', '#2F6FB5', '#7B4A6E', '#5E7D4F', '#C96E3C'], skins = ['#E9A877', '#C98A5A', '#8A5634', '#F2C9A2', '#5F3A24'], hairs = ['#2A1C16', '#5B3A21', '#8E3F22', '#C99A3C', '#BDB5A8', '#1E1A1E'];
const styles = [hairShort, hairFull, hairBun, hairLong, hat('#5A4632')];
const pick = (a) => a[Math.floor(rnd() * a.length)];
function chair(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI; scene.add(g);
  B(.92, .08, .62, '#176A8C', [0, .26, 0], g); B(.92, .36, .1, '#1F7EA3', [0, .48, -.3], g);
  for (const a of [-1, 1]) for (const b of [-1, 1]) B(.06, .26, .06, '#1E2030', [a * .4, .13, b * .26], g);
  return g;
}
const seatChair = chair(0, .6);

const dir = V(.14, 1, .5).normalize();

// render
scene.background = new THREE.Color('#E4EEF3');
// layers: only the target shows; the rest still lights the scene and casts shadows
const ghost = (o) => o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.colorWrite = false; m.material.depthWrite = false; } });
const keep = LAYER === 'lectern' ? lec : LAYER === 'chair' ? seatChair : null;
if (LAYER === 'room') { ghost(lec); seatChair.visible = false; }
else {
  lec.visible = LAYER === 'lectern';
  seatChair.visible = LAYER === 'chair';
  for (const c of [...scene.children]) if (c !== keep) { ghost(c); c.traverse((m) => { m.castShadow = false; }); }
  scene.background = null;
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .32 }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = .004; catcher.receiveShadow = true; 
}
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(1); renderer.setSize(W, H, false); document.body.appendChild(renderer.domElement);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.NoToneMapping;
const camera = new THREE.PerspectiveCamera(31, W / F, .1, 200);
camera.position.set(0, 3.5, +(q.get('cz') || 10.7)); camera.lookAt(0, 2.75, -3); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
// Slide the frame so the lectern base lands 16rem up (y 760 of 1080) and add 320px of ceiling on top: the image is 96 x 70rem.
const base = V(0, RY, LZ + .55).project(camera), DY = ((1 - base.y) / 2) * F - 760 * SC, Y0 = DY - 320 * SC;
const mk = (i, c) => { const l = new THREE.DirectionalLight(c, i); l.castShadow = true; l.shadow.mapSize.set(4096, 4096); Object.assign(l.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 }); l.shadow.bias = -.0004; l.shadow.normalBias = .015; scene.add(l); scene.add(l.target); return l; };
const sun = mk(0, '#FFFFFF'), dome = mk(0, '#FFFFFF');
sun.target.position.set(0, 2, 2); dome.target.position.set(0, 1, 2);
scene.add(new THREE.HemisphereLight('#FFFFFF', '#D9D5CE', 1.7));
const SUN = 3, DOME = 2;
for (const m of shell) m.castShadow = false;
const acc = new Float32Array(W * H * 4), buf = new Uint8Array(W * H * 4), gl = renderer.getContext();
for (let i = 0; i < N; i++) {
  const a = (i * .61803 % 1) * 6.283, u = (i + .5) / N;
  camera.setViewOffset(W, F, rnd() - .5, Y0 + rnd() - .5, W, H);
  const useSun = i % 2 === 0;
  sun.intensity = useSun ? SUN : 0; dome.intensity = useSun ? 0 : DOME;
  const r = Math.sqrt(u) * 9;
  sun.position.copy(sun.target.position).addScaledVector(dir, 42).add(V(r * Math.cos(a), 0, r * Math.sin(a)));
  dome.position.set((rnd() - .5) * 44, 14 + rnd() * 14, 6 + rnd() * 26);
  renderer.render(scene, camera);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  for (let k = 0; k < buf.length; k++) acc[k] += buf[k];
  document.getElementById('s').textContent = `sample ${i + 1}/${N}`;
  await new Promise((r2) => setTimeout(r2));
}
camera.clearViewOffset();
const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
const x2 = c2.getContext('2d'), img = x2.createImageData(W, H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4; const al = acc[s + 3] || 1; img.data[d] = acc[s] / al * 255; img.data[d + 1] = acc[s + 1] / al * 255; img.data[d + 2] = acc[s + 2] / al * 255; img.data[d + 3] = acc[s + 3] / N; }
x2.putImageData(img, 0, 0);
const blob = await new Promise((r) => c2.toBlob(r, 'image/png'));
await fetch('/save?name=' + OUT, { method: 'POST', body: blob });
document.getElementById('s').textContent = 'DONE';
