import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { studio, labels } from './_studio.js';
import { buildUnit4H } from '../characters/unit4h.js';
import { attachIdentity } from '../characters/mesh-identity.js';
import { chromeDarkPanels, attachWordmarkOnly } from '../characters/mesh-avatar.js';
import { unit4hMaterials, brandReady } from '../materials/surfaces/robot.js';
import { fitCamera } from './hunter-stage.js';

/**
 * EVERY PLAYER ROBOT WE HAVE BUILT, ON ONE GROUND LINE.
 *
 * John asked for the new generated character "in game in a slice with each robot we have built
 * in iteration so far". The point of putting them in ONE frame rather than four captures is the
 * same one `wall.sheet` and `mesh.compare` exist for: a lineage cannot be judged from separate
 * screenshots taken under different cameras. One ground plane, one light rig, one scale.
 *
 * ⚠️ THE THREE ENTRIES ARE THE THREE DISTINCT ROBOTS, NOT EVERY FILE ON DISK.
 * `player_unwrapped`, `player_smooth` and `player_norm30` are the SAME Lumi Bot body — a
 * re-unwrap and a normal-merge apart — and `player_bf65` is a documented dead end kept only as a
 * diagnostic. Standing four near-identical Lumi Bots in a row would make the frame look thorough
 * while hiding the only comparison that matters. Pass `?all=1` to add the variants anyway; they
 * are appended AFTER the three so the main reading order never changes.
 *
 * ⚠️ EACH FIGURE KEEPS THE SURFACE IT ACTUALLY SHIPS WITH. This is the opposite of what
 * `mesh.compare` does, and deliberately so: that view re-materials everything to compare
 * GEOMETRY, whereas this one is asking "which of these robots do we want", and a robot's
 * texture is part of the answer. The procedural UNIT-4H therefore wears its GPU-baked shell,
 * the Lumi Bot wears the project's per-bone material families, and the Friendly Robot wears
 * Meshy's baked texture.
 */

/** The lineage, oldest first. `build` returns a THREE.Object3D standing at the origin. */
const ROSTER = [
  {
    key: 'unit4h', label: 'UNIT-4H — hand-built',
    note: 'procedural, no mesh file at all',
  },
  {
    key: 'lumi', label: 'Lumi Bot — generated #1',
    url: '/models/anim/player_norm30.glb',
    note: 'the current ship pointer, 10,378 tris',
  },
  {
    key: 'friendly', label: 'Friendly Robot — generated #2',
    url: '/models/anim/friendly_all38.glb',
    note: 'new, 15,864 tris, Meshy-rigged, baked texture + chrome panels',
  },
];

/*
 * 🚨 THE FRIENDLY ROBOT NOW CARRIES ITS OWN 20 CLIPS, REGENERATED ON ITS OWN RIG (2026-08-19).
 *
 * It used to point at `friendly_merged.glb`, which was the Lumi Bot's clips COPIED across a rig
 * whose Hips rest 114.86 deg apart — the file this row was built to judge, and the one it
 * convicted. `?bad=1` puts that file back in the row so the two can be watched side by side on
 * one clock, which is the only way the difference reads as a CLIP fault rather than a rig fault.
 */

/** Only reached with `?all=1`. Near-identical to `lumi`; see the header. */
const VARIANTS = [
  { key: 'unwrapped', label: 'unwrapped', url: '/models/anim/player_unwrapped.glb' },
  { key: 'smooth', label: 'smooth', url: '/models/anim/player_smooth.glb' },
  { key: 'bf65', label: 'bf65 (dead end)', url: '/models/anim/player_bf65.glb' },
];

const H = 1.7;

/**
 * Stand a loaded GLB on the ground at exactly `H` metres.
 *
 * The files do NOT agree on scale or origin — `player_norm30` is conditioned to 1.7 m with its
 * origin between the feet, but the Meshy rig export arrives at its own height with the origin
 * wherever the rigger left it. Normalising here is what makes the row comparable; a view that
 * assumed a shared convention would silently show one robot as a giant and read as a modelling
 * error rather than a loader one.
 */
function standOnGround(obj) {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  if (size.y <= 1e-6) throw new Error('char-lineup: subject has zero height');
  const s = H / size.y;
  obj.scale.multiplyScalar(s);

  obj.updateWorldMatrix(true, true);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c2 = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c2.x;
  obj.position.z -= c2.z;
  obj.position.y -= b2.min.y;
  return { scale: s, tris: countTris(obj) };
}

function countTris(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    n += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
  });
  return Math.round(n);
}

/*
 * ⚠️ THERE IS NO `Icosphere` TO STRIP HERE, WHATEVER BLENDER SHOWS YOU.
 *
 * Opening any Meshy rig in Blender displays a stray 42-vert `Icosphere` beside the body, and a
 * strip for it used to live at this spot. It is not in the GLB: Blender's glTF IMPORTER creates
 * it as the bone display widget (all 24 pose bones name it as `custom_shape`) and files it under
 * a collection called `glTF_not_exported`. The strip never once fired here, and an equivalent
 * one in `tools/merge_clips.py` "failed" convincingly — the scene was clean before export and
 * the re-imported file showed the Icosphere again, because the importer had remade it.
 */
export default async function view(args = {}) {
  const params = args.params;
  const showAll = (params?.get?.('all') ?? '0') !== '0';
  let roster = showAll ? [...ROSTER, ...VARIANTS] : ROSTER;

  // `?bad=1` — stand the INVALID copied-clip build next to the regenerated one. See the note above.
  if ((params?.get?.('bad') ?? '0') !== '0') {
    roster = [...roster, {
      key: 'friendlyBad', label: 'Friendly — COPIED clips (invalid)',
      url: '/models/anim/friendly_merged.glb',
      note: 'the 114.86 deg rest mismatch, kept as the control',
    }];
  }

  /*
   * THE CONTROL THAT MUST FAIL. `?missing=1` points the last entry at a file that is not there.
   * Every guard downstream — the loader, the 0-triangle check, the harness's clean-load and
   * placement assertions — exists to catch a robot that did not arrive, and a guard nobody has
   * watched fail is a guard nobody knows works. This view photographed a LOADING SCREEN and
   * reported success once already; the assertions are only worth what their controls prove.
   */
  if ((params?.get?.('missing') ?? '0') !== '0') {
    roster = roster.map((e, i) => (i === roster.length - 1
      ? { ...e, url: '/models/anim/__does_not_exist__.glb' } : e));
    console.log('[char.lineup] CONTROL ?missing=1 — last entry points at a missing file');
  }

  const engine = await studio({
    cameraPos: [0, H * 0.6, H * 3.2],
    target: [0, H * 0.5, 0],
    fov: 34,
    bg: 0xeeeeee,
    envIntensity: 1.0,
    shadowExtent: H * 2.4,
  });

  const mats = unit4hMaterials({});
  const loader = new GLTFLoader();
  const placed = [];
  const report = [];

  for (const entry of roster) {
    let root;
    if (entry.key === 'unit4h') {
      // The hand-built one. Posed to match the generated bodies' relaxed A-pose so the
      // comparison is of the ROBOT and not of what each happens to be doing.
      const p = buildUnit4H({ height: H });
      p.setPose({
        shoulderL: [0, 0, 0.13], shoulderR: [0, 0, -0.13],
        elbowL: [0.10, 0, 0.05], elbowR: [0.10, 0, -0.05],
      });
      root = p.root;
    } else {
      const gltf = await loader.loadAsync(entry.url);
      root = gltf.scene;
      entry._clips = gltf.animations ?? [];

      // The Lumi Bot lineage carries NO material of its own — it is one primitive with zero
      // material slots, and the project's per-bone families are what dress it everywhere else.
      // The Friendly Robot arrives already textured and keeps that texture.
      const hasTexture = (() => {
        let found = false;
        root.traverse((o) => { if (o.isMesh && o.material?.map) found = true; });
        return found;
      })();
      root.traverse((o) => {
        if (!o.isMesh) return;
        // A textured body keeps its map and gets the SAME chrome treatment the game applies, so
        // this row shows the shipping surface rather than a view-only approximation of it.
        if (hasTexture) chromeDarkPanels(o.material);
        else o.material = mats.shell;
        o.castShadow = true;
        o.receiveShadow = true;
      });
      entry._textured = hasTexture;
    }

    const info = standOnGround(root);

    /*
     * ⚠️ THE LUMI BOT MUST BE DRESSED OR THE ROW IS A RIGGED COMPARISON.
     *
     * The first capture of this view stood a blank, glossy, FACELESS Lumi Bot between two
     * finished robots, and it read as the obviously worst of the three. That was an artefact of
     * this view, not a fact about the asset: the Lumi Bot's ears, faceplate, wordmark, neck
     * column and mint caps are not in its GLB at all — they are kit geometry that
     * `mesh-identity.js` skins on at load, which `game.play` and `mesh.animated` both do and
     * this view did not. Judging the lineage from that frame would have been judging a bug.
     *
     * Called while the figure is still at the origin. `attachIdentity` neutralises position and
     * rotation itself before measuring — it documents a three.js SkinnedMesh raycast defect that
     * double-counts an off-centre transform — but calling it before the x-spacing means that
     * safeguard is never the only thing standing between this view and a silently wrong kit.
     */
    if (entry.key !== 'unit4h') {
      // An untextured body needs the whole kit. A textured one already carries a painted face,
      // ears and caps, so it takes the chest wordmark alone — see `attachWordmarkOnly`.
      if (entry._textured) attachWordmarkOnly(root, mats, H);
      else attachIdentity(root, mats, H);
      entry._dressed = true;
    }

    engine.scene.add(root);
    placed.push(root);
    report.push({ ...entry, ...info });
  }

  // Space them on one line, centred, with a gap that scales with the count.
  const gap = 0.95;
  const x0 = -((placed.length - 1) * gap) / 2;
  placed.forEach((o, i) => { o.position.x += x0 + i * gap; });

  /*
   * THE LOAD REPORT. A GLB that fails to load leaves an empty Group, which stands on the ground
   * at exactly 1.7 m like everything else and reads in the frame as "that robot is invisible"
   * rather than "that file is missing". Printing the tri count per entry is what separates the
   * two, and it is also the number John is choosing between.
   */
  console.log('[char.lineup] ' + report.map((r) =>
    `${r.key}=${r.tris}tris${r._textured ? '(textured)' : ''}`).join('  '));
  for (const r of report) {
    if (r.key !== 'unit4h' && r.tris === 0) {
      throw new Error(`char-lineup: ${r.key} loaded 0 triangles from ${r.url} — the file is ` +
        `missing or empty, and an empty Group would have stood in the row looking deliberate.`);
    }
  }

  /*
   * ⚠️ THE MARGIN IS GENEROUS ON PURPOSE. At 1.16 the row filled the frame edge to edge and the
   * right-hand robot was CROPPED — and that also silently broke the capture's own ink metric,
   * which takes its background reference from the left and right columns of the frame and was
   * therefore sampling a robot instead of the backdrop. A lineup that touches the frame edge is
   * both a worse picture and an unmeasurable one.
   */
  fitCamera(engine, placed, 34, 0, 0.18, 1.42);

  // Labels are OFF by default: `rrr-critique`'s identification gate needs a frame that does not
  // answer its own question. `?names=1` turns them on for ordinary reading.
  if ((params?.get?.('names') ?? '0') !== '0') {
    const step = 100 / (report.length + 1);
    labels(report.map((r, i) => ({ text: r.label, x: step * (i + 1), y: 90 })));
  }

  /*
   * ⚠️ `brandReady()` BEFORE `markReady()`, and `markReady()` AT ALL.
   *
   * This view shipped without `markReady()` on its first run, so nothing downstream could tell
   * the difference between "still baking" and "finished" — `harness/_lineup_shot.mjs` waited on
   * a plain timer instead and photographed the splash screen while reporting OK. A view that
   * never declares itself ready makes every capture of it a guess.
   *
   * The await is the same one `char.turnaround` records: the wordmark decal's texture decodes
   * asynchronously, and marking ready before it lands captures UNIT-4H with a bare chest.
   */
  /*
   * WHERE EACH FIGURE ACTUALLY LANDED ON SCREEN, published for the capture harness.
   *
   * The harness first tried to count figures from PIXELS — columns of "not the background" — and
   * it kept reporting one figure for three. Twice for different reasons: once because the
   * background is a gradient and a flat reference colour matched nothing, and again because the
   * row touched the frame edge so the per-row reference was sampling a ROBOT. A pixel heuristic
   * has to re-derive something this view already knows exactly.
   *
   * So the view projects each figure's own bounding box into normalised device coordinates and
   * says where it is. That is immune to backdrop, lighting and texture, and it catches the two
   * failures actually worth catching: a figure off the edge of frame, and two figures standing
   * in the same place.
   */
  /*
   * ============================ THE RIG COMPARISON ITSELF ============================
   *
   * John, after watching the newly rigged body: "they are both collapsed onto the left leg and
   * swinging wildly around ... lets just improve the robot comparison with a toggle for each
   * animation that each rig has. It should be a full verification tool for robot rigging
   * animations."
   *
   * ⚠️ THE POINT IS SIDE-BY-SIDE, NOT ONE ROBOT AT A TIME. `Attack` and `Heavy_Hammer_Swing`
   * collapse the Friendly Robot onto its left leg. Watched alone that is ambiguous — it could be
   * the clip, the retarget, or the auto-rig's weights. Watched with the SAME clip driving the
   * Lumi Bot two metres away, on the same frame, it is immediately one or the other. That is the
   * whole reason this is a row and not a viewer.
   *
   * Every rig runs off ONE clock — `engine.onUpdate` advances all mixers with the same dt — so
   * the bodies are always on the same frame of the same clip. Comparing two figures at unknown
   * different phases would be worse than useless.
   *
   * A rig that does not carry the selected clip holds its bind pose and says so, rather than
   * silently standing still and reading as a rig that broke.
   */
  const mixers = [];
  const withClips = report.filter((r) => (r._clips?.length ?? 0) > 0);
  const clipNames = [...new Set(withClips.flatMap((r) => r._clips.map((c) => c.name)))].sort();

  for (let i = 0; i < report.length; i++) {
    const r = report[i];
    if (!r._clips?.length) { mixers.push(null); continue; }
    mixers.push(new THREE.AnimationMixer(placed[i]));
  }
  engine.onUpdate((dt) => { for (const m of mixers) m?.update(dt); });

  let current = null;
  const play = (name) => {
    current = name;
    for (let i = 0; i < report.length; i++) {
      const m = mixers[i];
      if (!m) continue;
      m.stopAllAction();
      const clip = report[i]._clips.find((c) => c.name === name);
      if (clip) m.clipAction(clip).play();
      else {
        // Hold the bind pose. `setTime(0)` on a stopped mixer leaves whatever the last clip did,
        // which would show a rig frozen mid-swing and read as a deformation bug.
        placed[i].traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
      }
    }
    window.__lineupAnim = {
      clip: name,
      has: report.map((r) => ({ key: r.key, has: !!r._clips?.some((c) => c.name === name) })),
    };
    console.log(`[char.lineup] anim "${name}" — ` + window.__lineupAnim.has
      .map((h) => `${h.key}:${h.has ? 'yes' : 'NO CLIP'}`).join(' '));
  };

  const stopAll = () => {
    current = null;
    for (let i = 0; i < report.length; i++) {
      mixers[i]?.stopAllAction();
      placed[i].traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
    }
    window.__lineupAnim = { clip: null, has: [] };
    console.log('[char.lineup] bind pose');
  };

  /*
   * The picker. Plain DOM over the canvas — this is a dev instrument, and a DOM button list is
   * readable, keyboard-navigable and costs nothing to render.
   *
   * `?ui=0` hides it so a capture is a clean frame; `?anim=<name>` preselects one, which is what
   * makes the whole thing screenshot-able from the harness without clicking.
   */
  /*
   * ⚠️ A DROPDOWN, NOT A ROW OF BUTTONS. John's call, and it is a capacity decision rather than a
   * style one: the button bar already wrapped onto two lines at 16 clips, and the seated set adds
   * roughly 23 more. At ~38 the bar would eat a third of the frame and push the robots out of it.
   * A select stays one line however many clips we add, which is the point — this list only grows.
   *
   * ⚠️ IT MUST STILL SAY WHICH RIGS CARRY EACH CLIP. That was the button bar's real work, not its
   * clicking: a clip present on one rig and missing on another is exactly the kind of asymmetry
   * this tool exists to surface. Options carry a `(1/2)` suffix and the readout under the select
   * names the rigs, so nothing is lost by collapsing the row.
   */
  if (clipNames.length && (params?.get?.('ui') ?? '1') !== '0') {
    const bar = document.createElement('div');
    bar.style.cssText = `position:fixed;left:0;right:0;bottom:0;z-index:30;padding:7px 10px;
      display:flex;gap:9px;align-items:center;
      background:rgba(20,22,25,.88);font:12px/1.3 ui-monospace,Menlo,Consolas,monospace`;

    const tag = document.createElement('span');
    tag.textContent = `${withClips.length} rig(s)`;
    tag.style.cssText = 'color:#8b949e;letter-spacing:.06em;white-space:nowrap';
    bar.appendChild(tag);

    const sel = document.createElement('select');
    sel.style.cssText = `flex:0 1 380px;padding:4px 6px;border:1px solid #30363d;border-radius:4px;
      background:#21262d;color:#c9d1d9;font:inherit;cursor:pointer`;
    const bindOpt = document.createElement('option');
    bindOpt.value = '';
    bindOpt.textContent = `— bind pose — (${clipNames.length} clips)`;
    sel.appendChild(bindOpt);

    const ownersOf = (n) => withClips.filter((r) => r._clips.some((c) => c.name === n));
    for (const n of clipNames) {
      const o = document.createElement('option');
      o.value = n;
      const owners = ownersOf(n);
      o.textContent = owners.length === withClips.length
        ? n : `${n}  (${owners.length}/${withClips.length})`;
      sel.appendChild(o);
    }
    bar.appendChild(sel);

    const readout = document.createElement('span');
    readout.style.cssText = 'color:#8b949e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    bar.appendChild(readout);

    const paint = () => {
      sel.value = current ?? '';
      if (!current) { readout.textContent = 'all rigs at rest'; return; }
      readout.textContent = report
        .map((r) => `${r.key}:${r._clips?.some((c) => c.name === current) ? 'yes' : 'NO CLIP'}`)
        .join('  ');
    };

    sel.onchange = () => {
      if (sel.value) play(sel.value); else stopAll();
      paint();
    };

    /*
     * Arrow keys step the list without opening it, so a whole set can be reviewed by holding one
     * key and watching. Reviewing 38 clips through a mouse would not get done.
     */
    const step = (d) => {
      const i = clipNames.indexOf(current);
      const next = clipNames[Math.min(clipNames.length - 1, Math.max(0, (i < 0 ? -1 : i) + d))];
      if (next) { play(next); paint(); }
    };
    window.addEventListener('keydown', (e) => {
      if (e.target === sel) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { step(1); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { step(-1); e.preventDefault(); }
      if (e.key === 'Escape') { stopAll(); paint(); }
    });

    const hint = document.createElement('span');
    hint.textContent = '← → step · Esc rest';
    hint.style.cssText = 'color:#484f58;margin-left:auto;white-space:nowrap';
    bar.appendChild(hint);

    document.body.appendChild(bar);
    window.__lineupPaint = paint;
    paint();
  }

  const wanted = params?.get?.('anim');
  if (wanted && clipNames.includes(wanted)) { play(wanted); window.__lineupPaint?.(); }
  else if (wanted) console.warn(`[char.lineup] no clip named "${wanted}" on any rig`);

  window.__lineupClips = { clips: clipNames, rigs: report.map((r) => ({
    key: r.key, count: r._clips?.length ?? 0,
    names: (r._clips ?? []).map((c) => c.name),
  })) };
  console.log('[char.lineup] clips ' + window.__lineupClips.rigs
    .map((r) => `${r.key}=${r.count}`).join(' '));

  engine.camera.updateMatrixWorld(true);
  engine.camera.updateProjectionMatrix();
  window.__lineup = placed.map((o, i) => {
    const box = new THREE.Box3().setFromObject(o);
    const xs = [];
    for (const sx of [box.min.x, box.max.x]) {
      for (const sy of [box.min.y, box.max.y]) {
        for (const sz of [box.min.z, box.max.z]) {
          xs.push(new THREE.Vector3(sx, sy, sz).project(engine.camera).x);
        }
      }
    }
    return { key: report[i].key, ndcMin: Math.min(...xs), ndcMax: Math.max(...xs) };
  });
  console.log('[char.lineup] ndc ' + window.__lineup.map((e) =>
    `${e.key}[${e.ndcMin.toFixed(2)},${e.ndcMax.toFixed(2)}]`).join(' '));

  await brandReady();
  engine.markReady();

  engine.start();
  return engine;
}
