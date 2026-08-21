#!/usr/bin/env node
/**
 * IN-GAME REGION CONTRAST — does a body part still separate from the room behind it?
 *
 *   node harness/evidence/_rd1-legcontrast.mjs --img a.png [--img b.png ...] [--boxes boxes.json]
 *   node harness/evidence/_rd1-legcontrast.mjs --img a.png --annotate out.png
 *
 * WHY THIS EXISTS. `_kit8_shellvalue.mjs` measures the figure against the ART, in the STUDIO,
 * on a chroma key. It is the right instrument for the art bar and the wrong one for this
 * question, because the studio's near-white cyc is exactly the environment that hides the
 * defect being chased here: a metal has no diffuse albedo, so a chrome region is only ever as
 * bright as what it reflects. On the white cyc it mirrors white and reads bright silver; in the
 * game's dark rooms it mirrors near-black and IS black. A number measured on the cyc therefore
 * says nothing whatever about whether the legs read in the game.
 *
 * So this measures the GAME frame, in FIXED SCREEN BOXES. That is only legitimate because the
 * A and B captures are the same seed at the same simulated moment with only a URL flag
 * differing, so the figure is in identical pixels in both and a fixed box samples the same
 * piece of the character in each.
 *
 * ⚠️ THE CONTROLS ARE THE POINT. Every run prints FLOOR and WALL boxes that contain no part of
 * the character. If a change moves those, it is not a change to the character — it is an
 * exposure or grade change, and every "restored contrast" number in that run is worthless.
 * The same applies to HEAD and CHEST: they are white shell, not chrome, and a chrome-only
 * feature that moves them has leaked.
 *
 * ⚠️ USE --annotate ONCE PER BOX SET AND LOOK AT IT. A box that has slipped onto the floor
 * still prints a complete, plausible, entirely wrong table. That is the failure mode this
 * project keeps paying for, and the annotated PNG is one capture that makes it impossible.
 *
 * Luma is Rec.709 on the sRGB bytes as displayed — the quantity the eye is being asked about,
 * not a linear radiance. CONTRAST is |median(region) - median(reference)| in luma LEVELS.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const many = (n) => argv.reduce((a, v, i) => (v === `--${n}` ? [...a, argv[i + 1]] : a), []);
const one = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

/*
 * THE BOX SET, in 1920x1080 capture pixels, for `game.play` at
 * `?mesh=1&quality=medium&seed=s4` captured with `--seconds 6`.
 *
 * They were placed by eye on that frame and then CHECKED with --annotate; the annotated sheet
 * is the evidence that they sit where these names claim, and a new moment needs a new set and
 * a new annotated sheet. `ref` names which box each region is judged against.
 */
const BOXES = {
  headM:   { x: 1022, y: 500, w: 60, h: 46,  ref: 'wallFar', kind: 'shell'   },
  chestM:  { x: 1046, y: 596, w: 56, h: 44,  ref: 'wallFar', kind: 'shell'   },
  thighM:  { x: 1048, y: 706, w: 46, h: 42,  ref: 'floorL',  kind: 'shell'   },
  shinL:   { x: 1006, y: 800, w: 26, h: 78,  ref: 'floorL',  kind: 'CHROME'  },
  shinR:   { x: 1124, y: 812, w: 26, h: 74,  ref: 'floorR',  kind: 'CHROME'  },
  forearm: { x: 1148, y: 620, w: 26, h: 40,  ref: 'wallR',   kind: 'CHROME'  },
  // ---- controls: no part of the character is inside any of these ----
  floorL:  { x: 900,  y: 838, w: 70, h: 60,  control: true },
  floorR:  { x: 1210, y: 860, w: 70, h: 60,  control: true },
  wallFar: { x: 890,  y: 470, w: 60, h: 50,  control: true },
  wallR:   { x: 1230, y: 600, w: 50, h: 44,  control: true },
};

async function sample(file, boxes) {
  const b64 = (await readFile(file)).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const out = await page.evaluate(async ({ b64, boxes }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const res = { w: img.width, h: img.height, r: {} };
    for (const [name, b] of Object.entries(boxes)) {
      const d = g.getImageData(b.x, b.y, b.w, b.h).data;
      const L = [];
      for (let i = 0; i < d.length; i += 4) {
        L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      }
      L.sort((p, q) => p - q);
      const q = (f) => L[Math.min(L.length - 1, Math.floor(f * L.length))];
      res.r[name] = { p10: q(0.10), med: q(0.50), p90: q(0.90),
        mean: L.reduce((a, v) => a + v, 0) / L.length, n: L.length };
    }
    return res;
  }, { b64, boxes });
  await browser.close();
  return out;
}

async function annotate(file, boxes, outPath) {
  const b64 = (await readFile(file)).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const url = await page.evaluate(async ({ b64, boxes }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.lineWidth = 2; g.font = 'bold 15px monospace';
    for (const [name, b] of Object.entries(boxes)) {
      const col = b.control ? '#ff3b3b' : (b.kind === 'CHROME' ? '#39d6ff' : '#ffe14d');
      g.strokeStyle = col; g.strokeRect(b.x, b.y, b.w, b.h);
      g.fillStyle = col; g.fillText(name, b.x, b.y - 4);
    }
    return c.toDataURL('image/png');
  }, { b64, boxes });
  await browser.close();
  await writeFile(outPath, Buffer.from(url.split(',')[1], 'base64'));
  console.log('annotated ->', outPath);
}

const imgs = many('img');
if (!imgs.length) { console.error('need --img'); process.exit(2); }
const boxFile = one('boxes', null);
const boxes = boxFile ? JSON.parse(await readFile(boxFile, 'utf8')) : BOXES;

const ann = one('annotate', null);
if (ann) await annotate(imgs[0], boxes, ann);

const all = [];
for (const f of imgs) all.push({ f, s: await sample(f, boxes) });

const names = Object.keys(boxes);
const label = (f) => f.replace(/\\/g, '/').split('/').pop();

console.log('\n=== MEDIAN LUMA (sRGB levels) ===');
console.log(['region'.padEnd(9), ...all.map(a => label(a.f).padStart(16))].join(''));
for (const n of names) {
  const tag = boxes[n].control ? '*' : (boxes[n].kind === 'CHROME' ? '#' : ' ');
  console.log([`${tag}${n}`.padEnd(9),
    ...all.map(a => a.s.r[n].med.toFixed(1).padStart(16))].join(''));
}

console.log('\n=== CONTRAST vs its reference box (luma levels, |diff of medians|) ===');
console.log(['region'.padEnd(9), 'ref'.padEnd(9), ...all.map(a => label(a.f).padStart(16))].join(''));
for (const n of names) {
  const b = boxes[n];
  if (!b.ref) continue;
  console.log([`${b.kind === 'CHROME' ? '#' : ' '}${n}`.padEnd(9), b.ref.padEnd(9),
    ...all.map(a => Math.abs(a.s.r[n].med - a.s.r[b.ref].med).toFixed(1).padStart(16))].join(''));
}
/*
 * ⚠️ THE MEDIAN IS THE WRONG STATISTIC FOR THIS DEFECT AND THE p10 IS THE RIGHT ONE.
 *
 * A chrome shin in a lit room is not uniformly dark: it carries a bright specular streak down
 * one edge and is near-black over the rest. The MEDIAN of the box is dragged up by the streak,
 * so a leg that reads as a black stick with a highlight on it can post a perfectly respectable
 * median. What collapsed when chrome went metal is the DARK SIDE of the limb — the part that is
 * only ever as bright as what it reflects — and p10 is where that lives.
 *
 * The same asymmetry breaks |median difference| as a contrast measure in a BRIGHT room: the
 * floor here sits at 162.8, well ABOVE the shin, so lifting the shin off black moves it TOWARD
 * the floor and the difference falls even as the leg becomes readable. Read the floor/wall
 * contrast rows only where the region and its reference are both dark — which in this frame is
 * the forearm against wallR, the pair that reproduces the pre-existing failure.
 */
console.log('\n=== p10 LUMA — the DARK SIDE of each region, which is what went black ===');
console.log(['region'.padEnd(9), ...all.map(a => label(a.f).padStart(16))].join(''));
for (const n of names) {
  const tag = boxes[n].control ? '*' : (boxes[n].kind === 'CHROME' ? '#' : ' ');
  console.log([`${tag}${n}`.padEnd(9),
    ...all.map(a => a.s.r[n].p10.toFixed(1).padStart(16))].join(''));
}
console.log('\n# = chrome region (the feature)   * = CONTROL, must not move');
