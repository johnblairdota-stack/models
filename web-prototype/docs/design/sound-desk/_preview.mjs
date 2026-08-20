import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const files = readdirSync('.').filter((f) => f.endsWith('.dc.html')).sort();
let helmet = '';
const panes = files.map((f) => {
  const s = readFileSync(f, 'utf8');
  if (!helmet) helmet = '<style>' + s.match(/<helmet>\s*<style>([\s\S]*?)<\/style>/)[1] + '</style>';
  const body = s.match(/<\/helmet>([\s\S]*?)<\/x-dc>/)[1];
  return `<figure style="margin:0"><figcaption>${f}</figcaption><div class="pane">${body}</div></figure>`;
}).join('\n');
writeFileSync('_preview.html', `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#05070a;font:13px ui-sans-serif,system-ui;color:#8b93a3;display:flex;flex-wrap:wrap;gap:28px;padding:28px;align-items:flex-start}
figcaption{padding:0 0 8px;letter-spacing:.14em;text-transform:uppercase}
.pane{outline:1px solid #262d3d}
button{font-family:inherit}
</style>${helmet}${panes}`);
console.log('wrote _preview.html,', files.length, 'panes');
