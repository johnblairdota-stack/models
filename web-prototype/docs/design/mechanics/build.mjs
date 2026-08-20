/**
 * FOUR DESKS — the guide's screen, four ways, each with its case and its killer.
 *
 * 🚨 SAME RULE AS THE SOUND DESK CANVAS: nothing here is invented. Floor plan is
 * `src/party/houseplan.js`; room names `src/party/captions.js` ROOM_LABEL; door coordinates are
 * `src/game/spaces.js` CONNECTORS, read out with `harness/_doors_probe.mjs`; speeds and
 * thresholds are `rules.js` HUNTER_SPEED / HUNTER_SENSE; `ghost()` is `src/party/darkrun.js`;
 * tokens, radii and the 60 px thumb floor are `net/party/show-phone.html`'s.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const W = (f, s) => writeFileSync(resolve(HERE, f), s);

export const HOUSE = [
  { id: 'gallery',  x0: -13.6, x1: 13.6, z0: -31.0, z1: -24.3, label: 'THE LONG GALLERY' },
  { id: 'study_w',  x0: -13.6, x1: -2.0, z0: -24.0, z1: -8.6,  label: 'THE WEST STUDY' },
  { id: 'service',  x0: -1.7,  x1: 1.7,  z0: -24.0, z1: -8.6,  label: 'THE SERVICE PASSAGE' },
  { id: 'study_e',  x0: 2.0,   x1: 13.6, z0: -24.0, z1: -8.6,  label: 'THE EAST STUDY' },
  { id: 'ballroom', x0: -13.6, x1: 13.6, z0: -8.3,  z1: 7.0,   label: 'THE BALLROOM' },
  { id: 'chapel',   x0: 4.2,   x1: 11.0, z0: -37.8, z1: -31.3, label: 'THE CHAPEL' },
];
/** spaces.js CONNECTORS, internal thresholds only — the eight a tripwire could sit on. */
export const DOORS = [
  { id: 'D1',       x: -8.6,  z: -24.15 }, { id: 'p.gal_w', x: -12.0, z: -24.15 },
  { id: 'p.gal_e',  x: 12.0,  z: -24.15 }, { id: 'p.chapel', x: 5.6,  z: -31.15 },
  { id: 'D4',       x: -8.6,  z: -8.45 },  { id: 'p.bal_w', x: -3.6,  z: -8.45 },
  { id: 'D5',       x: 0.0,   z: -8.45 },  { id: 'D6',      x: 8.6,   z: -8.45 },
];
export const HUNTER_SPEED = [0, 2.05, 2.70, 3.35];
export const SEAT = ['#e4483a', '#3aa0e4', '#4cc27a', '#e0b23c', '#a765d8', '#e07ab4', '#48c9c0', '#d9dde3'];
export const INK = '#f2f4f8', DIM = '#8b93a3', BG = '#0b0d12', PANEL = '#161b25', EDGE = '#262d3d';
export const LIVE = '#4cc27a', GONE = '#e4483a', WARN = '#e0b23c';
export const PLAN_BG = '#0d1017', ROOM = '#161b25', ROOM_LIT = '#202a38', WALL = '#2a3244';
export const RUNNER_C = SEAT[1];
export const F = 'ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif';

/** The shared floor plan. Each mechanic hands it a different overlay. */
export function plan({ lit = [], runner = null, h = 320, overlay = '', dim = false }) {
  const rooms = HOUSE.map((r) => {
    const on = lit.includes(r.id);
    return `      <rect x="${r.x0}" y="${r.z0}" width="${(r.x1 - r.x0).toFixed(1)}" height="${(r.z1 - r.z0).toFixed(1)}" `
      + `fill="${on ? ROOM_LIT : ROOM}" stroke="${on ? '#3a465c' : WALL}" stroke-width="1" vector-effect="non-scaling-stroke" />`;
  }).join('\n');
  const names = HOUSE.map((r) => {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, vert = r.id === 'service';
    return `      <text x="${cx}" y="${cz.toFixed(1)}" fill="${lit.includes(r.id) ? DIM : '#4a536a'}" font-family="${F}" `
      + `font-size="${vert ? 1.0 : 1.25}" font-weight="600" letter-spacing="0.06" text-anchor="middle" dominant-baseline="middle" `
      + `paint-order="stroke" stroke="${PLAN_BG}" stroke-width="0.5" stroke-linejoin="round"`
      + `${vert ? ` transform="rotate(-90 ${cx} ${cz.toFixed(1)})"` : ''}>${r.label}</text>`;
  }).join('\n');
  const you = runner ? `      <g>
        <circle cx="${runner.x}" cy="${runner.z}" r="2.6" fill="${RUNNER_C}" fill-opacity="0.12" />
        <path d="M 0 -1.5 L 1.15 1.15 L 0 0.5 L -1.15 1.15 Z" fill="${RUNNER_C}" transform="translate(${runner.x} ${runner.z}) rotate(${runner.heading})" />
      </g>` : '';
  return `<svg viewBox="-14.8 -39.0 29.6 47.2" width="100%" height="${h}" preserveAspectRatio="xMidYMid meet" style="display:block;flex:none;background:${PLAN_BG};border-radius:12px">
      <g${dim ? ' opacity="0.42"' : ''}>
${rooms}
${names}
${overlay}
      </g>
${you}
    </svg>`;
}

export const label = (x, z, text, fill = WARN, size = 1.45, anchor = 'middle') =>
  `      <text x="${x}" y="${z}" fill="${fill}" font-family="${F}" font-size="${size}" font-weight="700" `
  + `letter-spacing="0.1" text-anchor="${anchor}" paint-order="stroke" stroke="${PLAN_BG}" stroke-width="0.8" stroke-linejoin="round">${text}</text>`;

/** show-phone.html's status bar and phase row, verbatim in shape. */
export const bar = (name, colour) => `  <div style="display:flex;align-items:center;gap:10px;font:400 13px/1.45 ${F};letter-spacing:.1em;color:${DIM};text-transform:uppercase;font-variant-numeric:tabular-nums">
    <span style="width:14px;height:14px;border-radius:50%;flex:none;background:${colour}"></span>
    <span style="color:${INK};font-weight:700;text-transform:none;letter-spacing:0;font-size:15px">${name}</span>
    <span>connected</span><span style="margin-left:auto">28ms</span>
  </div>`;
export const phase = (t) => `  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
    <h2 style="font:700 22px/1 ${F};letter-spacing:.1em;text-transform:uppercase;margin:0">Expedition</h2>
    <span style="font:700 22px/1 ui-monospace,Menlo,monospace;color:${WARN};font-variant-numeric:tabular-nums">${t}</span>
  </div>`;
export const twoUp = `  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <button style="min-height:76px;border:0;border-radius:14px;background:${LIVE};color:#06170d;font:700 22px/1 ${F};letter-spacing:.08em;display:flex;align-items:center;justify-content:center;width:100%">CLEAR</button>
    <button style="min-height:76px;border:0;border-radius:14px;background:${WARN};color:#171203;font:700 22px/1 ${F};letter-spacing:.08em;display:flex;align-items:center;justify-content:center;width:100%">HOLD</button>
  </div>`;
export const roleTab = `  <button style="width:100%;min-height:60px;border-radius:14px;background:${PANEL};color:${INK};border:1px solid ${EDGE};font:600 18px/1.2 ${F};padding:12px;display:flex;align-items:center;gap:10px;justify-content:flex-start;text-align:left">
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="${DIM}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="2.5" width="13" height="15" rx="2"/><path d="M7 7h6M7 10.5h6"/></svg>
    <span>Your card — hold to read</span>
  </button>`;

/** The card every mechanic's screen is: a header with the mechanic's one lever, a plan, a read. */
export function card({ title, control = '', body, read, sub, readColour = INK }) {
  return `  <div style="background:${PANEL};border:1px solid ${EDGE};border-radius:16px;padding:16px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <h3 style="font:600 12px/1.2 ${F};letter-spacing:.16em;text-transform:uppercase;color:${DIM};margin:0;flex:1;min-width:0">${title}</h3>
      ${control}
    </div>
${body}
    <div style="font:700 22px/1.25 ${F};color:${readColour};margin-top:14px;letter-spacing:.02em">${read}</div>
    <div style="color:${DIM};font:400 13px/1.45 ${F};margin-top:8px">${sub}</div>
  </div>`;
}

export const RESET = `    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; background: ${BG}; font-family: ${F}; }
    a { color: ${WARN}; } a:hover { color: #f0cf6a; }
    button { font-family: inherit; -webkit-tap-highlight-color: transparent; cursor: default; }`;

export const doc = (w, h, inner, style = '') => `<!doctype html>
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
<div style="box-sizing:border-box;width:${w}px;height:${h}px;background:${BG};color:${INK};${style}">
${inner}
</div>
</x-dc>
</body>
</html>
`;
export { W };

// ------------------------------------------------------------------ the four screens
const CAM = ['study_e', 'service'];
const HEAR = 14;
const phone = (inner) => `  <div style="box-sizing:border-box;width:390px;height:844px;background:${BG};display:flex;flex-direction:column;gap:14px;padding:14px;font:400 17px/1.45 ${F};border:1px solid ${EDGE};border-radius:20px;overflow:hidden">
${inner}
  </div>`;

/* 1 — THE SOUND DESK. Sound marks: ring = loudness x 14 m, core = how well placed. */
const deskScreen = phone([
  bar('ALI', SEAT[2]),
  phase('52s'),
  card({
    title: 'The house heard',
    control: `<div style="margin-left:auto;flex:none;display:flex;border:1px solid ${EDGE};border-radius:12px;overflow:hidden;height:60px">
        <span style="display:grid;place-items:center;padding:0 12px;white-space:nowrap;font:700 15px/1 ${F};letter-spacing:.1em;background:${WARN};color:#171203">NEAR</span>
        <span style="display:grid;place-items:center;padding:0 12px;white-space:nowrap;font:700 15px/1 ${F};letter-spacing:.1em;color:${DIM}">WIDE</span>
      </div>`,
    body: plan({
      lit: CAM, runner: { x: 6.5, z: -14.0, heading: 340 }, h: 320,
      overlay: `      <g>
        <circle cx="9.4" cy="-19.6" r="${(0.55 * HEAR).toFixed(1)}" fill="none" stroke="${WARN}" stroke-width="1.25" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" opacity="0.5" />
        <circle cx="9.4" cy="-19.6" r="0.85" fill="${WARN}" />
      </g>
      <path d="M -0.11 -29.99 A 16.5 16.5 0 0 0 -7.49 -22.74 L -9.19 -23.80 A 18.5 18.5 0 0 1 -1.10 -31.94 Z" fill="${WARN}" fill-opacity="0.14" stroke="${WARN}" stroke-width="1.25" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" opacity="0.72" />
${label(10.9, -20.4, 'STEP · 8 m', WARN, 1.45, 'start')}
${label(-5.7, -26.6, 'DOOR · 8 m')}`,
    }),
    read: 'STEPS — THE EAST STUDY, 6 m',
    sub: 'A camera puts that step on the metre. The door ahead has no camera under it — bearing and range, no name.',
    readColour: WARN,
  }),
  twoUp, roleTab,
].join('\n'));

/* 2 — THE TRIPWIRE LEDGER. Eight real thresholds from spaces.js CONNECTORS; three armed. */
const ARMED = ['D6', 'p.gal_e', 'D5'];
const doorBars = DOORS.map((d) => {
  const on = ARMED.includes(d.id);
  return `      <g>
        <rect x="${(d.x - 0.85).toFixed(2)}" y="${(d.z - 0.28).toFixed(2)}" width="1.7" height="0.56" rx="0.2"
          fill="${on ? WARN : '#39435a'}" ${on ? '' : 'fill-opacity="0.9"'} />
        ${on ? `<path d="M ${(d.x - 1.5).toFixed(2)} ${(d.z - 1.1).toFixed(2)} l 0 -0.8 l 3 0 l 0 0.8 M ${(d.x - 1.5).toFixed(2)} ${(d.z + 1.1).toFixed(2)} l 0 0.8 l 3 0 l 0 -0.8" fill="none" stroke="${WARN}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linecap="round" />` : ''}
      </g>`;
}).join('\n');
const ledgerRow = (a, b, t, spent) => `      <div style="display:flex;align-items:baseline;gap:8px;padding:9px 0;border-bottom:1px solid ${EDGE}">
        <span style="font:700 14px/1.2 ${F};color:${spent ? DIM : INK};letter-spacing:.02em;flex:1">${a} <span style="color:${DIM}">→</span> ${b}</span>
        <span style="font:600 14px/1 ui-monospace,Menlo,monospace;color:${spent ? DIM : WARN};font-variant-numeric:tabular-nums">${t}</span>
      </div>`;
const ledgerScreen = phone([
  bar('ALI', SEAT[2]),
  phase('47s'),
  `  <div style="background:${PANEL};border:1px solid ${EDGE};border-radius:16px;padding:16px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <h3 style="font:600 12px/1.2 ${F};letter-spacing:.16em;text-transform:uppercase;color:${DIM};margin:0;flex:1">Your wires</h3>
      <span style="flex:none;font:700 14px/1 ${F};letter-spacing:.1em;color:${WARN}">2 ARMED · 1 SPENT</span>
    </div>
${plan({ lit: [], runner: { x: 7.0, z: -13.0, heading: 350 }, h: 300, overlay: doorBars })}
    <div style="font:700 22px/1.25 ${F};color:${WARN};margin-top:14px;letter-spacing:.02em">SOMETHING CROSSED — 2s AGO</div>
    <div style="margin-top:12px;border-top:1px solid ${EDGE}">
${ledgerRow('EAST STUDY', 'LONG GALLERY', '2s', false)}
${ledgerRow('BALLROOM', 'SERVICE', '11s', false)}
${ledgerRow('WEST STUDY', 'GALLERY', 'spent', true)}
    </div>
    <div style="color:${DIM};font:400 13px/1.45 ${F};margin-top:10px">Never who. Your own runner trips your own wires.</div>
  </div>`,
  twoUp, roleTab,
].join('\n'));

/* 3 — THE WINDOW. The screen barely changes; the SENTENCE does. A duration, not a state. */
const windowScreen = phone([
  bar('ALI', SEAT[2]),
  phase('38s'),
  card({
    title: 'Where it is going',
    body: plan({
      lit: CAM, runner: { x: 6.5, z: -13.0, heading: 350 }, h: 300,
      overlay: `      <g>
        <circle cx="-2.0" cy="-27.6" r="1.1" fill="${GONE}" />
        <path d="M -2.0 -25.9 L -2.0 -20.4" stroke="${GONE}" stroke-width="1.6" vector-effect="non-scaling-stroke" />
        <path d="M -3.5 -21.4 L -2.0 -19.4 L -0.5 -21.4 Z" fill="${GONE}" />
${label(1.4, -27.9, '2.70 m/s', GONE, 1.45, 'start')}
      </g>`,
    }),
    read: 'HUNTER — THE LONG GALLERY, COMING SOUTH',
    sub: 'It is 12 m from the door your runner is walking to, at 2.70 m/s. That is about four and a half seconds — so do you say four, or do you say two and keep it?',
    readColour: GONE,
  }),
  `  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
    <button style="min-height:76px;border:0;border-radius:14px;background:${LIVE};color:#06170d;font:700 20px/1 ${F};letter-spacing:.04em;display:flex;align-items:center;justify-content:center;width:100%">CLEAR 2</button>
    <button style="min-height:76px;border:0;border-radius:14px;background:${LIVE};color:#06170d;font:700 20px/1 ${F};letter-spacing:.04em;display:flex;align-items:center;justify-content:center;width:100%">CLEAR 5</button>
    <button style="min-height:76px;border:0;border-radius:14px;background:${WARN};color:#171203;font:700 20px/1 ${F};letter-spacing:.04em;display:flex;align-items:center;justify-content:center;width:100%">HOLD</button>
  </div>`,
  roleTab,
].join('\n'));

/* 4 — THE GHOST. One mark, always: the reachable set, growing at HUNTER_SPEED[stage] per second. */
const AGE = 3.5, STAGE = 1, REACH = HUNTER_SPEED[STAGE] * AGE;          // 2.05 x 3.5 = 7.2 m
const CONF = Math.pow(0.5, AGE / 3.90);                                  // halfLife = roomSpan / speed
const ghostScreen = phone([
  bar('ALI', SEAT[2]),
  phase('44s'),
  card({
    title: 'Last known',
    control: `<div style="margin-left:auto;flex:none;display:flex;border:1px solid ${EDGE};border-radius:12px;overflow:hidden;height:60px">
        <span style="display:grid;place-items:center;padding:0 12px;white-space:nowrap;font:700 13px/1 ${F};letter-spacing:.08em;background:${WARN};color:#171203">CAM 1 ON AIR</span>
        <span style="display:grid;place-items:center;padding:0 12px;white-space:nowrap;font:700 13px/1 ${F};letter-spacing:.08em;color:${DIM}">CAM 2</span>
      </div>`,
    body: plan({
      lit: CAM, runner: { x: 6.0, z: -13.5, heading: 350 }, h: 300,
      overlay: `      <g opacity="${CONF.toFixed(2)}">
        <circle cx="-4.0" cy="-27.6" r="${REACH.toFixed(1)}" fill="${GONE}" fill-opacity="0.10" stroke="${GONE}" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        <circle cx="-4.0" cy="-27.6" r="0.9" fill="${GONE}" fill-opacity="0.75" />
      </g>
${label(-4.0, -22.0, 'REACHABLE BY NOW', GONE)}`,
    }),
    read: 'LAST SEEN — THE LONG GALLERY, 3.5s',
    sub: `Confidence ${CONF.toFixed(2)}, and the circle is everywhere it could be by now — ${REACH.toFixed(1)} m at this stage. In another two seconds it swallows three rooms and stops being a sentence you can say.`,
    readColour: GONE,
  }),
  twoUp, roleTab,
].join('\n'));
export { deskScreen, ledgerScreen, windowScreen, ghostScreen };

// ------------------------------------------------------------------ the pitch sheets
const AXES = ['skill', 'guide agency', 'deniability', 'arguability', 'phone legibility', 'cheap to build', 'fits T1–T6'];
const SCORES = {
  desk:   [4, 3, 5, 5, 4, 4, 5],
  ledger: [4, 5, 5, 4, 2, 3, 4],
  window: [3, 2, 3, 5, 5, 5, 4],
  ghost:  [2, 3, 4, 3, 3, 5, 4],
  today:  [1, 1, 3, 1, 5, 5, 2],
};
const total = (k) => SCORES[k].reduce((a, b) => a + b, 0);

const pip = (n, hue) => `<span style="display:inline-flex;gap:3px;vertical-align:middle">${
  Array.from({ length: 5 }, (_, i) => `<span style="width:9px;height:9px;border-radius:2px;background:${i < n ? hue : EDGE}"></span>`).join('')}</span>`;

const scoreStrip = (k, hue) => `    <div style="border-top:1px solid ${EDGE};padding-top:14px;display:flex;flex-direction:column;gap:7px">
${AXES.map((a, i) => `      <div style="display:flex;align-items:center;gap:10px">
        <span style="font:400 12px/1 ${F};color:${DIM};flex:1;letter-spacing:.04em">${a}</span>${pip(SCORES[k][i], hue)}
      </div>`).join('\n')}
      <div style="display:flex;align-items:baseline;gap:10px;margin-top:4px">
        <span style="font:700 12px/1 ${F};color:${INK};flex:1;letter-spacing:.16em;text-transform:uppercase">Total</span>
        <span style="font:700 20px/1 ${F};color:${hue};font-variant-numeric:tabular-nums">${total(k)}<span style="color:${DIM};font-weight:400;font-size:13px"> / 35</span></span>
      </div>
    </div>`;

const sec = (h, t) => `      <div>
        <div style="font:600 11px/1 ${F};letter-spacing:.2em;text-transform:uppercase;color:${DIM};margin-bottom:6px">${h}</div>
        <div style="font:400 14px/1.5 ${F};color:${INK}">${t}</div>
      </div>`;

function sheet({ file, name, hue, thesis, lever, wrong, argue, cost, breaks, key, screen }) {
  W(file, doc(940, 1110, `  <div style="display:flex;gap:28px;padding:30px;height:100%">
${screen}
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      <div>
        <div style="font:700 30px/1.05 ${F};color:${hue};letter-spacing:.01em">${name}</div>
        <div style="font:400 16px/1.45 ${F};color:${DIM};margin-top:8px">${thesis}</div>
      </div>
${sec('The lever', lever)}
${sec('How an honest guide is wrong', wrong)}
${sec('How the table argues', argue)}
${sec('What it costs', cost)}
      <div style="background:#1b1116;border:1px solid #43242a;border-radius:12px;padding:12px 14px">
        <div style="font:600 11px/1 ${F};letter-spacing:.2em;text-transform:uppercase;color:${GONE};margin-bottom:6px">Where it breaks</div>
        <div style="font:400 14px/1.5 ${F};color:${INK}">${breaks}</div>
      </div>
${scoreStrip(key, hue)}
    </div>
  </div>`, 'display:block'));
}

sheet({
  file: 'Desk.dc.html', name: 'THE SOUND DESK', hue: WARN, key: 'desk', screen: deskScreen,
  thesis: 'Stop showing the guide where the Hunter is. Show them what the house heard.',
  lever: 'One gain toggle — NEAR hears everything in the runner\'s room and one door out, WIDE hears the whole house but only gunshots. And one spoken verb that is worth more than the toggle: <b>“stop moving, I can’t hear.”</b> The runner\'s own throttle sets the guide\'s noise floor, so asking for silence is a real, public, costly request against a 90-second clock.',
  wrong: 'Three ways, all physical. A Hunter that has noticed you <b>stops dead</b> and makes no sound — so the quiet moments are the dangerous ones. The runner\'s own noise masks: at RUN nothing under a half-second-old breach survives. And outside camera coverage a sound is a band across two rooms with no name on it.',
  argue: 'This is the one that fixes the argument rather than the screen. The crash is <b>already public</b> — the TV prints LOUD CRASH — THE LONG GALLERY and the audio never cuts. So the table can finally say “you had the same crash I did.” And the best defence in the game comes from someone else\'s public behaviour: “she was at RUN, of course he couldn\'t hear.”',
  cost: '<code>simReport()</code> already carries <code>runner.noise</code> and the Hunter\'s position every tick, so nothing under <code>src/game/</code> is touched. About forty lines inside <code>sightForGuide()</code>, a canvas that draws rings, one constant.',
  breaks: 'The floor is made of the Hunter\'s stationary duty cycle, and <b>nobody has measured it</b>. If it reads under 0.10, full coverage is an oracle again and the whole case collapses. It also narrows what makes the guide unique: the room now hears a coarse version of what they see.',
});

sheet({
  file: 'Ledger.dc.html', name: 'THE TRIPWIRE LEDGER', hue: '#5fd0c4', key: 'ledger', screen: ledgerScreen,
  thesis: 'Stop watching the Hunter. Watch doorways — a scarce set of armed thresholds that report a crossing and never who crossed.',
  lever: 'Arm three of the house\'s eight internal thresholds, at a re-arm cost. This is the <b>highest-agency option here by a distance</b> — a scarce, per-moment placement decision that is also a statement, because a guide who never arms the door in front of their own runner has made a choice the Debrief can ask about.',
  wrong: 'The runner trips their own wires and a guide who has lost track of them misreads it. An unarmed door is silence, not safety. And a Hunter in BREACH <b>makes its own door</b> and crosses no threshold at all — <code>hunter-ai.js</code> already says so in its own words.',
  argue: 'The strongest counter-play in the batch: the arm list can be <b>declared out loud before the run</b>, which turns the pre-run moment into an Avalon-style team proposal, and the Reunion checks the declaration against the sealed ledger. A guide who armed everything except the one door that mattered has some explaining to do.',
  cost: 'A door-crossing detector, and <code>expedition-wire</code> E1\'s pinning has to grow to include doors. The coordinates already exist — <code>spaces.js</code> CONNECTORS has all eight, and the plan above is drawn from them.',
  breaks: 'Two things. It is the <b>finest lying surface here and possibly too fine</b>: a guide who simply arms nothing leaves no evidence of anything, which is NO SIGNAL walking back in through a door marked “agency”. And a 1.7 m doorway on a 250 px plan is a 14 px tap target, against this page\'s own 60 px thumb floor — the arming UI is an unsolved problem, not a detail.',
});

sheet({
  file: 'Window.dc.html', name: 'THE WINDOW', hue: '#a765d8', key: 'window', screen: windowScreen,
  thesis: 'Change the sentence, not the screen. The guide calls a duration, not a state — “clear for three” — a public, precise, immediately falsifiable prediction.',
  lever: 'Extrapolation. The Hunter mark carries a heading and a speed instead of a bare position; the guide converts that into a number of seconds, says it out loud, and the runner spends exactly that many. Two words become four.',
  wrong: 'Extrapolation fails when the Hunter turns, and it turns when it hears something. Sound cannot fill its awareness past <code>soundCeiling</code> 0.86 — under <code>commitAt</code> 1.00 — but it absolutely redirects it. So <b>the honest error is caused by the runner\'s own noise inside the guide\'s own window</b>: cause and effect separated by seconds, in public.',
  argue: 'The only candidate where the argument needs <b>no access to the guide\'s screen whatsoever</b>. “You said five and it walked in at two” is a complete accusation any spectator can make from the television alone; “it turned when you smashed that wall” is an equally complete defence. Nothing private is needed to have the fight.',
  cost: 'Almost nothing. <code>session.js</code>\'s CALL vocabulary widens from two words to four, <code>log.js</code> already records <code>said</code>, and <code>captions.js</code> <code>segmentClock()</code> becomes the shared instrument. A window timer on the runner\'s visor and one extra field on the call event.',
  breaks: 'It asks for arithmetic under time pressure from someone three drinks in, and the table may converge on “always call 2” — safe, uninformative, and the death of the mechanic. Worse: <b>it is a multiplier, not a replacement.</b> Layered on a blank screen, “clear for five” is a coin flip with more syllables. It needs one of the others underneath it.',
});

sheet({
  file: 'Ghost.dc.html', name: 'THE GHOST', hue: '#3aa0e4', key: 'ghost', screen: ghostScreen,
  thesis: 'Never a blank screen. A last-known mark that inflates as it ages, so the question stops being “do I know” and becomes “is this still true”.',
  lever: 'Judging when a ghost is too old to act on. Plus one real choice: with more than one camera lit, only one is <b>on air</b> at full refresh — so the guide can park their attention on the room ahead and be deliberately blind behind.',
  wrong: 'Staleness, and the arithmetic is damning about the shipped default. At stage 1 the Hunter crosses an 8 m room in <b>3.90 s</b>, while <code>ghost()</code>\'s <code>halfLife = 6</code> reports 0.50 confidence on information already worthless. Set <code>halfLife = roomSpan / HUNTER_SPEED[stage]</code> — 3.90 / 2.96 / 2.39 s — and the error rate rises with the Hunter\'s stage, which is a difficulty curve for free.',
  argue: '“It was eight seconds old” is a defence with a number in it, which beats “I had nothing”. The room has a partial check, because the TV shows the Hunter whenever a camera catches it, so everyone knows roughly when the last public sighting was — but they never see the guide\'s clock.',
  cost: '<b>The cheapest by a distance.</b> <code>darkrun.js</code> <code>ghost()</code> is already written, already asserted by <code>dark-run</code> D6/D6b, and deliberately unwired. <code>sightForGuide()</code>\'s return shape barely changes — add an age.',
  breaks: 'It is still one channel, and still fundamentally “how stale is this”. A good guide learns one threshold — about four seconds — and applies it mechanically from then on, so the skill is thin and <b>exhausted inside a game or two</b>. A fading blob is also genuinely hard to draw legibly at 390 px.',
});

// ------------------------------------------------------------------ Main — the ballot
const OPTS = [
  { key: 'today',  name: 'NO SIGNAL', tag: 'shipped today', hue: DIM,
    buy: 'Nothing. It is the incumbent, and it is here so the others are scored against something real.',
    kill: 'Its honest-error function has <b>no player term in it at all</b> — nothing to read, and nothing anyone does changes the odds. Its only two inputs are the win condition and a constant welded shut at 62°.' },
  { key: 'desk',   name: 'THE SOUND DESK', tag: 'recommended', hue: WARN,
    buy: 'You believe the real problem is that the guide\'s evidence is <b>unshared</b>, so the table has nothing to reason over. This is the only one that moves the guide onto evidence the room already partly holds.',
    kill: 'An unmeasured duty cycle. If the Hunter stands still less than 10% of the time, the error floor collapses.' },
  { key: 'ledger', name: 'THE TRIPWIRE LEDGER', tag: 'the alternative', hue: '#5fd0c4',
    buy: 'You believe the guide needs something to <b>do</b>, not something to read. Three wires, eight doors, a re-arm cost, and a list you can be made to declare out loud.',
    kill: 'A guide who arms nothing is uncatchable by any mechanism in the game — and the tap target is 14 px.' },
  { key: 'window', name: 'THE WINDOW', tag: 'the multiplier', hue: '#a765d8',
    buy: 'You believe the argument matters more than the screen. It is the only one where a spectator can prosecute the guide <b>from the television alone</b>.',
    kill: 'It is not a replacement. On a blank screen it is a coin flip with more syllables — it needs one of the others underneath it.' },
  { key: 'ghost',  name: 'THE GHOST', tag: 'the cheap one', hue: '#3aa0e4',
    buy: 'You want to stop shipping a blank screen <b>this week</b>. <code>ghost()</code> is written, gated, and unwired; this is a day\'s work.',
    kill: 'One learnable threshold — about four seconds — and the skill is exhausted.' },
];
const COLW = 252;
const headRow = OPTS.map((o) => `      <div style="text-align:center">
        <div style="font:700 15px/1.15 ${F};color:${o.hue};letter-spacing:.02em">${o.name}</div>
        <div style="font:600 10px/1 ${F};letter-spacing:.16em;text-transform:uppercase;color:${DIM};margin-top:6px">${o.tag}</div>
      </div>`).join('\n');
const axisRows = AXES.map((a, i) => {
  const best = Math.max(...OPTS.map((o) => SCORES[o.key][i]));
  return `      <div style="display:grid;grid-template-columns:200px repeat(5, ${COLW}px);gap:14px;align-items:center;padding:9px 0;border-top:1px solid ${EDGE}">
        <span style="font:400 14px/1.2 ${F};color:${DIM};letter-spacing:.03em">${a}</span>
${OPTS.map((o) => {
    const v = SCORES[o.key][i], top = v === best;
    return `        <span style="display:flex;align-items:center;justify-content:center;gap:10px">${pip(v, top ? o.hue : '#4a536a')}<span style="font:${top ? 700 : 400} 14px/1 ${F};color:${top ? o.hue : DIM};font-variant-numeric:tabular-nums;width:12px">${v}</span></span>`;
  }).join('\n')}
      </div>`;
}).join('\n');

W('Main.dc.html', doc(1620, 940, `  <div style="padding:34px 40px;display:flex;flex-direction:column;gap:22px;height:100%">
    <div style="display:flex;align-items:flex-end;gap:24px">
      <div style="flex:1">
        <div style="font:700 34px/1.05 ${F};letter-spacing:.01em">Four desks</div>
        <div style="font:400 16px/1.45 ${F};color:${DIM};margin-top:8px;max-width:820px">One screen, four theories of what a guide is <i>for</i>. Every score below is the same seven axes; the case for each is on its own sheet, and so is the thing that kills it. Build cost is scored so that <b>5 means cheap</b>.</div>
      </div>
      <div style="font:400 13px/1.5 ${F};color:${DIM};max-width:330px;text-align:right;border-right:3px solid ${WARN};padding-right:14px">The target is 15–25% honest guide error. Today\'s mechanic delivers <b style="color:${INK}">38.7 / 27.3 / 16.0%</b> at one, two and three cameras — above the band for two thirds of a game, and inside it only once good has effectively won.</div>
    </div>

    <div>
      <div style="display:grid;grid-template-columns:200px repeat(5, ${COLW}px);gap:14px;align-items:end;padding-bottom:12px">
        <span></span>
${headRow}
      </div>
${axisRows}
      <div style="display:grid;grid-template-columns:200px repeat(5, ${COLW}px);gap:14px;align-items:center;padding:14px 0 0;border-top:2px solid ${EDGE}">
        <span style="font:700 13px/1 ${F};letter-spacing:.18em;text-transform:uppercase;color:${INK}">Total</span>
${OPTS.map((o) => `        <span style="text-align:center;font:700 28px/1 ${F};color:${o.hue};font-variant-numeric:tabular-nums">${total(o.key)}<span style="color:${DIM};font-weight:400;font-size:14px"> / 35</span></span>`).join('\n')}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:16px;flex:1">
${OPTS.map((o) => `      <div style="background:${PANEL};border:1px solid ${EDGE};border-top:3px solid ${o.hue};border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px">
        <div>
          <div style="font:600 10px/1 ${F};letter-spacing:.2em;text-transform:uppercase;color:${DIM};margin-bottom:7px">Buy this if</div>
          <div style="font:400 13px/1.5 ${F};color:${INK}">${o.buy}</div>
        </div>
        <div style="margin-top:auto">
          <div style="font:600 10px/1 ${F};letter-spacing:.2em;text-transform:uppercase;color:${GONE};margin-bottom:7px">What kills it</div>
          <div style="font:400 13px/1.5 ${F};color:${DIM}">${o.kill}</div>
        </div>
      </div>`).join('\n')}
    </div>
  </div>`, 'display:block'));
