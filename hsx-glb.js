/* hsx-glb.js — fits ANY skinned humanoid .glb onto an existing procedural character.
 *
 *  • auto height (female / male defaults, + the character's own `scale`), auto grounding and centring
 *  • male / female pools: CFG.models.male / CFG.models.female (arrays or one url), per-person keys still win
 *  • animation clips are matched by name; whatever is missing is filled by a small bone driver that
 *    works on Mixamo-style skeletons (mixamorig:Hips, LeftUpLeg …): relaxed arms, walk swing, sitting,
 *    typing and a few gestures — so even a T-pose-only model behaves like a person in the office.
 *  • the procedural body stays as an automatic fallback if a file cannot be loaded.
 */
import * as THREE from 'three';

const D = Math.PI / 180;
const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _p = new THREE.Quaternion();

// candidate (normalised) bone names per joint: Mixamo / Ready Player Me / Rocketbox (Bip01) / generic
const NAMES = {
  hips: ['hips', 'bippelvis', 'pelvis'], spine: ['spine', 'bipspine'], head: ['head', 'biphead'], neck: ['neck', 'bipneck'],
  uL: ['leftupleg', 'biplthigh', 'lthigh', 'thighl'], kL: ['leftleg', 'biplcalf', 'lcalf', 'calfl'],
  uR: ['rightupleg', 'biprthigh', 'rthigh', 'thighr'], kR: ['rightleg', 'biprcalf', 'rcalf', 'calfr'],
  aL: ['leftarm', 'biplupperarm', 'bipluparm', 'lupperarm'], fL: ['leftforearm', 'biplforearm', 'lforearm'],
  aR: ['rightarm', 'biprupperarm', 'bipruparm', 'rupperarm'], fR: ['rightforearm', 'biprforearm', 'rforearm'],
};
const norm = (n) => String(n || '').toLowerCase().replace(/^.*[:|]/, '').replace(/^mixamorig/, '').replace(/[^a-z]/g, '');

function findBones(root) {
  const map = {}, all = {};
  root.traverse((o) => { if (o.isBone) all[norm(o.name)] = o; });
  for (const k in NAMES) { const hit = NAMES[k].find((n) => all[n]); if (hit) map[k] = all[hit]; }
  return map;
}
/** rotation of the bone's parent expressed in the model's own frame */
function parentRel(bone, model, out) {
  out.identity();
  for (let o = bone.parent; o && o !== model; o = o.parent) out.premultiply(_p.copy(o.quaternion));
  return out;
}
/* exact form:  local' = Qp^-1 · Rm · Qp · local  */
function rotExact(bone, model, axis, angle) {
  if (!bone || !angle) return;
  parentRel(bone, model, _q);
  _r.setFromAxisAngle(axis, angle);
  const qi = _p.copy(_q).invert();
  bone.quaternion.premultiply(_q).premultiply(_r).premultiply(qi);
}

const find = (actions, words) => { const ks = Object.keys(actions); for (const w of words) { const k = ks.find((n) => n.includes(w)); if (k) return k; } return null; };

export function pickSource(cfg, human, idx) {
  const m = cfg || {}, o = human.opts || {};
  const direct = m[human.id] || (human.id.startsWith('guard') ? m.bodyguard : null);
  if (direct) return direct;
  const pool = o.female ? m.female : m.male;
  const arr = Array.isArray(pool) ? pool.filter(Boolean) : pool ? [pool] : [];
  return arr.length ? arr[idx % arr.length] : null;
}

export function fitGLB(human, gltf, SkeletonUtils, opts = {}) {
  const model = SkeletonUtils.clone(gltf.scene);
  const o = human.opts, female = !!o.female;
  const targetH = (female ? (opts.femaleHeight || 1.66) : (opts.maleHeight || 1.80)) * (o.scale || 1);

  // wrapper keeps the model's own transform intact and lets us scale / ground it
  const wrap = new THREE.Group(); wrap.name = 'glb_' + human.id; wrap.add(model);
  // ---- auto orientation: the hips tell us which way the character faces (left leg → right leg), so a model
  //      authored facing -Z / +X still ends up facing +Z; the driver uses the model's own side/forward axes.
  model.updateMatrixWorld(true);
  const bn0 = findBones(model); let sideAx = AX.clone(), fwdAx = AZ.clone();
  if (bn0.uL && bn0.uR && opts.faceAxis !== 'off') {
    const a = bn0.uL.getWorldPosition(new THREE.Vector3()).sub(bn0.uR.getWorldPosition(new THREE.Vector3())); a.y = 0;
    if (a.lengthSq() > 1e-8) {
      a.normalize(); if (Math.abs(a.x) >= Math.abs(a.z)) a.set(Math.sign(a.x), 0, 0); else a.set(0, 0, Math.sign(a.z));
      sideAx = a.clone(); fwdAx = new THREE.Vector3().crossVectors(a, new THREE.Vector3(0, 1, 0));
      const th = -Math.atan2(fwdAx.x, fwdAx.z); model.quaternion.premultiply(_r.setFromAxisAngle(new THREE.Vector3(0, 1, 0), th));
      model.updateMatrixWorld(true);
    }
  }
  const box = new THREE.Box3().setFromObject(model);
  const h0 = Math.max(0.01, box.max.y - box.min.y), s = targetH / h0;
  wrap.scale.setScalar(s);
  wrap.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);

  // per-person colour nudge so a small model pool still gives varied people (clothes only, never skin/eyes)
  const tint = new THREE.Color(o.top != null ? o.top : 0x808080).lerp(new THREE.Color(0xffffff), 0.55);
  const cache = new Map();
  model.traverse((n) => {
    if (!n.isMesh) return; n.castShadow = true; n.receiveShadow = false; n.frustumCulled = false;   // no self-shadow: hair would cast a hard dark mask across the eyes
    const list = Array.isArray(n.material) ? n.material : [n.material];
    const out = list.map((mt) => {
      if (!mt) return mt; const nm = (mt.name || '').toLowerCase();
      if (opts.hideHairCards && /opacity/.test(nm)) { mt = mt.clone(); mt.visible = false; return mt; }   // Rocketbox hair-card layer: hair is already painted on the head texture
      if (!/body|cloth|shirt|suit|jacket|pant|top|outfit|vanguard/.test(nm) || /skin|eye|hair|face|visor/.test(nm)) return mt;
      if (!opts.tintClothes) return mt;
      const key = mt.uuid + tint.getHex(); let c = cache.get(key);
      if (!c) { c = mt.clone(); if (c.color) c.color.multiply(tint); cache.set(key, c); }
      return c;
    });
    n.material = Array.isArray(n.material) ? out : out[0];
  });

  const bones = findBones(model);
  const mixer = new THREE.AnimationMixer(model), actions = {};
  gltf.animations.forEach((c, i) => { actions[(c.name || 'clip' + i).toLowerCase()] = mixer.clipAction(c); });
  wrap.updateMatrixWorld(true);   // hips height measured in the bind pose before any animation runs
  const hipsH = bones.hips ? bones.hips.getWorldPosition(new THREE.Vector3()).y : targetH * 0.53;
  const g = {
    model, wrap, mixer, actions, bones, cur: null, hipsH: hipsH || targetH * 0.53, s,
    clips: {
      idle: find(actions, ['idle', 'stand']), walk: find(actions, ['walk']), sit: find(actions, ['sit', 'type']),
      talk: find(actions, ['talk']), wave: find(actions, ['wave']), point: find(actions, ['point']),
    },
    AX: sideAx, AZ: fwdAx, t: 0, gAmt: 0, relax: 0, swing: 0, sitAmt: 0, typeAmt: 0, talkAmt: 0,
  };
  // a "TPose" clip is not an idle
  if (g.clips.idle && /tpose/.test(g.clips.idle)) g.clips.idle = null;
  g.hasDriver = !!(bones.uL && bones.aL);
  g.rest = {}; for (const k in bones) g.rest[k] = bones[k].quaternion.clone();   // bind pose, restored each frame when no clip drives the bones
  // bind-pose arm direction → how far each arm must rotate (about the forward axis) to hang down naturally,
  // whatever the model's rest pose is (T-pose, A-pose …)
  g.armTurn = { L: 0, R: 0 };
  if (bones.aL && bones.fL && bones.aR && bones.fR) {
    const P = (b) => b.getWorldPosition(new THREE.Vector3());
    for (const [k, a, f, sg] of [['L', bones.aL, bones.fL, 1], ['R', bones.aR, bones.fR, -1]]) {
      const d = P(f).sub(P(a)).normalize(), side = sideAx.clone().multiplyScalar(sg), ang = 14 * D;
      const t = side.multiplyScalar(Math.sin(ang)).add(new THREE.Vector3(0, -Math.cos(ang), 0));
      d.sub(fwdAx.clone().multiplyScalar(d.dot(fwdAx))).normalize();           // project onto the plane the arm swings in
      g.armTurn[k] = Math.atan2(fwdAx.dot(new THREE.Vector3().crossVectors(d, t)), d.dot(t));
    }
  }
  human.root.add(wrap); human.body.visible = false;
  human.glb = g; return g;
}

export function updateGLB(h, dt) {
  const g = h.glb; if (!g) return; g.t += dt;
  const c = g.clips, seated = h.sitProg > 0.02, sitW = h.sitProg;
  const gest = h.g && h.g.name ? h.g.name : null;
  // ---- clip selection ----
  let want = null;
  if (h.moving && c.walk) want = c.walk; else if (seated && c.sit && h.sitProg > 0.99) want = c.sit;
  else if (gest && c[gest]) want = c[gest]; else if (h.talking && c.talk) want = c.talk; else if (c.idle) want = c.idle;
  if (want !== g.cur) {
    const next = want && g.actions[want];
    if (g.cur && g.actions[g.cur]) g.actions[g.cur].fadeOut(0.25);
    if (next) next.reset().fadeIn(0.25).play();
    g.cur = want;
  }
  if (g.cur === c.walk && c.walk) g.actions[g.cur].timeScale = Math.max(0.2, Math.min(2.2, (h.curSpeed || 1) / 1.25));
  g.mixer.update(dt);
  if (!g.hasDriver) return;

  // ---- bone driver (fills what the clips don't cover) ----
  if (!g.cur) for (const k in g.rest) g.bones[k].quaternion.copy(g.rest[k]);   // no clip → start from the bind pose so deltas never accumulate
  const B = g.bones, m = g.model, k = Math.min(1, dt * 8);
  const S = (cur, tgt) => cur + (tgt - cur) * k;
  const walkClip = h.moving && c.walk, idleClip = !!c.idle;
  g.relax = S(g.relax, idleClip ? 0 : 1);          // lower the T-pose arms when no idle clip
  g.swing = S(g.swing, walkClip ? 0 : (h.walkAmt || 0));
  g.typeAmt = S(g.typeAmt, h.typing ? 1 : 0);
  g.gAmt = S(g.gAmt, gest && !c[gest] ? 1 : 0);
  g.talkAmt = S(g.talkAmt, h.talking ? 1 : 0);
  const ph = h.walkPhase || 0, sw = Math.sin(ph), sw2 = Math.sin(ph + Math.PI);
  const armDown = 74 * D * g.relax;

  // legs
  const lA = -(sw * 0.42) * g.swing, rA = -(sw2 * 0.42) * g.swing;
  rotExact(B.uL, m, g.AX, lA - sitW * 88 * D); rotExact(B.uR, m, g.AX, rA - sitW * 88 * D);
  rotExact(B.kL, m, g.AX, Math.max(0, sw2) * 0.75 * g.swing + sitW * 92 * D);
  rotExact(B.kR, m, g.AX, Math.max(0, sw) * 0.75 * g.swing + sitW * 92 * D);
  if (sitW > 0) rotExact(B.hips, m, g.AX, -sitW * 4 * D);
  // arms (left = +X side for a model facing +Z)
  const typeFwd = g.typeAmt * 42 * D;
  rotExact(B.aL, m, g.AZ, g.armTurn.L * g.relax + (g.talkAmt * 5 * D)); rotExact(B.aR, m, g.AZ, g.armTurn.R * g.relax - (g.talkAmt * 5 * D));
  rotExact(B.aL, m, g.AX, -(sw2 * 0.5) * g.swing - typeFwd); rotExact(B.aR, m, g.AX, -(sw * 0.5) * g.swing - typeFwd);
  rotExact(B.fL, m, g.AX, -g.relax * 14 * D - g.typeAmt * 62 * D - Math.max(0, sw) * 0.3 * g.swing);
  rotExact(B.fR, m, g.AX, -g.relax * 14 * D - g.typeAmt * 62 * D - Math.max(0, sw2) * 0.3 * g.swing);
  if (g.typeAmt > 0.01) {                       // keystroke flutter
    const f = Math.sin(g.t * 13) * 0.06 * g.typeAmt; rotExact(B.fL, m, g.AX, f); rotExact(B.fR, m, g.AX, -f);
  }
  // gestures with no clip: raise the right arm (wave / greet / point / beckon share one simple pose)
  if (g.gAmt > 0.01) {
    const wv = /wave|greet|beckon/.test(gest || '') ? Math.sin(g.t * 9) * 0.35 : 0;
    rotExact(B.aR, m, g.AZ, -g.armTurn.R * 0.35 * g.gAmt);
    rotExact(B.aR, m, g.AX, -(80 * D) * g.gAmt);
    rotExact(B.fR, m, g.AX, -(55 * D + wv) * g.gAmt);
  }
  // seated: lower the whole body so the thighs rest on the chair (procedural pelvis drops 0.34 m at scale 1)
  const drop = (0.34 * (g.hipsH / 0.88)) * sitW;
  g.wrap.position.y = (g.wrap.userData.y0 ?? (g.wrap.userData.y0 = g.wrap.position.y)) - drop;
  // tiny breathing so a still model never looks frozen
  if (B.spine) rotExact(B.spine, m, g.AX, Math.sin(g.t * 1.7) * 0.012);
}

export function disposeGLB(h) {
  const g = h.glb; if (!g) return;
  g.mixer.stopAllAction();
  g.model.traverse((n) => { if (n.isMesh) { n.geometry && n.geometry.dispose(); const l = Array.isArray(n.material) ? n.material : [n.material]; l.forEach((mt) => { if (!mt) return; for (const k in mt) if (mt[k] && mt[k].isTexture) mt[k].dispose(); mt.dispose(); }); } });
  h.glb = null;
}
