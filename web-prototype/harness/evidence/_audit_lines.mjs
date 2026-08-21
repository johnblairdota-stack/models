import fs from 'node:fs';
import path from 'node:path';
const ROOT = '/home/user/models/web-prototype';
const files = [];
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name);
  if (e.isDirectory()) { if(e.name!=='node_modules') walk(p); } else if (/\.(js|mjs)$/.test(e.name)) files.push(p); } })(ROOT+'/src');
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name);
  if (e.isDirectory()) { if(e.name!=='node_modules') walk(p); } else if (/\.(js|mjs)$/.test(e.name)) files.push(p); } })(ROOT+'/net');

// index basename -> full path (src/net only, unique)
const byBase = {};
for (const f of files) { const b = path.basename(f); (byBase[b] ||= []).push(f); }
const cache = {};
const read = (f) => cache[f] ||= fs.readFileSync(f,'utf8').split('\n');

const SCOPE = /\/(party|views\/expedition|views\/premiere|ui\/broadcast|game\/(run|rules|hunter-ai|player|spaces|noise)|game\/director-rig)/;
const out = [];
for (const f of files) {
  const rel = path.relative(ROOT,f);
  const lines = read(f);
  lines.forEach((ln,i)=>{
    // `name.js:123` or `name.js:123-456` or `name.js` L123 / L1100-1117
    for (const m of ln.matchAll(/([a-z0-9-]+\.js)[`'"]?\s*(?::|\s+L)\s*([0-9]+)(?:\s*[-–]\s*([0-9]+))?/gi)) {
      const base = m[1], a = +m[2], b = m[3] ? +m[3] : null;
      const cands = byBase[base];
      if (!cands || cands.length !== 1) continue;
      const tgt = cands[0]; const tl = read(tgt);
      if (a > tl.length) { out.push({rel,i:i+1,base,a,b,status:'OUT OF RANGE',len:tl.length,ctx:ln.trim().slice(0,120)}); continue; }
      out.push({rel,i:i+1,base,a,b,status:'',at:tl[a-1].trim().slice(0,110), at2: b? (tl[b-1]||'').trim().slice(0,80):null, ctx:ln.trim().slice(0,130)});
    }
  });
}
const scoped = out.filter(o=>SCOPE.test('/'+o.rel));
console.log(`total line-citations in src+net: ${out.length}; in party/expedition/engine scope: ${scoped.length}\n`);
for (const o of scoped) {
  console.log(`${o.rel}:${o.i}  ->  ${o.base}:${o.a}${o.b?'-'+o.b:''} ${o.status}`);
  console.log(`   cite: ${o.ctx}`);
  if (o.status) console.log(`   !!!! file has ${o.len} lines`);
  else { console.log(`   @${o.a}: ${o.at}`); if (o.at2) console.log(`   @${o.b}: ${o.at2}`); }
  console.log('');
}
