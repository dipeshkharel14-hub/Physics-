/* ==========================================================================
   Hsepid.np — human surface materials and clean hair shells (generated in code)
   • skin:  soft tonal-variation albedo + very fine pore normal map, low sheen (SSS-style rim), matte roughness
   • cloth: fine weave normal map + fabric sheen (no added geometry)
   • hair:  one smooth shell per hairstyle that follows the skull with a clean hairline, streak-textured
   • eyes:  iris texture + glossy cornea
   No loose geometry is attached to faces: detail comes from textures and from a few clean meshes.
   ========================================================================== */
import * as THREE from 'three';

const TAU = Math.PI * 2;
const store = { tex: new Map(), mat: new Map() };
let _s = 7;
const rnd = () => { _s = (_s * 16807) % 2147483647; return (_s - 1) / 2147483646; };
const rr = (a, b) => a + (b - a) * rnd();
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const cached = (key, f) => { let t = store.tex.get(key); if (!t) { t = f(); store.tex.set(key, t); } return t; };

function normalFromHeight(hc, strength) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h), og = out.getContext('2d'), img = og.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

/* ---------------- skin ---------------- */
export function skinMaterial(color, variant = 0) {
  const k = 'skin' + color + '_' + (variant % 3); let m = store.mat.get(k); if (m) return m;
  const albedo = cached('skin_a' + (variant % 3), () => {
    _s = 11 + (variant % 3) * 31; const c = canvas(256, 256), g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) { const x = rnd() * 256, y = rnd() * 256, r = rr(30, 80), warm = rnd() < 0.5, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, warm ? 'rgba(255,225,215,0.12)' : 'rgba(225,222,215,0.10)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(130,95,80,${rr(0.015, 0.045)})`; g.beginPath(); g.arc(rnd() * 256, rnd() * 256, rr(0.6, 1.2), 0, TAU); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  });
  const normal = cached('skin_n' + (variant % 3), () => {
    _s = 91 + (variant % 3) * 17; const c = canvas(256, 256), g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3500; i++) { const v = rnd() < 0.6 ? 70 : 170; g.fillStyle = `rgba(${v},${v},${v},${rr(0.2, 0.5)})`; g.beginPath(); g.arc(rnd() * 256, rnd() * 256, rr(0.7, 1.3), 0, TAU); g.fill(); }
    const nt = normalFromHeight(c, 1.4); nt.repeat.set(5, 5); return nt;
  });
  const base = new THREE.Color(color);
  m = new THREE.MeshPhysicalMaterial({
    color: base, map: albedo, normalMap: normal, normalScale: new THREE.Vector2(0.08, 0.08), roughness: 0.68, metalness: 0,
    sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xd9907d).lerp(base, 0.55), specularIntensity: 0.4, envMapIntensity: 0.55,
  });
  m.onBeforeCompile = (sh) => {            // gentle warm light-wrap at the terminator ≈ sub-surface scattering
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { float fr = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.5);
        reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.5, 0.36) * (0.015 + 0.08 * fr); }`);
  };
  m.customProgramCacheKey = () => 'hsx-skin2';
  store.mat.set(k, m); return m;
}

/* ---------------- cloth ---------------- */
export function clothMaterial(color, { kind = 'twill', rough = 0.82, stripeTex = null } = {}) {
  const k = 'cloth' + color + kind + rough + (stripeTex ? 's' : ''); let m = store.mat.get(k); if (m) return m;
  const nm = cached('cloth_n' + kind, () => {
    _s = 5 + kind.length; const c = canvas(128, 128), g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128);
    if (kind === 'knit') { for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) { g.fillStyle = (x / 4 + y / 4) % 2 ? '#c4c4c4' : '#585858'; g.beginPath(); g.ellipse(x + 2, y + 2, 1.8, 3, 0.5, 0, TAU); g.fill(); } }
    else if (kind === 'oxford') { for (let y = 0; y < 128; y += 2) for (let x = 0; x < 128; x += 2) { g.fillStyle = (x + y) % 4 === 0 ? '#bdbdbd' : '#757575'; g.fillRect(x, y, 2, 2); } }
    else { for (let i = -128; i < 256; i += 3) { g.strokeStyle = i % 6 ? '#b0b0b0' : '#767676'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); } }
    const t = normalFromHeight(c, 1.6); t.repeat.set(kind === 'knit' ? 8 : 12, kind === 'knit' ? 10 : 15); return t;
  });
  const c = new THREE.Color(color);
  m = new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, metalness: 0, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35), sheen: 0.6, sheenRoughness: 0.6, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.3), envMapIntensity: 0.5 });
  if (stripeTex) m.map = stripeTex;
  store.mat.set(k, m); return m;
}

/* ---------------- hair ---------------- */
function streakTex() {
  return cached('hair_s', () => {
    _s = 77; const c = canvas(128, 128), g = c.getContext('2d'); g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 120; i++) { const x = rnd() * 128, v = Math.floor(rr(90, 190)); g.strokeStyle = `rgba(${v},${v},${v},${rr(0.25, 0.6)})`; g.lineWidth = rr(0.8, 2.2); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rr(-4, 4), 40, x + rr(-6, 6), 90, x + rr(-5, 5), 128); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  });
}
export function hairMaterial(color) {
  const k = 'hair' + color; let m = store.mat.get(k); if (m) return m;
  const c = new THREE.Color(color);
  m = new THREE.MeshPhysicalMaterial({ color: c, map: streakTex(), roughness: 0.55, metalness: 0, sheen: 0.5, sheenRoughness: 0.45, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.2), clearcoat: 0.08, clearcoatRoughness: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.6 });
  store.mat.set(k, m); return m;
}
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * Smooth shell hugging an ellipsoid (the skull or jaw).
 *  thetaMax(a): lowest polar angle reached at azimuth |a| (0 = straight ahead) — this is the hairline / beard line.
 *  thetaMin(a): upper limit (0 for hair; the cheek line for beards).
 *  volume(theta, a): outward multiplier of the shell thickness.  hang: extra straight-down length below `hangFrom` (long hair).
 */
export function shellGeometry({ center, radii, thick = 0.006, thetaMin = () => 0, thetaMax, volume = () => 1, hang = 0, hangFrom = 1.8, flare = 0.3, rows = 26, cols = 56 }) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= cols; j++) {
    const ph = (j / cols) * TAU, a = Math.abs(((ph + Math.PI) % TAU) - Math.PI), azim = Math.abs(a - Math.PI);   // a: 0 = back … use azimuth from face below
    const af = Math.abs(((ph + Math.PI) % TAU) - Math.PI);               // angle from the face direction (+Z) — ph measured from +Z
    const aa = Math.min(ph, TAU - ph), t0 = thetaMin(aa), t1 = thetaMax(aa);
    for (let i = 0; i <= rows; i++) {
      const t = i / rows; let th = t0 + (t1 - t0) * t, down = 0;
      if (hang && th > hangFrom) { down = (th - hangFrom) * hang; th = hangFrom; }
      const sn = Math.sin(th), cs = Math.cos(th), nx = sn * Math.sin(ph) / radii.x, ny = cs / radii.y, nz = sn * Math.cos(ph) / radii.z, nl = Math.hypot(nx, ny, nz);
      const off = thick * volume(th, aa) * (i === rows ? 0.5 : 1) * (t < 0.05 ? 0.5 + 10 * t : 1);   // feather the free edges so the shell sits on the skin
      const fl = 1 + (down > 0 ? flare * Math.min(1, down / 0.12) * 0.5 : 0);
      pos.push(center.x + (radii.x * sn * Math.sin(ph) + nx / nl * off) * fl, center.y + radii.y * cs + ny / nl * off - down, center.z + (radii.z * sn * Math.cos(ph) + nz / nl * off) * fl);
      uv.push(j / cols * 3, t);
      void af; void azim;
    }
  }
  for (let j = 0; j < cols; j++) for (let i = 0; i < rows; i++) { const a = j * (rows + 1) + i, b = a + rows + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ---------------- eyes ---------------- */
export function irisMaterial(color) {
  const k = 'iris' + color; let m = store.mat.get(k); if (m) return m;
  const t = cached(k, () => {
    const c = canvas(128, 128), g = c.getContext('2d'), col = new THREE.Color(color), hex = (f) => '#' + col.clone().multiplyScalar(f).getHexString();
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 62); gr.addColorStop(0, hex(0.55)); gr.addColorStop(0.5, hex(1.2)); gr.addColorStop(0.88, hex(0.8)); gr.addColorStop(1, '#0b0705');
    g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.fill();
    _s = 99; g.strokeStyle = 'rgba(255,230,190,0.2)'; g.lineWidth = 0.9; for (let i = 0; i < 60; i++) { const a = rnd() * TAU, r0 = rr(16, 24), r1 = rr(34, 56); g.beginPath(); g.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); g.lineTo(64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1); g.stroke(); }
    g.fillStyle = '#030303'; g.beginPath(); g.arc(64, 64, 18, 0, TAU); g.fill();
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
  });
  m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.3 }); store.mat.set(k, m); return m;
}
export function corneaMaterial() { let m = store.mat.get('cornea'); if (!m) { m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, roughness: 0, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 2, depthWrite: false }); store.mat.set('cornea', m); } return m; }
export function scleraMaterial() { let m = store.mat.get('sclera'); if (!m) { m = new THREE.MeshStandardMaterial({ color: 0xe6dfd6, roughness: 0.3 }); store.mat.set('sclera', m); } return m; }

export function disposeSkinShared() { store.tex.forEach((t) => t.dispose()); store.mat.forEach((m) => m.dispose()); store.tex.clear(); store.mat.clear(); }
