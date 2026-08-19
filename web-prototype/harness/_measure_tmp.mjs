import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync, readFileSync } from 'node:fs';
const [,, srcPath, xa, xb, ya, yb] = process.argv;
const b64 = readFileSync(path.resolve(srcPath)).toString('base64');
const htmlPath = path.resolve('harness/_meas.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0"><img id="im" src="data:image/png;base64,${b64}"></body></html>`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete);
const out = await page.evaluate(({xa,xb,ya,yb}) => {
  const im = document.getElementById('im');
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(im,0,0);
  const d = g.getImageData(0,0,c.width,c.height).data;
  const lum = (x,y) => { const i=(y*c.width+x)*4; return 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; };
  const rows = [];
  for (let y=ya; y<=yb; y+=3) {
    const bgs=[]; for(let x=xa;x<xa+8;x++) bgs.push(lum(x,y));
    bgs.sort((a,b)=>a-b); const bg = bgs[bgs.length>>1];
    let l=null,r=null;
    for (let x=xa;x<=xb;x++){ if (Math.abs(lum(x,y)-bg) > 7) { l=x; break; } }
    for (let x=xb;x>=xa;x--){ if (Math.abs(lum(x,y)-bg) > 7) { r=x; break; } }
    rows.push([y,l,r]);
  }
  return rows;
}, {xa:+xa,xb:+xb,ya:+ya,yb:+yb});
console.log(out.map(r=>`y=${r[0]} l=${r[1]} r=${r[2]} w=${r[2]-r[1]}`).join('\n'));
await browser.close();
