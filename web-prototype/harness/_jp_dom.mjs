/** _jp_dom — where does the ballroom picture on the TV actually come from? canvas? iframe? img? */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net'; import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WEB = 5243, WS = 5343, CODE = 'jazz';
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
for (const n of ['John', 'Ellie', 'Ozz']) {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.goto(`http://127.0.0.1:${WEB}/?view=party.phone&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#code'); await p.fill('#code', CODE.toUpperCase()); await p.fill('#name', n);
  await p.click('#join'); await p.waitForSelector('#lock-look'); await p.click('#lock-look'); phones.push(p);
}
await sleep(1000);
await tv.evaluate(async () => { const t0 = Date.now();
  while (Date.now() - t0 < 200000) { const b = document.querySelector('#go');
    if (b && !b.disabled) { b.click(); return; } await new Promise((r) => setTimeout(r, 400)); } });
await sleep(2500);
for (let i = 0; i < 8; i++) {
  const b = await tv.evaluate(() => (document.body.innerText.match(/EPISODE\s+\d+\s*[·.]\s*([A-Z]+)/) || [])[1]);
  if (b === 'DEBRIEF') break;
  await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
  await sleep(1200);
}
await sleep(4000);
console.log(JSON.stringify(await tv.evaluate(() => {
  const stage = document.querySelector('.stage, [class*=stage], main') || document.body;
  const walk = (el, d = 0) => [...el.children].flatMap((c) => {
    const r = c.getBoundingClientRect();
    const line = `${'  '.repeat(d)}<${c.tagName.toLowerCase()}${c.className ? '.' + String(c.className).split(' ').join('.') : ''}> ${Math.round(r.width)}x${Math.round(r.height)}${c.tagName === 'IMG' ? ' src=' + c.src.slice(0, 60) : ''}${c.tagName === 'IFRAME' ? ' SRC=' + c.src : ''}`;
    return d > 3 ? [line] : [line, ...walk(c, d + 1)];
  });
  return { frames: document.querySelectorAll('iframe').length, canvases: document.querySelectorAll('canvas').length,
    imgs: document.querySelectorAll('img').length, videos: document.querySelectorAll('video').length,
    tree: walk(document.body).slice(0, 45) };
}), null, 1));
// and inside any iframe
for (const f of tv.frames()) {
  if (f === tv.mainFrame()) continue;
  console.log('FRAME', f.url());
  console.log(JSON.stringify(await f.evaluate(() => {
    const c = document.querySelector('canvas');
    const h = window.__rrrHost || window.__rrr || {};
    const scene = h.scene || h.show?.scene;
    let meshes = 0; const names = [];
    scene?.traverse?.((o) => { meshes += o.isMesh ? 1 : 0; if (o.name) names.push(o.name); });
    return { canvas: !!c, w: c?.width, h: c?.height, hostKeys: Object.keys(h).slice(0, 25),
      meshes, names: [...new Set(names)].slice(0, 50) };
  })));
}
await browser.close(); kid.kill(); rs?.close?.(); process.exit(0);
