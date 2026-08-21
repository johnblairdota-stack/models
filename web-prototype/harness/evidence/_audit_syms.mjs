import fs from 'node:fs'; import path from 'node:path';
const ROOT='/home/user/models/web-prototype';
const files=[]; const walk=(d)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
 if(e.isDirectory()){if(e.name!=='node_modules')walk(p);}else if(/\.(js|mjs)$/.test(e.name))files.push(p);}};
walk(ROOT+'/src'); walk(ROOT+'/net');
// global symbol universe
const all = new Set();
for (const f of files) for (const m of fs.readFileSync(f,'utf8').matchAll(/\b([A-Z][A-Z0-9_]{3,}|[a-zA-Z_$][\w$]{2,})\b/g)) all.add(m[1]);
const SCOPE=/\/(party|views\/expedition|ui\/broadcast|game\/director-rig)/;
const rows=[];
for (const f of files) {
  if(!SCOPE.test(f)) continue;
  const rel=path.relative(ROOT,f);
  fs.readFileSync(f,'utf8').split('\n').forEach((ln,i)=>{
    if(!/^\s*(\*|\/\/)/.test(ln)) return;           // comments only
    for (const m of ln.matchAll(/`([A-Z][A-Z0-9_]{3,})`/g)) {  // SCREAMING_CASE constants in backticks
      const s=m[1];
      if(!all.has(s)) rows.push({rel,i:i+1,s,ctx:ln.trim().slice(0,120)});
    }
  });
}
const seen=new Set();
for(const r of rows){const k=r.rel+r.s; if(seen.has(k))continue; seen.add(k);
  console.log(`${r.rel}:${r.i}  \`${r.s}\`  — no such symbol anywhere in src/ or net/`);
  console.log(`    ${r.ctx}`);}
console.log(`\n${seen.size} distinct dangling constant references`);
