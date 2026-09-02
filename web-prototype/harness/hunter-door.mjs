#!/usr/bin/env node
/**
 * THE HUNTER IN THE DOOR — the art-path gate. `npm run gate:hunter-door`, or
 * `node harness/hunter-door.mjs [--measure]`.
 *
 * RED if any of these regress:
 *
 *   D1  BIND — a role clip (walk / run / attack / combo / idle / grow) is missing from the
 *       library GLB, or any of its tracks names a bone the body GLB's skeleton does not
 *       have. A clip that half-binds fades limbs out silently in three.js; here it fails.
 *   D2  MEASURED CONTACT — `HUNTER_SWINGS` in `src/characters/hunter-mesh-avatar.js` must
 *       carry a `measured:` note per swing, must NOT be the 0.60-style placeholder, and
 *       must agree with a FRESH forward-kinematics pass over the GLB tracks (tolerance
 *       0.03 s on contact, 0.02 s on duration). An unmeasured contact is a fake swing.
 *   D3  PACK PATH — every file `HUNTER_PACK` names exists under `public/`, `?hunterm=1`
 *       is actually wired in `src/views/game.js`, the `hunter.animated` view is registered,
 *       and `PLAYHUNTER.bat` opens with `hunterm=1`.
 *   D4  CONTROL — the comparator is fed a deliberately wrong contact and MUST reject it.
 *       If the control passes, the gate is not measuring and the whole run is RED. This is
 *       what makes "verify" unskippable: a Done card cannot exist without this file green,
 *       and this file cannot be green while asserting nothing.
 *
 * The FK method matches the numbers' provenance line: sample every joint's TRS tracks at
 * 240 Hz, walk the node hierarchy, take the leading hand (greater peak speed), contact =
 * first maximum of horizontal reach from the hips at/after peak speed.
 *
 * File reads of SOURCE are normalised CRLF->LF before any regex looks at them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEASURE_ONLY = process.argv.includes('--measure');
const CONTACT_TOL = 0.03, DUR_TOL = 0.02;

let failures = 0;
const ok = (id, msg) => console.log(`  \x1b[32mPASS\x1b[0m ${id}  ${msg}`);
const bad = (id, msg) => { failures++; console.log(`  \x1b[31mFAIL\x1b[0m ${id}  ${msg}`); };
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

// ---------- GLB parsing + FK (no three.js — the gate must not need a browser) ----------
function parseGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB: ' + file);
  let o = 12, json = null, bin = null;
  while (o < b.length) {
    const l = b.readUInt32LE(o), t = b.readUInt32LE(o + 4);
    const c = b.subarray(o + 8, o + 8 + l);
    if (t === 0x4e4f534a) json = JSON.parse(c.toString('utf8'));
    else if (t === 0x004e4942) bin = c;
    o += 8 + l;
  }
  return { json, bin };
}
const COMP = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array };
function accessor(g, i) {
  const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView];
  const T = COMP[a.componentType];
  const n = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const s = g.bin.subarray(start, start + a.count * n * T.BYTES_PER_ELEMENT);
  return { data: new T(s.buffer.slice(s.byteOffset, s.byteOffset + s.byteLength)), n };
}
const qnlerp = (a, b, t) => {
  const s = (a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]) < 0 ? -1 : 1;
  const o = [0,1,2,3].map((i) => a[i]*(1-t) + b[i]*t*s);
  const L = Math.hypot(...o) || 1; return o.map((v) => v/L);
};
function sampleTrack(times, vals, n, t, isQuat) {
  if (t <= times[0]) return Array.from(vals.slice(0, n));
  const last = times.length - 1;
  if (t >= times[last]) return Array.from(vals.slice(last*n, last*n+n));
  let i = 1; while (times[i] < t) i++;
  const f = (t - times[i-1]) / (times[i] - times[i-1] || 1);
  const a = Array.from(vals.slice((i-1)*n, i*n)), b = Array.from(vals.slice(i*n, i*n+n));
  return isQuat ? qnlerp(a, b, f) : a.map((v, k) => v + (b[k]-v)*f);
}
function trs(q, p, s) {
  const [x,y,z,w] = q, sx = s?.[0] ?? 1, sy = s?.[1] ?? 1, sz = s?.[2] ?? 1;
  return { m: [
    (1-2*(y*y+z*z))*sx, (2*(x*y+z*w))*sx, (2*(x*z-y*w))*sx,
    (2*(x*y-z*w))*sy, (1-2*(x*x+z*z))*sy, (2*(y*z+x*w))*sy,
    (2*(x*z+y*w))*sz, (2*(y*z-x*w))*sz, (1-2*(x*x+y*y))*sz,
  ], p: p ?? [0, 0, 0] };
}
function mul(A, B) {
  const m = new Array(9), a = A.m, b = B.m;
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++)
    m[c*3+r] = a[r]*b[c*3] + a[3+r]*b[c*3+1] + a[6+r]*b[c*3+2];
  return { m, p: [
    a[0]*B.p[0]+a[3]*B.p[1]+a[6]*B.p[2]+A.p[0],
    a[1]*B.p[0]+a[4]*B.p[1]+a[7]*B.p[2]+A.p[1],
    a[2]*B.p[0]+a[5]*B.p[1]+a[8]*B.p[2]+A.p[2],
  ] };
}
function measureClip(g, clipName) {
  const nodes = g.json.nodes;
  const parent = new Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent[c] = i));
  const anim = g.json.animations.find((a) => a.name === clipName);
  if (!anim) return null;
  const tracks = new Map();
  let dur = 0;
  for (const ch of anim.channels) {
    const s = anim.samplers[ch.sampler];
    const times = accessor(g, s.input).data, out = accessor(g, s.output);
    dur = Math.max(dur, times[times.length - 1]);
    if (!tracks.has(ch.target.node)) tracks.set(ch.target.node, {});
    tracks.get(ch.target.node)[ch.target.path] = { times, vals: out.data, n: out.n };
  }
  const idx = (name) => nodes.findIndex((n) => n.name === name);
  const hands = { LeftHand: idx('LeftHand'), RightHand: idx('RightHand') }, hips = idx('Hips');
  const pose = (t) => {
    const local = nodes.map((n, i) => {
      const tr = tracks.get(i) ?? {};
      const q = tr.rotation ? sampleTrack(tr.rotation.times, tr.rotation.vals, 4, t, true) : (n.rotation ?? [0,0,0,1]);
      const p = tr.translation ? sampleTrack(tr.translation.times, tr.translation.vals, 3, t, false) : (n.translation ?? [0,0,0]);
      const s = tr.scale ? sampleTrack(tr.scale.times, tr.scale.vals, 3, t, false) : (n.scale ?? [1,1,1]);
      return trs(q, p, s);
    });
    const world = new Array(nodes.length);
    const compute = (i) => world[i] ?? (world[i] = parent[i] < 0 ? local[i] : mul(compute(parent[i]), local[i]));
    return (i) => compute(i).p;
  };
  const DT = 1 / 240;
  const best = {};
  for (const [hand, hi] of Object.entries(hands)) {
    let prev = null, peakV = 0, peakT = 0;
    const samples = [];
    for (let t = 0; t <= dur + 1e-9; t += DT) {
      const P = pose(Math.min(t, dur));
      const w = P(hi), hp = P(hips);
      samples.push({ t, reach: Math.hypot(w[0]-hp[0], w[2]-hp[2]) });
      if (prev) {
        const v = Math.hypot(w[0]-prev[0], w[1]-prev[1], w[2]-prev[2]) / DT;
        if (v > peakV) { peakV = v; peakT = t; }
      }
      prev = w;
    }
    let arrT = peakT, arrReach = 0;
    for (const s of samples) {
      if (s.t < peakT) continue;
      if (s.reach > arrReach) { arrReach = s.reach; arrT = s.t; }
      else if (arrReach > 0 && s.reach < arrReach * 0.985) break;
    }
    best[hand] = { peakV, contact: arrT };
  }
  const lead = best.LeftHand.peakV >= best.RightHand.peakV ? 'LeftHand' : 'RightHand';
  return { duration: dur, contact: best[lead].contact, hand: lead, peakHandSpeed: best[lead].peakV };
}

// ---------- load the declared pack + swings straight out of the source ----------
const avatarSrc = src('src/characters/hunter-mesh-avatar.js');
const packMatch = avatarSrc.match(/export const HUNTER_PACK = \{([\s\S]*?)\n\};/);
if (!packMatch) { bad('D3', 'HUNTER_PACK not found in hunter-mesh-avatar.js'); finish(); }
const field = (name) => packMatch[1].match(new RegExp(`${name}: '([^']+)'`))?.[1];
const pack = { base: field('base'), body: field('body'), library: field('library') };
const rolesMatch = packMatch[1].match(/roles: \{([^}]*)\}/)[1];
const roles = {};
for (const m of rolesMatch.matchAll(/(\w+): '([^']+)'/g)) roles[m[1]] = m[2];

const swings = [];
for (const m of avatarSrc.matchAll(/\{ role: '(\w+)', clip: '([^']+)', duration: ([\d.]+), contact: ([\d.]+), hand: '(\w+)',[\s\S]*?(measured: '[^']*')?\s*\}/g)) {
  swings.push({ role: m[1], clip: m[2], duration: +m[3], contact: +m[4], hand: m[5], measured: m[6] ?? null });
}

// ---------- D3: pack files exist, flag wired, view registered ----------
const pubPath = (f) => path.join(ROOT, 'public', pack.base.replace(/^\//, ''), f);
for (const f of [pack.body, pack.library]) {
  if (fs.existsSync(pubPath(f))) ok('D3', `pack file on disk: ${f}`);
  else bad('D3', `pack file MISSING: ${pubPath(f)}`);
}
const gameSrc = src('src/views/game.js');
if (/hunterm/.test(gameSrc) && /hunter-mesh-avatar\.js/.test(gameSrc)) ok('D3', '?hunterm=1 wired in game.js');
else bad('D3', '?hunterm=1 is not wired in src/views/game.js');
if (/hunter\.animated/.test(src('src/views.js'))) ok('D3', 'hunter.animated view registered');
else bad('D3', 'hunter.animated missing from src/views.js');
if (/hunterm=1/.test(src('PLAYHUNTER.bat'))) ok('D3', 'PLAYHUNTER.bat opens with hunterm=1');
else bad('D3', 'PLAYHUNTER.bat does not pass hunterm=1');

// ---------- D1: every role clip binds onto the body skeleton ----------
const bodyG = parseGlb(pubPath(pack.body));
const libG = parseGlb(pubPath(pack.library));
const joints = new Set(bodyG.json.skins[0].joints.map((i) => bodyG.json.nodes[i].name));
for (const [role, clipName] of Object.entries(roles)) {
  const anim = libG.json.animations.find((a) => a.name === clipName);
  if (!anim) { bad('D1', `role ${role}: clip "${clipName}" absent from library`); continue; }
  const missing = new Set();
  for (const ch of anim.channels) {
    const n = libG.json.nodes[ch.target.node]?.name;
    if (!joints.has(n)) missing.add(n);
  }
  if (missing.size) bad('D1', `role ${role} / ${clipName}: tracks target no bone: ${[...missing].join(',')}`);
  else ok('D1', `role ${role} -> ${clipName} binds (${anim.channels.length} tracks on ${joints.size} joints)`);
}

// ---------- D2: contact is measured, noted, and agrees with a fresh FK pass ----------
if (swings.length < 2) bad('D2', `expected 2 HUNTER_SWINGS entries, parsed ${swings.length}`);
for (const s of swings) {
  const fresh = measureClip(libG, s.clip);
  if (!fresh) { bad('D2', `${s.role}: clip ${s.clip} not in library`); continue; }
  if (MEASURE_ONLY) {
    console.log(`  measure ${s.role}/${s.clip}: duration=${fresh.duration.toFixed(3)} contact=${fresh.contact.toFixed(3)} hand=${fresh.hand} peak=${fresh.peakHandSpeed.toFixed(1)} m/s`);
    continue;
  }
  if (!s.measured) bad('D2', `${s.role}: no measured: provenance note — an unmeasured contact is a fake swing`);
  else if (Math.abs(s.contact - 0.60) < 1e-9) bad('D2', `${s.role}: contact is the 0.60 placeholder`);
  else if (Math.abs(s.contact - fresh.contact) > CONTACT_TOL)
    bad('D2', `${s.role}: contact ${s.contact} drifted from GLB (fresh FK: ${fresh.contact.toFixed(3)})`);
  else if (Math.abs(s.duration - fresh.duration) > DUR_TOL)
    bad('D2', `${s.role}: duration ${s.duration} drifted from GLB (fresh: ${fresh.duration.toFixed(3)})`);
  else if (s.hand !== fresh.hand) bad('D2', `${s.role}: leading hand ${s.hand} != fresh ${fresh.hand}`);
  else ok('D2', `${s.role}: contact ${s.contact}s == FK ${fresh.contact.toFixed(3)}s (${s.hand})`);
}

// ---------- D4: the control that must fail ----------
if (!MEASURE_ONLY && swings.length) {
  const s = swings[0];
  const fresh = measureClip(libG, s.clip);
  const wrong = Math.abs((s.contact + 0.60) - fresh.contact) > CONTACT_TOL;
  if (wrong) ok('D4', 'control: a wrong contact IS rejected by the comparator');
  else bad('D4', 'control FAILED: comparator accepted a deliberately wrong contact — the gate is not measuring');
}

finish();
function finish() {
  console.log(failures ? `\nhunter-door: \x1b[31m${failures} FAILURE(S)\x1b[0m` : '\nhunter-door: \x1b[32mALL GREEN\x1b[0m');
  process.exit(failures ? 1 : 0);
}
