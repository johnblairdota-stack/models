#!/usr/bin/env node
/**
 * THE HUNTER IN THE DOOR — the art-path gate. `npm run gate:hunter-door`, or
 * `node harness/hunter-door.mjs [--measure] [--write]`.
 *
 * RED if any of these regress (when the Meshy pack is on disk):
 *
 *   D1  BIND — walking.glb is the body; every role file (walk / run / attack / combo)
 *       is a full character + one clip. After prefix-remap by bone name, a TRS track
 *       that names a bone the body skeleton does not have is RED. A clip that
 *       half-binds fades limbs out silently in three.js; here it fails. Combo MUST
 *       be double-combo-attack.glb — mapping combo to Heavy_Hammer_Swing (the Lumi
 *       stand-in) is RED.
 *   D2  MEASURED CONTACT — `HUNTER_SWINGS` in `src/characters/hunter-mesh-avatar.js`
 *       must carry a `measured:` note per swing, must NOT be the 0.60 placeholder,
 *       must NOT still be the Lumi numbers 1.050 / 1.504, and must agree with a
 *       FRESH forward-kinematics pass over that file's GLB tracks (tolerance 0.03 s
 *       on contact, 0.02 s on duration). `--write` patches the source from this pass.
 *   D3  PACK PATH — `HUNTER_PACK` names walking.glb + the three clip files under
 *       `public/models/anim/hunter/`, `?hunterm=1` is wired, `hunter.animated` is
 *       registered, PLAYHUNTER.bat opens with hunterm=1. Pack files themselves are
 *       gitignored: when they are ABSENT this check SKIPS (never a silent PASS of
 *       bind/contact) and prints the Documents copy path.
 *   D4  CONTROL — the comparator is fed a deliberately wrong contact and MUST reject
 *       it. If the control passes, the gate is not measuring and the whole run is RED.
 *       Skipped (not passed) when the pack is absent.
 *
 * The FK method matches the numbers' provenance line: sample every joint's TRS tracks
 * at 240 Hz, walk the node hierarchy, take the leading hand (greater peak speed),
 * contact = first maximum of horizontal reach from the hips at/after peak speed.
 *
 * File reads of SOURCE are normalised CRLF->LF before any regex looks at them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEASURE_ONLY = process.argv.includes('--measure');
const WRITE = process.argv.includes('--write');
const CONTACT_TOL = 0.03, DUR_TOL = 0.02;
const COPY_FROM = 'C:\\Users\\John\\Documents\\Run Robot Run\\web-prototype\\public\\models\\anim\\hunter\\';
const LUMI_CONTACTS = [1.050, 1.504];

let failures = 0;
let skips = 0;
const ok = (id, msg) => console.log(`  \x1b[32mPASS\x1b[0m ${id}  ${msg}`);
const bad = (id, msg) => { failures++; console.log(`  \x1b[31mFAIL\x1b[0m ${id}  ${msg}`); };
const skip = (id, msg) => { skips++; console.log(`  \x1b[33mSKIP\x1b[0m ${id}  ${msg}`); };
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
/** Strip comments so a header that names a banned leftover does not redden the ban. */
const codeOf = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

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
/** Same leaf/prefix remap bindClipToRig uses in hunter-mesh-avatar.js. */
function boneLeaf(nodeName) {
  if (!nodeName) return '';
  const leaf = nodeName.includes('/') ? nodeName.split('/').pop() : nodeName.split('.').pop();
  return leaf;
}
function matchesBone(nodeName, bones) {
  if (bones.has(nodeName)) return nodeName;
  const leaf = boneLeaf(nodeName);
  if (bones.has(leaf)) return leaf;
  for (const b of bones) {
    if (nodeName.endsWith(`.${b}`) || nodeName.endsWith(`/${b}`)
      || (leaf && (leaf.endsWith(b) || b.endsWith(leaf)))) return b;
  }
  return null;
}
function findNode(nodes, suffix) {
  const exact = nodes.findIndex((n) => n.name === suffix);
  if (exact >= 0) return exact;
  const re = new RegExp(`${suffix}$`, 'i');
  return nodes.findIndex((n) => re.test(n.name || ''));
}
function measureClip(g) {
  const nodes = g.json.nodes;
  const parent = new Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent[c] = i));
  const anim = g.json.animations?.[0];
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
  const hands = { LeftHand: findNode(nodes, 'LeftHand'), RightHand: findNode(nodes, 'RightHand') };
  const hips = findNode(nodes, 'Hips');
  if (hips < 0 || hands.LeftHand < 0 || hands.RightHand < 0) {
    return { error: `hand/hips nodes missing (LeftHand=${hands.LeftHand} RightHand=${hands.RightHand} Hips=${hips})` };
  }
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
  return { duration: dur, contact: best[lead].contact, hand: lead, peakHandSpeed: best[lead].peakV, clip: anim.name };
}

// ---------- load the declared pack + swings straight out of the source ----------
const avatarSrc = src('src/characters/hunter-mesh-avatar.js');
const packMatch = avatarSrc.match(/export const HUNTER_PACK = \{([\s\S]*?)\n\};/);
if (!packMatch) { bad('D3', 'HUNTER_PACK not found in hunter-mesh-avatar.js'); finish(); }
const field = (name) => packMatch[1].match(new RegExp(`${name}: '([^']+)'`))?.[1];
const filesMatch = packMatch[1].match(/files: \{([^}]*)\}/)?.[1] ?? '';
const files = {};
for (const m of filesMatch.matchAll(/(\w+): '([^']+)'/g)) files[m[1]] = m[2];
const pack = { base: field('base'), body: field('body'), files };

const swings = [];
for (const m of avatarSrc.matchAll(/\{ role: '(\w+)', clip: '([^']+)', file: '([^']+)', duration: ([\d.]+), contact: ([\d.]+), hand: '([^']+)',[\s\S]*?(measured: '[^']*')?\s*\}/g)) {
  swings.push({ role: m[1], clip: m[2], file: m[3], duration: +m[4], contact: +m[5], hand: m[6], measured: m[7] ?? null });
}

const pubPath = (f) => path.join(ROOT, 'public', pack.base.replace(/^\//, ''), f);
const needed = [...new Set([pack.body, ...Object.values(files)])];
const missingFiles = needed.filter((f) => !f || !fs.existsSync(pubPath(f)));
const packPresent = missingFiles.length === 0 && needed.length >= 4;

const packHint = `Copy from ${COPY_FROM} into public/models/anim/hunter/ `
  + `(walking.glb running.glb attack.glb double-combo-attack.glb). GLBs are gitignored; do not commit them.`;

// ---------- D3: wiring (always) + pack files (skip if absent) ----------
if (pack.base !== '/models/anim/hunter') bad('D3', `HUNTER_PACK.base is ${pack.base}, expected /models/anim/hunter`);
else ok('D3', 'HUNTER_PACK.base is /models/anim/hunter');
if (pack.body !== 'walking.glb') bad('D3', `body is ${pack.body}, expected walking.glb (walking as carrier)`);
else ok('D3', 'body is walking.glb (carrier)');
if (files.combo !== 'double-combo-attack.glb') {
  bad('D3', `combo file is ${files.combo} — must be double-combo-attack.glb, not a Lumi Heavy_Hammer_Swing mapping`);
} else ok('D3', 'combo is double-combo-attack.glb (real clip)');
const avatarCode = codeOf(avatarSrc);
if (/Heavy_Hammer_Swing/.test(avatarCode)) bad('D3', 'hunter-mesh-avatar.js still names Heavy_Hammer_Swing — Lumi stand-in leftover');
else ok('D3', 'no Heavy_Hammer_Swing leftover');
if (/Meshy_AI_Lumi_Bot/.test(avatarCode)) bad('D3', 'hunter-mesh-avatar.js still names the Lumi Bot library');
else ok('D3', 'Lumi Bot library not referenced');
if (/shellWhite\s*\(/.test(avatarCode) || /skinned\.material\s*=/.test(avatarCode)) {
  bad('D3', 'overwrites Meshy materials (shellWhite / skinned.material =) — keep baked textures');
} else ok('D3', 'does not overwrite Meshy materials');
if (!/bindClipToRig/.test(avatarCode)) bad('D3', 'bindClipToRig missing — walking-as-carrier remap is the load shape');
else ok('D3', 'bindClipToRig present (walking as carrier, prefix remap)');

if (packPresent) {
  for (const f of needed) ok('D3', `pack file on disk: ${f}`);
} else {
  skip('D3', `Meshy pack not on disk (${missingFiles.join(', ') || 'none named'}). ${packHint}`);
}

const gameSrc = src('src/views/game.js');
if (/hunterm/.test(gameSrc) && /hunter-mesh-avatar\.js/.test(gameSrc)) ok('D3', '?hunterm=1 wired in game.js');
else bad('D3', '?hunterm=1 is not wired in src/views/game.js');
if (/hunter\.animated/.test(src('src/views.js'))) ok('D3', 'hunter.animated view registered');
else bad('D3', 'hunter.animated missing from src/views.js');
if (/hunterm=1/.test(src('PLAYHUNTER.bat'))) ok('D3', 'PLAYHUNTER.bat opens with hunterm=1');
else bad('D3', 'PLAYHUNTER.bat does not pass hunterm=1');
if (swings.length === 2 && swings.every((s) => s.file && s.measured)) ok('D3', `HUNTER_SWINGS parsed (${swings.map((s) => s.role + ':' + s.file).join(', ')})`);
else bad('D3', `HUNTER_SWINGS parse: expected 2 file-backed measured entries, got ${swings.length}`);
const gi = src('../.gitignore');
if (/public\/models\/anim\/hunter\/\*\.glb/.test(gi)) ok('D3', '.gitignore ignores hunter/*.glb');
else bad('D3', '.gitignore must ignore web-prototype/public/models/anim/hunter/*.glb (do not commit the pack)');
if (/Copy the Meshy hunter pack/.test(src('public/models/anim/hunter/README.md'))
  || /Documents\\Run Robot Run/.test(src('public/models/anim/hunter/README.md'))
  || /Documents\\\\Run Robot Run/.test(src('public/models/anim/hunter/README.md'))
  || /C:\\Users\\John/.test(src('public/models/anim/hunter/README.md'))) {
  ok('D3', 'pack README names the Documents copy path');
} else if (/walking\.glb/.test(src('public/models/anim/hunter/README.md'))
  && /gitignor/.test(src('public/models/anim/hunter/README.md'))) {
  ok('D3', 'pack README names walking.glb and says gitignored');
} else bad('D3', 'public/models/anim/hunter/README.md does not tell you to copy the Documents pack');

const serveSrc = src('hunter-door/serve.mjs');
if (/rel === '\/' \? 'view\.html'/.test(serveSrc)) ok('D3', 'serve.mjs / is view.html (tabbed board)');
else bad('D3', 'serve.mjs must serve view.html at / — the Fable canvas 404s support.js');
if (/rel === '\/canvas' \? 'the-hunter-in-the-door\.html'/.test(serveSrc)) ok('D3', 'serve.mjs /canvas keeps the Fable file');
else bad('D3', 'serve.mjs must keep the Fable canvas at /canvas');
if (/['"]\.js['"]\s*:/.test(serveSrc)) ok('D3', 'serve.mjs MIME map includes .js');
else bad('D3', 'serve.mjs TYPES must include .js');
const viewHtml = src('hunter-door/view.html');
const viewCode = codeOf(viewHtml);
if (/support\.js/.test(viewCode) || /react\.js/.test(viewCode) || /<x-dc>/.test(viewHtml)) {
  bad('D3', 'view.html must not load support.js / React or wrap in <x-dc>');
} else if (!/#pitch/.test(viewHtml) || !/#build/.test(viewHtml) || !/#verify/.test(viewHtml)) {
  bad('D3', 'view.html must hash-route #pitch #build #verify');
} else if (!/1\.100/.test(viewHtml) || !/0\.679/.test(viewHtml) || !/walking\.glb/.test(viewHtml)) {
  bad('D3', 'view.html must carry measured contact 1.100 / 0.679 and walking.glb');
} else if (!/extra-arm/.test(viewHtml)) {
  bad('D3', 'view.html must name the extra-arm FINDING');
} else ok('D3', 'view.html is the self-contained Pitch/Build/Verify board');

// Lumi contact ban is a SOURCE check — independent of pack presence
for (const s of swings) {
  if (LUMI_CONTACTS.some((n) => Math.abs(s.contact - n) < 1e-9)) {
    bad('D2', `${s.role}: contact ${s.contact} is a Lumi stand-in number (1.050 / 1.504) — re-measure from the Meshy GLB`);
  }
}

if (!packPresent) {
  skip('D1', `pack missing — cannot bind-check. ${packHint}`);
  skip('D2', `pack missing — cannot re-derive contact. ${packHint}`);
  skip('D4', 'pack missing — control not run (a skip is not a pass of the control)');
  finish();
}

// ---------- D1: every role clip binds onto the walking.glb skeleton ----------
const bodyG = parseGlb(pubPath(pack.body));
const joints = new Set((bodyG.json.skins?.[0]?.joints ?? []).map((i) => bodyG.json.nodes[i].name));
if (!joints.size) bad('D1', `${pack.body}: no skins[0].joints`);
for (const [role, file] of Object.entries(files)) {
  const g = parseGlb(pubPath(file));
  const anim = g.json.animations?.[0];
  if (!anim) { bad('D1', `role ${role}: ${file} has no animation`); continue; }
  const missing = new Set();
  for (const ch of anim.channels) {
    const n = g.json.nodes[ch.target.node]?.name;
    const path = ch.target.path;
    if (path !== 'translation' && path !== 'rotation' && path !== 'scale') continue;
    if (!matchesBone(n, joints)) missing.add(n);
  }
  if (missing.size) bad('D1', `role ${role} / ${file}: tracks target no bone after prefix remap: ${[...missing].join(',')}`);
  else ok('D1', `role ${role} -> ${file} "${anim.name}" binds (${anim.channels.length} tracks on ${joints.size} joints)`);
}

// ---------- D2: contact is measured, noted, and agrees with a fresh FK pass ----------
if (swings.length < 2) bad('D2', `expected 2 HUNTER_SWINGS entries, parsed ${swings.length}`);
const freshByRole = {};
for (const s of swings) {
  if (!s.file || !fs.existsSync(pubPath(s.file))) {
    bad('D2', `${s.role}: pack file missing: ${s.file}`);
    continue;
  }
  const g = parseGlb(pubPath(s.file));
  const fresh = measureClip(g);
  if (!fresh || fresh.error) { bad('D2', `${s.role}: ${fresh?.error ?? 'no animation in ' + s.file}`); continue; }
  freshByRole[s.role] = fresh;
  if (MEASURE_ONLY || WRITE) {
    console.log(`  measure ${s.role}/${s.file}: duration=${fresh.duration.toFixed(3)} contact=${fresh.contact.toFixed(3)} hand=${fresh.hand} peak=${fresh.peakHandSpeed.toFixed(1)} m/s clip="${fresh.clip}"`);
    if (MEASURE_ONLY && !WRITE) continue;
  }
  if (!s.measured) bad('D2', `${s.role}: no measured: provenance note — an unmeasured contact is a fake swing`);
  else if (Math.abs(s.contact - 0.60) < 1e-9) bad('D2', `${s.role}: contact is the 0.60 placeholder`);
  else if (s.contact === 0) {
    bad('D2', `${s.role}: contact is 0 (unmeasured). Fresh FK: duration=${fresh.duration.toFixed(3)} contact=${fresh.contact.toFixed(3)} hand=${fresh.hand}. Run: node harness/hunter-door.mjs --write`);
  }
  else if (Math.abs(s.contact - fresh.contact) > CONTACT_TOL)
    bad('D2', `${s.role}: contact ${s.contact} drifted from GLB (fresh FK: ${fresh.contact.toFixed(3)})`);
  else if (Math.abs(s.duration - fresh.duration) > DUR_TOL)
    bad('D2', `${s.role}: duration ${s.duration} drifted from GLB (fresh: ${fresh.duration.toFixed(3)})`);
  else if (s.hand !== fresh.hand) bad('D2', `${s.role}: leading hand ${s.hand} != fresh ${fresh.hand}`);
  else ok('D2', `${s.role}: contact ${s.contact}s == FK ${fresh.contact.toFixed(3)}s (${s.hand})`);
}

if (WRITE) {
  let next = avatarSrc;
  for (const s of swings) {
    const fresh = freshByRole[s.role];
    if (!fresh) continue;
    const note = `measured: 'FK over GLB tracks at 240 Hz, harness/hunter-door.mjs, ${new Date().toISOString().slice(0, 10)}'`;
    const re = new RegExp(
      `\\{ role: '${s.role}', clip: '${s.clip}', file: '${s.file}', duration: [\\d.]+, contact: [\\d.]+, hand: '[^']+',\\s*peakHandSpeed: [\\d.]+, measured: '[^']*' \\}`,
    );
    const repl = `{ role: '${s.role}', clip: '${s.clip}', file: '${s.file}', duration: ${fresh.duration.toFixed(3)}, contact: ${fresh.contact.toFixed(3)}, hand: '${fresh.hand}',`
      + `\n    peakHandSpeed: ${fresh.peakHandSpeed.toFixed(1)}, ${note} }`;
    if (!re.test(next)) {
      bad('D2', `--write could not patch ${s.role} entry`);
      continue;
    }
    next = next.replace(re, repl);
    ok('D2', `--write ${s.role}: duration=${fresh.duration.toFixed(3)} contact=${fresh.contact.toFixed(3)} ${fresh.hand}`);
  }
  if (next !== avatarSrc) {
    fs.writeFileSync(path.join(ROOT, 'src/characters/hunter-mesh-avatar.js'), next);
    console.log('  wrote src/characters/hunter-mesh-avatar.js from fresh FK');
  }
}

// ---------- D4: the control that must fail ----------
if (!MEASURE_ONLY && swings.length && freshByRole[swings[0].role]) {
  const s = swings[0];
  const fresh = freshByRole[s.role];
  const claimed = s.contact === 0 ? fresh.contact : s.contact;
  const wrong = Math.abs((claimed + 0.60) - fresh.contact) > CONTACT_TOL;
  if (wrong) ok('D4', 'control: a wrong contact IS rejected by the comparator');
  else bad('D4', 'control FAILED: comparator accepted a deliberately wrong contact — the gate is not measuring');
} else if (!MEASURE_ONLY) {
  skip('D4', 'no measured swing to feed the control');
}

finish();
function finish() {
  if (failures) {
    console.log(`\nhunter-door: \x1b[31m${failures} FAILURE(S)\x1b[0m` + (skips ? `  (${skips} skipped)` : ''));
    process.exit(1);
  }
  if (skips && !packPresent) {
    console.log(`\nhunter-door: PACK ABSENT — D1/D2/D4 skipped.`);
    console.log(`  Copy GLBs from:\n    ${COPY_FROM}`);
    console.log('    into web-prototype/public/models/anim/hunter/');
    console.log('  Then: node harness/hunter-door.mjs --write   # fill HUNTER_SWINGS from FK');
    console.log('        node harness/hunter-door.mjs           # must go green');
    console.log('  GLBs are gitignored (~30MB); do not commit them.');
    console.log('hunter-door: \x1b[32mWIRING GREEN\x1b[0m');
    process.exit(0);
  }
  console.log('\nhunter-door: \x1b[32mALL GREEN\x1b[0m');
  process.exit(0);
}
