// Low-poly head for the Press Conference cast. Every trait is 0..1 with .5 = average.
import * as THREE from 'three';
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .82, flatShading: true, ...o });
const TRAITS = ['jaw', 'square', 'chin', 'crown', 'forehead', 'cheek', 'wide', 'noseLen', 'noseW', 'ears', 'eyeGap', 'eyeSize', 'brow', 'mouthW'];
export const AVG = Object.fromEntries(TRAITS.map((k) => [k, .5]));
// k = 0 average head, 1 what the scan measured, >1 the caricature
export const exaggerate = (p, k) => { const o = { ...p }; for (const t of TRAITS) o[t] = .5 + ((p[t] ?? .5) - .5) * k; return o; };

function shape(u, p) {
  let { x, y, z } = u; const lo = Math.max(0, -y), up = Math.max(0, y);
  const cl = (v) => Math.min(1, Math.max(0, v));
  const jaw = cl(p.jaw), sqv = cl(p.square), chin = cl(p.chin), wide = cl(p.wide), crown = cl(p.crown), cheek = cl(p.cheek), fore = cl(p.forehead);
  x *= (1 + (jaw - .5) * .62 * lo) * (1 + (crown - .5) * .6 * up) * (1 + (wide - .5) * .36);
  z *= .93 * (1 + (jaw - .5) * .2 * lo);
  x *= 1 + (cheek - .5) * .3 * Math.exp(-((u.y + .18) ** 2) / .07);
  const sq = (sqv - .5), band = Math.min(1, Math.max(0, (-u.y - .35) / .4));
  x *= 1 + sq * band * .38;
  y = y < 0 ? y * (1 + (chin - .5) * .62) * (1 - Math.max(0, sq) * band * .12) : y * (1 + (fore - .5) * .5);
  return new THREE.Vector3(x, y, z);
}
const unit = (x, y, zs = 1) => new THREE.Vector3(x, y, zs * Math.sqrt(Math.max(.001, 1 - x * x - y * y)));

function shell(p, detail, t, keep) {
  const g = new THREE.IcosahedronGeometry(1, detail), a = g.attributes.position, out = [], u = new THREE.Vector3();
  for (let i = 0; i < a.count; i += 3) {
    const c = new THREE.Vector3();
    for (let k = 0; k < 3; k++) c.add(u.fromBufferAttribute(a, i + k));
    c.normalize();
    if (!keep(c)) continue;
    for (let k = 0; k < 3; k++) { u.fromBufferAttribute(a, i + k); const s = shape(u.clone().normalize(), p).multiplyScalar(1 + t); out.push(s.x, s.y, s.z); }
  }
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); r.computeVertexNormals(); return r;
}
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const line = (c, lift = 0) => mix(-.55, .5 + lift, ss(-.4, .5, c.z));

export function buildHead(p, look) {
  const g = new THREE.Group();
  const put = (geo, m, pos, sc, rot) => { const x = new THREE.Mesh(geo, m); if (pos) x.position.copy(pos); if (sc) x.scale.set(...sc); if (rot) x.rotation.set(...rot); x.castShadow = x.receiveShadow = true; g.add(x); return x; };
  const at = (x, y, out = 0, zs = 1) => shape(unit(x, y, zs), p).multiplyScalar(1 + out);
  const skin = M(look.skin), skinD = M(new THREE.Color(look.skin).multiplyScalar(.86)), hair = M(look.hair, { side: THREE.DoubleSide });
  const face = new THREE.IcosahedronGeometry(1, 2), a = face.attributes.position, u = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) { const s = shape(u.fromBufferAttribute(a, i).clone().normalize(), p); a.setXYZ(i, s.x, s.y, s.z); }
  face.computeVertexNormals(); put(face, skin);
  // ears
  const es = .17 + (p.ears - .5) * .24;
  for (const s of [-1, 1]) put(new THREE.IcosahedronGeometry(1, 1), skinD, at(s * .97, .0, .03, .2).add(new THREE.Vector3(s * es * .22, 0, -.02)), [es * .5, es * 1.15, es * .85], [0, s * -.5, s * -.18]);
  // eyes
  const pale = look.tan ? M(new THREE.Color(look.skin).lerp(new THREE.Color('#FFF4E2'), .55)) : null;
  const gap = .3 + (p.eyeGap - .5) * .2, er = .115 + (p.eyeSize - .5) * .09;
  for (const s of [-1, 1]) {
    if (pale) put(new THREE.IcosahedronGeometry(1, 1), pale, at(s * gap, .13, -.035), [er * 2.1, er * 1.65, er * .62]);
    put(new THREE.IcosahedronGeometry(1, 1), M('#F7F1E6'), at(s * gap, .13, -.02), [er * 1.1, er * .95, er * .5]);
    put(new THREE.IcosahedronGeometry(1, 1), M('#231A1E', { flatShading: false }), at(s * gap, .12, .06).add(new THREE.Vector3(look.gaze || 0, 0, 0)), [er * .5, er * .55, er * .3]);
    put(new THREE.SphereGeometry(1.08, 8, 3, 0, 6.3, 0, 1.57), skinD, at(s * gap, .13, -.02).add(new THREE.Vector3(0, er * .68, 0)), [er * 1.12, er * .8, er * .56]);
    const bw = .22, bh = .05 + (p.brow - .5) * .08, b = at(s * gap, .35 + (p.eyeSize - .5) * .08, .05);
    put(new THREE.BoxGeometry(bw, bh, .07), M(look.brow || look.hair), b, null, [.15, s * .18, s * (look.browTilt ?? -.12)]);
  }
  // nose: a faceted wedge
  const nl = .3 + (p.noseLen - .5) * .42, nw = .135 + (p.noseW - .5) * .14;
  const nose = new THREE.ConeGeometry(1, 1, 5); nose.rotateX(Math.PI / 2 + .62); nose.translate(0, -.1, .3);
  put(nose, M(new THREE.Color(look.skin).multiplyScalar(.95)), at(0, -.06, -.04), [nw, nw * 1.2 + nl * .42, nl]);
  // mouth, open as if talking
  const mo = look.beard === 'full' ? .07 : 0, mw = .3 + (p.mouthW - .5) * .3, mp = at(0, -.5, -.01 + mo);
  const MOUTH = { Pout: [.55, .075, 0, 0], Grin: [1.3, .14, 1.45, 0], Smile: [1.05, .1, 1.3, 0], Smirk: [.85, .07, 1.1, .17], Shouting: [.82, .21, 1, 0] }[look.mouth] || [1, look.open ?? .11, 1.3, 0];
  put(new THREE.IcosahedronGeometry(1, 1), M('#5A1F24'), mp, [mw * MOUTH[0], MOUTH[1], .07], [0, 0, MOUTH[3]]);
  if (MOUTH[2]) put(new THREE.BoxGeometry(mw * MOUTH[2] * MOUTH[0], .05, .05), M('#F8EAD2'), at(0, -.45, .045 + mo), null, [0, 0, MOUTH[3]]);
  // facial hair
  const mouthHole = (c) => Math.hypot(c.x / 1.5, c.y + .47) > .13;
  if (look.beard === 'full') put(shell(p, 3, .05, (c) => c.y < -.14 + Math.abs(c.x) * .1 && c.z > -.15), hair);
  if (look.beard === 'chin') put(shell(p, 3, .05, (c) => c.y < -.3 + Math.abs(c.x) * .22 && c.z > -.15 && Math.hypot(c.x / 1.3, c.y + .47) > .3), hair);
  if (look.beard === 'goatee') put(shell(p, 3, .05, (c) => c.y < -.62 && Math.abs(c.x) < .36 && c.z > 0), hair);
  if (look.beard === 'stache' || look.beard === 'full') for (const s of [-1, 1]) put(new THREE.BoxGeometry(.3, .09, .08), M(look.hair), at(s * .15, -.32, .04), null, [0, s * .3, s * -.2]);
  // hair
  const st = look.style;
  if (st === 'short') put(shell(p, 3, .07, (c) => c.y > line(c)), hair);
  if (st === 'side') put(shell(p, 3, .09, (c) => c.y > line(c) - c.x * .34 * ss(0, .6, c.z)), hair);
  if (st === 'bald') put(shell(p, 3, .05, (c) => c.y > -.42 && c.y < .3 + (c.z < 0 ? .1 : 0) && c.z < .2 && Math.abs(c.x) > .1), hair);
  if (st === 'bun' || st === 'long' || st === 'curly') put(shell(p, 3, .1, (c) => c.y > line(c, .08)), hair);
  if (st === 'bun') put(new THREE.IcosahedronGeometry(.34, 1), hair, new THREE.Vector3(0, 1.1 + (p.forehead - .5) * .5, -.4));
  if (st === 'long') put(new THREE.CylinderGeometry(1, 1.26, 1.9, 12, 1, true, Math.PI / 2 - .28, Math.PI + .56), hair, new THREE.Vector3(0, -.92, -.1), [1, 1, .95]);
  if (st === 'curly') { let k = 7; const r = () => (k = (k * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 34; i++) { const th = r() * 6.283, ph = .15 + r() * 1.25, d = new THREE.Vector3(Math.cos(th) * Math.sin(ph), Math.cos(ph), Math.sin(th) * Math.sin(ph)); if (d.z > .35 && d.y < .62) continue; put(new THREE.IcosahedronGeometry(.2 + r() * .1, 1), hair, shape(d, p).multiplyScalar(1.1)); } }
  if (st === 'buzz') put(shell(p, 3, .03, (c) => c.y > line(c)), hair);
  if (st === 'combed') put(shell(p, 3, .08, (c) => c.y > line(c) + c.x * .3 * ss(0, .6, c.z)), hair);
  if (st === 'swoop') { put(shell(p, 3, .13, (c) => c.y > line(c) - c.x * .3 * ss(0, .6, c.z)), hair); put(new THREE.IcosahedronGeometry(.62, 1), hair, at(.34, .7, .08), [1.5, .55, .95], [.1, 0, -.22]); }
  if (st === 'tufts') { put(shell(p, 3, .04, (c) => c.y > -.3 && c.y < .32 && c.z < -.25), hair); for (const s of [-1, 1]) for (const [dy, r] of [[.34, .24], [.08, .3], [-.14, .2]]) put(new THREE.IcosahedronGeometry(r, 1), hair, at(s * .9, dy, .08, -.45)); }
  if (st === 'bob') { put(shell(p, 3, .1, (c) => c.y > line(c, .08)), hair); put(new THREE.CylinderGeometry(1, 1.14, 1.2, 12, 1, true, Math.PI / 2 - .2, Math.PI + .4), hair, new THREE.Vector3(0, -.56, -.1), [1, 1, .95]); }
  if (st === 'wig') { put(shell(p, 3, .1, (c) => c.y > line(c)), hair); for (const s of [-1, 1]) for (const dy of [.3, .02, -.26]) put(new THREE.IcosahedronGeometry(.25, 1), hair, at(s * .93, dy, .1, .2), [1.1, .85, 1.1]); put(new THREE.IcosahedronGeometry(.32, 1), hair, new THREE.Vector3(0, -.3, -1.05)); }
  if (look.hat) { const hm = M('#17171B'); put(new THREE.CylinderGeometry(1.32, 1.32, .09, 10), hm, new THREE.Vector3(0, .84, 0), null, [.06, 0, 0]); put(new THREE.CylinderGeometry(.78, .82, 1.5, 9), hm, new THREE.Vector3(0, 1.6, -.04)); put(new THREE.CylinderGeometry(.83, .83, .2, 9), M('#3A2A1A'), new THREE.Vector3(0, .98, -.01)); }
  // sunglasses
  if (look.shades) { const dk = M('#1C1F2A'), fr = M('#1C1F2A', { flatShading: false }); for (const sd of [-1, 1]) put(new THREE.CylinderGeometry(er * 1.9, er * 1.75, .05, 7).rotateX(Math.PI / 2), dk, at(sd * gap, .13, .09), [1.12, .92, 1]); put(new THREE.BoxGeometry(gap * .8, .05, .04), fr, at(0, .2, .1)); }
  // glasses
  if (look.glasses) { const fm = M(look.glasses, { flatShading: false }); for (const s of [-1, 1]) { put(new THREE.TorusGeometry(er * 1.75, .024, 6, 10), fm, at(s * gap, .12, .08)); } put(new THREE.BoxGeometry(gap * .75, .03, .03), fm, at(0, .17, .1)); }
  return g;
}

