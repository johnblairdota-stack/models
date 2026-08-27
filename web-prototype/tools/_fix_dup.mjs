import { readFileSync, writeFileSync } from 'fs';
const p='harness/_overnight_post20.mjs';
let s=readFileSync(p,'utf8');
const before=s;
s=s.replace(/const phoneMid = log\.find\(\(x\) => x\.k === 'PHONE_MID'\)\?\.v;/, "const phoneMidV = log.find((x) => x.k === 'PHONE_MID')?.v;");
s=s.replace(/phoneMidNoTimeInvent: phoneMid && phoneMid\.hasTimeHeading === false/, 'phoneMidNoTimeInvent: phoneMidV && phoneMidV.hasTimeHeading === false');
if(s===before){console.error('no change'); const i=s.indexOf('phoneMid = log'); console.log(JSON.stringify(s.slice(i,i+80))); process.exit(1);} 
writeFileSync(p,s); console.log('fixed');