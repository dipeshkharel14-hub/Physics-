/* ==========================================================================
   Hsepid.np — the 3D office (procedural geometry, no external assets needed)
   --------------------------------------------------------------------------
   Coordinates: metres. Floor y=0. Room x∈[-11,11], z∈[-10,10], ceiling 4.2.
   The customer entrance is in the front wall (z=+10) at x=0; the street is z>10.
   Boss cabin (glass) back-centre, manager office (glass) back-right,
   reception front-left, two open-workspace benches in the middle.
   ========================================================================== */
import * as THREE from 'three';
import { Human, HumanFX, SEAT_TOP, FEET_FWD_SEATED } from './hsx-human.js?v=5';
import { makeProps, disposePlantShared } from './hsx-props.js?v=5';

const TAU = Math.PI * 2;
const H = 4.2;

/* ---------- canvas texture helpers ------------------------------------- */
export function canvasTex(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.userData = { canvas: c };
  return t;
}

/** Draws the Hsepid.np emblem (stylised H + mountain + wave). Used when no logo image is supplied. */
export function drawLogo(g, cx, top, size, { glow = true } = {}) {
  const s = size / 260;
  g.save(); g.translate(cx, top); g.scale(s, s);
  if (glow) { g.shadowColor = 'rgba(70,150,255,0.9)'; g.shadowBlur = 28; }
  const silver = g.createLinearGradient(0, 0, 0, 260); silver.addColorStop(0, '#ffffff'); silver.addColorStop(0.5, '#cfd6e0'); silver.addColorStop(1, '#8e98a8');
  g.fillStyle = silver;
  const bar = (x) => { g.beginPath(); g.moveTo(x - 20, 6); g.lineTo(x + 20, 6); g.lineTo(x + 20, 250); g.lineTo(x - 20, 250); g.closePath(); g.fill(); };
  bar(-78); bar(78);
  // mountain between bars
  g.beginPath(); g.moveTo(-58, 210); g.lineTo(-22, 128); g.lineTo(-4, 156); g.lineTo(26, 84); g.lineTo(58, 210); g.closePath(); g.fill();
  g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(26, 84); g.lineTo(10, 118); g.lineTo(22, 112); g.lineTo(30, 126); g.lineTo(40, 112); g.lineTo(46, 118); g.closePath(); g.fill();
  // wave swoosh
  if (glow) { g.shadowColor = 'rgba(60,150,255,1)'; g.shadowBlur = 24; }
  const wave = g.createLinearGradient(-130, 0, 130, 0); wave.addColorStop(0, '#1b6fe0'); wave.addColorStop(0.5, '#59b6ff'); wave.addColorStop(1, '#a8e0ff');
  g.fillStyle = wave; g.beginPath();
  g.moveTo(-132, 196); g.bezierCurveTo(-70, 150, -20, 206, 30, 222); g.bezierCurveTo(70, 234, 105, 214, 134, 168);
  g.bezierCurveTo(112, 232, 62, 262, 14, 252); g.bezierCurveTo(-40, 242, -86, 190, -132, 196); g.closePath(); g.fill();
  g.restore();
}

/** Full sign: emblem + "Hsepid.np" wordmark (+ optional strapline). */
export function makeLogoCanvas(logoImg, { w = 1024, h = 640, strap = true, brand = 'Hsepid.np' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (logoImg) {
    const r = Math.min(w / logoImg.width, h / logoImg.height) * 0.92;
    g.drawImage(logoImg, (w - logoImg.width * r) / 2, (h - logoImg.height * r) / 2, logoImg.width * r, logoImg.height * r);
    return c;
  }
  drawLogo(g, w / 2, 24, 300);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = '800 170px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif';
  const idx = brand.indexOf('.');
  const a = idx > 0 ? brand.slice(0, idx) : brand, b = idx > 0 ? brand.slice(idx) : '';
  const wa = g.measureText(a).width, wb = g.measureText(b).width, x0 = w / 2 - (wa + wb) / 2;
  g.shadowColor = 'rgba(70,150,255,.9)'; g.shadowBlur = 26;
  g.textAlign = 'left'; g.fillStyle = '#f4f8ff'; g.fillText(a, x0, 520);
  g.fillStyle = '#4da6ff'; g.fillText(b, x0 + wa, 520);
  if (strap) {
    g.shadowBlur = 0; g.fillStyle = 'rgba(190,210,235,.85)'; g.textAlign = 'center';
    g.font = '600 38px "Plus Jakarta Sans", Arial, sans-serif';
    g.fillText('IDEAS   ·   PRODUCTS   ·   IMPACT', w / 2, 596);
  }
  return c;
}

function plateTex(line1, line2, w = 512, h = 160) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = '#0b0e14'; rr(g, 4, 4, w - 8, h - 8, 26); g.fill();
    g.strokeStyle = 'rgba(90,170,255,.85)'; g.lineWidth = 4; rr(g, 4, 4, w - 8, h - 8, 26); g.stroke();
    g.textAlign = 'center'; g.fillStyle = '#f2f6fb';
    g.font = '700 52px "Plus Jakarta Sans", Arial, sans-serif'; g.fillText(line1, w / 2, line2 ? 76 : 98);
    if (line2) { g.fillStyle = '#9ec7ff'; g.font = '600 38px "Plus Jakarta Sans", Arial, sans-serif'; g.fillText(line2, w / 2, 126); }
  });
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function screenTex(kind, seed = 0) {
  return canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = kind === 'light' ? '#dfe7f2' : '#0d1422'; g.fillRect(0, 0, w, h);
    let r = seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    if (kind === 'code') {
      for (let y = 10; y < h - 6; y += 9) {
        let x = 10 + Math.floor(rnd() * 3) * 12; const n = 2 + Math.floor(rnd() * 5);
        for (let i = 0; i < n; i++) { const len = 12 + rnd() * 46; g.fillStyle = ['#5aa9ff', '#9be08a', '#f0c674', '#c792ea', '#cfd8e6'][Math.floor(rnd() * 5)]; g.fillRect(x, y, len, 4); x += len + 5; if (x > w - 20) break; }
      }
    } else if (kind === 'chart') {
      g.strokeStyle = 'rgba(120,160,220,.25)'; for (let y = 20; y < h; y += 25) { g.beginPath(); g.moveTo(10, y); g.lineTo(w - 10, y); g.stroke(); }
      g.strokeStyle = '#4da6ff'; g.lineWidth = 2.5; g.beginPath(); for (let i = 0; i < 14; i++) { const x = 14 + i * 17.5, y = 120 - rnd() * 70 - i * 2; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      g.fillStyle = '#3ddc97'; for (let i = 0; i < 8; i++) g.fillRect(16 + i * 30, 150 - rnd() * 40, 16, 30);
    } else if (kind === 'light') {
      g.fillStyle = '#ffffff'; g.fillRect(14, 12, w - 28, 22); g.fillStyle = '#c9d4e4';
      for (let y = 46; y < h - 10; y += 14) g.fillRect(18, y, 60 + rnd() * (w - 100), 6);
    } else {
      for (let i = 0; i < 4; i++) { g.fillStyle = `hsl(${205 + rnd() * 40},60%,${35 + rnd() * 20}%)`; g.fillRect(14 + (i % 2) * 118, 14 + Math.floor(i / 2) * 70, 108, 60); }
    }
  });
}

/* ======================================================================= */
export function buildWorld(ctx) {
  const { config, quality, logoCanvas, envMap, tween } = ctx;
  const root = new THREE.Group(); root.name = 'hsx-world';
  const updaters = [];
  const pick = [];                       // raycast proxies
  const lights = {};
  const cs = quality.shadows;
  HumanFX.castShadows = cs && quality.characterShadows;

  /* ---- materials ------------------------------------------------------ */
  const M = (color, rough = 0.7, metal = 0, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, envMap ? { envMapIntensity: extra.env ?? 0.6 } : {}, extra.o || {}));
  const floorTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#3b332d'; g.fillRect(0, 0, w, h);
    const pw = w / 8;
    for (let i = 0; i < 8; i++) { const v = 40 + Math.random() * 14; g.fillStyle = `rgb(${v + 22},${v + 14},${v + 8})`; g.fillRect(i * pw + 1, 0, pw - 2, h); }
    g.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 8; i++) g.fillRect(i * pw, 0, 2, h);
    for (let k = 0; k < 14; k++) { const x = Math.random() * w, y = Math.random() * h; g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y, pw - 3, 2); }
  }, { repeat: [5, 5] });
  const mat = {
    floor: M(0x8a7a70, 0.32, 0.08, { env: 0.9, o: { map: floorTex } }),
    wall: M(0x181b22, 0.85, 0.05),
    wallLight: M(0x20242d, 0.8, 0.05),
    ceiling: M(0x0b0d12, 0.9),
    wood: M(0x3a2a20, 0.55, 0.05),
    woodDark: M(0x20170f, 0.5, 0.05),
    desk: M(0x1a1d24, 0.45, 0.15),
    deskTop: M(0x2a2f39, 0.35, 0.2),
    metal: M(0x9aa3ae, 0.35, 0.8),
    black: M(0x0b0c10, 0.5, 0.3),
    leather: M(0x101216, 0.4, 0.1),
    fabric: M(0x2a303b, 0.9),
    plant: M(0x2c6b3c, 0.8), pot: M(0x1b1c20, 0.5, 0.2),
    glass: new THREE.MeshStandardMaterial({ color: 0x9cc4ff, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 }),
    glassFrame: M(0x07080b, 0.4, 0.6),
    ledBlue: new THREE.MeshBasicMaterial({ color: 0x66b8ff, toneMapped: false }),
    ledWarm: new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }),
    panelLight: new THREE.MeshBasicMaterial({ color: 0xdfeaff, toneMapped: false }),
    proxy: new THREE.MeshBasicMaterial({ visible: false }),
  };

  /* ---- tiny builders -------------------------------------------------- */
  const box = (w, h, d, m, x = 0, y = 0, z = 0, parent = root, shadow = false, recv = false) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z);
    mesh.castShadow = shadow && cs; mesh.receiveShadow = recv && cs; parent.add(mesh); return mesh;
  };
  const cyl = (rt, rb, h, m, x, y, z, parent = root, seg = 16) => { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
  const grp = (x = 0, y = 0, z = 0, parent = root, ry = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; };
  const plane = (w, h, m, x, y, z, ry = 0, parent = root) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; parent.add(p); return p; };
  const proxy = (id, label, w, h, d, x, y, z, parent = root, extra = {}) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.proxy); p.position.set(x, y, z); p.visible = false;
    p.userData = Object.assign({ pickId: id, label }, extra); parent.add(p); pick.push(p); return p;
  };

  /* ---- shell: floor, ceiling, walls -------------------------------------*/
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 20), mat.floor); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = cs; root.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(22, 20), mat.ceiling); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; root.add(ceil);
  // exterior ground / street
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), M(0x07090d, 0.55, 0.2)); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, 50); root.add(ground);
  const walk = box(22, 0.08, 4.5, M(0x15181e, 0.6, 0.1), 0, -0.01, 12.25); walk.receiveShadow = cs;

  const wallT = 0.3, DOOR_W = 2.4, DOOR_H = 2.7;
  box(22.6, H, wallT, mat.wall, 0, H / 2, -10 - wallT / 2, root, false, false);            // back
  box(wallT, H, 20.6, mat.wall, -11 - wallT / 2, H / 2, 0);                                 // left
  box(wallT, H, 20.6, mat.wall, 11 + wallT / 2, H / 2, 0);                                  // right
  const fw = (22 - DOOR_W) / 2;
  box(fw, H, wallT, mat.wall, -11 + fw / 2, H / 2, 10 + wallT / 2);                         // front-left
  box(fw, H, wallT, mat.wall, 11 - fw / 2, H / 2, 10 + wallT / 2);                          // front-right
  box(DOOR_W, H - DOOR_H, wallT, mat.wall, 0, DOOR_H + (H - DOOR_H) / 2, 10 + wallT / 2);   // lintel

  // slat panelling flanking the entrance (interior)
  const slatM = M(0x3b2b20, 0.5, 0.05);
  for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 12; i++) {
    box(0.08, 3.4, 0.06, slatM, side * (1.6 + i * 0.13), 1.7, 9.78);
  }
  // blue LED coves (ceiling perimeter + under lintel)
  box(22, 0.05, 0.08, mat.ledBlue, 0, H - 0.12, 9.7); box(22, 0.05, 0.08, mat.ledBlue, 0, H - 0.12, -9.7);
  box(0.08, 0.05, 20, mat.ledBlue, -10.7, H - 0.12, 0); box(0.08, 0.05, 20, mat.ledBlue, 10.7, H - 0.12, 0);
  // ceiling light panels
  for (const x of [-7, -2.5, 2.5, 7]) for (const z of [-1, 3.2, 7.4]) box(1.6, 0.04, 0.45, mat.panelLight, x, H - 0.03, z);

  /* ---- exterior façade signage ---------------------------------------- */
  const logoImgTex = new THREE.CanvasTexture(logoCanvas); logoImgTex.colorSpace = THREE.SRGBColorSpace; logoImgTex.anisotropy = 8;
  const signMat = new THREE.MeshBasicMaterial({ map: logoImgTex, transparent: true, toneMapped: false });
  box(3.7, 1.46, 0.06, M(0x06080c, 0.5, 0.4), 0, 3.47, 10.34);                              // dark sign board above door (outside)
  plane(2.3, 2.3 * 640 / 1024, signMat, 0, 3.47, 10.38);
  // big panel left of door (exterior): logo + strapline
  box(5.6, 2.6, 0.08, M(0x080a0f, 0.5, 0.3), -6.4, 1.7, 10.34);
  plane(4.6, 4.6 * 640 / 1024, signMat, -6.4, 1.75, 10.39);
  // exterior blue wash
  const sw = new THREE.PointLight(0x4da6ff, 14, 14, 2); sw.position.set(0, 4.0, 12.5); root.add(sw); lights.sign = sw;
  const sw2 = new THREE.PointLight(0x4da6ff, 8, 10, 2); sw2.position.set(-6.4, 3.2, 12); root.add(sw2);
  // exterior wall lights & door canopy
  for (const x of [-1.9, 1.9]) { box(0.14, 1.3, 0.1, mat.ledWarm, x, 1.5, 10.4); }
  box(3.2, 0.1, 0.9, M(0x0d0f14, 0.4, 0.5), 0, DOOR_H + 0.08, 10.7);
  box(3.2, 0.03, 0.04, mat.ledBlue, 0, DOOR_H + 0.02, 11.13);
  // welcome mat
  const matTex = canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#0d0e12'; g.fillRect(0, 0, w, h); g.fillStyle = '#7f8794'; g.font = 'italic 44px Georgia, serif'; g.textAlign = 'center'; g.fillText('Welcome', w / 2, 62); });
  const mp = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.7), new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.95 })); mp.rotation.x = -Math.PI / 2; mp.position.set(0, 0.04, 11.0); root.add(mp);

  /* ---- sliding glass door builder -------------------------------------- */
  function slidingDoor({ x, z, ry = 0, width, height, id, label, panelColor }) {
    const g = grp(x, 0, z, root, ry);
    const pw = width / 2;
    const mkPanel = (cx) => {
      const p = grp(cx, 0, 0, g);
      box(pw - 0.02, height - 0.06, 0.03, mat.glass, 0, height / 2, 0, p);
      box(pw, 0.05, 0.06, mat.glassFrame, 0, height - 0.03, 0, p); box(pw, 0.07, 0.06, mat.glassFrame, 0, 0.04, 0, p);
      box(0.05, height, 0.06, mat.glassFrame, -pw / 2, height / 2, 0, p); box(0.05, height, 0.06, mat.glassFrame, pw / 2, height / 2, 0, p);
      return p;
    };
    const L = mkPanel(-pw / 2), R = mkPanel(pw / 2);
    // pull handles on inner edges
    for (const [p, sx] of [[L, 1], [R, -1]]) cyl(0.015, 0.015, 0.9, mat.metal, sx * (pw / 2 - 0.1), 1.05, 0.06, p, 8);
    const door = { group: g, u: 0, id, setOpen(u) { this.u = u; L.position.x = -pw / 2 - u * (pw - 0.04); R.position.x = pw / 2 + u * (pw - 0.04); }, get isOpen() { return this.u > 0.5; } };
    door.proxy = proxy(id, label, width, height, 0.5, 0, height / 2, 0, g);
    door.tweenTo = (target, dur = 1.1) => { const a = door.u; return tween(dur, (u) => door.setOpen(a + (target - a) * u)); };
    return door;
  }
  const doors = {
    entrance: slidingDoor({ x: 0, z: 10.0, width: DOOR_W, height: DOOR_H, id: 'door', label: 'Click to enter' }),
    boss: slidingDoor({ x: 0, z: -5.0, width: 1.7, height: 3.0, id: 'bossDoor', label: 'Boss cabin' }),
    manager: slidingDoor({ x: 6.2, z: -6.6, ry: Math.PI / 2, width: 1.5, height: 3.0, id: 'managerDoor', label: 'Manager office' }),
  };

  /* ---- glass partitions -------------------------------------------------*/
  function glassWall(x1, z1, x2, z2, h = 3.2, mullions = 4) {
    const len = Math.hypot(x2 - x1, z2 - z1), ry = -Math.atan2(z2 - z1, x2 - x1);
    const g = grp((x1 + x2) / 2, 0, (z1 + z2) / 2, root, ry);
    box(len, h, 0.03, mat.glass, 0, h / 2, 0, g);
    box(len, 0.06, 0.07, mat.glassFrame, 0, h, 0, g); box(len, 0.08, 0.08, mat.glassFrame, 0, 0.04, 0, g);
    for (let i = 0; i <= mullions; i++) box(0.05, h, 0.07, mat.glassFrame, -len / 2 + (len * i) / mullions, h / 2, 0, g);
    return g;
  }
  // boss cabin x∈[-3.8,3.8], z∈[-10,-5]
  glassWall(-3.8, -5, -0.85, -5, 3.2, 2); glassWall(0.85, -5, 3.8, -5, 3.2, 2);
  box(1.7, 0.2, 0.07, mat.glassFrame, 0, 3.1, -5);
  glassWall(-3.8, -10, -3.8, -5, 3.2, 4); glassWall(3.8, -10, 3.8, -5, 3.2, 4);
  // manager office x∈[6.2,11], z∈[-10,-4.6]
  glassWall(6.2, -4.6, 11, -4.6, 3.2, 4);
  glassWall(6.2, -10, 6.2, -7.35, 3.2, 2); glassWall(6.2, -5.85, 6.2, -4.6, 3.2, 1);
  box(0.07, 0.2, 1.5, mat.glassFrame, 6.2, 3.1, -6.6);
  // office carpets
  const rug = (x, z, w, d, c) => { const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M(c, 0.95)); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.01, z); r.receiveShadow = cs; root.add(r); };
  rug(0, -7.4, 6.8, 4.4, 0x14161c); rug(8.6, -7.3, 4.2, 4.6, 0x171a21);

  /* ---- props ----------------------------------------------------------- */
  const PR = makeProps({ mat, M, cs, root, canvasTex, SEAT_TOP });
  const { monitor, laptop, keyboard, mug, deskLamp, deskItems, headset, chair, sofa, plant } = PR;
  const coffeeTable = (x, z, w = 1.1, d = 0.6) => { PR.coffeeTable(x, z, w, d); plant(x + 0.1, z, 0.25, root, 0.436, 'succulent'); };
  function frame(art, w, h, x, y, z, ry) {
    const g = grp(x, y, z, root, ry);
    box(w + 0.1, h + 0.1, 0.05, mat.glassFrame, 0, 0, 0, g);
    plane(w, h, new THREE.MeshBasicMaterial({ map: art, toneMapped: false, color: 0xbfc8d6 }), 0, 0, 0.03, 0, g);
    return g;
  }
  const mountainArt = canvasTex(512, 320, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#0a1020'); sky.addColorStop(0.6, '#16294a'); sky.addColorStop(1, '#27456f'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; g.fillRect(Math.random() * w, Math.random() * h * 0.6, 1.5, 1.5); }
    const ridge = (col, base, amp, seed) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 8) g.lineTo(x, base - amp * Math.abs(Math.sin(x * 0.012 + seed)) * (0.5 + 0.5 * Math.sin(x * 0.031 + seed * 2))); g.lineTo(w, h); g.fill(); };
    ridge('#1c2f52', 210, 130, 1); ridge('#0e1a31', 250, 110, 3); ridge('#060a14', 290, 70, 5);
    g.fillStyle = 'rgba(180,220,255,.5)'; g.beginPath(); g.arc(380, 70, 22, 0, TAU); g.fill();
  });
  function shelf(x, z, ry, w = 1.6, hgt = 2.4) {
    const g = grp(x, 0, z, root, ry);
    box(0.05, hgt, 0.34, mat.woodDark, -w / 2, hgt / 2, 0, g, true); box(0.05, hgt, 0.34, mat.woodDark, w / 2, hgt / 2, 0, g, true);
    box(w, hgt, 0.02, mat.woodDark, 0, hgt / 2, -0.16, g);
    const cols = [0x1f2a3f, 0x3a2a20, 0x5a1d1d, 0x21463a, 0x6d5a2f, 0x2b2f38, 0x9aa3ae];
    for (let i = 0; i <= 4; i++) {
      const y = 0.1 + i * ((hgt - 0.15) / 4);
      box(w, 0.035, 0.34, mat.woodDark, 0, y, 0, g);
      if (i < 4) { box(w - 0.1, 0.02, 0.02, mat.ledWarm, 0, y + (hgt - 0.15) / 4 - 0.03, 0.14, g);
        let bx = -w / 2 + 0.1;
        while (bx < w / 2 - 0.15) {
          const bw = 0.03 + Math.random() * 0.04, bh = 0.18 + Math.random() * 0.14;
          if (Math.random() < 0.12) { cyl(0.05, 0.07, 0.2, mat.metal, bx + 0.05, y + 0.12, 0, g, 10); bx += 0.15; continue; }
          box(bw, bh, 0.22, M(cols[Math.floor(Math.random() * cols.length)], 0.7), bx + bw / 2, y + 0.018 + bh / 2, 0, g); bx += bw + 0.004;
        }
      }
    }
    return g;
  }
  /* ---- Seat bookkeeping (chair + occupant move together) ------------------ */
  const seats = [];
  function addSeat(human, chairGroup, x, z, yaw) {
    const s = { human, chair: chairGroup, home: new THREE.Vector3(x, 0, z), yaw, pushed: 0 };
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    s.setPush = (d) => { s.pushed = d; const px = x - fwd.x * d, pz = z - fwd.z * d; chairGroup.position.set(px, 0, pz); if (human && human.sitProg > 0.99 || (human && human.sitDir === 0 && human.sitProg > 0.5)) human.root.position.set(px, 0, pz); };
    s.pushTo = (d, dur = 0.7) => { const a = s.pushed; return tween(dur, (u) => s.setPush(a + (d - a) * u)); };
    s.standSpot = (d) => { const px = x - fwd.x * d + fwd.x * FEET_FWD_SEATED, pz = z - fwd.z * d + fwd.z * FEET_FWD_SEATED; return { x: px, z: pz }; };
    seats.push(s); return s;
  }
  function seatedHuman(opts, x, z, yaw, exec = false, typing = true) {
    const ch = chair(x, z, yaw, exec);
    const h = new Human(opts); h.root.position.set(x, 0, z); h.seatInstantly(yaw); h.typing = typing; world.humans.push(h); root.add(h.root);
    return addSeat(h, ch, x, z, yaw);
  }
  const world = { humans: [], root, pick, doors, seats, lights, updaters };

  /* ---- RECEPTION --------------------------------------------------------- */
  const RX = -2.6, RZ = 4.6;
  {
    const g = grp(RX, 0, RZ);
    box(3.4, 0.74, 0.9, mat.desk, 0, 0.37, 0, g, true, true);
    box(3.5, 0.05, 1.0, mat.deskTop, 0, 0.765, 0, g, true, true);
    box(3.5, 0.28, 0.1, mat.deskTop, 0, 1.0, 0.45, g, true);               // raised counter lip on visitor side
    box(3.3, 0.03, 0.05, mat.ledBlue, 0, 0.12, 0.46, g);
    // front facing logo panel
    const lp = plane(1.5, 0.72, signMat, 0, 0.42, 0.455, 0, g);
    // computer + gear
    const scr = screenTex('chart', 3); monitor(g, -0.5, 0.79, -0.05, Math.PI, scr, 0.6, 0.35);
    keyboard(g, -0.5, 0.79, -0.32, Math.PI);
    box(0.3, 0.02, 0.2, M(0xe9ebef, 0.5), 0.5, 0.79, -0.15, g);            // notepad / documents
    deskLamp(g, 1.4, 0.79, -0.2, 2.6); mug(g, 0.9, 0.79, -0.28, 0xe8eef7); plant(1.45, 0.05, 0.4, g, 0.79);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.19), new THREE.MeshBasicMaterial({ map: plateTex(config.people.muskan.name, config.people.muskan.role), transparent: true, toneMapped: false }));
    pl.position.set(0.9, 1.22, 0.46); g.add(pl);
    // bell
    cyl(0.05, 0.06, 0.03, mat.metal, -1.2, 1.16, 0.45, g, 16);
  }
  const muskanSeat = seatedHuman({ id: 'muskan', skin: 0xc79468, hair: 'long', hairColor: 0x140d0b, style: 'blazer', top: 0x2d4a63, shirt: 0xf3eee6, bottom: 0x1c2230, shoe: 0x1a1210, female: true, badge: true, watch: true, scale: 0.97 }, RX, 3.85, 0);
  world.muskan = muskanSeat.human; world.muskanSeat = muskanSeat;
  muskanSeat.human.lookAt(new THREE.Vector3(RX, 1.2, 4.6));
  world.pickMuskan = proxy('muskan', 'Click to interact', 1.0, 1.9, 1.0, RX, 0.95, 3.85);
  muskanSeat.human.root.userData.proxy = world.pickMuskan;
  world.pickMuskan.userData.follow = muskanSeat.human;

  /* ---- BOSS CABIN -------------------------------------------------------- */
  {
    const g = grp(0, 0, -8.05);
    box(2.6, 0.7, 1.0, mat.woodDark, 0, 0.35, 0, g, true, true);
    box(2.7, 0.06, 1.1, mat.wood, 0, 0.74, 0, g, true, true);
    box(1.2, 0.012, 0.6, mat.leather, 0, 0.775, -0.02, g);
    box(2.5, 0.025, 0.04, mat.ledBlue, 0, 0.12, 0.52, g);
    // boss laptop (screen faces the boss: boss is at -z, so screen faces -z => ry=PI)
    laptop(g, -0.25, 0.775, -0.2, Math.PI, screenTex('code', 11));
    keyboard(g, 0.55, 0.775, -0.3, Math.PI);
    deskLamp(g, 1.1, 0.775, -0.25, 0.2); mug(g, -0.9, 0.775, -0.15, 0x1b1f28);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.2), new THREE.MeshBasicMaterial({ map: plateTex(config.people.boss.name, '(' + config.people.boss.role + ')'), transparent: true, toneMapped: false }));
    pl.position.set(0, 0.55, 0.52); g.add(pl);
    // pen stand and a globe
    cyl(0.03, 0.03, 0.09, mat.metal, 0.9, 0.82, -0.3, g, 10);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), M(0x1f4d7a, 0.4, 0.3)); globe.position.set(-1.05, 0.9, 0.15); g.add(globe); cyl(0.01, 0.01, 0.1, mat.metal, -1.05, 0.82, 0.15, g, 6);
  }
  const bossSeat = seatedHuman({ id: 'boss', skin: 0xb98660, hair: 'bald', style: 'suit', top: 0x1a1c22, pinstripe: '#454a58', shirt: 0x14161c, bottom: 0x15171c, tie: null, hat: 0x0b0b0e, faceHidden: true, watch: true, build: 'avg', scale: 1.02 }, 0, -8.88, 0, true);
  world.boss = bossSeat.human; world.bossSeat = bossSeat; bossSeat.human.typing = true; bossSeat.human.typeRate = 4.2;
  // backdrop: framed mountain panel + logo + shelves
  box(5.4, 3.0, 0.1, M(0x07090d, 0.5, 0.3), 0, 2.0, -9.86);
  plane(5.2, 2.8, new THREE.MeshBasicMaterial({ map: mountainArt, color: 0x9fb0cc, toneMapped: false }), 0, 2.0, -9.8);
  plane(2.6, 2.6 * 640 / 1024, signMat, 0, 2.25, -9.78);
  box(5.3, 0.04, 0.05, mat.ledBlue, 0, 0.55, -9.8);
  shelf(-3.15, -9.78, 0, 1.2, 2.6); shelf(3.15, -9.78, 0, 1.2, 2.6);
  plant(-3.3, -5.7, 1.2); plant(3.3, -5.7, 1.2);
  { chair(-2.4, -6.9, 2.02); chair(2.4, -6.9, -2.02); } // visitor chairs facing desk (-z)
  // cabin lights
  { const sp = new THREE.SpotLight(0xffd7a8, 120, 12, 0.9, 0.6, 1.6); sp.position.set(0, 3.9, -6.2); sp.target.position.set(0, 1, -8.4); root.add(sp, sp.target); lights.boss = sp;
    if (cs) { sp.castShadow = true; sp.shadow.mapSize.set(quality.shadowMap >> 1, quality.shadowMap >> 1); sp.shadow.bias = -0.0005; }
    const pl2 = new THREE.PointLight(0x7fb8ff, 10, 9, 2); pl2.position.set(0, 3.2, -9.2); root.add(pl2); }
  world.pickBoss = proxy('boss', 'Click to interact', 4.2, 3.2, 3.2, 0, 1.6, -8.0, root, { cabin: true });

  /* ---- MANAGER OFFICE ----------------------------------------------------- */
  {
    const g = grp(8.7, 0, -8.05);
    box(1.9, 0.7, 0.95, mat.desk, 0, 0.35, 0, g, true, true); box(2.0, 0.05, 1.05, mat.deskTop, 0, 0.725, 0, g, true, true);
    laptop(g, -0.15, 0.75, -0.18, Math.PI, screenTex('chart', 5)); keyboard(g, 0.4, 0.75, -0.3, Math.PI); mug(g, -0.7, 0.75, -0.2, 0xe8eef7); deskLamp(g, 0.8, 0.75, -0.25, 0.1);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.19), new THREE.MeshBasicMaterial({ map: plateTex(config.people.sahil.name, '(' + config.people.sahil.role + ')'), transparent: true, toneMapped: false }));
    pl.position.set(0, 0.5, 0.53); g.add(pl);
  }
  const sahilSeat = seatedHuman({ id: 'sahil', skin: 0xb9825a, hair: 'side', hairColor: 0x0f0b09, style: 'suit', top: 0x1f2d4a, shirt: 0xeef1f6, bottom: 0x1b2438, tie: 0x5b8dd6, glasses: 'none', beard: 'stubble', watch: true, scale: 1.0 }, 8.7, -8.85, 0, true);
  world.sahil = sahilSeat.human; world.sahilSeat = sahilSeat; sahilSeat.human.typing = true;
  box(4.6, 1.6, 0.06, M(0xe9eef4, 0.5), 8.7, 2.2, -9.84);
  { const bt = canvasTex(512, 220, (g, w, h) => { g.fillStyle = '#f2f5f9'; g.fillRect(0, 0, w, h); g.fillStyle = '#10151f'; g.font = '800 70px "Plus Jakarta Sans", Arial, sans-serif'; g.textAlign = 'center'; g.fillText('Better Plans', w / 2, 96); g.fillStyle = '#2f7de0'; g.fillText('Bigger Goals', w / 2, 180); });
    plane(4.4, 1.5, new THREE.MeshBasicMaterial({ map: bt, color: 0xdde6f2, toneMapped: false }), 8.7, 2.2, -9.8);
    const mp2 = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.19), new THREE.MeshBasicMaterial({ map: plateTex('Manager Office', config.people.sahil.name + ' (' + config.people.sahil.role + ')'), transparent: true, toneMapped: false })); mp2.position.set(7.3, 3.4, -4.55); root.add(mp2); mp2.scale.set(2.2, 2.2, 1); mp2.rotation.y = 0; }
  shelf(10.4, -9.78, 0, 1.2, 2.4); plant(10.5, -5.3, 1.1); plant(6.7, -9.4, 0.9);
  chair(8.0, -6.4, Math.PI + 0.2); chair(9.4, -6.4, Math.PI - 0.2);
  { const l = new THREE.PointLight(0xffd9b0, 18, 9, 2); l.position.set(8.7, 3.4, -7.0); root.add(l); lights.manager = l; }
  world.pickManager = proxy('manager', 'Click to interact', 4.8, 3.2, 5.4, 8.6, 1.6, -7.3);

  /* ---- Bodyguards -------------------------------------------------------- */
  world.guards = [];
  for (const [i, gx] of [[0, -2.5], [1, 2.5]]) {
    const gd = new Human({ id: 'guard' + i, skin: i ? 0xa06b47 : 0xc08a62, hair: i ? 'bald' : 'short', hairColor: 0x0b0908, style: 'suit', build: 'broad', top: 0x0b0c10, shirt: 0xe4e7ec, bottom: 0x0b0c10, tie: 0x08090c, glasses: 'sun', earpiece: true, beard: i ? 'full' : 'stubble', guardPose: i ? 'sides' : 'clasp', scale: 1.05 });
    gd.setPosition(gx, 0, -4.1); gd.setYaw(Math.PI * 0.0 + (i ? -0.14 : 0.14)); gd.guard = true; gd.lookAt(new THREE.Vector3(0, 1.6, 8));
    world.humans.push(gd); world.guards.push(gd); root.add(gd.root);
  }
  world.pickGuards = proxy('guards', 'Security', 6.8, 2.2, 1.2, 0, 1.1, -4.1);

  /* ---- OPEN WORKSPACE ----------------------------------------------------- */
  const skins = [0xc8956b, 0x8d5a3a, 0xe0b08a, 0xa6704a, 0x6b4330, 0xd7a47c, 0xb67a52, 0x9a6440, 0xd4a07a];
  // each employee has their own outfit so the floor looks like a real, varied team
  const crew = [
    { hair: 'short', hairColor: 0x120c0a, style: 'shirt', shirt: 0x9ec1e8, bottom: 0x2a2f3a, tie: null, badge: true, glasses: 'clear' },
    { hair: 'long', hairColor: 0x1b110c, style: 'blazer', top: 0x6d2535, shirt: 0xf1ece4, bottom: 0x20232c, female: true, badge: true, watch: true },
    { hair: 'side', hairColor: 0x0d0b0b, style: 'polo', top: 0x20406e, bottom: 0x6a5c48, badge: true },
    { hair: 'bun', hairColor: 0x2a1a10, style: 'sweater', top: 0xd9ccb6, shirt: 0xf1ece4, bottom: 0x2b2e38, female: true, badge: true },
    { hair: 'short', hairColor: 0x0d0b0b, style: 'rolled', shirt: 0xf4f5f8, bottom: 0x1f2430, tie: 0x1f6f78, beard: 'stubble', watch: true, badge: true },
    { hair: 'short', hairColor: 0x2a1a10, style: 'vest', top: 0x2d313b, shirt: 0xe9ecf1, bottom: 0x2d313b, tie: 0x7a2a3a, badge: true },
    { hair: 'ponytail', hairColor: 0x120c0a, style: 'shirt', shirt: 0xb8a8d8, bottom: 0x1f2230, female: true, badge: true, glasses: 'clear' },
    { hair: 'short', hairColor: 0x0d0b0b, style: 'sweater', top: 0x56633f, shirt: 0xe9ecf1, bottom: 0x2a2d33, beard: 'full', badge: true },
    { hair: 'side', hairColor: 0x1a120d, style: 'suit', top: 0x5c616c, shirt: 0xf1f3f7, bottom: 0x2c303a, badge: true, watch: true },
  ];
  const screenKinds = ['code', 'chart', 'dash', 'code', 'light', 'chart'];
  const benchTextures = screenKinds.map((k, i) => screenTex(k, i + 20));
  const empSeats = [];
  function bench(cx, cz, len) {
    const g = grp(cx, 0, cz);
    box(1.5, 0.05, len, mat.deskTop, 0, 0.745, 0, g, true, true);
    for (const z of [-len / 2 + 0.2, len / 2 - 0.2]) { box(1.4, 0.72, 0.05, mat.desk, 0, 0.36, z, g, true); }
    box(0.05, 0.62, len - 0.3, mat.desk, 0, 0.4, 0, g);
    box(0.03, 0.04, len, mat.ledBlue, 0, 0.7, 0, g);
    box(0.02, 0.22, len - 0.2, new THREE.MeshStandardMaterial({ color: 0x8fb4d8, transparent: true, opacity: 0.25, roughness: 0.1 }), 0, 0.86, 0, g);
    return g;
  }
  const BENCH_LEN = 4.3, BENCH_Z = -0.85;
  const benches = [{ cx: -7.0 }, { cx: 7.0 }];
  let eIdx = 0;
  const seatZs = [-2.2, -0.95, 0.3];
  const plan = quality.employees; // number of employees to populate
  const slots = [
    // [bench index, side(+1 east / -1 west), z index]
    [0, 1, 2], [0, 1, 0], [0, -1, 0], [0, -1, 1], [0, -1, 2],
    [1, 1, 0], [1, 1, 1], [1, -1, 0], [1, -1, 2],
  ];
  const populated = new Set(slots.slice(0, plan).map((s) => s.join(',')));
  benches.forEach((b, bi) => {
    bench(b.cx, BENCH_Z, BENCH_LEN);
    for (const side of [1, -1]) seatZs.forEach((sz, zi) => {
      const z = BENCH_Z + sz + 0.85 - 0.0 + (-0.0);
      const sx = b.cx + side * (0.75 + 0.30);          // seat centre x
      const f = -side;                                 // desk direction (x sign)
      const yaw = f > 0 ? Math.PI / 2 : -Math.PI / 2;  // facing +x or -x
      // desk gear
      const ux = b.cx + side * 0.75;                   // desk edge x on this side
      const gear = grp(0, 0, 0);
      const kx = sx + f * 0.52; keyboard(gear, kx, 0.77, z, yaw);
      const monX = sx + f * 0.95;
      const tex = benchTextures[(bi * 3 + zi + (side > 0 ? 0 : 2)) % benchTextures.length];
      if ((zi + bi + (side > 0 ? 1 : 0)) % 3 === 0) laptop(gear, sx + f * 0.62, 0.77, z, yaw + Math.PI, tex);
      else monitor(gear, monX, 0.77, z, yaw + Math.PI, tex);
      deskItems(gear, sx + f * 0.4, 0.77, z + (zi === 1 ? -0.42 : 0.42), yaw + 0.5, bi * 3 + zi + (side > 0 ? 1 : 2));
      if ((bi + zi) % 2 === 0 && side < 0) headset(gear, sx + f * 0.3, 0.77, z - 0.45, yaw);
      if (zi !== 1) plant(sx + f * 1.08, z + 0.42, 0.4, gear, 0.77);
      if (zi === 1) mug(gear, sx + f * 0.55, 0.77, z - 0.38, [0xe8eef7, 0x1b1f28, 0x2f7de0][(bi + zi) % 3]);
      root.add(gear);
      const key = [bi, side, zi].join(',');
      if (populated.has(key)) {
        const k = eIdx++;
        const seat = seatedHuman(Object.assign({ id: 'emp' + k, skin: skins[k % skins.length], shoe: 0x17110e, scale: 0.96 + (k % 4) * 0.025 }, crew[k % crew.length]), sx, z, yaw);
        seat.human.typeRate = 6 + (k % 4) * 1.2; seat.human.lookAt(null);
        seat.side = side; seat.bench = bi; seat.zi = zi; empSeats.push(seat);
      } else chair(sx + f * -0.35, z, yaw);
    });
  });
  world.empSeats = empSeats;
  // pick the employee for route C: east side of left bench, row nearest reception (z index 2)
  world.routeEmployee = empSeats.find((s) => s.bench === 0 && s.side === 1 && s.zi === 2) || empSeats[0];
  world.pickEmployees = proxy('employees', 'Click to interact', 17.5, 2.0, 4.6, 0, 1.0, BENCH_Z + 0.85 - 0.0);
  // hanging sign: Employees (Open Workspace)
  { const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.53), new THREE.MeshBasicMaterial({ map: plateTex('Employees', '(Open Workspace)'), transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    sg.position.set(-3.7, 2.6, 2.4); root.add(sg); sg.rotation.y = 0; cyl(0.006, 0.006, 1.6, mat.metal, -4.4, 3.4, 2.4, root, 4); cyl(0.006, 0.006, 1.6, mat.metal, -3.0, 3.4, 2.4, root, 4); }
  // customer entry sign inside above door
  { const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#080a0f'; rr(g, 2, 2, w - 4, h - 4, 18); g.fill(); g.strokeStyle = 'rgba(90,170,255,.8)'; g.lineWidth = 3; rr(g, 2, 2, w - 4, h - 4, 18); g.stroke(); g.fillStyle = '#f2f6fb'; g.font = '700 54px "Plus Jakarta Sans", Arial, sans-serif'; g.textAlign = 'center'; g.fillText('Customer Entry', w / 2 + 22, 82); g.fillStyle = '#6db6ff'; g.fillRect(58, 40, 18, 18); g.beginPath(); g.arc(67, 78, 12, 0, TAU); g.fill(); }), transparent: true, toneMapped: false })); sg.position.set(0, DOOR_H + 0.55, 9.8); sg.rotation.y = Math.PI; root.add(sg); }

  /* ---- Side walls: dressing --------------------------------------------- */
  // left wall: big logo panel, cabinet w/ printer, water dispenser, windows, sofa lounge
  box(0.08, 3.0, 2.4, M(0x07090d, 0.5, 0.3), -10.9, 2.0, 6.4); plane(2.2, 2.2 * 640 / 1024, signMat, -10.85, 2.1, 6.4, Math.PI / 2);
  { const tx = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#7fc2ff'; g.font = '700 30px "Plus Jakarta Sans", Arial'; g.fillText('Ideas', 20, 120); g.fillText('Products', 20, 160); g.fillText('Impact', 20, 200); });
    plane(1.0, 1.0, new THREE.MeshBasicMaterial({ map: tx, transparent: true, toneMapped: false }), -10.84, 1.1, 6.4, Math.PI / 2); }
  PR.printer(-10.4, 7.2, Math.PI / 2); box(0.5, 0.8, 1.3, mat.desk, -10.6, 0.4, 8.6); box(0.52, 0.04, 1.32, mat.deskTop, -10.6, 0.82, 8.6);
  deskItems(root, -10.6, 0.84, 8.2, 1.2, 2); deskItems(root, -10.6, 0.84, 8.9, 0.4, 0); plant(-10.6, 9.05, 0.4, root, 0.84, 'succulent'); PR.bin(-10.5, 6.2);
  PR.waterCooler(-10.5, 4.2, Math.PI / 2); PR.wallClock(-10.86, 2.9, 1.0, Math.PI / 2);
  for (let i = 0; i < 4; i++) { box(0.06, 2.0, 1.1, M(0x040608, 0.4), -10.88, 2.0, -3.6 + i * 1.3); const wt = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0c1830'); gr.addColorStop(1, '#2b5a96'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); plane(1.0, 1.9, new THREE.MeshBasicMaterial({ map: wt, toneMapped: false, color: 0x9ab4d6 }), -10.83, 2.0, -3.6 + i * 1.3, Math.PI / 2); }
  sofa(-9.6, -6.8, Math.PI / 2, 2.4, 0x23262d); coffeeTable(-8.5, -6.8, 0.6, 1.1); frame(mountainArt, 1.6, 1.0, -10.86, 1.85, -6.8, Math.PI / 2); plant(-10.3, -9.0, 1.3); plant(-10.3, -4.4, 1.0);
  // right wall: neon words, printer shelves, lounge
  { const tx = canvasTex(256, 512, (g, w, h) => { g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2 * 0); g.fillStyle = '#e8f1ff'; g.shadowColor = '#4da6ff'; g.shadowBlur = 18; g.font = '800 64px "Plus Jakarta Sans", Arial'; g.textAlign = 'center'; g.fillText('Build', 0, -110); g.fillText('Innovate', 0, -10); g.fillText('Grow', 0, 90); g.restore(); });
    box(0.08, 3.0, 2.2, M(0x07090d, 0.5, 0.3), 10.9, 2.0, 5.2); plane(2.0, 2.6, new THREE.MeshBasicMaterial({ map: tx, transparent: true, toneMapped: false }), 10.85, 2.0, 5.2, -Math.PI / 2); }
  PR.printer(10.4, 0.45, -Math.PI / 2); PR.printer(10.4, 1.55, -Math.PI / 2); PR.bin(10.5, 2.3); PR.wallClock(10.86, 2.9, -1.5, -Math.PI / 2); plant(10.5, 2.9, 0.9);
  sofa(9.9, 7.6, -Math.PI / 2, 2.6, 0x0f1115); coffeeTable(8.7, 7.4, 0.7, 1.2); rug(8.9, 7.5, 3.2, 3.0, 0x1b1d23);
  plant(-9.5, 8.7, 1.3); plant(9.5, 9.2, 1.2); plant(-1.7, 9.35, 1.1); plant(1.7, 9.35, 1.1); plant(-4.6, 4.2, 0.9);
  // exterior pots by the door
  plant(-2.1, 11.0, 1.4); plant(2.1, 11.0, 1.4);

  /* ---- Lighting ---------------------------------------------------------- */
  root.add(new THREE.HemisphereLight(0x5f7fb0, 0x2a2018, 0.7));
  const key = new THREE.DirectionalLight(0xdfe8ff, 0.9); key.position.set(4, 14, 6); key.target.position.set(0, 0, 0);
  if (cs) { key.castShadow = true; key.shadow.mapSize.set(quality.shadowMap, quality.shadowMap); const sc = key.shadow.camera; sc.left = -13; sc.right = 13; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 40; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; }
  root.add(key, key.target); lights.key = key;
  const warm = (x, y, z, i, d) => { const l = new THREE.PointLight(0xffc890, i, d, 2); l.position.set(x, y, z); root.add(l); return l; };
  lights.rec = warm(RX, 2.8, 5.6, 22, 9); lights.l1 = warm(-7, 3.2, -0.8, 30, 11); lights.r1 = warm(7, 3.2, -0.8, 30, 11);
  lights.mid = warm(0, 3.5, 2, 16, 12);
  lights.entry = new THREE.PointLight(0x7ab8ff, 14, 9, 2); lights.entry.position.set(0, 3.4, 8.4); root.add(lights.entry);
  lights.lounge = warm(9.3, 2.2, 7.4, 10, 6);

  // dim / bright control for the transition to the showcase
  world.setDim = (u) => {
    const k = 1 - 0.78 * u;
    for (const l of Object.values(lights)) { if (l.userData.base === undefined) l.userData.base = l.intensity; l.intensity = l.userData.base * k; }
  };

  /* ---- Ambient behaviour ------------------------------------------------- */
  const ambient = empSeats.map((s, i) => ({ s, next: 3 + Math.random() * 7 + i, until: 0 }));
  world.ambientEnabled = true;
  updaters.push((dt, t) => {
    benchTextures.forEach((tx, i) => { if (i % 2 === 0) { tx.offset.y = (tx.offset.y + dt * 0.01) % 1; tx.wrapT = THREE.RepeatWrapping; } });
    if (!world.ambientEnabled) return;
    for (const a of ambient) {
      const h = a.s.human; if (h.sitProg < 0.99 || h.sitDir !== 0) continue;
      if (t > a.next && !h.g && !h.talking) {
        const other = empSeats[Math.floor(Math.random() * empSeats.length)].human;
        if (other !== h) { h.typing = false; h.lookAt(new THREE.Vector3(other.root.position.x, 1.25, other.root.position.z)); h.talking = true; a.until = t + 2.5 + Math.random() * 2; }
        a.next = t + 8 + Math.random() * 12;
      }
      if (h.talking && t > a.until) { h.talking = false; h.typing = true; h.lookAt(null); }
    }
  });

  world.update = (dt, t) => {
    for (const h of world.humans) h.update(dt, t);
    for (const u of updaters) u(dt, t);
  };
  world.dispose = () => {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      ms.forEach((m) => { for (const k of ['map', 'alphaMap']) if (m[k]) m[k].dispose(); m.dispose(); });
      if (o.shadow && o.shadow.map) o.shadow.map.dispose();
    });
    logoImgTex.dispose(); disposePlantShared();
  };
  world.anchors = {
    street: new THREE.Vector3(0, 1.7, 19), doorFront: new THREE.Vector3(0, 1.65, 13.2),
    entryA: new THREE.Vector3(0, 1.65, 9.2), visitor: new THREE.Vector3(-2.2, 1.62, 6.9), receptionLook: new THREE.Vector3(RX, 1.35, 3.85),
    bossFront: new THREE.Vector3(0, 1.6, -3.2), bossInside: new THREE.Vector3(0, 1.58, -6.05), bossLook: new THREE.Vector3(0, 1.0, -8.8),
    reception: { x: RX, z: RZ },
  };
  return world;
}
