/**
 * 🔊 **DOES A PADLOCKED DOOR SOUND DIFFERENT FROM ONE THAT IS COMING APART? — `genexit-1`,
 * 2026-08-15. The control for change C.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_genexit1-clank.mjs \
 *        --port 5523 --q "plan=gen&planseed=3&seed=s0"
 *
 * ⚠️ `--q`, NEVER `--extra`.
 *
 * ---------------------------------------------------------------------------------------------
 * C IS ONE KEY AND ITS WHOLE RISK IS IN THE OTHER DIRECTION
 * ---------------------------------------------------------------------------------------------
 * `wall.js`'s SCALAR arm no longer returns `barrier: false`; it omits the key. Measured before
 * the change: a live exit and a padlocked decoy both reported `depth=0 barrier=false` and
 * differed only in `blocked` — and `barrier:false` being a BOOLEAN claimed `audio.js`'s branch,
 * so both produced the identical `barrierMix = 0` wood impact. The one sound whose job is to say
 * NOT HERE could not fire on the one object that means it. `audio.js`'s ladder is UNCHANGED.
 *
 * 🚨 **THE DANGER IS THE DIG, WHICH IS THE MOST-TUNED THING IN THIS PROJECT — AND THIS FILE
 * CAUGHT THE FIRST CUT OF C DOING EXACTLY THAT, INSIDE ONE RUN.**
 *
 * C was first written as *"move `opts.blocked === true` above the boolean-`barrier` test in
 * `audio.js`"*, on the strength of that file's own recorded measurement: over a 63-blow drive on
 * an all-barrier `DamageField`, `blocked` was true **ZERO** times. **K2 re-measured it on a REAL
 * free dig face instead of a synthetic field and got 40 of 63** — hammer one spot at the shipped
 * x8 base and it bottoms out, and a bottomed-out spot really does refuse. That reorder would
 * have put the refusal clank on two dig blows in three. `audio.js`'s stale zero is corrected in
 * place.
 *
 * 🎯 **SO C MOVED TO WHERE THE LIE WAS.** `wall.js`'s SCALAR arm used to return a hard
 * `barrier: false`; `audio.js` does not ask *is there cyan*, it asks `typeof opts.barrier ===
 * 'boolean'`, i.e. *do you know?* — and `false` answered yes. The key is now ABSENT on that arm
 * and the ladder is untouched, so a refused SCALAR blow reaches `blocked` and **the field arm,
 * which still returns a real boolean, cannot be routed differently by one instruction.** K2 now
 * proves that by RENDERING a field-arm result both ways rather than by counting anything.
 *
 * ---------------------------------------------------------------------------------------------
 * 🎯 **K1 RENDERS THE BEFORE AND THE AFTER THROUGH THE SHIPPED FUNCTION, IN ONE PAGE, AND NEEDS
 * NO SOURCE PATCH TO DO IT.**
 * ---------------------------------------------------------------------------------------------
 * The fix changed what the CALLER hands over, and `audio.js` is a pure function of that — so both
 * sides are still reachable from the shipped build with no source patch at all. Feed it the
 * scalar arm's OLD return value and you get the old sound; feed it the new one and you get the
 * new sound. Renders through `audio.js`'s own `_renderOffline`:
 *
 *   LANDED   `{ blocked:false }`                  a live exit yielding
 *   OLD      `{ barrier:false, blocked:true }`    what a refusal used to hand over — identical
 *                                                 to LANDED, which is the defect
 *   NOW      `{ blocked:true }`                   what a refusal hands over after C
 *
 * `seedAudioVariation()` is re-pinned before every render (it resets `_meleeHit`, the jitter
 * salt), so two clips differ ONLY where the code differs. **LANDED vs OLD is the control that
 * must come back identical** — without it, "NOW differs" could just be per-hit jitter, which is
 * ±8% pitch and ±18% gain and would look exactly like a finding.
 */

const DIG_BLOWS = +(process.env.DIG_BLOWS ?? 63);

export default async function genexit1clank(ctx) {
  const { page, note, pass, fail, skip } = ctx;
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 600; i++) {
      await page.waitForTimeout(35);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);
  await step(4);

  // =========================================================================
  // K1 · the three clips, through the shipped `playMeleeImpact`
  // =========================================================================
  const clips = await page.evaluate(async () => {
    let A;
    try { A = await import('/src/audio/audio.js'); } catch (err) { return { err: String(err) }; }
    if (typeof A._renderOffline !== 'function') return { err: 'audio.js does not export _renderOffline' };

    // peak / rms / spectral centroid, off the samples the module actually produced
    const metrics = (raw, sr) => {
      let peak = 0, sum = 0;
      for (let i = 0; i < raw.length; i++) { const v = Math.abs(raw[i]); if (v > peak) peak = v; sum += raw[i] * raw[i]; }
      const rms = Math.sqrt(sum / Math.max(1, raw.length));
      // a cheap centroid: zero-crossing rate is enough to separate a bright crack from a dull
      // metallic clank and needs no FFT in the page
      let zc = 0;
      for (let i = 1; i < raw.length; i++) if ((raw[i - 1] < 0) !== (raw[i] < 0)) zc++;
      return { peak: +peak.toFixed(6), rms: +rms.toFixed(6), zcr: +(zc / (raw.length / sr)).toFixed(1),
        n: raw.length };
    };
    const renderD = async (opts, d) => {
      A.seedAudioVariation(0x5eed);       // resets `_meleeHit`, so the jitter is the same every clip
      const r = await A._renderOffline([{ t: 0.02, fn: () => A.playMeleeImpact(d, opts) }], 0.5, { raw: true });
      return { ...metrics(r.raw, r.sampleRate), raw: Array.from(r.raw.slice(0, 8000)) };
    };
    const render = (opts) => renderD(opts, 0);

    // A SCALAR panel as it used to report itself (`barrier: false`) and as it reports itself now
    // (key absent). These are the two things `wall.js`'s scalar arm actually hands over.
    const landed = await render({ blocked: false, brokeThrough: false, depthAt: 0 });
    const landed2 = await render({ blocked: false, brokeThrough: false, depthAt: 0 });
    const oldWay = await render({ barrier: false, blocked: true, brokeThrough: false });   // pre-C scalar
    const now = await render({ blocked: true, brokeThrough: false });
    const broke = await render({ blocked: true, brokeThrough: true });
    const brokeClean = await render({ blocked: false, brokeThrough: true });
    // THE DIG'S OWN CASE: the field arm still passes a real boolean, so a bottomed-out dig blow
    // (`blocked` true, `barrier` false, depth 1.0) must render exactly as it did before C.
    const digNow = await renderD({ barrier: false, blocked: true, brokeThrough: false }, 1.0);
    const digPre = await renderD({ barrier: false }, 1.0);
    const digClank = await renderD({ barrier: true, blocked: true, brokeThrough: false }, 1.0);

    const same = (a, b) => {
      let worst = 0;
      for (let i = 0; i < Math.min(a.raw.length, b.raw.length); i++) {
        const d = Math.abs(a.raw[i] - b.raw[i]); if (d > worst) worst = d;
      }
      return +worst.toFixed(8);
    };
    return {
      landed: { ...landed, raw: undefined }, oldWay: { ...oldWay, raw: undefined },
      now: { ...now, raw: undefined }, broke: { ...broke, raw: undefined },
      digNow: { ...digNow, raw: undefined }, digClank: { ...digClank, raw: undefined },
      repeatWorst: same(landed, landed2),
      oldWorst: same(landed, oldWay),
      nowWorst: same(landed, now),
      brokeWorst: same(broke, brokeClean),
      digWorst: same(digNow, digPre),
      digVsClank: same(digNow, digClank),
    };
  });

  if (clips.err) {
    skip('a refused blow and a landed blow are different sounds', clips.err);
  } else {
    note(`LANDED  peak ${clips.landed.peak} rms ${clips.landed.rms} zcr ${clips.landed.zcr} Hz`);
    note(`OLD     peak ${clips.oldWay.peak} rms ${clips.oldWay.rms} zcr ${clips.oldWay.zcr} Hz   (pre-C scalar return: barrier:false + blocked:true)`);
    note(`NOW     peak ${clips.now.peak} rms ${clips.now.rms} zcr ${clips.now.zcr} Hz   (post-C scalar return: blocked:true, no barrier key)`);
    note(`worst per-sample |d| vs LANDED — the same call twice ${clips.repeatWorst} · `
      + `pre-C refusal ${clips.oldWorst} · post-C refusal ${clips.nowWorst}`);

    // ---- the control FIRST. If a repeat render is not identical, nothing below means anything.
    if (clips.repeatWorst > 1e-6) {
      fail('the comparator can tell two renders apart only when the code differs',
        `the SAME call rendered twice differs by ${clips.repeatWorst} — jitter is not pinned, so `
        + 'every number below is noise');
    } else if (clips.oldWorst > 1e-6) {
      fail('the comparator can tell two renders apart only when the code differs',
        `pre-C ({barrier:false} alone) already differs from a landed blow by ${clips.oldWorst}; `
        + 'it is supposed to be byte-identical — the premise of this control is wrong');
    } else {
      pass('the comparator can tell two renders apart only when the code differs',
        `same call twice: identical (${clips.repeatWorst}); and the PRE-C refusal is byte-identical `
        + 'to a landed blow, which is the defect C fixes, reproduced through the shipped function');
      (clips.nowWorst > 1e-3)
        ? pass('a refused blow and a landed blow are different sounds',
          `worst per-sample |d| ${clips.nowWorst}; rms ${clips.landed.rms} -> ${clips.now.rms}, `
          + `zcr ${clips.landed.zcr} -> ${clips.now.zcr} Hz`)
        : fail('a refused blow and a landed blow are different sounds',
          `still within ${clips.nowWorst} of each other — C did not reach the branch`);
    }

    // ---- K3 · brokeThrough still wins, or the blow that opens the wall becomes the refusal
    (clips.brokeWorst <= 1e-6)
      ? pass('the blow that breaks through is never the refusal sound',
        `brokeThrough:true renders identically with blocked true or false (${clips.brokeWorst})`)
      : fail('the blow that breaks through is never the refusal sound',
        `they differ by ${clips.brokeWorst} — "blocked" is overtaking "brokeThrough"`);
  }

  // =========================================================================
  // K2 · AND IT IS INERT ON THE DIG — re-measured, not quoted
  // =========================================================================
  const dig = await page.evaluate((N) => {
    const e = window.__rrr.engine;
    const faces = e.room.panels.filter((p) => p.field && p.spec?.free);
    if (!faces.length) return { err: 'no free dig face' };
    const p = faces.sort((a, b) => b.width - a.width)[0];
    // `applyHit(point, 1)` is the value every instrument in this project sends — see
    // `player.js`'s note on `digPower`. One spot, hammered until well past bottoming out, which
    // is the case `audio.js`'s warning is about; then a sweep, so this is not one lucky texel.
    const out = { id: p.id, blocked: 0, n: 0, removedMin: 1e9, removedMax: 0, depth1: 0 };
    const hit = (u, v) => {
      const r = p.applyHit(p.pointAt(u, v), 1);
      out.n++;
      if (r.blocked) out.blocked++;
      if (r.removed < out.removedMin) out.removedMin = r.removed;
      if (r.removed > out.removedMax) out.removedMax = r.removed;
      if ((r.depthAt ?? 0) >= 0.999) out.depth1++;
      return r;
    };
    for (let i = 0; i < Math.floor(N * 0.6); i++) hit(0.5, 0.42);          // bottom one spot out
    for (let i = 0; i < N - Math.floor(N * 0.6); i++) hit(0.2 + (i % 7) * 0.09, 0.30 + (i % 3) * 0.2);
    out.removedMin = +out.removedMin.toFixed(6);
    out.removedMax = +out.removedMax.toFixed(6);
    return out;
  }, DIG_BLOWS);

  // the control for K2: the exit panels in the SAME page must report blocked, or "0 on the dig"
  // is a fact about the counter rather than about the field.
  const doors = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const rows = [];
    for (const x of e.exits) {
      const p = x.panel, n = p.normal, c = p.pointAt(0.5, 0.5);
      const r = p.applyHit(c, 0.5);
      rows.push({ id: x.site.id, live: run.isLiveExit(x.site.id), blocked: !!r.blocked,
        barrier: r.barrier, removed: +(r.removed ?? 0).toFixed(4), n, c });
    }
    return rows.map((q) => ({ id: q.id, live: q.live, blocked: q.blocked, barrier: q.barrier, removed: q.removed }));
  });
  note(`doors, one blow each: ${doors.map((d) => `${d.id}${d.live ? '[LIVE]' : ''} blocked=${d.blocked} barrier=${d.barrier} removed=${d.removed}`).join(' · ')}`);

  if (dig.err) skip('C cannot change the dig', dig.err);
  else {
    note(`${dig.n} hammer blows on ${dig.id} (60% of them at ONE spot): blocked ${dig.blocked}, `
      + `removed ${dig.removedMin}..${dig.removedMax}, ${dig.depth1} blows at depth 1.000`);
    note(`⚠️ audio.js's header records "blocked true ZERO times in 63 blows" — that was a `
      + `SYNTHETIC all-barrier field. On a real face it is ${dig.blocked}/${dig.n}. `
      + 'The first cut of C keyed off that stale zero and this line is what caught it.');
    /**
     * 🚨 **THE ASSERTION IS ON THE SOUND, NOT ON THE COUNT, AND THE COUNT IS WHY.** `blocked`
     * firing 40 times on the dig is exactly what makes "just reorder the ladder" wrong; it says
     * nothing about whether C, as landed, reaches the dig. What settles that is rendering a
     * FIELD-ARM result — which still carries a real boolean `barrier` — and requiring it to be
     * byte-identical to what the same inputs produced before C.
     */
    const doorsBlocked = doors.filter((d) => d.blocked).length;
    const doorsBarrier = doors.filter((d) => d.barrier !== undefined).length;
    if (clips.err) skip('C cannot change the dig', 'the renders did not run');
    else if (clips.digVsClank <= 1e-6) {
      fail('C cannot change the dig',
        'a dig blow on a NON-barrier cell renders identically to one on a barrier cell — the '
        + 'comparator cannot see the clank at all, so the zero below proves nothing');
    } else if (clips.digWorst <= 1e-6 && doorsBlocked > 0 && doorsBarrier === 0) {
      pass('C cannot change the dig',
        `a bottomed-out dig blow (barrier:false, blocked:true, depth 1.0) renders byte-identical `
        + `to its pre-C self (${clips.digWorst}) while still differing from a real barrier blow `
        + `(${clips.digVsClank}) — the field arm keeps its boolean and takes the same branch. `
        + `Meanwhile ${doorsBlocked}/${doors.length} padlocked doors report blocked and `
        + `${doorsBarrier} of them claim a barrier, which is the scalar arm's new honesty.`);
    } else if (clips.digWorst > 1e-6) {
      fail('C cannot change the dig',
        `a bottomed-out dig blow now renders ${clips.digWorst} away from its pre-C self — C has `
        + "reached the dig, which is the one thing it must not do");
    } else {
      fail('C cannot change the dig',
        `dig render is stable but the scalar arm looks wrong: ${doorsBlocked}/${doors.length} `
        + `doors blocked, ${doorsBarrier} still claiming a barrier (want 0)`);
    }
  }
}
