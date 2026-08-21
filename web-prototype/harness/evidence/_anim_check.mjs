#!/usr/bin/env node
/**
 * DOES A RIG DEFORM CLEANLY, AND DOES IT STAY ON THE SPOT? — every clip, several phases, measured.
 *
 *   node harness/evidence/_anim_check.mjs [--clip friendly] [--anims Walking,Running,Attack]
 *   node harness/evidence/_anim_check.mjs --clip n30 --anims Walking --control-bind
 *
 * WHY MEASURE AND NOT JUST LOOK. An auto-rig fails in ways a single still hides: a shoulder that
 * collapses only at full reach, a hip that pinches at one phase of the cycle, a stray vertex
 * flung across the room by a bad weight. So each clip is sampled at several phases and, at every
 * phase, the SKINNED vertex positions are read back and compared against the bind pose.
 *
 * THE FIVE FAILURES IT LOOKS FOR
 *   1. EXPLOSION — a vertex that travels absurdly far from where the bind pose put it. This is
 *      the signature of a vertex weighted to the wrong bone, and it is invisible in a thumbnail
 *      because the rest of the body still looks fine.
 *   2. COLLAPSE — the body's own volume dropping away, i.e. limbs folding into the torso.
 *   3. GROUND BREAK — the lowest vertex sinking below the floor or lifting off it.
 *   4. DRIFT — the figure walking off its own spot. Every clip here is an IN-PLACE clip; the game
 *      moves the character, the clip must not. John, watching the copied clips on the new rig:
 *      "the feet are moving from the point". This is the number for that sentence.
 *   5. OFF-PLANE — the hips' own up axis rotating away from where the bind pose left it. A clip
 *      authored against a different rest orientation lands its root rotation on the wrong axis
 *      and pitches the whole figure off the floor. `tools/_rig_compare.py` measured 114.86 deg of
 *      rest difference on the Hips between these two rigs; this is that same fault seen from the
 *      other end — in the animation rather than in the skeleton.
 *
 * Every number is per phase so a single bad frame cannot be averaged away, and a PNG is written
 * per clip so the numbers can be checked against a picture.
 *
 * 🚨 THE 0.0% BUG, RECORDED SO IT CANNOT COME BACK. For a whole round this probe reported 0.0%
 * travel and vol/bind exactly 1.000 for every phase of every clip — including `?clip=n30`, the
 * body that has animated in game for weeks. The cause: `getVertexPosition` skins through
 * `skeleton.bones[i].matrixWorld`, and THE BONES ARE NOT CHILDREN OF THE SkinnedMesh — they are
 * siblings under the armature root. `skinned.updateMatrixWorld(true)` walks a subtree with no
 * bones in it, so every sample re-read the bone matrices left behind by the last RENDER, which
 * in capture mode never runs again. The fix is one line: update the RIG ROOT. Two guards keep it
 * fixed — the control arm below, and a hard FAIL on a suspiciously motionless reading.
 *
 * ⚠️ GPU ARGS AND `capture=1` ARE BOTH REQUIRED — see `harness/evidence/_lineup_shot.mjs` for what happens
 * without them (software rendering, and `settle()` never resolving).
 *
 * CONTROL THAT MUST FAIL: `--control-bind` samples the BIND POSE at every phase instead of the
 * animated one. Every metric must then read zero movement; if the thresholds still "pass" a
 * moving body and this arm too, they are not measuring motion at all.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 5189;
const OUT = path.join(ROOT, 'harness', 'out', 'animcheck');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i < 0 ? d : argv[i + 1]; };
const has = (f) => argv.includes(f);
const log = (...a) => console.log(' ', ...a);

const CLIP = flag('--clip', 'friendly');
const ANIMS = flag('--anims', 'Alert,Walking,Running,Attack,Heavy_Hammer_Swing,You_Groove').split(',');
const PHASES = [0.0, 0.17, 0.34, 0.5, 0.67, 0.84];

/*
 * THRESHOLDS, ALL AS A FRACTION OF BODY HEIGHT.
 *
 * ⚠️ Never in metres. The vertex positions come back in the SkinnedMesh's own local space, which
 * is BEFORE the view's normalise-to-1.7 m scale, and the two rigs do not agree on that scale —
 * the Meshy export arrives at its own height. A metre threshold would be a different threshold
 * on every file.
 */
const MAX_TRAVEL = 1.20;   // a limb legitimately swings a body height; a vertex leaving the room does not
const MIN_VOL = 0.35;      // of the bind bounding volume
const MAX_GROUND = 0.10;   // foot above or below where the bind pose left it
const MAX_DRIFT = 0.15;    // horizontal centroid travel — an in-place clip should have none
const MAX_TILT = 25;       // degrees of hips up axis away from bind

/*
 * 🚨 ONE THRESHOLD SET CANNOT JUDGE A WALK AND A SIT-DOWN, AND PRETENDING OTHERWISE MAKES THE
 * WHOLE PROBE USELESS THE DAY THE SEATED SET LANDS.
 *
 * `Sitting_Clap` reads -4.0% ground and 17.9% drift; `Sit_to_Stand_Transition_M` reads 27.6%
 * drift. Both are the clip WORKING — the figure lowers itself onto a chair, or stands up and
 * steps. Under the locomotion limits they arrive pre-failed, and a probe that fails 23 of 38
 * clips by design is a probe nobody reads.
 *
 * So the class decides WHICH checks bind. EXPLOSION and COLLAPSE bind on everything — no clip of
 * any kind may fling a vertex across the room or fold the body flat. Ground, drift and tilt bind
 * only where the motion is supposed to stay put. They are still MEASURED and PRINTED for every
 * clip, because the number is what makes a suspicious seated clip visible; they just do not
 * convict on their own.
 */
const CLASSES = [
  // Big deliberate root motion. Attack and the swings drive the hammer at the floor, and the
  // seated set gets in and out of chairs. Judged on deformation only.
  [/sit|chair|doze|drink|tantrum|cross.?legged|arise|dead|crawl|stand.*sit|sit.*stand/i, 'seated'],
  [/attack|swing|chop|punch|stance|kick|dodge/i, 'action'],
];
const classOf = (name) => (CLASSES.find(([re]) => re.test(name))?.[1]) ?? 'locomotion';
const BINDS = { locomotion: true, action: false, seated: false };

fs.mkdirSync(OUT, { recursive: true });

log('building…');
await new Promise((res, rej) => {
  const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'],
    { cwd: ROOT, stdio: 'ignore', shell: true });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`build failed (${c})`))));
});

const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: 'ignore', shell: true });
const alive = async () => {
  try { const r = await fetch(`http://localhost:${PORT}/`); return r.ok; } catch { return false; }
};
{
  const t0 = Date.now();
  while (!(await alive())) {
    if (Date.now() - t0 > 60000) { console.error('preview failed to start'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 400));
  }
}
log(`preview up on ${PORT}`);

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1'],
});
const rows = [];
const errors = [];

for (const anim of ANIMS) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  page.on('pageerror', (e) => errors.push(`${anim}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${anim}: ${m.text()}`); });

  const q = new URLSearchParams({
    view: 'mesh.animated', clip: CLIP, anim, solo: '1', azim: '0',
    quality: 'high', capture: '1',
  });
  const url = `http://localhost:${PORT}/?${q}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(
    () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 240000, polling: 500 });
  if (await page.evaluate(() => document.body.dataset.rrrError === '1')) {
    errors.push(`${anim}: view reported an error during load`);
    await page.close();
    continue;
  }

  const res = await page.evaluate(async ({ phases, controlBind }) => {
    // `mesh-animated.js` publishes these for this probe. Missing means the view changed, and
    // that must be an error rather than a silent zero-motion "pass".
    const A = window.__rrr?.anim;
    if (!A) return { error: '__rrr.anim is absent — the view did not publish its mixer' };
    const { mixer, action, skinned, rig } = A;
    if (!skinned) return { error: 'no SkinnedMesh on __rrr.anim' };
    /*
     * THE RIG ROOT, NOT THE MESH — see the 0.0% note in this file's header. There is deliberately
     * no fallback to `skinned`: falling back would silently restore the bug that made every
     * reading zero, so an absent rig is an error instead.
     */
    const root = rig ?? null;
    if (!root) return { error: '__rrr.anim has no rig root — cannot update bone world matrices' };

    // A Vector3 without importing three: clone one the scene already owns. The bundle is built,
    // so there is no module path to import from inside the page.
    const vec = () => skinned.position.clone().set(0, 0, 0);

    const geo = skinned.geometry;
    const n = geo.attributes.position.count;
    const step = Math.max(1, Math.floor(n / 3000));

    const bones = skinned.skeleton?.bones ?? [];
    const hips = bones.find((b) => /hips|pelvis/i.test(b.name)) ?? bones[0] ?? null;
    if (!hips) return { error: 'no bones on the skeleton' };

    /*
     * The hips' own up axis in world space, read straight off column 1 of its world matrix.
     * ⚠️ Not a named axis convention: this file already records that 14 of 24 bones point +Y and
     * the Hips is nearly -Z, so the ANGLE BETWEEN two states of the same bone is the only
     * comparison that means anything here. Bind vs phase, same bone, same column.
     */
    const hipsUp = () => {
      const e = hips.matrixWorld.elements;
      const L = Math.hypot(e[4], e[5], e[6]) || 1;
      return [e[4] / L, e[5] / L, e[6] / L];
    };

    const sample = () => {
      root.updateWorldMatrix(true, true);   // <- the whole fix. Bones live here, not under the mesh.
      skinned.skeleton.update();
      const v = vec();
      const out = [];
      for (let i = 0; i < n; i += step) {
        skinned.getVertexPosition(i, v);
        out.push([v.x, v.y, v.z]);
      }
      return { pts: out, up: hipsUp() };
    };

    // BIND reference: phase 0 with the action's influence removed.
    const wasWeight = action.getEffectiveWeight();
    action.setEffectiveWeight(0);
    mixer.setTime(0);
    mixer.update(0);
    const bindS = sample();
    const bind = bindS.pts;
    action.setEffectiveWeight(wasWeight);
    mixer.update(0);

    const dur = action.getClip().duration;
    const stats = (pts) => {
      let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
      let sx = 0, sz = 0;
      for (const p of pts) {
        mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]);
        mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]);
        mnz = Math.min(mnz, p[2]); mxz = Math.max(mxz, p[2]);
        sx += p[0]; sz += p[2];
      }
      return {
        mny, mxy, cx: sx / pts.length, cz: sz / pts.length,
        vol: (mxx - mnx) * (mxy - mny) * (mxz - mnz),
      };
    };
    const bindB = stats(bind);
    const H = bindB.mxy - bindB.mny;

    const out = [];
    for (const ph of phases) {
      if (controlBind) { action.setEffectiveWeight(0); }
      mixer.setTime(ph * dur);
      mixer.update(0);          // setTime alone does not flush weights or bone tracks
      const s = sample();
      if (controlBind) { action.setEffectiveWeight(wasWeight); }
      const b = stats(s.pts);
      let maxTravel = 0;
      for (let i = 0; i < s.pts.length; i++) {
        const dx = s.pts[i][0] - bind[i][0];
        const dy = s.pts[i][1] - bind[i][1];
        const dz = s.pts[i][2] - bind[i][2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > maxTravel) maxTravel = d;
      }
      const dot = Math.max(-1, Math.min(1,
        s.up[0] * bindS.up[0] + s.up[1] * bindS.up[1] + s.up[2] * bindS.up[2]));
      out.push({
        phase: ph,
        travelOfH: maxTravel / H,
        volOfBind: b.vol / bindB.vol,
        groundOfH: (b.mny - bindB.mny) / H,
        driftOfH: Math.hypot(b.cx - bindB.cx, b.cz - bindB.cz) / H,
        tiltDeg: Math.acos(dot) * 180 / Math.PI,
      });
    }
    mixer.setTime(0.25 * dur);
    return { dur, H, samples: bind.length, bones: bones.length, hips: hips.name, rows: out };
  }, { phases: PHASES, controlBind: has('--control-bind') });

  if (res?.error) {
    errors.push(`${anim}: ${res.error}`);
    await page.close();
    continue;
  }

  await page.evaluate(async () => { await window.__rrr?.settle?.(6); });
  await page.screenshot({ path: path.join(OUT, `${CLIP}_${anim.replace(/[^\w]+/g, '_')}.png`) });
  await page.close();

  for (const r of res.rows) rows.push({ anim, ...r });
  log(`${anim.slice(0, 22).padEnd(22)} dur ${res.dur.toFixed(2)}s  root bone ${res.hips}  ` +
      res.rows.map((r) => `${(r.travelOfH * 100).toFixed(0)}%`).join(' '));
}

await browser.close();
server.kill();

// ---- verdict -------------------------------------------------------------
console.log('');
console.log('  clip                   class phase  travel/H   vol/bind  ground/H   drift/H   tilt');
for (const r of rows) {
  console.log(`  ${r.anim.slice(0, 22).padEnd(22)} ${classOf(r.anim).slice(0,4).padEnd(4)} ${r.phase.toFixed(2)}  ` +
    `${(r.travelOfH * 100).toFixed(1).padStart(7)}%  ` +
    `${r.volOfBind.toFixed(3).padStart(8)}  ` +
    `${(r.groundOfH * 100).toFixed(1).padStart(7)}%  ` +
    `${(r.driftOfH * 100).toFixed(1).padStart(7)}%  ` +
    `${r.tiltDeg.toFixed(1).padStart(5)}deg`);
}
if (errors.length) { console.error('\nERRORS:'); errors.forEach((e) => console.error('  ' + e)); }

const controlling = has('--control-bind');
const worstTravel = Math.max(...rows.map((r) => r.travelOfH), 0);
const worstVol = rows.length ? Math.min(...rows.map((r) => r.volOfBind)) : 1;
// Ground / drift / tilt convict only on the clips whose class says they must stay put — see
// CLASSES above. Every clip is still printed, and travel / volume still bind on all of them.
const placed = rows.filter((r) => BINDS[classOf(r.anim)]);
const worstGround = Math.max(...placed.map((r) => Math.abs(r.groundOfH)), 0);
const worstDrift = Math.max(...placed.map((r) => r.driftOfH), 0);
const worstTilt = Math.max(...placed.map((r) => r.tiltDeg), 0);
const allTilt = Math.max(...rows.map((r) => r.tiltDeg), 0);

console.log('');
log(`worst travel ${(worstTravel * 100).toFixed(1)}%H · smallest volume ${worstVol.toFixed(3)} ` +
    `· ground ${(worstGround * 100).toFixed(1)}%H · drift ${(worstDrift * 100).toFixed(1)}%H ` +
    `· tilt ${allTilt.toFixed(1)}deg (worst placed ${worstTilt.toFixed(1)})`);

if (!rows.length) { console.error('\n!! FAIL: nothing measured\n'); process.exit(2); }
if (errors.length) { console.error('\n!! FAIL: page errors\n'); process.exit(1); }

if (controlling) {
  // The bind arm must show essentially no motion. If it does, the sampler is not reading the
  // animated pose at all and every "pass" above is meaningless.
  if (worstTravel > 0.01 || allTilt > 0.5) {
    console.error(`\n!! CONTROL FAIL: the bind-pose arm moved ${(worstTravel * 100).toFixed(1)}%H ` +
      `and tilted ${allTilt.toFixed(1)}deg — the sampler is not doing what it claims\n`);
    process.exit(6);
  }
  console.log('\nCONTROL OK — bind pose is static, so the numbers above measure real motion\n');
  process.exit(0);
}

/*
 * 🚨 A ZERO READING IS NOT A PASS, IT IS THE OLD BUG. This probe once reported 0.0% for every
 * phase of a body that animates in game, and the word OK was printed underneath it.
 */
if (worstTravel < 0.005) {
  console.error(`\n!! FAIL: nothing moved (${(worstTravel * 100).toFixed(3)}%H). A real clip ` +
    `always moves something, so the sampler is not reading the animated pose — read the 0.0% ` +
    `note in this file's header before believing any number above.\n`);
  process.exit(7);
}

const bad = [];
if (worstTravel > MAX_TRAVEL) bad.push(`a vertex travelled ${(worstTravel * 100).toFixed(0)}%H ` +
  `— that is a skinning weight on the wrong bone, not a pose`);
if (worstVol < MIN_VOL) bad.push(`the body collapsed to ${worstVol.toFixed(3)} of bind volume`);
if (worstGround > MAX_GROUND) bad.push(`the feet left the floor by ` +
  `${(worstGround * 100).toFixed(1)}%H — sinking or floating`);
if (worstDrift > MAX_DRIFT) bad.push(`the figure drifted ${(worstDrift * 100).toFixed(1)}%H off ` +
  `its spot — an in-place clip must stay on the spot`);
if (worstTilt > MAX_TILT) bad.push(`the hips tilted ${worstTilt.toFixed(1)}deg off the bind up ` +
  `axis — the clip's root rotation is landing on the wrong axis for this rig`);

if (bad.length) {
  console.error('\n!! FAIL:');
  for (const b of bad) console.error('   - ' + b);
  console.error('');
  process.exit(4);
}
console.log('\nOK\n');
