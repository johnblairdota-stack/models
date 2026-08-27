import { writeFileSync } from 'node:fs';
import { ACCENTS, SHELLS, robotFaceSvg, shellTones } from '../../../src/party/look.js';

/*
 * The canvas draws with the SHIPPED face, not a copy of it. There was briefly a second
 * implementation here and that is exactly how a design doc starts lying about the product —
 * so every head below comes out of src/party/look.js and any change there lands here on the
 * next re-seed.
 */
const headSvg = (treat, size, shell, accent, mood = 'idle') =>
  robotFaceSvg(shell, accent, { size, treatment: treat, mood });

const OUT = 'C:/Users/John/Documents/models/web-prototype/docs/design/emotes';
const N = { bg: '#0c0a08', deep: '#080604', panel: '#161310', well: '#12100c',
  accent: '#f5a14a', ink: '#f3ece3', soft: '#a89884', dim: '#8a7d70' };
const FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
const KICKER = `font-size: 11px; letter-spacing: 0.26em; text-transform: uppercase; color: ${N.dim}; margin: 0;`;
const H1 = `font-size: 29px; letter-spacing: -0.01em; font-weight: 650; color: ${N.ink}; margin: 6px 0 0;`;
const LEDE = `font-size: 15px; line-height: 1.5; color: ${N.soft}; margin: 10px 0 0; max-width: 64ch; text-wrap: pretty;`;
const PANEL = `background: ${N.panel}; border: 1px solid rgba(245,161,74,0.14); border-radius: 10px;`;


/* The factory robot's own white and cyan. Legal ONLY on the bound artboards, whose colours
   arrive as template holes and so never pass through `cleanLook` — see SENT below. */
const ROBOT_SHELL = '#e7e3dd', ROBOT_LIGHT = '#7ebdf0';
/* …and the nearest REAL player to it, for the artboards drawn with literal colours. Handing
   `robotFaceSvg` an off-palette hex there gets DEFAULT_LOOK back without a word. */
const DEMO_SHELL = SHELLS[1], DEMO_LIGHT = ACCENTS[6];

function doc(inner, props = '{}') {
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
    body { margin: 0; font-family: ${FONT}; background: ${N.bg}; color: ${N.ink}; }
    a { color: ${N.accent}; } a:hover { color: #ffbe78; }
    svg { display: block; }
  </style>
</helmet>
${inner}
</x-dc>
<script data-dc-script data-props='${props}'>
class Component extends DCLogic {
  renderVals() {
    const shell = this.props.shell ?? '${ROBOT_SHELL}';
    const n = parseInt(shell.slice(1), 16);
    const R = n >> 16, G = (n >> 8) & 255, B = n & 255;
    const dark = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255 < 0.35;
    const shade = (amt) => {
      const t = amt > 0 ? 255 : 0, k = Math.abs(amt);
      return '#' + [R, G, B].map((v) => Math.round(v + (t - v) * k).toString(16).padStart(2, '0')).join('');
    };
    return {
      accent: this.props.accent ?? '${ROBOT_LIGHT}',
      shell,
      crown: shade(dark ? 0.28 : 0.18),
      pod: shade(dark ? -0.08 : -0.24),
      rim: shade(dark ? 0.66 : 0.36),
      seam: shade(dark ? 0.10 : -0.34),
      rimA: dark ? 0.80 : 0.55,
    };
  }
}
</script>
</body>
</html>
`;
}
const PROPS = `{"accent":{"editor":"color","default":"${ROBOT_LIGHT}","section":"Player colour"},"shell":{"editor":"color","default":"${ROBOT_SHELL}","section":"Player colour"}}`;

/* A head whose colours are bound to the tweak chips. The five derived shell tones are holes
   too — `renderVals()` shades them, because a template hole cannot be shaded here. */
/* ⚠️ The sentinels must be REAL palette entries. `robotFaceSvg` validates through `cleanLook`
   and silently falls back to DEFAULT_LOOK for anything off-palette, so an invented hex renders
   a perfectly good face with NO holes in it — a canvas whose tweak chips quietly do nothing. */
const SENT = { shell: SHELLS[0], accent: ACCENTS[0] };
const HOLES = (() => {
  const t = shellTones(SENT.shell);
  return [[SENT.shell, '{{shell}}'], [t.crown, '{{crown}}'], [t.pod, '{{pod}}'],
    [t.rim, '{{rim}}'], [t.seam, '{{seam}}'], [SENT.accent, '{{accent}}'],
    ['stroke-opacity="0.8"', 'stroke-opacity="{{rimA}}"']];
})();
const bound = (treat, size, mood = 'idle') => {
  let s = headSvg(treat, size, SENT.shell, SENT.accent, mood);
  for (const [from, to] of HOLES) s = s.split(from).join(to);
  return s;
};

const tile = (inner, pad = 10) => `<div style="${PANEL} padding: ${pad}px; display: flex; align-items: center; justify-content: center;">${inner}</div>`;
const cap = (t, s = N.dim) => `<span style="font-size: 11px; letter-spacing: 0.1em; color: ${s};">${t}</span>`;
const stack = (inner, label) => `<div style="display: flex; flex-direction: column; align-items: center; gap: 7px;">${inner}${cap(label)}</div>`;

/* ------------------------------------------------------------------ Main */
const note = (t, d) => `<div style="display: flex; flex-direction: column; gap: 2px;">
      <span style="font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: ${N.accent};">${t}</span>
      <span style="font-size: 13px; color: ${N.soft}; line-height: 1.45;">${d}</span>
    </div>`;

writeFileSync(`${OUT}/Main.dc.html`, doc(`<div style="padding: 38px 42px; display: flex; flex-direction: column; gap: 28px;">
  <div>
    <p style="${KICKER}">Prime Time · the face</p>
    <h1 style="${H1}">A new 2D face, traced off the robot we actually built</h1>
    <p style="${LEDE}">The old lobby face was a stand-in — a diamond on a blob, drawn before the character existed. This one is measured: the silhouette comes off the front render, and the eyes, brow arcs and mouth come off the shader that paints the real faceplate, at the same proportions it uses.</p>
  </div>

  <div style="display: flex; align-items: center; gap: 30px;">
    <div style="display: flex; flex-direction: column; align-items: center; gap: 9px;">
      <img src="ref-head.png" alt="The base robot, front render" style="width: 196px; border-radius: 10px; display: block;">
      ${cap('THE BUILT ROBOT')}
    </div>
    <div style="display: flex; flex-direction: column; align-items: center; gap: 9px;">
      <div style="${PANEL} padding: 14px;">${bound('portrait', 196)}</div>
      ${cap('THE NEW DRAWING', N.accent)}
    </div>
    <div style="display: flex; flex-direction: column; gap: 15px;">
      ${note('Helmet + pods', 'Rounded shell, side pods, a lighter crown cap. Takes the player&#39;s shell colour.')}
      ${note('Faceplate', 'Dark blue glass. Stays blue for everyone — it is the robot, not the player.')}
      ${note('The light', 'Eyes, brow arcs and mouth are emissive. This is where the player&#39;s accent colour goes.')}
      ${note('Why it matters', 'The face is a screen, so an emote is just the light redrawn. No new art, no second pipeline.')}
    </div>
  </div>
</div>`, PROPS));

/* ------------------------------------------------------------- Treatments */
const TR = [
  ['portrait', 'Portrait', 'Every part the render has: crown seam, chin seam, screen sheen, a specular in each eye. For the lobby, the role card, a face on its own.'],
  ['chip', 'Chip', 'The same silhouette with the fine detail stripped and the features fattened. Built to survive 40px in a row of eight.'],
  ['screen', 'Screen', 'The helmet is gone — the faceplate is the whole graphic. Biggest features, reads from furthest away, least like a robot and most like an emote.'],
];
writeFileSync(`${OUT}/Treatments.dc.html`, doc(`<div style="padding: 36px 40px; display: flex; flex-direction: column; gap: 24px;">
  <div>
    <p style="${KICKER}">Three treatments</p>
    <h1 style="${H1}">One drawing, three amounts of detail</h1>
    <p style="${LEDE}">Same proportions and the same face in all three — they differ only in how much survives when the picture gets small. The right-hand sizes are the ones that decide it: 40px is a TV strip, 26px is a name-tag chip.</p>
  </div>
  ${TR.map(([k, name, why]) => `<div style="display: flex; align-items: center; gap: 26px;">
    <div style="width: 220px; flex-shrink: 0; display: flex; flex-direction: column; gap: 5px;">
      <span style="font-size: 17px; font-weight: 650; color: ${N.ink};">${name}</span>
      <span style="font-size: 12.5px; line-height: 1.5; color: ${N.soft}; text-wrap: pretty;">${why}</span>
    </div>
    <div style="display: flex; align-items: center; gap: 16px;">
      ${[150, 96, 64, 40, 26].map((s) => stack(tile(headSvg(k, s, DEMO_SHELL, DEMO_LIGHT), s > 100 ? 12 : 8), `${s}px`)).join('')}
    </div>
  </div>`).join('')}
</div>`, PROPS));

/* ---------------------------------------------------------- Reactions */
const FACE_ROW = [['idle', 'Idle', 'The lobby, the seat grid, the role card.'],
  ['clap', 'Clap', 'Eyes shut into arcs, brows up, the widest mouth of the four.'],
  ['boo', 'Boo', 'The inner end of each brow DROPS. A frown on its own reads as sad.'],
  ['sus', 'Sus', 'Asymmetric on purpose — squint one side, brow up the other.'],
  ['shock', 'Shock', 'Fires on the moment, so it has to land in one frame.']];

const RULE = (k, v) => `<div style="display: flex; flex-direction: column; gap: 3px;">
      <span style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: ${N.accent};">${k}</span>
      <span style="font-size: 13px; line-height: 1.45; color: ${N.soft}; text-wrap: pretty;">${v}</span>
    </div>`;

/* the phone pad and the TV strip, drawn as the views actually emit them */
const padMock = `<div style="width: 340px; background: ${N.bg}; border: 1px solid #241f1a; border-radius: 16px; padding: 14px;">
    <div style="display: flex; justify-content: space-between; font-size: 11px; letter-spacing: 0.2em; color: ${N.dim};"><span>PRIME TIME</span><span>RUN</span></div>
    <h2 style="font-size: 24px; font-weight: 650; margin: 8px 0 4px; color: ${N.ink};">Watch.</h2>
    <p style="margin: 0 0 12px; font-size: 13px; color: ${N.soft};">Your face, on the TV. The room sees who reacted.</p>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 9px;">
      ${['clap', 'boo', 'sus', 'shock'].map((m) => `<div style="display: flex; align-items: center; gap: 11px; min-height: 84px; padding: 8px 12px; background: #1c1712; border-radius: 10px;">
        ${bound('portrait', 46, m)}
        <span style="font-size: 15px; font-weight: 700; letter-spacing: 0.1em; color: ${N.ink};">${m.toUpperCase()}</span>
      </div>`).join('')}
    </div>
  </div>`;

const STRIP = [['MARY-KATE 3', 1, 1, 'clap'], ['JELLIE', 11, 11, 'sus'], ['OZZARA', 3, 5, 'boo'],
  ['SAM 2', 7, 2, 'shock'], ['ELLOHN', 6, 6, 'sus'], ['IVALEX', 9, 9, 'clap']];
const stripMock = `<div style="flex-grow: 1; background: ${N.bg}; border: 1px solid #241f1a; border-radius: 12px; padding: 14px;">
    <div style="height: 176px; border: 2px solid rgba(245,161,74,0.35); border-radius: 12px; background: linear-gradient(180deg, ${N.panel}, ${N.deep}); display: flex; align-items: center; justify-content: center; color: ${N.dim}; font-size: 12px; letter-spacing: 0.24em;">THE RUN PICTURE</div>
    <p style="text-align: center; font-size: 19px; font-weight: 700; margin: 10px 0 2px; color: ${N.ink};">MARY-KATE 3 walks. JELLIE talks.</p>
    <p style="text-align: center; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: ${N.dim}; margin: 0;">Cameras 2 / 4 · alarms 1</p>
    <div style="display: flex; justify-content: center; gap: 16px; padding-top: 8px;">
      ${STRIP.map(([nm, s, a, m]) => `<div style="display: flex; flex-direction: column; align-items: center; gap: 3px;">
        ${headSvg('portrait', 54, SHELLS[s], ACCENTS[a], m)}
        <span style="font-size: 10.5px; letter-spacing: 0.07em; color: ${N.soft}; white-space: nowrap;">${nm}</span>
      </div>`).join('')}
    </div>
  </div>`;

writeFileSync(`${OUT}/Reactions.dc.html`, doc(`<div style="padding: 36px 40px; display: flex; flex-direction: column; gap: 26px;">
  <div>
    <p style="${KICKER}">Built · the reaction pad</p>
    <h1 style="${H1}">Four reactions, and the pad finally reaches another machine</h1>
    <p style="${LEDE}">The pad has had these four buttons since the first build and they printed a word on the tapper's own phone and stopped there — six of eight players holding a dead remote for the whole run. Each reaction is the same head with the light redrawn: no new art, no second set of files.</p>
  </div>

  <div style="display: flex; gap: 14px;">
    ${FACE_ROW.map(([m, label, why]) => `<div style="display: flex; flex-direction: column; align-items: center; gap: 9px; padding: 14px 10px; background: ${N.panel}; border: 1px solid rgba(245,161,74,0.14); border-radius: 10px; flex-grow: 1;">
      ${bound('portrait', 118, m)}
      <span style="font-size: 15px; font-weight: 650; letter-spacing: 0.08em; color: ${N.ink};">${label.toUpperCase()}</span>
      <span style="font-size: 11.5px; line-height: 1.45; color: ${N.dim}; text-align: center; max-width: 24ch; text-wrap: pretty;">${why}</span>
    </div>`).join('')}
  </div>

  <div style="display: flex; gap: 16px; align-items: flex-start;">
    ${padMock}
    ${stripMock}
  </div>

  <div style="display: flex; gap: 34px;">
    ${RULE('Living only', 'The dead do not react — an executed player with a live channel can signal what they learned on the way out.')}
    ${RULE('Expedition only', 'The banked finding is about dead air during the run. Opening it across the talk beats would put a second, free channel beside the pairs.')}
    ${RULE('2.5s cooldown', 'Server-side. About twenty-four taps per player per run. Unlimited turns the strip to mush; one-per-beat makes people hoard it.')}
    ${RULE('Six on air', 'Newest first, one row per player, capped — so two fast thumbs cannot bury everyone else.')}
  </div>
</div>`, PROPS));

/* -------------------------------------------------------------- Colours */
const PAIRS = SHELLS.map((s, i) => [s, ACCENTS[i]]);
writeFileSync(`${OUT}/Colours.dc.html`, doc(`<div style="padding: 36px 40px; display: flex; flex-direction: column; gap: 24px;">
  <div>
    <p style="${KICKER}">Twelve shells, twelve accents</p>
    <h1 style="${H1}">Every player, on the night&#39;s own black</h1>
    <p style="${LEDE}">Helmet takes the shell colour, the light takes the accent, the glass stays blue for everyone. Eight of the twelve shells are darker than the TV background, so the rim light, the crown and the pods all open up as the shell gets darker — without that the head sinks into the screen and only the eyes survive.</p>
  </div>
  <div>
    ${cap('PORTRAIT')}
    <div style="display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 10px; margin-top: 9px;">
      ${PAIRS.map(([s, a]) => tile(headSvg('portrait', 74, s, a), 7)).join('')}
    </div>
  </div>
  <div>
    ${cap('SCREEN, AT TV SIZE')}
    <div style="display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 10px; margin-top: 9px;">
      ${PAIRS.map(([s, a]) => tile(headSvg('screen', 48, s, a), 9)).join('')}
    </div>
  </div>
  <p style="margin: 0; font-size: 13px; line-height: 1.5; color: ${N.dim}; max-width: 90ch; text-wrap: pretty;">Worth your eye: duplicate colours are allowed by design, so two players can land on the same pair. The face does not solve that and is not meant to — the seat number beside it does.</p>
</div>`, PROPS));

/* --------------------------------------------------------------- canvas */
writeFileSync(`${OUT}/canvas.json`, JSON.stringify({
  artboards: [
    { file: 'Main.dc.html', x: 0, y: 0, w: 1000, h: 470 },
    { file: 'Treatments.dc.html', x: 0, y: 570, w: 1100, h: 620 },
    { file: 'Reactions.dc.html', x: 1200, y: 570, w: 1180, h: 860 },
    { file: 'Colours.dc.html', x: 0, y: 1290, w: 1100, h: 560 },
  ],
  annotations: [
    { id: 'pick-treatment', x: 1060, y: 40, w: 290, text: 'Start here, then Treatments.\n\nPortrait is what shipped: the lobby picker and the intro at full detail, Chip for every mount at 64px and under, and Portrait again on the reaction pad.' },
    { id: 'shipped', x: 2440, y: 600, w: 290, text: 'Built and gated — harness/react-pad.mjs, 22 assertions.\n\nThe reactions are moods on the shipped drawing, so the lobby face and the pad cannot drift apart.' },
  ],
  launch: { view: 'canvas' },
}, null, 2));

console.log('wrote 4 artboards + canvas.json');
