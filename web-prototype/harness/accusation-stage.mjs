#!/usr/bin/env node
/**
 * accusation-stage — the Reckoning PERFORMS a nomination instead of growing an exclamation mark.
 *
 *   node harness/accusation-stage.mjs
 *
 * =============================================================================================
 * 🔒 A1–A6 ARE THE ONES THAT MATTER. EVERYTHING ELSE IS A RUNNING ORDER.
 * =============================================================================================
 *
 * **A1–A3 · FIRE ONCE PER NOMINATION, NOT ONCE PER FANOUT.** This is the way this feature fails.
 * `intro-bed.setNominees` is called with the SAME standing list over and over: `party-host.js`
 * `cueNominees` re-sends it the moment Reckoning becomes Vote, and the `noms` fanout beneath it
 * re-sends on every tap by anybody in the room. A staging that restarts on each of those is not a
 * subtle bug — it is eight seated robots twitching continuously for the length of the beat, on
 * the biggest screen in the house. `setPairs` already carries a header about exactly this class
 * of problem for the merged plate; the fix is the same shape and these are its gate.
 *
 * **A4–A5 · IT MUST RESTORE, WITHOUT BEING TOLD.** No withdrawal event is delivered — a
 * nomination simply stops being in the list. So "who should be posed" is re-derived from the live
 * list on every call rather than remembered, exactly as `setPairs` re-reads the seat for the
 * name. A robot left standing because nobody sent a "sit down" is a robot standing for the rest
 * of the night, in every shot, including the Execution.
 *
 * **A6 · WHO REACTS AND WHICH POSTURE THE ACCUSED HOLDS CANNOT LEAK A ROLE.** Anything the circle
 * does differently for different players is farmable from the sofa. `Sit_on_Chair_Arms_Crossed`
 * vs `Sitting_Answering_Questions` reads as defiant vs cooperative — if that tracked the deal,
 * the TV would hand the room a read on hidden information every single Reckoning, with a MEANING
 * attached. A6 asserts both picks are a pure function of PUBLIC seat indices: shuffle who is who
 * behind the same two chairs and the staging is byte-identical.
 *
 * ---------------------------------------------------------------------------------------------
 * Pure node. `src/game/intro-bed.js` imports THREE but nothing in it touches a document at import
 * time, and the staging machine itself is THREE-free by construction — same discipline as
 * `chair-seats.js`, so the running order can be asserted without a browser or a GPU.
 * ---------------------------------------------------------------------------------------------
 */

import {
  ACCUSE, ACCUSE_CLIPS, createAccusationStage, nomKey, nomRows,
  planAccusation, reactorSeats, settleClip, gaspClip, pickAllowed,
  planExecute, EXECUTE,
} from '../src/game/intro-bed.js';
import { SEATED_REACTION_CLIPS, SEATED_CLIPS_LEAVE_CHAIR, SIT_CLIP_ALLOW } from '../src/game/chair-seats.js';
import { NOM_INK, NOM_CHROME, INK } from '../src/characters/chest-nameplate.js';
import { executioner, SHOWRUNNER } from '../src/party/vote.js';
import { WEAPON_RANGE } from '../src/game/rules.js';
import { SWING_DUR } from '../src/game/sledge.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

/**
 * A recording circle. `seatOf` is the public-id -> chair map the bed hands the machine; the hooks
 * record instead of touching an avatar, so every assertion below is about the DECISIONS the
 * machine makes rather than about three.js.
 */
function circle(ids, { playFails = false } = {}) {
  const log = [];
  let marked = new Set();
  const stage = createAccusationStage({
    seatCount: ids.length,
    seatOf: (id) => {
      const i = ids.indexOf(String(id));
      return i >= 0 ? i : null;
    },
    play: (seat, clip, hold) => {
      log.push({ kind: 'play', seat, clip, hold: !!hold });
      return !playFails;
    },
    rest: (seat) => { log.push({ kind: 'rest', seat }); },
    mark: (targets) => { marked = targets; },
  });
  return {
    stage, log,
    marked: () => [...marked].sort(),
    plays: () => log.filter((r) => r.kind === 'play'),
    rests: () => log.filter((r) => r.kind === 'rest'),
    clear: () => { log.length = 0; },
    /** Run the whole ~4 s staging out at 60 Hz. */
    run: (secs = 4) => { for (let i = 0; i < Math.round(secs * 60); i++) stage.step(1 / 60); },
  };
}

const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const NOM = [{ nominator: 'p2', target: 'p5' }];

console.log('\naccusation-stage · the circle performs the accusation\n');

/* ── A0 · the running order is the one John asked for ─────────────────────────────────────── */
{
  const beats = planAccusation({ nominatorSeat: 1, accusedSeat: 4, seatCount: 8 });
  const at = (role, clip) => beats.find((b) => b.role === role && (!clip || b.clip === clip));
  t('A0a · the accuser stands at t=0, and stays standing',
    at('nominator')?.at === ACCUSE.STAND
    && at('nominator')?.clip === 'Sit_to_Stand_Transition_M'
    && at('nominator')?.hold === true,
    JSON.stringify(at('nominator')));
  const flinch = beats.find((b) => b.clip === ACCUSE_CLIPS.flinch);
  t('A0b · the accused flinches 0.4 s later, one-shot',
    flinch?.at === ACCUSE.FLINCH && flinch.seat === 4 && flinch.hold === false,
    JSON.stringify(flinch));
  const gasps = beats.filter((b) => b.role === 'reactor');
  t('A0c · 2–3 others react from 0.8 s, staggered — never a chorus line',
    gasps.length >= 2 && gasps.length <= 3
    && gasps.every((g, i) => Math.abs(g.at - (ACCUSE.GASP + i * ACCUSE.GASP_STAGGER)) < 1e-9)
    && new Set(gasps.map((g) => g.at)).size === gasps.length,
    gasps.map((g) => `${g.seat}@${g.at.toFixed(2)}`).join(' '));
  const settle = beats.filter((b) => b.role === 'accused' && b.hold);
  t('A0d · the accused settles into ONE held posture at 2.0 s',
    settle.length === 1 && settle[0].at === ACCUSE.SETTLE && settle[0].seat === 4,
    JSON.stringify(settle[0]));
  t('A0e · neither the accuser nor the accused is asked to gasp at themselves',
    !gasps.some((g) => g.seat === 1 || g.seat === 4),
    gasps.map((g) => g.seat).join(','));
  t('A0f · every clip the staging asks for is on `SEATED_REACTION_CLIPS`',
    beats.every((b) => SEATED_REACTION_CLIPS.includes(b.clip)),
    beats.map((b) => b.clip).join(' '));
  t('A0g · …and none of them is a RESTING sit clip — a performance is not a pose',
    beats.every((b) => !SIT_CLIP_ALLOW.includes(b.clip)));
  t('A0h · the whole thing is over in ~4 s of show time',
    Math.max(...beats.map((b) => b.at)) <= 2.6);
}

/* ── A1–A3 · ONCE PER NOMINATION, NOT ONCE PER FANOUT ─────────────────────────────────────── */
{
  const c = circle(IDS);
  c.stage.set(NOM);
  c.run(4);
  const first = c.plays().length;
  t('A1a · a new nomination stages the whole performance', first >= 4, `${first} beats`);

  c.clear();
  // The `noms` fanout on every tap, and the identical list re-cued on the Reckoning -> Vote beat.
  for (let i = 0; i < 25; i++) { c.stage.set(NOM); c.run(0.2); }
  t('A1b · 25 more fanouts of the SAME list play NOTHING — this is the twitch bug',
    c.plays().length === 0, `${c.plays().length} replays`);
  t('A1c · …and nobody is put back to idle by them either',
    c.rests().length === 0, `${c.rests().length} rests`);
}
{
  // A fanout arriving mid-stagger must not restart the beats that have not fired yet.
  const c = circle(IDS);
  c.stage.set(NOM);
  c.run(0.5);                       // stand + flinch have fired; gasps and settle have not
  const mid = c.plays().length;
  const pendingBefore = c.stage.pending();
  for (let i = 0; i < 10; i++) c.stage.set(NOM);
  t('A2 · a fanout mid-stagger neither re-fires nor re-queues',
    c.plays().length === mid && c.stage.pending() === pendingBefore,
    `${mid} fired, ${pendingBefore} pending`);
  c.run(4);
  t('A2b · the rest of the staging still arrives exactly once',
    c.plays().filter((p) => p.clip === ACCUSE_CLIPS.flinch).length === 1
    && c.plays().filter((p) => p.hold && p.seat === 4).length === 1);
}
{
  const c = circle(IDS);
  c.stage.set(NOM);
  c.run(4);
  c.clear();
  // A SECOND accuser for the same target is a genuinely new beat and must stage.
  c.stage.set([...NOM, { nominator: 'p7', target: 'p5' }]);
  c.run(4);
  const stood = c.plays().filter((p) => p.clip === ACCUSE_CLIPS.stand);
  t('A3a · a second accuser of the same target is a NEW nomination and stands',
    stood.length === 1 && stood[0].seat === 6, JSON.stringify(stood));
  t('A3b · …and the first accuser is not made to stand up twice',
    !stood.some((p) => p.seat === 1));
  t('A3c · the key is the pair, not the target',
    nomKey({ nominator: 'p2', target: 'p5' }) !== nomKey({ nominator: 'p7', target: 'p5' }));
}

/* ── A4–A5 · RESTORE, DERIVED FROM THE LIVE LIST ──────────────────────────────────────────── */
{
  const c = circle(IDS);
  c.stage.set(NOM);
  c.run(4);
  const performing = c.stage.performing().map((p) => p.seat).sort();
  t('A4a · while it is live, the accuser and the accused are holding a pose',
    performing.join(',') === '1,4', performing.join(','));
  c.clear();
  c.stage.set([]);                    // Vote ends / Casting clears — no withdrawal event exists
  const rested = c.rests().map((r) => r.seat).sort();
  t('A4b · an empty list puts BOTH of them back on the plain seated idle',
    rested.join(',') === '1,4', rested.join(','));
  t('A4c · …and nothing is left holding a pose',
    c.stage.performing().length === 0 && c.stage.keys().length === 0);
  c.clear();
  c.run(4);
  t('A4d · a cleared stage stays quiet — no orphan beat fires later',
    c.log.length === 0, `${c.log.length} events`);
}
{
  // One of two nominations withdrawn: the survivor's people stay posed, the other's go back.
  const c = circle(IDS);
  c.stage.set([{ nominator: 'p2', target: 'p5' }, { nominator: 'p3', target: 'p8' }]);
  c.run(4);
  c.clear();
  c.stage.set([{ nominator: 'p2', target: 'p5' }]);
  const rested = c.rests().map((r) => r.seat).sort();
  t('A5a · withdrawing ONE nomination restores only that pair',
    rested.join(',') === '2,7', rested.join(','));
  t('A5b · …and the surviving accusation keeps its chairs standing',
    c.stage.performing().map((p) => p.seat).sort().join(',') === '1,4');
}
{
  // A robot accused twice, one of the two withdrawn, must NOT sit down — they are still accused.
  const c = circle(IDS);
  c.stage.set([{ nominator: 'p2', target: 'p5' }, { nominator: 'p7', target: 'p5' }]);
  c.run(4);
  c.clear();
  c.stage.set([{ nominator: 'p7', target: 'p5' }]);
  t('A5c · a target still accused by someone else does not stand down',
    !c.rests().some((r) => r.seat === 4), JSON.stringify(c.rests()));
  t('A5d · …but the accuser who withdrew sits back down',
    c.rests().some((r) => r.seat === 1));
}
{
  // Withdrawn mid-stagger: the beats that have not fired must be CANCELLED, not merely ignored.
  const c = circle(IDS);
  c.stage.set(NOM);
  c.run(0.5);
  c.clear();
  c.stage.set([]);
  c.run(4);
  t('A5e · a nomination withdrawn mid-stagger does not gasp anyway',
    !c.plays().length && c.stage.pending() === 0,
    `${c.plays().length} late beats, ${c.stage.pending()} pending`);
}

/* ── A6 · THE PICKS ARE PUBLIC. THEY CANNOT LEAK A ROLE. ──────────────────────────────────── */
{
  const a = planAccusation({ nominatorSeat: 1, accusedSeat: 4, seatCount: 8 });
  const b = planAccusation({ nominatorSeat: 1, accusedSeat: 4, seatCount: 8 });
  t('A6a · the same two SEATS always produce a byte-identical performance',
    JSON.stringify(a) === JSON.stringify(b));
  /*
   * The role-leak test proper: the machine is only ever given seat indices and public ids, so
   * re-seating the same night with different people behind the same chairs cannot change it.
   */
  const c1 = circle(IDS);
  const c2 = circle(['z9', 'z8', 'z7', 'z6', 'z5', 'z4', 'z3', 'z2']);
  c1.stage.set([{ nominator: 'p2', target: 'p5' }]); c1.run(4);
  c2.stage.set([{ nominator: 'z8', target: 'z5' }]); c2.run(4);
  t('A6b · different players in the same two chairs perform identically',
    JSON.stringify(c1.plays()) === JSON.stringify(c2.plays()));
  t('A6c · the held posture is a function of the accused SEAT and nothing else',
    settleClip(4) === settleClip(4) && settleClip(4) === settleClip(12)
    && settleClip(4) !== settleClip(5),
    `seat4=${settleClip(4)} seat5=${settleClip(5)}`);
  t('A6d · …and it is one of the two John named',
    ACCUSE_CLIPS.settle.includes(settleClip(4)) && ACCUSE_CLIPS.settle.includes(settleClip(5)));
  t('A6e · a reactor\'s clip likewise comes off its own seat index',
    gaspClip(3) === gaspClip(11) && gaspClip(3) !== gaspClip(4));
  /*
   * The negative control. If either pick ever grows an `rng`, a deal, a vote table or anything
   * else the server seeded with a secret, this loop stops being constant and the assertion above
   * stops meaning anything — so assert the SURFACE too: the planner takes seats and a count.
   */
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(JSON.stringify(planAccusation({ nominatorSeat: 1, accusedSeat: 4, seatCount: 8 })));
  t('A6f · 200 plans of the same nomination are one plan — nothing here is random',
    seen.size === 1, `${seen.size} distinct`);
}

/* ── A7 · reactor spread ──────────────────────────────────────────────────────────────────── */
{
  t('A7a · reactors are distinct chairs, and never the two principals',
    (() => {
      for (let n = 2; n <= 8; n++) {
        for (let acc = 0; acc < n; acc++) {
          for (let nom = 0; nom < n; nom++) {
            if (nom === acc) continue;
            const rs = reactorSeats(n, acc, nom);
            if (new Set(rs).size !== rs.length) return false;
            if (rs.some((s) => s === acc || s === nom || s < 0 || s >= n)) return false;
            if (rs.length !== Math.min(3, n - 2)) return false;
          }
        }
      }
      return true;
    })());
  t('A7b · a two-chair circle simply has nobody left to react',
    reactorSeats(2, 0, 1).length === 0);
  t('A7c · a seat count divisible by 3 still fills up — the stride collides, the sweep tops up',
    reactorSeats(6, 0, 1).length === 3 && reactorSeats(3, 0, 1).length === 1,
    `${reactorSeats(6, 0, 1)} / ${reactorSeats(3, 0, 1)}`);
}

/* ── A8 · degrade rather than throw ───────────────────────────────────────────────────────── */
{
  // `playSeated` lands on `mesh-avatar.js` separately, and a unit4h body will never have it.
  const c = circle(IDS, { playFails: true });
  c.stage.set(NOM);
  c.run(4);
  t('A8a · when `playSeated` is unavailable the beats are attempted and simply do not take',
    c.plays().length >= 4 && c.stage.performing().length === 0);
  t('A8b · …and nothing is recorded as held, so `reapply` cannot re-issue a phantom pose',
    c.stage.reapply() === 0);
}
{
  const c = circle(IDS);
  t('A8c · junk rows are dropped, not thrown on',
    (() => { c.stage.set([null, undefined, {}, { target: '' }, 'p3']); return true; })()
    && c.stage.keys().length === 1,
    JSON.stringify(c.stage.keys()));
  t('A8d · a bare id still reads as a target — `setNominees` has always accepted one',
    nomRows(['p3'])[0]?.target === 'p3' && nomRows(['p3'])[0]?.nominator === null);
  t('A8e · a duplicate row is one nomination',
    nomRows([{ nominator: 'p2', target: 'p5' }, { nominator: 'p2', target: 'p5' }]).length === 1);
  const off = circle(IDS);
  off.stage.set([{ nominator: 'ghost', target: 'p5' }]);
  off.run(4);
  t('A8f · an accuser who is not in the circle costs the accused nothing',
    off.plays().some((p) => p.seat === 4) && !off.plays().some((p) => p.seat < 0));
}

/* ── A9 · the beat sweep must not sit the accuser back down ───────────────────────────────── */
{
  const c = circle(IDS);
  c.stage.set(NOM);
  c.run(4);
  c.clear();
  // `setTalk(true)` / `releaseRun()` `parkSit` the whole circle. Reckoning -> Vote is exactly
  // that, with the same nominations still standing.
  const n = c.stage.reapply();
  const back = c.plays();
  t('A9a · a park sweep re-issues the HELD poses',
    n === 2 && back.length === 2 && back.every((p) => p.hold), JSON.stringify(back));
  t('A9b · …and re-issues NOTHING else — the circle does not re-gasp every beat',
    !back.some((p) => !p.hold), JSON.stringify(back));
  t('A9c · the re-issued poses are the terminal ones, not the transitions the accused passed through',
    back.some((p) => p.seat === 1 && p.clip === ACCUSE_CLIPS.stand)
    && back.some((p) => p.seat === 4 && ACCUSE_CLIPS.settle.includes(p.clip)),
    JSON.stringify(back));
}

/* ── A10 · the plate skin ─────────────────────────────────────────────────────────────────── */
{
  const c = circle(IDS);
  c.stage.set(NOM);
  t('A10a · the accused is marked for the `NOM_INK` plate the instant the nomination lands',
    c.marked().join(',') === 'p5', c.marked().join(','));
  t('A10b · the ACCUSER is not — standing up is the accuser\'s tell, the ink is the accused\'s',
    !c.marked().includes('p2'));
  c.stage.set([]);
  t('A10c · an empty list takes the ink back off',
    c.marked().length === 0);
  t('A10d · the accused skin is a real, distinct skin — not the show blue',
    !!NOM_INK && !!NOM_CHROME && NOM_INK !== INK,
    `${NOM_INK} vs ${INK}`);
}

/* ── A11 · the seat lock is not in the way — the CLIP does the travelling ─────────────────── */
{
  /*
   * The lock stays ON for the standing accuser (see `intro-bed.js`, and `player.js` L451 / L644
   * for the two bugs releasing it brings back). That only works because the stand clip carries
   * the body out of the chair itself; `chair-seats.js` measured it doing so. If a future
   * re-import turns the accuser's clip into one that stays put, the performance becomes a robot
   * standing up inside its own chair and this is the line that says so.
   */
  t('A11 · the accuser\'s clip is one that LEAVES the chair under a pinned root',
    SEATED_CLIPS_LEAVE_CHAIR.includes(ACCUSE_CLIPS.stand),
    `${ACCUSE_CLIPS.stand} · ${SEATED_CLIPS_LEAVE_CHAIR.join(' ')}`);
  t('A11b · the accused\'s held postures do NOT leave the chair — they are seated postures',
    ACCUSE_CLIPS.settle.every((c) => !SEATED_CLIPS_LEAVE_CHAIR.includes(c))
    && ACCUSE_CLIPS.gasp.every((c) => !SEATED_CLIPS_LEAVE_CHAIR.includes(c))
    && !SEATED_CLIPS_LEAVE_CHAIR.includes(ACCUSE_CLIPS.flinch));
  t('A11c · `pickAllowed` narrows to the allow-list and never empties a choice',
    pickAllowed(ACCUSE_CLIPS.settle).length > 0
    && pickAllowed(['Not_A_Clip']).length > 0
    && pickAllowed(ACCUSE_CLIPS.gasp).every((c) => SEATED_REACTION_CLIPS.includes(c)));
}

/* ── A12 · the wire it reads is public ────────────────────────────────────────────────────── */
{
  /*
   * The whole feature rests on the accuser's id being on the `noms` cue already. It is —
   * `CUE_NOM_KEYS` is `['nominator','target']` and `follow.js` says out loud that it is the same
   * public pair `FANOUT_KEYS.nomRow` fans to every socket. This asserts the staging asks for
   * nothing beyond it, so no future version of this file can quietly need a private field.
   */
  const { CUE_NOM_KEYS } = await import('../src/party/follow.js');
  const used = new Set();
  const probe = new Proxy({ nominator: 'p2', target: 'p5' }, {
    get(o, k) { if (typeof k === 'string') used.add(k); return o[k]; },
  });
  nomRows([probe]);
  const extra = [...used].filter((k) => !CUE_NOM_KEYS.includes(k));
  t('A12 · the staging reads only `nominator` and `target` — nothing private, no wire change',
    extra.length === 0, extra.length ? `also read: ${extra.join(',')}` : [...used].join(','));
}

/* ── E0–E6 · EXECUTION IS THE NOMINATOR WALKING, NOT A SIT-AND-CUT ─────────────────────────── */
{
  /*
   * John, room DUSK, 8 seats, bots piled the lynch onto Fox: whoever FIRST nominated Fox
   * should get up, walk at them, and hit them with the sledge. `executioner()` already
   * returns that nominator. These assert the TV plan matches the rule, that the Showrunner
   * sentinel does not invent a ninth body, and that an empty cue is off — so Execution
   * cannot silently go back to sitting everyone down and cutting.
   */
  const state = { living: ['p1', 'p2', 'p3'], nominations: [{ nominator: 'p2', target: 'p5' }] };
  t('E0 · the first nominator of the executed player is who `executioner()` names',
    executioner(state, 'p5') === 'p2');
  const walk = planExecute({ executionerId: executioner(state, 'p5'), targetId: 'p5' });
  t('E1 · and that same id is the actor the TV walks — stand, approach, sledge',
    walk.actor === 'p2' && walk.target === 'p5' && walk.walk === true && walk.showrunner === false,
    JSON.stringify(walk));
  const taken = planExecute({
    executionerId: executioner(state, 'p5', ['p2']),
    targetId: 'p5',
  });
  t('E2 · a nominator taken this episode is the Showrunner — no ninth robot, no walk',
    executioner(state, 'p5', ['p2']) === SHOWRUNNER
    && taken.actor === null && taken.walk === false && taken.showrunner === true
    && taken.target === 'p5',
    JSON.stringify(taken));
  t('E3 · nobody executed is nobody walking',
    planExecute({ executionerId: '', targetId: '' }).walk === false
    && planExecute({}).actor === null && planExecute({}).target === null);
  t('E4 · the rise fits inside the authored stand clip, and the strike is a hammer length',
    EXECUTE.RISE_DUR > 0.8 && EXECUTE.RISE_DUR < 6
    && EXECUTE.STRIKE <= WEAPON_RANGE.sledge
    && EXECUTE.WALK_TIMEOUT > EXECUTE.RISE_DUR
    && SWING_DUR > 0.4);
  const { CUE_KEYS, CUE_KINDS, CUE_EXECUTE_KEYS, cueViolations } = await import('../src/party/follow.js');
  t('E5 · the execute cue is closed, public, and refuses a role',
    CUE_KINDS.includes('execute')
    && CUE_EXECUTE_KEYS.every((k) => CUE_KEYS.execute.includes(k))
    && cueViolations({ kind: 'execute', executioner: 'p2', target: 'p5' }).length === 0
    && cueViolations({ kind: 'execute', executioner: SHOWRUNNER, target: 'p5' }).length === 0
    && cueViolations({ kind: 'execute', executioner: 'p2', target: 'p5', role: 'PLANT' }).length > 0);
  t('E6 · a second accuser is not the swinger — only the nominator of the executed player',
    executioner({
      living: ['p1', 'p2', 'p3'],
      nominations: [{ nominator: 'p1', target: 'p3' }, { nominator: 'p2', target: 'p5' }],
    }, 'p5') === 'p2');
}

console.log(`\naccusation-stage: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
