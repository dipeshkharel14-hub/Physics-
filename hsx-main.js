/* ==========================================================================
   Hsepid.np — Interactive 3D Office Intro · orchestrator
   --------------------------------------------------------------------------
   • Finite-state machine for the customer journey (see ALLOWED below)
   • Guided cinematic camera + optional mouse/touch look-around
   • Raycast hover / click on interactive objects
   • Four independent routes: Boss · Manager · Employee · Explore directly
   • Hands over to a 3D project showcase that reads your real `projectData`
   Public API:  window.HsepidOfficeIntro.{start, restart, skip, destroy, state}
   ========================================================================== */
import * as THREE from 'three';
import { HSX_CONFIG } from './hsx-config.js';
import { buildWorld, makeLogoCanvas } from './hsx-world.js';
import { disposeHumanShared } from './hsx-human.js';
import { Showcase } from './hsx-showcase.js';
import { UI } from './hsx-ui.js';

/* ---------- helpers -------------------------------------------------------- */
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const damp = (c, t, dt, r) => c + (t - c) * (1 - Math.exp(-r * dt));
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LS_KEY = 'hsx-intro-v1';

function deepMerge(a, b) {
  if (!b) return a;
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') deepMerge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}
const CFG = deepMerge(JSON.parse(JSON.stringify(HSX_CONFIG)), window.HSX_CONFIG_OVERRIDE);

export const ALLOWED = {
  INTRO: ['ENTERING_OFFICE'],
  ENTERING_OFFICE: ['RECEPTION'],
  RECEPTION: ['CHOOSING_DESTINATION'],
  CHOOSING_DESTINATION: ['ESCORTING_TO_BOSS', 'CALLING_MANAGER', 'CALLING_EMPLOYEE', 'DIRECT_EXPLORATION'],
  ESCORTING_TO_BOSS: ['BOSS_DIALOGUE'],
  CALLING_MANAGER: ['ESCORTING_TO_MANAGER_DESTINATION'],
  ESCORTING_TO_MANAGER_DESTINATION: ['BOSS_DIALOGUE'],
  CALLING_EMPLOYEE: ['EMPLOYEE_DIALOGUE'],
  EMPLOYEE_DIALOGUE: ['WELCOME_SEQUENCE'],
  BOSS_DIALOGUE: ['WELCOME_SEQUENCE'],
  DIRECT_EXPLORATION: ['WELCOME_SEQUENCE'],
  WELCOME_SEQUENCE: ['PROJECT_COLLECTION'],
  PROJECT_COLLECTION: ['PROJECT_DETAIL'],
  PROJECT_DETAIL: ['PROJECT_COLLECTION'],
};

/* ---------- projects: reuse the site's real data ---------------------------- */
export function getProjects() {
  let src = window[CFG.projectsGlobal];
  if (!Array.isArray(src) || !src.length) src = CFG.fallbackProjects || [];
  const real = src.filter((p) => p && p.url).map((p) => ({ name: String(p.name || 'Untitled'), use: String(p.use || p.desc || ''), url: String(p.url), img: p.img ? String(p.img) : '' }));
  const soon = src.some((p) => p && !p.url);
  if (soon) real.push({ name: 'Coming Soon', use: 'New projects in progress', url: '', img: '' });
  return real;
}

/* ---------- procedural sound (off until the visitor enables it) ------------- */
class Sound {
  constructor(cfg) { this.cfg = cfg; this.on = false; this.ctx = null; this.nodes = []; this.audioEl = null; }
  ensure() { if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) this.ctx = new C(); } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
  toggle() { this.on = !this.on; if (this.on) this._startAmbient(); else this._stopAmbient(); return this.on; }
  _startAmbient() {
    if (this.cfg.audio.ambientUrl) { this.audioEl = new Audio(this.cfg.audio.ambientUrl); this.audioEl.loop = true; this.audioEl.volume = 0.35; this.audioEl.play().catch(() => {}); return; }
    const c = this.ensure(); if (!c) return;
    const len = c.sampleRate * 3, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; const g = c.createGain(); g.gain.value = 0.0; g.gain.linearRampToValueAtTime(0.06, c.currentTime + 2);
    const hum = c.createOscillator(); hum.frequency.value = 58; const hg = c.createGain(); hg.gain.value = 0.006;
    src.connect(lp); lp.connect(g); g.connect(c.destination); hum.connect(hg); hg.connect(c.destination); src.start(); hum.start();
    this.nodes = [src, hum, g, hg];
  }
  _stopAmbient() { if (this.audioEl) { this.audioEl.pause(); this.audioEl = null; } this.nodes.forEach((n) => { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} }); this.nodes = []; }
  ping() {
    if (!this.on) return; if (this.cfg.audio.notifyUrl) { const a = new Audio(this.cfg.audio.notifyUrl); a.volume = 0.5; a.play().catch(() => {}); return; }
    const c = this.ensure(); if (!c) return; const t = c.currentTime;
    [[880, 0], [1318, 0.14]].forEach(([f, o]) => { const os = c.createOscillator(), g = c.createGain(); os.type = 'sine'; os.frequency.value = f; g.gain.setValueAtTime(0, t + o); g.gain.linearRampToValueAtTime(0.12, t + o + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + o + 0.5); os.connect(g); g.connect(c.destination); os.start(t + o); os.stop(t + o + 0.55); });
  }
  door() {
    if (!this.on) return; const c = this.ensure(); if (!c) return; const t = c.currentTime;
    const len = c.sampleRate * 0.9, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = buf; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(1400, t + 0.8);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.15); g.gain.linearRampToValueAtTime(0, t + 0.85); s.connect(bp); bp.connect(g); g.connect(c.destination); s.start(t);
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); if (this.audioEl) this.audioEl.pause(); }
  resume() { if (this.on) { if (this.ctx) this.ctx.resume(); if (this.audioEl) this.audioEl.play().catch(() => {}); } }
  destroy() { this._stopAmbient(); if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; } }
}

/* ---------- camera rig --------------------------------------------------------- */
class CamRig {
  constructor(camera, exp) {
    this.camera = camera; this.exp = exp; this.pos = V3(0, 1.7, 19); this.look = V3(0, 3, 10);
    this.yaw = 0; this.pitch = 0; this.yawT = 0; this.pitchT = 0; this.freeLook = false;
    this.follow = null; this.track = null; this._tmp = V3(); this._d = V3();
  }
  set(pos, look) { this.pos.copy(pos); this.look.copy(look); this.follow = null; this.track = null; }
  startFollow(h, o = {}) { this.follow = Object.assign({ h, dist: 2.6, height: 1.68, lookY: 1.3, rate: 2.4 }, o); this.track = null; }
  startTrack(h, o = {}) { this.track = Object.assign({ h, lookY: 1.3, rate: 3.2 }, o); this.follow = null; }
  release() { this.follow = null; this.track = null; }
  /** Fly along Catmull-Rom curves for position and look-at target. */
  fly(posPts, lookPts, dur, ease = easeSine) {
    this.release();
    const cp = new THREE.CatmullRomCurve3(posPts.map((p) => p.clone()), false, 'centripetal');
    const cl = new THREE.CatmullRomCurve3(lookPts.map((p) => p.clone()), false, 'centripetal');
    return this.exp.tween(dur, (u) => { const e = ease(u); cp.getPoint(e, this.pos); cl.getPoint(e, this.look); });
  }
  update(dt, t) {
    const f = this.follow, tr = this.track;
    if (f) {
      const h = f.h, fw = h.fwd(this._tmp);
      this._d.set(h.root.position.x - fw.x * f.dist, f.height, h.root.position.z - fw.z * f.dist);
      this.pos.x = damp(this.pos.x, this._d.x, dt, f.rate); this.pos.y = damp(this.pos.y, this._d.y, dt, f.rate); this.pos.z = damp(this.pos.z, this._d.z, dt, f.rate);
      const p = h.root.position;
      this.look.x = damp(this.look.x, p.x, dt, 4.5); this.look.y = damp(this.look.y, f.lookY, dt, 4.5); this.look.z = damp(this.look.z, p.z, dt, 4.5);
    } else if (tr) {
      const p = tr.h.root.position;
      this.look.x = damp(this.look.x, p.x, dt, tr.rate); this.look.y = damp(this.look.y, tr.lookY, dt, tr.rate); this.look.z = damp(this.look.z, p.z, dt, tr.rate);
    }
    this.pos.x = clamp(this.pos.x, -10.5, 10.5); this.pos.z = clamp(this.pos.z, -9.5, 30);
    if (!this.freeLook) { this.yawT = 0; this.pitchT = 0; }
    this.yaw = damp(this.yaw, this.yawT, dt, 5); this.pitch = damp(this.pitch, this.pitchT, dt, 5);
    const sway = this.exp.reduced ? 0 : 1;
    const dir = this._d.copy(this.look).sub(this.pos);
    const len = dir.length(); dir.normalize();
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw); const dx = dir.x * cy + dir.z * sy, dz = -dir.x * sy + dir.z * cy; dir.x = dx; dir.z = dz;
    dir.y += Math.tan(this.pitch) * Math.hypot(dir.x, dir.z); dir.normalize();
    this.camera.position.set(this.pos.x + Math.sin(t * 0.6) * 0.006 * sway, this.pos.y + Math.sin(t * 0.9) * 0.008 * sway, this.pos.z);
    this.camera.lookAt(this.camera.position.x + dir.x * len, this.camera.position.y + dir.y * len, this.camera.position.z + dir.z * len);
  }
}

/* ============================================================================
   Experience — one running instance of the intro
   ========================================================================== */
class Experience {
  constructor(root, { onExit }) {
    this.root = root; this.onExit = onExit; this.state = null; this.route = null;
    this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || Math.min(innerWidth, innerHeight) < 600;
    this.mobile = mobile;
    this.quality = { shadows: !mobile, characterShadows: !mobile, shadowMap: mobile ? 1024 : 2048, employees: mobile ? 5 : 9, particles: mobile ? 250 : 700, trails: mobile ? 6 : 16, pixelRatio: Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5) };
    this.tweens = []; this.watchers = []; this.running = false; this.alive = true; this.epoch = 0;
    this.pickIds = new Set(); this.hover = null; this.ptr = { x: 0, y: 0, in: false, down: false, sx: 0, sy: 0, t: 0, moved: 0 };
    this.waiters = {}; this.activeScene = 'office'; this.tScale = this.reduced ? 0.4 : 1; this.fpsAcc = 0; this.fpsN = 0; this.lowFps = 0;
    this.sound = new Sound(CFG); this.projects = getProjects(); this.glbHumans = [];
  }

  /* ---- tween engine (driven by the render loop so it pauses with the tab) -- */
  tween(dur, fn, ease = (u) => u) { return new Promise((res) => { this.tweens.push({ t: 0, dur: Math.max(0.0001, dur), fn, res, ease }); }); }
  wait(sec) { return this.tween(sec * this.tScale, () => {}); }
  watch(cond, fn) { this.watchers.push({ cond, fn }); }
  setState(s) {
    if (this.state && !(ALLOWED[this.state] || []).includes(s)) console.warn('[hsx] unexpected transition', this.state, '→', s);
    this.state = s; this.root.dataset.state = s; this.root.dispatchEvent(new CustomEvent('hsx:state', { detail: s }));
  }
  setPicks(ids) { this.pickIds = new Set(ids); this.hover = null; this.ui.hint(null); this.outline.visible = false; }

  /* ------------------------------------------------------------------------ *
   *  INIT
   * ------------------------------------------------------------------------ */
  async init() {
    const logoImg = await this._loadLogoImage();
    this.logoCanvas = makeLogoCanvas(logoImg, { brand: CFG.brand });
    const logoSrc = this.logoCanvas.toDataURL('image/png');
    this.ui = new UI(this.root, CFG, { logoSrc, reduced: this.reduced, onSkip: () => this.onExit({ remember: true, reason: 'skip' }), onRestart: () => { if (!this._restarting) { this._restarting = true; this.restart().finally(() => { this._restarting = false; }); } }, onSoundToggle: () => this.sound.toggle(), soundOn: false });
    this.ui.setFadeInstant(true);
    this.ui.setLoader(0.08, 'Starting renderer…');
    await sleep(30);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.ui.canvas, antialias: !this.mobile, powerPreference: 'high-performance', alpha: false });
      if (!this.renderer.getContext()) throw new Error('no WebGL context');
    } catch (e) { console.warn('[hsx] WebGL unavailable', e); this.ui.showFallback(this.projects, 'WebGL unavailable', () => this.onExit({ remember: true, reason: 'fallback' })); this.failed = true; return false; }
    const r = this.renderer; r.setPixelRatio(this.quality.pixelRatio); r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = this.quality.shadows; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.running = false; this.ui.showFallback(this.projects, 'graphics context lost', () => this.onExit({ remember: true, reason: 'contextlost' })); });
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x04060a); this.scene.fog = new THREE.FogExp2(0x04060a, 0.018);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 160);
    this.rig = new CamRig(this.camera, this);
    this.ray = new THREE.Raycaster();
    this.outline = new THREE.Box3Helper(new THREE.Box3(), 0x4da6ff); this.outline.material.depthTest = false; this.outline.material.transparent = true; this.outline.material.opacity = 0.85; this.outline.renderOrder = 999; this.outline.visible = false; this.scene.add(this.outline);

    this.ui.setLoader(0.22, 'Lighting the office…');
    try { const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'); const pm = new THREE.PMREMGenerator(r); this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environment = this.envMap; this.scene.environmentIntensity = 0.35; pm.dispose(); }
    catch (e) { console.warn('[hsx] environment map unavailable (reflections reduced)', e); }
    await this.buildOffice();
    this.ui.setLoader(0.8, 'Welcoming the team…');
    await this.loadGLBModels();
    this.ui.setLoader(0.94, 'Preparing graphics…'); await sleep(20);
    this.resize(true);
    try { this.renderer.compile(this.scene, this.camera); this.renderer.render(this.scene, this.camera); } catch (e) { console.warn('[hsx] precompile skipped', e); }
    this.ui.setLoader(1, 'Ready');

    this._bind();
    this.resize();
    return true;
  }

  async _loadLogoImage() {
    if (!CFG.logoUrl) return null;
    return new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => { console.warn('[hsx] logoUrl failed to load, using built-in logo'); res(null); }; im.src = CFG.logoUrl; });
  }

  async buildOffice() {
    this.ui.setLoader(0.45, 'Building the office…'); await sleep(20);
    this.world = buildWorld({ config: CFG, quality: this.quality, logoCanvas: this.logoCanvas, envMap: this.envMap, tween: (d, f) => this.tween(d, f, easeIO) });
    this.scene.add(this.world.root);
  }

  /* ---- optional GLB humans: male / female pools, auto-fitted (see hsx-glb.js) ---- */
  async loadGLBModels() {
    const M = CFG.models || {}, flat = [];
    if (this.mobile && CFG.modelsOnMobile === false) return;
    Object.values(M).forEach((v) => (Array.isArray(v) ? v : [v]).forEach((u) => u && flat.push(u)));
    if (!flat.length) return;
    let GLTFLoader, SkeletonUtils, G;
    try { ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')); SkeletonUtils = await import('three/addons/utils/SkeletonUtils.js'); G = await import('./hsx-glb.js'); }
    catch (e) { console.warn('[hsx] GLB support unavailable — using procedural humans', e); return; }
    this._glbMod = G;
    const loader = new GLTFLoader(), cache = new Map(), w = this.world;
    const people = [w.muskan, w.boss, w.sahil, ...w.guards, ...w.empSeats.map((s) => s.human)].filter(Boolean);
    const load = (u) => { if (!cache.has(u)) cache.set(u, new Promise((res) => loader.load(new URL(u, import.meta.url).href, res, undefined, (err) => { console.warn('[hsx] model failed', u, err); res(null); }))); return cache.get(u); };
    let idx = { m: 0, f: 0 }, done = 0;
    for (const h of people) {
      const u = G.pickSource(M, h, h.opts.female ? idx.f++ : idx.m++);
      if (u) { const gltf = await load(u); if (gltf) { try { G.fitGLB(h, gltf, SkeletonUtils, { tintClothes: CFG.modelsTint !== false, faceAxis: CFG.modelsFaceAxis, hideHairCards: CFG.modelsHideHairCards !== false }); this.glbHumans.push(h); } catch (e) { console.warn('[hsx] fit failed', e); } } }
      this.ui.setLoader(0.8 + 0.2 * (++done / people.length), 'Loading characters…');
    }
  }
  _updateGLB(dt) { const G = this._glbMod; if (G) for (const h of this.glbHumans) G.updateGLB(h, dt); }

  /* ---- events -------------------------------------------------------------- */
  _bind() {
    const cv = this.ui.canvas, p = this.ptr;
    this._on = (t, type, fn, o) => { t.addEventListener(type, fn, o); (this._offs = this._offs || []).push(() => t.removeEventListener(type, fn, o)); };
    const upd = (e) => { const r = cv.getBoundingClientRect(); p.x = e.clientX - r.left; p.y = e.clientY - r.top; p.in = true; };
    this._on(cv, 'pointermove', (e) => {
      upd(e);
      if (p.down) {
        const dx = e.clientX - p.lx, dy = e.clientY - p.ly; p.lx = e.clientX; p.ly = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
        if (this.activeScene === 'showcase' && !this.ui.detailOpen) { this.showcase.drag(dx); cv.classList.add('hsx-grabbing'); }
        else if (this.rig.freeLook) { this.rig.yawT = clamp(this.rig.yawT + dx * 0.004, -1.0, 1.0); this.rig.pitchT = clamp(this.rig.pitchT + dy * 0.003, -0.4, 0.4); }
      }
    });
    this._on(cv, 'pointerdown', (e) => { upd(e); p.down = true; p.moved = 0; p.sx = p.lx = e.clientX; p.sy = p.ly = e.clientY; p.t = performance.now(); try { cv.setPointerCapture(e.pointerId); } catch (er) {} });
    this._on(cv, 'pointerup', (e) => {
      upd(e); const wasDown = p.down; p.down = false; cv.classList.remove('hsx-grabbing');
      try { cv.releasePointerCapture(e.pointerId); } catch (er) {}
      if (!wasDown) return;
      if (this.activeScene === 'showcase') this.showcase.snap();
      if (p.moved < 8 && performance.now() - p.t < 700) this._click();
    });
    this._on(cv, 'pointerleave', () => { p.in = false; p.down = false; this.hover = null; this.ui.hint(null); if (this.outline) this.outline.visible = false; });
    this._on(cv, 'wheel', (e) => { if (this.activeScene !== 'showcase' || this.ui.detailOpen) return; e.preventDefault(); const now = performance.now(); if (now - (this._wheelT || 0) < 260) return; this._wheelT = now; e.deltaY > 0 ? this.showcase.next() : this.showcase.prev(); }, { passive: false });
    this._on(window, 'keydown', (e) => {
      if (this.activeScene !== 'showcase' || this.ui.detailOpen) return;
      if (e.key === 'ArrowRight') this.showcase.next(); else if (e.key === 'ArrowLeft') this.showcase.prev(); else if (e.key === 'Enter' && document.activeElement === cv) this._openSelected();
    });
    this._on(window, 'resize', () => this.resize());
    if (window.ResizeObserver) { this._ro = new ResizeObserver(() => { cancelAnimationFrame(this._roRaf); this._roRaf = requestAnimationFrame(() => this.resize()); }); this._ro.observe(this.root); }
    this._on(document, 'visibilitychange', () => { if (document.hidden) this.sound.suspend(); else { this.sound.resume(); this._last = performance.now(); } });
  }

  resize(force) {
    if (!this.renderer) return; const w = this.root.clientWidth || innerWidth, h = this.root.clientHeight || innerHeight; if (!w || !h) return;
    const pr = this.quality.pixelRatio, key = w + 'x' + h + '@' + pr;
    if (!force && key === this._rsKey) return; this._rsKey = key;      // setSize clears the canvas, so never do it needlessly
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false); const a = w / h; this.camera.aspect = a; this.camera.fov = a < 0.75 ? 68 : a < 1 ? 60 : 52; this.camera.updateProjectionMatrix();
    if (this.showcase) this.showcase.resize(w, h);
  }

  /* ---- picking ----------------------------------------------------------------- */
  _ndc() { const w = this.ui.canvas.clientWidth, h = this.ui.canvas.clientHeight; return { x: (this.ptr.x / w) * 2 - 1, y: -(this.ptr.y / h) * 2 + 1 }; }
  _updateHover() {
    const p = this.ptr, cv = this.ui.canvas;
    if (this.activeScene === 'showcase') {
      if (!p.in || this.ui.detailOpen || p.down) { this.showcase.hover = -1; return; }
      const n = this._ndc(); const i = this.showcase.pick(n.x, n.y); this.showcase.hover = i; cv.classList.toggle('hsx-pointer', i >= 0); cv.classList.toggle('hsx-grab', i < 0); return;
    }
    cv.classList.remove('hsx-grab');
    if (!p.in || p.down || this.pickIds.size === 0 || !this.world) { if (this.hover) { this.hover = null; this.ui.hint(null); this.outline.visible = false; cv.classList.remove('hsx-pointer'); } return; }
    const n = this._ndc(); this.ray.setFromCamera(n, this.camera);
    const list = this.world.pick.filter((m) => this.pickIds.has(m.userData.pickId));
    const hits = this.ray.intersectObjects(list, false);
    const hit = hits.length ? hits[0].object : null;
    if (hit) {
      this.hover = hit; cv.classList.add('hsx-pointer');
      if (!hit.geometry.boundingBox) hit.geometry.computeBoundingBox();
      hit.updateWorldMatrix(true, false); this.outline.box.copy(hit.geometry.boundingBox).applyMatrix4(hit.matrixWorld); this.outline.visible = true;
      const c = hit.getWorldPosition(V3()); c.y += (hit.geometry.parameters.height || 1) / 2; c.project(this.camera);
      const w = cv.clientWidth, h = cv.clientHeight; this.ui.hint(hit.userData.label, (c.x * 0.5 + 0.5) * w, clamp((-c.y * 0.5 + 0.5) * h, 40, h - 40));
    } else if (this.hover) { this.hover = null; this.ui.hint(null); this.outline.visible = false; cv.classList.remove('hsx-pointer'); }
  }
  _click() {
    if (this.activeScene === 'showcase') {
      if (this.ui.detailOpen) return;
      const n = this._ndc(), i = this.showcase.pick(n.x, n.y);
      if (i < 0) return; if (i === this.showcase.index) this._openSelected(); else this.showcase.select(i); return;
    }
    this._updateHover(); if (!this.hover) return;
    const id = this.hover.userData.pickId; this._handlePick(id);
  }
  _handlePick(id) {
    if (this.waiters.pick && this.waiters.pick.id === id) { const w = this.waiters.pick; this.waiters.pick = null; w.res(); return; }
    if (this.state === 'RECEPTION' && this.waiters.talk) {
      if (id === 'bossDoor' || id === 'managerDoor') { this.toggleDoor(id === 'bossDoor' ? 'boss' : 'manager'); return; }
      const focus = { boss: 'boss', manager: 'manager', employees: 'employee' }[id];
      const w = this.waiters.talk; this.waiters.talk = null; w.res(focus); return;
    }
  }
  toggleDoor(which) { const d = this.world.doors[which]; if (!d || d.busy) return; d.busy = true; this.sound.door(); d.tweenTo(d.isOpen ? 0 : 1, 1.0).then(() => { d.busy = false; }); }

  /* ------------------------------------------------------------------------ *
   *  LOOP
   * ------------------------------------------------------------------------ */
  startLoop() {
    if (this.running) return; this.running = true; this._last = performance.now(); this._time = 0; this._hoverAcc = 0;
    const loop = (ms) => {
      if (!this.running || !this.alive) return; this.raf = requestAnimationFrame(loop);
      if (document.hidden) { this._last = ms; return; }
      const TT = window.HSX_TEST; // test hook: fixed time-step / optional render skipping (used by automated tests)
      const dt = TT && TT.dt ? TT.dt : Math.min(0.05, Math.max(0.0001, (ms - this._last) / 1000)); this._last = ms; this._time += dt;
      if (!TT) this._adapt(dt);
      for (let i = this.tweens.length - 1; i >= 0; i--) { const t = this.tweens[i]; t.t += dt; const u = Math.min(1, t.t / t.dur); t.fn(t.ease(u)); if (u >= 1) { this.tweens.splice(i, 1); t.res(); } }
      for (let i = this.watchers.length - 1; i >= 0; i--) { const w = this.watchers[i]; if (w.cond()) { this.watchers.splice(i, 1); w.fn(); } }
      this._hoverAcc += dt; if (this._hoverAcc > 0.06) { this._hoverAcc = 0; this._updateHover(); }
      if (this.activeScene === 'office' && this.world) {
        this.world.update(dt, this._time); this._updateGLB(dt); this.rig.update(dt, this._time);
        this.outline.material.opacity = 0.6 + 0.3 * Math.sin(this._time * 5);
        if (!(TT && TT.noRender && !TT.once)) this.renderer.render(this.scene, this.camera);
      } else if (this.activeScene === 'showcase' && this.showcase) {
        this.showcase.update(dt, this._time); if (!(TT && TT.noRender && !TT.once)) this.renderer.render(this.showcase.scene, this.showcase.camera);
      }
      if (TT) TT.once = false;
    };
    this.raf = requestAnimationFrame(loop);
  }
  _adapt(dt) { // gentle quality step-down only (never toggles shadows / recompiles shaders mid-run → no flashing)
    this._warm = (this._warm || 0) + dt; if (this._warm < 6 || this._degraded) return;   // ignore load / compile stalls
    this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc < 2) return;
    const fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0;
    if (fps < 22) this.lowFps++; else this.lowFps = 0;
    if (this.lowFps >= 3) {
      this._degraded = true; this.quality.pixelRatio = 1; this.resize(true);
      console.info('[hsx] low frame-rate detected — reduced render resolution');
    }
  }

  /* ------------------------------------------------------------------------ *
   *  SEQUENCES
   * ------------------------------------------------------------------------ */
  async run() {
    this.startLoop(); this.resize();
    await this.runIntro();
  }

  async runIntro() {
    const ep = ++this.epoch, w = this.world, A = w.anchors, ui = this.ui, rig = this.rig;
    this.setState('INTRO'); this.setPicks([]); rig.freeLook = false; this.route = null;
    rig.set(V3(0, 1.75, 19.5), V3(0, 3.2, 10.4));
    ui.setFadeInstant(true); await this.wait(0.5); ui.hideLoader(); await this.wait(0.9);
    ui.fade(false, 2200);
    ui.title(true, CFG.brand.toUpperCase(), CFG.tagline);
    await rig.fly([V3(0, 1.75, 19.5), V3(0, 1.7, 16.5), V3(0, 1.66, 13.4)], [V3(0, 3.2, 10.4), V3(0, 2.6, 10.2), V3(0, 1.6, 9.0)], 7.0 * this.tScale + 0.2, easeSine);
    ui.title(false);
    // door opens
    this.sound.door(); w.doors.entrance.tweenTo(1, 1.5);
    this.setPicks(['door']);
    await Promise.race([this.wait(3.2), new Promise((res) => { this.waiters.pick = { id: 'door', res }; })]); this.waiters.pick = null;
    this.setPicks([]);
    // ---- scene 2: enter office
    this.setState('ENTERING_OFFICE');
    const enter = rig.fly(
      [V3(0, 1.66, 13.4), V3(0, 1.66, 10.8), V3(0, 1.66, 8.9), V3(-0.9, 1.64, 7.8), A.visitor],
      [V3(0, 1.6, 9.0), V3(0, 2.0, -3.0), V3(4.5, 1.7, -4.5), V3(-4.5, 1.5, -0.5), A.receptionLook], 10.5 * this.tScale + 0.3, easeSine);
    this.watch(() => rig.pos.z < 9.0, () => w.doors.entrance.tweenTo(0, 1.4));
    await enter;
    await this.receptionLoop();
  }

  /** RECEPTION: wait for the visitor to approach / click Muskan, then greet and ask who to meet. */
  async receptionLoop() {
    const w = this.world, m = w.muskan, ui = this.ui, rig = this.rig;
    this.setState('RECEPTION'); rig.freeLook = true;
    this.setPicks(['muskan', 'boss', 'manager', 'employees', 'bossDoor', 'managerDoor']);
    ui.prompt('Talk to Muskan', () => { const t = this.waiters.talk; if (t) { this.waiters.talk = null; t.res(undefined); } });
    const focus = await Promise.race([new Promise((res) => { this.waiters.talk = { res }; }), this.wait(5).then(() => undefined)]);
    this.waiters.talk = null; ui.hidePrompt(); this.setPicks([]);
    // greet
    m.typing = false; m.lookAt(V3(rig.pos.x, 1.55, rig.pos.z));
    m.gesture('greet', 2.4); m.talking = false;
    await this.wait(0.5);
    this.setState('CHOOSING_DESTINATION'); rig.freeLook = false;
    if (this.camera.aspect < 1) { const y0 = rig.look.y; this.tween(0.7, (u) => { rig.look.y = y0 - 1.0 * u; }, easeIO); } // keep Muskan above the tall mobile panel
    m.talking = true;
    const o = CFG.text.options;
    const id = await ui.choose(CFG.people.muskan.name, CFG.people.muskan.role, CFG.text.muskanGreeting, CFG.text.question,
      [{ id: 'boss', label: o.boss }, { id: 'manager', label: o.manager }, { id: 'employee', label: o.employee }, { id: 'explore', label: o.explore }], focus);
    m.talking = false; ui.hideDialog();
    this.route = id;
    if (id === 'boss') await this.routeBoss();
    else if (id === 'manager') await this.routeManager();
    else if (id === 'employee') await this.routeEmployee();
    else await this.routeExplore();
  }

  /* ---- shared bits ------------------------------------------------------------- */
  _closeInDoor(which, dist, pt) { const d = this.world.doors[which]; const pos = d.group.position; this.watch(() => pt().distanceTo(V3(pos.x, 0, pos.z)) < dist, () => { this.sound.door(); d.tweenTo(1, 1.2); }); }
  async _muskanReturn(from) {
    const w = this.world, m = w.muskan, seat = w.muskanSeat, S = seat.standSpot(0.5);
    await m.walkPath([{ x: 0, z: -3.2 }, { x: -0.3, z: 3.0 }, { x: -1.4, z: 3.72 }, { x: S.x, z: S.z }], { speed: 1.4 * (this.reduced ? 1.5 : 1) });
    await m.turnTo(0); await m.sitDown(1.6); await seat.pushTo(0, 0.8);
    m.typing = true; m.lookAt(V3(-2.6, 1.2, 4.6));
  }

  /* ---- ROUTE A: boss ----------------------------------------------------------------- */
  async routeBoss() {
    const w = this.world, m = w.muskan, seat = w.muskanSeat, ui = this.ui, rig = this.rig, T = CFG.text, sp = this.reduced ? 1.5 : 1;
    this.setState('ESCORTING_TO_BOSS'); this.setPicks([]);
    m.talking = true; await Promise.all([m.gesture('ack', 1.5), ui.subtitle(CFG.people.muskan.name, T.muskanBoss, 2600 * this.tScale + 400)]); m.talking = false;
    await seat.pushTo(0.5, 0.8); m.lookAt(null);
    const stand = m.standUp(1.5);
    await stand;
    rig.startFollow(m, { dist: 2.7, height: 1.68, lookY: 1.3 });
    this._closeInDoor('boss', 4.3, () => V3(m.root.position.x, 0, m.root.position.z));
    await m.walkPath([{ x: -1.6, z: 3.72 }, { x: -0.3, z: 3.4 }, { x: 0, z: 2.4 }, { x: 0, z: -3.3 }, { x: -1.2, z: -4.25 }], { speed: 1.3 * sp, finalYaw: Math.atan2(1.2, -0.75) });
    await m.turnTo(Math.atan2(1.2, -0.75));
    await m.gesture('sweep', 1.9);
    // Muskan walks back while the camera enters the cabin
    this._muskanReturn();
    const here = rig.pos.clone(), look = rig.look.clone(); rig.release();
    await rig.fly([here, V3(0, 1.64, -2.6), V3(0, 1.6, -4.6), w.anchors.bossInside], [look, V3(0, 1.5, -6.5), w.anchors.bossLook], 5.2 * this.tScale + 0.3, easeSine);
    w.doors.boss.tweenTo(0, 1.2);
    await this.bossDialogue();
  }

  async bossDialogue(manager = null) {
    const w = this.world, boss = w.boss, ui = this.ui, rig = this.rig, T = CFG.text;
    this.setState('BOSS_DIALOGUE'); rig.freeLook = true; rig.yawT = 0;
    boss.typing = false; boss.lookAt(V3(rig.pos.x, 1.5, rig.pos.z)); boss.talking = true; boss.gesture('nod', 1.4);
    if (manager) { manager.talking = true; manager.lookAt(V3(rig.pos.x, 1.55, rig.pos.z)); }
    await ui.single(CFG.people.boss.name, CFG.people.boss.role, T.bossLine, T.bossButton);
    boss.talking = false; if (manager) manager.talking = false;
    await this.beginShowcase();
  }

  /* ---- ROUTE B: manager --------------------------------------------------------------- */
  async routeManager() {
    const w = this.world, m = w.muskan, s = w.sahil, seat = w.sahilSeat, ui = this.ui, rig = this.rig, T = CFG.text, sp = this.reduced ? 1.5 : 1;
    this.setState('CALLING_MANAGER'); this.setPicks([]);
    m.talking = true; await Promise.all([m.gesture('ack', 1.3), ui.subtitle(CFG.people.muskan.name, T.muskanManager, 2400 * this.tScale + 300)]); m.talking = false;
    this.sound.ping(); await m.gesture('phone', 2.4); m.lookAt(null); m.typing = true;
    // Sahil comes out
    this.setState('ESCORTING_TO_MANAGER_DESTINATION');
    rig.startTrack(s, { lookY: 1.3 });
    await seat.pushTo(0.45, 0.7); s.typing = false; s.lookAt(null);
    await s.standUp(1.5);
    this._closeInDoor('manager', 3.0, () => V3(s.root.position.x, 0, s.root.position.z));
    const back = V3(-2.2, 1.55, 6.9);
    await s.walkPath([{ x: 7.3, z: -8.94 }, { x: 7.1, z: -7.4 }, { x: 7.1, z: -6.6 }, { x: 5.2, z: -6.6 }, { x: 4.6, z: -4.0 }, { x: 3.4, z: -2.6 }, { x: 1.4, z: 0.2 }, { x: 0.3, z: 3.2 }, { x: 0.2, z: 5.0 }, { x: -0.1, z: 5.7 }], { speed: 1.35 * sp, finalYaw: Math.atan2(-2.1, 1.2) });
    w.doors.manager.tweenTo(0, 1.2);
    rig.release(); rig.fly([rig.pos.clone(), w.anchors.visitor], [rig.look.clone(), V3(-0.9, 1.5, 5.8)], 1.6 * this.tScale + 0.2);
    s.lookAt(back); s.talking = true; await Promise.all([s.gesture('ack', 1.4), ui.subtitle(CFG.people.sahil.name, T.sahilGreeting, 2300 * this.tScale + 300)]); s.talking = false;
    // lead the visitor to the cabin
    this._closeInDoor('boss', 4.3, () => V3(s.root.position.x, 0, s.root.position.z));
    s.lookAt(null);
    const g = s.gesture('sweep', 1.5);
    await g;
    rig.startFollow(s, { dist: 2.6, height: 1.66, lookY: 1.3 });
    await s.walkPath([{ x: 0.3, z: 5.2 }, { x: 0.2, z: 2 }, { x: 0, z: -3.2 }, { x: 0, z: -4.7 }, { x: -1.0, z: -6.7 }], { speed: 1.25 * sp, finalYaw: 0.8 });
    const here = rig.pos.clone(), look = rig.look.clone(); rig.release();
    await rig.fly([here, V3(0, 1.62, -4.4), V3(0.55, 1.6, -5.2)], [look, V3(0, 1.4, -7), V3(-0.5, 1.0, -8.4)], 3.2 * this.tScale + 0.3, easeSine);
    w.doors.boss.tweenTo(0, 1.2);
    // Sahil speaks, then the single action
    this.setState('BOSS_DIALOGUE'); rig.freeLook = true;
    const boss = w.boss; boss.typing = false; boss.lookAt(V3(rig.pos.x, 1.5, rig.pos.z));
    s.lookAt(V3(rig.pos.x, 1.55, rig.pos.z)); s.talking = true;
    await ui.single(CFG.people.sahil.name, CFG.people.sahil.role, T.sahilLine, T.sahilButton);
    s.talking = false; await this.beginShowcase();
  }

  /* ---- ROUTE C: employee ------------------------------------------------------------------- */
  async routeEmployee() {
    const w = this.world, m = w.muskan, es = w.routeEmployee, e = es.human, ui = this.ui, rig = this.rig, T = CFG.text, sp = this.reduced ? 1.5 : 1;
    this.setState('CALLING_EMPLOYEE'); this.setPicks([]);
    m.talking = true; m.typing = false;
    m.lookAt(V3(e.root.position.x, 1.3, e.root.position.z)); m.turnTo(-0.9);
    await Promise.all([m.gesture('beckon', 2.4), ui.subtitle(CFG.people.muskan.name, T.muskanEmployee, 2400 * this.tScale + 300)]); m.talking = false;
    rig.startTrack(e, { lookY: 1.3 });
    e.typing = false; e.talking = false; e.lookAt(V3(m.root.position.x, 1.3, m.root.position.z));
    await this.wait(0.3); await es.pushTo(0.5, 0.7); await e.standUp(1.5);
    m.lookAt(null); m.turnTo(0); m.typing = true;
    const back = V3(-2.2, 1.55, 6.9);
    await e.walkPath([{ x: -5.9, z: 1.7 }, { x: -4.4, z: 2.5 }, { x: -0.4, z: 2.6 }, { x: -0.2, z: 4.9 }, { x: -0.1, z: 5.6 }], { speed: 1.35 * sp, finalYaw: Math.atan2(-2.1, 1.3) });
    rig.release(); rig.fly([rig.pos.clone(), this.world.anchors.visitor], [rig.look.clone(), V3(-0.9, 1.5, 5.8)], 1.4 * this.tScale + 0.2);
    this.setState('EMPLOYEE_DIALOGUE'); rig.freeLook = true;
    e.lookAt(back); e.talking = true; e.gesture('greet', 2.0);
    await ui.single('Team member', 'Employee', T.employeeLine, T.employeeButton);
    e.talking = false; rig.freeLook = false; ui.hideDialog();
    // walk toward the exit; camera follows briefly
    this.sound.door(); w.doors.entrance.tweenTo(1, 1.3);
    rig.startFollow(e, { dist: 2.3, height: 1.66, lookY: 1.3, rate: 2.0 });
    e.lookAt(null);
    const walk = e.walkPath([{ x: -0.2, z: 7.8 }, { x: 0, z: 9.6 }, { x: 0, z: 11.5 }], { speed: 1.35 * sp });
    this.watch(() => e.root.position.z > 9.0, () => {});
    await Promise.race([walk, this.wait(3.6 * this.tScale + 0.2)]);
    await this.beginShowcase();
  }

  /* ---- ROUTE D: explore directly ---------------------------------------------------------------- */
  async routeExplore() {
    const w = this.world, m = w.muskan, ui = this.ui, rig = this.rig, T = CFG.text;
    this.setState('DIRECT_EXPLORATION'); this.setPicks([]);
    m.talking = true; m.gesture('ack', 1.4);
    await ui.subtitle(CFG.people.muskan.name, T.muskanExplore, 2200 * this.tScale + 300); m.talking = false; m.lookAt(null); m.typing = true;
    const dim = this.tween(3.4 * this.tScale + 0.3, (u) => w.setDim(u), easeSine);
    const pull = rig.fly([rig.pos.clone(), V3(-0.8, 1.9, 9.0)], [rig.look.clone(), V3(0, 2.2, -2)], 3.4 * this.tScale + 0.3, easeSine);
    await Promise.all([dim, pull]);
    await this.beginShowcase({ fromDim: true });
  }

  /* ------------------------------------------------------------------------ *
   *  WELCOME + SHOWCASE
   * ------------------------------------------------------------------------ */
  async beginShowcase({ fromDim = false } = {}) {
    const ui = this.ui, T = CFG.text;
    this.setState('WELCOME_SEQUENCE'); this.setPicks([]); this.rig.freeLook = false; ui.hideDialog(); ui.hidePrompt(); ui.clearSubtitle();
    if (!fromDim) await ui.fade(true, 900); else ui.setFadeInstant(true);
    // swap: dispose the office, build the showcase while the welcome overlay plays
    this.disposeOffice();
    this.showcase = new Showcase({ projects: this.projects, quality: this.quality });
    this.showcase.onChange = (i) => this._onSelect(i);
    this.activeScene = 'showcase'; this.resize();
    ui.buildProjectList(this.showcase.projects, (i) => this.showcase.select(i));
    ui.setFadeInstant(false);
    const ep = this.epoch;
    const done = await ui.welcome(T.welcome1, T.welcome2);
    if (ep !== this.epoch || !this.alive) return;
    this.setState('PROJECT_COLLECTION');
    this._onSelect(this.showcase.index); ui.showShowcase(true); ui.endWelcome();
    this.ui.canvas.focus({ preventScroll: true });
    // swap top-bar for the collection
    ui.el.skip.textContent = 'Enter Main Website ›'; this._wireShowUI();
  }
  _wireShowUI() {
    const ui = this.ui; if (this._showWired) return; this._showWired = true;
    ui.el.prev.addEventListener('click', () => this.showcase.prev()); ui.el.next.addEventListener('click', () => this.showcase.next());
    ui.el.open.addEventListener('click', () => this._openSelected());
    ui.el.dback.addEventListener('click', () => { ui.closeDetail(); this.setState('PROJECT_COLLECTION'); ui.canvas.focus({ preventScroll: true }); });
  }
  _onSelect(i) { const p = this.showcase.projects[i]; this.ui.setInfo(p, i, this.showcase.n); }
  _openSelected() {
    if (this.state !== 'PROJECT_COLLECTION') return;
    const i = this.showcase.index, p = this.showcase.projects[i]; this.setState('PROJECT_DETAIL'); this.ui.openDetail(p, i, this.showcase.n);
  }

  disposeOffice() {
    if (this.world) { this.scene.remove(this.world.root); this.world.dispose(); this.world = null; }
    if (this._glbMod) this.glbHumans.forEach((h) => this._glbMod.disposeGLB(h));
    this.glbHumans = []; disposeHumanShared(); this.outline.visible = false; this.tweens.length = 0; this.watchers.length = 0;
  }

  /** Restart without reloading the page: reset every lock, dialogue, camera and character. */
  async restart() {
    this.epoch++; this.ui.reset(); this.tweens.length = 0; this.watchers.length = 0; this.waiters = {}; this.hover = null; this.setPicks([]);
    if (this.showcase) { this.showcase.dispose(); this.showcase = null; }
    this._showWired = false; this.ui.el.skip.textContent = 'Skip Intro ›';
    // clone UI buttons to drop old showcase listeners
    for (const k of ['prev', 'next', 'open', 'dback']) { const el = this.ui.el[k]; const c = el.cloneNode(true); el.replaceWith(c); this.ui.el[k] = c; }
    this.disposeOffice(); this.activeScene = 'office'; this.state = null; this.route = null; this.rig.release();
    await this.buildOffice(); await this.loadGLBModels(); this.resize();
    this.ui.setFadeInstant(true); await this.runIntro();
  }

  destroy() {
    this.alive = false; this.running = false; cancelAnimationFrame(this.raf); this.epoch++;
    (this._offs || []).forEach((f) => f()); this._offs = []; if (this._ro) this._ro.disconnect();
    this.tweens.length = 0; this.watchers.length = 0;
    try { if (this.world) this.world.dispose(); if (this.showcase) this.showcase.dispose(); disposeHumanShared(); if (this.envMap) this.envMap.dispose(); } catch (e) {}
    if (this.renderer) { this.renderer.dispose(); try { this.renderer.forceContextLoss(); } catch (e) {} }
    this.sound.destroy(); if (this.ui) this.ui.destroy();
  }
}

/* ============================================================================
   Controller — mounts/unmounts the experience in #hsepid-office-intro
   ========================================================================== */
class Controller {
  constructor(root) { this.root = root; this.exp = null; this.active = false; this.main = document.getElementById('main-site'); }
  get state() { return this.exp ? this.exp.state : null; }
  shouldAutoStart() {
    const q = new URLSearchParams(location.search).get(CFG.forceQuery);
    if (q === '0') return false; if (q === '1') return true;
    if (!CFG.autoStart) return false;
    if (CFG.rememberDays > 0) { try { const t = Number(localStorage.getItem(LS_KEY)); if (t && Date.now() - t < CFG.rememberDays * 864e5) return false; } catch (e) {} }
    return true;
  }
  _lock(on) {
    document.documentElement.classList.toggle('hsx-active', on); this.root.classList.toggle('hsx-on', on);
    if (this.main) { if (on) { this.main.setAttribute('inert', ''); this.main.setAttribute('aria-hidden', 'true'); } else { this.main.removeAttribute('inert'); this.main.removeAttribute('aria-hidden'); } }
  }
  async start() {
    if (this.active) return; this.active = true; this._lock(true); window.__hsxReady = true;
    const exp = new Experience(this.root, { onExit: (o) => this.exit(o) }); this.exp = exp; if (window.HSX_TEST) window.HSX_TEST.exp = exp;
    try {
      const ok = await exp.init(); if (!this.active || exp !== this.exp) return;
      if (ok) await exp.run();
    } catch (e) { console.error('[hsx] intro failed — falling back to the main site', e); this.exit({ remember: false, reason: 'error' }); }
  }
  async exit({ remember = true, reason = '' } = {}) {
    if (!this.active) return; this.active = false;
    const exp = this.exp; this.exp = null;
    if (remember && CFG.rememberDays > 0) { try { localStorage.setItem(LS_KEY, String(Date.now())); } catch (e) {} }
    if (exp && exp.ui && !exp.failed) { try { await exp.ui.fade(true, 500); } catch (e) {} }
    if (exp) exp.destroy();
    this._lock(false); this.root.innerHTML = ''; this.root.removeAttribute('data-state');
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('hsx:exit', { detail: { reason } }));
    try { (document.querySelector('#main-site a, #main-site button') || document.body).focus({ preventScroll: true }); } catch (e) {}
  }
  skip() { return this.exit({ remember: true, reason: 'skip' }); }
  async restart() { if (this.active && this.exp && !this.exp.failed) return this.exp.restart(); return this.start(); }
  destroy() { return this.exit({ remember: false, reason: 'destroy' }); }
}

export function boot() {
  const root = document.getElementById('hsepid-office-intro'); if (!root) return null;
  const c = new Controller(root); window.HsepidOfficeIntro = c;
  if (c.shouldAutoStart()) c.start();
  return c;
}
boot();
