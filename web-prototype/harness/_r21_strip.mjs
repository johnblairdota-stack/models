import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
const [,,f,rect] = process.argv;
const [X,Y,Wd,Ht] = rect.split(',').map(Number);
const b = await readFile(f);
const br = await chromium.launch(); const pg = await br.newPage();
const r = await pg.evaluate(async ({u,X,Y,Wd,Ht}) => {
  const im=new Image(); im.src=u; await im.decode();
  const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(im,0,0);
  const d=g.getImageData(0,0,c.width,c.height).data; const W=c.width;
  const L=(x,y)=>{const i=((y|0)*W+(x|0))*4; return 0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];};
  const out=[];
  for(let k=0;k<10;k++){
    const ys=Y+Math.floor(k/10*Ht), ye=Y+Math.floor((k+1)/10*Ht); const v=[];
    for(let y=ys;y<ye;y++) for(let x=X;x<X+Wd;x++) v.push(L(x,y));
    v.sort((a,b)=>a-b);
    out.push({k, mean:+(v.reduce((s,q)=>s+q,0)/v.length).toFixed(1), p10:+v[(v.length*0.1)|0].toFixed(0), p50:+v[v.length>>1].toFixed(0), p90:+v[(v.length*0.9)|0].toFixed(0)});
  }
  return out;
},{u:`data:image/png;base64,${b.toString('base64')}`,X,Y,Wd,Ht});
console.log(f.split(/[\/]/).pop(), rect);
for(const o of r) console.log(`  band${o.k} mean=${o.mean} p10=${o.p10} p50=${o.p50} p90=${o.p90} contrast=${o.p90-o.p10}`);
await br.close();
