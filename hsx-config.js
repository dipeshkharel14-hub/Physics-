/* ==========================================================================
   Hsepid.np — Interactive 3D Office Intro · CONFIGURATION
   --------------------------------------------------------------------------
   Everything you are likely to edit lives in this one file.
   ========================================================================== */

export const HSX_CONFIG = {
  /* ---- Behaviour ------------------------------------------------------- */
  autoStart: false,         // the intro opens only from the hero "Open Explore" button (add ?intro=1 to force it)
  rememberDays: 7,          // after a visitor finishes/skips, don't auto-play for N days (0 = always play)
  forceQuery: 'intro',      // ?intro=1 forces the intro, ?intro=0 disables it
  soundDefault: false,      // sound is always OFF until the visitor enables it

  /* ---- Brand ----------------------------------------------------------- */
  brand: 'Hsepid.np',
  logoUrl: '',              // e.g. './assets/hsepid-logo.png' — leave '' to use the built-in procedural logo
  tagline: 'ENTER THE WORLD OF IDEAS, PRODUCTS & IMPACT',

  /* ---- People (names appear on the 3D name plates) --------------------- */
  people: {
    muskan: { name: 'Muskan', role: 'Accountant' },
    boss:   { name: 'Dipesh Kharel', role: 'BOSS' },
    sahil:  { name: 'Sahil Lama', role: 'Manager' },
  },

  /* ---- Dialogue (all visitor-facing text) ------------------------------ */
  text: {
    muskanGreeting: 'Welcome to Hsepid.np! How can I help you today?',
    question: 'Who would you like to meet today?',
    options: {
      boss: 'Boss — Dipesh Kharel',
      manager: 'Manager — Sahil Lama',
      employee: 'An Employee',
      explore: 'Explore the Website',
    },
    muskanBoss: 'Of course — please follow me. I\'ll take you to Mr. Kharel.',
    muskanManager: 'Certainly. Let me call Sahil for you.',
    muskanEmployee: 'Sure! Let me get someone from the team.',
    muskanExplore: 'Of course! Let\'s explore Hsepid.np.',
    bossLine: 'Welcome. I\'m Dipesh Kharel. Would you like to explore my work?',
    bossButton: 'YES, LET\'S EXPLORE',
    sahilGreeting: 'Hello, welcome. Please, come with me.',
    sahilLine: 'Let\'s go. I\'ll show you what we\'re building.',
    sahilButton: 'LET\'S EXPLORE',
    employeeLine: 'Let\'s go! I\'ll show you what we do.',
    employeeButton: 'LET\'S EXPLORE',
    welcome1: 'WELCOME TO MY WORLD',
    welcome2: 'IDEAS. PRODUCTS. IMPACT.',
  },

  /* ---- Where does each route end up? -----------------------------------
     'showcase' = the project showcase (default for every route).
     The employee route is NOT sent to the boss cabin unless you set
     employeeGoesToBoss: true.                                              */
  employeeGoesToBoss: false,

  /* ---- Projects ----------------------------------------------------------
     By default the showcase READS YOUR EXISTING `projectData` array from
     index.html (window.projectData), so names, descriptions and URLs are
     never duplicated. Entries with an empty url are collapsed into one
     "Coming soon" card.
     If window.projectData does not exist, `fallbackProjects` is used.
     Fields: name, use (description), url, img (optional image URL).         */
  projectsGlobal: 'projectData',
  fallbackProjects: [
    // { name: 'My Project', use: 'What it does in one line', url: 'https://example.com', img: '' },
  ],

  /* ---- 3D libraries (loaded through the import map in index.html) ------ */
  // Documented here for reference; the import map in index.html is authoritative.
  threeVersion: '0.160.0',

  /* ---- Optional realistic GLB character models --------------------------
     Leave a url as '' to use the built-in procedural human (the default).
     If you provide a .glb it must be a skinned humanoid facing +Z, ~1.75m
     tall, with animation clips named (case-insensitive, substring match):
       idle, walk, sit (seated idle/typing), stand (sit-to-stand), talk,
       wave, point.
     See README for details. GLB support is OPTIONAL and UNTESTED without
     your real files.                                                         */
  models: {
    // Microsoft Rocketbox characters (MIT licence — see assets/LICENSE-Rocketbox.txt).
    // Leave both lists empty ([]) to go back to the built-in procedural humans.
    male:   ['./assets/man-01.glb', './assets/man-02.glb', './assets/man-03.glb', './assets/man-04.glb'],
    female: ['./assets/woman-01.glb', './assets/woman-02.glb'],
    bodyguard: './assets/security-01.glb',   // both bodyguards
    // optional per-person override — key = character id: muskan, boss, sahil, guard0, guard1, emp0 … emp9
  },
  modelsOnMobile: true,    // phones also get the real humans (set false to keep the lighter procedural ones there)
  modelsHideHairCards: true,   // hides the separate hair-card layer of Rocketbox models (hair stays painted on the head)
  modelsTint: true,        // nudge clothing colour per person so a small pool still looks varied
  modelsFaceAxis: 'auto',  // facing is detected from the hips; use 'off' to skip

  /* ---- Optional audio assets (all optional; procedural sounds are used
          when blank) ----------------------------------------------------- */
  audio: {
    ambientUrl: '',       // looping office ambience, e.g. './assets/office-ambience.mp3'
    notifyUrl: '',        // soft notification ping
  },
};
