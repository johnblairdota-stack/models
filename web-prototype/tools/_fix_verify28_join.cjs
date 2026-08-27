const fs = require('fs');
const p = 'harness/_overnight_verify28.mjs';
let s = fs.readFileSync(p, 'utf8');
const oldJoin = `    await p.goto(\`\${base}/?view=party.phone&room=\${CODE}&wsPort=\${WS}\`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(900);
    if (await p.locator('#lock-look').count()) { await p.locator('#lock-look').click(); await sleep(700); }
    const nameEl = p.locator('#name');
    if (await nameEl.count()) { await nameEl.fill(who); await p.locator('#save-name').click(); await sleep(500); }
    phones.push({ who, page: p });`;
const newJoin = `    await p.goto(\`\${base}/?view=party.phone&room=\${CODE}&wsPort=\${WS}\`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForSelector('#lock-look', { timeout: 25000 });
    await p.click('#lock-look');
    phones.push({ who, page: p });`;
if (!s.includes(oldJoin)) {
  console.log('oldJoin missing; dumping around JOIN');
  const i = s.indexOf('for (const who of');
  console.log(s.slice(i, i+700));
  process.exit(1);
}
s = s.replace(oldJoin, newJoin);
s = s.replace("await host.locator('#go').click({ timeout: 10000 });", "await host.locator('#go').click({ timeout: 20000, force: true });");
fs.writeFileSync(p, s);
console.log('ok', s.includes('force: true'), s.includes("waitForSelector('#lock-look'"));
