/**
 * Generates the SOUND DESK artboards. Every colour, radius and thumb target is lifted from
 * `net/party/show-phone.html`; the floor plan is `src/party/houseplan.js` HOUSE verbatim, in
 * world metres, so the map cannot drift from the house the runner walks through.
 */
import { writeFileSync } from 'node:fs';

const HOUSE = [
  { id: 'gallery',  x0: -13.6, x1: 13.6, z0: -31.0, z1: -24.3, label: 'LONG GALLERY' },
  { id: 'study_w',  x0: -13.6, x1: -2.0, z0: -24.0, z1: -8.6,  label: 'WEST STUDY' },
  { id: 'service',  x0: -1.7,  x1: 1.7,  z0: -24.0, z1: -8.6,  label: 'SERVICE' },
  { id: 'study_e',  x0: 2.0,   x1: 13.6, z0: -24.0, z1: -8.6,  label: 'EAST STUDY' },
  { id: 'ballroom', x0: -13.6, x1: 13.6, z0: -8.3,  z1: 7.0,   label: 'BALLROOM' },
  { id: 'chapel',   x0: 4.2,   x1: 11.0, z0: -37.8, z1: -31.3, label: 'CHAPEL' },
];
const HEAR = 14;              // rules.js HUNTER_SENSE.hearRange — 1.0 gunshot carries 14 m
const INK = '#f2f4f8', DIM = '#8b93a3', BG = '#0b0d12', PANEL = '#161b25', EDGE = '#262d3d';
const LIVE = '#4cc27a', GONE = '#e4483a', WARN = '#e0b23c';
const PLAN_BG = '#0d1017', ROOM = '#161b25', ROOM_LIT = '#202a38', WALL = '#2a3244';
const F = 'ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif';

/** One floor plan, in world metres, with whatever the guide's ears put on it. */
function plan({ lit = [], runner = null, marks = [], arcs = [], h = 356, dim = false }) {
  const rooms = HOUSE.map((r) => {
    const on = lit.includes(r.id);
    return `      <rect x="${r.x0}" y="${r.z0}" width="${(r.x1 - r.x0).toFixed(1)}" height="${(r.z1 - r.z0).toFixed(1)}" `
      + `fill="${on ? ROOM_LIT : ROOM}" stroke="${on ? '#3a465c' : WALL}" stroke-width="1" vector-effect="non-scaling-stroke" />`;
  }).join('\n');
  const cams = HOUSE.filter((r) => lit.includes(r.id)).map((r) => {
    const x = r.x1 - 1.5, y = r.z0 + 1.4, into = r.x1 - r.x0 > 6 ? -1 : -1;
    return `      <g>
        <path d="M ${x} ${y} L ${(x + into * 3.4).toFixed(1)} ${(y + 2.4).toFixed(1)} L ${(x + into * 3.4).toFixed(1)} ${(y - 1.2).toFixed(1)} Z" fill="#7c8aa3" opacity="0.16" />
        <circle cx="${x}" cy="${y}" r="0.62" fill="#7c8aa3" />
      </g>`;
  }).join('\n');
  const names = HOUSE.map((r) => {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const vert = r.id === 'service';
    return `      <text x="${cx}" y="${cz.toFixed(1)}" fill="${lit.includes(r.id) ? DIM : '#4a536a'}" font-family="${F}" `
      + `font-size="${vert ? 1.0 : 1.25}" font-weight="600" letter-spacing="0.06" text-anchor="middle" dominant-baseline="middle" `
      + `paint-order="stroke" stroke="${PLAN_BG}" stroke-width="0.5" stroke-linejoin="round"`
      + `${vert ? ` transform="rotate(-90 ${cx} ${cz.toFixed(1)})"` : ''}>${r.label}</text>`;
  }).join('\n');
  // Sound marks. The ring is HOW LOUD (loudness x hearRange); the core is HOW PRECISE.
  const sound = marks.map((m) => {
    const rr = (m.loud * HEAR).toFixed(1);
    const o = m.age ? Math.max(0.12, 1 - m.age).toFixed(2) : 1;
    return `      <g opacity="${o}">
        <circle cx="${m.x}" cy="${m.z}" r="${rr}" fill="none" stroke="${WARN}" stroke-width="1.25" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" opacity="0.5" />
        <circle cx="${m.x}" cy="${m.z}" r="${(m.loud * HEAR * 0.46).toFixed(1)}" fill="none" stroke="${WARN}" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0.32" />
        <circle cx="${m.x}" cy="${m.z}" r="0.85" fill="${WARN}" />
        <text x="${m.x + 1.5}" y="${m.z - 0.8}" fill="${WARN}" font-family="${F}" font-size="1.45" font-weight="700" letter-spacing="0.1" paint-order="stroke" stroke="${PLAN_BG}" stroke-width="0.7" stroke-linejoin="round">${m.kind}</text>
      </g>`;
  }).join('\n');
  // The uncovered reading: a band of bearing and range, spanning rooms, carrying no name.
  const band = arcs.map((a) => {
    const p = (deg, r) => [(a.x + Math.sin(deg * Math.PI / 180) * r).toFixed(2), (a.z - Math.cos(deg * Math.PI / 180) * r).toFixed(2)];
    const [ax, az] = p(a.from, a.r0), [bx, bz] = p(a.to, a.r0);
    const [cx, cz] = p(a.to, a.r1), [dx, dz] = p(a.from, a.r1);
    return `      <path d="M ${ax} ${az} A ${a.r0} ${a.r0} 0 0 1 ${bx} ${bz} L ${cx} ${cz} A ${a.r1} ${a.r1} 0 0 0 ${dx} ${dz} Z"
        fill="${WARN}" fill-opacity="0.14" stroke="${WARN}" stroke-width="1.25" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" opacity="0.72" />
      <text x="${a.lx}" y="${a.lz}" fill="${WARN}" font-family="${F}" font-size="1.45" font-weight="700" letter-spacing="0.1" text-anchor="middle" paint-order="stroke" stroke="${PLAN_BG}" stroke-width="0.7" stroke-linejoin="round">${a.kind}</text>`;
  }).join('\n');
  const you = runner ? `      <g>
        <circle cx="${runner.x}" cy="${runner.z}" r="2.6" fill="${LIVE}" fill-opacity="0.1" />
        <path d="M 0 -1.5 L 1.15 1.15 L 0 0.5 L -1.15 1.15 Z" fill="${LIVE}" transform="translate(${runner.x} ${runner.z}) rotate(${runner.heading})" />
      </g>` : '';
  return `<svg viewBox="-14.8 -39.0 29.6 47.2" width="100%" height="${h}" preserveAspectRatio="xMidYMid meet" style="display:block;flex:none;background:${PLAN_BG};border-radius:12px">
      <g${dim ? ' opacity="0.42"' : ''}>
${rooms}
${cams}
${names}
${band}
${sound}
      </g>
${you}
    </svg>`;
}

const bar = (name, colour, right) => `  <div style="display:flex;align-items:center;gap:10px;font:400 13px/1.45 ${F};letter-spacing:.1em;color:${DIM};text-transform:uppercase;font-variant-numeric:tabular-nums">
    <span style="width:14px;height:14px;border-radius:50%;flex:none;background:${colour}"></span>
    <span style="color:${INK};font-weight:700;text-transform:none;letter-spacing:0;font-size:15px">${name}</span>
    <span>guide</span><span style="margin-left:auto">${right}</span>
  </div>`;

const phase = (t) => `  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
    <h2 style="font:700 22px/1 ${F};letter-spacing:.1em;text-transform:uppercase;margin:0">Expedition</h2>
    <span style="font:700 22px/1 ui-monospace,Menlo,monospace;color:${WARN};font-variant-numeric:tabular-nums">${t}</span>
  </div>`;

const callButtons = `  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <button style="min-height:76px;border:0;border-radius:14px;background:${LIVE};color:#06170d;font:700 22px/1 ${F};letter-spacing:.08em;display:flex;align-items:center;justify-content:center;width:100%">CLEAR</button>
    <button style="min-height:76px;border:0;border-radius:14px;background:${WARN};color:#171203;font:700 22px/1 ${F};letter-spacing:.08em;display:flex;align-items:center;justify-content:center;width:100%">HOLD</button>
  </div>`;

const roleTab = `  <button style="width:100%;min-height:60px;border-radius:14px;background:${PANEL};color:${INK};border:1px solid ${EDGE};font:600 18px/1.2 ${F};padding:12px;display:flex;align-items:center;gap:10px;justify-content:flex-start;text-align:left">
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="${DIM}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="2.5" width="13" height="15" rx="2"/><path d="M7 7h6M7 10.5h6"/></svg>
    <span>Your card — hold to read</span>
  </button>`;

/** The card the whole screen is: plan, gain, one read line. */
function desk({ gain, read, sub, readColour = INK, ...planOpts }) {
  return `  <div style="background:${PANEL};border:1px solid ${EDGE};border-radius:16px;padding:16px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <h3 style="font:600 12px/1 ${F};letter-spacing:.2em;text-transform:uppercase;color:${DIM};margin:0;flex:1;min-width:0">What the house heard</h3>
      <div style="margin-left:auto;flex:none;display:flex;border:1px solid ${EDGE};border-radius:11px;overflow:hidden;height:44px">
        <span style="display:grid;place-items:center;padding:0 13px;white-space:nowrap;font:700 15px/1 ${F};letter-spacing:.1em;background:${gain === 'NEAR' ? WARN : 'transparent'};color:${gain === 'NEAR' ? '#171203' : DIM}">NEAR</span>
        <span style="display:grid;place-items:center;padding:0 13px;white-space:nowrap;font:700 15px/1 ${F};letter-spacing:.1em;background:${gain === 'WIDE' ? WARN : 'transparent'};color:${gain === 'WIDE' ? '#171203' : DIM}">WIDE</span>
      </div>
    </div>
${plan(planOpts)}
    <div style="font:700 22px/1.25 ${F};color:${readColour};margin-top:14px;letter-spacing:.02em">${read}</div>
    <div style="color:${DIM};font:400 13px/1.45 ${F};margin-top:8px">${sub}</div>
  </div>`;
}

function phone(title, inner) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; background: ${BG}; font-family: ${F}; }
    a { color: ${WARN}; } a:hover { color: #f0cf6a; }
    button { font-family: inherit; -webkit-tap-highlight-color: transparent; cursor: default; }
  </style>
</helmet>
<div style="box-sizing:border-box;width:390px;height:844px;background:${BG};color:${INK};display:flex;flex-direction:column;gap:14px;padding:14px;font:400 17px/1.45 ${F}">
${inner}
</div>
</x-dc>
</body>
</html>
`;
}
export { HOUSE, HEAR, INK, DIM, BG, PANEL, EDGE, LIVE, GONE, WARN, PLAN_BG, ROOM, WALL, F, plan, bar, phase, callButtons, roleTab, desk, phone, writeFileSync };

// ------------------------------------------------------------------ the artboards

const W = (f, s) => { writeFileSync(f, s); return f; };

/* MAIN — the desk working. Runner creeping into the east study, one camera lit there, so the
   step inside coverage resolves to a placed mark; a louder blow two rooms north does not. */
W('Main.dc.html', phone('Sound Desk', [
  bar('ALI', '#5aa9e6', '28 ms'),
  phase('0:52'),
  desk({
    gain: 'NEAR',
    lit: ['study_e'],
    runner: { x: 6.5, z: -14.0, heading: 340 },
    marks: [{ x: 9.4, z: -19.6, loud: 0.55, kind: 'STEP' }],
    arcs: [{ x: 6.5, z: -14.0, from: -58, to: -30, r0: 16.5, r1: 20.0, lx: -7.4, lz: -25.7, kind: 'DOOR' }],
    read: 'STEPS — EAST STUDY, 4\u00a0m NORTH',
    sub: 'The camera places that step on the metre. The door behind you is the same ear with no camera under it — bearing and range, no name.',
    readColour: WARN,
  }),
  callButtons,
  roleTab,
].join('\n')));

/* BEFORE — today, reproduced from show-phone.html:295-305 exactly. */
W('Before.dc.html', phone('No Signal', [
  bar('ALI', '#5aa9e6', '28 ms'),
  phase('0:52'),
  `  <div style="background:${PANEL};border:1px solid ${EDGE};border-radius:16px;padding:16px">
    <h3 style="font:600 12px/1 ${F};letter-spacing:.2em;text-transform:uppercase;color:${DIM};margin:0 0 12px">Your cameras</h3>
${plan({ lit: ['study_e'], h: 388 })}
    <div style="font:700 26px/1 ${F};color:${DIM};margin-top:14px">NO SIGNAL</div>
    <div style="color:${DIM};font:400 13px/1.45 ${F};margin-top:10px">Nothing on the east wing. That is not the same as empty.</div>
  </div>`,
  callButtons,
  roleTab,
].join('\n')));

/* AMBIGUOUS — outside coverage. A band of bearing and range, spanning two rooms, no name. */
W('Ambiguous.dc.html', phone('Bearing Only', [
  bar('ALI', '#5aa9e6', '28 ms'),
  phase('0:41'),
  desk({
    gain: 'NEAR',
    lit: ['ballroom'],
    runner: { x: -4.0, z: -3.0, heading: 0 },
    arcs: [{ x: -4.0, z: -3.0, from: -22, to: 14, r0: 15.5, r1: 21.0, lx: -5.3, lz: -20.8, kind: 'CRASH' }],
    read: 'CRASH — TWO ROOMS, AHEAD',
    sub: 'No camera up there. That band is the west study and the service passage, and it does not choose between them.',
    readColour: WARN,
  }),
  callButtons,
  roleTab,
].join('\n')));

/* MASKED — the runner is at RUN and the guide is deaf. The first of the two honest errors. */
W('Masked.dc.html', phone('Masked', [
  bar('ALI', '#5aa9e6', '28 ms'),
  phase('0:29'),
  desk({
    gain: 'NEAR',
    lit: ['study_e'],
    runner: { x: 7.2, z: -20.5, heading: 355 },
    dim: true,
    read: 'YOUR RUNNER — TOO LOUD',
    sub: 'She is at RUN. Only a wall coming down inside half a second clears her own noise.',
    readColour: GONE,
  }),
  `  <div style="background:${PANEL};border:1px solid ${EDGE};border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:12px">
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="${GONE}" stroke-width="1.7" stroke-linecap="round"><path d="M4 8v6h3l5 4V4L7 8H4z"/><path d="M16 7l4 8M20 7l-4 8"/></svg>
    <div style="font:600 15px/1.35 ${F};color:${INK}">Say it out loud — <b style="color:${WARN}">"stop moving, I can't hear"</b></div>
  </div>`,
  callButtons,
].join('\n')));

/* SILENT — the floor. A Hunter that has noticed you stops dead and makes no sound at all. */
W('Silent.dc.html', phone('Quiet', [
  bar('ALI', '#5aa9e6', '28 ms'),
  phase('0:18'),
  desk({
    gain: 'NEAR',
    lit: ['study_e', 'gallery'],
    runner: { x: 5.0, z: -22.0, heading: 350 },
    read: 'QUIET',
    sub: 'A house with nobody in it reads exactly like a Hunter that has stopped to listen.',
    readColour: DIM,
  }),
  callButtons,
  roleTab,
].join('\n')));

/* WIDE — the whole house, gunshots only. */
W('Wide.dc.html', phone('Wide', [
  bar('ALI', '#5aa9e6', '28 ms'),
  phase('1:04'),
  desk({
    gain: 'WIDE',
    lit: ['study_e', 'gallery'],
    runner: { x: 6.5, z: -11.0, heading: 0 },
    marks: [{ x: -8.4, z: -27.6, loud: 1.25, kind: 'SHORT' }],
    read: 'SHORT — LONG GALLERY',
    sub: 'The whole house, but only gunshots — everything under a panel going in is below the floor, your own runner included.',
    readColour: WARN,
  }),
  callButtons,
  roleTab,
].join('\n')));

/* TV — the same instant as Wide.dc.html, on the television. The point of the whole mechanic:
   the room already has this crash. broadcast §3 forbids cutting the audio, and captions.js
   ships `noise: 'LOUD CRASH — {ROOM}'` as a closed-bank lower third. */
const SEATS = [
  { n: 'VIC', c: '#e0b23c', tag: '' }, { n: 'ROO', c: '#4cc27a', tag: 'RUNNER' },
  { n: 'ALI', c: '#5aa9e6', tag: 'GUIDE' }, { n: 'BEX', c: '#c77dd6', tag: '' },
  { n: 'DOM', c: '#e4483a', tag: '' }, { n: 'FEN', c: '#5fd0c4', tag: '' },
  { n: 'GUS', c: '#e88a4a', tag: '' }, { n: 'HAL', c: '#9aa7bd', tag: '' },
];
const ring = SEATS.map((s, i) => {
  const a = (i / SEATS.length) * Math.PI * 2 - Math.PI / 2;
  const x = 50 + Math.cos(a) * 39, y = 46 + Math.sin(a) * 33;
  return `      <div style="position:absolute;left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;transform:translate(-50%,-50%);text-align:center;width:150px">
        <div style="width:40px;height:40px;border-radius:50%;margin:0 auto 6px;background:${s.c};display:grid;place-items:center;font:700 15px/1 ${F};color:#0b0d12">${i + 1}</div>
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
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; background: ${BG}; font-family: ${F}; }
    a { color: ${WARN}; } a:hover { color: #f0cf6a; }
  </style>
</helmet>
<div style="box-sizing:border-box;width:1280px;height:720px;background:${BG};color:${INK};display:grid;grid-template-rows:auto 1fr auto;gap:14px;padding:26px;font:400 16px/1.4 ${F};position:relative;overflow:hidden">
  <header style="display:flex;align-items:center;justify-content:space-between;gap:20px">
    <span style="font:600 16px/1 ${F};letter-spacing:.26em;color:${DIM};text-transform:uppercase">Episode 2</span>
    <span style="font:700 44px/1 ${F};letter-spacing:.08em;text-transform:uppercase">Expedition</span>
    <span style="display:flex;align-items:center;gap:14px">
      <b style="font:700 44px/1 ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums">1:04</b>
      <svg width="58" height="58" viewBox="0 0 58 58" style="transform:rotate(-90deg)">
        <circle cx="29" cy="29" r="25" fill="none" stroke="${EDGE}" stroke-width="7" />
        <circle cx="29" cy="29" r="25" fill="none" stroke="${WARN}" stroke-width="7" stroke-linecap="round" stroke-dasharray="157" stroke-dashoffset="45" />
      </svg>
    </span>
  </header>
  <main style="position:relative;min-height:0">
${ring}
    <div style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);text-align:center;width:440px;display:flex;flex-direction:column;gap:10px">
      <div style="font:700 36px/1.1 ${F}">Into the east wing.</div>
      <div style="font:400 17px/1.4 ${F};color:${DIM}">Ali is on the desk. Roo decides.</div>
    </div>
  </main>
  <footer style="display:flex;align-items:center;justify-content:space-between;gap:20px;font:600 14px/1 ${F};letter-spacing:.16em;text-transform:uppercase;color:${DIM}">
    <span>Cameras <b style="color:${INK}">2/3</b>
      <span style="display:inline-flex;gap:6px;vertical-align:middle;margin-left:.6em">
        <span style="width:12px;height:12px;border-radius:3px;background:${LIVE}"></span>
        <span style="width:12px;height:12px;border-radius:3px;background:${LIVE}"></span>
        <span style="width:12px;height:12px;border-radius:3px;background:${EDGE}"></span>
      </span>
    </span>
    <span>Incidents <b style="color:${INK}">4</b></span>
    <span>Production still at large</span>
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
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; background: ${BG}; font-family: ${F}; }
    a { color: ${WARN}; } a:hover { color: #f0cf6a; }
  </style>
</helmet>
<div style="box-sizing:border-box;width:720px;height:700px;background:${BG};color:${INK};padding:30px;font:400 16px/1.45 ${F};display:flex;flex-direction:column;gap:24px">
  <div>
    <h3 style="font:600 12px/1 ${F};letter-spacing:.2em;text-transform:uppercase;color:${DIM};margin:0 0 6px">Reading the desk</h3>
    <div style="font:400 16px/1.45 ${F};color:${DIM}">Two encodings, and they are independent. The <b style="color:${WARN}">ring</b> is how loud it was — loudness × 14 m, the range the Hunter itself hears at. The <b style="color:${WARN}">core</b> is how well you know where: a dot inside camera coverage, a band of bearing and range outside it. A room with a camera in it sits a shade lighter and carries a lens.</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div style="background:${PANEL};border:1px solid ${EDGE};border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px">
      <svg viewBox="-11 -11 22 22" width="100%" height="150" style="display:block;background:${PLAN_BG};border-radius:10px">
        <circle cx="0" cy="0" r="7.7" fill="none" stroke="${WARN}" stroke-width="1.25" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" opacity="0.5" />
        <circle cx="0" cy="0" r="3.5" fill="none" stroke="${WARN}" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0.32" />
        <circle cx="0" cy="0" r="0.85" fill="${WARN}" />
        <text x="1.6" y="-0.9" fill="${WARN}" font-family="${F}" font-size="1.5" font-weight="700" letter-spacing="0.14">STEP</text>
      </svg>
      <div style="font:700 17px/1.2 ${F}">Placed</div>
      <div style="font:400 14px/1.4 ${F};color:${DIM}">A camera has that room. The mark sits on the metre and carries the room's name.</div>
    </div>
    <div style="background:${PANEL};border:1px solid ${EDGE};border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px">
      <svg viewBox="-11 -11 22 22" width="100%" height="150" style="display:block;background:${PLAN_BG};border-radius:10px">
        <path d="M -5.32 -3.73 A 6.5 6.5 0 0 1 5.32 -3.73 L 7.78 -5.45 A 9.5 9.5 0 0 0 -7.78 -5.45 Z" fill="${WARN}" fill-opacity="0.14" stroke="${WARN}" stroke-width="1.25" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" opacity="0.72" transform="translate(0 5.5)" />
        <text x="0" y="-1.4" fill="${WARN}" font-family="${F}" font-size="1.45" font-weight="700" letter-spacing="0.1" text-anchor="middle" paint-order="stroke" stroke="${PLAN_BG}" stroke-width="0.7" stroke-linejoin="round">CRASH</text>
        <path d="M 0 -1.5 L 1.15 1.15 L 0 0.5 L -1.15 1.15 Z" fill="${LIVE}" transform="translate(0 5.5)" />
      </svg>
      <div style="font:700 17px/1.2 ${F}">Bearing only</div>
      <div style="font:400 14px/1.4 ${F};color:${DIM}">No camera. A band across the plan, usually two rooms wide, carrying no name at all.</div>
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
