/** _jp_cast — what does a phone at CASTING actually offer? Needed to play a night without the
 *  dev skip, which is the control for "the Debrief ballroom is empty". */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net'; import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WEB = 5244, WS = 5344, CODE = 'jazz';
const portOpen = (p) => new Promise((res) => { const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
const { startServer } = await import(pathToFileURL(path.join(ROOT, 'net/party/local.mjs')).href);
const rs = startServer({ port: WS });
const kid = spawn(process.execPath, [path.join(ROOT, 'harness/serve.mjs'), '--port', String(WEB)], { cwd: ROOT, stdio: 'ignore' });
while (!(await portOpen(WEB))) await sleep(300);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const tv = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
await tv.goto(`http://127.0.0.1:${WEB}/?view=party.host&room=${CODE}&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
await tv.waitForSelector('.night-code', { timeout: 25000 });
const phones = [];
for (const n of ['John', 'Ellie', 'Ozz', 'Mara']) {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.goto(`http://127.0.0.1:${WEB}/?view=party.phone&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#code'); await p.fill('#code', CODE.toUpperCase()); await p.fill('#name', n);
  await p.click('#join'); await p.waitForSelector('#lock-look'); await p.click('#lock-look'); phones.push(p);
}
await tv.evaluate(async () => { const t0 = Date.now();
  while (Date.now() - t0 < 200000) { const b = document.querySelector('#go');
    if (b && !b.disabled) { b.click(); return; } await new Promise((r) => setTimeout(r, 400)); } });
await sleep(3500);
const dump = async (p, tag) => console.log(tag, JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('button,[data-cast],[data-pick],[data-vote]')].map((b) =>
    ({ id: b.id, ds: JSON.stringify(b.dataset), t: b.innerText.trim().slice(0, 30), dis: b.disabled })))));
await dump(phones[0], 'CASTING:');
await browser.close(); kid.kill(); rs?.close?.(); process.exit(0);
