/*
 * builder-head: WHERE THE HEAD'S VENT WINDOW ACTUALLY LANDS, IN METRES.
 *
 * The vent panel is placed by a fraction t = aBoneEnd.x / boneLength along the Head bone's axis,
 * and Head is a FORKED bone: `boneAxisTable` in mesh-avatar.js derives its axis as the MEAN of
 * head_end and headfront, so that axis points UP AND FORWARD at once. A band of constant t is a
 * plane perpendicular to THAT, which sweeps up the jaw and across the temple rather than sitting
 * on the occiput. The window (-0.05, 0.02, 0.30, 0.46) was set by eye against it.
 *
 * Guessing a replacement would be the same mistake again, so measure it: pull the head-dominant
 * vertices out of the live skinned geometry, and for each one report t beside its position in the
 * HEAD's own frame — up, and forward — plus the head weight the clean mask sees. Then a window is
 * chosen from the table rather than from an idea about which way the axis points.
 *
 * The table is printed two ways:
 *   - t binned, with the mean up/forward of each bin, which shows what a constant-t band selects
 *   - the occiput selected DIRECTLY in the head frame (back-facing, below the crown) with its own
 *     t distribution printed, which is the window to author
 *
 * usage: node harness/evidence/_head4-vent.mjs [port] [azim]
 */
import { chromium } from 'playwright';

const PORT = process.argv[2] ?? '5192';
const AZIM = process.argv[3] ?? '180';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${PORT}/?view=mesh.animated&capture=1&solo=1&clip=merged`
  + `&anim=Alert&label=0&azim=${AZIM}&bg=ff00ff`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__rrr?.engine || window.__rrrError, null, { timeout: 240000 });
await page.evaluate(() => window.__rrr.settle(20));

const r = await page.evaluate(async () => {
  const e = window.__rrr.engine;
  let mesh = null;
  e.scene.traverse((n) => { if (n.isSkinnedMesh && n.geometry?.getAttribute('aBoneId') && !mesh) mesh = n; });
  if (!mesh) return { err: 'no skinned mesh carrying aBoneId' };
  const g = mesh.geometry;
  const aId = g.getAttribute('aBoneId'), aEnd = g.getAttribute('aBoneEnd');
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
  const si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
  if (!aId || !aEnd) return { err: 'aBoneId/aBoneEnd missing' };

  // The head bone index, taken the same way the shader is told it: the material's own uniform.
  const uni = mesh.material.userData.weathering;
  const headBone = uni?.uRRWHeadBone?.value;
  const skel = mesh.skeleton;
  const bone = skel.bones[headBone];
  if (!bone) return { err: `uRRWHeadBone=${headBone} is not a bone` };

  // The HEAD's own frame at bind time: up and forward taken from the bone's world matrix, so the
  // table does not depend on which way the character happens to be facing in this capture.
  /*
   * ⚠️ EVERYTHING HERE IS IN BIND (MESH-LOCAL) SPACE, AND THE FIRST VERSION OF THIS PROBE WAS IN
   * WORLD SPACE AND RETURNED GARBAGE — every head vertex reported the same position to within
   * 3 mm on a 20 cm skull. `position` is the BIND pose; a skinned mesh's own matrixWorld does not
   * place it, and the animated bone.matrixWorld is in a different frame again, so mixing the two
   * subtracted a live bone origin from a bind-pose vertex and left a constant. Bind space is the
   * frame `aBoneEnd` was authored in, so it is the frame the window has to be chosen in.
   *
   * A bone's bind matrix in mesh space is the inverse of skeleton.boneInverses[i], which is the
   * only bind-time bone frame three keeps.
   */
  const V3 = bone.position.constructor;
  const M4 = mesh.matrixWorld.constructor;
  const bindOf = (i) => new M4().copy(skel.boneInverses[i]).invert();
  const posOf = (i) => new V3().setFromMatrixPosition(bindOf(i));
  const org = posOf(headBone);

  /*
   * THE FORK, NAMED. Head has two children and that is the whole bug: boneAxisTable averages
   * them, so "a fraction along the head" is a fraction along a direction that points up AND
   * forward. Recovering the two children separately gives an honest UP (head -> the crown child)
   * and an honest FORWARD (head -> the face child), which is what the window has to be read in.
   * Falls back to the rig's own hips->head direction for up if the children cannot be named.
   */
  const kids = [];
  for (let i = 0; i < skel.bones.length; i++) if (skel.bones[i].parent === bone) kids.push(i);
  const nm = (i) => skel.bones[i].name;
  const isFront = (i) => /front|face|nose|jaw/i.test(nm(i));
  const frontI = kids.find(isFront);
  const endI = kids.find((i) => !isFront(i));
  let up = null, fwd = null;
  if (endI != null) up = posOf(endI).sub(org).normalize();
  if (frontI != null) fwd = posOf(frontI).sub(org).normalize();
  if (!up) {
    const hips = skel.bones.findIndex((b) => /hip|pelvis|root/i.test(b.name));
    up = hips >= 0 ? org.clone().sub(posOf(hips)).normalize() : new V3(0, 1, 0);
  }
  if (!fwd) fwd = new V3(0, 0, 1);
  // Orthogonalise forward against up so "up" and "forward" are independent readings rather than
  // two nearly-parallel numbers.
  fwd = fwd.clone().sub(up.clone().multiplyScalar(fwd.dot(up)));
  if (fwd.lengthSq() < 1e-9) fwd = new V3(0, 0, 1); else fwd.normalize();
  const mean = up.clone().add(frontI != null ? posOf(frontI).sub(org).normalize() : up).normalize();

  const rows = [];
  const P = new V3(), N = new V3();
  for (let v = 0; v < pos.count; v++) {
    if (Math.round(aId.getX(v)) !== headBone) continue;
    const ex0 = aEnd.getX(v), ey0 = aEnd.getY(v), len = ex0 + ey0;
    if (len <= 1e-4) continue;
    P.fromBufferAttribute(pos, v);
    N.fromBufferAttribute(nor, v);
    let hw = 0;
    for (const c of ['X', 'Y', 'Z', 'W']) {
      if (Math.round(si[`get${c}`](v)) === headBone) hw += sw[`get${c}`](v);
    }
    const d = P.clone().sub(org);
    rows.push({
      t: Math.min(1, Math.max(0, ex0 / len)),
      // ⚠️ THE UNCLAMPED FRACTION, which is what RRW_BONE_VERT throws away. On a forward-leaning
      // mean axis the whole occiput projects behind the proximal joint and goes NEGATIVE; the
      // clamp collapses all of it onto 0 and destroys the only coordinate that could bound the
      // panel from above. tRaw is the same number before that happens.
      tRaw: ex0 / len,
      up: d.dot(up), fwd: d.dot(fwd),
      back: -N.dot(fwd), hw,
    });
  }
  return {
    headBone, n: rows.length,
    kidNames: kids.map(nm), endName: endI != null ? nm(endI) : null,
    frontName: frontI != null ? nm(frontI) : null,
    up: [up.x, up.y, up.z], fwd: [fwd.x, fwd.y, fwd.z], mean: [mean.x, mean.y, mean.z],
    rows,
  };
});

await browser.close();
if (r.err) { console.log(r.err); process.exit(1); }
const rows = r.rows;
console.log(`\n  headBone=${r.headBone}  head-dominant vertices=${r.n}`);
console.log(`  Head children: ${JSON.stringify(r.kidNames)}   crown-child=${r.endName}  face-child=${r.frontName}`);
console.log(`  headUp=${r.up.map((v) => v.toFixed(3))}  headFwd=${r.fwd.map((v) => v.toFixed(3))}`);
console.log(`  MEAN axis (what boneAxisTable gives t) = ${r.mean.map((v) => v.toFixed(3))}`);

const stat = (arr, key) => {
  if (!arr.length) return '   --';
  const s = arr.map((a) => a[key]).sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return `${q(0.05).toFixed(3)}..${q(0.95).toFixed(3)} (med ${q(0.5).toFixed(3)})`;
};

console.log('\n  -- what a constant-t band selects --');
console.log('   t bin      n   up (m, + = above the neck joint)   fwd (m, + = toward the face)   meanHeadWt');
for (let b = 0; b < 10; b++) {
  const lo = b / 10, hi = (b + 1) / 10;
  const sel = rows.filter((a) => a.t >= lo && a.t < hi);
  if (!sel.length) { console.log(`   ${lo.toFixed(1)}-${hi.toFixed(1)}  (none)`); continue; }
  const m = (k) => (sel.reduce((s, a) => s + a[k], 0) / sel.length).toFixed(3);
  console.log(`   ${lo.toFixed(1)}-${hi.toFixed(1)} ${String(sel.length).padStart(6)}   up ${m('up').padStart(7)}   ${stat(sel, 'up')}   fwd ${m('fwd').padStart(7)}   ${m('hw')}`);
}

// The occiput, selected in the head frame rather than by t: back-facing, and below the crown.
const crown = Math.max(...rows.map((a) => a.up));
console.log(`\n  crown is ${crown.toFixed(3)} m above the neck joint`);
for (const [label, sel] of [
  ['occiput  (back-facing >0.5, up < 45% of crown)', rows.filter((a) => a.back > 0.5 && a.up < crown * 0.45)],
  ['occiput  (back-facing >0.5, up < 60% of crown)', rows.filter((a) => a.back > 0.5 && a.up < crown * 0.60)],
  ['temple   (back < 0.2, up 30-70% of crown)', rows.filter((a) => a.back < 0.2 && a.up > crown * 0.30 && a.up < crown * 0.70)],
]) {
  console.log(`\n  ${label}   n=${sel.length}`);
  console.log(`     t   ${stat(sel, 't')}`);
  console.log(`     up  ${stat(sel, 'up')}`);
  console.log(`     hw  ${stat(sel, 'hw')}`);
}

/*
 * DOES THE UNCLAMPED FRACTION SEPARATE THE BACK OF THE SKULL BY HEIGHT? This is the question the
 * clamped t cannot answer. Bin the BACK-FACING vertices by height above the neck joint and print
 * tRaw for each band: if tRaw falls monotonically as the band rises, a window in tRaw is a real
 * vertical bound and the panel can be placed with it.
 */
const backRows = rows.filter((a) => a.back > 0.4);
console.log(`\n  -- back-facing vertices (n=${backRows.length}) binned by HEIGHT, showing tRaw --`);
console.log('   up / crown        n     tRaw (5..95 pct, median)              t (clamped)      headWt');
for (let b = 0; b < 5; b++) {
  const lo = b / 5, hi = (b + 1) / 5;
  const sel = backRows.filter((a) => a.up >= crown * lo && a.up < crown * hi);
  if (!sel.length) { console.log(`   ${lo.toFixed(1)}-${hi.toFixed(1)}  (none)`); continue; }
  const m = (k) => (sel.reduce((s, a) => s + a[k], 0) / sel.length).toFixed(3);
  console.log(`   ${lo.toFixed(1)}-${hi.toFixed(1)} ${String(sel.length).padStart(7)}   ${stat(sel, 'tRaw').padEnd(34)} ${stat(sel, 't').padEnd(16)} ${m('hw')}`);
}

// What the SHIPPING window (-0.05,0.02,0.30,0.46) actually covers.
const inWin = rows.filter((a) => a.t > 0.02 && a.t < 0.30);
console.log(`\n  the shipping window t in (0.02, 0.30) covers n=${inWin.length}`);
console.log(`     up  ${stat(inWin, 'up')}   (crown ${crown.toFixed(3)})`);
console.log(`     back ${stat(inWin, 'back')}`);
console.log(`     hw  ${stat(inWin, 'hw')}    <- head weight; the clean mask multiplies these features by 1 - smoothstep(0.25,0.75,hw)`);
console.log('');
