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
  hsx-human.js                     ← procedural human rig (sit / stand / walk / gestures), anatomy, clothing
  hsx-skin.js                      ← skin / cloth / hair-shell / eye materials (all generated in code)
  hsx-props.js, hsx-plants.js      ← detailed office equipment and plants
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
2. Just after `<body>`: `<div id="hsepid-office-intro">`, and a tiny inline script that opens the intro when the hero **Open Explore** button (`id="hsx-open"`) is clicked (if the 3D module is unavailable the button just scrolls to #explore as before). The original page loader is untouched and still plays when the site opens.
3. Before `</body>`: `<script type="module" src="hsepid-intro/hsx-main.js">`.
Nothing else was edited; your existing loader, theme system, DK AI, terminal etc. keep working.

## Your real projects
The showcase **reads your existing `projectData` array** (names, descriptions, URLs, optional `img`).
Entries with an empty `url` are merged into one "Coming Soon" card. Currently that yields 17 live projects + 1 Coming Soon.
Add/edit projects exactly where you do today. If `projectData` ever disappears, `fallbackProjects` in `hsx-config.js` is used.

## Behaviour
* Opens when the visitor clicks **Open Explore** in the hero; "Skip Intro" is always visible. Closing it scrolls to the Explore section.
  The intro never auto-starts (use `?intro=1` while testing). The site's original loader plays first, exactly as before.
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


## Using your own GLB humans (male / female pools)

1. Put `.glb` files in `hsepid-intro/assets/` (keep each under ~6 MB: resize textures to 1024 px, e.g. `npx @gltf-transform/cli optimize in.glb out.glb --texture-compress webp --texture-size 1024`).
2. In `hsx-config.js` list them under `models.male` / `models.female`. Gender comes from each character (`female: true`), models are cycled per gender, `models.<id>` overrides one person.
3. `hsx-glb.js` auto-detects facing, scales to a natural height (≈1.80 m men / 1.66 m women × the character's own scale), grounds the feet, and fills any missing animation (relaxed arms, walking, sitting, typing, waving) with a bone driver for Mixamo-style skeletons. Clips named idle/walk/sit/talk/wave/point are used when present.
4. Check each model's licence before publishing (e.g. Free3D "Personal Use" models are not for a public portfolio; Mixamo and CC0 packs are).

### Bundled characters
`assets/` contains Microsoft Rocketbox avatars (Business_Male_01–04, Business_Female_01–02, Security_Male_01), MIT licensed (see `assets/LICENSE-Rocketbox.txt`; keep that notice). They were converted from FBX to GLB with 512–1024 px textures. Phones keep the lighter built-in humans (`modelsOnMobile: false`). Set `male: []` and `female: []` in `hsx-config.js` to return to the built-in humans.
