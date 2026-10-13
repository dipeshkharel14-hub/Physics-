/* ==========================================================================
   Hsepid.np — detailed procedural plants
   Leaves are real curved, veined, two-sided blades (not blobs); stems are tapered
   tubes; pots are lathe-turned ceramics with rims, saucers, soil and pebbles.
   Every species is built once, merged into 4 meshes (leaves, stems, pot, soil) and
   shared by all instances → a whole forest costs only a few draw calls per plant.
   ========================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
let _seed = 1;
const rnd = () => { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; };
const rr = (a, b) => a + (b - a) * rnd();

/* ---------- textures / materials ---------- */
const cache = { tex: {}, mat: {}, geo: {} };
function leafTex(kind) {
  if (cache.tex[kind]) return cache.tex[kind];
  const w = 128, h = 256, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (kind === 'sword') {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#d8c85a'); gr.addColorStop(0.12, '#4d7a3a'); gr.addColorStop(0.5, '#6c9a4c'); gr.addColorStop(0.88, '#4d7a3a'); gr.addColorStop(1, '#d8c85a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.22; g.strokeStyle = '#1d3a1f'; g.lineWidth = 3;
    for (let y = -20; y < h; y += 18) { g.beginPath(); g.moveTo(14, y); g.bezierCurveTo(40, y + 12, 70, y - 8, 114, y + 16); g.stroke(); }
  } else {
    const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#2f6a39'); gr.addColorStop(0.6, '#3e8a48'); gr.addColorStop(1, '#58a85a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // side veins
    g.globalAlpha = 0.5; g.strokeStyle = '#a9dc9a'; g.lineWidth = 1.6;
    for (let i = 0; i < 12; i++) { const y = 235 - i * 18; g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(38, y - 18, 8, y - 38); g.stroke(); g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(90, y - 18, 120, y - 38); g.stroke(); }
    g.globalAlpha = 0.18; g.strokeStyle = '#0e2a14'; g.lineWidth = 1;
    for (let i = 0; i < 30; i++) { const y = 245 - i * 8; g.beginPath(); g.moveTo(64, y); g.lineTo(6, y - 20); g.moveTo(64, y); g.lineTo(122, y - 20); g.stroke(); }
    // midrib
    g.globalAlpha = 0.95; g.strokeStyle = '#cfe8b0'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(64, 256); g.lineTo(64, 6); g.stroke();
    // edge darkening
    g.globalAlpha = 0.25; const e = g.createLinearGradient(0, 0, w, 0); e.addColorStop(0, '#000'); e.addColorStop(0.1, 'rgba(0,0,0,0)'); e.addColorStop(0.9, 'rgba(0,0,0,0)'); e.addColorStop(1, '#000'); g.fillStyle = e; g.fillRect(0, 0, w, h);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; cache.tex[kind] = t; return t;
}
function leafMat(kind) {
  const k = 'leaf_' + kind; if (cache.mat[k]) return cache.mat[k];
  const m = new THREE.MeshStandardMaterial({ map: leafTex(kind), vertexColors: true, roughness: 0.42, metalness: 0.0, side: THREE.DoubleSide });
  cache.mat[k] = m; return m;
}
const stemMat = () => cache.mat.stem || (cache.mat.stem = new THREE.MeshStandardMaterial({ color: 0x5a7a3a, roughness: 0.7, vertexColors: true }));
const soilMat = () => cache.mat.soil || (cache.mat.soil = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, vertexColors: true }));
function potMat(color, glaze) {
  const k = 'pot_' + color + glaze; return cache.mat[k] || (cache.mat[k] = new THREE.MeshStandardMaterial({ color, roughness: glaze ? 0.22 : 0.8, metalness: glaze ? 0.1 : 0.0 }));
}
export function disposePlantShared() {
  Object.values(cache.geo).forEach((g) => { if (g.dispose) g.dispose(); else { for (const k of ['leaves', 'stems', 'soil', 'pot']) if (g[k] && g[k].dispose) g[k].dispose(); } }); Object.values(cache.mat).forEach((m) => m.dispose()); Object.values(cache.tex).forEach((t) => t.dispose());
  cache.tex = {}; cache.mat = {}; cache.geo = {};
}

/* ---------- geometry builders ---------- */
function colorize(g, col) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
/** curved, folded, tapered leaf blade. Grows along +Y from the origin, droops toward +Z. */
function leafGeo({ len = 0.2, wid = 0.1, a0 = 0.3, bend = 0.9, fold = 0.35, prof = 'ovate', tint = 1, curl = 0 }) {
  const SL = 9, SW = 4, pos = [], uv = [], idx = [];
  let y = 0, z = 0;
  for (let i = 0; i <= SL; i++) {
    const u = i / SL, a = a0 + bend * u * u * 0.9 + bend * u * 0.1;
    if (i > 0) { const du = 1 / SL; y += Math.cos(a) * du * len; z += Math.sin(a) * du * len; }
    let w;
    if (prof === 'ovate') w = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.8);
    else if (prof === 'sword') w = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.9)), 0.45) * (u < 0.12 ? 0.6 + u * 3.3 : 1) * (1 - u * 0.25);
    else w = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.9);               // lanceolate
    w *= wid;
    const ny = -Math.sin(a), nz = Math.cos(a);
    for (let j = 0; j <= SW; j++) {
      const v = (j / SW) * 2 - 1, f = Math.abs(v) * fold * w + curl * v * v * w * 0.4;
      pos.push(v * w, y + ny * f, z + nz * f); uv.push(j / SW, u);
    }
  }
  for (let i = 0; i < SL; i++) for (let j = 0; j < SW; j++) { const a = i * (SW + 1) + j, b = a + 1, c = a + SW + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const col = new THREE.Color().setScalar(tint); return colorize(g, col);
}
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
function xf(g, x, y, z, rx, ry, rz, s = 1) { const c = g.clone(); M4.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YXZ')), S.set(s, s, s)); c.applyMatrix4(M4); return c; }
/** tapered tube between two points (stem) */
function stemBetween(a, b, r0, r1, col) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, 6, 1, true); g.translate(0, L / 2, 0);
  Q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); M4.compose(a, Q, S.set(1, 1, 1)); g.applyMatrix4(M4);
  return colorize(g, col);
}

function potGeo(kind, r = 0.17, h = 0.38) {
  const V = (x, y) => new THREE.Vector2(Math.max(0.001, x), y);
  let pts;
  if (kind === 'round') pts = [V(0, 0), V(r * 0.5, 0), V(r * 0.62, 0.012), V(r * 0.95, h * 0.3), V(r * 1.02, h * 0.55), V(r * 0.93, h * 0.85), V(r * 0.8, h * 0.97), V(r * 0.82, h), V(r * 0.75, h - 0.012), V(r * 0.7, h - 0.03), V(0, h - 0.04)];
  else pts = [V(0, 0), V(r * 0.62, 0), V(r * 0.66, 0.012), V(r * 0.72, 0.03), V(r * 0.98, h - 0.035), V(r * 1.04, h - 0.022), V(r * 1.05, h - 0.004), V(r * 0.99, h), V(r * 0.93, h - 0.012), V(r * 0.9, h - 0.04), V(0, h - 0.04)];
  const g = new THREE.LatheGeometry(pts, 28); g.computeVertexNormals(); return g;
}
function soilGeo(r, y) {
  const parts = [];
  const d = new THREE.CircleGeometry(r * 0.9, 20); d.rotateX(-Math.PI / 2); d.translate(0, y, 0); parts.push(colorize(d, new THREE.Color(0x2a1b12)));
  for (let i = 0; i < 26; i++) { const a = rnd() * TAU, rd = Math.sqrt(rnd()) * r * 0.82, s = new THREE.SphereGeometry(rr(0.009, 0.016), 6, 4); s.scale(1, 0.6, 1); s.translate(Math.cos(a) * rd, y + 0.004, Math.sin(a) * rd); parts.push(colorize(s, new THREE.Color().setScalar(rr(0.55, 0.9)))); }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()), false);
}

/* ---------- species ---------- */
const POT_COL = [0xe9e7e2, 0x23252b, 0xb5643c, 0x8c8f93, 0x14161a, 0xd8cfc0];

function buildSpecies(kind, variant) {
  _seed = 1000 + variant * 77 + kind.length * 13;
  const leaves = [], stems = [], potH = kind === 'succulent' ? 0.12 : 0.38, potR = kind === 'succulent' ? 0.07 : kind === 'snake' ? 0.15 : 0.17;
  const topY = potH - 0.01;
  if (kind === 'ficus') {
    // woody trunk with branching nodes and big glossy ovate leaves
    const trunkTop = new THREE.Vector3(0.02, 1.0, -0.01);
    stems.push(stemBetween(new THREE.Vector3(0, topY, 0), trunkTop, 0.022, 0.01, new THREE.Color(0x6d5a42)));
    for (let i = 0; i < 9; i++) {
      const y = 0.5 + i * 0.085, a = i * 2.4 + rnd(), br = 0.1 + rnd() * 0.12;
      const node = new THREE.Vector3(Math.sin(a) * br + 0.01, y + 0.1, Math.cos(a) * br);
      stems.push(stemBetween(new THREE.Vector3(0.01 + (i / 7) * 0.01, y, 0), node, 0.008, 0.004, new THREE.Color(0x6d5a42)));
      for (let k = 0; k < 4; k++) {
        const la = a + (k - 1.5) * 0.85 + rr(-0.2, 0.2), len = rr(0.21, 0.32), g = leafGeo({ len, wid: len * 0.5, a0: rr(0.9, 1.35), bend: rr(0.4, 0.9), fold: 0.3, prof: 'ovate', tint: rr(0.82, 1.1), curl: rr(-0.4, 0.4) });
        leaves.push(xf(g, node.x, node.y + k * 0.015, node.z, 0, la, 0));
      }
    }
    for (let k = 0; k < 6; k++) { const a = k * 1.05, g = leafGeo({ len: 0.2, wid: 0.1, a0: 0.3, bend: 0.5, prof: 'ovate', tint: rr(0.9, 1.1) }); leaves.push(xf(g, trunkTop.x, trunkTop.y - 0.02, trunkTop.z, 0, a, 0)); }
  } else if (kind === 'palm') {
    const NF = 12;
    const leaflet = leafGeo({ len: 0.26, wid: 0.03, a0: 1.2, bend: 0.5, fold: 0.2, prof: 'lanceolate' });
    for (let f = 0; f < NF; f++) {
      const yaw = (f / NF) * TAU + rnd() * 0.4, L = rr(0.8, 1.15), lean = rr(0.35, 0.8), dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(dir.x * Math.sin(lean * t * 1.3) * L * 0.55 * t * 1.4, topY + Math.cos(lean * t * 1.1) * L * t - t * t * L * 0.25, dir.z * Math.sin(lean * t * 1.3) * L * 0.55 * t * 1.4)); }
      for (let i = 0; i < 8; i++) stems.push(stemBetween(pts[i], pts[i + 1], 0.0065 * (1 - i / 9), 0.0055 * (1 - (i + 1) / 9), new THREE.Color(0x6b8a3c)));
      for (let i = 2; i <= 8; i++) {
        const t = i / 8, p = pts[i], scale = (1.05 - t * 0.6) * rr(0.9, 1.1);
        for (const s of [-1, 1]) for (let q = 0; q < 2; q++) {
          const yw = yaw + s * (1.0 + q * 0.0) + rr(-0.1, 0.1), g = leaflet;
          leaves.push(xf(g, p.x, p.y - q * 0.025, p.z, 0, yw, 0, scale));
        }
      }
    }
  } else if (kind === 'snake') {
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4 + rnd() * 0.3, r = rr(0.0, 0.06) + (i > 7 ? 0.03 : 0), len = rr(0.5, 0.95) * (1 - Math.min(0.35, i * 0.02));
      const g = leafGeo({ len, wid: rr(0.036, 0.052), a0: rr(0.05, 0.28), bend: rr(-0.1, 0.3), fold: 0.7, prof: 'sword', tint: rr(0.85, 1.1) });
      leaves.push(xf(g, Math.sin(a) * r, topY, Math.cos(a) * r, 0, a + 0.4, 0));
    }
  } else { // succulent rosette
    for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 6 + ring * 2; i++) {
      const a = (i / (6 + ring * 2)) * TAU + ring * 0.5, g = leafGeo({ len: 0.05 + (2 - ring) * 0.012, wid: 0.024, a0: 0.25 + ring * 0.45, bend: 0.6, fold: 0.5, prof: 'ovate', tint: rr(0.8, 1.2) });
      leaves.push(xf(g, Math.sin(a) * 0.008, topY + 0.004, Math.cos(a) * 0.008, 0, a, 0));
    }
  }
  const toNI = (g) => (g.index ? g.toNonIndexed() : g);
  const out = { kind, potH, potR, topY };
  out.leaves = mergeGeometries(leaves.map(toNI), false);
  out.stems = stems.length ? mergeGeometries(stems.map((g) => { const n = toNI(g); n.deleteAttribute('uv'); return n; }), false) : null;
  out.soil = soilGeo(potR, topY); out.soil.deleteAttribute('uv');
  out.pot = potGeo(variant % 2 ? 'round' : 'taper', potR, potH);
  if (out.stems) out.stems.computeVertexNormals();
  return out;
}

/** Builds a plant mesh group. kind: 'ficus' | 'palm' | 'snake' | 'succulent'. Returns a THREE.Group (height ≈ 1.1–1.4 m at scale 1). */
export function makePlant(kind = 'ficus', variant = 0, castShadow = false) {
  const key = kind + variant;
  const sp = cache.geo[key + '_sp'] || (cache.geo[key + '_sp'] = buildSpecies(kind, variant));
  const g = new THREE.Group();
  const mk = (geom, m) => { const mesh = new THREE.Mesh(geom, m); mesh.castShadow = castShadow; g.add(mesh); return mesh; };
  mk(sp.pot, potMat(POT_COL[(variant + (kind === 'succulent' ? 0 : 2)) % POT_COL.length], variant % 3 === 0));
  mk(sp.soil, soilMat());
  if (sp.stems) mk(sp.stems, stemMat());
  mk(sp.leaves, leafMat(kind === 'snake' ? 'sword' : 'leaf'));
  // saucer
  const sc = new THREE.Mesh(cache.geo.saucer || (cache.geo.saucer = new THREE.CylinderGeometry(1, 0.9, 0.018, 24)), potMat(0x1a1b1f, true)); sc.scale.set(sp.potR * 0.75, 1, sp.potR * 0.75); sc.position.y = 0.009; g.add(sc);
  return g;
}
