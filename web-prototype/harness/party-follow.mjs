#!/usr/bin/env node
/**
 * party-follow — the D13 follow slot's closed schema, and the four ways it could leak.
 *
 *   node harness/party-follow.mjs
 *
 * `docs/slices/task-d13-tv-follow.md` §4.1. The follow view has no socket: everything it knows
 * arrives in a URL. That makes the URL a CHANNEL, and this gate is to that channel what
 * `party-isolation` is to the state frame and `fanoutViolations` is to the public side-channel.
 *
 * ⚠️ NO BROWSER, NO THREE, NO DEPENDENCY. `.github/workflows/gates.yml` runs the party gates with
 * no `npm install` step, deliberately, so a gate is never skipped for want of a module. What the
 * PIXELS do is `harness/party-follow-drive.mjs`'s job and it is not in this chain.
 *
 * 🚨 F4 IS THE CONTROL ARM AND IT IS THE POINT. `party-isolation`'s four injected leaks exist
 * because a gate whose controls stop failing has gone blind. Four deliberately leaky param sets
 * are built here and each one must be caught; if any of them stops being a violation, this file
 * is decorative.
 */

import {
  FOLLOW_BEATS, FOLLOW_KEYS, FOLLOW_FORBIDDEN, FOLLOW_VIEW, THROTTLES,
  cleanThrottle, followParams, followUrl, followViolations, isFollowBeat,
} from '../src/party/follow.js';
import { ACCENTS, SHELLS } from '../src/party/look.js';
import { STUB_SHOW_PLAN, recapAfterMs } from '../src/party/show.js';
import { FANOUT_FORBIDDEN } from '../net/party/local.mjs';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const LOOK = { shell: SHELLS[2], accent: ACCENTS[3] };
const SLOT = {
  beat: 'expedition', room: 'q7kd', runnerId: 'p3', name: 'Hai',
  look: LOOK, worldSeed: 3, origin: 'http://localhost:5178',
};

console.log('\nparty-follow — the TV follow slot');

// ---- F0 · the slot only exists on the run, and only with a runner ---------------------------
{
  t('F0 · lobby / casting / recap mount no camera',
    ['lobby', 'casting', 'recap', 'debrief', ''].every((beat) => followUrl({ ...SLOT, beat }) === null));
  t('F0b · expedition with no cast pair mounts no camera',
    followUrl({ ...SLOT, runnerId: null }) === null && followUrl({ ...SLOT, runnerId: '' }) === null);
  t('F0c · expedition is the only follow beat',
    FOLLOW_BEATS.length === 1 && isFollowBeat('expedition') && !isFollowBeat('recap'));
}

// ---- F1 · the run mounts the follow view, carrying what it needs and nothing else -----------
{
  const url = followUrl(SLOT);
  const q = new URL(url).searchParams;
  t('F1 · expedition + a runner mounts party.follow',
    !!url && q.get('view') === FOLLOW_VIEW, url);
  t('F1b · it carries the runner, the published name, the room and the public world seed',
    q.get('runner') === 'p3' && q.get('name') === 'Hai' && q.get('room') === 'q7kd' && q.get('seed') === '3');
  t('F1c · it carries the lobby cosmetics, so the cam light is the runner\'s own colour',
    q.get('shell') === LOOK.shell && q.get('accent') === LOOK.accent);
  t('F1d · throttle defaults to WALK and only the four pad values survive',
    q.get('throttle') === 'WALK'
      && THROTTLES.every((x) => cleanThrottle(x) === x)
      && cleanThrottle('SPRINT') === 'WALK' && cleanThrottle(null) === 'WALK');
  t('F1e · the origin is the page\'s own — a follow can never be pointed off-site',
    url.startsWith('http://localhost:5178/?'));
}

// ---- F2 · a real slot satisfies the closed schema -------------------------------------------
{
  t('F2 · a real slot has no schema violations',
    followViolations(followParams(SLOT)).length === 0);
  t('F2b · the url form and the object form agree',
    followViolations(followUrl(SLOT)).length === 0);
  t('F2c · every key a slot emits is on the allow-list',
    Object.keys({ ...followParams(SLOT), room: 'x' }).every((k) => FOLLOW_KEYS.includes(k)),
    FOLLOW_KEYS.join(','));
}

// ---- F3 · the TV cannot be handed more than the wire allows ---------------------------------
{
  const long = followParams({ ...SLOT, name: 'Bartholomew Cubbins' });
  t('F3 · the name is capped at 12 and lands with no ragged trailing space',
    long.name === 'Bartholomew' && long.name.length <= 12, `"${long.name}"`);
  const off = followParams({ ...SLOT, look: { shell: '#ff0000', accent: '#00ff00' } });
  t('F3b · an off-palette look is DROPPED, not passed through',
    off.shell === undefined && off.accent === undefined);
  const halfLook = followParams({ ...SLOT, look: { shell: SHELLS[0], accent: '#123456' } });
  t('F3c · half a look is no look — cleanLook is all-or-nothing',
    halfLook.shell === undefined && halfLook.accent === undefined);
  t('F3d · a non-numeric seed is dropped rather than smuggled as a string',
    followParams({ ...SLOT, worldSeed: 'castSeed' }).seed === undefined);
}

// ---- F4 · THE CONTROL ARMS. Four leaks, each must go red ------------------------------------
//
// These are `party-loop.md`'s own "Do not" list expressed as URL params. Each is a picture that
// would be on the shared screen if it were allowed:
//   flyover / marks  the guide's map — the thing the guide is paid to be the only source of
//   hunter          the hunter's position, which is the whole tension of "will they get taken?"
//   lid             `room.setLid(false)`. The house with its ceilings off IS a god-view.
{
  const LEAKS = [
    ['L1 flyover', { ...followParams(SLOT), flyover: '1' }],
    ['L2 marks', { ...followParams(SLOT), marks: '1.5,-2.0' }],
    ['L3 hunter', { ...followParams(SLOT), hunter: 'east' }],
    ['L4 lid', { ...followParams(SLOT), lid: '0' }],
  ];
  let caught = 0;
  for (const [label, params] of LEAKS) {
    const bad = followViolations(params);
    if (t(`F4 control ${label} · must be a violation`, bad.length > 0, bad.join(','))) caught++;
  }
  t('F4e · all four controls red — the gate can still see a leak', caught === 4, `${caught}/4`);
  t('F4f · an unknown key is a violation too — deny by default, not a deny-list',
    followViolations({ ...followParams(SLOT), debug: '1' }).length === 1);
  t('F4g · a slot pointed at another view is a violation',
    followViolations({ ...followParams(SLOT), view: 'game.play' }).length > 0);
  let threw = false;
  try { followUrl({ ...SLOT, tag: 'x'.repeat(64) }); } catch { threw = true; }
  t('F4h · a long tag is truncated rather than throwing — the cap is the schema', !threw);
}

// ---- F5 · the URL cannot be a way around the socket's own refusals ---------------------------
{
  const missing = FANOUT_FORBIDDEN.filter((k) => !FOLLOW_FORBIDDEN.includes(k));
  t('F5 · FOLLOW_FORBIDDEN is a superset of the side-channel\'s FANOUT_FORBIDDEN',
    missing.length === 0, missing.length ? `missing ${missing.join(',')}` : `${FOLLOW_FORBIDDEN.length} keys`);
  t('F5b · and it adds the three this channel introduces',
    ['marks', 'lid', 'plan'].every((k) => FOLLOW_FORBIDDEN.includes(k)));
  const overlap = FOLLOW_KEYS.filter((k) => FOLLOW_FORBIDDEN.includes(k));
  t('F5c · no key is both allowed and forbidden', overlap.length === 0, overlap.join(','));
}

// ---- F6 · the slot is a PURE function, or the TV reloads the mansion on every snapshot -------
//
// `party-host.js` recomputes this on every repaint and only assigns `iframe.src` when the string
// changed. If `followUrl` were not pure — a timestamp, a nonce, an object key order that drifted
// — that comparison would always fail, every lobby snapshot would reload the iframe, and the
// mansion would never finish baking. Slice §5.1.
{
  const a = followUrl(SLOT);
  const b = followUrl({ ...SLOT });
  t('F6 · the same inputs give the same url, byte for byte', a === b, a);
  const c = followUrl({ ...SLOT, name: 'Ellie' });
  t('F6b · and a real change does change it — the comparison is not vacuous', c !== a);
}

// ---- F7 · the run has to be long enough to be a show ----------------------------------------
//
// The stub clock was 4800 ms, which was right for a caption and is shorter than the mansion takes
// to bake on a cold tab — so the beat would flip to recap before the camera it exists to hold had
// a first frame, and the whole slice would present as "the follow does not work". Measured on a
// software rasteriser: 22.6-23.7 s to the follow's first rendered frame. Asserted here rather
// than in `party-night`, because it is this slice's number and this slice's reason.
{
  t('F7 · expedition is still immediate — the TV never waits on a host click',
    (STUB_SHOW_PLAN.find((s) => s.beat === 'expedition')?.ms ?? 1) === 0);
  t('F7b · and the run is long enough to hold a produced beat, not a caption',
    recapAfterMs() >= 20000, `${(recapAfterMs() / 1000).toFixed(0)} s`);
}

console.log(`\nparty-follow: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
