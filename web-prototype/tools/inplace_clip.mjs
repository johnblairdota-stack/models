#!/usr/bin/env node
/**
 * MAKE A CLIP STAY ON THE SPOT — strip the horizontal root motion, keep the vertical.
 *
 *   node tools/inplace_clip.mjs --in <glb> --out <glb> [--clip <name>] [--rename <name>]
 *
 * WHY. The game moves the character; the clip must not. Meshy's Text-to-Motion reads "stays on
 * the same spot" as a suggestion — the wall swing it generated measured **28.2% of body height of
 * drift** on `harness/_anim_check.mjs`, which is the same fault as the ground chops it was made
 * to replace. The motion itself is fine: the feet plant, the hammer arrives at chest height. It
 * is the ROOT that walks.
 *
 * ⚠️ X AND Z ONLY. Y IS THE PERFORMANCE. A swing drops its weight — the hips fall several
 * centimetres through the strike and rise on the recovery — and a strip that flattened Y as well
 * would take the effort out of the animation and leave a figure gliding through a blow. Only the
 * horizontal components are pinned, and they are pinned to the value at t=0 rather than to zero,
 * so a rig whose hips do not rest over the origin is not yanked sideways on the first frame.
 *
 * ⚠️ ROTATION IS UNTOUCHED, DELIBERATELY. The hips genuinely turn through a swing; that is where
 * the power comes from. `_anim_check.mjs` reports it as `tilt` and the clip CLASS decides whether
 * it convicts — see the class table in that file's header.
 *
 * CONTROL THAT MUST FAIL: `--control-noop` copies the file without touching the track. The drift
 * measurement afterwards must then be unchanged; if it improves anyway, the improvement is coming
 * from somewhere else and this tool is not what fixed it.
 */
import fs from 'node:fs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i < 0 ? d : argv[i + 1]; };
const IN = flag('--in'), OUT = flag('--out');
const WANT = flag('--clip', null), RENAME = flag('--rename', null);
const NOOP = argv.includes('--control-noop');
if (!IN || !OUT) { console.error('need --in and --out'); process.exit(2); }

const buf = fs.readFileSync(IN);
if (buf.readUInt32LE(0) !== 0x46546c67) { console.error('not a GLB'); process.exit(2); }
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const binHeader = buf.slice(20 + jsonLen, 20 + jsonLen + 8);
const bin = Buffer.from(buf.slice(20 + jsonLen + 8));   // copied: it is written in place below

const clips = json.animations ?? [];
const clip = WANT ? clips.find((a) => a.name === WANT) : clips[0];
if (!clip) { console.error(`no clip ${WANT ?? '(first)'} — file has: ${clips.map((a) => a.name)}`); process.exit(3); }

/** The root bone: the node every other joint hangs off. Named, then checked against the skin. */
const nodes = json.nodes ?? [];
const rootIdx = nodes.findIndex((n) => /hips|pelvis|root/i.test(n.name ?? ''));
if (rootIdx < 0) { console.error('no hips/pelvis node'); process.exit(4); }

const chan = clip.channels.find((c) => c.target.node === rootIdx && c.target.path === 'translation');
if (!chan) { console.error(`clip "${clip.name}" has no translation track on ${nodes[rootIdx].name}`); process.exit(5); }

const acc = json.accessors[clip.samplers[chan.sampler].output];
if (acc.type !== 'VEC3' || acc.componentType !== 5126) {
  console.error(`root translation is ${acc.type}/${acc.componentType}, expected VEC3/float`);
  process.exit(6);
}
const bv = json.bufferViews[acc.bufferView];
const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
const stride = bv.byteStride ?? 12;

let moved = 0;
const x0 = bin.readFloatLE(base), z0 = bin.readFloatLE(base + 8);
for (let i = 0; i < acc.count; i++) {
  const o = base + i * stride;
  const dx = bin.readFloatLE(o) - x0, dz = bin.readFloatLE(o + 8) - z0;
  moved = Math.max(moved, Math.hypot(dx, dz));
  if (NOOP) continue;
  bin.writeFloatLE(x0, o);
  bin.writeFloatLE(z0, o + 8);
}
if (RENAME) clip.name = RENAME;

let js = Buffer.from(JSON.stringify(json), 'utf8');
while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
const head = Buffer.alloc(12);
head.write('glTF', 0); head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
const jch = Buffer.alloc(8); jch.writeUInt32LE(js.length, 0); jch.write('JSON', 4);
fs.writeFileSync(OUT, Buffer.concat([head, jch, js, binHeader, bin]));

console.log(`  ${NOOP ? 'CONTROL (no edit): ' : ''}clip "${clip.name}" on ${nodes[rootIdx].name}: ` +
  `${acc.count} keys, root travelled ${moved.toFixed(3)} m horizontally` +
  `${NOOP ? ' and still does' : ' — pinned'}`);
console.log(`  wrote ${OUT}`);
