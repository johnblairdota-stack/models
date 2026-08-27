#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178;
const OUT = path.join(ROOT, 'progress', 'overnight-post14');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function text(page) {
  return page.evaluate(() => document.body?.innerText || '');
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const host = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await host.goto(`http://127.0.0.1:${WEB}/?view=party.host`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);
  let hostText = await text(host);
  const urlMatch = hostText.match(/room=([a-z0-9]{4})/i);
  const code = urlMatch ? urlMatch[1].toLowerCase() : null;
  console.log('CODE', code);
  console.log('HOST0\n', hostText.slice(0, 600));
  if (!code) throw new Error('no room code');

  const p1 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p1.goto(`http://127.0.0.1:${WEB}/?view=party.phone&room=${code}`, { waitUntil: 'domcontentloaded' });
  await p2.goto(`http://127.0.0.1:${WEB}/?view=party.phone&room=${code}`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  async function join(page, name, tag) {
    // code prefilled from URL; fill name if present
    const inputs = page.locator('input:visible');
    const n = await inputs.count();
    console.log(tag, 'inputs', n, 'pre', (await text(page)).slice(0, 200).replace(/\n/g,' | '));
    if (n >= 2) await inputs.nth(1).fill(name);
    else if (n === 1) {
      // maybe only code; set name later
      const ph = (await inputs.nth(0).getAttribute('placeholder')) || '';
      if (/name/i.test(ph)) await inputs.nth(0).fill(name);
    }
    await page.locator('#join, button:has-text("Join")').first().click().catch(() => {});
    await sleep(1200);
    // face lock
    const lock = page.locator('#lock-look, button:has-text("Lock in")');
    if (await lock.count()) {
      // set name on face? some flows have name later
      await lock.first().click();
      await sleep(1000);
    }
    // set name if prompt
    const nameBtn = page.locator('button:has-text("SET NAME"), #set-name');
    const nameInput = page.locator('input[placeholder*="name" i], #name');
    if (await nameInput.count()) {
      await nameInput.first().fill(name);
      if (await nameBtn.count()) await nameBtn.first().click().catch(() => {});
    }
    // try typing name via any visible field labeled
    console.log(tag, 'post', (await text(page)).slice(0, 400).replace(/\n/g, ' | '));
  }

  await join(p1, 'Ada', 'p1');
  await join(p2, 'Ben', 'p2');
  await sleep(2000);
  hostText = await text(host);
  console.log('HOST_SEATED\n', hostText.slice(0, 900));

  // Hold role cards
  for (const [page, tag] of [[p1, 'p1'], [p2, 'p2']]) {
    const hold = page.locator('button:has-text("Hold to read")');
    if (await hold.count()) {
      await hold.first().dispatchEvent('pointerdown');
      await sleep(700);
      const t = await text(page);
      console.log(tag, 'ROLE_HELD\n', t.slice(0, 700));
      await hold.first().dispatchEvent('pointerup');
      await sleep(500);
    }
  }

  // Start the night on host
  const start = host.locator('button:has-text("START THE NIGHT"), button:has-text("Start the night")');
  if (await start.count()) {
    console.log('clicking START THE NIGHT');
    await start.first().click();
  } else {
    console.log('no start btn; buttons:', await host.locator('button').allInnerTexts());
  }
  await sleep(3000);
  console.log('HOST_AFTER_START\n', (await text(host)).slice(0, 900));
  console.log('P1_AFTER_START\n', (await text(p1)).slice(0, 900));
  console.log('P2_AFTER_START\n', (await text(p2)).slice(0, 900));

  // Casting: nominate each other
  async function cast(page, targetName, asRole) {
    const t0 = await text(page);
    console.log('cast screen', asRole, t0.slice(0, 500).replace(/\n/g,' | '));
    // click player name then role
    const cand = page.locator(`button:has-text("${targetName}")`);
    if (await cand.count()) await cand.first().click().catch(() => {});
    await sleep(300);
    const role = page.locator(`button:has-text("${asRole}")`);
    if (await role.count()) await role.first().click().catch(() => {});
    await sleep(300);
    // also try ballot widgets
    const all = await page.locator('button').allInnerTexts();
    console.log('btns', all.filter(Boolean).slice(0, 30));
  }
  await cast(p1, 'Ben', 'Runner');
  await cast(p2, 'Ada', 'Guide');
  // try more nomination UI patterns from cast-ui
  for (const page of [p1, p2]) {
    for (const label of ['Ada', 'Ben', 'Lock', 'Send', 'Confirm', 'Runner', 'Guide']) {
      const b = page.locator(`button:has-text("${label}")`);
      const c = await b.count();
      if (c) {
        // click last matching often is the action
        await b.nth(c - 1).click().catch(() => {});
        await sleep(200);
      }
    }
  }
  await sleep(2000);
  console.log('HOST_CAST\n', (await text(host)).slice(0, 1200));
  console.log('P1_CAST\n', (await text(p1)).slice(0, 900));
  console.log('P2_CAST\n', (await text(p2)).slice(0, 900));

  // Wait for expedition / mansion
  for (let i = 0; i < 20; i++) {
    await sleep(2000);
    const ht = await text(host);
    const p1t = await text(p1);
    const beat = await p1.evaluate(() => window.__rrrPhone?.beat || null);
    const phase = await p1.evaluate(() => window.__rrrPhone?.frame?.phase || null);
    console.log('tick', i, 'beat', beat, 'phase', phase, 'hostHasCanvas', await host.evaluate(() => !!document.querySelector('canvas')));
    if (/expedition|recap|casting/i.test(ht + beat) || beat === 'expedition') {
      console.log('HOST_LIVE\n', ht.slice(0, 1000));
      console.log('P1_LIVE\n', p1t.slice(0, 1000));
      console.log('P2_LIVE\n', (await text(p2)).slice(0, 1000));
      break;
    }
  }

  // Probe TV honesty
  const leak = await host.evaluate(() => {
    const t = document.body?.innerText || '';
    return {
      hasGuideMap: !!document.querySelector('svg.guide-map, .guide-map'),
      hunterPath: /hunter path|HUNTER HEARS|blindStrip/i.test(t),
      roleWords: /Hold to read|teammate|PRODUCTION Feed/i.test(t),
      wordFromHouse: /Word from the house/i.test(t),
      recapBtn: /\bRecap\b/i.test(t),
      text: t.slice(0, 2000),
    };
  });
  console.log('TV_PROBE', JSON.stringify(leak, null, 2));

  // Phone word-from-house / pad
  for (const [page, tag] of [[p1, 'p1'], [p2, 'p2']]) {
    const info = await page.evaluate(() => {
      const t = document.body?.innerText || '';
      return {
        beat: window.__rrrPhone?.beat,
        iAmRunner: window.__rrrPhone?.iAmRunner,
        iAmGuide: window.__rrrPhone?.iAmGuide,
        role: window.__rrrPhone?.frame?.you?.role,
        align: window.__rrrPhone?.frame?.you?.alignment,
        hasMap: !!document.querySelector('svg.guide-map'),
        wordHouse: /Word from the house/i.test(t),
        prodFeed: /Production feed/i.test(t),
        text: t.slice(0, 1500),
      };
    });
    console.log(tag, 'PHONE_PROBE', JSON.stringify(info, null, 2));
  }

  const summary = {
    code,
    host: await text(host),
    p1: await text(p1),
    p2: await text(p2),
    p1win: await p1.evaluate(() => window.__rrrPhone || null),
    p2win: await p2.evaluate(() => window.__rrrPhone || null),
    leak,
  };
  await writeFile(path.join(OUT, 'summary2.json'), JSON.stringify(summary, null, 2));
  console.log('DONE');
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
