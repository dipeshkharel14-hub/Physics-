/* ==========================================================================
   Hsepid.np — detailed office equipment (monitors, laptops, keyboards, chairs,
   printer, water cooler, lamps, sofa, desk accessories…).
   Each prop is assembled from rounded boxes / lathe / cylinders and MERGED per
   material, so it stays cheap on the GPU while looking like the real thing.
   ========================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makePlant, disposePlantShared } from './hsx-plants.js?v=5';

const TAU = Math.PI * 2;
export { disposePlantShared };

export function makeProps(ctx) {
  const { mat, M, cs, root, canvasTex, SEAT_TOP } = ctx;
  const G = new Map();                                      // geometry template cache
  const gcache = (k, f) => { let g = G.get(k); if (!g) { g = f(); G.set(k, g); } return g; };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

  /** collects geometry per material and merges it into one mesh per material */
  function builder(parent, x = 0, y = 0, z = 0, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
    const bag = new Map();
    const add = (geom, m, px, py, pz, rx = 0, ryy = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      _e.set(rx, ryy, rz); _q.setFromEuler(_e); _m.compose(_p.set(px, py, pz), _q, _s.set(sx, sy, sz));
      const c = geom.index ? geom.toNonIndexed() : geom.clone(); c.applyMatrix4(_m);
      let e = bag.get(m.uuid); if (!e) { e = { m, list: [] }; bag.set(m.uuid, e); } e.list.push(c);
    };
    const b = {
      group: g,
      box: (w, h, d, m, px, py, pz, rx, ryy, rz) => add(gcache('b', () => new THREE.BoxGeometry(1, 1, 1)), m, px, py, pz, rx, ryy, rz, w, h, d),
      rbox: (w, h, d, r, m, px, py, pz, rx, ryy, rz) => add(gcache(`rb${w}_${h}_${d}_${r}`, () => new RoundedBoxGeometry(w, h, d, 3, r)), m, px, py, pz, rx, ryy, rz),
      cyl: (rt, rb, h, m, px, py, pz, rx, ryy, rz, seg = 20) => add(gcache(`c${rt}_${rb}_${seg}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg)), m, px, py, pz, rx, ryy, rz, 1, h, 1),
      sph: (r, m, px, py, pz, sx = 1, sy = 1, sz = 1) => add(gcache('s', () => new THREE.SphereGeometry(1, 16, 12)), m, px, py, pz, 0, 0, 0, r * sx, r * sy, r * sz),
      tor: (R, t, m, px, py, pz, rx, ryy, rz, arc = TAU) => add(gcache(`t${R}_${t}_${arc}`, () => new THREE.TorusGeometry(R, t, 8, 20, arc)), m, px, py, pz, rx, ryy, rz),
      geo: add,
      flush() {
        for (const e of bag.values()) { const geom = e.list.length === 1 ? e.list[0] : mergeGeometries(e.list, false); const mesh = new THREE.Mesh(geom, e.m); mesh.castShadow = cs; mesh.receiveShadow = false; g.add(mesh); }
        bag.clear(); return g;
      },
    };
    return b;
  }

  /* ---------- shared materials ---------- */
  const P = {
    plastic: M(0x15171b, 0.45, 0.2), plasticL: M(0x2b2f37, 0.5, 0.2), alu: M(0xb9c0ca, 0.28, 0.85), aluDark: M(0x4a4f58, 0.35, 0.8),
    white: M(0xe8eaee, 0.5, 0.05), paper: M(0xf4f4f0, 0.9), rubber: M(0x0b0c0e, 0.85), chrome: M(0xd5dbe3, 0.12, 1.0),
    mesh: M(0x1a1d23, 0.95), leather: M(0x0f1114, 0.38, 0.1), glow: new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false }),
    led: new THREE.MeshBasicMaterial({ color: 0x59d98e, toneMapped: false }), ledB: new THREE.MeshBasicMaterial({ color: 0x66b8ff, toneMapped: false }),
    water: new THREE.MeshStandardMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.0 }),
    coffee: M(0x2a160c, 0.3),
  };
  const keyTex = canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = '#0b0c0f'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a2e36';
    const rows = [14, 14, 13, 12, 8]; rows.forEach((n, r) => { const kw = (w - 20) / n; for (let i = 0; i < n; i++) { const wd = r === 4 && i === 3 ? kw * 3.6 : kw; g.fillStyle = '#2b2f37'; g.fillRect(10 + i * kw + 1.5, 8 + r * 29, (r === 4 && i >= 3 ? 0 : wd) - 3 || 0, 25); } });
    g.fillStyle = '#2b2f37'; g.fillRect(10 + 3 * ((w - 20) / 8), 8 + 4 * 29, 3.6 * ((w - 20) / 8) - 3, 25);
  });
  const padTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#16181d'; g.fillRect(0, 0, w, h); g.fillStyle = '#242830'; g.fillRect(0, 0, w, 2); });
  const keyMat = new THREE.MeshStandardMaterial({ map: keyTex, roughness: 0.55, metalness: 0.1 });
  const brandTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h); g.fillStyle = '#e8f1ff'; g.shadowColor = '#4da6ff'; g.shadowBlur = 8; g.font = '800 40px Arial'; g.textAlign = 'center'; g.fillText('H', 32, 46); });
  const brandMat = new THREE.MeshBasicMaterial({ map: brandTex, transparent: true, toneMapped: false });

  /* ---------- monitor ---------- */
  function monitor(parent, x, y, z, ry, tex, w = 0.56, h = 0.33) {
    const b = builder(parent, x, y, z, ry);       // built facing +Z; stand sits behind the panel
    b.cyl(0.11, 0.115, 0.012, P.aluDark, 0, 0.006, -0.03, 0, 0, 0, 28);
    b.rbox(0.05, 0.2, 0.03, 0.01, P.aluDark, 0, 0.11, -0.045, 0.12);
    b.rbox(0.09, 0.02, 0.05, 0.006, P.aluDark, 0, 0.2, -0.03);
    const cy = 0.2 + h / 2 + 0.012;
    b.rbox(w + 0.026, h + 0.026, 0.026, 0.007, P.plastic, 0, cy, 0);
    b.rbox(w * 0.55, h * 0.55, 0.03, 0.02, P.plasticL, 0, cy - 0.012, -0.026);                // rear hump
    b.box(0.03, 0.004, 0.003, P.led, w / 2 - 0.02, cy - h / 2 - 0.006, 0.0135);
    const grp = b.flush();
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: 0xc8d6ea, toneMapped: false }));
    scr.position.set(0, cy, 0.0135); grp.add(scr);
    return grp;
  }
  /* ---------- laptop ---------- */
  function laptop(parent, x, y, z, ry, tex) {
    const b = builder(parent, x, y, z, ry);
    b.rbox(0.34, 0.016, 0.235, 0.006, P.alu, 0, 0.008, 0);
    b.box(0.3, 0.003, 0.1, P.plastic, 0, 0.0175, -0.045);
    b.box(0.11, 0.002, 0.07, P.aluDark, 0, 0.017, 0.07);
    b.cyl(0.006, 0.006, 0.3, P.aluDark, 0, 0.018, -0.115, 0, 0, Math.PI / 2, 10);
    const lid = new THREE.Group(); lid.position.set(0, 0.018, -0.115); lid.rotation.x = -0.3; b.group.add(lid);
    const lb = builder(lid); lb.rbox(0.34, 0.225, 0.011, 0.005, P.alu, 0, 0.113, 0); lb.rbox(0.325, 0.21, 0.004, 0.003, P.plastic, 0, 0.113, 0.005); lb.flush();
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.195), new THREE.MeshBasicMaterial({ map: tex, color: 0xc8d6ea, toneMapped: false })); scr.position.set(0, 0.113, 0.0075); lid.add(scr);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), brandMat); logo.position.set(0, 0.113, -0.0062); logo.rotation.y = Math.PI; lid.add(logo);
    const kb = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.094), keyMat); kb.rotation.x = -Math.PI / 2; kb.position.set(0, 0.0192, -0.045); b.group.add(kb);
    return b.flush();
  }
  /* ---------- keyboard + mouse + mouse mat ---------- */
  function keyboard(parent, x, y, z, ry) {
    const b = builder(parent, x, y, z, ry);
    b.rbox(0.44, 0.016, 0.15, 0.005, P.plastic, 0, 0.008, 0, -0.04);
    b.rbox(0.074, 0.012, 0.04, 0.006, P.plasticL, 0.3, 0.006, 0.02);                  // mouse body
    b.sph(0.03, P.plasticL, 0.3, 0.014, 0.02, 0.9, 0.55, 1.3);
    b.box(0.2, 0.002, 0.18, P.rubber, 0.3, 0.001, 0.02);                              // mouse mat
    const g = b.flush();
    const kb = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.128), keyMat); kb.rotation.x = -Math.PI / 2 - 0.04; kb.position.set(0, 0.0165, 0); g.add(kb);
    return g;
  }
  /* ---------- small accessories ---------- */
  function mug(parent, x, y, z, c = 0xe8eef7) {
    const b = builder(parent, x, y, z); const m = M(c, 0.3, 0.05);
    b.cyl(0.04, 0.035, 0.092, m, 0, 0.046, 0, 0, 0, 0, 22); b.tor(0.026, 0.0065, m, 0.05, 0.05, 0, 0, 0, 0);
    b.cyl(0.0345, 0.0345, 0.002, P.coffee, 0, 0.088, 0, 0, 0, 0, 22);
    return b.flush();
  }
  function deskLamp(parent, x, y, z, ry = 0) {
    const b = builder(parent, x, y, z, ry);
    b.cyl(0.07, 0.08, 0.02, P.plastic, 0, 0.01, 0, 0, 0, 0, 24); b.cyl(0.008, 0.008, 0.3, P.alu, 0, 0.17, 0, 0, 0, 0, 8);
    b.sph(0.014, P.aluDark, 0, 0.31, 0); b.box(0.22, 0.008, 0.008, P.alu, 0.1, 0.35, 0, 0, 0, 0.18); b.sph(0.012, P.aluDark, 0.205, 0.39, 0);
    b.cyl(0.012, 0.055, 0.075, P.plastic, 0.22, 0.375, 0, 0, 0, 0.35, 20); b.sph(0.016, P.glow, 0.235, 0.348, 0);
    return b.flush();
  }
  function deskItems(parent, x, y, z, ry, v = 0) {
    const b = builder(parent, x, y, z, ry);
    if (v % 3 === 0) { // notebook + pen
      b.rbox(0.15, 0.014, 0.21, 0.003, M([0x1f3a63, 0x6d2535, 0x2b2f38][v % 3 === 0 ? (v >> 1) % 3 : 0], 0.6), 0, 0.007, 0, 0, 0.3, 0); b.box(0.145, 0.008, 0.2, P.paper, 0.004, 0.011, 0.0, 0, 0.3, 0);
      b.cyl(0.004, 0.004, 0.14, P.chrome, 0.1, 0.018, 0.03, Math.PI / 2, 0.9, 0, 8);
    } else if (v % 3 === 1) { // phone + earbuds case
      b.rbox(0.07, 0.008, 0.145, 0.008, P.plastic, 0, 0.004, 0, 0, 0.35, 0); b.box(0.062, 0.002, 0.135, M(0x0d1a2b, 0.2, 0.2), 0, 0.009, 0, 0, 0.35, 0);
      b.rbox(0.05, 0.02, 0.04, 0.01, P.white, 0.12, 0.01, 0.07);
    } else { // paper stack + clip
      for (let i = 0; i < 3; i++) b.box(0.21, 0.004, 0.297, P.paper, 0, 0.002 + i * 0.0042, 0, 0, 0.12 * i - 0.1, 0);
      b.box(0.02, 0.016, 0.03, P.chrome, 0.09, 0.012, 0.13);
    }
    return b.flush();
  }
  function headset(parent, x, y, z, ry = 0) {
    const b = builder(parent, x, y, z, ry);
    b.tor(0.075, 0.007, P.plastic, 0, 0.08, 0, 0, 0, 0, Math.PI); for (const s of [-1, 1]) b.cyl(0.04, 0.04, 0.03, P.plasticL, s * 0.075, 0.055, 0, 0, 0, Math.PI / 2, 18);
    return b.flush();
  }

  /* ---------- chairs ---------- */
  function chair(x, z, yaw, exec = false) {
    const b = builder(root, x, 0, z, yaw), g = b.group;
    const fab = exec ? P.leather : P.mesh, base = exec ? P.chrome : P.plastic;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      b.box(0.3, 0.022, 0.045, base, Math.sin(a) * 0.15, 0.075, Math.cos(a) * 0.15, 0, a - Math.PI / 2, 0.06);
      b.cyl(0.018, 0.018, 0.04, P.rubber, Math.sin(a) * 0.3, 0.045, Math.cos(a) * 0.3, 0, 0, 0, 10);
      b.sph(0.022, P.rubber, Math.sin(a) * 0.3, 0.025, Math.cos(a) * 0.3);
    }
    b.cyl(0.032, 0.04, 0.12, base, 0, 0.11, 0, 0, 0, 0, 14); b.cyl(0.024, 0.024, 0.2, P.chrome, 0, 0.25, 0, 0, 0, 0, 12);
    b.rbox(0.18, 0.04, 0.18, 0.012, P.plastic, 0, 0.36, 0.0);                                  // mechanism
    b.rbox(exec ? 0.54 : 0.5, 0.075, exec ? 0.54 : 0.5, 0.03, fab, 0, SEAT_TOP - 0.038, 0.0);   // seat
    if (exec) {
      b.rbox(0.54, 0.74, 0.1, 0.045, fab, 0, 0.9, -0.255, -0.14); b.rbox(0.34, 0.2, 0.1, 0.05, fab, 0, 1.38, -0.31, -0.18);
      for (const yy of [0.7, 0.95, 1.2]) b.box(0.5, 0.008, 0.012, P.plasticL, 0, yy, -0.2, -0.14);
      b.box(0.04, 0.3, 0.05, base, 0, 0.62, -0.23, -0.2);
    } else {
      b.rbox(0.46, 0.46, 0.05, 0.03, fab, 0, 0.74, -0.255, -0.12); b.box(0.04, 0.3, 0.04, P.plastic, 0, 0.55, -0.235, -0.12);
      b.rbox(0.4, 0.08, 0.035, 0.015, P.plasticL, 0, 0.58, -0.225, -0.12);
    }
    for (const sx of [-1, 1]) { b.box(0.03, 0.2, 0.03, P.plastic, sx * 0.265, 0.56, -0.05); b.rbox(0.06, 0.03, 0.27, 0.012, exec ? P.leather : P.plasticL, sx * 0.265, 0.665, 0.02); }
    b.flush(); return g;
  }

  /* ---------- sofa / coffee table ---------- */
  function sofa(x, z, ry, w = 2.2, c = 0x14161b) {
    const b = builder(root, x, 0, z, ry), fab = M(c, 0.8, 0.0, { o: {} }), dark = M(new THREE.Color(c).multiplyScalar(0.7).getHex(), 0.85);
    b.rbox(w, 0.22, 0.95, 0.05, dark, 0, 0.2, 0);                                                 // base
    for (const sx of [-1, 1]) b.rbox(0.2, 0.55, 0.95, 0.07, fab, sx * (w / 2 - 0.1), 0.42, 0);   // arms
    b.rbox(w - 0.3, 0.58, 0.24, 0.08, fab, 0, 0.62, -0.36, -0.1);                                 // back
    const n = Math.max(2, Math.round(w / 0.8));
    for (let i = 0; i < n; i++) { const cw = (w - 0.4) / n; b.rbox(cw - 0.015, 0.16, 0.7, 0.06, fab, -((w - 0.4) / 2) + cw * (i + 0.5), 0.4, 0.07); b.rbox(cw - 0.06, 0.34, 0.14, 0.06, fab, -((w - 0.4) / 2) + cw * (i + 0.5), 0.66, -0.2, -0.22); }
    const pil = M(0x3a4a6a, 0.9); b.rbox(0.38, 0.38, 0.12, 0.05, pil, -w / 2 + 0.35, 0.65, -0.12, -0.2, 0.3, 0.1); b.rbox(0.34, 0.34, 0.1, 0.05, M(0x7a8aa0, 0.9), w / 2 - 0.38, 0.62, -0.14, -0.2, -0.25, -0.08);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.02, 0.014, 0.1, P.chrome, sx * (w / 2 - 0.12), 0.05, sz * 0.38, 0, 0, 0, 8);
    return b.flush();
  }
  function coffeeTable(x, z, w = 1.1, d = 0.6, plantFn) {
    const b = builder(root, x, 0, z), glass = new THREE.MeshStandardMaterial({ color: 0x8fb4d8, transparent: true, opacity: 0.3, roughness: 0.04, metalness: 0.2 });
    b.rbox(w, 0.03, d, 0.012, glass, 0, 0.42, 0); b.rbox(w - 0.18, 0.012, d - 0.18, 0.005, P.aluDark, 0, 0.19, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.014, 0.014, 0.4, P.chrome, sx * (w / 2 - 0.05), 0.2, sz * (d / 2 - 0.05), 0, 0, 0, 8);
    b.rbox(0.28, 0.025, 0.2, 0.006, M(0x1f3a63, 0.6), -0.2, 0.446, 0.04, 0, 0.3, 0); b.rbox(0.25, 0.02, 0.18, 0.006, M(0xd9d3c5, 0.6), -0.2, 0.468, 0.04, 0, -0.2, 0);
    b.flush(); return b.group;
  }

  /* ---------- printer, water cooler, clock, bin ---------- */
  function printer(x, z, ry) {
    const b = builder(root, x, 0, z, ry);
    b.rbox(0.62, 0.78, 0.6, 0.02, P.white, 0, 0.39, 0); b.rbox(0.64, 0.12, 0.62, 0.02, P.aluDark, 0, 0.84, 0);
    b.rbox(0.56, 0.05, 0.5, 0.01, P.plasticL, 0, 0.92, -0.03, 0.0); b.rbox(0.24, 0.04, 0.12, 0.01, P.plastic, 0.16, 0.88, 0.3, -0.5);
    for (let i = 0; i < 3; i++) { b.box(0.56, 0.007, 0.01, P.aluDark, 0, 0.18 + i * 0.2, 0.305); b.box(0.12, 0.016, 0.012, P.aluDark, 0, 0.25 + i * 0.2, 0.31); }
    b.rbox(0.34, 0.2, 0.012, 0.004, P.paper, -0.06, 0.78, 0.22, 0.45);                          // output tray with paper
    b.box(0.12, 0.012, 0.012, P.led, 0.2, 0.9, 0.33);
    return b.flush();
  }
  function waterCooler(x, z, ry) {
    const b = builder(root, x, 0, z, ry);
    b.rbox(0.36, 0.95, 0.36, 0.03, P.white, 0, 0.48, 0);
    b.rbox(0.3, 0.1, 0.01, 0.003, P.plastic, 0, 0.78, 0.18); b.box(0.04, 0.05, 0.05, M(0x3b82f6, 0.4), -0.06, 0.74, 0.2); b.box(0.04, 0.05, 0.05, M(0xef4444, 0.4), 0.06, 0.74, 0.2);
    b.rbox(0.26, 0.02, 0.1, 0.005, P.aluDark, 0, 0.6, 0.2); b.cyl(0.13, 0.15, 0.4, P.water, 0, 1.18, 0, 0, 0, 0, 24); b.cyl(0.07, 0.13, 0.08, P.water, 0, 1.42, 0, 0, 0, 0, 24);
    b.cyl(0.04, 0.04, 0.03, M(0x2f7de0, 0.4), 0, 1.47, 0, 0, 0, 0, 14);
    return b.flush();
  }
  function wallClock(x, y, z, ry, r = 0.28) {
    const tex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#0b0d12'; g.beginPath(); g.arc(128, 128, 126, 0, TAU); g.fill(); g.strokeStyle = '#c9d2de'; g.lineWidth = 3;
      for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU, l = i % 5 ? 6 : 16; g.lineWidth = i % 5 ? 1.5 : 4; g.beginPath(); g.moveTo(128 + Math.sin(a) * (118 - l), 128 - Math.cos(a) * (118 - l)); g.lineTo(128 + Math.sin(a) * 118, 128 - Math.cos(a) * 118); g.stroke(); }
      g.lineCap = 'round'; g.strokeStyle = '#f2f6fb'; g.lineWidth = 7; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(-0.9) * 62, 128 - Math.cos(-0.9) * 62); g.stroke();
      g.lineWidth = 4.5; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(2.1) * 92, 128 - Math.cos(2.1) * 92); g.stroke(); g.strokeStyle = '#4da6ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(4.2) * 100, 128 - Math.cos(4.2) * 100); g.stroke();
    });
    const b = builder(root, x, y, z, ry); b.tor(r, 0.014, P.chrome, 0, 0, 0.012, 0, 0, 0); const g = b.flush();
    const f = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); f.position.z = 0.012; g.add(f); return g;
  }
  function bin(x, z, c = 0x1a1c21) { const b = builder(root, x, 0, z); b.cyl(0.14, 0.11, 0.34, M(c, 0.5, 0.2), 0, 0.17, 0, 0, 0, 0, 24); b.tor(0.14, 0.008, P.chrome, 0, 0.34, 0, Math.PI / 2, 0, 0); return b.flush(); }

  /* ---------- plants ---------- */
  let pIdx = 0;
  function plant(x, z, s = 1, parent = root, y = 0, kind = null) {
    pIdx++;
    const small = s < 0.6;
    const k = kind || (small ? 'succulent' : s >= 1.25 ? ['ficus', 'palm'][pIdx % 2] : ['palm', 'snake', 'ficus'][pIdx % 3]);
    const pl = makePlant(k, pIdx % 6, cs && !small);
    pl.position.set(x, y, z); pl.scale.setScalar(small ? s * 2.4 : s); pl.rotation.y = pIdx * 1.7; parent.add(pl); return pl;
  }

  return { builder, monitor, laptop, keyboard, mug, deskLamp, deskItems, headset, chair, sofa, coffeeTable, printer, waterCooler, wallClock, bin, plant, P };
}
