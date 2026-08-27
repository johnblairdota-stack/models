#!/usr/bin/env node
/**
 * ballroom-luma — the DELIVERED luma of one surface against the surface beside it.
 *
 *   node harness/ballroom-luma.mjs                      every probe, at every station
 *   node harness/ballroom-luma.mjs --probe plates
 *   node harness/ballroom-luma.mjs --probe plates --only arch
 *   node harness/ballroom-luma.mjs --names              just list the mesh names in the room
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS EXISTS — IT IS THE SHAPE OF A MISTAKE, NOT A NEW IDEA
 * ---------------------------------------------------------------------------------------------
 * The pier glass's dielectric (`room.js`, `ball.mirror`) WAS solved by measuring plate luma
 * against wall luma. Correct arithmetic — and it still shipped the defect it was meant to fix,
 * because it was measured at ONE station, `ballroom.east`, and the answer does not survive
 * delivery to the other wall. At `arch` and `wide` the end wall stands in shadow while the
 * plates catch the arch wash, so a value tuned to "match the boiserie" floats well above it and
 * reads as a blank pale slab — which is `docs/handoff/ballroom-next.md` D1, the worst thing in
 * the room.
 *
 * The handoff's rule is *"verify delivered pixels, never authored hex values"*, and it has a
 * mechanism behind it: the grade applies `col = (col - 0.5) * contrast + 0.5` BEFORE the toe, so
 * everything under scene-linear ~0.030 clamps to literal zero and nothing recovers it. An
 * authored hex cannot be checked against that. A photographed pixel can.
 *
 * ---------------------------------------------------------------------------------------------
 * HOW A SURFACE FINDS ITSELF: A RENDERED MASK, NEVER A TYPED RECTANGLE
 * ---------------------------------------------------------------------------------------------
 * A screen rectangle read off a screenshot is right for exactly one seed, and this ballroom is
 * generated per night at a different size every time. So each surface locates itself: the scene
 * is redrawn with every mesh forced flat black except the one under test, which is forced flat
 * white. The white pixels ARE that surface — wherever the seed put it, and correctly minus
 * whatever furniture stands in front of it.
 *
 * ⚠️ **THE MASK IS ERODED BY `ERODE_PX` BEFORE IT IS USED.** The room renders through bloom, so
 * a white mask BLEEDS into the black around it and the fringe would be counted as surface — a
 * subject's edge pixels are its neighbour's. Only pixels whose whole neighbourhood is lit
 * survive. Take the erosion out and the two populations contaminate each other; that is this
 * tool's own control, `--no-erode`, and the numbers visibly converge when it is off.
 *
 * ⚠️ **THE REFERENCE IS NARROWED TO `NEAR_PX` ON THE SUBJECT'S OWN ROWS.** "The wall behind
 * them" has to mean the wall actually behind them, not a lit wall forty degrees away — the whole
 * failure being reproduced is a correct average taken over the wrong wall. Widen this and the
 * tool reproduces the bug it exists to catch.
 *
 * ⚠️ **THE DOM CHROME IS HIDDEN FOR EVERY PASS, BEAUTY INCLUDED.** `RRR CAM 01` is white text
 * sitting over the canvas and was counted as mask the first time this ran.
 *
 * A diagnostic, not a gate: it needs a browser and a built `dist`. The gate that holds the
 * finding is `harness/ballroom-dress.mjs`.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
const PROBES = (arg('--probe', '') || '').split(',').filter(Boolean);
const WEB = +arg('--port', 5194);
const SEED = arg('--seed', '1');
const NAMES_ONLY = has('--names');
const ERODE = has('--no-erode') ? 0 : +arg('--erode', 2);
const OUT = path.join(ROOT, 'progress', 'luma');
const W = 900, H = 600;
const NEAR_PX = +arg('--near', 150);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s) => console.log(s);

/* The stations are `ballroom-compare.mjs`'s, verbatim and for its reason: fractions of each
 * room's own bounds, so a generated room of another size is still the same place in the room. */
const STATIONS = {
  arch:   { eye: { u: 0.50, v: 0.78, y: 1.62 }, at: { u: 0.50, v: 0.02, y: 1.70 } },
  wide:   { eye: { u: 0.50, v: 0.92, y: 4.60 }, at: { u: 0.50, v: 0.10, y: 1.20 } },
  floor:  { eye: { u: 0.50, v: 0.62, y: 1.35 }, at: { u: 0.34, v: 0.14, y: 0.02 } },
  mirror: { eye: { u: 0.22, v: 0.50, y: 1.62 }, at: { u: 0.98, v: 0.50, y: 2.40 } },
};

/* A probe is a SUBJECT mesh name and a REFERENCE mesh name. Names rather than materials:
 * `kit:<key>` and `pier-mirrors` are what the builders actually set, and they are stable. */
const PROBE_SPEC = {
  plates: {
    why: 'D1 · the pier glasses against the end wall behind them',
    subject: 'pier-mirrors', reference: 'kit:wall',
    want: 'ratio <= 1.00 — a dead mirror is not brighter than its own wall',
    stations: ['arch', 'wide', 'mirror'],
  },
  chequer: {
    why: 'D3 · the marble border against the parquet it rings',
    subject: 'kit:floormarble', reference: 'kit:floor',
    want: 'ratio <= 1.00 — the border must not be the brightest surface in the room',
    stations: ['floor', 'wide', 'arch'],
  },
};

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});

console.log('\nballroom-luma — delivered pixels, a surface against its neighbour\n');
if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  throw new Error('no dist/index.html — run `npm run build` first. This harness never uses vite.');
}
const kids = [];
if (await portOpen(WEB)) say(`  reusing a page server on :${WEB}`);
else {
  kids.push(spawn(process.execPath, [path.join(ROOT, 'harness/serve.mjs'), '--port', String(WEB), '--dir', 'dist'], { cwd: ROOT, stdio: 'ignore' }));
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(await portOpen(WEB))) await sleep(200);
  say(`  serving dist on :${WEB}`);
}
const base = `http://127.0.0.1:${WEB}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let exitCode = 1;

const resolve = (b, p) => [b.x0 + (b.x1 - b.x0) * p.u, p.y, b.z0 + (b.z1 - b.z0) * p.v];
const pose = (b, st) => [...resolve(b, st.eye), ...resolve(b, st.at), 55].map((n) => n.toFixed(3)).join(',');

/*
 * Installed once per page. `THREE` is not a global in the built bundle, so the mask materials are
 * CLONED off a material already in the scene and then flattened — `emissive` white with a black
 * albedo is lighting-independent on a standard material, which is what a mask has to be.
 */
const PAGE_LIB = `
window.__luma = (() => {
  const R = window.__rrrFollow.room;
  const ball = R.spaces.find((q) => q.order === 'ballroom') || R.spaces.find((q) => q.roomType === 'ballroom');
  let scene = R.spaces[0].root;
  while (scene.parent) scene = scene.parent;
  const meshes = [];
  scene.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) meshes.push(o); });
  /*
   * A MESH NAME IS NOT UNIQUE -- 'kit:wall' exists once per space (13 of them). At the 'arch'
   * station the camera looks straight through the archway into the next room, so a name-only
   * mask made the NEXT ROOM'S wall part of "the wall behind the plates" and dragged the
   * reference toward black. Subject and reference are both confined to the ballroom subtree.
   */
  const inBall = new Set();
  if (ball) ball.root.traverse((o) => { if (o.isMesh) inBall.add(o); });
  let proto = null;
  for (const m of meshes) if (!proto && m.material.isMeshStandardMaterial) proto = m.material;
  if (!proto) throw new Error('no standard material to clone a mask from');
  const flat = (on) => {
    const m = proto.clone();
    m.map = null; m.normalMap = null; m.roughnessMap = null; m.metalnessMap = null;
    m.aoMap = null; m.emissiveMap = null; m.alphaMap = null; m.bumpMap = null;
    m.vertexColors = false; m.transparent = false; m.opacity = 1; m.depthWrite = true;
    m.roughness = 1; m.metalness = 0; m.toneMapped = false; m.envMapIntensity = 0;
    m.color.setRGB(0, 0, 0);
    m.emissive.setRGB(on ? 1 : 0, on ? 1 : 0, on ? 1 : 0);
    m.emissiveIntensity = on ? 1 : 0;
    m.side = 2;
    return m;
  };
  const white = flat(true), black = flat(false);
  const saved = new Map();
  let bg;
  return {
    names: () => {
      const c = new Map();
      for (const m of meshes) c.set(m.name || '(unnamed)', (c.get(m.name || '(unnamed)') || 0) + 1);
      return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    },
    hideChrome: () => {
      for (const el of Array.from(document.body.children)) {
        if (el.tagName !== 'CANVAS') { el.style.visibility = 'hidden'; }
      }
    },
    mask: (which) => {
      let hits = 0;
      for (const m of meshes) {
        if (!saved.has(m)) saved.set(m, m.material);
        const on = m.name === which && (!inBall.size || inBall.has(m));
        if (on) hits++;
        m.material = on ? white : black;
      }
      bg = scene.background; scene.background = null;
      return hits;
    },
    restore: () => {
      for (const [m, mat] of saved) m.material = mat;
      saved.clear();
      scene.background = bg;
    },
  };
})();
`;

/** All the pixel arithmetic, done in-page where the PNGs can be decoded for free. */
async function measure(page, beauty, subjMask, refMask, near, erode) {
  return page.evaluate(async ([b, s, r, near, erode]) => {
    const load = async (d) => {
      const img = await createImageBitmap(await (await fetch(d)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      return { d: x.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
    };
    const B = await load(b), S = await load(s), R = await load(r);
    const lum = (dd, i) => 0.2126 * dd[i] + 0.7152 * dd[i + 1] + 0.0722 * dd[i + 2];

    /*
     * A mask bit, then eroded.
     *
     * THE THRESHOLD IS RELATIVE TO THE MASK'S OWN PEAK, AND THAT IS NOT TIDINESS. A flat white
     * emissive does NOT arrive at 255: the mask is photographed through the same grade and
     * highlight rolloff as everything else, and a full-white plate lands at exactly 170. A fixed
     * `> 170` therefore matched ZERO pixels and the tool reported "not measurable" on a mask
     * that had rendered perfectly. The population is strongly bimodal -- at this station 25570
     * pixels clear 120 and only 97 more clear 80 -- so half the peak sits in open space between
     * the two modes and follows the grade wherever it goes.
     *
     * Then eroded: the room renders through bloom, so a lit mask BLEEDS into the black around it
     * and that fringe belongs to the neighbour, not to the subject.
     */
    const peakOf = (M) => { let mx = 0; for (let i = 0; i < M.d.length; i += 4) { const v = Math.min(M.d[i], M.d[i + 1], M.d[i + 2]); if (v > mx) mx = v; } return mx; };
    const bits = (M) => {
      const t = Math.max(48, peakOf(M) * 0.55);
      const raw = new Uint8Array(M.w * M.h);
      for (let i = 0, p = 0; p < raw.length; p++, i += 4) {
        raw[p] = (M.d[i] > t && M.d[i + 1] > t && M.d[i + 2] > t) ? 1 : 0;
      }
      if (!erode) return raw;
      let cur = raw;
      for (let pass = 0; pass < erode; pass++) {
        const next = new Uint8Array(cur.length);
        for (let y = 1; y < M.h - 1; y++) {
          for (let x = 1; x < M.w - 1; x++) {
            const p = y * M.w + x;
            next[p] = cur[p] && cur[p - 1] && cur[p + 1] && cur[p - M.w] && cur[p + M.w] ? 1 : 0;
          }
        }
        cur = next;
      }
      return cur;
    };
    const sb = bits(S), rb = bits(R);
    /* Diagnostics, because "0 pixels" has to say WHY: a mask that renders but does not clear
     * the threshold is a different fault from a mask that never drew. */
    const peak = peakOf;
    const rawCount = (M, t) => { let n = 0; for (let i = 0; i < M.d.length; i += 4) if (M.d[i] > t && M.d[i+1] > t && M.d[i+2] > t) n++; return n; };
    const diag = { subjPeak: peak(S), refPeak: peak(R),
      subjRaw170: rawCount(S, 170), subjRaw120: rawCount(S, 120), subjRaw80: rawCount(S, 80),
      subjAfterErode: sb.reduce((a, b) => a + b, 0), refAfterErode: rb.reduce((a, b) => a + b, 0) };

    const subj = [];
    const rowSpan = new Map();
    for (let y = 0; y < B.h; y++) {
      for (let x = 0; x < B.w; x++) {
        const p = y * B.w + x;
        if (!sb[p]) continue;
        subj.push(lum(B.d, p * 4));
        const sp = rowSpan.get(y);
        if (!sp) rowSpan.set(y, [x, x]);
        else { if (x < sp[0]) sp[0] = x; if (x > sp[1]) sp[1] = x; }
      }
    }
    const ref = [];
    for (const [y, sp] of rowSpan) {
      const lo = Math.max(0, sp[0] - near), hi = Math.min(B.w, sp[1] + near);
      for (let x = lo; x < hi; x++) {
        const p = y * B.w + x;
        if (rb[p]) ref.push(lum(B.d, p * 4));
      }
    }
    const stat = (a) => {
      if (!a.length) return null;
      const srt = [...a].sort((p, q) => p - q);
      return { n: a.length, mean: a.reduce((p, q) => p + q, 0) / a.length,
        med: srt[srt.length >> 1], p90: srt[Math.floor(srt.length * 0.9)] };
    };
    return { subject: stat(subj), reference: stat(ref), diag };
  }, [beauty, subjMask, refMask, near, erode]);
}

const png = async (p) => 'data:image/png;base64,' + (await p.screenshot()).toString('base64');

try {
  await mkdir(OUT, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });

  const boot = async (poseStr) => {
    const p = await ctx.newPage();
    const q = poseStr ? `&campose=${encodeURIComponent(poseStr)}` : '';
    await p.goto(`${base}/?view=party.follow&runner=p1&name=Hai&seed=${SEED}&still=1${q}`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.body.dataset.rrrFollow === 'live', null, { timeout: 300000, polling: 1000 });
    await sleep(2500);
    return p;
  };

  const p0 = await boot(null);
  const bounds = await p0.evaluate(() => {
    const s = window.__rrrFollow.room.spaces.find((q) => q.order === 'ballroom')
      || window.__rrrFollow.room.spaces.find((q) => q.roomType === 'ballroom');
    return s ? { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 } : null;
  });
  if (!bounds) throw new Error('the game has no ballroom space to measure');
  if (NAMES_ONLY) {
    await p0.evaluate(PAGE_LIB);
    const names = await p0.evaluate(() => window.__luma.names());
    say('\n  mesh names in the scene:\n');
    for (const [n, c] of names) say(`    ${String(c).padStart(4)}  ${n}`);
    await p0.close();
    exitCode = 0;
  } else {
    await p0.close();
    const wanted = Object.entries(PROBE_SPEC).filter(([k]) => !PROBES.length || PROBES.includes(k));
    const lines = [];
    for (const [key, spec] of wanted) {
      say(`\n  ${key} — ${spec.why}`);
      say(`    want: ${spec.want}`);
      for (const stId of spec.stations) {
        if (ONLY.length && !ONLY.includes(stId)) continue;
        const p = await boot(pose(bounds, STATIONS[stId]));
        await p.evaluate(PAGE_LIB);
        await p.evaluate(() => window.__luma.hideChrome());
        await sleep(300);
        const beauty = await png(p);
        const nSub = await p.evaluate((n) => window.__luma.mask(n), spec.subject);
        await sleep(350);
        const sMask = await png(p);
        await p.evaluate(() => window.__luma.restore());
        const nRef = await p.evaluate((n) => window.__luma.mask(n), spec.reference);
        await sleep(350);
        const rMask = await png(p);
        await p.evaluate(() => window.__luma.restore());
        await sleep(200);
        const m = await measure(p, beauty, sMask, rMask, NEAR_PX, ERODE);
        await writeFile(path.join(OUT, `${key}.${stId}.beauty.png`), Buffer.from(beauty.split(',')[1], 'base64'));
        await writeFile(path.join(OUT, `${key}.${stId}.subject.png`), Buffer.from(sMask.split(',')[1], 'base64'));
        await p.close();

        const S = m.subject, R = m.reference;
        if (!S || !R) {
          say(`    ${stId.padEnd(7)} subject px ${S ? S.n : 0} · reference px ${R ? R.n : 0} — NOT MEASURABLE (meshes ${nSub}/${nRef})`);
          say(`            diag ${JSON.stringify(m.diag)}`);
          lines.push({ key, stId, ratio: null });
          continue;
        }
        const ratio = S.mean / R.mean;
        say(`    ${stId.padEnd(7)} subject mean ${S.mean.toFixed(1)} (n=${S.n})  ·  reference mean ${R.mean.toFixed(1)} (n=${R.n})  ·  ratio ${ratio.toFixed(2)}${ratio > 1.0 ? '   <-- brighter than its neighbour' : ''}`);
        lines.push({ key, stId, subject: S, reference: R, ratio });
      }
    }
    await writeFile(path.join(OUT, 'luma.json'), JSON.stringify(lines, null, 2));
    say(`\n  progress/luma/luma.json\n`);
    exitCode = 0;
  }
} catch (e) {
  console.error(`\n  ballroom-luma died: ${e?.stack || e}\n`);
} finally {
  await browser.close().catch(() => {});
  for (const k of kids) k.kill();
  process.exit(exitCode);
}
