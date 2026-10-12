# Hsepid.np — Interactive 3D Office Intro

A self-contained module that mounts on top of your existing `index.html`. Your site is untouched
(the patch to `index.html` only *adds* 3 snippets — see "What changed in index.html").

## Files
```
index.html                         ← your original file + 3 added snippets
hsepid-intro/
  hsepid-office-intro.css          ← all styles (every selector is #hsepid-office-intro / .hsx-*)
  hsx-config.js                    ← ★ everything you edit: text, names, logo, models, fallback projects
  hsx-main.js                      ← state machine, camera, input, routes, sound, lifecycle
  hsx-world.js                     ← the office (procedural geometry) + procedural logo
  hsx-human.js                     ← procedural human rig (sit / stand / walk / gestures)
  hsx-showcase.js                  ← 3D project carousel
  hsx-ui.js                        ← loader, dialogue, subtitles, welcome sequence, controls
```

## Hosting (important)
* Upload the `hsepid-intro/` folder next to `index.html` (same level). Works on Vercel / GitHub Pages / any https host.
* It uses ES modules, so it **will not run from `file://`** — use a host or `npx serve` / `python3 -m http.server`.
* Three.js r160 is loaded from jsDelivr through an import map (in `<head>`). To self-host, download
  `three@0.160.0` and change the two URLs in the import map. No other library is used (no GSAP: tweens are built in).
* If anything fails (CDN blocked, no WebGL, old browser) the visitor gets either the normal site or a plain HTML
  project list — the site is never blocked. A 15-second fail-safe in `index.html` also reveals the site.

## What changed in index.html
1. `<head>`: an import map + `<link>` to the CSS.
2. Just after `<body>`: `<div id="hsepid-office-intro">`, a small "Replay office intro" button, and a tiny inline script that decides whether to auto-start.
3. Before `</body>`: `<script type="module" src="hsepid-intro/hsx-main.js">`.
Nothing else was edited; your existing loader, theme system, DK AI, terminal etc. keep working.

## Your real projects
The showcase **reads your existing `projectData` array** (names, descriptions, URLs, optional `img`).
Entries with an empty `url` are merged into one "Coming Soon" card. Currently that yields 17 live projects + 1 Coming Soon.
Add/edit projects exactly where you do today. If `projectData` ever disappears, `fallbackProjects` in `hsx-config.js` is used.

## Behaviour
* Auto-plays on a visitor's first visit; "Skip Intro" is always visible. After finishing/skipping it won't auto-play for
  7 days (`rememberDays`). `?intro=1` forces it, `?intro=0` disables it. A floating "Replay office intro" button appears on the site.
* Routes: Boss → Muskan escorts → cabin → single button. Manager → Muskan phones Sahil → he escorts → single button.
  Employee → Muskan calls a team member → single button → walks to the exit. Explore → straight to the showcase.
  Every route ends in the same welcome sequence and project showcase. The employee route never enters the boss cabin (`employeeGoesToBoss` flag reserved).
* State machine (`ALLOWED` in `hsx-main.js`): INTRO → ENTERING_OFFICE → RECEPTION → CHOOSING_DESTINATION → {ESCORTING_TO_BOSS | CALLING_MANAGER → ESCORTING_TO_MANAGER_DESTINATION | CALLING_EMPLOYEE → EMPLOYEE_DIALOGUE | DIRECT_EXPLORATION} → WELCOME_SEQUENCE → PROJECT_COLLECTION ⇄ PROJECT_DETAIL. The current state is mirrored in `#hsepid-office-intro[data-state]`.
* Controls: drag / touch to look around (while waiting), click Muskan / doors / cabins (hover shows a blue outline + "Click to interact"), keys 1–4 pick dialogue options, ←/→/wheel/drag rotate the carousel, Esc closes a project.
* "↻ Restart" resets dialogue, camera, characters, doors and locks without reloading. Sound is OFF until enabled (procedural ambience / ping / door; optional files below).
* Respects `prefers-reduced-motion`; pauses when the tab is hidden; lowers quality automatically if frame-rate is poor; disposes all Three.js resources on exit.

## Assets
**None are required.** Everything (office, furniture, people, logo, textures, sounds) is generated in code.
Optional, all configured in `hsx-config.js`:
| Asset | Config key | Notes |
|---|---|---|
| Your logo (PNG/SVG, transparent) | `logoUrl` | Same-origin or CORS-enabled. Blank = built-in recreation of the H + mountain + wave mark. |
| Character GLBs | `models.muskan / boss / sahil / bodyguard / employee` | Skinned humanoid facing +Z, ~1.75 m, clips named idle, walk, sit, talk, wave, point (substring match). Max a few MB each. **Untested without real files.** The procedural rig still drives position/state and the GLB follows it. |
| Ambient loop / notify ping | `audio.ambientUrl`, `audio.notifyUrl` | mp3/ogg, short. |
| Project images | `img` field in `projectData` | Drawn onto the carousel cards. |
Fonts: reuses the Plus Jakarta Sans / Bebas Neue already loaded by your site.

## Testing
Desktop: open the hosted page with `?intro=1`; walk through each of the 4 options; try Restart mid-walk; open a project, "Back to collection", then "Enter Main Website".
Mobile: same on a phone (portrait + landscape); drag to look; tap options. Check reduced-motion by enabling the OS setting.
Automated: the module has a test hook (`window.HSX_TEST = {dt, noRender}` set *before* load) used for headless runs; it is inert otherwise.

## Known limits / not done
* People are procedural, stylised adult figures (jointed mannequin-like bodies with simple faces) — **not photoreal**. Real realism needs rigged GLB models (hook provided, untested).
* The logo was not supplied as a file, so it is redrawn procedurally from your reference image; supply `logoUrl` for pixel-exact branding.
* Verified only in headless Chromium with software WebGL (logic, routes, UI, collisions, layout). **Not tested on real GPUs, iOS Safari or Android**; real frame-rate is unmeasured.
* Muskan/Sahil/employee walking uses authored waypoints (no general path-finding): if you move furniture in `hsx-world.js`, re-check the paths in `hsx-main.js`.
* Employee-route dialogue speaker is the generic "Team member" (no named employee was specified).
