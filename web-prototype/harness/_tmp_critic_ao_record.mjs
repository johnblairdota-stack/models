// Append the AO look ruling as a `win` on each of the 5 judged pieces, WITHOUT touching their
// existing verdict/score/hates/wins/owner — this critic's brief is narrowly the AO-source look
// question, not a full re-critique of these pieces (room.study/ballroom/light.shaft/light.dark
// carry unrelated, still-open critic-estate-5 findings that must not be disturbed or replaced,
// since `status.mjs set --wins` REPLACES the array rather than appending to it).
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = 'C:/Users/John/Documents/Run Robot Run/web-prototype';
const FILE = path.join(ROOT, 'progress/status.json');

const RULING = {
  'game.play': 'AO source (perf-ao, temporal reuse vs the old depth prepass) verified pixel-equivalent by critic-ao-look-1: fresh --at 6 A/B, signed mean luma delta +0.246 on a meanA of 67.9 (0.36%), and a same-config noise-floor control (two temporal renders) measured the identical 0.246 magnitude in the opposite direction — the A/B is statistically indistinguishable from re-rendering the same build twice. Blind side-by-side confirmed no visible difference. Verdict: INDISTINGUISHABLE (no regression).',
  'room.study': 'AO source change verified by critic-ao-look-1: fresh --at 6 A/B measured signed mean luma -0.496 (-0.81%), matching the builder\'s claimed -0.484/-0.8% almost exactly. Signed-diff visualisation shows the darkening is structured — concentrated at the window arch, cornice and picture-frame moulding creases — not a uniform wash; no halo found around any alpha-tested/additive element on inspection. Verdict: BETTER (small, correct, artifact-free) — look otherwise unchanged from this piece\'s standing critique.',
  'room.ballroom': 'AO source change verified by critic-ao-look-1: fresh --at 6 A/B measured signed mean luma -1.257 (-1.80%), matching the builder\'s claimed -1.253/-1.8% almost exactly — the largest of the four rooms. Signed-diff shows the coffered ceiling grid and window/picture-frame edges gaining contact darkening while the flat wall panel between them lightens slightly, consistent with the claimed crease-vs-flat-panel mechanism. Verdict: BETTER (small, correct, artifact-free) — the standing mirror/wall-panel critique is untouched and unrelated.',
  'light.shaft': 'AO source change verified by critic-ao-look-1: fresh --at 6 A/B measured signed mean luma -0.539 (-0.89%), matching the builder\'s claimed -0.533/-0.9% almost exactly. This is the view with the clearest mechanism confirmation: the diff hotspot is a wedge bounded exactly by the light shaft\'s own silhouette on the wall/ceiling — the old prepass\'s false-occluder artifact at the shaft\'s edge, gone in the new build. Dust motes and the shaft volume itself show no halo/smear under a tight crop. Verdict: BETTER (small, correct, artifact-free) — the stained-glass colour critique is untouched and unrelated.',
  'light.dark': 'AO source change verified by critic-ao-look-1: fresh --at 6 A/B measured signed mean luma -0.020, matching the builder\'s claimed -0.023 closely (smallest of the four rooms, as claimed — darkest scene, least AO to change). No halo found around the candelabra\'s additive flame glow on a tight crop. Verdict: INDISTINGUISHABLE (negligible, artifact-free, correct direction) — the standing "corridor is one flat plane" critique is untouched and unrelated.',
};

async function main() {
  const raw = await readFile(FILE, 'utf8');
  const data = JSON.parse(raw);
  const stamp = new Date().toISOString();
  for (const [id, note] of Object.entries(RULING)) {
    const p = data.pieces[id];
    if (!p) { console.error(`missing piece ${id}`); continue; }
    p.wins ??= [];
    const tag = 'AO look ruling (critic-ao-look-1, perf-ao): ';
    // idempotent: don't duplicate if this script is re-run
    if (p.wins.some((w) => w.startsWith(tag))) { console.log(`${id}: already recorded, skipping`); continue; }
    p.wins.push(tag + note);
    p.updatedAt = stamp;
    console.log(`${id}: win appended (${p.wins.length} total)`);
  }
  data.log ??= [];
  data.log.unshift({ at: stamp, note: 'critic-ao-look-1: AO temporal-vs-prepass look ruling recorded as wins on game.play/room.study/room.ballroom/light.shaft/light.dark — see each piece\'s wins array. Verdict/score/hates untouched (out of this critic\'s scope).' });
  if (data.log.length > 250) data.log.length = 250;

  const tmp = FILE + '.' + process.pid + '.tmp';
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, FILE);
  console.log('saved.');
}

await main();
