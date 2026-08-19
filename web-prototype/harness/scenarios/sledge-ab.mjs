/**
 * THE ARC A/B — three swing amplitudes, ONE browser session, one staging.
 *
 * `critic-swing-2` passed the swing's choreography and left one note about its size: the head
 * path is roughly twice a human sledgehammer's, and "the wind-up reads slightly whippy once you
 * watch for it." The counterintuitive part is why it is worth changing: at a FIXED 0.70 s, a
 * longer path is a faster hammer, and a fast hammer reads LIGHT.
 *
 * This runs the control and two shorter arcs against each other. It exists as one scenario
 * rather than three CLI invocations because this project's own rule is that an A/B needs a
 * same-config control pair — three separate boots would each pick their own wall anchor, place
 * their own camera and accumulate their own wall damage, and every one of those would ride into
 * the comparison. Here the only thing that changes between arms is `sledge.setArc(k)`.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/sledge-ab.mjs \
 *        --port 5196 --q "seed=s4&dig=1"
 *
 * ⚠️ THE JUDGEMENT INSTRUMENT IS THE SILHOUETTE SHEET AT `scope: 'subject'`, and that is not a
 * default. Control runs FIRST, so any wall damage accumulates across the later arms — with
 * `subject` scope nothing but the player subtree is drawn, so the wall cannot reach the sheet
 * the decision is made on. (The first run of this A/B used the default `figure` scope and the
 * robot's torso fused with a black slab standing behind it in all 33 tiles.) The lit sheets are
 * secondary and their backgrounds DO differ between arms; that is stated, not hidden.
 */
import { strobe, composeSheets, verify, MOTIONS } from '../strobe.mjs';

/** The arms. `k` is `SWING_ARC`; `want` is the world head path it is predicted to produce. */
const ARMS = [
  { k: 1.00, tag: 'a100', want: 6.79, why: 'CONTROL — the round-3 swing exactly as sledge-3 built it' },
  { k: 0.79, tag: 'b079', want: 6.0, why: 'the ~6.0 m arm' },
  { k: 0.54, tag: 'c054', want: 5.0, why: 'the ~5.0 m arm' },
];

export default async function sledgeAB(ctx) {
  const { page, note, pass, fail, skip } = ctx;
  const results = [];

  for (const arm of ARMS) {
    note('');
    note(`──────── ARM ${arm.tag}  arc=${arm.k.toFixed(2)}  (${arm.why})`);

    const set = await page.evaluate((k) => {
      const p = window.__rrr.engine.player;
      if (!p.sledge.setArc) return { ok: false, why: 'SledgeRig.setArc is missing — wrong build' };
      const applied = p.sledge.setArc(k);
      return { ok: true, applied, reads: p.sledge.arc };
    }, arm.k);
    if (!set.ok) { skip(`arm ${arm.tag}`, set.why); continue; }
    note(`setArc -> ${JSON.stringify(set)}`);
    if (Math.abs(set.reads - arm.k) > 1e-6) {
      fail(`arm ${arm.tag}: the arc the sheet is labelled with is the arc that ran`, `asked ${arm.k}, rig reads ${set.reads}`);
      continue;
    }

    const m = await strobe(ctx, {
      name: `sledge-${arm.tag}`,
      label: `sledge swing · arc ${arm.k.toFixed(2)}`,
      setup: MOTIONS.sledge.setup,
      fire: MOTIONS.sledge.fire,
      phase: MOTIONS.sledge.phase,
      anchor: MOTIONS.sledge.anchor,
      anchorAt: MOTIONS.sledge.anchorAt,
      outcome: MOTIONS.sledge.outcome,
      mode: 'uniform',
      n: 10,
      silhouette: true,
      // ⚠️ `subject`, NOT the default `figure`. On the first run of this A/B the `figure` scope
      // left a large black slab standing directly behind the robot — `--scope figure` hides
      // `room.root` and that slab is not under it — and the torso fused with it in every tile.
      // A silhouette whose figure merges with the background is not a silhouette test. `subject`
      // keeps ONLY the player subtree (the hammer included: player.root -> model -> unit.root ->
      // ... -> chest -> prop), which is the classical version of the test anyway.
      scope: 'subject',
      dist: 2.4,
      hud: false,
      out: 'progress/strobe/arc-ab',
    });
    if (!m) { skip(`arm ${arm.tag}`, 'the strobe did not produce a manifest'); continue; }
    await composeSheets(m);
    const rep = await verify(m);
    for (const v of rep.verdicts) {
      if (v.s === 'FAIL') fail(`arm ${arm.tag}: ${v.name}`, v.detail);
      else if (v.s === 'PASS') pass(`arm ${arm.tag}: ${v.name}`, v.detail);
      else skip(`arm ${arm.tag}: ${v.name}`, v.detail);
    }

    // ---- the number, measured on the same frame pump the sheet was captured with ----------
    const arc = await page.evaluate(async () => {
      const e = window.__rrr.engine, p = e.player, s = p.sledge;
      const chest = p.unit.joints.chest ?? p.unit.joints.spine ?? p.unit.root;
      const grab = () => {
        s.head.updateWorldMatrix(true, false);
        chest.updateWorldMatrix(true, false);
        const w = new (s.head.position.constructor)().setFromMatrixPosition(s.head.matrixWorld);
        const l = w.clone().applyMatrix4(chest.matrixWorld.clone().invert());
        return { ph: s.phase, sw: !!s.swinging, w: { x: w.x, y: w.y, z: w.z }, l: { x: l.x, y: l.y, z: l.z } };
      };
      const S = [grab()];
      p._fireCd = 0;
      const fired = p.attack(e.elapsed);
      for (let i = 0; i < 60; i++) {
        await window.__strobe.step(1);
        S.push(grab());
        if (i > 4 && !S[S.length - 1].sw) break;
      }
      const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      let world = 0, local = 0, peak = 0, peakP = 0;
      const legs = { windup: 0, down: 0, follow: 0, recover: 0 };
      for (let i = 1; i < S.length; i++) {
        if (!S[i].sw && !S[i - 1].sw) continue;
        const dw = d(S[i].w, S[i - 1].w);
        world += dw; local += d(S[i].l, S[i - 1].l);
        if (dw * 60 > peak) { peak = dw * 60; peakP = S[i].ph; }
        const ph = S[i].ph || 1;
        if (ph <= 0.42) legs.windup += dw;
        else if (ph <= 0.60) legs.down += dw;
        else if (ph <= 0.80) legs.follow += dw;
        else legs.recover += dw;
      }
      const ys = S.filter((x) => x.sw).map((x) => x.w.y);
      const r3 = (x) => +x.toFixed(3);
      return {
        fired: fired ? (fired.weapon ?? 'yes') : null,
        frames: S.filter((x) => x.sw).length,
        world: r3(world), local: r3(local), drive: r3(world - local),
        peak: r3(peak), peakP: r3(peakP),
        legs: { windup: r3(legs.windup), down: r3(legs.down), follow: r3(legs.follow), recover: r3(legs.recover) },
        headMinY: r3(Math.min(...ys)), headMaxY: r3(Math.max(...ys)),
        hands: s.handCheck(),
      };
    });
    note(`ARC ${arm.tag}: world ${arc.world} m · body-relative ${arc.local} m · body drive ${arc.drive} m`);
    note(`    peak ${arc.peak} m/s at phase ${arc.peakP} · legs ${JSON.stringify(arc.legs)}`);
    note(`    head world height ${arc.headMinY} .. ${arc.headMaxY} m · hands ${JSON.stringify(arc.hands)}`);
    note(`ABJSON ${JSON.stringify({ arm: arm.tag, k: arm.k, ...arc })}`);
    results.push({ arm, arc, sheets: m.sheets, stage: m.stage, outcome: m.outcome });

    (arc.hands && arc.hands.L < 0.001 && arc.hands.R < 0.001)
      ? pass(`arm ${arm.tag}: both hands stay welded to the haft`, JSON.stringify(arc.hands))
      : fail(`arm ${arm.tag}: both hands stay welded to the haft`, JSON.stringify(arc.hands));
  }

  note('');
  note('════════ SUMMARY ════════');
  for (const r of results) {
    note(`arc ${r.arm.k.toFixed(2)}  world ${String(r.arc.world).padEnd(6)} m (wanted ~${r.arm.want})  peak ${String(r.arc.peak).padEnd(6)} m/s  head tops out ${r.arc.headMaxY} m`);
  }
  for (const r of results) {
    if (r.sheets?.normal) note(`sheet  arc ${r.arm.k.toFixed(2)}  ${r.sheets.normal}`);
    if (r.sheets?.silhouette) note(`sil    arc ${r.arm.k.toFixed(2)}  ${r.sheets.silhouette}`);
  }
  results.length === ARMS.length
    ? pass('all three arms produced sheets and numbers', results.map((r) => `${r.arm.k}:${r.arc.world}m`).join(' '))
    : fail('all three arms produced sheets and numbers', `${results.length}/${ARMS.length}`);

  await headBulkAB(ctx);
}

/**
 * THE HEAD-BULK A/B — `critic-swing-2`'s second note, judged where it said to judge it.
 *
 * The old head is reproduced at runtime by scaling the `sledgeHead` group by the exact inverse
 * of the change (0.200/0.215, 0.082/0.103, 0.076/0.094), so the two captures are the SAME FRAME
 * of the SAME POSE with nothing between them but a scale assignment — the frame pump is stopped,
 * so not one thing else in the world can move.
 *
 * ⚠️ ONE HONEST LIMIT. The two chrome rim tori are built at `HEAD_H * 0.42` and rotated 90°
 * about Y, so a non-uniform group scale distorts them slightly in the "old" arm. The BLOCK —
 * which is what a silhouette is a test of — is reproduced exactly.
 */
async function headBulkAB(ctx) {
  const { page, note, pass, fail, skip, snap, SHOTDIR } = ctx;
  const OLD = [0.200 / 0.215, 0.082 / 0.103, 0.076 / 0.094];
  const { mkdir } = await import('node:fs/promises');
  const path = (await import('node:path')).default;
  // SHOTDIR is <root>/progress/playtest — derive from it rather than from cwd, which belongs to
  // whoever launched playtest.mjs and is not guaranteed to be the project root.
  const dir = path.resolve(SHOTDIR, '../strobe/arc-ab/head-bulk');
  await mkdir(dir, { recursive: true });

  note('');
  note('──────── HEAD BULK: new vs old, same frame, same pose');
  await page.evaluate((k) => window.__rrr.engine.player.sledge.setArc(k), CHOSEN_ARC_FOR_HEAD);

  const shots = [];
  for (const beat of [{ name: 'rest', p: null }, { name: 'cock', p: 0.40 }, { name: 'contact', p: 0.60 }]) {
    // reach the pose
    const at = await page.evaluate(async (target) => {
      const e = window.__rrr.engine, p = e.player;
      if (target == null) {
        for (let i = 0; i < 90 && p.sledge.swinging; i++) await window.__strobe.step(1);
        await window.__strobe.step(8);
        return { phase: p.sledge.phase, swinging: p.sledge.swinging };
      }
      p._fireCd = 0;
      p.attack(e.elapsed);
      for (let i = 0; i < 90; i++) {
        await window.__strobe.step(1);
        if (p.sledge.phase >= target) break;
      }
      return { phase: p.sledge.phase, swinging: p.sledge.swinging };
    }, beat.p);
    note(`${beat.name}: phase ${JSON.stringify(at)}`);

    for (const [tag, s] of [['new', [1, 1, 1]], ['old', OLD]]) {
      const ok = await page.evaluate(async ({ s, scope }) => {
        const h = window.__rrr.engine.player.sledge.head;
        h.scale.set(s[0], s[1], s[2]);
        await window.__strobe.chrome(false);
        await window.__strobe.sil(true, scope);
        return true;
      }, { s, scope: 'subject' });
      const file = path.join(dir, `${beat.name}-${tag}.png`);
      const got = ok && await snap(`head-${beat.name}-${tag}`, { path: file });
      await page.evaluate((scope) => window.__strobe.sil(false, scope), 'subject');
      if (got) shots.push(file); else note(`⚠️ capture failed: ${beat.name}/${tag}`);
    }
    await page.evaluate(() => { window.__rrr.engine.player.sledge.head.scale.set(1, 1, 1); });
  }

  note(`head-bulk frames: ${shots.length}/6 -> ${dir}`);
  shots.length === 6
    ? pass('the head-bulk A/B captured both heads at all three beats', `${shots.length} frames`)
    : (shots.length ? fail('the head-bulk A/B captured both heads at all three beats', `${shots.length}/6`)
      : skip('the head-bulk A/B captured both heads at all three beats', 'nothing was written'));
}

/** The arc the head-bulk pair is shot at — set to whichever arm the A/B chooses. */
const CHOSEN_ARC_FOR_HEAD = 0.79;
