#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178;
const OUT = path.join(ROOT, 'progress', 'overnight-post14');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page) => page.evaluate(() => document.body?.innerText || '');

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const host = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await host.goto(`http://127.0.0.1:${WEB}/?view=party.host`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1500);
  const hostText = await text(host);
  const code = hostText.match(/room=([a-z0-9]{4})/i)[1].toLowerCase();
  console.log('CODE', code);

  const p1 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p1.goto(`http://127.0.0.1:${WEB}/?view=party.phone&room=${code}`);
  await p2.goto(`http://127.0.0.1:${WEB}/?view=party.phone&room=${code}`);
  await sleep(800);

  for (const [page, name] of [[p1, 'Ada'], [p2, 'Ben']]) {
    await page.locator('#lock-look, button:has-text("Lock in")').first().click().catch(() => {});
    await sleep(800);
    // set name if visible
    const ni = page.locator('input:visible');
    if (await ni.count()) {
      // SET NAME flow sometimes uses prompt - try buttons
    }
    const setName = page.locator('button:has-text("SET NAME")');
    if (await setName.count()) {
      await page.evaluate((n) => {
        const next = window.prompt;
        // try click and fill any input that appears
      }, name);
    }
  }
  await sleep(1000);
  console.log('HOST', (await text(host)).slice(0, 500).replace(/\n/g,' | '));

  await host.locator('button:has-text("START THE NIGHT")').first().click();
  await sleep(2500);

  // Dismiss premiere on both phones
  for (const [page, tag] of [[p1, 'p1'], [p2, 'p2']]) {
    // Measure blur honesty: is role text readable while "blurred"?
    const blurInfo = await page.evaluate(() => {
      const card = document.querySelector('.role-card, #role-card, [data-role-card], .card');
      const all = [...document.querySelectorAll('*')].slice(0, 200);
      const blurred = all.filter((el) => {
        const s = getComputedStyle(el);
        return (s.filter || '').includes('blur') || (s.webkitFilter || '').includes('blur');
      }).map((el) => ({
        tag: el.tagName,
        cls: el.className?.toString?.().slice(0, 80),
        filter: getComputedStyle(el).filter,
        text: (el.innerText || '').slice(0, 120),
      }));
      return {
        bodyHasRole: /YOU ARE (GOOD|PRODUCTION)/i.test(document.body.innerText),
        blurred,
        bodySlice: document.body.innerText.slice(0, 800),
      };
    });
    console.log(tag, 'BLUR', JSON.stringify(blurInfo, null, 2));

    const put = page.locator('button:has-text("PUT IT DOWN"), button:has-text("Put it down")');
    if (await put.count()) {
      await put.first().click();
      await sleep(800);
    }
    console.log(tag, 'AFTER_PUT', (await text(page)).slice(0, 600).replace(/\n/g, ' | '));
  }

  // Ballot
  for (const [page, tag, runner, guide] of [
    [p1, 'p1', 'Ada', 'Ben'],
    [p2, 'p2', 'Ada', 'Ben'],
  ]) {
    console.log(tag, 'BALLOT_BTNS', await page.locator('button').allInnerTexts());
    // cast-ui patterns: pick runner then guide
    for (const label of [runner, 'Runner', guide, 'Guide', 'Lock', 'Send', 'Confirm', 'Cast', 'Vote']) {
      const b = page.locator(`button:has-text("${label}")`);
      const c = await b.count();
      for (let i = 0; i < c; i++) {
        await b.nth(i).click().catch(() => {});
        await sleep(150);
      }
    }
    // try data attributes / roles
    await page.evaluate(() => {
      const pick = (sel) => document.querySelector(sel)?.click();
      pick('[data-role="runner"]');
      pick('[data-cast="runner"]');
    }).catch(() => {});
    console.log(tag, 'AFTER_VOTE', (await text(page)).slice(0, 700).replace(/\n/g, ' | '));
  }

  await sleep(2000);
  console.log('HOST_BALLOT', (await text(host)).slice(0, 1000));

  // Wait for pair lock / expedition up to ~60s
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const beat = await p1.evaluate(() => window.__rrrPhone?.beat);
    const pair = await p1.evaluate(() => window.__rrrPhone?.frame?.pair);
    const ht = await text(host);
    console.log('tick', i, 'beat', beat, 'pair', pair);
    if (beat === 'expedition' || beat === 'recap' || /expedition|RECAP|Watch/i.test(ht)) {
      console.log('HOST_RUN\n', ht.slice(0, 1200));
      console.log('P1_RUN\n', (await text(p1)).slice(0, 1200));
      console.log('P2_RUN\n', (await text(p2)).slice(0, 1200));
      break;
    }
  }

  // TV probe during run
  const leak = await host.evaluate(() => {
    const t = document.body?.innerText || '';
    return {
      hasGuideMap: !!document.querySelector('svg.guide-map'),
      hunterPath: /hunter path|HUNTER HEARS|blindStrip/i.test(t),
      roles: /YOU ARE (GOOD|PRODUCTION)|teammate/i.test(t),
      wordHouse: /Word from the house/i.test(t),
      text: t.slice(0, 1500),
      canvas: !!document.querySelector('canvas'),
    };
  });
  console.log('TV', JSON.stringify(leak, null, 2));

  for (const [page, tag] of [[p1, 'p1'], [p2, 'p2']]) {
    const info = await page.evaluate(() => ({
      beat: window.__rrrPhone?.beat,
      runner: window.__rrrPhone?.iAmRunner,
      guide: window.__rrrPhone?.iAmGuide,
      role: window.__rrrPhone?.frame?.you?.role,
      align: window.__rrrPhone?.frame?.you?.alignment,
      hasMap: !!document.querySelector('svg.guide-map'),
      wordHouse: /Word from the house/i.test(document.body.innerText),
      prodFeed: /Production feed/i.test(document.body.innerText),
      text: document.body.innerText.slice(0, 1500),
    }));
    console.log(tag, JSON.stringify(info, null, 2));
  }

  await writeFile(path.join(OUT, 'summary3.json'), JSON.stringify({
    code,
    host: await text(host),
    p1: await text(p1),
    p2: await text(p2),
    p1win: await p1.evaluate(() => window.__rrrPhone || null),
    p2win: await p2.evaluate(() => window.__rrrPhone || null),
    leak,
  }, null, 2));
  console.log('DONE');
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
