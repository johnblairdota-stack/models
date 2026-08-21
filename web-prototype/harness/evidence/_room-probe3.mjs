#!/usr/bin/env node
/** _room-probe3 — CRITIC PROBE. Colour-blind safety of the eight-seat palette. */
import { COLOURS } from '../../net/party/lobby.mjs';

const hex = (h) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const lin = (c) => { c/=255; return c<=0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4; };
const enc = (c) => { const v = c<=0.0031308 ? c*12.92 : 1.055*Math.pow(Math.max(c,0),1/2.4)-0.055; return Math.max(0,Math.min(255,Math.round(v*255))); };

// Viénot/Brettel/Mollon 1999 LMS dichromat simulation (the standard one).
const RGB2LMS = [[0.31399022,0.63951294,0.04649755],[0.15537241,0.75789446,0.08670142],[0.01775239,0.10944209,0.87256922]];
const LMS2RGB = [[5.47221206,-4.6419601,0.16963708],[-1.1252419,2.29317094,-0.1678952],[0.02980165,-0.19318073,1.16364789]];
const mul = (M,v) => M.map((r) => r[0]*v[0]+r[1]*v[1]+r[2]*v[2]);
const PROTAN = [[0,1.05118294,-0.05116099],[0,1,0],[0,0,1]];
const DEUTAN = [[1,0,0],[0.9513092,0,0.04866992],[0,0,1]];
const TRITAN = [[1,0,0],[0,1,0],[-0.86744736,1.86727089,0]];
function sim(h, M) {
  const rgb = hex(h).map(lin);
  const lms = mul(RGB2LMS, rgb);
  const out = mul(LMS2RGB, mul(M, lms));
  return '#' + out.map(enc).map((x) => x.toString(16).padStart(2,'0')).join('');
}
// CIELAB + CIEDE2000
function lab(h) {
  const [r,g,b] = hex(h).map(lin);
  let X = r*0.4124+g*0.3576+b*0.1805, Y = r*0.2126+g*0.7152+b*0.0722, Z = r*0.0193+g*0.1192+b*0.9505;
  X/=0.95047; Z/=1.08883;
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787*t + 16/116);
  const fx=f(X), fy=f(Y), fz=f(Z);
  return [116*fy-16, 500*(fx-fy), 200*(fy-fz)];
}
function de2000(h1,h2){
  const [L1,a1,b1]=lab(h1),[L2,a2,b2]=lab(h2);
  const C1=Math.hypot(a1,b1),C2=Math.hypot(a2,b2),Cb=(C1+C2)/2;
  const G=0.5*(1-Math.sqrt(Cb**7/(Cb**7+25**7)));
  const A1=(1+G)*a1,A2=(1+G)*a2;
  const Cp1=Math.hypot(A1,b1),Cp2=Math.hypot(A2,b2);
  const h1p=(Math.atan2(b1,A1)*180/Math.PI+360)%360, h2p=(Math.atan2(b2,A2)*180/Math.PI+360)%360;
  const dLp=L2-L1, dCp=Cp2-Cp1;
  let dhp = 0;
  if (Cp1*Cp2!==0){ dhp=h2p-h1p; if(dhp>180)dhp-=360; if(dhp<-180)dhp+=360; }
  const dHp=2*Math.sqrt(Cp1*Cp2)*Math.sin(dhp*Math.PI/360);
  const Lbp=(L1+L2)/2,Cbp=(Cp1+Cp2)/2;
  let hbp=h1p+h2p; if(Cp1*Cp2!==0){ if(Math.abs(h1p-h2p)>180) hbp+= (hbp<360?360:-360);} hbp/=2;
  const T=1-0.17*Math.cos((hbp-30)*Math.PI/180)+0.24*Math.cos(2*hbp*Math.PI/180)+0.32*Math.cos((3*hbp+6)*Math.PI/180)-0.20*Math.cos((4*hbp-63)*Math.PI/180);
  const dTh=30*Math.exp(-(((hbp-275)/25)**2));
  const Rc=2*Math.sqrt(Cbp**7/(Cbp**7+25**7));
  const Sl=1+(0.015*(Lbp-50)**2)/Math.sqrt(20+(Lbp-50)**2), Sc=1+0.045*Cbp, Sh=1+0.015*Cbp*T;
  const Rt=-Math.sin(2*dTh*Math.PI/180)*Rc;
  return Math.sqrt((dLp/Sl)**2+(dCp/Sc)**2+(dHp/Sh)**2+Rt*(dCp/Sc)*(dHp/Sh));
}
const lum = (h) => { const [r,g,b]=hex(h).map(lin); return 0.2126*r+0.7152*g+0.0722*b; };

const NAMES = ['1 red','2 blue','3 green','4 amber','5 purple','6 pink','7 teal','8 white'];
console.log('THE EIGHT-SEAT PALETTE\n');
for (const [k,M] of [['normal',null],['protanopia',PROTAN],['deuteranopia',DEUTAN],['tritanopia',TRITAN]]) {
  const sims = COLOURS.map((c) => M ? sim(c,M) : c);
  const pairs = [];
  for (let i=0;i<8;i++) for (let j=i+1;j<8;j++) pairs.push({ i,j, d: de2000(sims[i],sims[j]) });
  pairs.sort((a,b)=>a.d-b.d);
  const bad = pairs.filter((p)=>p.d < 11);
  console.log(`── ${k.toUpperCase()} — ${bad.length} of 28 pairs under ΔE2000 11 (the "same colour across a room" line)`);
  for (const p of pairs.slice(0,6)) {
    console.log(`   ΔE ${p.d.toFixed(1).padStart(5)}  ${NAMES[p.i].padEnd(9)} ${sims[p.i]}  vs  ${NAMES[p.j].padEnd(9)} ${sims[p.j]}${p.d<11?'   ← confusable':''}`);
  }
  console.log('');
}
console.log('RELATIVE LUMINANCE (the only channel a dichromat keeps)');
COLOURS.forEach((c,i)=>console.log(`   ${NAMES[i].padEnd(9)} ${c}  Y=${lum(c).toFixed(3)}  L*=${lab(c)[0].toFixed(0)}`));
const Ls = COLOURS.map((c)=>lab(c)[0]).sort((a,b)=>a-b);
console.log('   L* spread:', Ls.map((x)=>x.toFixed(0)).join(' '), '→ 8 seats across', (Ls[7]-Ls[0]).toFixed(0), 'L* units;',
  'closest neighbours differ by', Math.min(...Ls.slice(1).map((v,i)=>v-Ls[i])).toFixed(1), 'L*');
// contrast of the seat number printed inside the dot
console.log('\nCONTRAST OF A LABEL DRAWN ON EACH SWATCH (WCAG ratio)');
const ratio = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
COLOURS.forEach((c,i)=>console.log(`   ${NAMES[i].padEnd(9)} vs #0b0d12 ink: ${ratio(c,'#0b0d12').toFixed(2)}:1   vs #ffffff ink: ${ratio(c,'#ffffff').toFixed(2)}:1`));
