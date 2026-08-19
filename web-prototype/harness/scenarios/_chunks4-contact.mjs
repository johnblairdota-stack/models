/**
 * 🔨 **DOES A HAMMER BLOW DO ANYTHING, AND DOES `applyHit` TELL THE TRUTH ABOUT IT?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_chunks4-contact.mjs \
 *        --port 5371 --q "seed=s4&dig=1"
 *
 * `strobe-1` photographed six consecutive blows with `hadPanel: true, removed: 0.28` and
 * `panelStage` stuck at 0, and a wall pixel-unchanged across the contact window. Two candidate
 * readings — a staging artefact (a panel that legitimately has no damage field) or the sledge's
 * damage genuinely not accumulating — and nothing in the return value could separate them,
 * because `removed` was an unconditional constant rather than a measurement.
 *
 * This drives the SAME entry point on one panel of every kind in the shipped house and reports
 * what actually moved. It is the regression test for `wall.js` `applyHit`'s scalar arm:
 *
 *   · `removed` must be 0 on a blow the state machine refuses, and non-zero on one it accepts
 *   · `blocked` must agree with "the panel's health did not move"
 *   · `onChunk` must fire on EVERY landed blow, on both arms — it is the view's only per-blow
 *     hook, and the scalar arm used to return before reaching it, which is why an ordinary wall
 *     produced no chip, no dust and no debris on three blows out of four
 */
export default async function contact({ page, note, pass, fail, skip }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const probe = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room?.panels) return null;
    const out = [];
    const seen = new Set();
    for (const p of e.room.panels) {
      // one representative of each distinct stage table, plus one damage-armed dig face
      const key = p.field ? 'free' : `${p.state.defs.length}|${p.state.defs[0].health}|${p.state.defs[0].damageable}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let chunks = 0, blockedChunks = 0;
      const prev = p.onChunk;
      p.onChunk = (panel, info) => {
        chunks++;
        if (info.blocked) blockedChunks++;
        prev?.(panel, info);
      };
      const stage0 = p.state.stage;
      const health0 = p.state.stageHealth;
      const rows = [];
      for (let i = 0; i < 6; i++) {
        // ⚠️ `stageHealth` RESETS TO THE NEW STAGE'S FULL HEALTH WHEN A STAGE IS CROSSED, so a
        // plain before-after difference goes NEGATIVE on the blow that does the most work. The
        // first version of this probe did exactly that and failed the honesty assertion on a
        // correct build — the instrument, not the code. "Did anything move" is therefore the
        // pair (stage, stageHealth), not the scalar.
        const sBefore = p.state.stage, hBefore = p.state.stageHealth;
        const r = p.applyHit(p.pointAt(0.5, 0.45), 1);
        rows.push({
          removed: +r.removed.toFixed(4), blocked: !!r.blocked,
          stage: p.state.stage,
          moved: p.state.stage !== sBefore || p.state.stageHealth !== hBefore,
        });
      }
      p.onChunk = prev;
      out.push({
        id: p.id, key, hasField: !!p.field,
        table: `${p.state.defs.length} stages, health@0 ${p.state.defs[0].health}, damageable@0 ${p.state.defs[0].damageable}`,
        stage0, health0, stageNow: p.state.stage, chunks, blockedChunks, rows,
      });
    }
    return out;
  });

  if (!probe) { fail('the build is reachable', 'no engine.room.panels'); return; }
  if (!probe.length) { skip('there is a panel to hit', 'no panels in this room'); return; }

  let anyAccumulates = false, allFired = true, honest = true;
  for (const p of probe) {
    note(`${p.id} — ${p.table}${p.hasField ? ' · DAMAGE FIELD' : ''}`);
    note(`   stage ${p.stage0} -> ${p.stageNow} · onChunk fired ${p.chunks}/6 `
      + `(${p.blockedChunks} of them reporting blocked)`);
    note(`   ${p.rows.map((r, i) => `b${i + 1} removed ${r.removed}${r.blocked ? ' BLOCKED' : ''}`).join(' · ')}`);
    if (p.chunks !== 6) allFired = false;
    if (p.stageNow !== p.stage0 || p.rows.some((r) => r.moved) || p.hasField) anyAccumulates = true;
    // THE CONTRACT: `removed > 0` exactly when the panel's state actually moved, and `blocked`
    // is its complement. The field arm has no stage machine to read, so it is exempt.
    if (!p.hasField) {
      for (const r of p.rows) {
        if ((r.removed > 1e-6) !== r.moved) honest = false;
        if (r.blocked === r.moved) honest = false;
      }
    }
  }

  allFired
    ? pass('every landed blow gives the view a contact event',
      'onChunk fired 6/6 on every panel kind, both arms')
    : fail('every landed blow gives the view a contact event',
      'a panel kind swallowed blows without firing onChunk — the view has nothing to draw');
  honest
    ? pass('`removed` reports what actually left the panel',
      'non-zero exactly when the panel\'s health moved')
    : fail('`removed` reports what actually left the panel',
      'a blow reported material removed while the panel did not move (or the reverse)');
  anyAccumulates
    ? pass('the hammer accumulates damage somewhere', 'at least one panel kind advanced')
    : fail('the hammer accumulates damage somewhere', 'no panel kind moved at all in 6 blows');
}
