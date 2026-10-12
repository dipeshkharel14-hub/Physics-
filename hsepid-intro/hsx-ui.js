/* ==========================================================================
   Hsepid.np — HTML/CSS overlay (loader, dialogue, subtitles, welcome
   sequence, project-collection controls). Everything the visitor clicks is a
   real, keyboard-accessible HTML control — never text baked into the 3D scene.
   ========================================================================== */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class UI {
  constructor(root, config, { logoSrc, reduced, onSkip, onRestart, onSoundToggle, soundOn }) {
    this.root = root; this.cfg = config; this.reduced = reduced; this.logoSrc = logoSrc; this.token = 0;
    this.onSkip = onSkip; this.onSoundToggle = onSoundToggle;
    root.innerHTML = `
      <canvas class="hsx-canvas" tabindex="0" aria-label="Interactive 3D Hsepid.np office. Drag to look around."></canvas>
      <div class="hsx-topbar">
        <div class="hsx-brandmark"><img alt="" data-hsx="mark" hidden><span>${esc(config.brand.toUpperCase())}</span></div>
        <button class="hsx-btn hsx-btn-ghost" data-hsx="restart" type="button">↻ Restart</button>
        <button class="hsx-btn hsx-btn-ghost" data-hsx="sound" type="button" aria-pressed="${soundOn ? 'true' : 'false'}">Sound: ${soundOn ? 'On' : 'Off'}</button>
        <button class="hsx-btn hsx-btn-ghost" data-hsx="skip" type="button">Skip Intro ›</button>
      </div>
      <div class="hsx-title" data-hsx="title" aria-hidden="true"><h1></h1><p></p></div>
      <div class="hsx-hint" data-hsx="hint" aria-hidden="true"></div>
      <div class="hsx-subtitle" data-hsx="sub" role="status" aria-live="polite"><span></span></div>
      <button class="hsx-btn hsx-prompt" data-hsx="prompt" type="button" hidden></button>
      <div class="hsx-dialog" data-hsx="dialog" role="dialog" aria-modal="false" aria-live="polite" aria-label="Conversation">
        <div class="hsx-who"><b data-hsx="who"></b><span data-hsx="role"></span></div>
        <p class="hsx-say" data-hsx="say"></p>
        <div class="hsx-q" data-hsx="q" hidden></div>
        <div class="hsx-opts" data-hsx="opts"></div>
      </div>
      <div class="hsx-showui" data-hsx="showui">
        <div class="hsx-showhead"><h2>PROJECTS</h2><p>Drag · scroll · arrow keys</p></div>
        <div class="hsx-info hsx-sr" data-hsx="info" aria-live="polite"><h3></h3><p></p></div>
        <div class="hsx-nav">
          <button class="hsx-btn hsx-btn-ghost" data-hsx="prev" type="button" aria-label="Previous project">‹ Prev</button>
          <div class="hsx-count" data-hsx="count"></div>
          <button class="hsx-btn hsx-btn-ghost" data-hsx="next" type="button" aria-label="Next project">Next ›</button>
          <button class="hsx-btn hsx-btn-ghost" data-hsx="open" type="button">Open ↗</button>
        </div>
        <nav class="hsx-sr" aria-label="All projects" data-hsx="srlist"></nav>
      </div>
      <div class="hsx-detail" data-hsx="detail" role="dialog" aria-modal="true" aria-label="Project details">
        <div class="hsx-card">
          <div class="hsx-no" data-hsx="dno"></div><h3 data-hsx="dname"></h3><p data-hsx="duse"></p><a class="hsx-url" data-hsx="durl"></a>
          <div class="hsx-row">
            <a class="hsx-btn hsx-btn-primary" data-hsx="dgo" target="_blank" rel="noopener noreferrer">VISIT PROJECT ↗</a>
            <button class="hsx-btn" data-hsx="dback" type="button">← Back to collection</button>
          </div>
        </div>
      </div>
      <div class="hsx-welcome" data-hsx="welcome" aria-live="polite">
        <svg class="hsx-wlines" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="hsx-grad" x1="0" x2="1"><stop offset="0" stop-color="#1b6fe0" stop-opacity="0"/><stop offset=".5" stop-color="#8fd0ff"/><stop offset="1" stop-color="#1b6fe0" stop-opacity="0"/></linearGradient></defs>
          <line x1="0" y1="300" x2="1000" y2="300"/><path class="hsx-d2" d="M0 360 C 250 260 450 440 1000 330"/><path class="hsx-d3" d="M0 250 C 300 360 620 190 1000 290"/>
          <line class="hsx-d4" x1="120" y1="0" x2="880" y2="600"/><line class="hsx-d2" x1="880" y1="0" x2="120" y2="600"/>
        </svg>
        <img class="hsx-wlogo" data-hsx="wlogo" alt="${esc(config.brand)} logo">
        <div class="hsx-wt1" data-hsx="wt1"></div><div class="hsx-wt2" data-hsx="wt2"></div>
        <button class="hsx-btn hsx-btn-ghost hsx-skip-w" data-hsx="wskip" type="button">Skip ›</button>
      </div>
      <div class="hsx-fade hsx-black" data-hsx="fade"></div>
      <div class="hsx-loader" data-hsx="loader" role="status" aria-live="polite">
        <img data-hsx="lLogo" alt="${esc(config.brand)}"><div class="hsx-loader-msg" data-hsx="lmsg">Loading…</div>
        <div class="hsx-bar"><i data-hsx="lbar"></i></div>
        <button class="hsx-btn hsx-btn-ghost" data-hsx="lskip" type="button">Skip Intro ›</button>
      </div>`;
    const q = (n) => root.querySelector(`[data-hsx="${n}"]`);
    this.el = {};
    ['restart', 'sound', 'skip', 'title', 'hint', 'sub', 'prompt', 'dialog', 'who', 'role', 'say', 'q', 'opts', 'showui', 'info', 'prev', 'next', 'open', 'count',
      'srlist', 'detail', 'dno', 'dname', 'duse', 'durl', 'dgo', 'dback', 'welcome', 'wlogo', 'wt1', 'wt2', 'wskip', 'fade', 'loader', 'lLogo', 'lmsg', 'lbar', 'lskip', 'mark'].forEach((n) => (this.el[n] = q(n)));
    this.canvas = root.querySelector('.hsx-canvas');
    if (logoSrc) { this.el.lLogo.src = logoSrc; this.el.wlogo.src = logoSrc; this.el.mark.src = logoSrc; this.el.mark.hidden = false; }
    this.el.skip.addEventListener('click', () => onSkip && onSkip());
    this.el.restart.addEventListener('click', () => onRestart && onRestart());
    this.el.lskip.addEventListener('click', () => onSkip && onSkip());
    this.el.sound.addEventListener('click', () => {
      const on = this.onSoundToggle ? this.onSoundToggle() : false;
      this.el.sound.textContent = 'Sound: ' + (on ? 'On' : 'Off'); this.el.sound.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    this._keys = (e) => {
      if (this.el.detail.classList.contains('hsx-show')) { if (e.key === 'Escape') this.el.dback.click(); return; }
      if (this.el.dialog.classList.contains('hsx-show') && /^[1-4]$/.test(e.key)) {
        const b = this.el.opts.querySelectorAll('button')[Number(e.key) - 1]; if (b && !b.disabled) b.click();
      }
    };
    root.addEventListener('keydown', this._keys);
    this._typeTimer = null;
  }

  /* ---- loader -------------------------------------------------------- */
  setLoader(pct, msg) { this.el.lbar.style.width = Math.round(pct * 100) + '%'; if (msg) this.el.lmsg.textContent = msg; }
  hideLoader() { this.el.loader.classList.add('hsx-gone'); }
  showLoader() { this.el.loader.classList.remove('hsx-gone'); }

  /* ---- cinematic title ---------------------------------------------- */
  title(on, h1, p) {
    const t = this.el.title; if (h1 != null) t.querySelector('h1').textContent = h1; if (p != null) t.querySelector('p').textContent = p;
    t.classList.toggle('hsx-show', !!on);
  }

  /* ---- floating hint -------------------------------------------------- */
  hint(text, x, y) {
    const h = this.el.hint; if (!text) { h.classList.remove('hsx-show'); return; }
    if (h.textContent !== text) h.textContent = text; h.style.left = x + 'px'; h.style.top = y + 'px'; h.classList.add('hsx-show');
  }

  /* ---- subtitle (non-blocking NPC speech) -------------------------------- */
  subtitle(who, text, ms = 2600) {
    const my = this.token, s = this.el.sub; s.querySelector('span').innerHTML = who ? `<b>${esc(who)}</b>${esc(text)}` : esc(text); s.classList.add('hsx-show');
    return new Promise((res) => setTimeout(() => { if (my !== this.token) return; s.classList.remove('hsx-show'); res(); }, ms));
  }
  clearSubtitle() { this.el.sub.classList.remove('hsx-show'); }

  /* ---- prompt button -------------------------------------------------- */
  prompt(label, cb) {
    const b = this.el.prompt; b.textContent = label; b.hidden = false;
    b.onclick = () => { b.hidden = true; b.onclick = null; cb(); };
  }
  hidePrompt() { this.el.prompt.hidden = true; this.el.prompt.onclick = null; }

  /* ---- dialogue -------------------------------------------------------- */
  _type(text) {
    const my = this.token; const sayEl = this.el.say; clearInterval(this._typeTimer);
    return new Promise((res) => {
      if (this.reduced) { sayEl.textContent = text; res(); return; }
      let i = 0; sayEl.textContent = '';
      const finish = () => { clearInterval(this._typeTimer); sayEl.textContent = text; this.el.dialog.removeEventListener('pointerdown', finish); res(); };
      this.el.dialog.addEventListener('pointerdown', finish, { once: true });
      this._typeTimer = setInterval(() => { if (my !== this.token) { clearInterval(this._typeTimer); return; } i += 1; sayEl.textContent = text.slice(0, i); if (i >= text.length) finish(); }, 20);
    });
  }
  _open(who, role, text) {
    this.el.who.textContent = who; this.el.role.textContent = role || ''; this.el.opts.innerHTML = ''; this.el.q.hidden = true;
    this.el.dialog.classList.add('hsx-show'); return this._type(text);
  }
  /** Multiple choice. options: [{id,label}]. Resolves with the chosen id; disables all buttons after the first click. */
  async choose(who, role, text, question, options, focusId) {
    await this._open(who, role, text);
    const my = this.token;
    if (question) { this.el.q.textContent = question; this.el.q.hidden = false; }
    const box = this.el.opts; box.className = 'hsx-opts';
    return new Promise((res) => {
      let done = false;
      options.forEach((o, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'hsx-btn'; b.dataset.id = o.id;
        b.innerHTML = `<span class="hsx-n">${i + 1}</span><span>${esc(o.label)}</span>`;
        b.addEventListener('click', () => { if (done || my !== this.token) return; done = true; box.querySelectorAll('button').forEach((x) => (x.disabled = true)); res(o.id); });
        box.appendChild(b);
      });
      const f = box.querySelector(`[data-id="${focusId}"]`) || box.querySelector('button'); if (f) f.focus({ preventScroll: true });
    });
  }
  /** Single-action dialogue (no cancel / alternative). */
  async single(who, role, text, label) {
    await this._open(who, role, text);
    const my = this.token, box = this.el.opts; box.className = 'hsx-opts hsx-one';
    return new Promise((res) => {
      let done = false; const b = document.createElement('button'); b.type = 'button'; b.className = 'hsx-btn hsx-btn-primary'; b.textContent = label;
      b.addEventListener('click', () => { if (done || my !== this.token) return; done = true; b.disabled = true; res(); });
      box.appendChild(b); b.focus({ preventScroll: true });
    });
  }
  hideDialog() { clearInterval(this._typeTimer); this.el.dialog.classList.remove('hsx-show'); }

  /* ---- fade -------------------------------------------------------------- */
  fade(toBlack, ms = 900) {
    const my = this.token, f = this.el.fade; f.style.transitionDuration = (this.reduced ? 1 : ms) + 'ms';
    f.classList.toggle('hsx-black', toBlack); f.classList.toggle('hsx-block', toBlack);
    return new Promise((res) => setTimeout(() => { if (my === this.token) res(); }, this.reduced ? 1 : ms));
  }
  setFadeInstant(black) { const f = this.el.fade; f.style.transitionDuration = '0ms'; f.classList.toggle('hsx-black', black); f.classList.toggle('hsx-block', black); void f.offsetWidth; }

  /* ---- welcome sequence ---------------------------------------------------- */
  async welcome(t1, t2) {
    const my = this.token, w = this.el.welcome; let skipped = false;
    this.el.wt1.textContent = t1; this.el.wt2.textContent = t2;
    w.className = 'hsx-welcome hsx-show';
    const skip = () => { skipped = true; }; this.el.wskip.onclick = skip;
    const step = async (ms, cls) => { if (cls) w.classList.add(cls); const end = Date.now() + (this.reduced ? 250 : ms); while (Date.now() < end && !skipped) await sleep(60); if (my !== this.token) throw new Error('cancel'); };
    try {
      await step(0, null); await step(1600, 'hsx-logo'); await step(500, 'hsx-lines'); await step(2300, 'hsx-t1'); await step(1900, 'hsx-t2'); await step(1300, null);
    } catch (e) { return false; }
    return true;
  }
  endWelcome() { this.el.welcome.className = 'hsx-welcome'; }

  /* ---- showcase UI -------------------------------------------------------------- */
  showShowcase(on) { this.el.showui.classList.toggle('hsx-show', !!on); }
  buildProjectList(projects, onSelect) {
    this.el.srlist.innerHTML = '';
    projects.forEach((p, i) => {
      const a = document.createElement('a'); a.textContent = `${p.name} — ${p.use}`; a.href = p.url || '#';
      if (p.url) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } else a.setAttribute('aria-disabled', 'true');
      a.addEventListener('focus', () => onSelect(i)); this.el.srlist.appendChild(a);
    });
  }
  setInfo(p, i, n) {
    this.el.info.querySelector('h3').textContent = p ? p.name : ''; this.el.info.querySelector('p').textContent = p ? p.use : '';
    this.el.count.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b> / ${String(n).padStart(2, '0')}`;
    this.el.open.textContent = p && p.url ? 'Open ↗' : 'Coming soon'; this.el.open.disabled = !(p && p.url) && false;
  }
  openDetail(p, i, n) {
    this.el.dno.textContent = `PROJECT ${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    this.el.dname.textContent = p.name; this.el.duse.textContent = p.use;
    if (p.url) { this.el.dgo.hidden = false; this.el.dgo.href = p.url; this.el.durl.hidden = false; this.el.durl.textContent = p.url; this.el.durl.removeAttribute('href'); }
    else { this.el.dgo.hidden = true; this.el.durl.hidden = true; }
    this.el.detail.classList.add('hsx-show'); (p.url ? this.el.dgo : this.el.dback).focus({ preventScroll: true });
  }
  closeDetail() { this.el.detail.classList.remove('hsx-show'); }
  get detailOpen() { return this.el.detail.classList.contains('hsx-show'); }

  /* ---- fallback when WebGL / modules are unavailable ---------------------------- */
  showFallback(projects, reason, onEnter) {
    const f = document.createElement('div'); f.className = 'hsx-fallback';
    f.innerHTML = `<div class="hsx-fbwrap"><h2>${esc(this.cfg.brand.toUpperCase())}</h2>
      <p>The 3D office can't run on this device${reason ? ' (' + esc(reason) + ')' : ''}. Here are the projects directly.</p>
      <div class="hsx-fbgrid"></div><button class="hsx-btn hsx-btn-primary" type="button">ENTER MAIN WEBSITE</button></div>`;
    const grid = f.querySelector('.hsx-fbgrid');
    projects.forEach((p) => { const a = document.createElement('a'); a.href = p.url || '#'; if (p.url) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } a.innerHTML = `<b>${esc(p.name)}</b><span>${esc(p.use)}</span>`; grid.appendChild(a); });
    f.querySelector('button').addEventListener('click', onEnter);
    this.root.appendChild(f); this.hideLoader(); this.setFadeInstant(false);
  }

  reset() {
    this.token += 1; clearInterval(this._typeTimer); this.hideDialog(); this.hidePrompt(); this.clearSubtitle(); this.title(false); this.hint(null);
    this.closeDetail(); this.showShowcase(false); this.endWelcome();
  }
  destroy() { this.token += 1; clearInterval(this._typeTimer); this.root.removeEventListener('keydown', this._keys); this.root.innerHTML = ''; }
}
