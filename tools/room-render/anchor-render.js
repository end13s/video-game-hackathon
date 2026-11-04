// The news studio for the Breaking news cut scene. All layers share one camera, so they stack exactly:
// layer=studio is the set and desk, layer=body is the anchor without the head, layer=head is the head alone.
import * as THREE from 'three';
import { AVG, buildHead } from './game-heads.js';
const q = new URLSearchParams(location.search), N = +(q.get('n') || 24), LAYER = q.get('layer') || 'all', SC = +(q.get('scale') || 1), OUT = q.get('out') || `anchor-${LAYER}.png`;
const W = 1920 * SC, H = 1080 * SC;
await document.fonts.load('400 60px "Alfa Slab One"').catch(() => {});
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .82, flatShading: true, ...o });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TEAL = '#22637E', TEAL2 = '#1C5570', TEAL3 = '#2A7290', NAVY = '#1B3A6B', NAVY2 = '#14294F', GOLD = '#E8B24A', RED = '#B5302D', CREAM = '#F5E9D2';
const scene = new THREE.Scene(), set = new THREE.Group(), desk = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
scene.add(set, desk, body, head);
function add(p, geo, m, pos, rot) { const x = new THREE.Mesh(geo, typeof m === 'string' ? M(m) : m); if (pos) x.position.set(...pos); if (rot) x.rotation.set(...rot); x.castShadow = x.receiveShadow = true; p.add(x); return x; }
const B = (p, w, h, d, m, pos, rot) => add(p, new THREE.BoxGeometry(w, h, d), m, pos, rot);
function limb(p, a, b, r, m) { const d = b.clone().sub(a), x = add(p, new THREE.CylinderGeometry(r, r * 1.08, d.length(), 6), m); x.position.copy(a).addScaledVector(d, .5); x.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); return x; }
function star(g, cx, cy, r, inner = .42) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * inner : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); }
function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

const FLOOR = -7.4, ZB = -9, AX = -3.7, AZ = -.7, TOP = -3.2;

// ---- the set ---------------------------------------------------------------
add(set, new THREE.PlaneGeometry(70, 30), M('#16294C'), [0, FLOOR, 5], [-Math.PI / 2, 0, 0]);
// back wall: flat teal panels, like the press room curtain but in a studio
const PW = 2.6;
B(set, 60, 16, .1, NAVY2, [0, -.7, ZB - .4]);
for (let i = -9, k = 0; i <= 9; i++, k++) B(set, PW - .06, 13.4, .3, [TEAL, TEAL2, TEAL3][(k * 2) % 3], [i * PW, -.7, ZB - .15 + (k % 2) * .1]);
B(set, 54, 2.1, .5, NAVY2, [0, FLOOR + 1.05, ZB + .15]);
B(set, 54, .16, .56, GOLD, [0, FLOOR + 2.16, ZB + .15]);
B(set, 54, 2.4, .5, NAVY2, [0, 5.1, ZB + .15]);
B(set, 54, .16, .56, GOLD, [0, 3.84, ZB + .15]);
// the big screen on the wall
const SW = 9.2, SH = 5.25, SX = 6.3, SY = .2;
B(set, SW + .5, SH + .5, .4, NAVY2, [SX, SY, ZB + .25]);
B(set, SW + .76, .1, .46, GOLD, [SX, SY + SH / 2 + .28, ZB + .25]);
B(set, SW + .76, .1, .46, GOLD, [SX, SY - SH / 2 - .28, ZB + .25]);
const screen = tex(1280, 730, (g, w, h) => {
  g.fillStyle = '#1B3A6B'; g.fillRect(0, 0, w, h);
  const tri = (pts, c) => { g.fillStyle = c; g.beginPath(); pts.forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); g.fill(); };
  tri([[0, 0], [430, 0], [0, 390]], '#20457E'); tri([[w, h], [w - 500, h], [w, h - 420]], '#20457E'); tri([[w, 0], [w - 300, 0], [w, 280]], '#173260'); tri([[0, h], [340, h], [0, h - 300]], '#173260');
  g.fillStyle = RED; g.fillRect(0, h / 2 + 88, w, 92); g.fillStyle = GOLD; g.fillRect(0, h / 2 + 80, w, 8); g.fillRect(0, h / 2 + 180, w, 8);
  g.fillStyle = GOLD; star(g, w / 2, 170, 92);
  g.fillStyle = '#F5F6FA'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '400 92px "Alfa Slab One"'; g.fillText('PRESS', w / 2, h / 2 + 26);
  g.font = '400 62px "Alfa Slab One"'; g.fillText('CONFERENCE', w / 2, h / 2 + 136);
});
const scr = add(set, new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: screen }), [SX, SY, ZB + .47]); scr.castShadow = false;
// a tall navy column at each side of the set
for (const x of [-11.6, 13.4]) { B(set, 1.5, 15, 1.4, NAVY, [x, -.7, ZB + 1]); B(set, .12, 15, .1, GOLD, [x + (x < 0 ? .78 : -.78), -.7, ZB + 1.72]); }
// chair back, seen behind the shoulders
B(set, 3.9, 3.5, .5, '#7E2C33', [AX, -3.1, AZ - 1.5], [-.06, 0, 0]);

// ---- the desk --------------------------------------------------------------
const plan = [[-6.5, .9], [6.2, .9], [6.7, 2.2], [4, 3.3], [0, 3.7], [-4, 3.3], [-7, 2.2]];
const inset = (k) => plan.map(([x, z]) => [x * k, .9 + (z - .9) * k]);
const prism = (pts, h, m, y) => { const s = new THREE.Shape(); pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z))); s.closePath(); const x = add(desk, new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }), m, [AX, y, 0], [-Math.PI / 2, 0, 0]); return x; };
prism(inset(.96), TOP - FLOOR - .3, NAVY, FLOOR);
prism(inset(.965), .5, GOLD, FLOOR + 1.5);
prism(inset(.966), .22, RED, FLOOR + 1.64);
prism(inset(1.0), .14, GOLD, TOP - .3);
prism(inset(1.0), .16, NAVY2, TOP - .16);
// script on the desk
B(desk, 1.9, .05, 1.35, CREAM, [AX + .04, TOP + .03, 1.75], [0, .05, 0]);
B(desk, 1.9, .05, 1.35, '#EFE2C8', [AX - .05, TOP + .08, 1.72], [0, -.04, 0]);

// ---- the anchor ------------------------------------------------------------
// One fixed character: silver hair, navy suit, gold tie. Same build as the player figures, seated.
const SUIT = '#1C3564', SKIN = '#B57F58', HAIR = '#D5D7DB', TIE = GOLD;
const anchor = new THREE.Group(), top = M(SUIT), skin = M(SKIN), lap = '#' + new THREE.Color(SUIT).multiplyScalar(.8).getHexString();
anchor.position.set(AX, 0, AZ); anchor.rotation.y = .1; body.add(anchor);
const hd = buildHead({ ...AVG, brow: .78, eyeSize: .66, noseW: .68, noseLen: .42, mouthW: .55, ears: .5 }, { skin: SKIN, hair: HAIR, brow: '#B9BCC2', style: 'side' });
hd.position.set(AX, -.1, AZ); hd.rotation.y = .1; head.add(hd);
hd.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
add(anchor, new THREE.CylinderGeometry(.36, .42, .6, 6), skin, [0, -1.1, 0]);
add(anchor, new THREE.CylinderGeometry(1.2, .98, 3.3, 8), top, [0, -3.0, 0], [0, Math.PI / 8, 0]);
const flat = (pts, col, pos, rx = -.1) => { const v = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? v.lineTo(x, y) : v.moveTo(x, y))); v.closePath(); return add(anchor, new THREE.ShapeGeometry(v), col, pos, [rx, 0, 0]); };
flat([[-.46, 0], [.46, 0], [0, -1.25]], CREAM, [0, -1.36, 1.14]);
flat([[-.15, 0], [.15, 0], [.09, -.17], [-.09, -.17]], TIE, [0, -1.38, 1.16]);
flat([[-.09, 0], [.09, 0], [.17, -.72], [0, -.92], [-.17, -.72]], TIE, [0, -1.54, 1.16]);
for (const s of [-1, 1]) flat([[s * .46, 0], [s * .78, -.05], [s * .5, -.7], [0, -1.32], [s * .03, -1.2]], lap, [0, -1.34, 1.16]).material.side = THREE.DoubleSide;
for (const s of [-1, 1]) {
  add(anchor, new THREE.IcosahedronGeometry(.5, 1), top, [s * 1.16, -1.72, 0]).scale.set(1, .92, 1);
  const sh = V(s * 1.2, -1.75, 0), el = V(s * 1.62, -2.96, .28), wr = V(s * 1.02, -3.02, 2.05);
  limb(anchor, sh, el, .36, top); add(anchor, new THREE.IcosahedronGeometry(.37, 1), top, [el.x, el.y, el.z]); limb(anchor, el, wr, .33, top);
  limb(anchor, wr, V(s * .96, -3.03, 2.18), .2, CREAM);
  add(anchor, new THREE.IcosahedronGeometry(.29, 1), skin, [s * .9, -3.03, 2.38]).scale.set(.95, .72, 1.12);
}

// ---- layers ----------------------------------------------------------------
// Parts left out of a layer stay in the scene and still cast shadows; only the desk still hides what is behind it.
const ghost = (g, depth) => g.traverse((o) => { if (!o.isMesh) return; o.material = o.material.clone(); o.material.colorWrite = false; o.material.depthWrite = depth; o.renderOrder = -1; });
if (LAYER === 'studio') { ghost(body, false); ghost(head, false); }
if (LAYER === 'body') { set.visible = false; ghost(desk, true); ghost(head, false); }
if (LAYER === 'head') { set.visible = false; desk.visible = false; ghost(body, false); }

const r = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: true, alpha: true }); r.setPixelRatio(1); r.setClearColor(0, 0); r.setSize(W, H, false);
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.NoToneMapping; document.body.appendChild(r.domElement);
scene.add(new THREE.HemisphereLight('#FFFFFF', '#CDBFAE', 1.9));
const key = new THREE.DirectionalLight('#FFFFFF', 1.5); key.castShadow = true; key.shadow.mapSize.set(4096, 4096); Object.assign(key.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 }); key.shadow.bias = -.0004; key.shadow.normalBias = .03; scene.add(key, key.target);
const cam = new THREE.PerspectiveCamera(24, W / H, .1, 200); cam.position.set(0, 1.4, 26); cam.lookAt(0, -1.875, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
// Where the neck meets the head, as a share of the frame: the talking motion pivots here.
const neck = V(AX, -1, AZ).project(cam); console.log('neck', ((neck.x + 1) / 2).toFixed(4), ((1 - neck.y) / 2).toFixed(4));
const acc = new Float32Array(W * H * 4), buf = new Uint8Array(W * H * 4), gl = r.getContext();
for (let i = 0; i < N; i++) {
  cam.setViewOffset(W, H, Math.random() - .5, Math.random() - .5, W, H);
  key.position.set((-5 + (Math.random() - .5) * 5) * 3, (6 + (Math.random() - .5) * 4) * 3, 36);
  r.render(scene, cam); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  for (let k = 0; k < buf.length; k++) acc[k] += buf[k];
  document.getElementById('s').textContent = `sample ${i + 1}/${N}`;
  await new Promise((f) => setTimeout(f));
}
const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d'), im = x.createImageData(W, H);
for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const s = ((H - 1 - y) * W + xx) * 4, d = (y * W + xx) * 4, al = acc[s + 3] || 1; im.data[d] = acc[s] / al * 255; im.data[d + 1] = acc[s + 1] / al * 255; im.data[d + 2] = acc[s + 2] / al * 255; im.data[d + 3] = acc[s + 3] / N; }
x.putImageData(im, 0, 0);
await fetch('/save?name=' + OUT, { method: 'POST', body: await new Promise((f) => cv.toBlob(f, 'image/png')) });
document.getElementById('s').textContent = 'DONE ' + ((neck.x + 1) / 2).toFixed(4) + ' ' + ((1 - neck.y) / 2).toFixed(4);
