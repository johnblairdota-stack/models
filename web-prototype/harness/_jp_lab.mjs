/**
 * _jp_lab — critic's playtest bench for JELLIE. Forked from jellie-play.mjs.
 *
 * Scenarios (--scene):
 *   control   : is the TV ballroom EVER populated? shoot every beat on the way to Debrief,
 *               and sit in Debrief for 30s to see if robots walk in.
 *   bleed     : does the pair sheet still WORK after the beat leaves Debrief?
 *   edges     : empty msg, 400-char msg, connect spam, mutual reach-out, decline, disconnect
 *   crowd     : 8 phones, 3 simultaneous pairs, read the TV
 *   alarm     : does an incoming invite make ANY noise / vibration / title change?
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const WEB = +arg('--port', 5220);
const WS = +arg('--wsPort', 5320);
const CODE = arg('--code', 'jazz');
const PHONES = +arg('--phones', 3);
const SCENE = arg('--scene', 'control');
const SHOTDIR = path.join(ROOT, 'progress', arg('--out', `jc-${SCENE}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (s) => { log.push(s); console.log(s); };
const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
async function waitPort(p, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await portOpen(p)) return; await sleep(250); }
  throw new Error(`${label} never opened :${p}`);
}
const kids = [];
let roomServer = null;
if (await portOpen(WS)) say(`  reusing room server :${WS}`);
else {
  const { startServer } = await import(pathToFileURL(path.join(ROOT, 'net/party/local.mjs')).href);
  roomServer = startServer({ port: WS });
  await waitPort(WS, 12000, 'room server');
  say(`  room server :${WS}`);
}
/* --dist serves the BUILT bundle instead of vite. This matters: the dev server has garbled
 * modules on this project before, and a ReferenceError for an imported symbol looks exactly
 * like that. Any crash must be reproduced here before it is called a game bug. */
const DIST = argv.includes('--dist');
if (await portOpen(WEB)) say(`  reusing :${WEB}`);
else if (DIST) {
  kids.push(spawn(process.execPath, [path.join(ROOT, 'harness/serve.mjs'), '--port', String(WEB)],
    { cwd: ROOT, stdio: 'ignore' }));
  await waitPort(WEB, 20000, 'dist server');
  say(`  DIST (built bundle) :${WEB}`);
} else {
  const p = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(WEB), '--strictPort', '--host', '127.0.0.1'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(p);
  await waitPort(WEB, 40000, 'vite');
  say(`  vite :${WEB}`);
}
const base = `http://127.0.0.1:${WEB}`;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const HMR_STUB = `const noop = () => {};
export const createHotContext = () => ({ accept: noop, acceptExports: noop, dispose: noop,
  prune: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} });
export const updateStyle = (id, c) => { let e = document.querySelector('style[data-vite-dev-id="'+id+'"]');
  if (!e) { e = document.createElement('style'); e.setAttribute('data-vite-dev-id', id); document.head.appendChild(e); }
  e.textContent = c; };
export const removeStyle = (id) => { document.querySelector('style[data-vite-dev-id="'+id+'"]')?.remove(); };
export const injectQuery = (u) => u;
export const ErrorOverlay = class {};`;
async function ctxFor(viewport) {
  const c = await browser.newContext({ viewport });
  await c.route('**/@vite/client', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript', body: HMR_STUB,
  }));
  return c;
}
const PHONE_VP = { width: 390, height: 844 };
const shot = (page, name) => page.screenshot({ path: path.join(SHOTDIR, `${name}.png`) });
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
const beatOf = (tv) => tv.evaluate(() => (document.body.innerText.match(/EPISODE\s+\d+\s*[·.]\s*([A-Z]+)/) || [])[1]);

/** ALARM PROBE: install before the page's own scripts so nothing is missed. */
const ALARM_PROBE = `
  window.__alarm = { vibrate: 0, audio: 0, titles: [], notif: 0 };
  navigator.vibrate = (...a) => { window.__alarm.vibrate++; return true; };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) { const s = AC.prototype.createOscillator; AC.prototype.createOscillator = function(...a){ window.__alarm.audio++; return s.apply(this,a); }; }
  const AE = window.Audio; window.Audio = function(...a){ window.__alarm.audio++; return new AE(...a); };
  new MutationObserver(() => window.__alarm.titles.push(document.title))
    .observe(document.querySelector('title') || document.head, { childList: true, subtree: true, characterData: true });
`;

let exitCode = 1;
try {
  await mkdir(SHOTDIR, { recursive: true });
  const tv = await (await ctxFor({ width: 1600, height: 900 })).newPage();
  const errs = [];
  tv.on('pageerror', (e) => errs.push(`tv: ${e.message}`));
  await tv.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
  await tv.waitForSelector('.night-code', { timeout: 25000 });

  const NAMES = (arg('--names', '') || 'John,Ellie,Ozz,Mara,Bex,Sam,Ivy,Zed').split(',');
  const phones = [];
  for (let i = 0; i < PHONES; i++) {
    const ctx = await ctxFor(PHONE_VP);
    if (SCENE === 'alarm') await ctx.addInitScript(ALARM_PROBE);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${NAMES[i]}: ${e.message}`));
    await p.goto(`${base}/?view=party.phone&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#code', { timeout: 25000 });
    await p.fill('#code', CODE.toUpperCase());
    await p.fill('#name', NAMES[i]);
    await p.click('#join');
    await p.waitForSelector('#lock-look', { timeout: 25000 });
    await p.click('#lock-look');
    phones.push({ page: p, name: NAMES[i] });
  }
  say(`  ${PHONES} phones in: ${phones.map((p) => p.name).join(', ')}`);
  await sleep(1200);
  await tv.evaluate(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const b = document.querySelector('#go');
      if (b && !b.disabled) { b.click(); return true; }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  });
  say('  night started');
  await sleep(2500);

  const P = (n) => phones[n].page;
  /* The phone re-renders its whole sheet on every server tick, so a handle can go stale between
   * being found and being clicked. A guest's thumb hits the same window. Retry, and COUNT it. */
  const misses = { reach: 0, accept: 0 };
  const clicky = async (page, sel, tally) => {
    for (let i = 0; i < 8; i++) {
      try {
        const b = await page.$(sel);
        if (!b) { await sleep(180); continue; }
        await b.click({ timeout: 1500 });
        return true;
      } catch { misses[tally]++; await sleep(180); }
    }
    return false;
  };
  const reach = (n, target) => clicky(P(n), `[data-link]:has-text("${target}")`, 'reach');
  const accept = (n) => clicky(P(n), '[data-accept]', 'accept');
  const pairName = (n) => P(n).evaluate(() => document.querySelector('.pair-name')?.textContent?.trim() || null);
  const whispers = (n) => P(n).evaluate(() => [...document.querySelectorAll('.whisper')].map((p) => p.textContent.trim()));
  const send = async (n, msg) => { await P(n).fill('#whisper', msg); await P(n).click('#whisper-send'); await sleep(700); };

  /* ⚠️ DO NOT `]` PAST CASTING. Skipping Casting reaches a Debrief with an EMPTY BALLROOM —
   * no robots, no chairs, no name tags — because the seated circle is placed during Casting.
   * `jellie-play.mjs` skips it, so every screenshot it takes of "the room seeing the pair form"
   * is a photograph of an empty room, and the feature looks 100% missing when it is not.
   * Play Casting for real: put the card down, pick a runner, LOCK, pick a guide, LOCK. */
  const playCasting = async () => {
    for (const ph of phones) { await ph.page.click('#card-done', { timeout: 5000 }).catch(() => {}); await sleep(200); }
    await sleep(1200);
    for (let ballot = 0; ballot < 2; ballot++) {
      for (let i = 0; i < phones.length; i++) {
        const pick = phones[(i + 1 + ballot) % phones.length].name;
        const b = await P(i).$(`button:has-text("${pick}")`);
        if (b) await b.click({ timeout: 2500 }).catch(() => {});
        await sleep(220);
        const lock = await P(i).$('button:has-text("LOCK")');
        if (lock) await lock.click({ timeout: 2500 }).catch(() => {});
        await sleep(220);
      }
      await sleep(900);
    }
    await sleep(2500);
  };

  const toDebrief = async (tag) => {
    await playCasting();
    let stuckSince = Date.now(); let last = null;
    for (let i = 0; i < 90; i++) {
      const b = await beatOf(tv);
      if (b !== last) { last = b; stuckSince = Date.now(); if (tag) await shot(tv, `${tag}-${i}-${b || 'unknown'}`); }
      if (b === 'DEBRIEF') break;
      // nobody is driving the runner, so the Expedition never ends on its own
      if (Date.now() - stuckSince > 25000) {
        await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
        stuckSince = Date.now();
      }
      await sleep(1500);
    }
    await sleep(3000);
    const seated = await tv.evaluate(() => document.querySelector('iframe') ? 'follow-iframe' : 'none');
    say(`  reached ${await beatOf(tv)} (stage: ${seated})`);
  };

  // =========================================================================================
  if (SCENE === 'control') {
    await toDebrief('beat');
    say(`  now: ${await beatOf(tv)}`);
    // is anything alive in the 3D world at all?
    /* Are the robots MISSING from the scene, or merely off-camera? Two very different bugs:
     * "nothing spawned" vs "the Debrief camera is pointed at a wall". Ask the scene graph. */
    const world = await tv.evaluate(() => {
      const h = window.__rrrHost || window.__rrr || {};
      const scene = h.scene || h.show?.scene || h.stage?.scene;
      const out = { hostKeys: Object.keys(h).slice(0, 30), hasScene: !!scene, canvases: document.querySelectorAll('canvas').length };
      if (scene) {
        const names = []; let meshes = 0; let sprites = 0;
        scene.traverse?.((o) => {
          meshes += o.isMesh ? 1 : 0; sprites += (o.isSprite ? 1 : 0);
          if (o.name && /robot|seat|chair|tag|name|unit|player|circle/i.test(o.name)) names.push(o.name);
        });
        out.meshes = meshes; out.sprites = sprites; out.interesting = [...new Set(names)].slice(0, 40);
        // Where is the camera looking, and is anything with a name tag inside the frustum?
        const cam = h.camera || h.show?.camera;
        if (cam) out.cam = { pos: cam.position?.toArray?.().map((n) => +n.toFixed(1)) };
      }
      return out;
    });
    say(`  SCENE: ${JSON.stringify(world)}`);
    for (const s of [0, 10, 20, 30]) {
      if (s) await sleep(10000);
      await shot(tv, `sit-${String(s).padStart(2, '0')}s`);
      say(`  sat ${s}s in Debrief`);
    }
    // and with a pair formed, wait for the merge animation
    await reach(0, 'ELLIE'); await sleep(900); await accept(1);
    for (const s of [1, 3, 6, 12]) { await sleep(s === 1 ? 1000 : 2000); await shot(tv, `merge-${String(s).padStart(2, '0')}s`); }
    say(`  merged=${await pairName(0)}`);
    const tail = await text(tv);
    say(`  TV text: ${tail.slice(-260)}`);
  }

  // =========================================================================================
  if (SCENE === 'bleed') {
    await toDebrief();
    await shot(P(0), 'a-debrief');
    // leave Debrief WITHOUT pairing, then try to pair from Reckoning
    await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
    await sleep(2600);
    say(`  beat is now ${await beatOf(tv)}`);
    await shot(P(0), 'b-reckoning-before');
    const links = await P(0).$$('[data-link]');
    say(`  reach-out buttons still on screen in Reckoning: ${links.length}`);
    const ok = await reach(0, 'ELLIE');
    await sleep(1200);
    await shot(P(0), 'c-john-after-tap');
    await shot(P(1), 'd-ellie-after-tap');
    say(`  tapped Ellie in Reckoning: clicked=${ok}`);
    say(`  John now: ${(await text(P(0))).slice(0, 220)}`);
    say(`  Ellie now: ${(await text(P(1))).slice(0, 220)}`);
    const acc = await accept(1);
    await sleep(1500);
    say(`  Ellie could accept in Reckoning: ${acc} -> pair=${await pairName(0)}`);
    await shot(P(0), 'e-john-paired-in-reckoning');
    await shot(tv, 'f-tv-reckoning');
    if (acc) { await send(0, 'we can still talk in the nomination beat'); say(`  whispers: ${JSON.stringify(await whispers(1))}`); }
    await shot(P(1), 'g-ellie-paired-in-reckoning');
    // does READY still do something here?
    const ready = await P(0).$('#ready, [data-ready]');
    say(`  READY button present in Reckoning: ${!!ready}`);
    if (ready) { await ready.click(); await sleep(1200); await shot(P(0), 'h-ready-in-reckoning'); say(`  after READY: ${(await text(P(0))).slice(0, 200)}`); }
  }

  // =========================================================================================
  if (SCENE === 'edges') {
    await toDebrief();
    // -- 1. connect spam
    const t0 = Date.now();
    for (let i = 0; i < 6; i++) { await reach(0, 'ELLIE').catch(() => {}); await sleep(120); }
    say(`  spam-tapped ELLIE 6x in ${Date.now() - t0}ms -> John: ${(await text(P(0))).slice(0, 180)}`);
    await shot(P(0), 'a-spam-john');
    await shot(P(1), 'b-spam-ellie');
    const invites = await P(1).$$('[data-accept]');
    say(`  Ellie sees ${invites.length} CONNECT button(s)`);
    // -- 2. decline
    const no = await P(1).$('[data-decline], [data-accept] ~ button');
    await P(1).click('text=NO').catch(() => say('  could not find NO'));
    await sleep(1400);
    await shot(P(0), 'c-john-declined');
    await shot(P(1), 'd-ellie-declined');
    say(`  after NO — John: ${(await text(P(0))).slice(0, 200)}`);
    say(`  after NO — Ellie: ${(await text(P(1))).slice(0, 200)}`);
    // can John immediately re-ask the person who just said no?
    const again = await reach(0, 'ELLIE');
    await sleep(1000);
    say(`  John can re-ask straight away: ${again} -> ${(await text(P(0))).slice(0, 140)}`);
    await shot(P(1), 'e-ellie-asked-again');
    await accept(1); await sleep(1500);
    say(`  paired=${await pairName(0)}`);
    // -- 3. empty message
    await P(0).fill('#whisper', '');
    await P(0).click('#whisper-send'); await sleep(800);
    say(`  empty send -> log ${JSON.stringify(await whispers(0))}`);
    await shot(P(0), 'f-empty-send');
    // -- 4. very long message
    const LONG = 'i think ozz is the corrupted one because during the expedition he went into the cellar alone and came back with nothing and then he said he was upstairs the whole time which is not what mara said and also '.repeat(2);
    await send(0, LONG);
    say(`  long(${LONG.length}) -> Ellie sees ${JSON.stringify((await whispers(1)).map((w) => w.length))}`);
    await shot(P(0), 'g-long-john');
    await shot(P(1), 'h-long-ellie');
    // -- 5. flood, does the box scroll or overflow?
    for (let i = 0; i < 10; i++) await send(i % 2, `line ${i}`);
    await shot(P(0), 'i-flood-john');
    const box = await P(0).evaluate(() => {
      const w = document.querySelector('.whisper')?.parentElement;
      const inp = document.querySelector('#whisper');
      return { scrollH: w?.scrollHeight, clientH: w?.clientHeight,
        inputTop: inp?.getBoundingClientRect().top, vh: innerHeight,
        inputVisible: inp ? inp.getBoundingClientRect().bottom < innerHeight : null,
        pageScroll: document.documentElement.scrollHeight > innerHeight };
    });
    say(`  after 13 messages: ${JSON.stringify(box)}`);
    // -- 6. disconnect mid-conversation, what does the partner see?
    await P(0).click('text=DISCONNECT'); await sleep(1600);
    await shot(P(0), 'j-john-disconnected');
    await shot(P(1), 'k-ellie-abandoned');
    await shot(tv, 'l-tv-after-disconnect');
    say(`  after DISCONNECT — John: ${(await text(P(0))).slice(0, 200)}`);
    say(`  after DISCONNECT — Ellie: ${(await text(P(1))).slice(0, 200)}`);
    say(`  TV: ${(await text(tv)).slice(-200)}`);
    // -- 7. can they re-pair after a disconnect?
    const re = await reach(0, 'ELLIE'); await sleep(800); await accept(1); await sleep(1400);
    say(`  re-pair after disconnect: reach=${re} pair=${await pairName(0)} old-log=${JSON.stringify(await whispers(0))}`);
    await shot(P(0), 'm-repaired');
  }

  // =========================================================================================
  if (SCENE === 'mutual') {
    await toDebrief();
    // both tap each other in the same instant
    await Promise.all([reach(0, 'ELLIE'), reach(1, 'JOHN')]);
    await sleep(1800);
    await shot(P(0), 'a-john');
    await shot(P(1), 'b-ellie');
    say(`  John: ${(await text(P(0))).slice(0, 240)}`);
    say(`  Ellie: ${(await text(P(1))).slice(0, 240)}`);
    say(`  pairs: john=${await pairName(0)} ellie=${await pairName(1)}`);
    // and: reach out to someone already in a pair
    if (!(await pairName(0))) { await accept(1).catch(() => {}); await sleep(1200); }
    say(`  after resolving: john=${await pairName(0)} ellie=${await pairName(1)}`);
    if (phones[2]) {
      const busy = await P(2).evaluate(() => [...document.querySelectorAll('[data-link]')]
        .map((b) => ({ t: b.innerText.trim(), disabled: b.disabled })));
      say(`  Ozz's list: ${JSON.stringify(busy)}`);
      await shot(P(2), 'c-ozz-list');
      const clicked = await reach(2, 'JOHN');
      await sleep(1200);
      say(`  Ozz tapped a BUSY John: clicked=${clicked} -> ${(await text(P(2))).slice(0, 200)}`);
      await shot(P(2), 'd-ozz-tapped-busy');
      await shot(P(0), 'e-john-during');
    }
  }

  // =========================================================================================
  if (SCENE === 'crowd') {
    await toDebrief();
    await shot(P(0), 'a-phone-8-list');
    const list = await P(0).evaluate(() => [...document.querySelectorAll('[data-link]')].map((b) => b.innerText.trim()));
    const geo = await P(0).evaluate(() => {
      const r = document.querySelector('#ready')?.getBoundingClientRect();
      return { readyTop: r?.top, vh: innerHeight, pageH: document.documentElement.scrollHeight,
        scrolls: document.documentElement.scrollHeight > innerHeight + 2 };
    });
    say(`  with 8 phones the list is ${list.length} long: ${list.join(', ')}`);
    say(`  layout: ${JSON.stringify(geo)}`);
    // three pairs at once
    await Promise.all([reach(0, 'ELLIE'), reach(2, 'MARA'), reach(4, 'SAM')]);
    await sleep(1400);
    await shot(tv, 'b-tv-three-invites');
    await Promise.all([accept(1), accept(3), accept(5)]);
    await sleep(2500);
    await shot(tv, 'c-tv-three-pairs');
    await shot(P(6), 'd-outsider-of-eight');
    await sleep(4000);
    await shot(tv, 'e-tv-three-pairs-late');
    say(`  pairs: ${await pairName(0)} / ${await pairName(2)} / ${await pairName(4)}`);
    say(`  TV bottom: ${(await text(tv)).slice(-320)}`);
    say(`  outsider Ivy: ${(await text(P(6))).slice(0, 300)}`);
    // what does the last unpaired person even have to do?
    const ivy = await P(6).evaluate(() => [...document.querySelectorAll('[data-link]')]
      .map((b) => ({ t: b.innerText.trim(), disabled: b.disabled })));
    say(`  Ivy's options: ${JSON.stringify(ivy)}`);
  }

  // =========================================================================================
  if (SCENE === 'alarm') {
    await toDebrief();
    const before = await P(1).evaluate(() => JSON.parse(JSON.stringify(window.__alarm)));
    const t0 = Date.now();
    await reach(0, 'ELLIE');
    await sleep(2500);
    const after = await P(1).evaluate(() => JSON.parse(JSON.stringify(window.__alarm)));
    say(`  Ellie's phone on invite — vibrate ${before.vibrate}->${after.vibrate}, audio ${before.audio}->${after.audio}, title changes ${after.titles.length}`);
    // any CSS animation running on the invite card?
    const anim = await P(1).evaluate(() => {
      const els = [...document.querySelectorAll('*')];
      const moving = els.filter((e) => {
        const s = getComputedStyle(e);
        return (s.animationName && s.animationName !== 'none') || (s.transitionDuration && parseFloat(s.transitionDuration) > 0);
      }).map((e) => ({ tag: e.tagName + '.' + (e.className || ''), anim: getComputedStyle(e).animationName, dur: getComputedStyle(e).animationDuration }));
      return moving.slice(0, 12);
    });
    say(`  animated elements on Ellie's invite screen: ${JSON.stringify(anim)}`);
    await accept(1);
    await sleep(500);
    const animPair = await P(0).evaluate(() => [...document.querySelectorAll('*')]
      .filter((e) => { const s = getComputedStyle(e); return s.animationName && s.animationName !== 'none'; })
      .map((e) => ({ tag: e.tagName + '.' + (e.className || ''), anim: getComputedStyle(e).animationName, dur: getComputedStyle(e).animationDuration })));
    say(`  animated on John's merge moment: ${JSON.stringify(animPair)}`);
    // shoot the merge frame-by-frame at 200ms
    for (let i = 0; i < 8; i++) { await shot(P(0), `merge-f${i}`); await sleep(200); }
    const tvAnim = await tv.evaluate(() => [...document.querySelectorAll('*')]
      .filter((e) => { const s = getComputedStyle(e); return s.animationName && s.animationName !== 'none'; })
      .map((e) => e.className + ':' + getComputedStyle(e).animationName));
    say(`  animated on the TV at merge: ${JSON.stringify(tvAnim)}`);
  }

  // =========================================================================================
  if (SCENE === 'deep') {
    await toDebrief();
    /* How fast does the phone throw its own buttons away? A tap that lands in the gap is a tap
     * the guest thinks they made and the game never saw. */
    const churn = await P(0).evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const mo = new MutationObserver((recs) => { for (const r of recs) n += r.removedNodes.length; });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { mo.disconnect(); res({ removedNodes: n, overMs: Math.round(performance.now() - t0) }); }, 6000);
    }));
    say(`  DOM churn on an idle Debrief phone: ${JSON.stringify(churn)}`);

    // walk every beat and ask: is the secret line still on offer?
    const beats = [];
    for (let i = 0; i < 6; i++) {
      const b = await beatOf(tv);
      const live = await P(0).evaluate(() => ({
        links: document.querySelectorAll('[data-link]').length,
        ready: !!document.querySelector('#ready'),
        readyLine: (document.body.innerText.match(/\d+ of \d+ ready[^\n]*/) || [])[0] || null,
        pair: document.querySelector('.pair-name')?.textContent?.trim() || null,
      }));
      beats.push({ beat: b, ...live });
      say(`  ${b}: reach-out=${live.links} READY=${live.ready} "${live.readyLine}" pair=${live.pair}`);
      await shot(P(0), `beat-${i}-${b}`);
      if (b === 'VOTE' || b === 'EXECUTION') {
        const ok = await reach(0, 'ELLIE');
        if (ok) { await sleep(700); const a = await accept(1); await sleep(1200);
          const pn = await pairName(0);
          say(`  >>> PAIRED DURING ${b}: reach=${ok} accept=${a} name=${pn}`);
          if (pn) { await send(0, `voting ellie? say yes`); say(`  >>> and TEXTED during ${b}: ${JSON.stringify(await whispers(1))}`); }
          await shot(P(0), `secret-in-${b}`); await shot(tv, `tv-secret-in-${b}`);
        }
      }
      await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
      await sleep(2600);
    }
    say(`  SUMMARY ${JSON.stringify(beats)}`);
  }

  // =========================================================================================
  /* JELLIE is a great portmanteau. Is that the feature, or was it luck with the designer's own
   * name? Real party names, four pairs, read what the room is asked to find funny. */
  if (SCENE === 'names') {
    await toDebrief();
    const pairsWanted = [[0, 1], [2, 3], [4, 5], [6, 7]];
    for (const [a, b] of pairsWanted) {
      await reach(a, phones[b].name.toUpperCase());
      await sleep(600);
      await accept(b);
      await sleep(900);
    }
    await sleep(2000);
    for (const [a, b] of pairsWanted) {
      say(`  ${phones[a].name} + ${phones[b].name} = ${await pairName(a)}`);
    }
    await shot(tv, 'names-tv');
    await shot(P(0), 'names-phone');
    say(`  TV kicker: ${((await text(tv)).match(/[A-Z· ]+— CONNECTED[^.]*\./) || ['none'])[0]}`);
  }

  // =========================================================================================
  /* "Invision during this they have an animation of them becoming connected and sharing data
   * while their names are merged together." So: photograph the TV every ~350ms across the
   * accept, and photograph the phone too. If every frame is identical except the tag text,
   * there is no animation and no moment. */
  if (SCENE === 'drama') {
    await toDebrief();
    await shot(tv, 'x00-before');
    await reach(0, 'ELLIE');
    await sleep(1500);
    await shot(tv, 'x01-request-standing');
    const t0 = Date.now();
    await accept(1);
    for (let i = 0; i < 14; i++) {
      await shot(tv, `m${String(i).padStart(2, '0')}-${String(Date.now() - t0).padStart(5, '0')}ms`);
      await sleep(280);
    }
    await sleep(6000);
    await shot(tv, 'z-settled');
    await shot(P(0), 'z-phone-settled');
    await shot(P(2), 'z-outsider');
    say(`  pair=${await pairName(0)}`);
    // and the break-up: is there any drama when it ends?
    await P(0).click('text=DISCONNECT').catch(() => {});
    for (let i = 0; i < 6; i++) { await shot(tv, `d${i}-break`); await sleep(400); }
    await shot(P(1), 'z-dumped');
    say(`  after break — TV: ${(await text(tv)).slice(-200)}`);
    say(`  after break — dumped Ellie: ${(await text(P(1))).slice(0, 220)}`);
  }

  // =========================================================================================
  /* READY shipped in the same slice. Does a majority actually end the beat — and what happens
   * to a pair mid-sentence when it does? */
  if (SCENE === 'ready') {
    await toDebrief();
    await reach(0, 'ELLIE'); await sleep(700); await accept(1); await sleep(1200);
    await send(0, 'stay with me, do not tap ready');
    say(`  paired=${await pairName(0)}`);
    const before = await beatOf(tv);
    await P(2).click('#ready'); await sleep(1500);
    await shot(P(2), 'a-one-ready'); await shot(tv, 'b-tv-one-ready');
    say(`  after 1 of ${PHONES} ready — beat=${await beatOf(tv)}`);
    say(`  Ozz's phone: ${(await text(P(2))).slice(0, 240)}`);
    say(`  TV: ${(await text(tv)).slice(-160)}`);
    // can he take it back?
    const undo = await P(2).evaluate(() => document.querySelector('#ready')?.innerText.trim());
    say(`  the READY button now reads: "${undo}"`);
    await P(2).click('#ready').catch(() => {}); await sleep(1200);
    say(`  after tapping it again: ${(await text(P(2))).match(/\d+ of \d+ ready[^\n]*/)?.[0]}`);
    for (let i = 0; i < PHONES; i++) {
      const on = await P(i).evaluate(() => /✓/.test(document.querySelector('#ready')?.innerText || ''));
      if (!on) await P(i).click('#ready').catch(() => {});
      await sleep(700);
      const line = await P(0).evaluate(() => (document.body.innerText.match(/\d+ of \d+ ready[^\n]*/) || [])[0]);
      say(`  ${phones[i].name} tapped READY -> "${line}" beat=${await beatOf(tv)}`);
      if ((await beatOf(tv)) !== before) break;
    }
    await sleep(2500);
    say(`  after a majority — beat=${await beatOf(tv)} (was ${before})`);
    await shot(tv, 'c-tv-majority'); await shot(P(0), 'd-john-cut-off');
    say(`  John mid-sentence: pair=${await pairName(0)} whispers=${JSON.stringify(await whispers(0))}`);
  }

  say(`  stale-element retries: ${JSON.stringify(misses)}`);
  if (errs.length) say(`  ⚠️ page errors: ${[...new Set(errs)].slice(0, 6).join(' | ')}`);
  await writeFile(path.join(SHOTDIR, 'transcript.txt'), log.join('\n'));
  say(`\n  -> progress/${path.basename(SHOTDIR)}/`);
  exitCode = 0;
} catch (e) {
  console.error(`\n  DIED: ${e?.stack || e}\n`);
  await writeFile(path.join(SHOTDIR, 'transcript.txt'), log.join('\n') + `\n\nDIED: ${e?.message}`).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  for (const k of kids) k.kill();
  roomServer?.close?.();
  process.exit(exitCode);
}
