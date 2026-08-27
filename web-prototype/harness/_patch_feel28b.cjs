const fs = require('fs');
const p = 'harness/_overnight_feel28.mjs';
let s = fs.readFileSync(p, 'utf8');
const old = `if (box) {
      await runner.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await runner.page.mouse.down();
      let firstHost = null;
      let firstBed = null;
      for (let i = 0; i < 40; i++) {`;
const neu = `if (box) {
      // Prefer pointer events — pad binds pointerdown, not mousedown
      await runBtn.dispatchEvent('pointerdown');
      let firstHost = null;
      let firstBed = null;
      let firstMove = null;
      let basePos = null;
      for (let i = 0; i < 40; i++) {`;
if (!s.includes(old)) { console.error('run hold block missing'); process.exit(1); }
s = s.replace(old, neu);
s = s.replace(`await runner.page.mouse.up();
      padFeel.runLatencyMs = firstHost?.dt ?? null;`,
`await runBtn.dispatchEvent('pointerup');
      padFeel.runLatencyMs = firstHost?.dt ?? null;`);
// Also sample follow player pos delta during stick
const stickOld = `await runner.page.mouse.move(cx, cy);
      await runner.page.mouse.down();
      await runner.page.mouse.move(cx + box.width * 0.35, cy - box.height * 0.2, { steps: 6 });
      await sleep(200);`;
const stickNeu = `await stick.dispatchEvent('pointerdown', { clientX: cx, clientY: cy, pointerId: 1, buttons: 1 });
      await stick.dispatchEvent('pointermove', { clientX: cx + box.width * 0.35, clientY: cy - box.height * 0.2, pointerId: 1, buttons: 1 });
      await sleep(250);`;
if (!s.includes(stickOld)) { console.error('stick drag missing'); process.exit(1); }
s = s.replace(stickOld, stickNeu);
s = s.replace(`await runner.page.mouse.up();
      note('PAD_STICK_ALT', after);`, `note('PAD_STICK_ALT', after);`);
// Fix findings: don't flag F-RUN-NO-HOST-ECHO as high when lastPad isn't instrumented — demote
s = s.replace(`if (padFeel.runLatencyMs == null && runnerRole?.hasRunBtn) {
    findings.push({
      id: 'F-RUN-NO-HOST-ECHO',
      sev: 'med',
      feel: 'Held RUN but host never showed lastPad.run within 2s — pad→TV cue feel dead or unobservable',
      evidence: { runLatencyMs: padFeel.runLatencyMs, presses: padFeel.presses.slice(0, 3) },
    });
  } else if (padFeel.runLatencyMs != null && padFeel.runLatencyMs > 350) {`,
`if (padFeel.duringHold && !padFeel.duringHold.runOn && runnerRole?.hasRunBtn) {
    findings.push({
      id: 'F-RUN-NO-VISUAL-CONFIRM',
      sev: 'high',
      feel: 'Held RUN but #run-btn never got .on — thumb gets no confirm',
      evidence: padFeel.duringHold,
    });
  } else if (padFeel.runLatencyMs != null && padFeel.runLatencyMs > 350) {`);
fs.writeFileSync(p, s);
console.log('patched2', s.length);
