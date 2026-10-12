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

/* ---- shared geometry / material caches ---------------------------------- */
const GEO = new Map();
const MAT = new Map();
const geo = (k, f) => { let g = GEO.get(k); if (!g) { g = f(); GEO.set(k, g); } return g; };
function mat(color, rough = 0.75, metal = 0.0) {
  const k = color + '_' + rough + '_' + metal;
  let m = MAT.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); MAT.set(k, m); }
  return m;
}
export function disposeHumanShared() {
  GEO.forEach((g) => g.dispose()); GEO.clear();
  MAT.forEach((m) => m.dispose()); MAT.clear();
}
export const HumanFX = { castShadows: true };

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
   * opts: { id, skin, hair:'short'|'long'|'bun'|'bald'|'ponytail', hairColor, top, shirt, bottom, shoe,
   *         tie, glasses:'none'|'sun'|'clear', hat, faceHidden, female, scale, castShadow }
   */
  constructor(opts = {}) {
    this.id = opts.id || 'human';
    this.opts = Object.assign({ skin: 0xc8956b, hair: 'short', hairColor: 0x15100d, top: 0x2a3040, shirt: 0xe9ebef,
      bottom: 0x1b2030, shoe: 0x0c0c0e, tie: null, glasses: 'none', hat: null, faceHidden: false, female: false, scale: 1 }, opts);
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
    this.guard = false; this.guardAmt = 0;
    this.talking = false; this.talkAmt = 0;
    this.g = null;                   // active gesture
    this.lookTarget = null; this.lookYaw = 0; this.lookPitch = 0;
    this.c = {};                     // damped current values
    this.seed = Math.random() * 100;
    this.setYaw(0);
  }

  /* -------------------------------------------------------------------- *
   *  BUILD
   * -------------------------------------------------------------------- */
  _build() {
    const o = this.opts, f = o.female;
    const cs = HumanFX.castShadows && o.castShadow !== false;
    const skin = mat(o.skin, 0.62);
    const top = mat(o.top, 0.68), shirt = mat(o.shirt, 0.6), bottom = mat(o.bottom, 0.72), shoe = mat(o.shoe, 0.35, 0.2);
    const hairM = mat(o.hairColor, 0.55);
    const body = new THREE.Group(); body.scale.setScalar(o.scale); this.root.add(body); this.body = body;
    const J = this.j;
    const add = (parent, mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y + (mesh.userData.dy || 0), z); mesh.castShadow = cs; parent.add(mesh); return mesh; };
    const group = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    const capsule = (len, r, m, sx = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo(`cap_${len}_${r}`, () => new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, 10)), m);
      mesh.scale.set(sx, 1, sz); mesh.userData.dy = -len / 2; mesh.position.y = -len / 2; mesh.castShadow = cs; return mesh;
    };
    const sph = (r, m, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo(`sph_${r}`, () => new THREE.SphereGeometry(r, 18, 14)), m);
      mesh.scale.set(sx, sy, sz); mesh.castShadow = cs; return mesh;
    };
    const box = (w, h, d, m) => { const mesh = new THREE.Mesh(geo(`box_${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d)), m); mesh.castShadow = cs; return mesh; };

    // pelvis
    J.pelvis = group(body, 0, STAND_Y, 0);
    add(J.pelvis, sph(0.12, bottom, f ? 1.25 : 1.3, 0.9, 0.95), 0, 0, 0);
    // spine (lower torso)
    J.spine = group(J.pelvis, 0, 0.06, 0);
    const jacketLen = 0.2;
    add(J.spine, new THREE.Mesh(geo('jacket_skirt', () => new THREE.CylinderGeometry(0.135, 0.15, jacketLen, 20)), top), 0, 0.03, 0);
    const waist = capsule(0.30, 0.118, top, f ? 1.12 : 1.2, 0.86); waist.position.y = 0.2; J.spine.add(waist);
    // chest
    J.chest = group(J.spine, 0, 0.24, 0);
    const chestMesh = capsule(0.30, 0.13, top, f ? 1.2 : 1.42, 0.88); chestMesh.position.y = 0.17; J.chest.add(chestMesh);
    // shirt V + collar
    add(J.chest, box(0.09, 0.2, 0.012, shirt), 0, 0.2, 0.108).rotation.x = 0.1;
    if (o.tie) add(J.chest, box(0.032, 0.2, 0.012, mat(o.tie, 0.5)), 0, 0.17, 0.118).rotation.x = 0.1;
    // neck + head
    J.neck = group(J.chest, 0, 0.33, 0.005);
    add(J.neck, new THREE.Mesh(geo('neck', () => new THREE.CylinderGeometry(0.043, 0.05, 0.1, 14)), skin), 0, 0.03, 0);
    add(J.neck, new THREE.Mesh(geo('collar', () => new THREE.CylinderGeometry(0.062, 0.07, 0.035, 18, 1, true)), shirt), 0, -0.01, 0);
    J.head = group(J.neck, 0, 0.07, 0.01);
    this._buildHead(J.head, { add, group, sph, box, skin, hairM, shirt });

    // arms
    const shoulderX = f ? 0.175 : 0.205;
    for (const s of ['L', 'R']) {
      const sx = s === 'L' ? 1 : -1;
      const sh = group(J.chest, sx * shoulderX, 0.285, 0);
      add(sh, sph(0.062, top), 0, 0, 0);
      add(sh, capsule(L_UP + 0.02, 0.046, top));
      const el = group(sh, 0, -L_UP, 0);
      add(el, sph(0.043, top), 0, 0, 0);
      add(el, capsule(L_FORE + 0.02, 0.039, top));
      const wr = group(el, 0, -L_FORE, 0);
      const cuff = add(wr, new THREE.Mesh(geo('cuff', () => new THREE.CylinderGeometry(0.036, 0.036, 0.03, 12)), shirt), 0, 0.01, 0);
      add(wr, sph(0.036, skin, 0.9, 1.5, 0.55), 0, -0.05, 0.0);
      J['sh' + s] = sh; J['el' + s] = el; J['wr' + s] = wr;
    }
    // phone prop (shown while "calling")
    const phone = box(0.04, 0.085, 0.01, mat(0x08090c, 0.3, 0.4)); phone.position.set(0, -0.075, 0.03); phone.visible = false;
    J.wrR.add(phone); this.phone = phone;

    // legs
    for (const s of ['L', 'R']) {
      const sx = s === 'L' ? 1 : -1;
      const hip = group(J.pelvis, sx * 0.092, -0.02, 0);
      add(hip, capsule(L_THIGH + 0.02, 0.074, bottom));
      const kn = group(hip, 0, -L_THIGH, 0);
      add(kn, sph(0.06, bottom), 0, 0, 0);
      add(kn, capsule(L_SHIN + 0.02, 0.056, bottom));
      const an = group(kn, 0, -L_SHIN, 0);
      add(an, box(0.095, 0.065, 0.27, shoe), 0, -0.035 + 0.0, 0.07);
      J['hip' + s] = hip; J['kn' + s] = kn; J['an' + s] = an;
    }
    this.hipY = -0.02;
  }

  _buildHead(head, k) {
    const o = this.opts, { add, sph, box, skin, hairM } = k;
    const faceM = o.faceHidden ? new THREE.MeshBasicMaterial({ color: 0x070607 }) : skin;
    const skull = sph(0.106, faceM, 0.93, 1.12, 1.0); add(head, skull, 0, 0.115, 0);
    this.skull = skull;
    if (!o.faceHidden) {
      const dark = mat(0x0b0908, 0.3);
      for (const sx of [-1, 1]) {
        add(head, sph(0.0105, dark), sx * 0.037, 0.13, 0.092);
        add(head, box(0.04, 0.007, 0.01, hairM), sx * 0.039, 0.15, 0.093).rotation.z = sx * 0.08;
        add(head, sph(0.019, skin, 0.7, 1.4, 0.6), sx * 0.099, 0.115, 0.0);
      }
      add(head, sph(0.017, mat(new THREE.Color(o.skin).multiplyScalar(0.92).getHex(), 0.65), 0.8, 1.1, 1), 0, 0.105, 0.102);
      add(head, sph(0.03, mat(o.female ? 0xa8454d : 0x8a4e45, 0.6), 1.15, 0.3, 0.5), 0, 0.062, 0.093);
    }
    // eyewear
    if (o.glasses === 'sun' && !o.faceHidden) {
      const sg = mat(0x050506, 0.15, 0.5);
      add(head, box(0.16, 0.035, 0.02, sg), 0, 0.13, 0.098);
      add(head, box(0.008, 0.01, 0.2, sg), 0.082, 0.13, 0.0);
      add(head, box(0.008, 0.01, 0.2, sg), -0.082, 0.13, 0.0);
    }
    // hair
    const hair = o.hair;
    if (hair === 'short' || hair === 'ponytail' || hair === 'bun') {
      const cap = new THREE.Mesh(geo('haircap', () => new THREE.SphereGeometry(0.112, 20, 14, 0, TAU, 0, Math.PI * 0.5)), hairM);
      cap.scale.set(0.95, 1.12, 1.04); cap.rotation.x = -0.35; add(head, cap, 0, 0.118, -0.004);
      if (hair === 'short') add(head, box(0.14, 0.04, 0.05, hairM), 0, 0.2, 0.05).rotation.x = -0.4;
      if (hair === 'ponytail') { const t = add(head, sph(0.04, hairM, 1, 2.6, 1), 0, 0.09, -0.12); t.rotation.x = 0.4; }
      if (hair === 'bun') add(head, sph(0.05, hairM), 0, 0.22, -0.06);
    } else if (hair === 'long') {
      const cap = new THREE.Mesh(geo('haircap', () => new THREE.SphereGeometry(0.112, 20, 14, 0, TAU, 0, Math.PI * 0.5)), hairM);
      cap.scale.set(1.0, 1.14, 1.08); cap.rotation.x = -0.35; add(head, cap, 0, 0.116, -0.008);
      add(head, sph(0.1, hairM, 1.0, 1.7, 0.7), 0, 0.02, -0.062);
      for (const sx of [-1, 1]) add(head, sph(0.03, hairM, 0.8, 2.6, 0.9), sx * 0.098, 0.05, -0.01);
    }
    // hat (fedora)
    if (o.hat) {
      const hm = mat(o.hat, 0.55), band = mat(0x1b2a44, 0.4, 0.2);
      const g = new THREE.Group(); g.position.set(0, 0.2, 0.01); g.rotation.x = 0.18; head.add(g);
      const brim = new THREE.Mesh(geo('brim', () => new THREE.CylinderGeometry(0.235, 0.235, 0.011, 40)), hm);
      brim.scale.set(1, 1, 1.05); brim.castShadow = true; g.add(brim);
      const crown = new THREE.Mesh(geo('crown', () => new THREE.CylinderGeometry(0.098, 0.118, 0.115, 28)), hm);
      crown.position.y = 0.06; crown.castShadow = true; g.add(crown);
      const dent = new THREE.Mesh(geo('dent', () => new THREE.CylinderGeometry(0.06, 0.098, 0.03, 20)), hm); dent.position.y = 0.128; g.add(dent);
      const bd = new THREE.Mesh(geo('band', () => new THREE.CylinderGeometry(0.1205, 0.1215, 0.026, 28)), band); bd.position.y = 0.018; g.add(bd);
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
      const stagger = (i === 0 ? 0.03 : -0.03) * (1 - W);
      // in the seat frame feet stay planted in front of the chair; otherwise they follow the gait
      feet.push({ z: inSeatFrame ? FEET_FWD_SEATED : z + stagger, y: ANKLE_H + lift, p });
    }
    for (let i = 0; i < 2; i++) {
      const hip = i === 0 ? J.hipL : J.hipR, kn = i === 0 ? J.knL : J.knR, an = i === 0 ? J.anL : J.anR;
      const hy = pelvisY + this.hipY, hz = pelvisZ;
      const r = ik2(hy, hz, feet[i].y, feet[i].z, L_THIGH, L_SHIN, -1);
      hip.rotation.x = r.a1; kn.rotation.x = r.a2;
      const toe = (feet[i].p > BETA ? 0.35 * Math.sin(Math.PI * (feet[i].p - BETA) / (1 - BETA)) : 0) * W;
      an.rotation.x = -(r.a1 + r.a2) + toe * 0.0 - (feet[i].p > BETA ? 0.15 * W : 0);
    }
    J.pelvis.position.set(0.012 * Math.sin(TAU * ph) * W, pelvisY, pelvisZ);
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
    const T = {
      shL: 0.05, shLz: 0.08, elL: -0.2, shR: 0.05, shRz: -0.08, elR: -0.2,
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
    // guard stance: hands clasped in front of belt
    if (this.guardAmt > 0.001) {
      T.shL = lerp(T.shL, -0.42, this.guardAmt); T.elL = lerp(T.elL, -1.1, this.guardAmt); T.shLz = lerp(T.shLz, -0.30, this.guardAmt);
      T.shR = lerp(T.shR, -0.42, this.guardAmt); T.elR = lerp(T.elR, -1.1, this.guardAmt); T.shRz = lerp(T.shRz, 0.30, this.guardAmt);
      headY += Math.sin(t * 0.22) * 0.1 * this.guardAmt;
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
    J.wrL.rotation.x = -0.1 + 0.18 * this.typeAmt * Math.sin(t * this.typeRate * 1.1); J.wrR.rotation.x = -0.1 + 0.18 * this.typeAmt * Math.sin(t * this.typeRate * 0.9 + 1);
    J.spine.rotation.set(D('spineX', spineX, 9), 0, 0);
    J.chest.rotation.set(chestX, D('chestY', chestY, 8), 0);
    J.neck.rotation.set(D('neckX', neckX, 8), D('headY', headY * 0.45, 7), D('headZ', headZ, 6));
    J.head.rotation.set(D('headX', headX - spineX * 0.55, 8), headY * 0.55, 0);
  }
}
