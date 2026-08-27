/**
 * Pass 2 — the two things the live capture proved wrong, drawn as options.
 *
 *   node docs/design/refs-loop-redesign/artboards/_build-talk.mjs
 *
 * Shares `_build.mjs`'s chrome so both passes stay one vocabulary (importing it also rebuilds
 * pass 1's artboards, which is the point — one CSS block, one rail, one nameplate).
 *
 * WHAT THE CAPTURE SHOWED (`progress/talk/`, `node harness/talk-frames.mjs`):
 *
 *   1. RECAP is a single narrow column pinned left. Three facts already eat 660 of 955px; the
 *      fourth (OUTCOME, present on any real run) pushes it past the viewport and the beat
 *      SCROLLS. Half the television is black.
 *   2. The talk overlay is `position:absolute; inset:0` on `.talk-stage` — but the stage is a
 *      full-width flex column and the PICTURE is only 1596px wide, centred. So the nameplate,
 *      the kicker and the recap strip are painted in the black gutters BESIDE the picture and
 *      clipped by its edge: "Recko…", "The cir…", "CAME BA…". They do not merely cover the
 *      chairs; half of them are not on the picture at all.
 *
 * So both options below anchor the overlay to the FRAME, and differ only in where the ink goes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CSS, chev, face, rail, bar, clock, ep, doc } from './_build.mjs';

const OUT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const write = (name, inner) => { fs.writeFileSync(path.join(OUT, name), doc(inner), 'utf8'); };

/* ---------------------------------------------------------------- extras */

/**
 * The safe-area rules this pass adds. `--safe-t` / `--safe-b` are the only two numbers that
 * matter: everything the overlay paints lives above the first or below the second, and the band
 * between them is where the seated robots are.
 */
const TALK_CSS = `
    /* SAFE AREA. The seated circle sits in the middle of the ballroom shot, so the middle of the
       shot is not available. Chrome gets the top band and the bottom band and nothing else. */
    :root { --safe-t: 26%; --safe-b: 78%; }
    /* The frame is sized off the STAGE, never off a hard pixel number — a frame taller than the
       stage is exactly how the live build ended up with chrome outside its own picture. */
    .frame { position:relative; height:100%; aspect-ratio:16/9; width:auto; max-width:100%;
      margin:0 auto; overflow:hidden;
      border:2px solid rgba(var(--accent-rgb),.42); border-radius:12px; background:#05070a; }
    .frame > img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
    .frame.dim > img { filter:brightness(.42) saturate(.8); }
    /* The overlay is anchored to the FRAME. This one line is the bug fix. */
    .ov { position:absolute; inset:0; display:flex; flex-direction:column;
      justify-content:space-between; pointer-events:none; }
    .band { padding:14px 20px; display:flex; align-items:flex-start; gap:16px; }
    .band.top { background:linear-gradient(180deg, var(--scrim) 22%, transparent); }
    .band.bot { background:linear-gradient(0deg, var(--scrim) 34%, transparent);
      align-items:flex-end; padding:20px 20px 16px; }
    /* The forbidden middle, drawn only on the annotated boards. */
    .chairband { position:absolute; left:0; right:0; top:var(--safe-t); bottom:calc(100% - var(--safe-b));
      border-top:1px dashed rgba(159,242,200,.5); border-bottom:1px dashed rgba(159,242,200,.5);
      background:rgba(159,242,200,.06); display:flex; align-items:center; justify-content:center; }
    .chairband span { font-size:13px; font-weight:800; letter-spacing:.22em; color:var(--live);
      background:rgba(8,6,4,.7); padding:6px 12px; border-radius:5px; }
    .chip { display:flex; align-items:center; gap:10px; padding:9px 14px; border-radius:7px;
      background:rgba(12,10,8,.82); border:1px solid rgba(var(--accent-rgb),.30); }
    .chip .n { font-size:22px; font-weight:900; line-height:1; }
    .chip .k { font-size:12px; font-weight:800; letter-spacing:.16em; color:var(--dim); }
    .mini { display:flex; gap:9px; }
    .mini b { font-size:13px; font-weight:800; letter-spacing:.16em; padding:7px 11px;
      border-radius:6px; background:rgba(12,10,8,.82);
      border:1px solid rgba(var(--accent-rgb),.24); }
    /* Side dock (option B) */
    .dock { position:absolute; left:0; top:0; bottom:0; width:38%;
      background:linear-gradient(90deg, var(--scrim) 62%, transparent);
      padding:18px 20px; display:flex; flex-direction:column; gap:12px; }
`;

const wrap = (inner) => doc(inner).replace('</style>', `${TALK_CSS}  </style>`);
const put = (name, inner) => fs.writeFileSync(path.join(OUT, name), wrap(inner), 'utf8');

/* ================================================================ RECAP */

const factTile = (k, v, tone, big = false) => `<div class="card" style="display:flex;flex-direction:column;
      justify-content:center;gap:6px;padding:${big ? '18px 26px' : '14px 22px'};min-width:0;">
      <div class="lab" style="font-size:13px;">${k}</div>
      <div style="font-size:${big ? 46 : 38}px;font-weight:900;line-height:1;letter-spacing:-.02em;
        color:${tone};">${v}</div>
    </div>`;

/*
 * RECAP A — FACT WALL. Every fact of the run on one board, as a grid that is SIZED, never
 * flowed: two rows, three columns, both rows share the frame's height. Nothing can push it
 * past the bottom because nothing stacks.
 */
put('RecapA.dc.html', `<div class="tv">
  ${bar(`${ep(2, 'RECAP')}${clock('0:08', true)}`)}
  ${rail('RECAP', { pct: 60 })}
  <div class="stage" style="display:flex;flex-direction:column;gap:12px;padding-bottom:6px;">
    <div style="display:flex;align-items:baseline;gap:18px;flex:0 0 auto;">
      <div class="beat" style="color:var(--accent);font-size:26px;">THAT WAS THE RUN</div>
      <div class="lab">ELLIE WALKED &middot; OZZ TALKED &middot; 1 MIN 42 SEC</div>
    </div>
    <div style="flex:1;min-height:0;display:grid;gap:12px;
      grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:1.35fr 1fr;">
      ${factTile('OUTCOME', 'SMASHED', 'var(--live)', true)}
      ${factTile('CAMERA', 'STAYED DARK', 'var(--bad)', true)}
      ${factTile('RUNNER', 'CAME BACK', 'var(--live)', true)}
      ${factTile('ALARMS TRIPPED', '2', 'var(--ink)')}
      ${factTile('HUNTER GOT WITHIN', '4 m', 'var(--bad)')}
      ${factTile('ROOMS CALLED', '6', 'var(--ink)')}
    </div>
  </div>
  <div class="strip">
    <div class="line">Phones down. Debrief is next.</div>
    <div class="facts">NOBODY&#39;S ALIGNMENT IS REVEALED UNTIL THE REUNION</div>
  </div>
</div>`);

/*
 * RECAP B — OUTCOME SLATE. One word is the beat; the rest is a single strip of chips under it.
 * Loudest possible read from the sofa, and structurally incapable of scrolling — the hero is a
 * flex child that shrinks, the strip is one row.
 */
put('RecapB.dc.html', `<div class="tv">
  ${bar(`${ep(2, 'RECAP')}${clock('0:08', true)}`)}
  ${rail('RECAP', { pct: 60 })}
  <div class="stage bleed" style="position:relative;">
    <div class="plate dim"><img src="plate-chase.jpg" alt=""></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:2px;padding:0 30px;">
      <div class="lab" style="color:var(--accent);">THAT WAS THE RUN</div>
      <div class="hero" style="font-size:150px;color:var(--live);">SMASHED</div>
      <div class="body" style="font-size:23px;color:var(--ink);font-weight:700;margin-top:4px;">
        The camera stayed dark and Ellie walked back in.</div>
      <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:nowrap;">
        ${[['CAMERA', 'DARK', 'var(--bad)'], ['RUNNER', 'HOME', 'var(--live)'],
    ['ALARMS', '2', 'var(--ink)'], ['HUNTER', '4 m', 'var(--bad)'], ['ROOMS CALLED', '6', 'var(--ink)']]
    .map(([k, v, c]) => `<div class="chip"><span class="k">${k}</span>
          <span class="n" style="color:${c};">${v}</span></div>`).join('')}
      </div>
    </div>
  </div>
  <div class="strip">
    <div class="line">Phones down. Debrief is next.</div>
    <div class="facts">NOBODY&#39;S ALIGNMENT IS REVEALED UNTIL THE REUNION</div>
  </div>
</div>`);

/* ============================================================ TALK BEATS */

const noms = [['JOHN', 'Ellie'], ['BEX', 'Mara']];

/*
 * TALK A — TWO BANDS. Overlay anchored to the frame; a scrimmed strip at the top and one at the
 * bottom; the middle belongs to the robots. Nominations become a horizontal row of plates in the
 * bottom band rather than a column down the centre.
 */
put('TalkA.dc.html', `<div class="tv">
  ${bar(`${ep(2, 'RECKONING')}${clock('0:31')}`)}
  ${rail('RECKONING', { pct: 45 })}
  <div class="stage" style="display:flex;align-items:center;justify-content:center;padding:0 24px 10px;">
    <div class="frame">
      <img src="plate-ballroom.jpg" alt="">
      <div class="chairband"><span>THE SEATED CIRCLE &middot; NO CHROME HERE</span></div>
      <div class="ov">
        <div class="band top" style="justify-content:space-between;align-items:center;">
          <div class="mini">
            <b class="salmon">CAM DARK</b><b class="mint">CAME BACK</b><b>ALARMS 2</b>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="lab" style="font-size:12px;">NOMINATE &middot; 2 OF 5 IN</div>
            <div class="clock" style="font-size:44px;">0:31</div>
          </div>
        </div>
        <div class="band bot" style="flex-direction:column;align-items:stretch;gap:10px;">
          <div style="display:flex;gap:12px;">
            ${noms.map(([by, who], i) => `<div class="card lit" style="flex:1;padding:10px 16px;
            display:flex;align-items:center;gap:13px;background:rgba(12,10,8,.86);">
            <div style="color:var(--accent);font-size:20px;font-weight:900;">${i + 1}</div>
            ${chev('var(--accent)', 38)}
            <div>
              <div class="lab" style="font-size:11px;">NAMED BY ${by}</div>
              <div style="font-size:32px;font-weight:900;line-height:1.05;">${who}</div>
            </div>
          </div>`).join('')}
          </div>
          <div class="facts" style="text-align:center;font-size:13px;font-weight:700;
            letter-spacing:.20em;text-transform:uppercase;color:var(--soft);">
            FIRST TAP STANDS &middot; YOU CANNOT NAME YOURSELF</div>
        </div>
      </div>
    </div>
  </div>
</div>`);

/*
 * TALK B — SIDE DOCK. Overlay anchored to the frame, but everything lives in one column down the
 * left over a horizontal scrim. The robots keep the right two thirds. Holds a long list without
 * growing downward, which the bottom band cannot.
 */
put('TalkB.dc.html', `<div class="tv">
  ${bar(`${ep(2, 'RECKONING')}${clock('0:31')}`)}
  ${rail('RECKONING', { pct: 45 })}
  <div class="stage" style="display:flex;align-items:center;justify-content:center;padding:0 24px 10px;">
    <div class="frame">
      <img src="plate-ballroom.jpg" alt="">
      <div class="chairband"><span>THE SEATED CIRCLE &middot; NO CHROME HERE</span></div>
      <div class="dock">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;">
          <div class="lab" style="color:var(--accent);font-size:12px;">NOMINATE</div>
          <div class="clock" style="font-size:40px;">0:31</div>
        </div>
        <div class="mini" style="flex-wrap:wrap;">
          <b class="salmon">CAM DARK</b><b class="mint">CAME BACK</b>
        </div>
        <div style="display:flex;flex-direction:column;gap:9px;margin-top:2px;">
          ${noms.map(([by, who], i) => `<div class="card lit" style="padding:10px 14px;display:flex;
          align-items:center;gap:11px;background:rgba(12,10,8,.86);">
          <div style="color:var(--accent);font-size:18px;font-weight:900;">${i + 1}</div>
          <div>
            <div class="lab" style="font-size:11px;">NAMED BY ${by}</div>
            <div style="font-size:29px;font-weight:900;line-height:1.05;">${who}</div>
          </div>
        </div>`).join('')}
        </div>
        <div style="margin-top:auto;">
          <div class="body" style="font-size:16px;">First tap stands. You cannot name yourself.</div>
        </div>
      </div>
    </div>
  </div>
</div>`);

/*
 * TALK A applied to the loudest beat there is. EXECUTION and VERDICT are the test of the two-band
 * idea: a hero word wants the middle of the screen and the middle of the screen is exactly what
 * it cannot have. It goes in the bottom band, sized to the band rather than to the frame.
 */
put('TalkVerdict.dc.html', `<div class="tv">
  ${bar(`${ep(2, 'EXECUTION')}${clock('0:14')}`)}
  ${rail('EXECUTION', { pct: 30 })}
  <div class="stage" style="display:flex;align-items:center;justify-content:center;padding:0 24px 10px;">
    <div class="frame dim">
      <img src="plate-ballroom.jpg" alt="">
      <div class="chairband"><span>THE SEATED CIRCLE &middot; NO CHROME HERE</span></div>
      <div class="ov">
        <div class="band top" style="justify-content:space-between;align-items:center;">
          <div class="mini"><b>3 VOTES TO 1</b><b>JOHN SWINGS</b></div>
          <div class="clock" style="font-size:44px;">0:14</div>
        </div>
        <div class="band bot" style="flex-direction:column;align-items:stretch;gap:8px;">
          <div style="display:flex;align-items:flex-end;gap:22px;">
            <div style="flex:0 0 auto;">
              <div class="lab" style="color:var(--accent);font-size:12px;">THE HOUSE HAS VOTED OFF</div>
              <div style="font-size:82px;font-weight:900;line-height:.92;letter-spacing:-.02em;">Ellie</div>
            </div>
            <div style="flex:1;display:flex;align-items:center;gap:12px;justify-content:flex-end;">
              <div class="chip"><span class="k">HER CARD</span><span class="n amber">FACE DOWN</span></div>
              <div class="chip"><span class="k">LEFT IN</span><span class="n">4</span></div>
            </div>
          </div>
          <div class="facts" style="text-align:center;font-size:13px;font-weight:700;
            letter-spacing:.20em;text-transform:uppercase;color:var(--soft);">
            NOBODY LEARNS A THING UNTIL THE REUNION</div>
        </div>
      </div>
    </div>
  </div>
</div>`);

/* --------------------------------------------------------------- before */

/** The measured bug, drawn, so the two options have something to be better than. */
put('Before.dc.html', `<div class="tv">
  ${bar(`${ep(1, 'RECKONING')}${clock('0:31')}`)}
  ${rail('RECKONING', { pct: 45 })}
  <div class="stage" style="display:flex;align-items:center;justify-content:center;position:relative;padding:0 24px 10px;">
    <div class="frame" style="width:1040px;">
      <img src="plate-ballroom.jpg" alt="">
    </div>
    <div style="position:absolute;left:0;top:6px;">
      <div class="mini"><b class="salmon">CAM DARK</b><b class="mint">CAME BA</b></div>
    </div>
    <div style="position:absolute;right:0;top:8px;max-width:180px;">
      <div class="body" style="font-size:17px;">Waiting on phones &mdash; nominate.</div>
    </div>
    <div style="position:absolute;left:0;bottom:14px;">
      <div style="display:flex;align-items:center;gap:12px;background:rgba(0,0,0,.62);
        padding:8px 16px 8px 8px;border-radius:0 12px 12px 0;">
        <div><div style="font-size:44px;font-weight:900;line-height:1;">Recko</div>
          <div class="lab" style="color:var(--accent);font-size:12px;margin-top:4px;">LIVE &middot; WAITING</div></div>
      </div>
      <div class="lab" style="margin-top:8px;">NOMINATE. FIRST TAP S</div>
    </div>
    <div style="position:absolute;left:50%;top:14px;transform:translateX(-50%);
      background:rgba(255,138,122,.14);border:1px solid var(--bad);border-radius:6px;
      padding:7px 14px;font-size:13px;font-weight:800;letter-spacing:.18em;color:var(--bad);">
      MEASURED &middot; INK LANDS OUTSIDE THE PICTURE AND IS CLIPPED
    </div>
  </div>
</div>`);

/* ------------------------------------------------------------- manifest
 * Pass 2 is a THIRD PAGE on the same canvas, not a second canvas — it is the same television and
 * the same rail, so it belongs beside the night it fixes. `_build.mjs` writes pages 1 and 2; this
 * runs after it and rewrites the manifest with all three.
 */
const A = (file, x, y, page) => ({ file, x, y, w: 1280, h: 720, page });
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'canvas.json'), 'utf8'));

manifest.pages.push({ id: 'page-3', name: 'Fixes — Recap + talk overlays' });
manifest.artboards.push(
  A('Before.dc.html', 0, 0, 'page-3'),
  A('RecapA.dc.html', 1400, 0, 'page-3'),
  A('RecapB.dc.html', 2800, 0, 'page-3'),
  A('TalkA.dc.html', 0, 900, 'page-3'),
  A('TalkB.dc.html', 1400, 900, 'page-3'),
  A('TalkVerdict.dc.html', 2800, 900, 'page-3'),
);
manifest.annotations.push(
  {
    id: 'fix-before', x: 0, y: -230, w: 470, page: 'page-3',
    text: 'BEFORE — measured, not guessed\nnode harness/talk-frames.mjs · progress/talk/\n\nThe overlay is pinned to the STAGE (full 1920) while the picture is 1596 wide and centred. So the nameplate, the kicker and the recap strip paint in the black gutters and the picture clips them: "Recko…", "The cir…", "CAME BA…".\n\nRecap separately: one narrow column pinned left. Three facts fill it; the fourth scrolls the beat off screen.',
  },
  {
    id: 'fix-recap', x: 1400, y: -230, w: 470, page: 'page-3',
    text: 'RECAP A — FACT WALL  (recommended)\nSix facts as a 3x2 grid that is SIZED, not stacked. Rows share the frame height, so no fact count can ever push it off the screen.\n\nWhy: the beat exists to hand the room things to argue about in Debrief. Six of them, all readable, no scroll.\nCost: no single hero word.\n\nRECAP B beside it trades five of those facts for one huge SMASHED. Louder, thinner.',
  },
  {
    id: 'fix-talk', x: 0, y: -230, w: 470, page: 'page-3',
    text: 'TALK A — TWO BANDS  (recommended)\nOverlay anchored to the FRAME. A scrimmed strip along the top, one along the bottom, and the middle band belongs to the seated robots. Nominations run left-to-right in the bottom band instead of down the centre.\n\nWhy: one rule holds for every talk beat, including the loud ones — see the Execution board.\nCost: a long list has to stay a row, so the bottom band caps at about five plates.\n\nTALK B (side dock) holds a longer list, but its own cards cross into the chair band. That is what ruled it out.',
  },
);
manifest.launch = { view: 'canvas', page: 'page-3' };
fs.writeFileSync(path.join(OUT, 'canvas.json'), JSON.stringify(manifest, null, 2), 'utf8');

console.log('built pass-2 artboards + 3-page canvas.json');
