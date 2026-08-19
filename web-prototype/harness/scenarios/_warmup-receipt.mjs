/**
 * READ THE WARM-UP'S RECEIPT. `views/game.js` records `engine.warmupStats` precisely because
 * the program-count gate cannot distinguish "the warm-up did not help" from "the warm-up did
 * not run" — and its first version found ZERO nail-gun lights and reported a perfect
 * four-variant lap that was really two variants twice. This reads the receipt directly.
 */
export default async function warmupReceipt({ page, note, pass, fail, skip }) {
  const s = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e) return null;
    return { stats: e.warmupStats ?? null, programs: e.renderer.info.programs?.length ?? -1 };
  });
  if (!s) { skip('warm-up receipt', 'engine not reachable'); return; }
  if (!s.stats) { fail('the load warm-up ran', 'engine.warmupStats is absent — the block did not execute'); return; }

  const w = s.stats;
  note(`warmupStats: ${JSON.stringify(w)}`);
  note(`renderer.info.programs now: ${s.programs}`);

  const built = w.programs.after - w.programs.before;
  note(`the warm-up built ${built} programs (${w.programs.before} -> ${w.programs.after})`);

  if (w.gunLights > 0) pass('the warm-up found the nail-gun lights', `${w.gunLights} found — the four-variant loop is real`);
  else fail('the warm-up found the nail-gun lights', 'ZERO found — the gunOn loop was a no-op and only two counts were warmed');

  if (w.variants === 4) pass('four light variants warmed', `variants=${w.variants} spaces=${w.spaces} looks=${w.looks}`);
  else fail('four light variants warmed', `variants=${w.variants}`);

  if (built > 100) pass('the warm-up did substantial work', `${built} programs built at load`);
  else fail('the warm-up did substantial work', `only ${built} programs built — suspiciously few`);
}
