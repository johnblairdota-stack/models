/**
 * Generates the SOUND DESK artboards.
 *
 * 🚨 EVERY NUMBER HERE IS LIFTED, NOT INVENTED. The floor plan is `src/party/houseplan.js`
 * HOUSE in world metres; the room names are `src/party/captions.js` ROOM_LABEL; the seat
 * palette is `net/party/lobby.mjs` COLOURS by seat index; the tokens, radii and 60 px thumb
 * floor are `net/party/show-phone.html`'s own, and the television's are `show-tv.html`'s,
 * which are NOT the same greys. `HEAR` is `rules.js` HUNTER_SENSE.hearRange.
 *
 * 🚨 ONE CAMERA LIGHTS TWO ROOMS. `coverage.js` ROOMS_PER_CAM = 2, and the whole error curve
 * runs off `coverageFraction = 2n/6`. A first pass drew one room per camera, which quietly
 * halved the guide's sight in every artboard and made the case for the mechanic out of a
 * blindness the game does not have.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Write beside this file, never beside the shell. Run from the repo root once, this scattered
   eight artboards across web-prototype/ that then had to be diffed one by one to prove none of
   them was the newer copy. */
const HERE = dirname(fileURLToPath(import.meta.url));
const out = (f, s) => writeFileSync(resolve(HERE, f), s);

const HOUSE = [
  { id: 'gallery',  x0: -13.6, x1: 13.6, z0: -31.0, z1: -24.3, label: 'THE LONG GALLERY' },
  { id: 'study_w',  x0: -13.6, x1: -2.0, z0: -24.0, z1: -8.6,  label: 'THE WEST STUDY' },
  { id: 'service',  x0: -1.7,  x1: 1.7,  z0: -24.0, z1: -8.6,  label: 'THE SERVICE PASSAGE' },
  { id: 'study_e',  x0: 2.0,   x1: 13.6, z0: -24.0, z1: -8.6,  label: 'THE EAST STUDY' },
  { id: 'ballroom', x0: -13.6, x1: 13.6, z0: -8.3,  z1: 7.0,   label: 'THE BALLROOM' },
  { id: 'chapel',   x0: 4.2,   x1: 11.0, z0: -37.8, z1: -31.3, label: 'THE CHAPEL' },
];
const HEAR = 14;
/** lobby.mjs COLOURS, by seat index. */
const SEAT = ['#e4483a', '#3aa0e4', '#4cc27a', '#e0b23c', '#a765d8', '#e07ab4', '#48c9c0', '#d9dde3'];
const INK = '#f2f4f8', DIM = '#8b93a3', BG = '#0b0d12', PANEL = '#161b25', EDGE = '#262d3d';
const TV_PANEL = '#141821', TV_EDGE = '#232937';
const LIVE = '#4cc27a', GONE = '#e4483a', WARN = '#e0b23c';
const PLAN_BG = '#0d1017', ROOM = '#161b25', ROOM_LIT = '#202a38', WALL = '#2a3244';
const RUNNER_C = SEAT[1];              // ROO holds seat 2
const F = 'ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif';

/**
 * One floor plan. Draw order matters: the band goes UNDER the room names so a bearing reading
 * cannot swallow the label of the room it is pointing at, and the marks go over both because
 * they carry their own halo.
 */
function plan({ lit = [], runner = null, marks = [], arcs = [], h = 340, dim = false, bare = false }) {
  const rooms = HOUSE.map((r) => {
    const on = !bare && lit.includes(r.id);
    return `      <rect x="${r.x0}" y="${r.z0}" width="${(r.x1 - r.x0).toFixed(1)}" height="${(r.z1 - r.z0).toFixed(1)}" `
      + `fill="${on ? ROOM_LIT : ROOM}" stroke="${on ? '#3a465c' : WALL}" stroke-width="1" vector-effect="non-scaling-stroke" />`;
  }).join('\n');
  const cams = bare ? '' : HOUSE.filter((r) => lit.includes(r.id)).map((r) => {
    const x = r.x1 - 1.5, y = r.z0 + 1.4, reach = Math.min(3.4, (r.x1 - r.x0) * 0.4);
    return `      <g>
        <path d="M ${x} ${y} L ${(x - reach).toFixed(1)} ${(y + 2.4).toFixed(1)} L ${(x - reach).toFixed(1)} ${(y - 1.2).toFixed(1)} Z" fill="#7c8aa3" opacity="0.16" />
        <circle cx="${x}" cy="${y}" r="0.62" fill="#7c8aa3" />
      </g>`;
  }).join('\n');
  const names = bare ? '' : HOUSE.map((r) => {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, vert = r.id === 'service';
    return `      <text x="${cx}" y="${cz.toFixed(1)}" fill="${lit.includes(r.id) ? DIM : '#4a536a'}" font-family="${F}" `
      + `font-size="${vert ? 1.0 : 1.25}" font-weight="600" letter-spacing="0.06" text-anchor="middle" dominant-baseline="middle" `
      + `paint-order="stroke" stroke="${PLAN_BG}" stroke-width="0.5" stroke-linejoin="round"`
      + `${vert ? ` transform="rotate(-90 ${cx} ${cz.toFixed(1)})"` : ''}>${r.label}</text>`;
  }).join('\n');
  // The ring is how loud (loudness x hearRange). It routinely runs off the plan — a 1.25 breach
  // carries 17.5 m and the house is 27 m wide — so the carry is ALSO written next to the label,
  // or the primary encoding is unreadable in exactly the loud cases that matter.
  const carry = (loud) => `${Math.round(loud * HEAR)}${' '}m`;
  const sound = marks.map((m) => `      <g>
        <circle cx="${m.x}" cy="${m.z}" r="${(m.loud * HEAR).toFixed(1)}" fill="none" stroke="${WARN}" stroke-width="1.25" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" opacity="0.5" />
        <circle cx="${m.x}" cy="${m.z}" r="${(m.loud * HEAR * 0.46).toFixed(1)}" fill="none" stroke="${WARN}" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0.32" />
        <circle cx="${m.x}" cy="${m.z}" r="0.85" fill="${WARN}" />
        <text x="${m.x + 1.5}" y="${m.z - 0.8}" fill="${WARN}" font-family="${F}" font-size="1.45" font-weight="700" letter-spacing="0.1" paint-order="stroke" stroke="${PLAN_BG}" stroke-width="0.8" stroke-linejoin="round">${m.kind} · ${carry(m.loud)}</text>
      </g>`).join('\n');
  const band = arcs.map((a) => {
    const p = (deg, r) => [(a.x + Math.sin(deg * Math.PI / 180) * r).toFixed(2), (a.z - Math.cos(deg * Math.PI / 180) * r).toFixed(2)];
    const [ax, az] = p(a.from, a.r0), [bx, bz] = p(a.to, a.r0);
    const [cx, cz] = p(a.to, a.r1), [dx, dz] = p(a.from, a.r1);
    return `      <path d="M ${ax} ${az} A ${a.r0} ${a.r0} 0 0 1 ${bx} ${bz} L ${cx} ${cz} A ${a.r1} ${a.r1} 0 0 0 ${dx} ${dz} Z"
        fill="${WARN}" fill-opacity="0.14" stroke="${WARN}" stroke-width="1.25" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" opacity="0.72" />`;
  }).join('\n');
  const bandLabel = arcs.map((a) => `      <text x="${a.lx}" y="${a.lz}" fill="${WARN}" font-family="${F}" font-size="1.45" font-weight="700" letter-spacing="0.1" text-anchor="middle" paint-order="stroke" stroke="${PLAN_BG}" stroke-width="0.8" stroke-linejoin="round">${a.kind} · ${carry(a.loud)}</text>`).join('\n');
  const you = runner ? `      <g>
        <circle cx="${runner.x}" cy="${runner.z}" r="2.6" fill="${RUNNER_C}" fill-opacity="0.12" />
        <path d="M 0 -1.5 L 1.15 1.15 L 0 0.5 L -1.15 1.15 Z" fill="${RUNNER_C}" transform="translate(${runner.x} ${runner.z}) rotate(${runner.heading})" />
      </g>` : '';
  return `<svg viewBox="-14.8 -39.0 29.6 47.2" width="100%" height="${h}" preserveAspectRatio="xMidYMid meet" style="display:block;flex:none;background:${PLAN_BG};border-radius:12px">
      <g${dim ? ' opacity="0.42"' : ''}>
${rooms}
${cams}
${band}
${names}
${bandLabel}
${sound}
      </g>
${you}
    </svg>`;
}

/** `show-phone.html`'s status bar: swatch, name, connection state, round-trip. Not a role. */
const bar = (name, colour) => `  <div style="display:flex;align-items:center;gap:10px;font:400 13px/1.45 ${F};letter-spacing:.1em;color:${DIM};text-transform:uppercase;font-variant-numeric:tabular-nums">
    <span style="width:14px;height:14px;border-radius:50%;flex:none;background:${colour}"></span>
    <span style="color:${INK};font-weight:700;text-transform:none;letter-spacing:0;font-size:15px">${name}</span>
    <span>connected</span><span style="margin-left:auto">28ms</span>
  </div>`;

/** The clock is whole seconds with an s — `show-phone.html` `Math.ceil(...) + 's'`. */
const phase = (t) => `  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
    <h2 style="font:700 22px/1 ${F};letter-spacing:.1em;text-transform:uppercase;margin:0">Expedition</h2>
    <span style="font:700 22px/1 ui-monospace,Menlo,monospace;color:${WARN};font-variant-numeric:tabular-nums">${t}</span>
  </div>`;

/** SAY.EXPEDITION for a guide, verbatim from show-phone.html. */
const sayCard = (text) => `  <div style="background:${PANEL};border:1px solid ${EDGE};border-radius:16px;padding:16px">
    <div style="color:${DIM};font:400 15px/1.5 ${F}">${text}</div>
  </div>`;

const callButtons = `  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <button style="min-height:76px;border:0;border-radius:14px;background:${LIVE};color:#06170d;font:700 22px/1 ${F};letter-spacing:.08em;display:flex;align-items:center;justify-content:center;width:100%">CLEAR</button>
    <button style="min-height:76px;border:0;border-radius:14px;background:${WARN};color:#171203;font:700 22px/1 ${F};letter-spacing:.08em;display:flex;align-items:center;justify-content:center;width:100%">HOLD</button>
  </div>`;

const roleTab = `  <button style="width:100%;min-height:60px;border-radius:14px;background:${PANEL};color:${INK};border:1px solid ${EDGE};font:600 18px/1.2 ${F};padding:12px;display:flex;align-items:center;gap:10px;justify-content:flex-start;text-align:left">
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="${DIM}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="2.5" width="13" height="15" rx="2"/><path d="M7 7h6M7 10.5h6"/></svg>
    <span>Your card — hold to read</span>
  </button>`;

/** The desk. The gain toggle clears the page's own 60 px thumb floor — it is a real control. */
function desk({ gain, read, sub, readColour = INK, ...planOpts }) {
  const seg = (k) => `<span style="display:grid;place-items:center;padding:0 12px;white-space:nowrap;font:700 15px/1 ${F};letter-spacing:.1em;`
    + `background:${gain === k ? WARN : 'transparent'};color:${gain === k ? '#171203' : DIM}">${k}</span>`;
  return `  <div style="background:${PANEL};border:1px solid ${EDGE};border-radius:16px;padding:16px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <h3 style="font:600 12px/1.2 ${F};letter-spacing:.16em;text-transform:uppercase;color:${DIM};margin:0;flex:1;min-width:0">The house heard</h3>
      <div style="margin-left:auto;flex:none;display:flex;border:1px solid ${EDGE};border-radius:12px;overflow:hidden;height:60px">${seg('NEAR')}${seg('WIDE')}</div>
    </div>
${plan(planOpts)}
    <div style="font:700 22px/1.25 ${F};color:${readColour};margin-top:14px;letter-spacing:.02em">${read}</div>
    <div style="color:${DIM};font:400 13px/1.45 ${F};margin-top:8px">${sub}</div>
  </div>`;
}

const RESET = `    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; background: ${BG}; font-family: ${F}; }
    a { color: ${WARN}; } a:hover { color: #f0cf6a; }
    button { font-family: inherit; -webkit-tap-highlight-color: transparent; cursor: default; }`;

const page = (w, h, inner, font = `400 17px/1.45 ${F}`, extra = '') => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
${RESET}
  </style>
</helmet>
<div style="box-sizing:border-box;width:${w}px;height:${h}px;background:${BG};color:${INK};display:flex;flex-direction:column;gap:14px;padding:14px;font:${font}${extra}">
${inner}
</div>
</x-dc>
</body>
</html>
`;
const phone = (inner) => page(390, 844, inner);

// ------------------------------------------------------------------ the artboards
// Coverage is 2 rooms per camera. One camera = two lit rooms; two cameras = four.

const W = out;
const CAM1 = ['study_e', 'service'];
const CAM2 = ['study_e', 'service', 'gallery', 'chapel'];

/* MAIN — one camera. The step inside coverage is placed; the door outside it is not. */
W('Main.dc.html', phone([
  bar('ALI', SEAT[2]),
  phase('52s'),
  desk({
    gain: 'NEAR', lit: CAM1,
    runner: { x: 6.5, z: -14.0, heading: 340 },
    marks: [{ x: 9.4, z: -19.6, loud: 0.55, kind: 'STEP' }],
    arcs: [{ x: 6.5, z: -14.0, from: -58, to: -30, r0: 16.5, r1: 18.5, lx: -5.7, lz: -26.6, loud: 0.60, kind: 'DOOR' }],
    read: 'STEPS — THE EAST STUDY, 6 m',
    sub: 'The camera puts that step on the metre. The door ahead has no camera under it — bearing and range, no name.',
    readColour: WARN,
  }),
  callButtons,
  roleTab,
].join('\n')));

/* BEFORE — today, reproduced. The map is `drawMap`'s: aspect 4/3, every room the same grey,
   no names, no camera, no lit shade. That letterboxing is the shipped bug, not a drawing error. */
W('Before.dc.html', phone([
  bar('ALI', SEAT[2]),
  phase('52s'),
  sayCard('You can see what the cameras can see. Tell them.'),
  `  <div style="background:${PANEL};border:1px solid ${EDGE};border-radius:16px;padding:16px">
    <h3 style="font:600 12px/1 ${F};letter-spacing:.2em;text-transform:uppercase;color:${DIM};margin:0 0 12px">Your cameras</h3>
${plan({ bare: true, h: 248 })}
    <div style="font:700 26px/1 ${F};color:${DIM};margin-top:10px">NO SIGNAL</div>
    <div style="color:${DIM};font:400 13px/1.45 ${F};margin-top:10px">Nothing on the east study. That is not the same as empty.</div>
  </div>`,
  callButtons,
  `  <div><button style="width:100%;min-height:60px;border:0;border-radius:14px;background:${GONE};color:#1a0605;font:600 18px/1.2 ${F};padding:12px;display:flex;align-items:center;text-align:left">Refuse the chair</button>
    <div style="color:${DIM};font:400 13px/1.45 ${F};margin-top:10px">Once a game. Everyone is told it was you.</div></div>`,
  roleTab,
].join('\n')));

/* AMBIGUOUS — outside coverage. Bearing and range, spanning two rooms, carrying no name. */
W('Ambiguous.dc.html', phone([
  bar('ALI', SEAT[2]),
  phase('41s'),
  desk({
    gain: 'NEAR', lit: ['ballroom', 'chapel'],
    runner: { x: -4.0, z: -3.0, heading: 0 },
    arcs: [{ x: -4.0, z: -3.0, from: -22, to: 14, r0: 15.5, r1: 21.0, lx: -5.3, lz: -20.8, loud: 1.25, kind: 'CRASH' }],
    read: 'CRASH — TWO ROOMS, AHEAD',
    sub: 'No camera up there. That band is the west study and the service passage, and it does not choose between them.',
    readColour: WARN,
  }),
  callButtons,
  roleTab,
].join('\n')));

/* MASKED — the runner is at RUN and the guide is deaf. Honest error, and a spoken verb. */
W('Masked.dc.html', phone([
  bar('ALI', SEAT[2]),
  phase('29s'),
  desk({
    gain: 'NEAR', lit: CAM1, dim: true,
    runner: { x: 7.2, z: -20.5, heading: 355 },
    read: 'YOUR RUNNER — TOO LOUD',
    sub: 'She is at RUN, so everything under her own noise is gone. Say it out loud: “stop moving, I can’t hear.”',
    readColour: GONE,
  }),
  callButtons,
  roleTab,
].join('\n')));

/* SILENT — the floor. A Hunter that has noticed you stops dead and makes no sound at all. */
W('Silent.dc.html', phone([
  bar('ALI', SEAT[2]),
  phase('18s'),
  desk({
    gain: 'NEAR', lit: CAM2,
    runner: { x: 5.0, z: -22.0, heading: 350 },
    read: 'QUIET',
    sub: 'Four rooms covered, nothing above the floor in any of them. A house with nobody in it reads exactly like a Hunter that has stopped to listen.',
    readColour: DIM,
  }),
  callButtons,
  roleTab,
].join('\n')));

/* WIDE — the whole house, floor at 0.90. Same second as TV.dc.html. */
W('Wide.dc.html', phone([
  bar('ALI', SEAT[2]),
  phase('64s'),
  desk({
    gain: 'WIDE', lit: CAM2,
    runner: { x: 6.5, z: -11.0, heading: 0 },
    marks: [{ x: -8.4, z: -27.6, loud: 1.25, kind: 'CRASH' }],
    read: 'CRASH — THE LONG GALLERY',
    sub: 'The whole house, floor at 0.90 — a panel coming in gets through and nothing quieter does, your own runner included.',
    readColour: WARN,
  }),
  callButtons,
  roleTab,
].join('\n')));

/* TV — the same second as Wide.dc.html, on the television. show-tv.html's own greys, its
   crewline, its glyph-bearing seat tags, and captions.js LOWER_THIRD.noise verbatim. */
const SEATS = [
  { n: 'VIC', tag: '' }, { n: 'ROO', tag: '▶ RUNNER' }, { n: 'ALI', tag: '◉ GUIDE' }, { n: 'BEX', tag: '' },
  { n: 'DOM', tag: '' }, { n: 'FEN', tag: '' }, { n: 'GUS', tag: '' }, { n: 'HAL', tag: '' },
];
const ring = SEATS.map((s, i) => {
  const a = (i / SEATS.length) * Math.PI * 2 - Math.PI / 2;
  return `      <div style="position:absolute;left:${(50 + Math.cos(a) * 39).toFixed(1)}%;top:${(46 + Math.sin(a) * 33).toFixed(1)}%;transform:translate(-50%,-50%);text-align:center;width:150px">
        <div style="width:40px;height:40px;border-radius:50%;margin:0 auto 6px;background:${SEAT[i]};display:grid;place-items:center;font:700 15px/1 ${F};color:#0b0d12">${i + 1}</div>
        <div style="font:600 20px/1.1 ${F};white-space:nowrap">${s.n}</div>
        <div style="font:600 11px/1.3 ${F};letter-spacing:.18em;text-transform:uppercase;color:${s.tag ? WARN : DIM};min-height:1.3em">${s.tag}</div>
      </div>`;
}).join('\n');

W('TV.dc.html', `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
${RESET}
  </style>
</helmet>
<div style="box-sizing:border-box;width:1280px;height:720px;background:${BG};color:${INK};display:grid;grid-template-rows:auto 1fr auto;gap:14px;padding:26px;font:400 16px/1.4 ${F};position:relative;overflow:hidden">
  <header style="display:flex;align-items:center;justify-content:space-between;gap:20px">
    <span style="font:600 16px/1 ${F};letter-spacing:.26em;color:${DIM};text-transform:uppercase">Episode 2</span>
    <span style="font:700 44px/1 ${F};letter-spacing:.08em;text-transform:uppercase">Expedition</span>
    <span style="display:flex;align-items:center;gap:14px">
      <svg width="58" height="58" viewBox="0 0 58 58" style="transform:rotate(-90deg)">
        <circle cx="29" cy="29" r="25" fill="none" stroke="${TV_EDGE}" stroke-width="7" />
        <circle cx="29" cy="29" r="25" fill="none" stroke="${WARN}" stroke-width="7" stroke-linecap="round" stroke-dasharray="157" stroke-dashoffset="45" />
      </svg>
      <b style="font:700 44px/1 ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums">64s</b>
    </span>
  </header>
  <main style="position:relative;min-height:0">
${ring}
    <div style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);text-align:center;width:440px;display:flex;flex-direction:column;gap:10px">
      <div style="font:700 36px/1.1 ${F}">Into the east study.</div>
      <div style="font:400 17px/1.4 ${F};color:${DIM}">Ali is watching the cameras.</div>
    </div>
  </main>
  <footer style="display:flex;align-items:center;justify-content:space-between;gap:20px;font:600 14px/1 ${F};letter-spacing:.16em;text-transform:uppercase;color:${DIM}">
    <span>Cameras <b style="color:${INK}">2/3</b>
      <span style="display:inline-flex;gap:6px;vertical-align:middle;margin-left:.6em">
        <span style="width:12px;height:12px;border-radius:3px;background:${LIVE}"></span>
        <span style="width:12px;height:12px;border-radius:3px;background:${LIVE}"></span>
        <span style="width:12px;height:12px;border-radius:3px;background:${TV_EDGE}"></span>
      </span>
    </span>
    <span>Incidents <b style="color:${INK}">4</b></span>
    <span>Roo runs · Ali guides</span>
    <span>Live</span>
  </footer>
  <div style="position:absolute;left:0;right:0;bottom:58px;display:flex;justify-content:center;pointer-events:none">
    <div style="background:rgba(11,13,18,.86);border-left:5px solid ${WARN};padding:16px 30px;font:700 38px/1 ${F};letter-spacing:.06em;color:${INK}">LOUD CRASH — THE LONG GALLERY</div>
  </div>
</div>
</x-dc>
</body>
</html>
`);

/* LEGEND — the reading key, and the one table that decides the whole tuning. */
const DETENTS = [
  ['STILL', '0.00', 'Everything, down to the floor at 0.03.', LIVE],
  ['CREEP', '0.17', 'Footfalls and blows. Most of the game.', LIVE],
  ['WALK', '0.49', 'Footfalls, in the instant they land — gone to decay inside 0.3 s.', WARN],
  ['RUN', '1.00', 'Nothing but a breach less than half a second old.', GONE],
];
W('Legend.dc.html', `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
${RESET}
  </style>
</helmet>
<div style="box-sizing:border-box;width:720px;height:760px;background:${BG};color:${INK};padding:30px;font:400 16px/1.45 ${F};display:flex;flex-direction:column;gap:24px">
  <div>
    <h3 style="font:600 12px/1 ${F};letter-spacing:.2em;text-transform:uppercase;color:${DIM};margin:0 0 6px">Reading the desk</h3>
    <div style="font:400 16px/1.45 ${F};color:${DIM}">Two encodings, independent. <b style="color:${WARN}">How loud</b> — the ring, and the metres beside the label: loudness × 14 m, the range the Hunter itself hears at. <b style="color:${WARN}">How well you know where</b> — a dot on the metre with the room's name inside camera coverage, a band of bearing and range outside it. A room with a camera sits a shade lighter and carries a lens; one camera lights two rooms.</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div style="background:${PANEL};border:1px solid ${EDGE};border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px">
      <svg viewBox="-11 -11 22 22" width="100%" height="150" style="display:block;background:${PLAN_BG};border-radius:10px">
        <circle cx="0" cy="0" r="7.7" fill="none" stroke="${WARN}" stroke-width="1.25" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" opacity="0.5" />
        <circle cx="0" cy="0" r="3.5" fill="none" stroke="${WARN}" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0.32" />
        <circle cx="0" cy="0" r="0.85" fill="${WARN}" />
        <text x="1.5" y="-0.8" fill="${WARN}" font-family="${F}" font-size="1.45" font-weight="700" letter-spacing="0.1" paint-order="stroke" stroke="${PLAN_BG}" stroke-width="0.8" stroke-linejoin="round">STEP · 8 m</text>
        <text x="0" y="9.4" fill="${DIM}" font-family="${F}" font-size="1.25" font-weight="600" letter-spacing="0.06" text-anchor="middle">THE EAST STUDY</text>
      </svg>
      <div style="font:700 17px/1.2 ${F}">Placed</div>
      <div style="font:400 14px/1.4 ${F};color:${DIM}">A camera has that room. The mark sits on the metre and carries the room's name.</div>
    </div>
    <div style="background:${PANEL};border:1px solid ${EDGE};border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px">
      <svg viewBox="-11 -11 22 22" width="100%" height="150" style="display:block;background:${PLAN_BG};border-radius:10px">
        <path d="M -2.01 -6.18 A 6.5 6.5 0 0 1 2.01 -6.18 L 2.94 -9.03 A 9.5 9.5 0 0 0 -2.94 -9.03 Z" fill="${WARN}" fill-opacity="0.14" stroke="${WARN}" stroke-width="1.25" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" opacity="0.72" transform="translate(0 5.5)" />
        <text x="0" y="-4.9" fill="${WARN}" font-family="${F}" font-size="1.45" font-weight="700" letter-spacing="0.1" text-anchor="middle" paint-order="stroke" stroke="${PLAN_BG}" stroke-width="0.8" stroke-linejoin="round">CRASH · 18 m</text>
        <path d="M 0 -1.5 L 1.15 1.15 L 0 0.5 L -1.15 1.15 Z" fill="${RUNNER_C}" transform="translate(0 5.5)" />
      </svg>
      <div style="font:700 17px/1.2 ${F}">Bearing only</div>
      <div style="font:400 14px/1.4 ${F};color:${DIM}">No camera. A band across the plan, usually two rooms wide, carrying no name — but still carrying how loud it was.</div>
    </div>
  </div>
  <div>
    <h3 style="font:600 12px/1 ${F};letter-spacing:.2em;text-transform:uppercase;color:${DIM};margin:0 0 12px">The throttle is the guide's noise floor</h3>
    <div style="display:flex;flex-direction:column;gap:8px">
${DETENTS.map(([n, v, s, c]) => `      <div style="display:flex;align-items:center;gap:14px;background:${PANEL};border:1px solid ${EDGE};border-radius:12px;padding:12px 14px">
        <span style="width:66px;font:700 16px/1 ${F};letter-spacing:.1em;color:${c}">${n}</span>
        <span style="width:46px;font:600 15px/1 ui-monospace,Menlo,monospace;color:${DIM};font-variant-numeric:tabular-nums">${v}</span>
        <span style="font:400 14px/1.35 ${F};color:${DIM};flex:1">${s}</span>
      </div>`).join('\n')}
    </div>
  </div>
</div>
</x-dc>
</body>
</html>
`);
