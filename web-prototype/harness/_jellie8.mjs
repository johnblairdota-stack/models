/**
 * _jellie8 — scratch playtest. EIGHT phones. Three simultaneous pairs, one REFUSAL, and the
 * two people left holding a screen full of BUSY. Not a gate. Shots -> progress/jellie8/.
 *
 *   node harness/_jellie8.mjs --port 5213 --wsPort 5313 --code frog
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
const WEB = +arg('--port', 5213);
const WS = +arg('--wsPort', 5313);
const CODE = arg('--code', 'frog');
const SHOTDIR = path.join(ROOT, 'progress', 'jellie8');

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
if (await portOpen(WEB)) say(`  reusing vite :${WEB}`);
else {
  const p = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(WEB), '--strictPort', '--host', '127.0.0.1'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(p);
  await waitPort(WEB, 30000, 'vite');
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

let exitCode = 1;
try {
  await mkdir(SHOTDIR, { recursive: true });
  const tv = await (await ctxFor({ width: 1600, height: 900 })).newPage();
  await tv.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
  await tv.waitForSelector('.night-code', { timeout: 20000 });

  const NAMES = ['John', 'Ellie', 'Ozz', 'Mara', 'Bex', 'Sam', 'Ivy', 'Zoe'];
  const phones = [];
  for (let i = 0; i < 8; i++) {
    const p = await (await ctxFor(PHONE_VP)).newPage();
    await p.goto(`${base}/?view=party.phone&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#code', { timeout: 45000 });
    await p.fill('#code', CODE.toUpperCase());
    await p.fill('#name', NAMES[i]);
    await p.click('#join');
    await p.waitForSelector('#lock-look', { timeout: 45000 });
    await p.click('#lock-look');
    phones.push({ page: p, name: NAMES[i] });
    say(`  ${NAMES[i]} in`);
    await sleep(400);
  }
  say('  8 joined');
  await sleep(1500);

  await tv.evaluate(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const b = document.querySelector('#go');
      if (b && !b.disabled) { b.click(); return true; }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  });
  await sleep(2500);
  for (let i = 0; i < 8; i++) {
    const beat = await tv.evaluate(() => (document.body.innerText.match(/EPISODE\s+\d+\s*[·.]\s*([A-Z]+)/) || [])[1]);
    if (beat === 'DEBRIEF') break;
    await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
    await sleep(900);
  }
  await sleep(3000);
  say(`  at ${await tv.evaluate(() => (document.body.innerText.match(/EPISODE\s+\d+\s*[·.]\s*([A-Z]+)/) || [])[1])}`);
  await shot(phones[0].page, '01-phone-eight-choices');

  const reach = async (i, name) => {
    const b = await phones[i].page.$(`[data-link]:has-text("${name}")`);
    if (!b) { say(`  !! ${phones[i].name} has no button for ${name}`); return false; }
    await b.click(); return true;
  };
  const accept = async (i) => {
    const b = await phones[i].page.$('[data-accept]');
    if (!b) { say(`  !! ${phones[i].name} was never offered Connect`); return false; }
    await b.click(); return true;
  };
  const decline = async (i) => {
    const b = await phones[i].page.$('[data-decline]');
    if (!b) { say(`  !! ${phones[i].name} has no No button`); return false; }
    await b.click(); return true;
  };

  // ---- THREE REQUESTS AT ONCE, plus a fourth that will be refused --------------------------
  await Promise.all([reach(0, 'Ellie'), reach(2, 'Mara'), reach(4, 'Sam'), reach(6, 'Zoe')]);
  await sleep(1400);
  await shot(tv, '02-tv-four-requests-pending');
  say(`  [TV, 4 requests standing] "${(await text(tv)).split('\n').pop()?.slice(-160) || ''}"`);
  const tvLine = await tv.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/[A-Z]+ reaches out to [A-Z]+…/gi) || [];
    return m;
  });
  say(`  request lines the TV shows: ${tvLine.length} of 4 -> ${JSON.stringify(tvLine)}`);

  // three accept, Zoe refuses Ivy
  await Promise.all([accept(1), accept(3), accept(5)]);
  await sleep(1500);
  await shot(tv, '03-tv-three-pairs');
  const kicker = await tv.evaluate(() => {
    const t = document.body.innerText;
    return (t.match(/.*connected.*/i) || [''])[0];
  });
  say(`  [TV kicker with 3 pairs + 1 request still standing] ${kicker}`);

  await shot(phones[7].page, '04-zoe-being-asked');
  await decline(7);
  await sleep(1500);
  await shot(tv, '05-tv-after-refusal');
  await shot(phones[6].page, '06-ivy-refused');
  await shot(phones[7].page, '07-zoe-after-refusing');
  say(`  [Ivy, just refused] ${(await text(phones[6].page)).slice(0, 240)}`);
  const tvAfter = await text(tv);
  say(`  [TV] any trace of the refusal? ${/refus|declin|no\b/i.test(tvAfter.slice(-200)) ? 'maybe' : 'NONE'}`);
  say(`  [TV tail] ${tvAfter.slice(-180)}`);

  // ---- the two left out --------------------------------------------------------------------
  say(`  [Ivy sheet] ${(await text(phones[6].page)).match(/Reach out[\s\S]{0,200}/)?.[0] || '(no reach-out sheet)'}`);

  // ---- serial pairing: John drops Ellie and immediately takes Ivy ---------------------------
  await phones[0].page.click('#unlink');
  await sleep(1200);
  await reach(0, 'Ivy');
  await sleep(1000);
  await accept(6);
  await sleep(1500);
  const johnPair = await phones[0].page.evaluate(() => document.querySelector('.pair-name')?.textContent?.trim() || null);
  say(`  John's SECOND pair this same Debrief: ${johnPair}`);
  await shot(tv, '08-tv-john-repaired');
  await shot(phones[1].page, '09-ellie-dropped');
  say(`  [Ellie, dropped mid-conversation] ${(await text(phones[1].page)).slice(0, 240)}`);

  await writeFile(path.join(SHOTDIR, 'transcript.txt'), log.join('\n'));
  say('\n  shots in progress/jellie8/');
  exitCode = 0;
} catch (e) {
  console.error(`\n  died: ${e?.stack || e}\n`);
  await writeFile(path.join(SHOTDIR, 'transcript.txt'), log.join('\n') + `\n\nDIED: ${e?.message}`).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  for (const k of kids) k.kill();
  roomServer?.close?.();
  process.exit(exitCode);
}
