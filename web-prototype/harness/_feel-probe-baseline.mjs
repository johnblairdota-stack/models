/**
 * feel-probe — supplemental play-feel measurements on main (stick/intro/recap/map labels).
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178, WS = 5181, CODE = 'fzzt';
const OUT = path.join(ROOT, 'progress', 'feel-probe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const notes = [];
const note = (k, v) => { notes.push({ k, v }); console.log(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`); };

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const HMR = `const noop=()=>{}; export const createHotContext=()=>({accept:noop,acceptExports:noop,dispose:noop,prune:noop,decline:noop,invalidate:noop,on:noop,off:noop,send:noop,data:{}}); export const updateStyle=(id,c)=>{let e=document.querySelector('style[data-vite-dev-id="'+id+'"]'); if(!e){e=document.createElement('style');e.setAttribute('data-vite-dev-id',id);document.head.appendChild(e);} e.textContent=c;}; export const removeStyle=(id)=>document.querySelector('style[data-vite-dev-id="'+id+'"]')?.remove(); export const injectQuery=(u)=>u; export const ErrorOverlay=class{};`;

async function seat(name, viewport) {
  const c = await browser.newContext({ viewport });
  await c.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: HMR }));
  if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
  return c;
}

const base = `http://127.0.0.1:${WEB}`;
try {
  const tvCtx = await seat(null, { width: 1600, height: 900 });
  const tv = await tvCtx.newPage();
  await tv.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
  await tv.waitForSelector('.night-code', { timeout: 20000 });
  const codeShown = await tv.evaluate(() => document.querySelector('.night-code')?.textContent?.trim());
  note('host.roomCode', codeShown);
  await tv.screenshot({ path: path.join(OUT, '00-host-lobby.png') });

  const phones = [];
  for (const who of ['Ada', 'Bo', 'Cy']) {
    const c = await seat(who, { width: 430, height: 900 });
    const p = await c.newPage();
    p.on('pageerror', (e) => console.log(`  pageerror ${who}: ${e.message}`));
    await p.goto(`${base}/?view=party.phone&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
    // dump if lock-look slow
    const locked = await p.waitForSelector('#lock-look', { timeout: 25000 }).then(() => true).catch(async () => {
      const dump = await p.evaluate(() => ({
        err: document.querySelector('.err, .night-err, [data-err]')?.textContent,
        body: document.body.innerText.slice(0, 500),
        step: window.__rrrPhone?.state?.step ?? null,
      }));
      note(`phone.${who}.joinFail`, dump);
      await p.screenshot({ path: path.join(OUT, `fail-${who}.png`) });
      return false;
    });
    if (!locked) throw new Error(`${who} never got #lock-look`);
    await p.click('#lock-look');
    phones.push({ page: p, name: who });
    note(`phone.${who}`, 'locked');
  }
  await sleep(800);

  const beatBefore = await tv.evaluate(() => window.__rrrHost?.beat ?? null);
  note('beat.beforeStart', beatBefore);
  const tStart = Date.now();
  await tv.click('#go', { timeout: 20000 });
  let introSeen = null;
  for (let i = 0; i < 75; i++) {
    const s = await tv.evaluate(() => ({
      beat: window.__rrrHost?.beat ?? null,
      hasIntro: !!document.querySelector('.intro, .cast-intro, [data-intro], .meshy-intro, .seat-intro, .night-intro, .procession'),
      textHit: /casting|intro|meet the|procession/i.test(document.body.innerText),
      mainText: (document.querySelector('.night-main')?.innerText || '').slice(0, 200),
    }));
    if (s.beat && s.beat !== 'lobby') { introSeen = { ...s, ms: Date.now() - tStart }; break; }
    await sleep(200);
  }
  note('intro.afterStartMs', introSeen?.ms ?? 'timeout');
  note('intro.beat', introSeen?.beat ?? null);
  note('intro.hasIntroEl', introSeen?.hasIntro ?? false);
  note('intro.mainText', introSeen?.mainText ?? '');
  await tv.screenshot({ path: path.join(OUT, '01-after-start.png') });

  for (const { page, name } of phones) {
    await page.waitForSelector('#card-done', { state: 'visible', timeout: 30000 });
    const bar = await page.$('#card-hold');
    const box = await bar.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await sleep(300);
    await page.mouse.up();
    await sleep(400);
    await page.click('#card-done');
    note(`card.${name}`, 'done');
  }

  for (const { page, name } of phones) {
    await page.waitForSelector('[data-pick]', { timeout: 20000 });
    for (const step of [0, 1]) {
      const picks = await page.$$('[data-pick]:not([disabled])');
      await picks[step === 0 ? 0 : Math.min(1, picks.length - 1)].click();
      await page.waitForSelector('#lock-pick', { state: 'visible', timeout: 15000 });
      await page.click('#lock-pick');
      await sleep(200);
    }
    note(`cast.${name}`, 'ok');
  }
  await sleep(500);
  await tv.waitForSelector('#lock:not([disabled])', { timeout: 20000 });
  const tLock = Date.now();
  await tv.click('#lock');
  await tv.waitForSelector('.run-frame', { timeout: 15000 });
  note('lock.toRunFrameMs', Date.now() - tLock);

  const hold = async () => {
    await tv.evaluate(() => document.querySelector('#to-run')?.click());
    await sleep(400);
  };
  await hold();

  let bakeMs = null;
  {
    const t0 = Date.now();
    for (let i = 0; i < 120; i++) {
      const ok = await tv.evaluate(() => {
        const w = document.querySelector('iframe.run-cam')?.contentWindow;
        if (!document.querySelector('.run-cam-layer')?.classList.contains('live')) {
          document.querySelector('#to-run')?.click();
        }
        return w?.__rrrFollow?.mode?.() === 'run' && w?.document?.body?.dataset?.rrrFollow === 'live';
      });
      if (ok) { bakeMs = Date.now() - t0; break; }
      await sleep(1000);
    }
  }
  note('bake.toRunMs', bakeMs);
  if (bakeMs == null) throw new Error('bake never reached run');
  await hold();

  const seats = [];
  for (const { page, name } of phones) {
    const s = await page.evaluate(() => ({
      runner: !!window.__rrrPhone?.iAmRunner,
      guide: !!window.__rrrPhone?.iAmGuide,
      alignment: window.__rrrPhone?.frame?.you?.alignment ?? 'good',
    }));
    seats.push({ page, name, ...s });
  }
  const runner = seats.find((s) => s.runner);
  const guide = seats.find((s) => s.guide);
  note('roles', { runner: runner?.name, guide: guide?.name, gAlign: guide?.alignment });

  if (runner && await runner.page.$('#stick')) {
    const box = await runner.page.locator('#stick').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const read = () => tv.evaluate(() => {
      const f = document.querySelector('iframe.run-cam')?.contentWindow?.__rrrFollow;
      const r = f?.readout?.() ?? {};
      return { x: f.runner.pos.x, z: f.runner.pos.z, facing: f.runner.facing, throttle: r.throttle, speed: r.speed };
    });

    const before = await read();
    await runner.page.mouse.move(cx, cy);
    await runner.page.mouse.down();
    await runner.page.mouse.move(cx + box.width * 0.04, cy, { steps: 2 });
    await sleep(800);
    const midDz = await read();
    await runner.page.mouse.up();
    await sleep(400);
    note('stick.tinyNudgeMovedM', +Math.hypot(midDz.x - before.x, midDz.z - before.z).toFixed(3));
    note('stick.tinyNudgeThrottle', midDz.throttle);

    const b2 = await read();
    await runner.page.mouse.move(cx, cy);
    await runner.page.mouse.down();
    await runner.page.mouse.move(cx + box.width * 0.35, cy, { steps: 2 });
    await sleep(300);
    const early = await read();
    await sleep(1200);
    const late = await read();
    await runner.page.mouse.up();
    note('stick.leaveDzEarlySpeed', early.speed);
    note('stick.leaveDzLateSpeed', late.speed);
    note('stick.leaveDzEarlyThrottle', early.throttle);
    note('stick.leaveDzMovedM', +Math.hypot(late.x - b2.x, late.z - b2.z).toFixed(3));

    const facings = [];
    await runner.page.mouse.move(cx, cy);
    await runner.page.mouse.down();
    await runner.page.mouse.move(cx + box.width * 0.48, cy - box.height * 0.05, { steps: 3 });
    for (let i = 0; i < 20; i++) {
      await sleep(100);
      facings.push((await read()).facing);
    }
    await runner.page.mouse.up();
    let chatter = 0;
    for (let i = 1; i < facings.length; i++) {
      let d = Math.abs(facings[i] - facings[i - 1]);
      if (d > Math.PI) d = 2 * Math.PI - d;
      chatter += d;
    }
    note('stick.rimFacingAbsDeltaSum', +chatter.toFixed(3));
    await runner.page.screenshot({ path: path.join(OUT, '02-runner-stick.png') });
  } else {
    note('stick', 'NO_RUNNER_PAD');
  }

  if (guide) {
    await hold();
    const map = await guide.page.evaluate(() => {
      const root = document.querySelector('.guide-map');
      const labels = [...(root?.querySelectorAll('text, .gm-label, .gm-room, [data-room]') || [])]
        .map((el) => (el.textContent || '').trim()).filter(Boolean);
      const allText = root?.textContent ?? '';
      const words = (allText.match(/[A-Z][A-Z][A-Z]+(?:\s+[A-Z]+)*/g) || []).map((s) => s.trim());
      return {
        labels, words,
        noteEl: document.querySelector('[data-gm-note]')?.textContent?.trim() ?? '',
        jam: !!root?.classList.contains('jam'),
        hunter: !!root?.querySelector('.gm-hunter'),
        map: !!root,
        feed: document.querySelector('.prod-feed, [data-prod-feed], .production-feed')?.textContent?.trim()?.slice(0, 120) ?? null,
      };
    });
    const src = map.labels.length ? map.labels : map.words;
    const counts = {};
    for (const w of src) counts[w] = (counts[w] || 0) + 1;
    note('guide.mapPresent', map.map);
    note('guide.labels', src);
    note('guide.duplicateLabels', Object.entries(counts).filter(([, n]) => n > 1));
    note('guide.note', map.noteEl);
    note('guide.jam', map.jam);
    note('guide.hunterMark', map.hunter);
    note('guide.feed', map.feed);
    await guide.page.screenshot({ path: path.join(OUT, '03-guide-map.png') });
  }

  // Recap natural flip — do NOT hold run
  const beatLog = [];
  const tRec0 = Date.now();
  for (let i = 0; i < 45; i++) {
    const b = await tv.evaluate(() => ({
      beat: window.__rrrHost?.beat ?? null,
      buttons: [...document.querySelectorAll('button')].map((x) => x.textContent.trim()).slice(0, 10),
      bodyHit: /recap|phones down|verdict/i.test(document.body.innerText),
    }));
    beatLog.push({ t: Date.now() - tRec0, ...b });
    if (b.beat === 'recap' || b.buttons.some((x) => /recap/i.test(x)) || (b.beat && b.beat !== 'expedition' && b.beat !== 'run')) {
      note('recap.flip', b);
      break;
    }
    await sleep(1000);
  }
  note('recap.last', beatLog.at(-1));
  note('recap.msSinceLock', Date.now() - tLock);
  await tv.screenshot({ path: path.join(OUT, '04-late-tv.png') });

  await writeFile(path.join(OUT, 'notes.json'), JSON.stringify({ notes, beatLog }, null, 2));
  console.log('\nfeel-probe done → progress/feel-probe/');
  await browser.close();
  process.exit(0);
} catch (e) {
  console.log('FEEL PROBE FAIL:', e?.message || e);
  await writeFile(path.join(OUT, 'notes.json'), JSON.stringify({ notes, error: String(e?.message || e) }, null, 2)).catch(() => {});
  await browser.close().catch(() => {});
  process.exit(1);
}
