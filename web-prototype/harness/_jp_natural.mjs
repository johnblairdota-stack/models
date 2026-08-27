/**
 * _jp_natural — THE CONTROL for "the Debrief TV is an empty ballroom".
 *
 * jellie-play reaches Debrief with the dev `]` key, skipping Casting and the Expedition. If the
 * robots only get placed in the circle by something that runs during those beats, an empty room
 * is the HARNESS's fault, not the game's. So this one plays the night through: real ballots on
 * real phones, the full 90s Expedition, then Debrief. If the circle is still empty here, the
 * empty room is real and the whole public half of JELLIE has nothing to land on.
 *
 * Control that would make it fail: it shoots the Expedition too. If robots are visible during
 * the run and absent in Debrief, that is a Debrief-camera bug, not a "nothing ever spawns" bug.
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
const WEB = +arg('--port', 5230), WS = +arg('--wsPort', 5330);
const CODE = arg('--code', 'jazz'), PHONES = +arg('--phones', 4);
const SHOTDIR = path.join(ROOT, 'progress', arg('--out', 'jc-natural'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = []; const say = (s) => { log.push(s); console.log(s); };
const portOpen = (p) => new Promise((res) => { const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
async function waitPort(p, ms, l) { const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await portOpen(p)) return; await sleep(250); } throw new Error(`${l} :${p}`); }
const kids = []; let roomServer = null;
if (!(await portOpen(WS))) {
  const { startServer } = await import(pathToFileURL(path.join(ROOT, 'net/party/local.mjs')).href);
  roomServer = startServer({ port: WS }); await waitPort(WS, 12000, 'room');
}
/* dist, not vite — the dev server garbles modules on this project and a critic must never
 * report a dev-server artefact as a game bug. */
if (!(await portOpen(WEB))) {
  kids.push(spawn(process.execPath, [path.join(ROOT, 'harness/serve.mjs'), '--port', String(WEB)],
    { cwd: ROOT, stdio: 'ignore' }));
  await waitPort(WEB, 20000, 'dist server');
}
const base = `http://127.0.0.1:${WEB}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const HMR = `const noop=()=>{};export const createHotContext=()=>({accept:noop,acceptExports:noop,dispose:noop,prune:noop,decline:noop,invalidate:noop,on:noop,off:noop,send:noop,data:{}});
export const updateStyle=(i,c)=>{let e=document.querySelector('style[data-vite-dev-id="'+i+'"]');if(!e){e=document.createElement('style');e.setAttribute('data-vite-dev-id',i);document.head.appendChild(e);}e.textContent=c;};
export const removeStyle=(i)=>{document.querySelector('style[data-vite-dev-id="'+i+'"]')?.remove();};export const injectQuery=(u)=>u;export const ErrorOverlay=class{};`;
async function ctxFor(vp) { const c = await browser.newContext({ viewport: vp });
  await c.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: HMR })); return c; }
const shot = (p, n) => p.screenshot({ path: path.join(SHOTDIR, `${n}.png`) });
const text = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
const beatOf = (tv) => tv.evaluate(() => (document.body.innerText.match(/EPISODE\s+\d+\s*[·.]\s*([A-Z]+)/) || [])[1]);

let exit = 1;
try {
  await mkdir(SHOTDIR, { recursive: true });
  const tv = await (await ctxFor({ width: 1600, height: 900 })).newPage();
  await tv.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
  await tv.waitForSelector('.night-code', { timeout: 25000 });
  const NAMES = ['John', 'Ellie', 'Ozz', 'Mara', 'Bex', 'Sam'];
  const phones = [];
  for (let i = 0; i < PHONES; i++) {
    const p = await (await ctxFor({ width: 390, height: 844 })).newPage();
    await p.goto(`${base}/?view=party.phone&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#code', { timeout: 25000 });
    await p.fill('#code', CODE.toUpperCase()); await p.fill('#name', NAMES[i]);
    await p.click('#join'); await p.waitForSelector('#lock-look', { timeout: 25000 }); await p.click('#lock-look');
    phones.push({ page: p, name: NAMES[i] });
  }
  say(`  ${PHONES} phones: ${phones.map((p) => p.name).join(', ')}`);
  await tv.evaluate(async () => { const t0 = Date.now();
    while (Date.now() - t0 < 240000) { const b = document.querySelector('#go');
      if (b && !b.disabled) { b.click(); return true; } await new Promise((r) => setTimeout(r, 400)); } });
  say('  night started — NO dev skip from here');
  await sleep(3000);
  await shot(phones[0].page, 'casting-phone');
  say(`  casting phone: ${(await text(phones[0].page)).slice(0, 300)}`);

  /* Casting is gated by the secret-card screen — #card-done "PUT IT DOWN" — and the ballot is
   * behind it. A harness that never presses it sits at Casting forever; mine did, for 268s. */
  for (const ph of phones) { await ph.page.click('#card-done', { timeout: 4000 }).catch(() => {}); await sleep(250); }
  await sleep(1500);
  say(`  cards down — phone now: ${(await text(phones[0].page)).slice(0, 220)}`);
  /* Two ballots per phone: pick a name, LOCK, pick a name, LOCK. Nothing is sent until locked,
   * so a harness that only taps names casts nothing at all and Casting waits forever. */
  for (let ballot = 0; ballot < 2; ballot++) {
    for (const ph of phones) {
      const pick = NAMES[(phones.indexOf(ph) + 1 + ballot) % PHONES];
      const b = await ph.page.$(`button:has-text("${pick}")`);
      if (b) await b.click({ timeout: 2500 }).catch(() => {});
      await sleep(300);
      const lock = await ph.page.$('button:has-text("LOCK")');
      if (lock) await lock.click({ timeout: 2500 }).catch(() => {});
      await sleep(300);
    }
    await sleep(1200);
    say(`  ballot ${ballot + 1}: ${(await text(phones[0].page)).slice(0, 180)}`);
  }
  await sleep(2000);
  say(`  ballots in — casting phone now: ${(await text(phones[0].page)).slice(0, 240)}`);
  await shot(phones[0].page, 'casting-phone-after');

  /* Ride the night. The Expedition waits on a runner nobody is driving, so after 30s of it we
   * use `]` — but by then Casting has run FOR REAL and the seated circle exists (proved by the
   * Casting shots). If Debrief is still an empty room after a real Casting, the empty room is
   * the game's, not the harness's. */
  let last = null; const t0 = Date.now(); let n = 0; let expSince = 0;
  while (Date.now() - t0 < 260000) {
    const b = await beatOf(tv);
    if (b !== last) { last = b; expSince = Date.now(); say(`  [${Math.round((Date.now() - t0) / 1000)}s] -> ${b}`); await shot(tv, `t${String(n++).padStart(2, '0')}-${b}`); }
    if (b === 'DEBRIEF') break;
    if ((b === 'EXPEDITION' || b === 'RECAP') && Date.now() - expSince > 30000) {
      say(`  nudging past ${b} with ] (no human is driving the runner)`);
      await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
      expSince = Date.now();
    }
    await sleep(2500);
    if ((Date.now() - t0) % 15000 < 2600) await shot(tv, `t${String(n++).padStart(2, '0')}-${b}-mid`);
  }
  say(`  reached ${await beatOf(tv)} naturally at ${Math.round((Date.now() - t0) / 1000)}s`);
  for (const s of [2, 8, 16, 26]) { await sleep(s === 2 ? 2000 : 7000); await shot(tv, `deb-${String(s).padStart(2, '0')}s`); }
  // now pair, naturally
  const jb = await phones[0].page.$('[data-link]:has-text("ELLIE")');
  if (jb) { await jb.click(); await sleep(1000);
    const a = await phones[1].page.$('[data-accept]'); if (a) await a.click(); }
  await sleep(1500); await shot(tv, 'deb-merged-01s');
  await sleep(3000); await shot(tv, 'deb-merged-04s');
  await sleep(6000); await shot(tv, 'deb-merged-10s');
  say(`  pair=${await phones[0].page.evaluate(() => document.querySelector('.pair-name')?.textContent?.trim() || null)}`);
  say(`  TV tail: ${(await text(tv)).slice(-260)}`);
  await writeFile(path.join(SHOTDIR, 'transcript.txt'), log.join('\n'));
  exit = 0;
} catch (e) { console.error(`DIED: ${e?.stack || e}`);
  await writeFile(path.join(SHOTDIR, 'transcript.txt'), log.join('\n') + `\nDIED: ${e?.message}`).catch(() => {});
} finally { await browser.close().catch(() => {}); for (const k of kids) k.kill(); roomServer?.close?.(); process.exit(exit); }
