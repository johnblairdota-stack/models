#!/usr/bin/env node
/**
 * _genwalk1-build.mjs — DOES `room.js` BUILD A TURNED ROOM, OR ONLY PLACE ONE?
 *
 * `genwalk-1`, 2026-08-11. Read-only against `src/`: the plan edit is applied to `spaces.js`
 * IN MEMORY, at load, in this process, via `node:module` `registerHooks` — the same mechanism
 * `_ap3-build.mjs` uses for `AP3_PATCH`, and for the same reason (an arm is a PROCESS, because
 * `spaces.js` / `dig.js` / `room.js` all read `location` at module scope). Nothing is written to
 * disk. **`harness/_ap3-*.mjs` is another agent's and is neither imported nor edited here** — the
 * ~15 lines of baker stub below are re-stated rather than shared, on purpose.
 *
 * THE QUESTION. `house-packing.md` §9.4b item 1: *"`studyOrderFor` and `ballroomOrderFor` carry
 * `base: null` and read `sp.x0/sp.z0` directly — parametric on the footprint, blind to rotation.
 * Both need the gallery's treatment."* `_genwalk1-place.mjs` shows `placeRoom` EMITS a turned
 * study happily (only the ballroom's colonnade throws). Placing is not building. This asks the
 * BUILDER.
 *
 *   --arm control    the shipped `HOUSE_PLAN`, untouched
 *   --arm turn1      `study_e` turned a quarter (`turns: 1`), everything else shipped
 *   --arm turn2      `study_e` turned a half   (`turns: 2`), everything else shipped
 *   --arm ballturn   `ballroom` turned a quarter — must throw in `spaces.js`, before `room.js`
 *
 * ⚠️ **WHAT THIS ARM IS AND IS NOT.** Turning one room in the shipped plan makes it overlap its
 * neighbours and leaves the authored connectors off its walls. That is FINE for this question and
 * useless for any other: the question is whether the ORDER BUILDER survives a footprint whose
 * axes are swapped, and overlap does not reach that code. **Do not read a geometry census off
 * these arms.**
 *
 * 🚨 CONTROLS. `--arm control` must build; if it does not, the tree is broken (another agent has
 * `room.js` open — this file prints its hash so a failure can be attributed rather than believed).
 * `--arm ballturn` must THROW, so "it built" is distinguishable from "nothing ran".
 *
 * Usage:  node harness/evidence/_genwalk1-build.mjs --arm control
 *         node harness/evidence/_genwalk1-build.mjs --all
 */

import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = new URL('..', import.meta.url);
const SRC = new URL('../../src/', HERE);
const s = (p) => new URL(p, SRC).href;

const ARMS = {
  control: null,
  turn1: { id: 'study_e', turns: 1 },
  turn2: { id: 'study_e', turns: 2 },
  ballturn: { id: 'ballroom', turns: 1 },
};

function stubRenderer() {
  return {
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: () => {},
    readRenderTargetPixels: (rt, x, y, w, h, buf) => {
      buf[0] = 200; buf[1] = 200; buf[2] = 200; if (buf.length > 3) buf[3] = 255;
    },
  };
}

/**
 * 🚨 A MISSING ANCHOR THROWS. A patch that silently applied nothing would build the SHIPPED house
 * and report it as the turned one — "a result-shaped output instead of an error", which is the
 * failure class every control in this harness exists to refuse.
 */
function patchPlan(edit) {
  if (!edit) return;
  const spacesUrl = s('game/spaces.js');
  let applied = false;
  registerHooks({
    load(url, ctx, next) {
      const r = next(url, ctx);
      if (url !== spacesUrl) return r;
      let src = r.source.toString();
      const anchor = `id: '${edit.id}',`;
      const idx = src.indexOf(anchor);
      if (idx < 0) throw new Error(`_genwalk1-build: no slot named "${edit.id}" in HOUSE_PLAN`);
      // the slot's own `turns: 0`, the first one after its id
      const tIdx = src.indexOf('turns: 0', idx);
      if (tIdx < 0) throw new Error(`_genwalk1-build: slot "${edit.id}" has no "turns: 0"`);
      src = src.slice(0, tIdx) + `turns: ${edit.turns}` + src.slice(tIdx + 'turns: 0'.length);
      applied = true;
      return { ...r, source: src };
    },
  });
  process.on('exit', () => {
    if (!applied) {
      console.error('_genwalk1-build: the plan patch was set and spaces.js never loaded through the hook');
      process.exitCode = 1;
    }
  });
}

async function buildArm(name) {
  const edit = ARMS[name];
  if (edit === undefined) throw new Error(`unknown arm "${name}"`);
  patchPlan(edit);
  globalThis.location = { search: '' };

  const warns = [];
  const realWarn = console.warn;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };

  const { initBaker } = await import(s('materials/baker.js'));
  initBaker(stubRenderer());
  const SP = await import(s('game/spaces.js'));
  const RM = await import(s('game/room.js'));
  const room = await RM.buildTestRoom({ work: (p) => p }, {});
  console.warn = realWarn;

  const target = edit?.id ?? 'study_e';
  const sp = room.spaces.find((x) => x.id === target);
  let tris = 0, meshes = 0;
  room.root.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; } });
  return {
    arm: name, spaces: room.spaces.length, panels: room.panels.length, meshes, tris: Math.round(tris),
    target, span: sp ? [+(sp.x1 - sp.x0).toFixed(2), +(sp.z1 - sp.z0).toFixed(2)] : null,
    order: sp?.order ?? null, orderPlan: !!sp?.orderPlan, colliders: sp?.colliders?.length ?? 0,
    warns: warns.filter((w) => !/Unable to serialize/.test(w)).slice(0, 6),
  };
}

const roomHash = createHash('sha1')
  .update(readFileSync(fileURLToPath(s('game/room.js')))).digest('hex').slice(0, 12);

const argv = process.argv.slice(2);
if (argv.includes('--all')) {
  console.log(`\n_genwalk1-build — room.js sha1 ${roomHash} (another agent may have it open)\n`);
  const self = fileURLToPath(import.meta.url);
  for (const name of Object.keys(ARMS)) {
    const r = spawnSync(process.execPath, [self, '--arm', name], { encoding: 'utf8' });
    const out = (r.stdout || '').trim();
    const err = (r.stderr || '').trim().split('\n').filter((l) => /Error|error:/.test(l))[0] ?? '';
    console.log(`  ${name.padEnd(10)} exit ${r.status}  ${out || err.slice(0, 150)}`);
  }
  console.log('\n  expected: control/turn1/turn2 exit 0 · ballturn exit 1 with the columns throw\n');
} else {
  const i = argv.indexOf('--arm');
  const name = i >= 0 ? argv[i + 1] : 'control';
  const out = await buildArm(name);
  console.log(JSON.stringify(out));
}
