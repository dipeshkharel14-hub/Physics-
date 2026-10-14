/* ==========================================================================
   Hsepid.np — procedural adult human rig
   --------------------------------------------------------------------------
   A jointed humanoid (pelvis → spine → chest → neck → head, two-bone arms and
   legs) animated with analytic two-bone IK for the legs and for seated typing,
   a stride-locked walk cycle (the walk phase is driven by distance travelled,
   so feet never slide), sit↔stand transitions with feet planted, gestures,
   head look-at and idle breathing.

   Conventions: character faces local +Z. Limbs hang along -Y. A NEGATIVE
   rotation.x swings a limb FORWARD; a POSITIVE spine/head rotation.x leans
   FORWARD. "L" = character's left = +X, "R" = character's right = -X.
   ========================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { skinMaterial, clothMaterial, hairMaterial, shellGeometry, sstep, irisMaterial, corneaMaterial, scleraMaterial, disposeSkinShared } from './hsx-skin.js?v=5';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const damp = (cur, target, dt, rate) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// limb lengths (metres)
const L_THIGH = 0.43, L_SHIN = 0.40, L_UP = 0.30, L_FORE = 0.27;
const ANKLE_H = 0.075;
const STAND_Y = 0.88;      // pelvis height, relaxed stand
const SEAT_Y = 0.54;       // pelvis height when seated (chair seat top = 0.46)
export const SEAT_TOP = 0.46;
export const FEET_FWD_SEATED = 0.36; // feet are this far in front of the chair centre while seated

/* ---- shared material cache + geometry helpers --------------------------- */
const GEO = new Map();
const MAT = new Map();
const TEX = [];
const geo = (k, f) => { let g = GEO.get(k); if (!g) { g = f(); GEO.set(k, g); } return g; };
let weaveTex = null;
function weave() {
  if (weaveTex) return weaveTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 2) for (let x = 0; x < 64; x += 2) { const v = ((x + y) % 4 === 0 ? 150 : 110) + Math.random() * 30; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 2, 2); }
  weaveTex = new THREE.CanvasTexture(c); weaveTex.wrapS = weaveTex.wrapT = THREE.RepeatWrapping; weaveTex.repeat.set(10, 14); TEX.push(weaveTex);
  return weaveTex;
}
const stripeTexCache = new Map();
function stripeTex(line) {
  let t = stripeTexCache.get(line); if (t) return t;
  const c = document.createElement('canvas'); c.width = 128; c.height = 8; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 8); g.fillStyle = line; g.fillRect(62, 0, 3, 8);
  t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(5, 1); TEX.push(t); stripeTexCache.set(line, t);
  return t;
}
/** cached standard material. extra: { cloth:true } adds a fine weave bump; { stripe:'#hex' } adds pinstripes */
function mat(color, rough = 0.75, metal = 0.0, extra = null) {
  const k = color + '_' + rough + '_' + metal + (extra ? JSON.stringify(extra) : '');
  let m = MAT.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    if (extra && extra.cloth) { m.bumpMap = weave(); m.bumpScale = 0.55; }
    if (extra && extra.stripe) m.map = stripeTex(extra.stripe);
    if (extra && extra.side) m.side = extra.side;
    MAT.set(k, m);
  }
  return m;
}
export function disposeHumanShared() {
  GEO.forEach((g) => g.dispose()); GEO.clear();
  MAT.forEach((m) => m.dispose()); MAT.clear();
  TEX.forEach((t) => t.dispose()); TEX.length = 0; weaveTex = null; stripeTexCache.clear(); disposeSkinShared();
}
export const HumanFX = { castShadows: true };

/** tapered limb (lathe). Origin at the top, extends along -Y. */
function limbGeo(len, r0, r1, bulgeT = 0.3, bulge = 0.0, seg = 14) {
  const pts = []; const N = 10;
  for (let i = N; i >= 0; i--) { const t = i / N; pts.push(new THREE.Vector2(lerp(r0, r1, t) + bulge * Math.exp(-Math.pow((t - bulgeT) / 0.24, 2)), -len * t)); }
  pts.unshift(new THREE.Vector2(0.0001, -len - 0.003)); pts.push(new THREE.Vector2(0.0001, 0.003));
  return new THREE.LatheGeometry(pts, seg);
}
/**
 * Torso loft. rings: [{y, rx, rz, cz?, gap?}] bottom→top. Closed ring unless any ring has gap>0, then the front
 * (+Z) is left open by `gap` radians each side (jacket V-opening). Optional end caps for closed lofts.
 */
function loftGeo(rings, { seg = 22, caps = false } = {}) {
  const open = rings.some((r) => r.gap > 0), n = open ? seg + 1 : seg;
  const pos = [], uv = [], idx = [];
  rings.forEach((r, ri) => {
    const g = open ? Math.max(r.gap || 0, 0.012) : 0;
    for (let i = 0; i < n; i++) {
      const u = i / seg, phi = open ? g + (TAU - 2 * g) * u : TAU * u;
      pos.push(r.rx * Math.sin(phi), r.y, (r.cz || 0) + r.rz * Math.cos(phi)); uv.push(u, ri / (rings.length - 1));
    }
  });
  const R = rings.length;
  for (let ri = 0; ri < R - 1; ri++) for (let i = 0; i < (open ? n - 1 : n); i++) {
    const a = ri * n + i, b = ri * n + (i + 1) % n, c = (ri + 1) * n + i, d = (ri + 1) * n + (i + 1) % n;
    idx.push(a, b, c, b, d, c);
  }
  if (caps && !open) for (const [ri, up] of [[0, false], [R - 1, true]]) {
    const r = rings[ri], base = pos.length / 3; pos.push(0, r.y, r.cz || 0); uv.push(0.5, 0.5);
    for (let i = 0; i < n; i++) { const phi = TAU * i / seg; pos.push(r.rx * Math.sin(phi), r.y, (r.cz || 0) + r.rz * Math.cos(phi)); uv.push(0.5, 0.5); }
    for (let i = 0; i < n; i++) { const p1 = base + 1 + i, p2 = base + 1 + (i + 1) % n; if (up) idx.push(base, p1, p2); else idx.push(base, p2, p1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  // make sure faces point outward (check a front vertex of the middle ring)
  const nrm = g.attributes.normal, pa = g.attributes.position, mi = Math.floor(R / 2) * n + (open ? Math.floor(seg / 2) : 0);
  const ox = pa.getX(mi), oz = pa.getZ(mi) - (rings[Math.floor(R / 2)].cz || 0);
  if (nrm.getX(mi) * ox + nrm.getZ(mi) * oz < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
const frontZ = (rings, y) => { // surface z at x=0 for a loft at height y
  for (let i = 0; i < rings.length - 1; i++) { const a = rings[i], b = rings[i + 1]; if (y >= a.y && y <= b.y) { const t = (y - a.y) / (b.y - a.y); return lerp((a.cz || 0) + a.rz, (b.cz || 0) + b.rz, t); } }
  const e = y < rings[0].y ? rings[0] : rings[rings.length - 1]; return (e.cz || 0) + e.rz;
};

/** Two-bone IK in the sagittal (Y,Z) plane. bend=-1: knee forward (legs), +1: elbow backward (arms). */
function ik2(hy, hz, ty, tz, L1, L2, bend) {
  const dy = ty - hy, dz = tz - hz;
  const d = Math.hypot(dy, dz);
  const dd = clamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const phi = Math.atan2(-dz, -dy);
  const cosA = clamp((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1);
  const a1 = phi + bend * Math.acos(cosA);
  const ky = hy - Math.cos(a1) * L1, kz = hz - Math.sin(a1) * L1;
  const psi = Math.atan2(-(tz - kz), -(ty - ky));
  return { a1, a2: psi - a1 };
}

export class Human {
  /**
   * opts: { id, skin, hair:'short'|'side'|'long'|'bun'|'ponytail'|'bald', hairColor, top, shirt, bottom, shoe, tie,
   *         style:'suit'|'blazer'|'shirt'|'rolled'|'vest'|'sweater'|'polo', build:'lean'|'avg'|'broad', pinstripe,
   *         glasses:'none'|'sun'|'clear', beard:null|'stubble'|'full', hat, faceHidden, female, scale, badge, watch, earpiece,
   *         guardPose:'clasp'|'sides', castShadow }
   */
  constructor(opts = {}) {
    this.id = opts.id || 'human';
    this.opts = Object.assign({ skin: 0xc8956b, hair: 'short', hairColor: 0x15100d, top: 0x2a3040, shirt: 0xe9ebef,
      bottom: 0x1b2030, shoe: 0x0c0c0e, tie: null, glasses: 'none', hat: null, faceHidden: false, female: false, scale: 1,
      style: 'suit', build: 'avg', beard: null, badge: false, watch: false, earpiece: false, guardPose: 'sides', pinstripe: null }, opts);
    this.root = new THREE.Group();
    this.root.name = 'human_' + this.id;
    this.root.userData.human = this;
    this.j = {};
    this._build();

    // ---- state
    this.yaw = 0;
    this.path = []; this.pathRes = null; this.pathSpeed = 1.2; this.curSpeed = 0; this.finalYaw = null;
    this.faceTarget = null; this.faceRes = null;
    this.moving = false; this.turning = false;
    this.sitProg = 0; this.sitDir = 0; this.sitDur = 1.5; this.sitRes = null;
    this.frameOff = 0;               // feet-in-front-of-root offset while rebasing seat<->stand
    this.walkPhase = 0; this.walkAmt = 0;
    this.typing = false; this.typeAmt = 0; this.typeRate = 7.5;
    this.guard = false; this.guardAmt = 0; this.guardClock = Math.random() * 9;
    this.talking = false; this.talkAmt = 0;
    this.g = null;                   // active gesture
    this.lookTarget = null; this.lookYaw = 0; this.lookPitch = 0;
    this.c = {};                     // damped current values
    this.seed = Math.random() * 100;
    this.setYaw(0);
  }

  /* -------------------------------------------------------------------- *
   *  BUILD — every static piece is collected per bone and merged per material, so a whole
   *  person costs only a handful of draw calls.
   * -------------------------------------------------------------------- */
  _build() {
    const o = this.opts, f = o.female, J = this.j;
    const cs = HumanFX.castShadows && o.castShadow !== false;
    const body = new THREE.Group(); body.scale.setScalar(o.scale); this.root.add(body); this.body = body;
    const group = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    /* ---- merge collector ---- */
    const bag = new Map();
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
    const put = (bone, g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz); _m.compose(_p, _q, _s);
      const c = g.clone(); c.applyMatrix4(_m);
      const key = bone.uuid + '|' + m.uuid; let e = bag.get(key); if (!e) { e = { bone, m, list: [] }; bag.set(key, e); } e.list.push(c);
    };
    const flush = () => {
      for (const e of bag.values()) {
        const g = e.list.length === 1 ? e.list[0] : mergeGeometries(e.list, false);
        const mesh = new THREE.Mesh(g, e.m); mesh.castShadow = cs; e.bone.add(mesh);
      }
      bag.clear();
    };
    const SPH = geo('u_sph', () => new THREE.SphereGeometry(1, 16, 12));
    const BOX = geo('u_box', () => new THREE.BoxGeometry(1, 1, 1));
    const CYL = geo('u_cyl', () => new THREE.CylinderGeometry(1, 1, 1, 14));
    const sph = (bone, m, r, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => put(bone, SPH, m, x, y, z, rx, ry, rz, r * sx, r * sy, r * sz);
    const box = (bone, m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => put(bone, BOX, m, x, y, z, rx, ry, rz, w, h, d);
    const cyl = (bone, m, rt, rb, h, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sz = 1) => put(bone, geo(`cyl_${rt}_${rb}`, () => new THREE.CylinderGeometry(rt, rb, 1, 16)), m, x, y, z, rx, ry, rz, sx, h, sz);
    const capsGeo = (len, r) => geo(`cap_${len}_${r}`, () => { const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, 8); g.translate(0, -len / 2, 0); return g; });

    /* ---- materials ---- */
    const cloth = { cloth: true };
    const hv = [...(o.id || 'x')].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const skin = skinMaterial(o.skin, hv), skinDark = skinMaterial(new THREE.Color(o.skin).multiplyScalar(0.84).getHex(), hv);
    const lipM = mat(new THREE.Color(o.skin).lerp(new THREE.Color(f ? 0xa23c4a : 0x7a3a34), 0.55).getHex(), 0.45);
    const hairM = hairMaterial(o.hairColor);
    const knit = o.style === 'sweater' || o.style === 'polo';
    const shirtM = clothMaterial(o.shirt, { kind: 'oxford', rough: 0.62 });
    const suitM = clothMaterial(o.top, { kind: knit ? 'knit' : 'twill', rough: knit ? 0.92 : 0.8, stripeTex: o.pinstripe ? stripeTex(o.pinstripe) : null });
    const trouserM = clothMaterial(o.bottom, { kind: 'twill', rough: 0.82 });
    const shoeM = mat(o.shoe, 0.28, 0.15), soleM = mat(0x050506, 0.7);
    const beltM = mat(0x16100c, 0.4, 0.1), metalM = mat(0xc9ced6, 0.25, 0.9);
    const style = o.style, sleeved = style === 'suit' || style === 'blazer';
    const garmentM = (style === 'shirt' || style === 'rolled' || style === 'vest') ? shirtM : suitM;   // visible torso garment
    const sleeveM = (style === 'shirt' || style === 'rolled' || style === 'vest') ? shirtM : suitM;
    const broad = o.build === 'broad', lean = o.build === 'lean';
    const W = (f ? 0.9 : 1) * (broad ? 1.05 : lean ? 0.94 : 1);       // shoulder / chest width factor
    const Dp = broad ? 1.06 : 1;                                       // depth factor

    /* ---- torso ring tables ---- */
    const ringsPelvis = [
      { y: -0.115, rx: (f ? 0.152 : 0.152) * W, rz: 0.098, cz: -0.004 }, { y: -0.07, rx: (f ? 0.17 : 0.164) * (broad ? 1.05 : 1), rz: 0.108, cz: -0.002 },
      { y: -0.01, rx: (f ? 0.152 : 0.152) * W, rz: 0.1 }, { y: 0.06, rx: (f ? 0.128 : 0.144) * W, rz: 0.094 },
    ];
    const ringsSpine = [
      { y: 0, rx: (f ? 0.128 : 0.144) * W, rz: 0.094 }, { y: 0.1, rx: (f ? 0.128 : 0.146) * W, rz: 0.096 }, { y: 0.24, rx: (f ? 0.146 : 0.164) * W, rz: 0.106 * Dp },
    ];
    const bust = f ? 0.014 : 0;
    const ringsChest = [
      { y: 0, rx: (f ? 0.146 : 0.164) * W, rz: 0.106 * Dp }, { y: 0.07, rx: (f ? 0.158 : 0.182) * W, rz: 0.118 * Dp + bust, cz: bust * 0.4 },
      { y: 0.16, rx: (f ? 0.162 : 0.19) * W, rz: 0.12 * Dp + bust, cz: bust * 0.3 }, { y: 0.24, rx: (f ? 0.16 : 0.196) * W, rz: 0.106 * Dp, cz: -0.004 },
      { y: 0.29, rx: (f ? 0.15 : 0.184) * W, rz: 0.084, cz: -0.006 }, { y: 0.32, rx: 0.1, rz: 0.07, cz: -0.006 }, { y: 0.345, rx: 0.056, rz: 0.056, cz: -0.004 },
    ];
    const grow = (rings, dx, dz, gaps) => rings.map((r, i) => ({ ...r, rx: r.rx + dx, rz: r.rz + dz, gap: gaps ? gaps[i] : undefined }));
    const jacketGapsSpine = [0, 0.02, 0.14], jacketGapsChest = [0.14, 0.2, 0.27, 0.33, 0.44, 0.9, 1.5];

    // pelvis + trousers
    J.pelvis = group(body, 0, STAND_Y, 0);
    put(J.pelvis, loftGeo(ringsPelvis, { seg: 24, caps: true }), trouserM);
    J.spine = group(J.pelvis, 0, 0.06, 0);
    J.chest = group(J.spine, 0, 0.24, 0);
    // shirt (inner)
    put(J.spine, loftGeo(grow(ringsSpine, 0.003, 0.003), { seg: 24 }), shirtM);
    put(J.chest, loftGeo(grow(ringsChest, 0.003, 0.003), { seg: 24, caps: true }), shirtM);
    if (style === 'shirt' || style === 'rolled' || style === 'vest') {
      put(J.pelvis, loftGeo([{ y: -0.035, rx: ringsPelvis[2].rx + 0.004, rz: ringsPelvis[2].rz + 0.004 }, { y: 0.06, rx: ringsPelvis[3].rx + 0.004, rz: ringsPelvis[3].rz + 0.004 }], { seg: 24 }), shirtM);
    }
    if (sleeved) {
      // jacket: hem + body with a V-opening at the front
      const jp = grow(ringsPelvis, 0.016, 0.018); jp[0].y = -0.15; jp[0].rx += 0.012; jp[0].rz += 0.012; jp[1].y = -0.095; jp[1].rx += 0.004;
      put(J.pelvis, loftGeo(jp.map((r, i) => ({ ...r, gap: i < 2 ? 0.02 : 0.02 })), { seg: 26 }), suitM);
      put(J.spine, loftGeo(grow(ringsSpine, 0.016, 0.017, jacketGapsSpine), { seg: 26 }), suitM);
      put(J.chest, loftGeo(grow(ringsChest, 0.014, 0.016, jacketGapsChest), { seg: 26 }), suitM);
      const bz = frontZ(grow(ringsSpine, 0.016, 0.017), 0.08);
      for (const y of [0.05, 0.14]) cyl(J.spine, mat(0x090a0d, 0.4, 0.3), 0.008, 0.008, 0.004, 0, y, bz + 0.002, Math.PI / 2);
    } else if (style === 'vest') {
      put(J.spine, loftGeo(grow(ringsSpine, 0.012, 0.012, [0, 0.05, 0.3]), { seg: 24 }), suitM);
      put(J.chest, loftGeo(grow(ringsChest.slice(0, 5), 0.011, 0.012, [0.3, 0.5, 0.72, 0.9, 1.0]), { seg: 24 }), suitM);
    } else if (style === 'sweater') {
      put(J.spine, loftGeo(grow(ringsSpine, 0.012, 0.012), { seg: 24 }), suitM);
      put(J.chest, loftGeo(grow(ringsChest, 0.012, 0.013), { seg: 24, caps: true }), suitM);
      put(J.pelvis, loftGeo([{ y: -0.06, rx: ringsPelvis[1].rx + 0.012, rz: ringsPelvis[1].rz + 0.012 }, { y: -0.01, rx: ringsPelvis[2].rx + 0.012, rz: ringsPelvis[2].rz + 0.012 }, { y: 0.06, rx: ringsPelvis[3].rx + 0.012, rz: ringsPelvis[3].rz + 0.012 }], { seg: 24 }), suitM);
    } else if (style === 'polo') {
      put(J.spine, loftGeo(grow(ringsSpine, 0.008, 0.008), { seg: 24 }), suitM);
      put(J.chest, loftGeo(grow(ringsChest, 0.008, 0.009), { seg: 24, caps: true }), suitM);
      put(J.pelvis, loftGeo([{ y: -0.035, rx: ringsPelvis[2].rx + 0.008, rz: ringsPelvis[2].rz + 0.008 }, { y: 0.06, rx: ringsPelvis[3].rx + 0.008, rz: ringsPelvis[3].rz + 0.008 }], { seg: 24 }), suitM);
    }
    // belt (not under a jacket)
    if (!sleeved && style !== 'sweater') {
      put(J.pelvis, loftGeo([{ y: -0.006, rx: ringsPelvis[3].rx + 0.011, rz: ringsPelvis[3].rz + 0.011 }, { y: 0.03, rx: ringsPelvis[3].rx + 0.011, rz: ringsPelvis[3].rz + 0.011 }], { seg: 24 }), beltM);
      box(J.pelvis, metalM, 0.032, 0.026, 0.008, 0, 0.012, ringsPelvis[3].rz + 0.016);
    }
    // collar / neckline
    J.neck = group(J.chest, 0, 0.318, 0.005);
    cyl(J.neck, skin, 0.047, 0.054, 0.1, 0, 0.025, 0);
    const cgz = 0.052;
    if (style === 'sweater') cyl(J.neck, suitM, 0.062, 0.066, 0.045, 0, -0.012, 0);
    else if (style === 'polo') { cyl(J.neck, suitM, 0.058, 0.064, 0.03, 0, -0.008, 0); for (const s of [1, -1]) box(J.neck, suitM, 0.05, 0.012, 0.045, s * 0.032, -0.012, 0.052, -0.35, s * 0.55, 0); box(J.chest, mat(new THREE.Color(o.top).multiplyScalar(0.8).getHex(), 0.8), 0.022, 0.1, 0.006, 0, 0.255, frontZ(ringsChest, 0.255) + 0.014); }
    else {
      put(J.neck, new THREE.CylinderGeometry(0.058, 0.064, 0.036, 20, 1, true), shirtM.clone ? mat(o.shirt, 0.62, 0, { cloth: true, side: THREE.DoubleSide }) : shirtM, 0, -0.004, 0);
      for (const s of [1, -1]) box(J.neck, shirtM, 0.06, 0.012, 0.055, s * 0.036, -0.012, 0.046, -0.5, s * 0.5, s * 0.15);
    }
    // tie
    if (o.tie && (sleeved || style === 'shirt' || style === 'vest')) {
      const tm = mat(o.tie, 0.4, 0.1);
      box(J.neck, tm, 0.032, 0.03, 0.03, 0, -0.02, 0.058);                                           // knot
      const z1 = frontZ(ringsChest, 0.2) + 0.008;
      box(J.chest, tm, 0.03, 0.16, 0.006, 0, 0.2, z1, 0.08);
      box(J.chest, tm, 0.04, 0.1, 0.006, 0, 0.07, frontZ(ringsChest, 0.07) + 0.008, 0.03);
      box(J.spine, tm, 0.04, 0.12, 0.006, 0, 0.17, frontZ(ringsSpine, 0.17) + 0.016 + (sleeved ? 0 : 0.004));
    }
    // id badge + lanyard
    if (o.badge) {
      const lan = mat(0x2f7de0, 0.6);
      for (const s of [1, -1]) box(J.chest, lan, 0.01, 0.28, 0.004, s * 0.045, 0.19, frontZ(ringsChest, 0.19) + 0.01, 0.05, 0, -s * 0.34);
      box(J.chest, mat(0xf4f6fa, 0.5), 0.055, 0.082, 0.004, 0.0, 0.055, frontZ(ringsChest, 0.055) + 0.011, 0.1);
      box(J.chest, mat(0x2f7de0, 0.5), 0.055, 0.018, 0.005, 0.0, 0.083, frontZ(ringsChest, 0.083) + 0.0125, 0.1);
    }

    // head
    J.head = group(J.neck, 0, 0.062, 0.01);
    this._buildHead(J.head, { put, sph, box, cyl, group, skin, skinDark, lipM, hairM, shirtM, metalM, flush: null, capsGeo, SPH, hv });
    if (o.earpiece) {
      const bl = mat(0x08090b, 0.4, 0.2);
      sph(J.head, bl, 0.011, 0.088, 0.1, 0.0, 0.7, 1.3, 0.9);
      const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector3(0.085 - 0.012 * t + 0.004 * Math.sin(t * 26), 0.095 - t * 0.2, -0.015 - 0.02 * t)); }
      put(J.head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0026, 5, false), mat(0x2a2c31, 0.5));
      put(J.neck, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.078, 0.0, -0.034), new THREE.Vector3(0.082, -0.02, -0.036), new THREE.Vector3(0.07, -0.05, -0.05)]), 8, 0.0026, 5, false), mat(0x2a2c31, 0.5));
    }

    /* ---- arms ---- */
    const shoulderX = (f ? 0.163 : 0.2) * W + 0.004;
    const upW = (f ? 0.034 : 0.042) * (broad ? 1.08 : 1), foreW = f ? 0.029 : 0.035;
    const rolled = style === 'rolled', shortSleeve = style === 'polo';
    for (const s of ['L', 'R']) {
      const sx = s === 'L' ? 1 : -1;
      const sh = group(J.chest, sx * shoulderX, 0.285, 0); J['sh' + s] = sh;
      const sleeveBulk = sleeved ? 0.006 : style === 'sweater' ? 0.007 : 0.004;
      // shoulder cap
      sph(sh, sleeveM, upW + sleeveBulk - 0.002, 0, -0.004, 0, 1.0, 0.95, 1.0);
      const upperSkin = limbGeo(L_UP + 0.012, upW - 0.002, 0.04, 0.3, 0.0);
      const sleeveLen = shortSleeve ? 0.14 : L_UP + 0.01;
      if (shortSleeve) put(sh, upperSkin, skin);
      put(sh, limbGeo(sleeveLen, upW + sleeveBulk, shortSleeve ? upW * 0.92 + sleeveBulk : 0.042 + sleeveBulk, 0.28, 0.004), sleeveM);
      const el = group(sh, 0, -L_UP, 0); J['el' + s] = el;
      sph(el, shortSleeve ? skin : sleeveM, 0.04 + (shortSleeve ? 0 : sleeveBulk), 0, 0, 0);
      put(el, limbGeo(L_FORE + 0.012, foreW + 0.005, foreW - 0.011, 0.18, 0.006), skin);
      let sleeveEnd = L_FORE - 0.002;
      if (sleeved) sleeveEnd = L_FORE - 0.035; else if (rolled) sleeveEnd = 0.075; else if (shortSleeve) sleeveEnd = 0;
      if (sleeveEnd > 0.01) put(el, limbGeo(sleeveEnd, foreW + 0.005 + sleeveBulk, foreW - 0.008 + sleeveBulk + (rolled ? 0.004 : 0), 0.18, 0.004), sleeveM);
      if (rolled) cyl(el, sleeveM, foreW + 0.011, foreW + 0.011, 0.025, 0, -0.07, 0);
      if (sleeved) cyl(el, shirtM, foreW - 0.003, foreW - 0.006, 0.04, 0, -(L_FORE - 0.028), 0);
      const wr = group(el, 0, -L_FORE, 0); J['wr' + s] = wr;
      // hand: palm + 4 fingers + thumb (thumb on the +Z side)
      box(wr, skin, 0.03, 0.092, 0.09, 0, -0.05, 0.004);
      const fl = [0.072, 0.082, 0.078, 0.062], fz = [0.03, 0.01, -0.01, -0.03];
      fl.forEach((len, i) => put(wr, capsGeo(len, 0.0118), skin, 0, -0.092, fz[i] * 1.05, 0, 0, -sx * (0.1 + i * 0.03)));
      put(wr, capsGeo(0.062, 0.0125), skin, sx * -0.004, -0.03, 0.044, 0.35, 0, sx * -0.18);
      if (o.watch && s === 'L') { cyl(wr, mat(0x15181e, 0.4, 0.5), 0.034, 0.034, 0.016, 0, 0.01, 0); cyl(wr, metalM, 0.0375, 0.0375, 0.0014, 0, 0.018, 0); box(wr, mat(0x0b1522, 0.2, 0.2), 0.012, 0.004, 0.024, -0.034 * sx, 0.01, 0, 0, 0, 0); }
    }
    // phone prop (shown while "calling")
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.085, 0.01), mat(0x08090c, 0.3, 0.4)); phone.position.set(-0.012, -0.095, 0.03); phone.visible = false;
    J.wrR.add(phone); this.phone = phone;

    /* ---- legs ---- */
    for (const s of ['L', 'R']) {
      const sx = s === 'L' ? 1 : -1;
      const hip = group(J.pelvis, sx * 0.092, -0.02, 0); J['hip' + s] = hip;
      const thW = f ? 0.082 : 0.092;
      put(hip, limbGeo(L_THIGH + 0.02, thW, 0.062, 0.2, 0.004), trouserM, 0, 0, 0, 0, 0, 0, 1.0, 1, 1.08);
      const kn = group(hip, 0, -L_THIGH, 0); J['kn' + s] = kn;
      sph(kn, trouserM, 0.062, 0, 0, 0);
      put(kn, limbGeo(L_SHIN + 0.02, 0.06, 0.05, 0.3, 0.008), trouserM);
      cyl(kn, trouserM, 0.053, 0.058, 0.05, 0, -L_SHIN + 0.025, 0.0);                                  // trouser break at the shoe
      const an = group(kn, 0, -L_SHIN, 0); J['an' + s] = an;
      // shoe: heel counter + vamp + toe + sole
      sph(an, shoeM, 0.05, 0, -0.034, -0.012, 0.95, 0.9, 1.05);
      sph(an, shoeM, 0.05, 0, -0.05, 0.075, 0.9, 0.58, 1.65);
      sph(an, shoeM, 0.04, 0, -0.056, 0.17, 1.0, 0.52, 1.2);
      box(an, soleM, 0.092, 0.014, 0.3, 0, -0.068, 0.062);
      box(an, soleM, 0.075, 0.02, 0.06, 0, -0.07, -0.036);
    }
    this.hipY = -0.02;
    flush();
  }

  _buildHead(head, k) {
    const o = this.opts, { put, sph, box, cyl, skin, skinDark, lipM, hairM, SPH, capsGeo } = k, f = o.female;
    const faceM = o.faceHidden ? new THREE.MeshBasicMaterial({ color: 0x050405 }) : skin;
    if (o.faceHidden) { faceM.userData.own = true; }
    // cranium, jaw, chin, cheeks
    sph(head, faceM, 0.1, 0, 0.128, -0.004, 0.8, 1.0, 1.0);
    sph(head, faceM, 0.077, 0, 0.066, 0.014, f ? 0.8 : 0.88, 0.96, 0.96);
    sph(head, faceM, 0.021, 0, 0.03, 0.05, f ? 0.7 : 1.0, 0.75, 0.8);
    
    // ears
    for (const sx of [-1, 1]) sph(head, skin, 0.02, sx * 0.083, 0.11, -0.005, 0.45, 1.25, 0.8);
    if (!o.faceHidden) {
      const dark = mat(0x0b0908, 0.25), irisCol = o.skin > 0xb09070 ? 0x4a2f1b : 0x2f1d10;
      for (const sx of [-1, 1]) {
        sph(head, scleraMaterial(), 0.0125, sx * 0.034, 0.129, 0.087, 1.1, 0.78, 0.6);
        put(head, geo('iris', () => new THREE.CircleGeometry(0.0072, 20)), irisMaterial(irisCol), sx * 0.034, 0.129, 0.0956, 0, sx * 0.06, 0);
        sph(head, corneaMaterial(), 0.0085, sx * 0.034, 0.129, 0.0935, 1, 1, 0.5);
        // upper lid
        put(head, geo('lid', () => new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI * 0.38)), skinDark, sx * 0.034, 0.129, 0.087, 0, 0, 0, 0.0135 * 1.1, 0.0135 * 0.9, 0.0135 * 0.66);
        // brow
        box(head, hairM, 0.034, f ? 0.0032 : 0.0046, 0.006, sx * 0.036, f ? 0.1525 : 0.1505, 0.0885, 0.05, sx * -0.18, sx * (f ? 0.07 : 0.02));
      }
      // nose
      put(head, geo('nbridge', () => { const g = new THREE.CapsuleGeometry(0.0085, 0.028, 3, 8); return g; }), skin, 0, 0.114, 0.098, -0.42, 0, 0);
      sph(head, skin, 0.0145, 0, 0.094, 0.11, 0.9, 0.78, 1.0);
      for (const sx of [-1, 1]) sph(head, skin, 0.0085, sx * 0.0145, 0.092, 0.101, 1, 0.9, 0.9);
      // mouth
      sph(head, lipM, 0.0165, 0, 0.0655, 0.0905, 1.55, 0.36, 0.62);
      sph(head, lipM, 0.0165, 0, 0.0525, 0.0905, 1.35, 0.46, 0.72);
      box(head, dark, 0.034, 0.0026, 0.004, 0, 0.0602, 0.0968);
      if (!f) box(head, skinDark, 0.016, 0.005, 0.008, 0, 0.078, 0.096);
    }
    // eyewear
    if (o.glasses === 'sun' && !o.faceHidden) {
      const sg = mat(0x040405, 0.08, 0.6), fr = mat(0x0a0a0c, 0.35, 0.3);
      for (const sx of [-1, 1]) {
        sph(head, sg, 0.03, sx * 0.037, 0.128, 0.087, 0.88, 0.66, 0.5, 0, sx * -0.12, 0);
        box(head, fr, 0.006, 0.007, 0.16, sx * 0.0795, 0.134, 0.0);
      }
      box(head, fr, 0.02, 0.006, 0.006, 0, 0.136, 0.102); box(head, fr, 0.118, 0.005, 0.005, 0, 0.1445, 0.096);
    } else if (o.glasses === 'clear' && !o.faceHidden) {
      const fr = mat(0x14161b, 0.3, 0.4);
      for (const sx of [-1, 1]) {
        put(head, geo('rim', () => new THREE.TorusGeometry(0.02, 0.0025, 6, 20)), fr, sx * 0.037, 0.129, 0.1, 0, 0, 0, 1, 0.82, 1);
        box(head, fr, 0.005, 0.005, 0.17, sx * 0.082, 0.132, 0.012);
      }
      box(head, fr, 0.016, 0.004, 0.004, 0, 0.134, 0.101);
    }
    // facial hair: a clean shell along the jaw (soft shadow for stubble, groomed texture for a full beard)
    if (o.beard && !o.faceHidden) {
      const full = o.beard === 'full', hm = full ? hairM : (new THREE.MeshStandardMaterial({ color: o.hairColor, transparent: true, opacity: 0.2, roughness: 0.9, depthWrite: false }));
      const g = shellGeometry({ center: new THREE.Vector3(0, 0.066, 0.014), radii: new THREE.Vector3(0.0677, 0.0739, 0.0739), thick: full ? 0.0075 : 0.0012,
        thetaMin: (a) => (a < 0.3 ? 1.95 : 1.36 + 0.59 * (1 - sstep(0.3, 0.75, a))),                 // cheek line; open around the mouth
        thetaMax: (a) => (a < 1.25 ? 2.55 : 2.55 - 0.7 * sstep(1.25, 2.0, a)),                       // chin / jaw line fading to the ears
        volume: (th) => 1 + (th > 2.2 ? 0.8 : 0), rows: 14, cols: 48 });
      const m = new THREE.Mesh(g, hm); m.castShadow = false; head.add(m);
      if (full) { sph(head, hairM, 0.0125, 0, 0.0765, 0.0905, 1.7, 0.32, 0.5); }               // moustache
    }
    // hair: one smooth shell hugging the skull, clean hairline, volume at the crown
    const hair = o.hair;
    const SK = { center: new THREE.Vector3(0, 0.128, -0.004), radii: new THREE.Vector3(0.0805, 0.1005, 0.1005) };
    const mkHair = (opt) => { const m = new THREE.Mesh(shellGeometry(Object.assign({}, SK, opt)), hairM); m.castShadow = HumanFX.castShadows; head.add(m); return m; };
    const front = (a, v) => v;
    if (hair === 'short' || hair === 'side' || hair === 'ponytail' || hair === 'bun') {
      mkHair({ thick: 0.0075,
        thetaMax: (a) => { const hl = 0.8 + 0.18 * sstep(0.35, 0.85, a); const side = 1.5, back = 2.05; return a < 0.85 ? hl : a < 1.45 ? hl + (side - hl) * sstep(0.85, 1.45, a) : side + (back - side) * sstep(1.9, 2.8, a); },
        volume: (th, a) => 1 + 0.45 * Math.exp(-th * th / 0.55) + (hair === 'side' && a < 1.2 ? 0.35 * Math.exp(-Math.pow(th - 0.5, 2) / 0.15) : 0) });
      if (hair === 'ponytail') { put(head, capsGeo(0.15, 0.024), hairM, 0, 0.1, -0.12, 0.5, 0, 0); box(head, mat(0x1a1a1f, 0.5), 0.045, 0.01, 0.01, 0, 0.115, -0.108, 0.5); }
      if (hair === 'bun') sph(head, hairM, 0.045, 0, 0.205, -0.07);
    } else if (hair === 'long') {
      mkHair({ thick: 0.0085, hang: 0.19, hangFrom: 1.75, flare: 0.5,
        thetaMax: (a) => (a < 0.85 ? 0.8 + 0.18 * sstep(0.35, 0.85, a) : a < 1.45 ? 0.98 + (2.35 - 0.98) * sstep(0.85, 1.45, a) : 2.35 + 0.4 * sstep(1.9, 2.8, a)),
        volume: (th) => 1 + 0.35 * Math.exp(-th * th / 0.55) });
    }
    // hat (fedora)
    if (o.hat) {
      const hm = mat(o.hat, 0.55), band = mat(0x1b2a44, 0.4, 0.2);
      const g = new THREE.Group(); g.position.set(0, 0.205, 0.01); g.rotation.x = 0.16; head.add(g);
      const brim = new THREE.Mesh(geo('brim', () => new THREE.CylinderGeometry(0.225, 0.225, 0.011, 40)), hm);
      brim.scale.set(1, 1, 1.05); brim.castShadow = true; g.add(brim);
      const crown = new THREE.Mesh(geo('crown', () => new THREE.CylinderGeometry(0.09, 0.108, 0.115, 28)), hm);
      crown.position.y = 0.06; crown.castShadow = true; g.add(crown);
      const dent = new THREE.Mesh(geo('dent', () => new THREE.CylinderGeometry(0.056, 0.09, 0.03, 20)), hm); dent.position.y = 0.128; g.add(dent);
      const bd = new THREE.Mesh(geo('band', () => new THREE.CylinderGeometry(0.1105, 0.1115, 0.026, 28)), band); bd.position.y = 0.018; g.add(bd);
    }
  }

  /* -------------------------------------------------------------------- *
   *  PLACEMENT / HIGH-LEVEL ACTIONS
   * -------------------------------------------------------------------- */
  setPosition(x, y, z) { this.root.position.set(x, y, z); return this; }
  setYaw(yaw) { this.yaw = yaw; this.root.rotation.y = yaw; return this; }
  get position() { return this.root.position; }
  fwd(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  /** Place the character already seated with root at the chair centre. */
  seatInstantly(yaw) { this.setYaw(yaw); this.sitProg = 1; this.sitDir = 0; this.frameOff = 0; }

  /** Walk a polyline of {x,z} points. Resolves when the last point is reached (and final facing applied). */
  walkPath(points, { speed = 1.25, finalYaw = null } = {}) {
    return new Promise((res) => {
      this.path = points.map((p) => ({ x: p.x, z: p.z }));
      this.pathSpeed = speed; this.pathRes = res; this.finalYaw = finalYaw;
    });
  }
  /** Turn on the spot to face a yaw (radians) or a world point {x,z}. */
  turnTo(target) {
    return new Promise((res) => {
      const yaw = typeof target === 'number' ? target : Math.atan2(target.x - this.root.position.x, target.z - this.root.position.z);
      this.faceTarget = yaw; this.faceRes = res;
    });
  }
  gesture(name, dur = 1.6) { return new Promise((res) => { this.g = { name, t: 0, dur, res }; }); }
  lookAt(v) { this.lookTarget = v ? v.clone() : null; }

  /** Stand up from the chair. The root moves forward to the feet so the character ends standing in front of the chair. */
  standUp(dur = 1.5) {
    return new Promise((res) => {
      this.frameOff = FEET_FWD_SEATED; this.typing = false;
      this.sitDir = -1; this.sitDur = dur;
      this.sitRes = () => {
        this.root.position.addScaledVector(this.fwd(), FEET_FWD_SEATED); this.frameOff = 0; res();
      };
    });
  }
  /** Sit down. Character must be standing in front of the chair, back to it, at the 'stand spot'. */
  sitDown(dur = 1.6) {
    return new Promise((res) => {
      this.root.position.addScaledVector(this.fwd(), -FEET_FWD_SEATED);
      this.frameOff = FEET_FWD_SEATED; this.sitDir = 1; this.sitDur = dur;
      this.sitRes = () => { this.frameOff = 0; res(); };
    });
  }
  get isSeated() { return this.sitProg > 0.99; }

  /* -------------------------------------------------------------------- *
   *  PER-FRAME
   * -------------------------------------------------------------------- */
  update(dt, time) {
    dt = Math.min(dt, 0.05);
    this._move(dt);
    this._pose(dt, time);
  }

  _move(dt) {
    const pos = this.root.position;
    this.moving = false; this.turning = false;
    const TURN = 3.4;
    if (this.path.length) {
      const tgt = this.path[0];
      const dx = tgt.x - pos.x, dz = tgt.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const last = this.path.length === 1;
      if (dist < (last ? 0.04 : 0.28)) {
        this.path.shift();
        if (!this.path.length) {
          this.curSpeed = 0;
          if (this.finalYaw != null) { this.faceTarget = this.finalYaw; this.faceRes = null; }
          const r = this.pathRes; this.pathRes = null; if (r) r();
        }
      } else {
        const want = Math.atan2(dx, dz);
        const diff = angDiff(this.yaw, want);
        this.setYaw(this.yaw + clamp(diff, -TURN * dt, TURN * dt));
        const aligned = Math.abs(diff) < 0.55;
        this.turning = !aligned;
        let vT = aligned ? this.pathSpeed : 0;
        if (last) vT = Math.min(vT, Math.sqrt(2 * 2.2 * dist) + 0.05);
        this.curSpeed = damp(this.curSpeed, vT, dt, 6);
        const step = Math.min(this.curSpeed * dt, dist);
        pos.x += Math.sin(this.yaw) * step; pos.z += Math.cos(this.yaw) * step;
        this.walkPhase += step * 0.81;
        this.moving = this.curSpeed > 0.05;
        if (this.turning) this.walkPhase += Math.abs(diff) * 0.012;
      }
    } else if (this.faceTarget != null) {
      const diff = angDiff(this.yaw, this.faceTarget);
      const d = clamp(diff, -TURN * 0.8 * dt, TURN * 0.8 * dt);
      this.setYaw(this.yaw + d);
      this.turning = Math.abs(diff) > 0.12 && this.sitProg < 0.5;
      if (this.turning) this.walkPhase += Math.abs(d) * 0.22;
      if (Math.abs(diff) < 0.02) { this.faceTarget = null; const r = this.faceRes; this.faceRes = null; if (r) r(); }
    }
  }

  _pose(dt, time) {
    const J = this.j, c = this.c, t = time + this.seed;
    // ---- sit blend
    if (this.sitDir !== 0) {
      this.sitProg = clamp(this.sitProg + this.sitDir * dt / this.sitDur, 0, 1);
      if ((this.sitDir > 0 && this.sitProg >= 1) || (this.sitDir < 0 && this.sitProg <= 0)) {
        this.sitDir = 0; const r = this.sitRes; this.sitRes = null; if (r) r();
      }
    }
    const e = ease(this.sitProg), lean = Math.sin(Math.PI * this.sitProg);
    const seated = e > 0.001;
    // ---- activity blends
    const wTarget = (this.moving ? 1 : this.turning ? 0.55 : 0) * (1 - e);
    this.walkAmt = damp(this.walkAmt, wTarget, dt, 7);
    this.typeAmt = damp(this.typeAmt, (this.typing && this.sitProg > 0.95) ? 1 : 0, dt, 5);
    this.guardAmt = damp(this.guardAmt, (this.guard && this.sitProg < 0.05) ? 1 : 0, dt, 4);
    this.talkAmt = damp(this.talkAmt, this.talking ? 1 : 0, dt, 5);
    const W = this.walkAmt, ph = this.walkPhase;

    // ---- pelvis and feet targets (root space)
    let pelvisY = lerp(STAND_Y, SEAT_Y, e);
    let pelvisZ = this.frameOff * (1 - e) + 0.07 * lean;
    const gaitY = 0.84 + 0.04 * (0.5 - 0.5 * Math.cos(4 * Math.PI * ph));
    pelvisY = lerp(pelvisY, gaitY, W);
    const breath = Math.sin(t * 1.7) * 0.004;
    pelvisY += breath * (1 - W);
    const S = 0.74 * W, BETA = 0.6;
    const feet = [];
    const inSeatFrame = this.frameOff > 0 || e > 0.001;
    for (let i = 0; i < 2; i++) {
      const p = ((ph + i * 0.5) % 1 + 1) % 1;
      let z, lift = 0;
      if (p < BETA) { z = S / 2 - S * (p / BETA); }
      else { const u = (p - BETA) / (1 - BETA); z = -S / 2 + S * ease(u); lift = 0.085 * Math.sin(Math.PI * u) * Math.min(1, W * 1.5); }
      const stagger = (i === 0 ? 1 : -1) * (0.025 + 0.04 * this.guardAmt) * (this.seed % 2 < 1 ? 1 : -1) * (1 - W);
      // in the seat frame feet stay planted in front of the chair; otherwise they follow the gait
      feet.push({ z: inSeatFrame ? FEET_FWD_SEATED : z + stagger, y: ANKLE_H + lift, p });
    }
    for (let i = 0; i < 2; i++) {
      const hip = i === 0 ? J.hipL : J.hipR, kn = i === 0 ? J.knL : J.knR, an = i === 0 ? J.anL : J.anR;
      const hy = pelvisY + this.hipY, hz = pelvisZ;
      const sp = (i === 0 ? 1 : -1) * 0.1 * this.guardAmt, cz = Math.cos(sp);
      const r = ik2(hy, hz, hy - (hy - feet[i].y) / cz, feet[i].z, L_THIGH, L_SHIN, -1);
      hip.rotation.set(r.a1, sp * 1.1, sp); kn.rotation.x = r.a2; an.rotation.z = -sp; an.rotation.y = -sp * 0.6;
      const toe = (feet[i].p > BETA ? 0.35 * Math.sin(Math.PI * (feet[i].p - BETA) / (1 - BETA)) : 0) * W;
      const pp = feet[i].p, heel = pp < 0.14 ? -0.22 * (1 - pp / 0.14) : 0, push = pp > 0.4 && pp < BETA ? 0.38 * ease((pp - 0.4) / (BETA - 0.4)) : 0;
      an.rotation.x = -(r.a1 + r.a2) - (pp > BETA ? 0.15 * W : 0) + (heel + push) * W;
    }
    J.pelvis.position.set(0.012 * Math.sin(TAU * ph) * W + this.guardAmt * 0.014 * Math.sin(t * 0.31), pelvisY, pelvisZ);
    J.pelvis.rotation.y = 0.07 * Math.sin(TAU * ph) * W;

    // ---- spine / head targets
    let spineX = lean * 0.42 * (this.sitDir < 0 ? 1 : 0.8) + e * 0.05 + this.typeAmt * 0.12 + W * 0.04;
    let chestY = -0.09 * Math.sin(TAU * ph) * W;
    let chestX = Math.sin(t * 1.7) * 0.012;
    let headX = 0, headY = 0, headZ = 0, neckX = this.typeAmt * 0.07;
    // look target
    if (this.lookTarget && !this.moving) {
      const hp = new THREE.Vector3(); J.head.getWorldPosition(hp);
      const dx = this.lookTarget.x - hp.x, dz = this.lookTarget.z - hp.z, dy = this.lookTarget.y - hp.y;
      const ly = clamp(angDiff(this.yaw, Math.atan2(dx, dz)), -1.1, 1.1);
      const lp = clamp(Math.atan2(-dy, Math.hypot(dx, dz)), -0.4, 0.5);
      this.lookYaw = damp(this.lookYaw, ly, dt, 5); this.lookPitch = damp(this.lookPitch, lp, dt, 5);
    } else { this.lookYaw = damp(this.lookYaw, 0, dt, 3); this.lookPitch = damp(this.lookPitch, 0, dt, 3); }
    headY += this.lookYaw * 0.65; chestY += this.lookYaw * 0.2; headX += this.lookPitch * 0.8;
    if (this.opts.faceHidden) { headX += 0.2; headY += Math.sin(t * 0.35) * 0.18; headZ += Math.sin(t * 0.27) * 0.03; }
    else { headY += Math.sin(t * 0.5) * 0.04 * (1 - W) * (this.typing ? 1.6 : 0.6); }
    headX += this.typeAmt * 0.12 * (0.6 + 0.4 * Math.sin(t * 0.8));

    // ---- arms (targets)
    const armGap = 0.07 + ((this.opts.style === 'suit' || this.opts.style === 'blazer') ? 0.035 : 0) + (this.opts.build === 'broad' ? 0.05 : 0) + (this.opts.female ? -0.015 : 0);
    const T = {
      shL: 0.05, shLz: armGap, elL: -0.2, shR: 0.05, shRz: -armGap, elR: -0.2,
    };
    // walking swing
    if (W > 0.001) {
      const sw = Math.cos(TAU * ph);
      T.shR = lerp(T.shR, -0.5 * sw, W); T.shL = lerp(T.shL, 0.5 * sw, W);
      T.elR = lerp(T.elR, -0.28 - 0.3 * Math.max(0, -sw), W); T.elL = lerp(T.elL, -0.28 - 0.3 * Math.max(0, sw), W);
    }
    // seated hands rest (lap) when not typing
    if (e > 0.001) {
      const rest = { shL: -0.35, shLz: 0.1, elL: -1.0, shR: -0.35, shRz: -0.1, elR: -1.0 };
      for (const k in rest) T[k] = lerp(T[k], rest[k], e);
    }
    // typing IK: wrists reach keyboard
    if (this.typeAmt > 0.001) {
      const shoulderY = pelvisY + 0.06 + 0.24 + 0.285, shoulderZ = pelvisZ + 0.13 * Math.sin(spineX);
      for (const s of ['L', 'R']) {
        const k = s === 'L' ? 0 : 1;
        const tz = 0.52 + 0.012 * Math.sin(t * this.typeRate + k * 2.1) + 0.01 * Math.sin(t * this.typeRate * 0.37 + k);
        const ty = 0.80 + 0.012 * Math.max(0, Math.sin(t * this.typeRate * 1.3 + k * 1.7));
        const r = ik2(shoulderY, shoulderZ, ty, tz, L_UP, L_FORE + 0.06, +1);
        const a1 = r.a1 - spineX; // chest-local
        T['sh' + s] = lerp(T['sh' + s], a1, this.typeAmt);
        T['el' + s] = lerp(T['el' + s], r.a2, this.typeAmt);
        T['sh' + s + 'z'] = lerp(T['sh' + s + 'z'], s === 'L' ? 0.12 : -0.12, this.typeAmt);
      }
    }
    // guard stance: upright, feet shoulder-width, arms natural (or hands loosely clasped), occasional earpiece check
    if (this.guardAmt > 0.001) {
      const a = this.guardAmt; this.guardClock += dt;
      const cyc = this.guardClock % 17, ear = this.opts.earpiece ? ease(clamp(Math.min(cyc / 0.6, (3.2 - cyc) / 0.6), 0, 1)) : 0;
      if (this.opts.guardPose === 'clasp') {
        T.shL = lerp(T.shL, -0.2, a); T.elL = lerp(T.elL, -0.95, a); T.shLz = lerp(T.shLz, -0.2, a);
        T.shR = lerp(T.shR, -0.2, a); T.elR = lerp(T.elR, -0.95, a); T.shRz = lerp(T.shRz, 0.2, a);
      } else {
        T.shL = lerp(T.shL, 0.03, a); T.elL = lerp(T.elL, -0.16, a); T.shLz = lerp(T.shLz, armGap + 0.04, a);
        T.shR = lerp(T.shR, 0.03, a); T.elR = lerp(T.elR, -0.16, a); T.shRz = lerp(T.shRz, -armGap - 0.04, a);
      }
      if (ear > 0.001) { T.shR = lerp(T.shR, -0.55, ear); T.shRz = lerp(T.shRz, 0.12, ear); T.elR = lerp(T.elR, -2.05, ear); headY -= 0.1 * ear; }
      spineX -= 0.035 * a; headX -= 0.05 * a; chestX -= 0.02 * a;
      headY += (Math.sin(t * 0.22) * 0.12 + Math.sin(t * 0.07) * 0.08) * a;
    }
    // talking gestures
    if (this.talkAmt > 0.001) {
      const a = this.talkAmt;
      T.shR = lerp(T.shR, -0.75 + 0.22 * Math.sin(t * 2.3), a * 0.9); T.elR = lerp(T.elR, -1.15 + 0.3 * Math.sin(t * 3.1 + 1), a * 0.9); T.shRz = lerp(T.shRz, -0.2, a * 0.9);
      T.shL = lerp(T.shL, -0.5 + 0.15 * Math.sin(t * 1.9 + 2), a * 0.5); T.elL = lerp(T.elL, -1.2 + 0.2 * Math.sin(t * 2.7), a * 0.5);
      headX += 0.05 * Math.sin(t * 3.3) * a;
    }
    // one-shot gesture overlay
    let phoneOn = false;
    if (this.g) {
      const g = this.g; g.t += dt;
      const w = ease(clamp(Math.min(g.t / 0.3, (g.dur - g.t) / 0.35), 0, 1));
      const m = (k, v) => { T[k] = lerp(T[k], v, w); };
      switch (g.name) {
        case 'wave':
          m('shR', -2.55); m('shRz', -0.5); m('elR', -0.55 + 0.4 * Math.sin(g.t * 10)); headX += 0.06 * w; break;
        case 'greet':
          m('shR', -1.35); m('shRz', -0.25); m('elR', -1.0 + 0.2 * Math.sin(g.t * 9)); headX += 0.12 * Math.sin(g.t * 5) * w; break;
        case 'nod':
          headX += 0.2 * Math.sin(Math.min(g.t, g.dur) / g.dur * TAU * 2) * w; break;
        case 'ack':
          headX += 0.2 * Math.sin(Math.min(g.t, g.dur) / g.dur * TAU * 2) * w;
          m('shR', -0.85); m('elR', -1.0); m('shRz', -0.25); break;
        case 'beckon':
          m('shR', -1.45); m('shRz', -0.35); m('elR', -1.55 + 0.55 * Math.sin(g.t * 8)); break;
        case 'phone':
          m('shR', -0.95); m('shRz', 0.3); m('elR', -1.95); headY += 0.1 * w; phoneOn = w > 0.2; break;
        case 'point':
          m('shR', -1.15); m('shRz', -0.55); m('elR', -0.18); headY += 0.0; break;
        case 'sweep': // open-palm guide gesture with both hands slightly
          m('shR', -1.0 + 0.35 * Math.sin(g.t * 2.2)); m('shRz', -0.6); m('elR', -0.35); m('shL', -0.5); m('elL', -1.1); break;
        case 'think':
          m('shR', -0.9); m('elR', -2.0); m('shRz', 0.1); headX += 0.1 * w; break;
        default: break;
      }
      if (g.t >= g.dur) { this.g = null; const r = g.res; if (r) r(); }
    }
    this.phone.visible = phoneOn;

    // ---- apply damped values
    const D = (k, v, rate = 12) => { c[k] = c[k] === undefined ? v : damp(c[k], v, dt, rate); return c[k]; };
    J.shL.rotation.set(D('shL', T.shL), 0, D('shLz', T.shLz)); J.shR.rotation.set(D('shR', T.shR), 0, D('shRz', T.shRz));
    J.elL.rotation.x = D('elL', T.elL); J.elR.rotation.x = D('elR', T.elR);
    const pro = (Math.PI / 2) * 0.92 * this.typeAmt;
    J.wrL.rotation.set(-0.1 + 0.18 * this.typeAmt * Math.sin(t * this.typeRate * 1.1) + 0.25 * this.typeAmt, -pro, 0); J.wrR.rotation.set(-0.1 + 0.18 * this.typeAmt * Math.sin(t * this.typeRate * 0.9 + 1) + 0.25 * this.typeAmt, pro, 0);
    J.spine.rotation.set(D('spineX', spineX, 9), 0, 0);
    J.chest.rotation.set(chestX, D('chestY', chestY, 8), 0);
    J.neck.rotation.set(D('neckX', neckX, 8), D('headY', headY * 0.45, 7), D('headZ', headZ, 6));
    J.head.rotation.set(D('headX', headX - spineX * 0.55, 8), headY * 0.55, 0);
  }
}
