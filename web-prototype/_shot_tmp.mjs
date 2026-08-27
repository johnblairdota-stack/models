import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = 'docs/design/refs-loop-redesign/artboards';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
for (const f of process.argv.slice(2)) {
  await p.goto(pathToFileURL(path.resolve(dir, f)).href);
  await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(dir, '_shot-' + f.replace('.dc.html','') + '.png') });
  console.log(f);
}
await b.close();
