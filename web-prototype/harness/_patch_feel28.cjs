const fs = require('fs');
const p = 'harness/_overnight_feel28.mjs';
let s = fs.readFileSync(p, 'utf8');

const old = `const mapTap = await guide.page.evaluate(() => {
    const el = document.querySelector('[data-room],.gm-room');
    if (!el) return { tapped: false };
    el.click();
    return { tapped: true, label: (el.textContent || el.getAttribute('data-room') || '').trim() };
  });
  note('MAP_TAP', mapTap);`;

const neu = `const mapProbe = await guide.page.evaluate(() => {
    const map = document.querySelector('.guide-map, svg.guide-map, svg');
    const runnerEl = map?.querySelector('.gm-runner');
    const hunterEl = map?.querySelector('.gm-hunter');
    const jam = map?.classList?.contains('jam') || !!document.querySelector('.gm-jam');
    const rooms = [...document.querySelectorAll('[data-room],.gm-room,text')].slice(0, 20).map((el) => ({
      tag: el.tagName, text: (el.textContent || '').trim().slice(0, 40),
      data: el.getAttribute?.('data-room'),
    }));
    const noiseTexts = (document.body?.innerText || '').split(/\\n/).filter((l) => /[#%@*\\\\|]{3,}/.test(l)).slice(0, 6);
    return {
      hasRunnerMark: !!runnerEl,
      runnerPos: runnerEl ? { cx: runnerEl.getAttribute('cx'), cy: runnerEl.getAttribute('cy') } : null,
      hasHunterMark: !!hunterEl,
      hunterPos: hunterEl ? { cx: hunterEl.getAttribute('cx'), cy: hunterEl.getAttribute('cy') } : null,
      jamClass: !!jam,
      roomNodes: rooms,
      noiseLineCount: noiseTexts.length,
      noiseSample: noiseTexts,
      svgViewBox: map?.getAttribute?.('viewBox') || null,
    };
  });
  note('MAP_PROBE', mapProbe);
  const roomText = guide.page.locator('svg text').filter({ hasText: /BALLROOM|GALLERY|CHAPEL/i }).first();
  let mapTap = { tapped: false };
  if (await roomText.count()) {
    await roomText.click({ force: true }).catch(() => {});
    mapTap = { tapped: true, via: 'svg-text' };
  }
  note('MAP_TAP', mapTap);`;

if (!s.includes(old)) { console.error('OLD BLOCK NOT FOUND'); process.exit(1); }
s = s.replace(old, neu);

const oldPad = `padFeel.runLatencyMs = firstHost?.dt ?? null;
      padFeel.bedRunSeenMs = firstBed?.dt ?? null;
      padFeel.runBtnVisualOn = await runner.page.evaluate(() => document.querySelector('#run-btn')?.classList.contains('on'));
      note('PAD_RUN', { runLatencyMs: padFeel.runLatencyMs, bedRunSeenMs: padFeel.bedRunSeenMs, runBtnVisualOn: padFeel.runBtnVisualOn, samples: padFeel.presses.length });`;

const neuPad = `padFeel.runLatencyMs = firstHost?.dt ?? null;
      padFeel.bedRunSeenMs = firstBed?.dt ?? null;
      await runner.page.mouse.down();
      await sleep(120);
      const during = await runner.page.evaluate(() => ({
        runOn: !!document.querySelector('#run-btn')?.classList.contains('on'),
        stickOn: !!document.querySelector('#stick')?.classList.contains('on'),
        nubTransform: document.querySelector('[data-nub]')?.style?.transform || null,
        padFx: document.querySelector('[data-pad-fx]')?.textContent || '',
      }));
      await runner.page.mouse.up();
      padFeel.runBtnVisualOn = during.runOn;
      padFeel.duringHold = during;
      note('PAD_RUN', { runLatencyMs: padFeel.runLatencyMs, bedRunSeenMs: padFeel.bedRunSeenMs, during, samples: padFeel.presses.length });`;

if (!s.includes(oldPad)) { console.error('PAD BLOCK NOT FOUND'); process.exit(1); }
s = s.replace(oldPad, neuPad);

s = s.replace("const stick = await runner.page.$('#stick, .stick, [data-stick], .pad-stick, #pad');", "const stick = await runner.page.$('#stick');");

const oldStickNote = `note('PAD_STICK', { mid, hostPad });`;
const neuStickNote = `const duringStick = await runner.page.evaluate(() => ({
        stickOn: !!document.querySelector('#stick')?.classList.contains('on'),
        nubTransform: document.querySelector('[data-nub]')?.style?.transform || '',
      }));
      note('PAD_STICK', { mid, hostPad, duringStick });
      padFeel.stickConfirm = duringStick;`;
if (!s.includes(oldStickNote)) { console.error('STICK NOTE NOT FOUND'); process.exit(1); }
s = s.replace(oldStickNote, neuStickNote);

// findings: use mapProbe runner mark
s = s.replace(
  "if (!mapFeel.youMark && mapFeel.hasSvg) {\n    findings.push({\n      id: 'F-GUIDE-NO-YOU-MARK',",
  "if (!mapProbe.hasRunnerMark && !mapFeel.youMark && mapFeel.hasSvg) {\n    findings.push({\n      id: 'F-GUIDE-NO-YOU-MARK',"
);

s = s.replace(
  "evidence: { marks: mapFeel.marks, youMark: mapFeel.youMark },",
  "evidence: { marks: mapFeel.marks, youMark: mapFeel.youMark, mapProbe },"
);

// include mapProbe in verdict
s = s.replace("mapFeel,\n    chaseTicks:", "mapFeel,\n    mapProbe,\n    chaseTicks:");

fs.writeFileSync(p, s);
console.log('patched ok', s.length);
