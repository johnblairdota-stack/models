// Critic scratch: mean/median RGB + HSV + luma percentiles inside fractional rects.
// usage: node _r19_rect.mjs <img> "label:fx,fy,fw,fh" ...
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
const file = process.argv[2];
const rects = process.argv.slice(3).map(s => { const [l, r] = s.split(':'); return { l, r: r.split(',').map(Number) }; });
const buf = await readFile(file);
const url = `data:image/png;base64,${buf.toString('base64')}`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 300, height: 200 } });
const out = await p.evaluate(async ({ url, rects }) => {
  const im = new Image(); im.src = url; await im.decode();
  const W = im.naturalWidth, H = im.naturalHeight;
  const c = new OffscreenCanvas(W, H); const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, W, H).data;
  const res = [];
  for (const { l, r } of rects) {
    const x0 = Math.round(r[0]*W), y0 = Math.round(r[1]*H), x1 = Math.round((r[0]+r[2])*W), y1 = Math.round((r[1]+r[3])*H);
    let R=0,G=0,B=0,n=0; const lums=[]; const px=[];
    for (let y=y0;y<y1;y++) for (let x=x0;x<x1;x++){ const i=(y*W+x)*4; R+=d[i];G+=d[i+1];B+=d[i+2];n++;
      lums.push(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]); px.push([d[i],d[i+1],d[i+2]]); }
    lums.sort((a,z)=>a-z);
    const q=f=>Math.round(lums[Math.min(lums.length-1,Math.floor(f*lums.length))]*10)/10;
    // median colour by luma
    const mid = px[Math.floor(px.length/2)];
    const mr=R/n, mg=G/n, mb=B/n;
    const mx=Math.max(mr,mg,mb), mn=Math.min(mr,mg,mb);
    let hue=0; if(mx-mn>0.5){ if(mx===mr) hue=60*(((mg-mb)/(mx-mn))%6); else if(mx===mg) hue=60*(((mb-mr)/(mx-mn))+2); else hue=60*(((mr-mg)/(mx-mn))+4); }
    if(hue<0)hue+=360;
    res.push({ l, box:[x0,y0,x1,y1], n, mean:[Math.round(mr),Math.round(mg),Math.round(mb)],
      sat: Math.round((mx>0?(mx-mn)/mx:0)*1000)/10, hue: Math.round(hue),
      luma:{p5:q(0.05),p25:q(0.25),p50:q(0.5),p75:q(0.75),p95:q(0.95),mean:Math.round(lums.reduce((a,z)=>a+z,0)/n*10)/10} });
  }
  return { W, H, res };
}, { url, rects });
await b.close();
console.log(`${file}  ${out.W}x${out.H}`);
for (const r of out.res) console.log(`  ${r.l.padEnd(16)} rgb(${r.mean.join(',')})  hue ${String(r.hue).padStart(3)}  sat ${r.sat}%  luma mean ${r.luma.mean} p5 ${r.luma.p5} p50 ${r.luma.p50} p95 ${r.luma.p95}  [${r.box.join(',')}]`);
