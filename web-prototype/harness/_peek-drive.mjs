/**
 * 🎴 Hand-drive a real night in Chromium: deal, hold, release, re-blur, and a TV that never sees it.
 *
 *   npm run party:local          # one terminal — the room
 *   npm run dev                  # another    — the page
 *   node harness/_peek-drive.mjs <room>
 *
 * ⚠️ NOT A GATE, AND NOT ONE ON PURPOSE. `gates.yml` runs no `npm install`, so CI has no browser
 * to drive; `harness/role-peek.mjs` is the gate and it covers the wire and the copy in bare node.
 * This is the probe that covers what only a browser can answer, and it is the reason the serif
 * bug was caught: `font:800 34px/1.1 ui-sans-serif` reads fine and renders wrong.
 *
 * 🚨 REAL `page.mouse.down` / `up`, NEVER A DISPATCHED EVENT. A dispatched `pointerdown` proves
 * the handler accepts a synthetic event; it does not prove a finger can read the card, and it
 * cannot exercise `setPointerCapture` at all — which is the part of §2.3 most likely to break.
 * The drag-off-and-release beat below is that assertion.
 *
 * It drives the whole of #5's join flow, because that is the flow the deal has to fit inside: a
 * lowercase code typed into a CAPS field, the robot face, Lock in, then the sequential
 * runner-then-guide padlock. Four phones so one of them is Production (`castSeed` 1 deals
 * `p4 = plant`), and the Production Panel is exercised on the peek rather than assumed.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

// The room alphabet has no i/l/o/0/1 — a code containing one is not a typo the field fixes, it is
// a code the field REFUSES, so a probe that passes `rb01` locks itself out at the first screen.
const ROOM = process.argv[2] || 'peek';
if (!/^[abcdefghjkmnpqrstuvwxyz23456789]{4}$/.test(ROOM)) {
  console.error(`room "${ROOM}" is not in the code alphabet (no i/l/o/0/1, four chars)`);
  process.exit(2);
}
const BASE = 'http://localhost:5178';
const SHOTS = '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s).replace(/\s+/g, ' ').trim();

const ROLE_WORDS = /Camera Op|Focus Puller|Continuity|The Editor|Fan Favourite|Stunt Double|Glitched|The Static|The Method Actor|The Producer|The Fixer|The Plant|PRODUCTION|Contestant/;

const browser = await chromium.launch();

const tv = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
tv.on('pageerror', (e) => console.log('  TV pageerror:', e.message));
await tv.goto(`${BASE}/?view=party.host&room=${ROOM}`);
const tvText = async () => flat(await tv.textContent('body'));

// ---------------------------------------------------------------- #5's join, four phones
const phones = [];
for (const name of ['Ellie', 'Hai', 'Ada', 'Bea']) {
  const p = await (await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  })).newPage();
  p.on('pageerror', (e) => console.log(`  ${name} pageerror:`, e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log(`  ${name} console:`, m.text()); });
  // No room in the URL: type the code by hand, lowercase and spaced, the way a guest does.
  await p.goto(`${BASE}/?view=party.phone`);
  await p.waitForSelector('#code', { timeout: 8000 });
  await p.fill('#code', ` ${ROOM.toLowerCase()} `);
  const shown = await p.inputValue('#code');
  if (name === 'Ellie') {
    t('join · a lowercase spaced code shows as CAPS with the spaces gone', shown === ROOM.toUpperCase(), shown);
    await p.fill('#code', 'io01');
    t('join · the field refuses i/l/o/0/1 rather than accepting a code that cannot exist',
      (await p.inputValue('#code')) === '', JSON.stringify(await p.inputValue('#code')));
    await p.fill('#code', ROOM.toLowerCase());
  }
  await p.fill('#name', name);
  await p.click('#join');
  await p.waitForSelector('#lock-look', { timeout: 8000 });
  if (name === 'Ellie') {
    t('join · the face picker comes before the night', (await p.locator('.bot-face').count()) >= 1);
    await p.screenshot({ path: `${SHOTS}/00-face.png` });
  }
  phones.push({ name, page: p });
}

// Bea sits down last on purpose: her face is still unlocked when the host starts the night.
for (const { page } of phones.slice(0, 3)) { await page.click('#lock-look'); await sleep(120); }
await sleep(700);
const by = (n) => phones.find((p) => p.name === n).page;
const beat = async (page) => flat(await page.textContent('.phone-top'));
const filterOf = (page) => page.locator('.card-view .face').evaluate((el) => getComputedStyle(el).filter);
const blurred = (f) => /blur\(16px\)/.test(f);

await tv.screenshot({ path: `${SHOTS}/01-lobby-tv.png` });
{
  const lobby = flat(await tv.textContent('.night-main'));
  t('lobby · joined phones are named on the TV, never Robot N',
    ['Ellie', 'Hai', 'Ada'].every((n) => lobby.includes(n)));
  t('lobby · the TV lobby chairs carry a robot face', (await tv.locator('.seat .bot-face').count()) >= 3);
}
t('lobby · no phone has a card before the night starts',
  (await Promise.all(phones.map(({ page }) => page.locator('#card-tab').count()))).every((n) => n === 0));

// ---------------------------------------------------------------- the deal
await tv.click('#go');
await sleep(260);
{
  const dealing = await Promise.all(phones.slice(0, 3).map(({ page }) => page.locator('.deal-view:not(.hide) .b').count()));
  t('deal · every seated phone deals a back per joined seat', dealing.every((n) => n >= 3), dealing.join('/'));
  t('deal · a phone still on the face picker is NOT dealt over',
    (await by('Bea').locator('.deal-view:not(.hide)').count()) === 0
      && (await by('Bea').locator('#lock-look').count()) === 1);
}
await by('Ellie').screenshot({ path: `${SHOTS}/02-deal.png` });

await sleep(1900);
for (const { name, page } of phones.slice(0, 3)) {
  const face = flat(await page.textContent('.card-view .face'));
  t(`deal · ${name}'s card is up, full-bleed and BLURRED at rest`,
    (await page.locator('.card-view:not(.hide)').count()) === 1 && blurred(await filterOf(page)),
    face.slice(0, 58));
  t(`deal · ${name} is told GOOD or PRODUCTION in words`, /^You are (GOOD|PRODUCTION)/.test(face));
  t(`deal · ${name}'s premiere copy names the hold`,
    flat(await page.textContent('.card-view')).includes('it stays blurred until a finger is on it'));
}
await by('Ellie').screenshot({ path: `${SHOTS}/03-card-blurred.png` });

// The deal waited for Bea's face rather than being skipped.
{
  const page = by('Bea');
  await page.click('#lock-look');
  await sleep(260);
  t('deal · the phone that was still picking a face gets its deal on Lock in',
    (await page.locator('.deal-view:not(.hide) .b').count()) >= 3);
  await sleep(1900);
  const face = flat(await page.textContent('.card-view .face'));
  t('deal · and lands on the same blurred card', blurred(await filterOf(page)) && /^You are/.test(face), face.slice(0, 58));
}

// castSeed 1 deals p4 = plant. Bea is phone-3 → p4.
{
  const face = flat(await by('Bea').textContent('.card-view .face'));
  t('deal · Production reads PRODUCTION and is handed its table, on the card and nowhere else',
    face.includes('You are PRODUCTION') && /Robot|Ellie|Hai|Ada/.test(face), face.slice(0, 120));
  for (const n of ['Ellie', 'Hai', 'Ada']) {
    const f = flat(await by(n).textContent('.card-view .face'));
    t(`deal · ${n} is not shown anybody else's side`,
      f.includes('You are GOOD') && !/PRODUCTION/.test(f.replace('You are GOOD', '')));
  }
}

// ---------------------------------------------------------------- the hold
{
  const page = by('Ellie');
  const box = await page.locator('#card-hold').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(220);
  t('hold · a real finger down on the bar clears the card',
    (await page.locator('.card-view').evaluate((el) => el.classList.contains('lit')))
      && (await filterOf(page)) === 'none');
  await page.screenshot({ path: `${SHOTS}/04-held-clear.png` });

  await page.mouse.up();
  await sleep(150);
  t('release · 150 ms after release the card is still clear — the 400 ms is real',
    (await filterOf(page)) === 'none');
  await sleep(420);
  t('release · by 570 ms the card has re-blurred', blurred(await filterOf(page)));
  await page.screenshot({ path: `${SHOTS}/05-reblurred.png` });
}

// A finger that drifts off the element must still deliver its release — setPointerCapture.
{
  const page = by('Hai');
  const box = await page.locator('#card-hold').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(150);
  await page.mouse.move(6, 6);
  await sleep(140);
  t('hold · dragged off the bar, still down, still clear', (await filterOf(page)) === 'none');
  await page.mouse.up();
  await sleep(620);
  t('capture · released far from the bar and it STILL re-blurs — setPointerCapture',
    blurred(await filterOf(page)), await filterOf(page));
}

// The card is amber, not the pre-#5 cyan.
{
  const page = by('Ellie');
  const skin = await page.evaluate(() => {
    const r = getComputedStyle(document.documentElement);
    const tab = document.querySelector('.card-tab');
    const cap = getComputedStyle(document.querySelector('.card-view .align'));
    return {
      accent: r.getPropertyValue('--night-accent').trim(),
      tabBg: tab ? getComputedStyle(tab).backgroundColor : null,
      dim: cap.color,
    };
  });
  t('skin · the card reads the night palette rather than its own colours',
    skin.accent === '#f5a14a' && skin.dim === 'rgb(138, 125, 112)', JSON.stringify(skin));
}

// Opening is a tap; reading is a hold. Never a toggle.
for (const { name, page } of phones) {
  await page.click('#card-done');
  await sleep(200);
  t(`put down · ${name}'s card closes and the runner ballot is underneath`,
    (await page.locator('.card-view.hide').count()) === 1
      && (await page.locator('#card-tab').count()) === 1
      && flat(await page.textContent('h1')).includes('picking a runner'),
    flat(await page.textContent('h1')));
}
await by('Ellie').screenshot({ path: `${SHOTS}/06-casting-with-tab.png` });
{
  const page = by('Ellie');
  await page.click('#card-tab');
  await sleep(200);
  t('tab · reopening is a TAP and reveals nothing — still blurred', blurred(await filterOf(page)));
  await page.click('#card-done');
  await sleep(180);
}

t('tv · no role word on the TV during casting', !ROLE_WORDS.test(await tvText()));

// ---------------------------------------------------------------- #5's sequential cast
for (const { name, page } of phones) {
  await page.locator('.pick-list button').nth(1).click();          // highlight a runner
  if (name === 'Ellie') {
    t('cast · a highlight is not a ballot until the padlock',
      (await page.locator('#lock-pick').count()) === 1 && (await tv.textContent('body')).includes('No ballots yet'));
    await page.screenshot({ path: `${SHOTS}/06b-cast-padlock.png` });
  }
  await page.click('#lock-pick');
  await sleep(150);
  if (name === 'Ellie') {
    t('cast · the guide step comes second and the runner is locked out',
      flat(await page.textContent('h1')).includes('guide')
        && (await page.locator('.pick-list button.locked-out').count()) === 1);
    t('cast · YOUR CARD survives the step change', (await page.locator('#card-tab').count()) === 1);
  }
  await page.locator('.pick-list button:not(.locked-out)').nth(1).click();
  await page.click('#lock-pick');
  await sleep(150);
}
await sleep(400);
await tv.screenshot({ path: `${SHOTS}/07-ballots-tv.png` });
{
  const board = flat(await tv.textContent('.night-main'));
  t('cast · four ballots land on the TV, attributed to joined names',
    ['Ellie', 'Hai', 'Ada', 'Bea'].every((n) => board.includes(n)) && !board.includes('No ballots yet'));
}

await tv.click('#lock');
await sleep(2600);

t('run · the room is on the expedition beat', (await beat(by('Ellie'))).includes('expedition'),
  await beat(by('Ellie')));
await tv.screenshot({ path: `${SHOTS}/08-expedition-tv.png` });
for (const { name, page } of phones) {
  await page.screenshot({ path: `${SHOTS}/09-expedition-${name}.png` });
  t(`run · ${name} still has YOUR CARD mid-expedition`, (await page.locator('#card-tab').count()) === 1,
    await beat(page));
}

{
  const page = by('Bea');
  await page.click('#card-tab');
  await sleep(200);
  t('run · the card reopens mid-run, blurred', blurred(await filterOf(page)));
  const box = await page.locator('#card-hold').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(220);
  t('run · and it peeks under a finger, Production panel included',
    (await filterOf(page)) === 'none' && flat(await page.textContent('.card-view .face')).includes('PRODUCTION'));
  await page.screenshot({ path: `${SHOTS}/10-expedition-peek.png` });
  await page.mouse.up();
  await sleep(620);
  t('run · and re-blurs on release', blurred(await filterOf(page)));
  await page.click('#card-done');
  await sleep(150);
}

t('tv · no role word on the TV during the run', !ROLE_WORDS.test(await tvText()));

// ---------------------------------------------------------------- recap, and #5's durable beat
await sleep(2800);
t('recap · the room is on the recap beat', (await beat(by('Ellie'))).includes('recap'), await beat(by('Ellie')));
await tv.screenshot({ path: `${SHOTS}/11-recap-tv.png` });
for (const { name, page } of phones) {
  await page.screenshot({ path: `${SHOTS}/12-recap-${name}.png` });
  t(`recap · ${name} still has YOUR CARD`, (await page.locator('#card-tab').count()) === 1, await beat(page));
}
t('tv · no role word on the TV at the recap', !ROLE_WORDS.test(await tvText()));

// #5's durable beat: a refreshed TV resumes where the room is, not on lobby.
await tv.reload();
await tv.waitForSelector('.night-main', { timeout: 8000 });
await sleep(900);
t('tv · a refreshed TV resumes the room beat rather than the lobby',
  flat(await tv.textContent('.night-phase')).toLowerCase().includes('recap'),
  flat(await tv.textContent('.night-phase')));

// ---------------------------------------------------------------- a phone that drops mid-night
{
  const page = by('Ada');
  await page.reload();
  await page.waitForSelector('#card-tab', { timeout: 8000 });
  await sleep(400);
  t('reconnect · a reloaded phone has its card back and does NOT replay the deal',
    (await page.locator('#card-tab').count()) === 1
      && (await page.locator('.deal-view:not(.hide)').count()) === 0
      && (await page.locator('.card-view:not(.hide)').count()) === 0,
    await beat(page));
  t('reconnect · and it kept its face rather than asking again',
    (await page.locator('#lock-look').count()) === 0);
  await page.click('#card-tab');
  await sleep(200);
  t('reconnect · still hold-to-reveal, still blurred', blurred(await filterOf(page)));
  await page.screenshot({ path: `${SHOTS}/13-reconnect.png` });
}

await browser.close();
console.log(`\npeek-drive: ${pass} passed, ${fail} failed · shots in ${SHOTS}`);
process.exit(fail ? 1 : 0);
