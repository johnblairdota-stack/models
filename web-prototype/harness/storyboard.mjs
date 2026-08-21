#!/usr/bin/env node
/**
 * 🎞️ **storyboard — the whole table, every beat, as pictures a human can read.**
 *
 *   node harness/storyboard.mjs                 → progress/storyboard/*.png + index.html
 *   node harness/storyboard.mjs --headed        → watch it play
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS NOT A MOCKUP
 * ---------------------------------------------------------------------------------------------
 * Every pane is the shipped page. `show-tv.html` and `show-phone.html` run in iframes against a
 * real `show.mjs`, each holding its own socket, each frame projected through the real entitlement
 * matrix. The driver does not inject state — it **fills the name field and clicks the button**,
 * the same two things a guest does. So a phone that shows the wrong thing here shows the wrong
 * thing at the party, and a button that does nothing here does nothing there.
 *
 * That is the difference between this and a design deck: a deck is a promise, and this is the
 * software. It costs about ninety seconds to regenerate, so it can be re-run after any change and
 * the whole evening re-read at a glance.
 *
 * 🚨 THE RIG IS SERVED BY THIS HARNESS AND NEVER BY THE PARTY SERVER. It shows eight role cards
 * at once. See `harness/rig.html`'s own header.
 *
 * ⚠️ WHAT IT CANNOT SHOW. Anything inside the mansion renders through WebGL and costs minutes a
 * frame on a machine with no GPU; the expedition's 3D half is captured separately by
 * `harness/_exp_probe.mjs`. And the pre-show — eight robots walking to chairs in the ballroom,
 * name cards, the rules explainer — is not in this list because **it does not exist yet**. An
 * empty frame here would be an honest gap; a drawn one would be a lie.
 */

import http from 'node:http';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startShow, playerIdOf } from '../net/party/show.mjs';
import { PHASE } from '../src/party/phases.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'progress', 'storyboard');
mkdirSync(OUT, { recursive: true });

const SHOW_PORT = 5186, RIG_PORT = 5187;
const NAMES = ['Vic', 'Sam', 'Jo', 'Kit', 'Roo', 'Ali', 'Mo', 'Ben'];
const HEADED = process.argv.includes('--headed');

const show = startShow({ port: SHOW_PORT, code: 'demo', stamp: 1700000000000 });
const rigServer = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(join(HERE, 'rig.html'), 'utf8'));
});
await new Promise((r) => rigServer.listen(RIG_PORT, '127.0.0.1', r));

/**
 * ⚠️ THE SAME FALLBACK `shot-solver` H12 USES, FOR THE SAME REASON. Playwright's own default path
 * points at a browser this container does not have, so an unset `RRR_CHROME` failed with an
 * install instruction rather than running — on a machine where a Chromium is sitting right there.
 * `undefined` still means "let Playwright decide" when neither is present.
 */
const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({
  headless: !HEADED,
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  args: ['--disable-dev-shm-usage', '--mute-audio', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 1480, height: 1420 } });
await page.goto(`http://127.0.0.1:${RIG_PORT}/?show=http://127.0.0.1:${SHOW_PORT}&names=${NAMES.join(',')}&scale=0.42`,
  { waitUntil: 'load' });
await page.waitForTimeout(1200);

const tv = page.frameLocator('#tv');
const ph = (i) => page.frameLocator(`#p${i}`);
const sleep = (ms) => page.waitForTimeout(ms);

/**
 * 🚨 THE SIMULATOR SOCKET, SO THE STORYBOARD CAN SCRIPT AN OUTCOME. The stub decides an
 * expedition from a room comparison; a sheet that has to show BOTH a survived run and a taken
 * runner cannot wait for the seed to oblige. This is the same `role=sim` connection the mansion
 * uses, sending the same message — so the taken frame below is the real code path, not a poke.
 */
const sim = new WebSocket(`ws://127.0.0.1:${SHOW_PORT}/?role=sim`);
await new Promise((r) => { sim.onopen = r; });
const report = (outcome) => sim.send(JSON.stringify({ t: 'expedition', outcome }));

const shots = [];
async function beat(id, title, note) {
  await page.evaluate(([t, n]) => window.__rig.beat(t, n), [title, note]);
  await page.evaluate((s) => window.__rig.tvstate(s), show.sessionNow()?.state.phase ?? 'LOBBY');
  await sleep(450);
  const file = `${String(shots.length + 1).padStart(2, '0')}-${id}.png`;
  await page.screenshot({ path: join(OUT, file) });
  shots.push({ file, title, note });
  console.log(`  ${file}  ${title}`);
}

/** Advance the shooting schedule from the television, the way the host does — the S key. */
const skip = async () => {
  await tv.locator('body').evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 's' })));
  await sleep(600);
};
const waitPhase = async (p, tries = 20) => {
  for (let i = 0; i < tries && show.sessionNow()?.state.phase !== p; i++) await skip();
  await sleep(500);
};
/** Label each phone with the chair it holds this episode. Never with an alignment — see rig.html. */
async function labelChairs() {
  const st = show.sessionNow()?.state;
  for (let i = 0; i < 8; i++) {
    const id = playerIdOf(i);
    const dead = st?.players.find((p) => p.id === id)?.alive === false;
    const tag = dead ? 'OUT' : st?.pair.runner === id ? 'RUNNER' : st?.pair.guide === id ? 'GUIDE' : '';
    await page.evaluate(([n, t]) => window.__rig.chair(n, t), [i, tag]);
  }
}

console.log('\nstoryboard →', OUT);

// ---------------------------------------------------------------- 1 · arriving
await beat('join', 'Everyone joins', 'The television shows one URL and a four-character room code. '
  + 'Each phone asks for a robot name and nothing else — no install, no account, same wifi.');

for (let i = 0; i < 8; i++) {
  await ph(i).locator('#name').fill(NAMES[i]);
  await ph(i).locator('#go').click();
  await sleep(180);
}
await sleep(900);
await beat('lobby', 'Eight seated', 'Every phone now holds a seat and a colour. The TV fills its '
  + 'eight slots. A phone that locks and comes back reclaims ITS OWN seat by token, never the next free one.');

// ---------------------------------------------------------------- 2 · the premiere
await tv.locator('body').evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })));
await sleep(1200);
await labelChairs();
await beat('premiere', 'The premiere', 'Cards are dealt. The TV says only "check your phone" — '
  + 'it is never told a role, so there is nothing on that screen to read over anyone\'s shoulder.');

for (let i = 0; i < 8; i++) { await ph(i).locator('#cardBtn').click(); await sleep(120); }
await sleep(500);
await beat('cards', 'Eight private cards, all blurred', 'The card is hold-to-reveal (phone UX §2.3). '
  + 'Open, it is a blur — so a neighbour\'s glance at an unattended phone gets nothing, and nobody has '
  + 'to remember to put it away.');

// 🚨 A REAL FINGER, NOT A DISPATCHED EVENT. `page.mouse.down()` after `hover()` goes through the
// iframe's transform and produces the same `pointerdown` a thumb does, so this beat proves the
// hold works rather than proving a synthetic event was accepted.
await ph(0).locator('#cardView').hover();
await page.mouse.down();
await sleep(400);
await beat('card-held', 'One finger, one card', 'Vic is holding theirs. Everyone else\'s is still a '
  + 'blur. Release and it re-blurs after 400 ms — Production see each other and their teammates\' '
  + 'real roles; everyone else sees a name and a job. The Glitched is shown a role they do not have '
  + 'and is never told otherwise.');
await page.mouse.up();
await sleep(500);

// ---------------------------------------------------------------- 3 · casting
await skip();
await waitPhase(PHASE.CASTING);
await beat('casting', 'Casting the pair', 'The wing is announced BEFORE anyone is picked, so the '
  + 'argument is about a specific job rather than a popularity contest. Two taps each: who runs, who guides.');

const alive0 = () => show.sessionNow().state.players.filter((p) => p.alive);
// One list, two taps: the first names the runner and the second the guide — round §2. Nothing is
// sent until CONFIRM PAIR, so the tally never sees half a ballot.
for (let i = 0; i < 8; i++) {
  const runner = NAMES[2], guide = NAMES[5];
  const btns = ph(i).locator('[data-pick]');
  await btns.filter({ hasText: runner }).first().click().catch(() => {});
  await sleep(60);
  await btns.filter({ hasText: guide }).first().click().catch(() => {});
  await sleep(60);
  await ph(i).locator('#sendCast').click().catch(() => {});
  await sleep(80);
}
await sleep(700);
await beat('casting-locked', 'Locked in', 'A phone nobody touched abstains — it does not quietly vote '
  + 'for a neighbour. Every tie resolves publicly and deterministically, so casting never stalls eight people in a lounge.');

// ---------------------------------------------------------------- 4 · the expedition
await waitPhase(PHASE.EXPEDITION);
await labelChairs();
await beat('expedition', 'Into the wing', 'The guide sees what the cameras see — and NO SIGNAL is not an '
  + 'error, it is a guide who genuinely does not know. The runner waits. Everyone else watches television and talks.');

const st = show.sessionNow().state;
const gSeat = Number(st.pair.guide.slice(1)) - 1;
const rSeat = Number(st.pair.runner.slice(1)) - 1;
await ph(gSeat).locator('#cl').click().catch(() => {});
await sleep(700);
await beat('call', 'The guide calls it', 'CLEAR or HOLD, publicly and attributed. Waiting is safe and '
  + 'costs the camera — which is what stops HOLD being strictly worse than GO, and what makes lying with it worth something.');

/**
 * 🚨 THE HOUSE REPORTS BEFORE THE RUNNER MOVES, NOT AFTER. `closedEarly()` ends EXPEDITION the
 * moment the guide has called it and the runner has acted, so a report sent after the GO tap
 * raced the phase close and lost — the beat below was captioned "Taken" over a television reading
 * *Camera live*, because `resolveExpedition` had already graded the episode from the stub. The
 * report is accepted at any point during EXPEDITION and is only APPLIED when the phase closes, so
 * sending it first changes nothing except which of the two answers wins the race.
 */
report('lit');
await ph(rSeat).locator('#gogo').click().catch(() => {});
await sleep(700);
await beat('go', 'The runner decides', 'GO or WAIT. In the wired build this is a throttle instead: four '
  + 'detents, with the ring under the stick showing how far the noise carries.');

await waitPhase(PHASE.RECAP);
await beat('recap', 'Camera live', 'The run survived, so a camera lights. That is the good team\'s '
  + 'objective AND the information system: more cameras means the guide can be caught lying.');

await waitPhase(PHASE.DEBRIEF);
await beat('debrief', 'Debrief', 'Phones go quiet on purpose. This is the game: out loud, in the room, '
  + 'about a call somebody made and an outcome everybody saw.');

// ---------------------------------------------------------------- 5 · the reckoning
await waitPhase(PHASE.RECKONING);
await beat('reckoning', 'Nominate, or don\'t', 'Once each, three standing at most, and every nomination '
  + 'buys the table fifteen more seconds to argue — capped at ninety.');

await ph(0).locator('[data-pick]').filter({ hasText: NAMES[5] }).first().click().catch(() => {});
await sleep(400);
await ph(3).locator('[data-pick]').filter({ hasText: NAMES[1] }).first().click().catch(() => {});
await sleep(700);
await beat('nominated', 'Two on the block', 'Who put whom up is on the record. It is the cheapest '
  + 'deduction fuel in the game, so none of it is hidden.');

await waitPhase(PHASE.VOTE);
await beat('vote', 'The vote', 'More than half the LIVING, not half of votes cast — so abstaining '
  + 'protects the accused, and at most one nominee can ever clear it. No tie rule exists because none can happen.');

for (let i = 0; i < 8; i++) {
  await ph(i).locator(`[data-vote]`).first().click().catch(() => {});
  await sleep(70);
}
await sleep(600);
await beat('voting', 'Voting, unseen', 'No running total reaches any screen while the vote is open. '
  + 'The last voter is not decisive, and a phone can change its mind until the clock runs out.');

await waitPhase(PHASE.EXECUTION);
await beat('execution', 'The sledgehammer', 'The nominator swings. Nobody is told what the executed '
  + 'player was — the death reveals nothing, which is the promise the whole design rests on.');

await waitPhase(PHASE.VERDICT);
await beat('verdict', 'Verdict', 'Cameras lit, incidents counted. The show is renewed or it is not.');

// ---------------------------------------------------------------- 6 · a chair is empty
await waitPhase(PHASE.CASTING);
await labelChairs();
await beat('casting-2', 'A chair is empty', 'The evicted player is struck through on the '
  + 'rail and their phone offers nothing — they keep their voice in the room and no move in the game.');

await waitPhase(PHASE.EXPEDITION);
await labelChairs();
await beat('chair', 'A chair you did not ask for', 'The guide\'s sheet carries REFUSE THE CHAIR — '
  + 'round §2, once a game, public and permanent. It is offered only while the chair is unused: '
  + 'call it or move and the offer is gone, because the chair has been spent.');

const stR = show.sessionNow().state;
await ph(Number(stR.pair.guide.slice(1)) - 1).locator('#refuse').click().catch(() => {});
await sleep(800);
await labelChairs();
await beat('refused', 'Refused, and the runner-up takes it', 'The replacement comes out of the SAME '
  + 'ballots rather than a second election — the runner-up the table already voted for. Nobody has '
  + 'to vote twice because one person said no.');

const st2 = show.sessionNow().state;
const g2 = Number(st2.pair.guide.slice(1)) - 1, r2 = Number(st2.pair.runner.slice(1)) - 1;
await ph(g2).locator('#cl').click().catch(() => {});
await sleep(300);
report('taken');
await ph(r2).locator('#gogo').click().catch(() => {});
await sleep(500);
await waitPhase(PHASE.RECAP);
await labelChairs();
await beat('taken', 'Taken', 'Contact is terminal — the limb economy of the survival mode is not '
  + 'consulted here. The terminal stays dark, so the run costs the good team a camera as well as a player. '
  + 'The rail marks the runner \u2716 TAKEN and the executed player \u2692 EVICTED: the two visible causes, '
  + 'told apart, and never a word about what either of them was.');

// ---------------------------------------------------------------- 7 · the reunion
for (let i = 0; i < 40 && show.sessionNow().state.phase !== PHASE.REUNION; i++) await skip();
await sleep(1200);
await labelChairs();
await beat('reunion', 'The Reunion', 'The same log, replayed with the filter off. Every role, every '
  + 'cover, and who actually made each noise all game — from one stream, so a leak and a missing '
  + 'reveal would be the same bug.');

// ---------------------------------------------------------------- the sheet
const html = `<!doctype html><meta charset="utf-8"><title>Prime Time — storyboard</title>
<style>
 body{background:#0b0d12;color:#f2f4f8;font:400 16px/1.5 ui-sans-serif,system-ui,sans-serif;margin:0;padding:40px}
 h1{font:700 20px/1 ui-sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#8b93a3;margin-bottom:8px}
 .sub{color:#8b93a3;margin-bottom:32px;max-width:80ch}
 figure{margin:0 0 44px}
 figcaption{margin-top:10px}
 figcaption b{font-size:19px;letter-spacing:.02em}
 figcaption span{display:block;color:#8b93a3;font-size:15px;margin-top:4px;max-width:100ch}
 img{width:100%;border:1px solid #232937;border-radius:10px;display:block}
 .n{color:#e0b23c;font:700 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em}
</style>
<h1>Run Robot Run · Prime Time</h1>
<div class="sub">Every pane is the shipped page against a real server — the driver fills the name field
and clicks the button, exactly as a guest does. Regenerate with <code>npm run storyboard</code>.</div>
${shots.map((s, i) => `<figure><img src="${s.file}" alt="${s.title}">
<figcaption><span class="n">${String(i + 1).padStart(2, '0')}</span><b>${s.title}</b><span>${s.note}</span></figcaption></figure>`).join('\n')}`;
writeFileSync(join(OUT, 'index.html'), html);

console.log(`\n${shots.length} frames → ${join(OUT, 'index.html')}`);
sim.close();
await browser.close();
await new Promise((r) => rigServer.close(r));
await show.close();
process.exit(0);
