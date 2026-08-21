// Critic scratch: colour of the DIRT. Inside a rect, split pixels by luma quantile and report
// the mean RGB/hue/sat of the darkest band vs the lightest band, plus the contrast ratio.
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
  const hs = (r,gg,bb)=>{const mx=Math.max(r,gg,bb),mn=Math.min(r,gg,bb);let h=0;
    if(mx-mn>0.5){if(mx===r)h=60*(((gg-bb)/(mx-mn))%6);else if(mx===gg)h=60*(((bb-r)/(mx-mn))+2);else h=60*(((r-gg)/(mx-mn))+4);}
    if(h<0)h+=360;return [Math.round(h), Math.round((mx>0?(mx-mn)/mx:0)*1000)/10];};
  const res=[];
  for (const { l, r } of rects) {
    const x0=Math.round(r[0]*W),y0=Math.round(r[1]*H),x1=Math.round((r[0]+r[2])*W),y1=Math.round((r[1]+r[3])*H);
    const px=[];
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*W+x)*4;
      px.push([d[i],d[i+1],d[i+2],0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]]);}
    px.sort((a,z)=>a[3]-z[3]);
    const band=(lo,hi)=>{const s=px.slice(Math.floor(lo*px.length),Math.max(1,Math.floor(hi*px.length)));
      let R=0,G=0,B=0,L=0;for(const q of s){R+=q[0];G+=q[1];B+=q[2];L+=q[3];}const n=s.length;
      const mr=R/n,mg=G/n,mb=B/n;const [h,sa]=hs(mr,mg,mb);
      return {rgb:[Math.round(mr),Math.round(mg),Math.round(mb)],hue:h,sat:sa,luma:Math.round(L/n*10)/10};};
    const dk=band(0,0.15), lt=band(0.85,1), mid=band(0.4,0.6);
    res.push({l,dk,lt,mid,ratio:Math.round((lt.luma/Math.max(1,dk.luma))*100)/100});
  }
  return res;
}, { url, rects });
await b.close();
console.log(file.split(/[\/]/).pop());
for(const r of out) console.log(
`  ${r.l.padEnd(14)} DARK15% rgb(${r.dk.rgb.join(',')}) hue ${String(r.dk.hue).padStart(3)} sat ${String(r.dk.sat).padStart(4)}% L ${String(r.dk.luma).padStart(5)}  |  MID rgb(${r.mid.rgb.join(',')}) hue ${String(r.mid.hue).padStart(3)} sat ${String(r.mid.sat).padStart(4)}% L ${String(r.mid.luma).padStart(5)}  |  LIGHT15% L ${r.lt.luma} sat ${r.lt.sat}%  |  contrast x${r.ratio}`);
