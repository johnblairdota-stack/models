#!/usr/bin/env node
/** THROWAWAY — capture the literal TEXT on the TV and on each phone at each phase of ep1 and ep4. */
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startShow, playerIdOf } from '../../net/party/show.mjs';
import { PHASE } from '../../src/party/phases.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOW_PORT = 5286, RIG_PORT = 5287;
const NAMES = ['Vic','Sam','Jo','Kit','Roo','Ali','Mo','Ben'];
const show = startShow({ port: SHOW_PORT, code: 'demo', stamp: 1700000000000 });
const rigServer = http.createServer((req, res) => { res.writeHead(200, {'content-type':'text/html; charset=utf-8'}); res.end(readFileSync(join(HERE,'..','rig.html'),'utf8')); });
await new Promise((r) => rigServer.listen(RIG_PORT, '127.0.0.1', r));
const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: existsSync(CHROME)?CHROME:undefined, args:['--disable-dev-shm-usage','--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1480, height: 1420 } });
await page.goto(`http://127.0.0.1:${RIG_PORT}/?show=http://127.0.0.1:${SHOW_PORT}&names=${NAMES.join(',')}&scale=0.42`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const tv = page.frameLocator('#tv');
const ph = (i) => page.frameLocator(`#p${i}`);
const sleep = (ms) => page.waitForTimeout(ms);
const skip = async () => { await tv.locator('body').evaluate(()=>dispatchEvent(new KeyboardEvent('keydown',{key:'s'}))); await sleep(500); };
const waitPhase = async (p, tries=30) => { for (let i=0;i<tries && show.sessionNow()?.state.phase!==p;i++) await skip(); await sleep(400); };
const norm = (t) => (t||'').replace(/\s+/g,' ').trim().slice(0,1600);

async function snap(label) {
  const st = show.sessionNow().state;
  console.log(`\n##### ${label} | ep${st.episode} ${st.phase} | cams ${st.cameras.unlocked}/${st.cameras.needed} | pair r=${st.pair.runner} g=${st.pair.guide} room=${st.expedition.room}`);
  console.log(`  TV: ${norm(await tv.locator('body').innerText())}`);
  const want = new Set();
  for (let i = 0; i < 8; i++) { const id = playerIdOf(i); if (st.pair.runner===id||st.pair.guide===id) want.add(i); }
  want.add(0);
  for (const i of [...want].sort()) {
    const id = playerIdOf(i);
    const tag = st.pair.runner===id?'RUNNER':st.pair.guide===id?'GUIDE':'SPECTATOR';
    const dead = st.players.find(p=>p.id===id)?.alive===false ? ' DEAD' : '';
    console.log(`  ${NAMES[i].padEnd(4)}[${tag}]${dead}: ${norm(await ph(i).locator('body').innerText())}`);
  }
}

for (let i = 0; i < 8; i++) { await ph(i).locator('#name').fill(NAMES[i]); await ph(i).locator('#go').click(); await sleep(150); }
await sleep(800);
await tv.locator('body').evaluate(()=>dispatchEvent(new KeyboardEvent('keydown',{code:'Space'})));
await sleep(1200);
const truth = show.sessionNow().truth();
console.log('GROUND TRUTH:', truth.seats.map(t=>`${NAMES[t.seat]}=${t.role}/${t.alignment}${t.cover?'(believes '+t.cover+')':''}`).join('  '));

async function runEpisode(ep, capture) {
  await waitPhase(PHASE.CASTING);
  if (capture) await snap('CASTING');
  const st0 = show.sessionNow().state;
  for (let i = 0; i < 8; i++) {
    const btns = ph(i).locator('[data-pick]');
    const liveNames = st0.players.filter(p=>p.alive).map(p=>NAMES[p.seat]);
    await btns.filter({hasText: liveNames[(i+ep)%liveNames.length]}).first().click().catch(()=>{});
    await sleep(40);
    await btns.filter({hasText: liveNames[(i+ep+2)%liveNames.length]}).first().click().catch(()=>{});
    await sleep(40);
    await ph(i).locator('#sendCast').click().catch(()=>{});
    await sleep(50);
  }
  await waitPhase(PHASE.EXPEDITION);
  const st = show.sessionNow().state;
  const gSeat = st.players.find(p=>p.id===st.pair.guide).seat, rSeat = st.players.find(p=>p.id===st.pair.runner).seat;
  if (capture) await snap('EXPEDITION (before the call)');
  await ph(gSeat).locator('#cl').click().catch(()=>{});
  await sleep(300);
  if (capture) await snap('EXPEDITION (after the call)');
  await ph(rSeat).locator('#go2, #goBtn, [data-move="GO"]').first().click().catch(()=>{});
  await sleep(300);
  await waitPhase(PHASE.RECAP);
  if (capture) await snap('RECAP');
  await waitPhase(PHASE.DEBRIEF);
  if (capture) await snap('DEBRIEF  <<<< the 75 seconds of talking');
  if (ep === 1) return;
  await waitPhase(PHASE.RECKONING);
  if (capture) await snap('RECKONING');
  const alive = show.sessionNow().state.players.filter(p=>p.alive);
  await ph(alive[0].seat).locator(`[data-nom]`).first().click().catch(()=>{});
  await sleep(300);
  await waitPhase(PHASE.VOTE);
  if (capture) await snap('VOTE');
  for (const p of show.sessionNow().state.players.filter(x=>x.alive)) { await ph(p.seat).locator('[data-vote]').first().click().catch(()=>{}); await sleep(60); }
  await waitPhase(PHASE.VERDICT);
  if (capture) await snap('VERDICT');
}

await runEpisode(1, true);
for (let e = 2; e <= 3; e++) await runEpisode(e, false);
await runEpisode(4, true);
await waitPhase(PHASE.REUNION, 60);
await snap('REUNION');
await browser.close(); rigServer.close(); process.exit(0);
