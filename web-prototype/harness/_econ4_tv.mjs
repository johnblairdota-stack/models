#!/usr/bin/env node
/** _econ4_tv — throwaway. (a) TV headline vs the win machine. (b) evil's lie window across episodes. */
import { createRoom } from '../src/party/room.js';
import { tallyCasting } from '../src/party/ballot.js';
import { COMPOSITION } from '../src/party/cast.js';
import { OUTCOME, WIN_TARGETS } from '../src/party/win.js';
import { EPISODE_CAP } from '../src/party/phases.js';
import { ROOMS, coveredRooms, coverageFraction } from '../src/party/coverage.js';
import { blindStrip } from '../src/party/darkrun.js';
import { castBallot, nominate, vote, willLie, spikesThisEpisode, chance } from '../src/party/policy.js';
const SEEDS = Number(process.env.SEEDS || 400);
const COUNTS = [4,5,6,7,8];
const BLIND = Math.min(1, blindStrip(4.80, 70) / 8.0);
const lieWin = [];   // per-episode: had the guide NO SIGNAL (patient-evil's only lie window)?

function expedition({ seed, ep, worldSeed, unlocked, guidePolicy, spiked }) {
  const covered = coveredRooms(worldSeed, unlocked);
  let hunter = ROOMS[Math.floor(chance(seed, `h${ep}`) * ROOMS.length)];
  let runner = 'hall', taken = false;
  for (let turn = 0; turn < 4 && !taken; turn++) {
    const inStrip = chance(seed, `strip${ep}${turn}`) < BLIND;
    const hadSignal = covered.has(hunter) && !inStrip;
    lieWin.push({ ep, hadSignal });
    const lied = willLie({ policy: guidePolicy, hadSignal, seed, salt: `${ep}:${turn}` });
    const hw = !lied && !hadSignal && chance(seed, `guess${ep}${turn}`) < 0.5;
    const wrong = lied || hw;
    const wt = ROOMS[Math.floor(chance(seed, `mv${ep}${turn}`) * ROOMS.length)];
    runner = wrong && chance(seed, `meet${ep}${turn}`) < 0.5 ? hunter : wt;
    hunter = spiked && turn === 1 ? runner : ROOMS[Math.floor(chance(seed, `hw${ep}${turn}`) * ROOMS.length)];
    if (hunter === runner) taken = chance(seed, `kill${ep}${turn}`) < 0.55;
  }
  return { taken };
}
const rows = [];
for (const count of COUNTS) for (const [gp, evp] of [['naive-good','patient-evil'],['cautious-good','patient-evil'],['naive-good','aggressive-evil'],['cautious-good','aggressive-evil']]) for (let seed = 0; seed < SEEDS; seed++) {
  const r = createRoom({ count, castSeed: seed*977+count, worldSeed: seed+1, send: ()=>{}, emit: ()=>{} });
  r.start();
  const align = Object.fromEntries(r.deal.seats.map((s)=>[s.id,s.alignment]));
  const evilSet = new Set(r.deal.evil);
  const pol = (id) => (align[id]==='evil'?evp:gp);
  const suspicion = {};
  let madeEps = 0, eps = 0;
  const needed = COMPOSITION[count].cameras;
  for (let ep = 1; ep <= EPISODE_CAP; ep++) {
    if (r.state.outcome && r.state.outcome !== OUTCOME.RENEWED) break;
    const living = r.state.players.filter((p)=>p.alive).map((p)=>p.id);
    if (living.length < 2) break;
    eps++;
    if (r.state.cameras.unlocked >= needed) madeEps++;   // what the TV headline says at this moment
    const ballots = living.map((id)=>castBallot({policy:pol(id),self:id,living,history:r.state.history,seed,ep}));
    const pair = tallyCasting({ballots,living,history:r.state.history,lastPair:r.state.lastPair,ep,matchSeed:seed+1});
    const seatedEvil = living.filter((id)=>evilSet.has(id)&&id!==pair.runner&&id!==pair.guide);
    const spikers = seatedEvil.filter((id)=>spikesThisEpisode({policy:evp,seed,ep,self:id}));
    const e = expedition({seed,ep,worldSeed:seed+1,unlocked:r.state.cameras.unlocked,guidePolicy:pol(pair.guide),spiked:spikers.length>0});
    if (e.taken) suspicion[pair.guide]=(suspicion[pair.guide]??0)+1;
    const noms=[];
    for (const id of living){ if(noms.length>=3)break; const n=nominate({policy:pol(id),self:id,living,suspicion,seed,ep});
      if(n&&!noms.some((x)=>x.nominator===n.nominator||x.target===n.target)&&n.target!==n.nominator)noms.push(n); }
    const standing=noms.map((n)=>n.target);
    const votes=Object.fromEntries(living.map((id)=>[id,vote({policy:pol(id),self:id,standing,suspicion,evilSet,seed,ep})]));
    r.playEpisode({ballots,takeRunner:e.taken,nominations:noms,votes,hunterRoom:ROOMS[0]});
  }
  rows.push({ count, eps, madeEps, outcome: r.state.outcome, needed,
    finalUnlocked: r.state.cameras.unlocked, lit: r.log.all().filter((x)=>x.type==='run.camera_lit').length });
}
const pct=(x)=>(x*100).toFixed(1).padStart(5)+'%';
console.log(`PROBE _econ4_tv · ${rows.length} matches\n`);
console.log('=== T1. THE TELEVISION SAYS "The season is made." (show-tv.html:244: unlocked >= needed) ===');
console.log('  count │ needed (COMPOSITION) │ camera_lit for the TV │ camera_lit to actually win │ matches where TV said MADE │ mean episodes shown MADE while still playing │ of those, good LOST');
for (const c of COUNTS) {
  const sub = rows.filter((r)=>r.count===c);
  const made = sub.filter((r)=>r.madeEps>0);
  const lost = made.filter((r)=>r.outcome!==OUTCOME.FINALE).length;
  console.log(`  ${String(c).padStart(5)} │ ${String(COMPOSITION[c].cameras).padStart(20)} │ ${String(COMPOSITION[c].cameras-1).padStart(21)} │ ${String(WIN_TARGETS[c].cameraTarget).padStart(26)} │ ${pct(made.length/sub.length).padStart(26)} │ ${(sub.reduce((a,r)=>a+r.madeEps,0)/sub.length).toFixed(2).padStart(44)} │ ${made.length?pct(lost/made.length):'n/a'}`);
}
console.log('\n  final state.cameras.unlocked vs the pip bar length (needed):');
for (const c of COUNTS) {
  const sub = rows.filter((r)=>r.count===c);
  const over = sub.filter((r)=>r.finalUnlocked>COMPOSITION[c].cameras).length;
  const mx = Math.max(...sub.map((r)=>r.finalUnlocked));
  console.log(`  ${c}p: pip bar has ${COMPOSITION[c].cameras} pips; unlocked reached ${mx} at most; ${pct(over/sub.length)} of matches overflow the bar`);
}
console.log('\n=== T2. EVIL\'S LIE WINDOW ACROSS EPISODES (patient-evil lies only with NO SIGNAL) ===');
console.log('  ep │ calls │ guide had NO SIGNAL (lie is deniable) │ guide HAD signal (a lie is a provable lie later)');
for (let ep=1; ep<=EPISODE_CAP; ep++){
  const s = lieWin.filter((x)=>x.ep===ep); if(!s.length)continue;
  const no = s.filter((x)=>!x.hadSignal).length/s.length;
  console.log(`  ${String(ep).padStart(2)} │ ${String(s.length).padStart(5)} │ ${pct(no).padStart(37)} │ ${pct(1-no).padStart(47)}`);
}
