import { writeFileSync } from 'node:fs';
import { ACCENTS, SHELLS, robotFaceSvg, shellTones } from '../../../src/party/look.js';
import { withBadge, BADGE } from './badge-proto.mjs';

const OUT = 'C:/Users/John/Documents/models/web-prototype/docs/design/emote-symbols';
const N = { bg: '#0c0a08', deep: '#080604', panel: '#161310', well: '#12100c',
  accent: '#f5a14a', ink: '#f3ece3', soft: '#a89884', dim: '#8a7d70',
  live: '#9ff2c8', bad: '#ff8a7a' };
const FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
const KICK = `font-size: 11px; letter-spacing: 0.26em; text-transform: uppercase; color: ${N.dim}; margin: 0;`;
const H1 = `font-size: 29px; letter-spacing: -0.01em; font-weight: 650; color: ${N.ink}; margin: 6px 0 0;`;
const LEDE = `font-size: 15px; line-height: 1.5; color: ${N.soft}; margin: 10px 0 0; max-width: 66ch; text-wrap: pretty;`;
const PANEL = `background: ${N.panel}; border: 1px solid rgba(245,161,74,0.14); border-radius: 10px;`;
const BODY = `font-size: 13px; line-height: 1.5; color: ${N.soft}; text-wrap: pretty;`;

function doc(inner) {
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
<script data-dc-script data-props='{}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
`;
}

const face = (m, size, s, a, badge = true) => {
  const svg = robotFaceSvg(SHELLS[s], ACCENTS[a], { size, mood: m });
  return badge && m !== 'idle' ? withBadge(svg, m) : svg;
};
const cap = (t, c = N.dim) => `<span style="font-size: 11px; letter-spacing: 0.12em; color: ${c};">${t}</span>`;
const stack = (inner, label, c) => `<div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">${inner}${cap(label, c)}</div>`;
const head = (kick, h1, lede) => `<div><p style="${KICK}">${kick}</p><h1 style="${H1}">${h1}</h1><p style="${LEDE}">${lede}</p></div>`;

/* ============================================================ 1 · Main */
const opt = (tag, name, how, cost, pick) => `<div style="${PANEL} padding: 18px; display: flex; flex-direction: column; gap: 9px; flex-grow: 1; ${pick ? `border-color: ${N.live};` : ''}">
    <div style="display: flex; align-items: baseline; gap: 10px;">
      <span style="font-size: 11px; letter-spacing: 0.2em; color: ${pick ? N.live : N.dim};">${tag}</span>
      <span style="font-size: 17px; font-weight: 650; color: ${N.ink};">${name}</span>
      ${pick ? `<span style="font-size: 11px; letter-spacing: 0.16em; color: ${N.live};">← I&#39;D PICK THIS</span>` : ''}
    </div>
    <p style="margin: 0; ${BODY}">${how}</p>
    <p style="margin: 0; font-size: 12.5px; line-height: 1.45; color: ${N.dim};"><strong style="color: ${N.accent}; font-weight: 600;">Costs:</strong> ${cost}</p>
  </div>`;

writeFileSync(`${OUT}/Main.dc.html`, doc(`<div style="padding: 38px 42px; display: flex; flex-direction: column; gap: 26px;">
  ${head('Plan · before any symbol is drawn', 'The reaction strip falls off the bottom of a normal television',
    'The critic found this and I measured it myself with the real night skin. On a 1080p TV, 24px of every 74px chip is below the screen edge and the player&#39;s NAME is not on the television at all. At 720p it is 39px and the names are gone too. That breaks the feature&#39;s whole premise — a boo is evidence, and evidence has a name on it.')}

  <div style="display: flex; gap: 22px; align-items: flex-start;">
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <img src="tv-clip.png" alt="The reaction strip clipped by the screen edge at 1920x1080" style="width: 620px; border-radius: 8px; display: block; border: 1px solid rgba(245,161,74,0.18);">
      ${cap('THE RUN BEAT AT 1920×1080 — MOUTHS CUT, NO NAMES')}
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px; flex-grow: 1;">
      ${['1920 × 1080 — 24px of 74 cut · name off screen', '1280 × 720 — 39px of 74 cut · name off screen', '2560 × 1440 — 6px cut · name survives', '3840 × 2160 — fits'].map((r, i) => `<div style="display: flex; align-items: center; gap: 10px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${i < 2 ? N.bad : (i === 2 ? N.accent : N.live)}; flex-shrink: 0;"></span>
        <span style="font-size: 13.5px; color: ${i < 2 ? N.ink : N.soft};">${r}</span>
      </div>`).join('')}
      <p style="margin: 6px 0 0; ${BODY}">The run picture is <strong style="color: ${N.ink}; font-weight: 600;">90% of the screen height</strong>, and the chrome above plus the strip below do not fit in what is left. Nothing overflows visibly because the run beat hides overflow — it just quietly cuts.</p>
    </div>
  </div>

  <div style="display: flex; gap: 16px;">
    ${opt('OPTION A', 'Shrink the picture a little', 'Take the run frame from 90% of the screen height down to about 84%. One number, one line.', 'The run picture gets ~7% smaller on every television, including the ones that had no problem. At 720p it only just fits — no margin left for anything added later.', false)}
    ${opt('OPTION B', 'Let the picture take what is left over', 'Give the strip its space first and let the run frame fill the remainder, keeping its 16:9 shape. The layout then corrects itself at every screen size instead of being tuned to one.', 'A real layout change to the run beat, and the run camera sits in a frame that can now resize — worth watching that it does not re-fit noisily when the window changes.', true)}
  </div>

  <p style="margin: 0; ${BODY} max-width: 100ch;">Either way this lands <strong style="color: ${N.ink}; font-weight: 600;">before</strong> the symbols. A badge would rescue part of it by accident — a badge sits at the top of the chip, above the cut — but that is treating the symptom, and the names would still be missing.</p>
</div>`));

/* ========================================================= 2 · Symbols */
const SYM = [
  ['clap', 'CLAP', 'Heavy up-chevron', N.live, '--night-live', 'The exact mirror of boo. Mint already means <em>on air / lit / good</em> in this palette.', 'John&#39;s call, and it is the right one — a level meter read as signal strength before it read as applause.'],
  ['boo', 'BOO', 'Heavy down-chevron', N.bad, '--night-bad', 'Salmon genuinely is the "bad" colour here, and a chevron carries no other meaning anywhere in the show.', ''],
  ['sus', 'SUS', 'Question mark', N.accent, '--night-accent', 'The show&#39;s own amber — "the programme is interested in this". Keeps the ? shape your partner asked for and drops the red.', ''],
  ['shock', 'SHOCK', 'Four-point spark', N.ink, '--night-ink', 'Not an exclamation mark. A spark is electrical and machine-native, and white is the brightest thing on the strip — right for the rarest reaction.', ''],
];

writeFileSync(`${OUT}/Symbols.dc.html`, doc(`<div style="padding: 38px 42px; display: flex; flex-direction: column; gap: 26px;">
  ${head('Plan · the symbol vocabulary', 'One badge, not a scatter — and no hands',
    'Drawn and measured at the real sizes. A single filled tile in the top-right beats several small floating glyphs, because at sofa distance the saturated colour is what survives and a 5px glyph is not there at all. The tile carries the colour from far away and the glyph carries the meaning up close. Clap and boo are the same chevron mirrored, so the pair reads as one control with two directions.')}

  <div style="display: flex; gap: 14px;">
    ${SYM.map(([m, name, glyph, col, token, why, caveat]) => `<div style="${PANEL} padding: 16px 12px; display: flex; flex-direction: column; align-items: center; gap: 10px; flex-grow: 1;">
      ${face(m, 132, 1, 6)}
      <span style="font-size: 15px; font-weight: 650; letter-spacing: 0.1em; color: ${N.ink};">${name}</span>
      <div style="display: flex; align-items: center; gap: 7px;">
        <span style="width: 11px; height: 11px; border-radius: 3px; background: ${col};"></span>
        <span style="font-size: 11px; letter-spacing: 0.06em; color: ${N.dim}; font-family: ui-monospace, monospace;">${token}</span>
      </div>
      <span style="font-size: 12px; color: ${N.soft}; text-align: center;">${glyph}</span>
      <p style="margin: 0; font-size: 12px; line-height: 1.45; color: ${N.dim}; text-align: center; text-wrap: pretty;">${why}</p>
      ${caveat ? `<p style="margin: 0; font-size: 11.5px; line-height: 1.4; color: ${N.accent}; text-align: center; text-wrap: pretty;">${caveat}</p>` : ''}
    </div>`).join('')}
  </div>

  <div style="display: flex; gap: 16px;">
    <div style="${PANEL} padding: 18px; flex-grow: 1; border-left: 3px solid ${N.bad};">
      <p style="${KICK} color: ${N.bad};">Two things from the brief I would not do</p>
      <p style="margin: 10px 0 0; ${BODY}"><strong style="color: ${N.ink}; font-weight: 600;">Not red, and not an exclamation mark.</strong> Salmon already means <em>taken / dark / Production</em> everywhere else, and a red <strong style="color: ${N.ink};">!</strong> above a head is already this game&#39;s word for <em>nominee</em> — a locked rule. Teaching the room a second meaning for that mark ninety seconds before the Reckoning is how you get an argument about what the TV said. The <strong style="color: ${N.ink};">?</strong> shape stays; the red goes.</p>
      <p style="margin: 12px 0 0; ${BODY}"><strong style="color: ${N.ink}; font-weight: 600;">No thumbs-down, no clapping hands.</strong> This robot has no hands anywhere in its art — it is a helmet, two pods and a lit screen. A cartoon hand would be the only human body part on the screen and it would look borrowed, because it would be. Meters, chevrons and sparks say the same things in the character&#39;s own voice.</p>
    </div>
    <div style="${PANEL} padding: 18px; width: 320px; flex-shrink: 0;">
      <p style="${KICK}">Why a fixed colour, not the player&#39;s</p>
      <p style="margin: 10px 0 0; ${BODY}">The badge&#39;s only job is <em>which reaction</em> — identity is already carried twice, by the face colour and the name underneath. A fixed colour also has to work against all twelve accents, and it means the badge never needs recolouring when a player changes their look.</p>
    </div>
  </div>
</div>`));

/* =========================================================== 3 · Sizes */
const SCALE = (inner, k, w, h) => `<div style="width: ${Math.round(w * k)}px; height: ${Math.round(h * k)}px; overflow: hidden;"><div style="transform: scale(${k}); transform-origin: top left;">${inner}</div></div>`;
const PAIRS = [[0, 0], [1, 1], [3, 5], [7, 2], [6, 6], [9, 9]];
const MOODS4 = ['clap', 'sus', 'boo', 'shock', 'sus', 'clap'];
const stripRow = (badge) => `<div style="display: flex; gap: 16px;">${PAIRS.map(([s, a], i) => face(MOODS4[i], 56, s, a, badge)).join('')}</div>`;

const NEVER = [
  ['Phone colour picker', '168px', 'Always idle. Its job is "which two colours am I".'],
  ['TV run face', '220px', 'Always idle, and it fades out the moment the camera is live.'],
  ['Lobby seat grid ×8', '52px', 'Eight animated badges saying nothing.'],
  ['Lower third', '64px', 'Always idle.'],
  ['Nominee rows', '48px', 'Never — a badge here really would collide with the nominee mark.'],
  ['Pair board', '40px', 'Two faces overlap by a third. A top-right badge lands under the other face.'],
  ['Spectator view', '64px', 'Always idle.'],
];

writeFileSync(`${OUT}/Sizes.dc.html`, doc(`<div style="padding: 38px 42px; display: flex; flex-direction: column; gap: 24px;">
  ${head('Plan · where it goes, and where it must not', 'Two surfaces out of nine',
    'Only two places in the whole game ever show a face that is not idle: the TV strip during the run, and the four buttons on the phone. Everywhere else the face is hard-coded idle — and a badge on an idle face invents an emotion the player never sent.')}

  <div style="${PANEL} padding: 20px; display: flex; flex-direction: column; gap: 16px;">
    <p style="${KICK} color: ${N.accent};">The test that decides it — six reactions at 34%, roughly a 1080p TV from the sofa</p>
    <div style="display: flex; gap: 40px; align-items: flex-start;">
      <div style="display: flex; flex-direction: column; gap: 7px;">
        ${SCALE(stripRow(true), 0.34, 416, 74)}
        ${cap('WITH THE BADGE — still four different reactions', N.live)}
      </div>
      <div style="display: flex; flex-direction: column; gap: 7px;">
        ${SCALE(stripRow(false), 0.34, 416, 74)}
        ${cap('AS IT SHIPS TODAY — six identical blue blobs', N.bad)}
      </div>
    </div>
    <div style="display: flex; gap: 40px; align-items: flex-start; padding-top: 4px;">
      <div style="display: flex; flex-direction: column; gap: 7px;">${stripRow(true)}${cap('THE SAME ROW AT FULL SIZE')}</div>
    </div>
  </div>

  <div style="display: flex; gap: 16px; align-items: flex-start;">
    <div style="${PANEL} padding: 18px; flex-grow: 1;">
      <p style="${KICK} color: ${N.live};">Yes — the two reaction surfaces</p>
      <div style="display: flex; gap: 26px; margin-top: 14px; align-items: center;">
        ${stack(face('sus', 56, 6, 6), 'TV STRIP · 56px', N.soft)}
        ${stack(face('boo', 54, 0, 0), 'PHONE PAD · 54px', N.soft)}
      </div>
      <p style="margin: 14px 0 0; ${BODY}">The strip is where it earns its keep. On the phone it is a nice-to-have — the button already has the word CLAP or BOO next to it and nobody is confused.</p>
    </div>
    <div style="${PANEL} padding: 18px; width: 480px; flex-shrink: 0;">
      <p style="${KICK} color: ${N.bad};">Never — the seven idle mounts</p>
      <div style="display: flex; flex-direction: column; gap: 7px; margin-top: 12px;">
        ${NEVER.map(([w, s, why]) => `<div style="display: flex; gap: 10px; align-items: baseline;">
          <span style="width: 128px; flex-shrink: 0; font-size: 12.5px; color: ${N.ink};">${w}</span>
          <span style="width: 44px; flex-shrink: 0; font-size: 11px; color: ${N.dim}; font-family: ui-monospace, monospace;">${s}</span>
          <span style="font-size: 12px; line-height: 1.4; color: ${N.dim};">${why}</span>
        </div>`).join('')}
      </div>
    </div>
  </div>
</div>`));

/* ========================================================== 4 · Motion */
const MOTION = [
  ['CLAP', 'drifts up and down', '±1px', '1.1s'],
  ['BOO', 'drifts down and up', '±1px', '1.0s'],
  ['SUS', 'tilts side to side', '±4°', '1.4s'],
  ['SHOCK', 'breathes bigger', '6%', '0.9s'],
];

writeFileSync(`${OUT}/Motion.dc.html`, doc(`<div style="padding: 38px 42px; display: flex; flex-direction: column; gap: 24px;">
  ${head('Plan · motion', 'Slight, endless, and it must survive being rebuilt mid-flight',
    'Your partner asked for "slightly animated" and slightly is exactly right — about one pixel. At TV distance the motion is invisible anyway; it is for the person holding the phone and for the corner of your eye. The colour does the work across the room.')}

  <div style="display: flex; gap: 16px; align-items: flex-start;">
    <div style="${PANEL} padding: 20px; flex-grow: 1;">
      <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px 18px;">
        ${['', 'WHAT MOVES', 'HOW FAR', 'HOW LONG'].map((h) => `<span style="font-size: 10.5px; letter-spacing: 0.18em; color: ${N.dim};">${h}</span>`).join('')}
        ${MOTION.map(([r, what, amt, dur]) => [
    `<span style="font-size: 13.5px; font-weight: 650; color: ${N.ink};">${r}</span>`,
    `<span style="font-size: 13px; color: ${N.soft};">${what}</span>`,
    `<span style="font-size: 13px; color: ${N.soft}; font-family: ui-monospace, monospace;">${amt}</span>`,
    `<span style="font-size: 13px; color: ${N.soft}; font-family: ui-monospace, monospace;">${dur}</span>`,
  ].join('')).join('')}
      </div>
      <p style="margin: 16px 0 0; ${BODY}">Only the badge moves — never the face. Each loop starts and ends at rest, so if it is interrupted halfway it lands where it already was and nobody sees a jump.</p>
    </div>
    <div style="${PANEL} padding: 20px; width: 400px; flex-shrink: 0; border-left: 3px solid ${N.accent};">
      <p style="${KICK} color: ${N.accent};">Turn motion off and nothing is lost</p>
      <p style="margin: 10px 0 0; ${BODY}">The meaning lives in the shape and the colour, both of which are still. That is the test any of this should pass — if switching the motion off destroyed the information, the motion was carrying the information, and that would be the wrong design.</p>
      <p style="margin: 12px 0 0; ${BODY}">The night screen has no reduced-motion setting at all today, and it already runs three unguarded animations. One goes in with this.</p>
    </div>
  </div>

  <div style="${PANEL} padding: 20px; border-left: 3px solid ${N.bad};">
    <p style="${KICK} color: ${N.bad};">A bug that is already shipping, and it has to be fixed first</p>
    <p style="margin: 10px 0 0; ${BODY} max-width: 104ch;">The TV rebuilds the whole strip whenever anything about it changes — one person reacting rebuilds all six chips. Every rebuild restarts the little rise-in animation on every face, so during a busy run the strip <strong style="color: ${N.ink}; font-weight: 600;">judders continuously</strong>, right under the thing the room is watching. That is happening today with no symbols at all. Adding a looping badge to a container that is destroyed several times a second would stack a second judder on the first.</p>
    <p style="margin: 12px 0 0; ${BODY} max-width: 104ch;"><strong style="color: ${N.ink}; font-weight: 600;">The fix:</strong> add and remove single faces instead of rebuilding the row. It is a smaller change than the symbols are, it kills the existing judder on its own, and it is what makes any animation possible.</p>
  </div>
</div>`));

/* ============================================================ 5 · Plan */
const STEP = [
  ['1', 'Give the strip its space back', 'Option B on the first board — the picture takes what is left after the strip. Nothing else works until the strip is on the television.', 'A gate that measures the strip against the screen edge at 1080p and 720p, so this cannot silently come back.'],
  ['2', 'Stop rebuilding the whole strip', 'Add and remove one face at a time. Fixes the judder that ships today and is the precondition for any motion.', 'A gate that asserts one arrival touches one chip, not six.'],
  ['3', 'Draw the badge', 'Four tiles, four glyphs, fixed colours, inside the existing 100×100 box — the box cannot be widened without breaking the eight-faces-at-once rule.', 'Four different pictures, no element ids, and the badge is absent on idle.'],
  ['4', 'Add the motion', 'One short loop each, plus the reduced-motion switch.', 'A gate that asserts every loop returns to rest, and that the badge still reads with motion off.'],
];

writeFileSync(`${OUT}/Plan.dc.html`, doc(`<div style="padding: 38px 42px; display: flex; flex-direction: column; gap: 24px;">
  ${head('Plan · build order', 'Four steps, in this order',
    'The first two are not about symbols at all — they are the reasons the symbols would not land well today. Each step is separately shippable and each one leaves the game better than it found it.')}

  <div style="display: flex; flex-direction: column; gap: 12px;">
    ${STEP.map(([n, title, what, gate]) => `<div style="${PANEL} padding: 18px 20px; display: flex; gap: 20px; align-items: flex-start;">
      <span style="font-size: 26px; font-weight: 650; color: ${N.accent}; line-height: 1; width: 26px; flex-shrink: 0;">${n}</span>
      <div style="display: flex; flex-direction: column; gap: 6px; flex-grow: 1;">
        <span style="font-size: 17px; font-weight: 650; color: ${N.ink};">${title}</span>
        <p style="margin: 0; ${BODY}">${what}</p>
        <p style="margin: 2px 0 0; font-size: 12.5px; line-height: 1.45; color: ${N.dim};"><strong style="color: ${N.live}; font-weight: 600;">Locked by:</strong> ${gate}</p>
      </div>
    </div>`).join('')}
  </div>

  <p style="margin: 0; ${BODY} max-width: 104ch;">Steps 1 and 2 are fixes to things already shipping and I would do them whatever you decide about symbols. Steps 3 and 4 are your partner&#39;s idea, in the robot&#39;s own vocabulary.</p>
</div>`));

/* ========================================================== canvas */
writeFileSync(`${OUT}/canvas.json`, JSON.stringify({
  artboards: [
    { file: 'Main.dc.html', x: 0, y: 0, w: 1180, h: 700 },
    { file: 'Symbols.dc.html', x: 1280, y: 0, w: 1180, h: 700 },
    { file: 'Sizes.dc.html', x: 0, y: 800, w: 1180, h: 720 },
    { file: 'Motion.dc.html', x: 1280, y: 800, w: 1180, h: 620 },
    { file: 'Plan.dc.html', x: 0, y: 1620, w: 1180, h: 620 },
  ],
  annotations: [
    { id: 'start-here', x: 2520, y: 40, w: 300, text: 'Read Main first — the strip falling off the television is the finding that reorders everything.\n\nThen Symbols for your partner\u2019s idea in the robot\u2019s own vocabulary, and Plan for the order I\u2019d build it in.' },
    { id: 'decision', x: 2520, y: 840, w: 300, text: 'One thing still needs you: Option A or B on Main. I’d take B.\n\nCLAP is settled — it is boo’s chevron mirrored, so up and down read as one control.' },
  ],
  launch: { view: 'canvas' },
}, null, 2));

console.log('wrote 5 artboards + canvas.json');
