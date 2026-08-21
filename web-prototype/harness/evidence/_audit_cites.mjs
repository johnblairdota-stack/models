import fs from 'node:fs';
import path from 'node:path';
const ROOTS = {
  up:   '/home/user/models/docs/design',
  here: '/home/user/models/web-prototype/docs/design',
};
// heading index: doc -> Set of section numbers (normalised) + titles
const docs = {};
for (const [tag, dir] of Object.entries(ROOTS)) {
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    const secs = new Map();
    for (const line of txt.split('\n')) {
      const m = /^(#{1,6})\s+(.*)$/.exec(line);
      if (!m) continue;
      const t = m[2].trim();
      const n = /^([0-9]+(?:\.[0-9]+)*)[.)]?\s*[·—–-]?\s*(.*)$/.exec(t);
      if (n) secs.set(n[1], n[2] || t);
    }
    if (!docs[f]) docs[f] = [];
    docs[f].push({ tag, dir, secs, txt });
  }
}
// citations
const SRC = ['src', 'net', 'harness'];
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
    else if (/\.(js|mjs)$/.test(e.name)) files.push(p);
  }
}
for (const s of SRC) walk('/home/user/models/web-prototype/' + s);

const rows = [];
for (const f of files) {
  const rel = path.relative('/home/user/models/web-prototype', f);
  if (/^harness\/_/.test(rel)) continue;
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    // find doc mention on this line
    const dm = [...ln.matchAll(/([a-z0-9-]+\.md)/g)].map(m => m[1]);
    if (!dm.length) return;
    // sections on this line (and the next, for wrapped comments)
    const window = ln + ' ' + (lines[i+1] || '');
    const secs = [...window.matchAll(/§\s*([0-9]+(?:\.[0-9]+)*)/g)].map(m => m[1]);
    const bare = /§(?![0-9\s])(\w+)/.exec(window);
    for (const d of dm) rows.push({ rel, line: i+1, doc: d, secs, bare: bare && bare[1], text: ln.trim().slice(0,150) });
  });
}
const bad = [], ok = [], missingdoc = [];
for (const r of rows) {
  const entries = docs[r.doc];
  if (!entries) { missingdoc.push(r); continue; }
  for (const s of r.secs) {
    const found = entries.some(e => e.secs.has(s));
    (found ? ok : bad).push({ ...r, sec: s, where: entries.map(e=>e.tag).join('/') });
  }
  if (!r.secs.length && r.bare) bad.push({ ...r, sec: '§'+r.bare, where: entries.map(e=>e.tag).join('/'), nonnumeric: true });
}
console.log('=== DOC FILE NOT FOUND IN EITHER ROOT ===');
for (const r of missingdoc) console.log(`${r.rel}:${r.line}  ${r.doc}  | ${r.text}`);
console.log('\n=== SECTION CITATION DOES NOT RESOLVE ===');
for (const r of bad) console.log(`${r.rel}:${r.line}  ${r.doc} §${r.sec}  [doc in: ${r.where}]\n     ${r.text}`);
console.log(`\nresolved: ${ok.length}, unresolved: ${bad.length}, missing docs: ${missingdoc.length}`);
