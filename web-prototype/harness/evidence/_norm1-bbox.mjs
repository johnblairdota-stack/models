import { chromium } from 'playwright';
import fs from 'node:fs';
const src = process.argv[2];
const b = fs.readFileSync(src).toString('base64');
const br = await chromium.launch(); const pg = await br.newPage();
const r = await pg.evaluate(async (b64) => {
  const bin = atob(b64); const a = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([a],{type:'image/png'}));
  const c = new OffscreenCanvas(bmp.width,bmp.height); const g=c.getContext('2d',{willReadFrequently:true});
  g.drawImage(bmp,0,0); const d=g.getImageData(0,0,c.width,c.height).data;
  const isChroma=(r,gg,bb)=> r>150&&bb>150&&gg<110;
  let x0=1e9,y0=1e9,x1=-1,y1=-1;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;
    if(!isChroma(d[i],d[i+1],d[i+2])){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
  return {W:c.width,H:c.height,x0,y0,x1,y1};
}, b);
console.log(JSON.stringify(r));
await br.close();
