// Renders the lectern microphones as a transparent sprite: two straight mics side by side on one short stem.
import * as THREE from 'three';
const q = new URLSearchParams(location.search), N = +(q.get('n') || 32), OUT = q.get('out') || 'game-mic.png';
const W = 480, H = 640, FW = 3, FH = 4;
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .6, flatShading: true, ...o });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const g = new THREE.Group();
const add = (geo, m, pos) => { const x = new THREE.Mesh(geo, m); if (pos) x.position.copy(pos); x.castShadow = x.receiveShadow = true; g.add(x); return x; };
const black = M('#1E1F24'), dark = M('#2C2D33'), head = M('#34353C', { roughness: .5 });
// short straight stem on a small base
add(new THREE.CylinderGeometry(.3, .36, .1, 8), black, V(0, -1.02, 0));
add(new THREE.CylinderGeometry(.08, .09, .62, 8), dark, V(0, -.68, 0));
add(new THREE.BoxGeometry(.4, .17, .26), black, V(0, -.32, 0));
// two straight mics close together, tilted up and toward the speaker
for (const s of [-1, 1]) {
  const dir = V(s * .13, .74, -.66).normalize(), root = V(s * .13, -.3, 0);
  const along = (geo, m, d) => { const x = add(geo, m, root.clone().addScaledVector(dir, d)); x.quaternion.setFromUnitVectors(V(0, 1, 0), dir); return x; };
  along(new THREE.CylinderGeometry(.115, .08, .95, 8), dark, .48);
  along(new THREE.CylinderGeometry(.145, .115, .14, 8), black, 1);
  const h = add(new THREE.IcosahedronGeometry(.175, 1), head, root.clone().addScaledVector(dir, 1.17)); h.quaternion.setFromUnitVectors(V(0, 1, 0), dir); h.scale.set(1, 1.25, 1);
}
g.rotation.y = -.1;
const scene = new THREE.Scene(); scene.add(g);
const r = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: true, alpha: true }); r.setPixelRatio(1); r.setClearColor(0, 0); r.setSize(W, H, false);
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.NoToneMapping; document.body.appendChild(r.domElement);
scene.add(new THREE.HemisphereLight('#FFFFFF', '#CDBFAE', 1.9));
const key = new THREE.DirectionalLight('#FFFFFF', 1.5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 }); key.shadow.bias = -.0006; key.shadow.normalBias = .02; scene.add(key, key.target);
const cam = new THREE.OrthographicCamera(-FW / 2, FW / 2, FH / 2, -FH / 2, .1, 100); cam.position.set(0, 0, 30); cam.lookAt(0, 0, 0);
const acc = new Float32Array(W * H * 4), buf = new Uint8Array(W * H * 4), gl = r.getContext();
for (let i = 0; i < N; i++) {
  cam.setViewOffset(W, H, Math.random() - .5, Math.random() - .5, W, H);
  key.position.set(-5 + (Math.random() - .5) * 5, 6 + (Math.random() - .5) * 4, 12);
  r.render(scene, cam); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  for (let k = 0; k < buf.length; k++) acc[k] += buf[k];
}
const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d'), im = x.createImageData(W, H);
for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const s = ((H - 1 - y) * W + xx) * 4, d = (y * W + xx) * 4, al = acc[s + 3] || 1; im.data[d] = acc[s] / al * 255; im.data[d + 1] = acc[s + 1] / al * 255; im.data[d + 2] = acc[s + 2] / al * 255; im.data[d + 3] = acc[s + 3] / N; }
x.putImageData(im, 0, 0);
await fetch('/save?name=' + OUT, { method: 'POST', body: await new Promise((f) => cv.toBlob(f, 'image/png')) });
document.getElementById('s').textContent = 'DONE';
