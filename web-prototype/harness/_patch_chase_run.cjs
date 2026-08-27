const fs = require('fs');
const p = 'harness/_overnight_chase_shot.mjs';
let c = fs.readFileSync(p, 'utf8');
const start = c.indexOf('  // Drive ~32s with direction changes');
const end = c.indexOf('  await runner.page.mouse.up().catch(() => {});', start);
if (start < 0 || end < 0) { console.error('markers missing', start, end); process.exit(1); }
const endLine = end + '  await runner.page.mouse.up().catch(() => {});'.length;
const repl = `  // Drive ~30s real stick+RUN so doorway/lead have a chance
  const dirs = [
    [0, -1], [0.7, -0.7], [1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.8],
  ];
  const samples = [];
  const t0 = Date.now();
  note('PROBE_START', { shot: liveAt.bed?.shot, until: liveAt.bed?.until, cutGen: liveAt.bed?.cutGen });

  // Hold RUN (pointer) then stick (mouse) — hunt29 pattern
  await runner.page.evaluate(() => {
    const btn = document.querySelector('#run-btn');
    if (!btn) return;
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, isPrimary: true, buttons: 1 }));
  });
  await sleep(80);
  await runner.page.mouse.move(cx, cy);
  await runner.page.mouse.down();
  note('RUN_HELD', await runner.page.evaluate(() => ({
    hasRun: !!document.querySelector('#run-btn'),
    runOn: !!document.querySelector('#run-btn')?.classList.contains('on'),
  })));

  const probeMs = 30000;
  const legMs = Math.floor(probeMs / dirs.length);
  for (let d = 0; d < dirs.length; d++) {
    const [dx, dy] = dirs[d];
    await runner.page.mouse.move(cx + dx * R, cy + dy * R, { steps: 6 });
    // re-assert RUN each leg (some UIs drop on blur)
    await runner.page.evaluate(() => {
      const btn = document.querySelector('#run-btn');
      if (!btn) return;
      if (!btn.classList.contains('on')) {
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, isPrimary: true, buttons: 1 }));
      }
    });
    const end = Date.now() + legMs;
    while (Date.now() < end) {
      const s = await sampleOp();
      const runOn = await runner.page.evaluate(() => !!document.querySelector('#run-btn')?.classList.contains('on'));
      const row = {
        t: Date.now() - t0,
        dir: d,
        shot: s.bed?.shot ?? null,
        slugShot: s.bed?.slugShot ?? null,
        until: s.bed?.until ?? null,
        cutGen: s.bed?.cutGen ?? null,
        throttle: s.bed?.throttle ?? null,
        speed: s.bed?.speed ?? null,
        runOn,
        posX: s.bed?.posX,
        posZ: s.bed?.posZ,
        keys: s.bed?.readoutKeys,
      };
      samples.push(row);
      if (samples.length === 1 || samples.length % 8 === 0) note('SAMP_' + samples.length, row);
      await sleep(350);
    }
  }
  await runner.page.evaluate(() => {
    document.querySelector('#run-btn')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 }));
  }).catch(() => {});
  await runner.page.mouse.up().catch(() => {});`;
c = c.slice(0, start) + repl + c.slice(endLine);
fs.writeFileSync(p, c);
console.log('patched', start, endLine, 'newLen', c.length);
