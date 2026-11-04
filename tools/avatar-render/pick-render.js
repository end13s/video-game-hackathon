// Renders every suit x face item x hair combination of the character picker.
import * as THREE from 'three';
import { AVG, buildHead } from './heads.js';
const q = new URLSearchParams(location.search), N = +(q.get('n') || 20), S = +(q.get('size') || 640), only = q.get('only');
const SKIN = '#E9B48C', HAIR = '#4A2F22';
const SUITS = [{ top: '#2C5FA8', tie: '#C8312A' }, { top: '#B5302D', tie: '#E8B24A' }, { top: '#3F8F6A', tie: '#E8B24A' }, { top: '#E0A93A', tie: '#2C5FA8' }];
const FACE = [{ glasses: '#23304A' }, { shades: true }, { beard: 'stache' }, { beard: 'full' }];
const HAIRS = ['short', 'curly', 'long', 'bun'];
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .82, flatShading: true, ...o });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function limb(g, a, b, r, m) { const d = b.clone().sub(a), x = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, d.length(), 6), m); x.position.copy(a).addScaledVector(d, .5); x.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); x.castShadow = x.receiveShadow = true; g.add(x); }
function character(si, fi, hi) {
  const g = new THREE.Group(), suit = SUITS[si], top = M(suit.top), skin = M(SKIN);
  const add = (geo, m, pos, sc, rot) => { const x = new THREE.Mesh(geo, m); x.position.set(...pos); if (sc) x.scale.set(...sc); if (rot) x.rotation.set(...rot); x.castShadow = x.receiveShadow = true; g.add(x); return x; };
  const look = { skin: SKIN, hair: HAIR, style: HAIRS[hi], ...FACE[fi] };
  const hd = buildHead({ ...AVG, brow: .78, eyeSize: .66, noseW: .68, noseLen: .42, mouthW: .55 }, look); hd.position.y = -.1; g.add(hd);
  const dark = M(new THREE.Color(suit.top).multiplyScalar(.8));
  add(new THREE.CylinderGeometry(.36, .42, .6, 6), skin, [0, -1.1, 0]);
  add(new THREE.CylinderGeometry(1.2, .98, 3.3, 8), top, [0, -3.0, 0], null, [0, Math.PI / 8, 0]);
  const flat = (pts, c, pos, rx = -.1) => { const v = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? v.lineTo(x, y) : v.moveTo(x, y))); v.closePath(); return add(new THREE.ShapeGeometry(v), M(c), pos, null, [rx, 0, 0]); };
  flat([[-.46, 0], [.46, 0], [0, -1.25]], '#F5E9D2', [0, -1.36, 1.14]);
  flat([[-.15, 0], [.15, 0], [.09, -.17], [-.09, -.17]], suit.tie, [0, -1.38, 1.16]);
  flat([[-.09, 0], [.09, 0], [.17, -.72], [0, -.92], [-.17, -.72]], suit.tie, [0, -1.55, 1.17]);
  for (const s of [-1, 1]) flat([[s * .46, 0], [s * .78, -.05], [s * .5, -.7], [0, -1.32], [s * .03, -1.2]], suit.top === '#000' ? suit.top : '#' + new THREE.Color(suit.top).multiplyScalar(.8).getHexString(), [0, -1.34, 1.16]).material.side = THREE.DoubleSide;
  for (const s of [-1, 1]) add(new THREE.IcosahedronGeometry(.5, 1), top, [s * 1.16, -1.72, 0], [1, .92, 1]);
  add(new THREE.IcosahedronGeometry(.37, 1), top, [1.48, -3.0, .12]);
  limb(g, V(1.2, -1.75, 0), V(1.48, -3.0, .12), .36, top); limb(g, V(1.48, -3.0, .12), V(1.34, -4.3, .5), .33, top);
  add(new THREE.IcosahedronGeometry(.37, 1), top, [-1.86, -2.62, .3]);
  limb(g, V(-1.2, -1.75, 0), V(-1.86, -2.62, .3), .36, top); limb(g, V(-1.86, -2.62, .3), V(-2.02, -1.2, .46), .32, top);
  add(new THREE.IcosahedronGeometry(.29, 1), skin, [-2.04, -.92, .48], [.92, 1.12, .8]);
  return g;
}
const scene = new THREE.Scene(); scene.background = new THREE.Color('#ECE5D8');
const r = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: true }); r.setPixelRatio(1); r.setSize(S, S, false); document.body.appendChild(r.domElement);
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.NoToneMapping;
const cam = new THREE.PerspectiveCamera(19, 1, .1, 100); cam.position.set(-.3, -.75, 19.6); cam.lookAt(-.3, -1.05, 0);
scene.add(new THREE.HemisphereLight('#FFFFFF', '#CDBFAE', 1.9));
const key = new THREE.DirectionalLight('#FFFFFF', 1.5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 }); key.shadow.bias = -.0006; key.shadow.normalBias = .02; scene.add(key, key.target);
const acc = new Float32Array(S * S * 4), buf = new Uint8Array(S * S * 4), gl = r.getContext();
const cv = document.createElement('canvas'); cv.width = cv.height = S; const x2 = cv.getContext('2d'), im = x2.createImageData(S, S);
const combos = []; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) combos.push([a, b, c]);
const list = only ? only.split(',').map((t) => t.split('-').map(Number)) : combos;
for (const [a, b, c] of list) {
  const ch = character(a, b, c); ch.rotation.y = -.14; ch.position.y = 0; scene.add(ch); acc.fill(0);
  for (let i = 0; i < N; i++) {
    cam.setViewOffset(S, S, Math.random() - .5, Math.random() - .5, S, S);
    key.position.set(-5 + (Math.random() - .5) * 5, 6 + (Math.random() - .5) * 4, 12);
    r.render(scene, cam); gl.readPixels(0, 0, S, S, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    for (let k = 0; k < buf.length; k++) acc[k] += buf[k];
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const s = ((S - 1 - y) * S + x) * 4, d = (y * S + x) * 4; im.data[d] = acc[s] / N; im.data[d + 1] = acc[s + 1] / N; im.data[d + 2] = acc[s + 2] / N; im.data[d + 3] = 255; }
  x2.putImageData(im, 0, 0);
  await fetch(`/save?name=pick-${a}-${b}-${c}.png`, { method: 'POST', body: await new Promise((f) => cv.toBlob(f, 'image/png')) });
  scene.remove(ch); document.getElementById('s').textContent = `done ${a}-${b}-${c}`;
  await new Promise((f) => setTimeout(f));
}
document.getElementById('s').textContent = 'DONE';
