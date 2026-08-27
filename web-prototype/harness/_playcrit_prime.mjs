#!/usr/bin/env node
/**
 * rrr-playcritique — PRIME TIME, HEAD e8f60d4.
 * PLAY FEEL ONLY. Not an art pass, not a chrome-honesty pass.
 *
 * Stick→world is already proven. So this run asks the questions a PLAYER asks:
 *   1. How long from thumb to body?  (latency, measured, not asserted)
 *   2. Does the body go where the thumb said? (bearing error, in degrees)
 *   3. Does it stop when I let go, or does it slide? (coast distance)
 *   4. Does RUN feel like anything?  (walk vs run separation)
 *   5. Can I turn — 90° left, 180° back — and how long does it take?
 *   6. Does the SWING do anything I can see?
 *   7. Is the hunter a threat I can perceive?  (distance over time vs. what I'm told)
 *   8. What does the GUIDE hold, and can the two of us actually cooperate?
 *   9. First sixty seconds: what is on screen, and does it tell me what to do?
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178, WS = 5181;
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const OUT = path.join(ROOT, 'progress', 'playcrit-prime');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEG = (r) => +(r * 180 / Math.PI).toFixed(1);

const HMR_STUB = `const noop = () => {};
export const createHotContext = () => ({ accept: noop, acceptExports: noop, dispose: noop,
  prune: noop, call: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} });
export const updateStyle = (id, c) => { let e = document.querySelector('style[data-vite-dev-id="'+id+'"]');
  if (!e) { e = document.createElement('style'); e.setAttribute('data-vite-dev-id', id); document.head.appendChild(e); }
  e.textContent = c; };
export const removeStyle = (id) => { document.querySelector('style[data-vite-dev-id="'+id+'"]')?.remove(); };
export const injectQuery = (u) => u;
export const ErrorOverlay = class {};`;

const log = [];
const note = (k, v) => {
  log.push({ k, v, at: Date.now() });
  console.log('\n### ' + k, typeof v === 'string' ? v.slice(0, 2000) : JSON.stringify(v, null, 1).slice(0, 2500));
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const shot = async (page, name) => {
    try { await page.screenshot({ path: path.join(OUT, name + '.png') }); } catch (e) { note('SHOT_FAIL', name + ' ' + e.message); }
  };

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=desktop', '--disable-gpu-driver-bug-workarounds'] });
    note('browser', 'chrome GPU');
  } catch (e) {
    browser = await chromium.launch({ headless: true });
    note('browser', 'fallback ' + e.message);
  }
  const base = `http://localhost:${WEB}`;
  note('SETUP', { CODE, HEAD: 'e8f60d4', base });

  const errs = [];
  async function seat(name, viewport, touch) {
    const c = await browser.newContext({ viewport, hasTouch: !!touch });
    await c.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: HMR_STUB }));
    if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
    return c;
  }

  // ---------------------------------------------------------------- FIRST 60s
  const T0 = Date.now();
  const beat = (k) => note('BEAT_' + k, { atMs: Date.now() - T0 });

  const tvCtx = await seat(null, { width: 1280, height: 800 }, false);
  const host = await tvCtx.newPage();
  host.on('pageerror', (e) => errs.push('HOST ' + e.message));
  host.on('console', (m) => { if (m.type() === 'error') errs.push('HOSTCON ' + m.text().slice(0, 200)); });
  await host.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await host.waitForSelector('.night-code', { timeout: 25000 });
  beat('HOST_CODE_UP');
  await shot(host, '01-host-lobby');

  const phones = [];
  for (const who of ['Ada', 'Ben']) {
    const c = await seat(who, { width: 390, height: 844 }, true);
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(who + ' ' + e.message));
    await p.goto(`${base}/?view=party.phone&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#lock-look', { timeout: 25000 });
    await p.click('#lock-look');
    phones.push({ page: p, name: who });
  }
  beat('BOTH_JOINED');
  await shot(phones[0].page, '02-phone-ada-joined');

  for (let i = 0; i < 40; i++) {
    if (await host.evaluate(() => { const b = document.querySelector('#go'); return b && !b.disabled; })) break;
    await sleep(400);
  }
  await host.locator('#go').click({ timeout: 20000, force: true });
  beat('START_PRESSED');

  for (const { page, name } of phones) {
    await page.waitForFunction(() => {
      const b = document.querySelector('#card-done');
      const v = document.querySelector('.card-view');
      return !!b && !!v && !v.classList.contains('hide');
    }, { timeout: 45000 });
    if (name === 'Ada') await shot(page, '03-phone-ada-rolecard');
    const bar = await page.$('#card-hold');
    if (bar) {
      const box = await bar.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down(); await sleep(300); await page.mouse.up(); await sleep(400);
      }
    }
    await page.locator('#card-done').click({ timeout: 15000, force: true });
  }
  beat('CARDS_DONE');

  for (const { page } of phones) {
    await page.waitForSelector('[data-pick]', { timeout: 45000 });
    for (const step of [0, 1]) {
      await page.waitForSelector('[data-pick]:not([disabled])', { timeout: 20000 });
      const picks = await page.$$('[data-pick]:not([disabled])');
      if (!picks.length) throw new Error('no picks');
      await picks[step === 0 ? 0 : Math.min(1, picks.length - 1)].click({ timeout: 20000 });
      await page.waitForSelector('#lock-pick', { state: 'visible', timeout: 15000 });
      await page.locator('#lock-pick').click({ timeout: 20000, force: true });
      await sleep(400);
    }
  }
  beat('CAST_DONE');
  await shot(host, '04-host-after-cast');
  await sleep(1200);

  let locked = false;
  for (let i = 0; i < 80; i++) {
    if (await host.evaluate(() => !!document.querySelector('#lock'))) {
      await host.locator('#lock').click({ timeout: 5000, force: true }); locked = true; break;
    }
    const btn = host.locator('button:has-text("Send them in")');
    if (await btn.count()) { await btn.first().click({ timeout: 5000, force: true }); locked = true; break; }
    await sleep(500);
  }
  if (!locked) throw new Error('Send them in never appeared');
  beat('SENT_IN');

  let live = null;
  for (let i = 0; i < 120; i++) {
    const s = await host.evaluate(() => {
      const h = window.__rrrHost || {};
      return { beat: h.beat, warm: h.warm, followLive: h.followLive, followMode: h.followMode };
    });
    if (s.beat === 'expedition' && s.warm === 'ready' && s.followLive) { live = s; break; }
    await sleep(400);
  }
  beat('CONTROL_LIVE');
  note('LIVE_STATE', live || 'TIMEOUT');
  if (!live) throw new Error('never went live');
  await shot(host, '05-host-live-tv');

  // Who holds what.
  const roles = [];
  for (const { page, name } of phones) {
    roles.push(await page.evaluate((n) => {
      const ph = window.__rrrPhone || {};
      return {
        name: n, runner: !!ph.iAmRunner, guide: !!ph.iAmGuide,
        stick: !!document.querySelector('#stick'), run: !!document.querySelector('#run-btn'),
        swing: !!document.querySelector('#swing-btn'),
        screen: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 420),
      };
    }, name));
  }
  note('ROLES', roles);
  const rIdx = roles.findIndex((r) => r.runner);
  const gIdx = roles.findIndex((r) => r.guide);
  const runner = phones[rIdx >= 0 ? rIdx : 0];
  const guide = gIdx >= 0 ? phones[gIdx] : null;
  await shot(runner.page, '06-runner-pad');
  if (guide) await shot(guide.page, '07-guide-screen');

  // What does the TV actually SAY at the moment control goes live?
  note('TV_TEXT_AT_LIVE', await host.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600)));

  // ---------------------------------------------------------------- recorder
  const rec = () => host.evaluate(() => {
    for (const f of document.querySelectorAll('iframe')) {
      const w = f.contentWindow;
      if (!w?.__rrrFollow) continue;
      if (w.__rec) { w.__rec.length = 0; return 'reset'; }
      const api = w.__rrrFollow;
      w.__rec = [];
      const tick = () => {
        try {
          const r = api.readout(); const p = api.runner?.pos;
          w.__rec.push({ t: Date.now(), s: r?.speed ?? null, th: r?.throttle ?? null, sh: r?.shot ?? null,
            x: p?.x ?? null, z: p?.z ?? null, hd: api.runner?.aimYaw ?? api.runner?.yaw ?? null });
          if (w.__rec.length > 6000) w.__rec.splice(0, 2000);
        } catch (e) { /* keep the loop alive */ }
        w.requestAnimationFrame(tick);
      };
      w.requestAnimationFrame(tick);
      return 'installed';
    }
    return 'NO_FOLLOW_IFRAME';
  });
  note('RECORDER', await rec());
  const dump = () => host.evaluate(() => {
    for (const f of document.querySelectorAll('iframe')) {
      const w = f.contentWindow;
      if (w?.__rec) { const c = w.__rec.slice(); w.__rec.length = 0; return c; }
    }
    return [];
  });
  const snap = () => host.evaluate(() => {
    for (const f of document.querySelectorAll('iframe')) {
      const api = f.contentWindow?.__rrrFollow;
      if (!api) continue;
      let w = null, h = null;
      try { w = api.world(); } catch (e) { /* */ }
      try { h = api.hunter(); } catch (e) { /* */ }
      return { readout: api.readout(), world: w, hunter: h,
        slug: (f.contentDocument?.querySelector('#fl .slug')?.textContent || '').replace(/\s+/g, ' ').trim() };
    }
    return null;
  });

  const stickBox = await runner.page.locator('#stick').boundingBox();
  const runBox = await runner.page.locator('#run-btn').boundingBox();
  const swingBox = await runner.page.locator('#swing-btn').boundingBox();
  const cx = stickBox.x + stickBox.width / 2, cy = stickBox.y + stickBox.height / 2;
  const R = Math.min(stickBox.width, stickBox.height) * 0.44;
  note('PAD_GEOM', { stickBox, runBox, swingBox });

  const cdp = await runner.page.context().newCDPSession(runner.page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  // bearing: 0 = up on the pad. clockwise positive.
  const stickPt = (bearRad, mag = 1) => ({ x: cx + Math.sin(bearRad) * R * mag, y: cy - Math.cos(bearRad) * R * mag, id: 2 });
  const runPt = { x: runBox.x + runBox.width / 2, y: runBox.y + runBox.height / 2, id: 1 };

  async function padState() {
    return runner.page.evaluate(() => ({
      stickOn: !!document.querySelector('#stick')?.classList.contains('on'),
      runOn: !!document.querySelector('#run-btn')?.classList.contains('on'),
      nub: document.querySelector('[data-nub]')?.style?.transform || '',
      fx: (document.querySelector('[data-pad-fx]')?.textContent || '').replace(/\s+/g, ' ').trim(),
    }));
  }

  const results = {};

  // =============================================== 1. IDLE — does it sit still?
  await rec();
  await sleep(2500);
  const idle = await dump();
  results.idle = {
    samples: idle.length,
    fps: +(idle.length / 2.5).toFixed(1),
    speeds: idle.map((r) => r.s).filter((v, i) => i % 8 === 0),
    throttles: [...new Set(idle.map((r) => r.th))],
    drift_m: idle.length > 1 ? +Math.hypot(idle.at(-1).x - idle[0].x, idle.at(-1).z - idle[0].z).toFixed(3) : null,
  };
  note('T1_IDLE', results.idle);

  // =============================================== 2. LATENCY thumb → body
  const lat = [];
  for (let k = 0; k < 3; k++) {
    await rec(); await sleep(300);
    const tDown = Date.now();
    await touch('touchStart', [stickPt(0, 1)]);
    await sleep(900);
    await touch('touchEnd', []);
    const d = await dump();
    const first = d.find((r) => r.s > 0.05);
    const firstTh = d.find((r) => r.th && r.th !== 'STILL');
    lat.push({
      moveMs: first ? first.t - tDown : null,
      throttleMs: firstTh ? firstTh.t - tDown : null,
      peak: Math.max(...d.map((r) => r.s || 0)),
    });
    await sleep(900);
  }
  results.latency = lat;
  note('T2_LATENCY_thumb_to_body', lat);

  // =============================================== 3. BEARING — does it go where I said?
  // Push a bearing, hold, measure the world displacement bearing. Repeat for 4 quadrants.
  const bearings = [];
  for (const [label, bear] of [['UP(fwd)', 0], ['LEFT', -Math.PI / 2], ['RIGHT', Math.PI / 2], ['DOWN(back)', Math.PI]]) {
    await rec(); await sleep(400);
    const pre = await dump();
    const p0 = pre.at(-1);
    await touch('touchStart', [stickPt(bear, 1)]);
    await sleep(2600);
    const mid = await dump();
    await touch('touchEnd', []);
    await sleep(1400);
    // displacement measured over the LAST second of the hold — after the turn has settled
    const late = mid.filter((r) => r.t > mid.at(-1).t - 1000);
    const dx = late.at(-1).x - late[0].x, dz = late.at(-1).z - late[0].z;
    const moved = Math.hypot(dx, dz);
    bearings.push({
      label, askedDeg: DEG(bear),
      startHeadingDeg: p0?.hd == null ? null : DEG(p0.hd),
      settledWorldBearingDeg: moved > 0.05 ? DEG(Math.atan2(dx, dz)) : null,
      movedInLastSec_m: +moved.toFixed(2),
      totalMove_m: +Math.hypot(mid.at(-1).x - p0.x, mid.at(-1).z - p0.z).toFixed(2),
      peakSpeed: +Math.max(...mid.map((r) => r.s || 0)).toFixed(2),
    });
    await sleep(500);
  }
  // error vs. intent: asked bearing is relative to the heading latched at press
  for (const b of bearings) {
    if (b.settledWorldBearingDeg != null && b.startHeadingDeg != null) {
      let e = b.settledWorldBearingDeg - (b.startHeadingDeg + b.askedDeg);
      while (e > 180) e -= 360; while (e < -180) e += 360;
      b.bearingErrorDeg = +e.toFixed(1);
    }
  }
  results.bearing = bearings;
  note('T3_BEARING_body_relative', bearings);

  // =============================================== 4. STOP — coast on release
  const stops = [];
  for (let k = 0; k < 2; k++) {
    await rec();
    await touch('touchStart', [stickPt(0, 1)]);
    await sleep(2000);
    const tUp = Date.now();
    await touch('touchEnd', []);
    await sleep(2000);
    const d = await dump();
    const after = d.filter((r) => r.t >= tUp);
    const stopIdx = after.findIndex((r) => r.s <= 0.05);
    const stopped = stopIdx >= 0 ? after[stopIdx] : null;
    const coast = stopped ? Math.hypot(stopped.x - after[0].x, stopped.z - after[0].z) : null;
    const thStill = after.find((r) => r.th === 'STILL');
    stops.push({
      speedAtRelease: after[0]?.s,
      stopMs: stopped ? stopped.t - tUp : null,
      coast_m: coast == null ? null : +coast.toFixed(2),
      throttleSaysStillMs: thStill ? thStill.t - tUp : null,
    });
    await sleep(800);
  }
  results.stop = stops;
  note('T4_STOP_coast', stops);

  // =============================================== 5. WALK vs RUN
  await rec();
  await touch('touchStart', [stickPt(0, 1)]);
  await sleep(3000);
  const walk = await dump();
  await touch('touchEnd', []); await sleep(1200);
  await rec();
  await touch('touchStart', [runPt, stickPt(0, 1)]);
  await sleep(300);
  const runPad = await padState();
  await sleep(2700);
  const runD = await dump();
  await touch('touchEnd', []); await sleep(1200);
  const topOf = (d) => +Math.max(...d.map((r) => r.s || 0)).toFixed(2);
  const distOf = (d) => +Math.hypot(d.at(-1).x - d[0].x, d.at(-1).z - d[0].z).toFixed(2);
  results.gears = {
    walk: { top: topOf(walk), dist3s_m: distOf(walk), throttles: [...new Set(walk.map((r) => r.th))] },
    run: { top: topOf(runD), dist3s_m: distOf(runD), throttles: [...new Set(runD.map((r) => r.th))], padSaysRun: runPad.runOn },
    separation: +(topOf(runD) / Math.max(0.01, topOf(walk))).toFixed(2),
  };
  note('T5_WALK_vs_RUN', results.gears);

  // =============================================== 6. SWING — is there a receipt?
  await rec();
  const swingBefore = await snap();
  await touch('touchStart', [{ x: swingBox.x + swingBox.width / 2, y: swingBox.y + swingBox.height / 2, id: 3 }]);
  await sleep(120);
  const padDuringSwing = await padState();
  await touch('touchEnd', []);
  await sleep(200);
  const padAfterSwing = await padState();
  await shot(runner.page, '08-runner-after-swing');
  await shot(host, '09-host-during-swing');
  await sleep(900);
  results.swing = {
    padFxDuring: padDuringSwing.fx, padFxAfter: padAfterSwing.fx,
    bedBefore: swingBefore?.readout, bedAfter: (await snap())?.readout,
    hostTextHasHit: await host.evaluate(() => /hit|smash|swing|blow/i.test(document.body.innerText || '')),
  };
  note('T6_SWING_receipt', results.swing);

  // Swing WHILE moving — the real case
  await rec();
  await touch('touchStart', [stickPt(0, 1)]);
  await sleep(900);
  const movingBefore = (await dump()).at(-1);
  await touch('touchStart', [stickPt(0, 1), { x: swingBox.x + swingBox.width / 2, y: swingBox.y + swingBox.height / 2, id: 3 }])
    .catch(() => {});
  await sleep(140);
  await touch('touchEnd', [stickPt(0, 1)]).catch(() => {});
  await sleep(1200);
  const movingD = await dump();
  await touch('touchEnd', []);
  results.swingMoving = {
    speedBefore: movingBefore?.s,
    speedsAfter: movingD.filter((_, i) => i % 6 === 0).map((r) => r.s).slice(-10),
    minSpeedAfter: +Math.min(...movingD.map((r) => r.s ?? 9)).toFixed(2),
    padFx: (await padState()).fx,
  };
  note('T6b_SWING_while_moving', results.swingMoving);
  await sleep(800);

  // =============================================== 7. HUNTER — perceivable threat?
  const hunt = [];
  for (let i = 0; i < 14; i++) {
    const s = await snap();
    if (s?.world) {
      const d = Math.hypot(s.world.runner.x - s.world.hunter.x, s.world.runner.z - s.world.hunter.z);
      hunt.push({ i, dist_m: +d.toFixed(1), rRoom: s.world.runner.room, hRoom: s.world.hunter.room,
        sameRoom: s.world.runner.room === s.world.hunter.room, hState: s.hunter?.state ?? null, slug: s.slug });
    }
    await sleep(700);
  }
  results.hunter = hunt;
  note('T7_HUNTER', { closest: Math.min(...hunt.map((h) => h.dist_m)), farthest: Math.max(...hunt.map((h) => h.dist_m)),
    everSameRoom: hunt.some((h) => h.sameRoom), states: [...new Set(hunt.map((h) => h.hState))],
    slugs: [...new Set(hunt.map((h) => h.slug))], track: hunt.map((h) => h.dist_m) });

  // Does ANYTHING on the runner's phone or the TV change with hunter distance?
  results.threatCues = {
    runnerPhoneText: await runner.page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400)),
    tvText: await host.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400)),
    guideText: guide ? await guide.page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600)) : null,
  };
  note('T7b_THREAT_CUES', results.threatCues);

  // =============================================== 8. GUIDE — can we cooperate?
  if (guide) {
    results.guide = await guide.page.evaluate(() => {
      const marks = document.querySelectorAll('[data-mark], .mark, .map-mark, [data-room]');
      return {
        hasMap: !!document.querySelector('.guide-map, #guide-map, svg'),
        markCount: marks.length,
        buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).slice(0, 14),
        text: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 700),
      };
    });
    note('T8_GUIDE', results.guide);
    await shot(guide.page, '10-guide-during-run');
  }

  // =============================================== 9. LONG DRIVE — play it for a bit
  // Roll the thumb round a circle like a player finding their way, and see what happens.
  await rec();
  await touch('touchStart', [stickPt(0, 1)]);
  const drive = [];
  for (let i = 0; i < 16; i++) {
    const bear = Math.sin(i / 2.4) * 1.1;
    await touch('touchMove', [stickPt(bear, 1)]);
    await sleep(500);
    const s = await snap();
    drive.push({ i, bearDeg: DEG(bear), speed: s?.readout?.speed, th: s?.readout?.throttle, shot: s?.readout?.shot,
      room: s?.world?.runner?.room });
    if (i === 8) await shot(host, '11-host-mid-drive');
  }
  await touch('touchEnd', []);
  const driveRec = await dump();
  results.drive = {
    samples: drive,
    shots: [...new Set(drive.map((d) => d.shot))],
    rooms: [...new Set(drive.map((d) => d.room))],
    totalDist_m: +Math.hypot(driveRec.at(-1).x - driveRec[0].x, driveRec.at(-1).z - driveRec[0].z).toFixed(2),
    pathLen_m: +driveRec.reduce((a, r, i) => i ? a + Math.hypot(r.x - driveRec[i - 1].x, r.z - driveRec[i - 1].z) : 0, 0).toFixed(2),
    fps: +(driveRec.length / ((driveRec.at(-1).t - driveRec[0].t) / 1000)).toFixed(1),
  };
  note('T9_DRIVE', results.drive);
  await shot(host, '12-host-after-drive');
  await shot(runner.page, '13-runner-after-drive');

  // =============================================== 10. WALL — what happens when I hit one?
  await rec();
  await touch('touchStart', [runPt, stickPt(0, 1)]);
  await sleep(6000);
  const wall = await dump();
  await touch('touchEnd', []);
  const speeds = wall.map((r) => r.s || 0);
  const stalled = [];
  for (let i = 10; i < wall.length; i++) {
    const step = Math.hypot(wall[i].x - wall[i - 1].x, wall[i].z - wall[i - 1].z);
    if (step < 0.002 && speeds[i] > 0.3) stalled.push(i);
  }
  results.wall = {
    peak: +Math.max(...speeds).toFixed(2),
    stalledFrames: stalled.length,
    totalFrames: wall.length,
    pathLen_m: +wall.reduce((a, r, i) => i ? a + Math.hypot(r.x - wall[i - 1].x, r.z - wall[i - 1].z) : 0, 0).toFixed(2),
    netDist_m: +Math.hypot(wall.at(-1).x - wall[0].x, wall.at(-1).z - wall[0].z).toFixed(2),
    finalRoom: (await snap())?.world?.runner?.room,
  };
  note('T10_WALL_pressure', results.wall);
  await shot(host, '14-host-wall');

  results.errors = errs.slice(0, 30);
  note('PAGE_ERRORS', results.errors.length ? results.errors : 'none');

  await writeFile(path.join(OUT, 'results.json'), JSON.stringify({ results, log }, null, 2));
  note('DONE', OUT);
  await browser.close();
}

main().catch(async (e) => {
  console.error('\n!!! FAILED:', e.stack || e.message);
  await writeFile(path.join(OUT, 'crash.json'), JSON.stringify({ err: String(e.stack || e), log }, null, 2)).catch(() => {});
  process.exit(1);
});
