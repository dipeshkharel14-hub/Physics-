/* ==========================================================================
   Hsepid.np — 3D project showcase ("floating glass displays" carousel)
   --------------------------------------------------------------------------
   Cover-flow ring of glass cards over a dark starfield with light trails.
   Cards are generated from the project list (title, description, link host);
   the real link is opened from the HTML detail panel, never from 3D text.
   ========================================================================== */
import * as THREE from 'three';
import { canvasTex } from './hsx-world.js?v=5';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const damp = (c, t, dt, r) => c + (t - c) * (1 - Math.exp(-r * dt));
const FONT = '"Plus Jakarta Sans", "Segoe UI", system-ui, Arial, sans-serif';

function wrap(g, text, x, y, maxW, lineH, maxLines) {
  const words = String(text).split(/\s+/); let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (g.measureText(test).width > maxW && line) {
      n++; if (n >= maxLines) { let l = line; while (g.measureText(l + '…').width > maxW && l.length) l = l.slice(0, -1); g.fillText(l + '…', x, y); return; }
      g.fillText(line, x, y); y += lineH; line = words[i];
    } else line = test;
  }
  g.fillText(line, x, y);
}
function host(u) { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return ''; } }

function drawCard(g, w, h, p, i, n, img) {
  g.clearRect(0, 0, w, h);
  const r = 34;
  const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, 'rgba(20,34,58,.88)'); bg.addColorStop(1, 'rgba(6,10,20,.92)');
  g.fillStyle = bg; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, r); g.fill();
  const shine = g.createLinearGradient(0, 0, 0, h * 0.5); shine.addColorStop(0, 'rgba(160,210,255,.16)'); shine.addColorStop(1, 'rgba(160,210,255,0)');
  g.fillStyle = shine; g.beginPath(); g.roundRect(6, 6, w - 12, h * 0.5, [r, r, 0, 0]); g.fill();
  g.strokeStyle = 'rgba(110,184,255,.75)'; g.lineWidth = 3; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, r); g.stroke();
  // number + status
  g.fillStyle = '#7fc2ff'; g.font = `700 26px ${FONT}`; g.textAlign = 'left'; g.fillText(String(i + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0'), 44, 64);
  g.textAlign = 'right'; g.fillStyle = p.url ? '#9be08a' : '#f0c674'; g.fillText(p.url ? 'LIVE ↗' : 'SOON', w - 44, 64);
  // avatar / image
  const ax = 44, ay = 100, as = 130;
  if (img) { g.save(); g.beginPath(); g.roundRect(ax, ay, as, as, 26); g.clip(); const s = Math.max(as / img.width, as / img.height); g.drawImage(img, ax + (as - img.width * s) / 2, ay + (as - img.height * s) / 2, img.width * s, img.height * s); g.restore(); g.strokeStyle = 'rgba(120,190,255,.6)'; g.lineWidth = 2; g.beginPath(); g.roundRect(ax, ay, as, as, 26); g.stroke(); }
  else {
    let sum = 0; for (const ch of p.name) sum += ch.charCodeAt(0);
    const hue = 196 + (sum % 40);
    const ag = g.createLinearGradient(ax, ay, ax + as, ay + as); ag.addColorStop(0, `hsl(${hue},85%,56%)`); ag.addColorStop(1, `hsl(${hue + 22},80%,32%)`);
    g.fillStyle = ag; g.beginPath(); g.roundRect(ax, ay, as, as, 26); g.fill();
    g.fillStyle = 'rgba(255,255,255,.95)'; g.font = `800 72px ${FONT}`; g.textAlign = 'center'; g.fillText((p.name.replace(/[^\p{L}\p{N}]/gu, '').charAt(0) || '·').toUpperCase(), ax + as / 2, ay + as / 2 + 26);
  }
  // title + description
  g.textAlign = 'left'; g.fillStyle = '#f4f8ff'; g.font = `800 46px ${FONT}`;
  wrap(g, p.name, 200, 142, w - 244, 52, 2);
  g.fillStyle = '#b6c6dc'; g.font = `500 28px ${FONT}`;
  wrap(g, p.use || '', 44, 292, w - 88, 38, 3);
  g.fillStyle = 'rgba(140,170,210,.9)'; g.font = `600 22px ${FONT}`; g.textAlign = 'left';
  g.fillText(p.url ? host(p.url) : 'New project in progress', 44, h - 38);
  g.textAlign = 'right'; g.fillStyle = '#7fc2ff'; g.fillText(p.url ? 'CLICK TO OPEN' : '', w - 44, h - 38);
}

export class Showcase {
  constructor({ projects, quality }) {
    this.projects = projects.length ? projects : [{ name: 'Add your projects', use: 'Edit hsx-config.js → fallbackProjects, or define window.projectData on your page.', url: '', img: '' }];
    this.n = this.projects.length;
    this.quality = quality;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x02040a); this.scene.fog = new THREE.FogExp2(0x02040a, 0.035);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200); this.camera.position.set(0, 0.25, 5.8); this.camera.lookAt(0, 0.05, 0);
    this.R = Math.max(6.5, (this.n * 3.0) / TAU);
    this.step = TAU / this.n; this.rot = 0; this.targetRot = 0; this.index = 0; this.hover = -1; this.onChange = null; this.t = 0;
    this.ray = new THREE.Raycaster(); this.cards = []; this.images = [];
    this._build();
  }

  _build() {
    const S = this.scene, R = this.R, n = this.n;
    const geo = new THREE.PlaneGeometry(2.7, 1.69);
    const glowGeo = new THREE.PlaneGeometry(3.0, 1.98);
    const glowTex = canvasTex(128, 80, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(77,166,255,.55)'); gr.addColorStop(1, 'rgba(77,166,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    this.projects.forEach((p, i) => {
      const cv = document.createElement('canvas'); cv.width = 768; cv.height = 480; const g = cv.getContext('2d');
      if (!g.roundRect) g.roundRect = function (x, y, w, h, r) { const rr = Array.isArray(r) ? r[0] : r; this.moveTo(x + rr, y); this.arcTo(x + w, y, x + w, y + h, rr); this.arcTo(x + w, y + h, x, y + h, rr); this.arcTo(x, y + h, x, y, rr); this.arcTo(x, y, x + w, y, rr); this.closePath(); };
      drawCard(g, 768, 480, p, i, n, null);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
      const card = new THREE.Mesh(geo, mat);
      const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 }));
      glow.position.z = -0.03;
      const grp = new THREE.Group(); grp.add(glow, card); S.add(grp);
      card.userData.idx = i;
      this.cards.push({ grp, card, glow, mat, cv, g, tex, p, i });
      if (p.img) { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { drawCard(g, 768, 480, p, i, n, im); tex.needsUpdate = true; }; im.src = p.img; this.images.push(im); }
    });
    // rails (thin glowing rings), floor glow, particles, light trails
    const railMat = new THREE.MeshBasicMaterial({ color: 0x4da6ff, transparent: true, opacity: 0.55, toneMapped: false });
    for (const y of [-1.35, 1.55]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.012, 6, 220), railMat); ring.rotation.x = Math.PI / 2; ring.position.set(0, y, -R); S.add(ring); }
    const floorTex = canvasTex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(60,130,230,.45)'); gr.addColorStop(1, 'rgba(60,130,230,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.4, R * 2.4), new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, -1.38, -R); S.add(floor);
    const N = this.quality.particles, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 46; pos[i * 3 + 1] = (Math.random() - 0.5) * 16; pos[i * 3 + 2] = -Math.random() * 34 + 6; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x9ccaff, size: 0.06, transparent: true, opacity: 0.75, depthWrite: false, sizeAttenuation: true })); S.add(this.points);
    this.trails = [];
    const trailTex = canvasTex(256, 8, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(77,166,255,0)'); gr.addColorStop(0.7, 'rgba(140,205,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    for (let i = 0; i < this.quality.trails; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 + Math.random() * 3, 0.014), new THREE.MeshBasicMaterial({ map: trailTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
      m.position.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 7, -4 - Math.random() * 18); m.userData.v = 1.2 + Math.random() * 2.2; S.add(m); this.trails.push(m);
    }
  }

  resize(w, h) {
    const a = w / h; this.camera.aspect = a;
    this.camera.fov = a < 0.75 ? 72 : a < 1 ? 62 : a < 1.4 ? 56 : 50;
    this.camera.position.z = a < 0.75 ? 6.4 : 5.8; this.camera.updateProjectionMatrix();
  }
  select(i) { i = ((i % this.n) + this.n) % this.n; const cur = Math.round(-this.targetRot / this.step); let d = i - (((cur % this.n) + this.n) % this.n); if (d > this.n / 2) d -= this.n; if (d < -this.n / 2) d += this.n; this.targetRot = -(cur + d) * this.step; this._setIndex(i); }
  next() { this.select(this.index + 1); } prev() { this.select(this.index - 1); }
  drag(dx) { this.targetRot += dx * 0.0042; this.rot = this.targetRot; this._setIndex(this._nearest()); }
  snap() { this.select(this._nearest()); }
  _nearest() { return (((Math.round(-this.targetRot / this.step)) % this.n) + this.n) % this.n; }
  _setIndex(i) { if (i !== this.index) { this.index = i; if (this.onChange) this.onChange(i); } }

  /** returns card index under NDC point, or -1 */
  pick(nx, ny) {
    this.ray.setFromCamera({ x: nx, y: ny }, this.camera);
    const hits = this.ray.intersectObjects(this.cards.filter((c) => c.grp.visible && c.mat.opacity > 0.3).map((c) => c.card), false);
    return hits.length ? hits[0].object.userData.idx : -1;
  }

  update(dt, t) {
    this.t = t; this.rot = damp(this.rot, this.targetRot, dt, 5.5);
    const R = this.R;
    for (const c of this.cards) {
      let th = c.i * this.step + this.rot; th = ((th + Math.PI) % TAU + TAU) % TAU - Math.PI;
      const a = Math.abs(th), sel = c.i === this.index;
      const vis = clamp(1 - (a - 0.95) / 0.55, 0, 1);
      c.grp.visible = vis > 0.01; c.mat.opacity = vis;
      const lift = sel ? 0.18 : 0, hov = c.i === this.hover ? 0.08 : 0;
      const sc = 1 + (sel ? 0.16 : 0) + hov;
      c.grp.scale.setScalar(damp(c.grp.scale.x || 1, sc, dt, 8));
      c.grp.position.set(R * Math.sin(th), Math.sin(t * 0.7 + c.i) * 0.05 + lift * 0.4, -R + R * Math.cos(th) + (sel ? 0.5 : 0));
      c.grp.rotation.y = th * 0.92;
      c.glow.material.opacity = vis * (sel ? 0.85 : c.i === this.hover ? 0.6 : 0.28);
    }
    const p = this.points.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * 0.08; if (y > 8) y = -8; p.setY(i, y); }
    p.needsUpdate = true;
    for (const m of this.trails) { m.position.x += dt * m.userData.v; if (m.position.x > 18) m.position.x = -18; }
    this.camera.position.x = Math.sin(t * 0.25) * 0.12; this.camera.lookAt(0, 0.05, 0);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    this.images.length = 0;
  }
}
