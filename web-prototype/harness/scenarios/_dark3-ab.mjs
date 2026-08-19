/**
 * 🕳️ **`dark-3` — PICK THE HARDWARE'S MATERIAL VALUES IN ONE PAGE, MEASURED ON ITS OWN PIXELS.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_dark3-ab.mjs \
 *        --port 5471 --q "seed=s4" --shots
 *
 * `_dark2-who.mjs` (re-run 2026-08-09 by dark-3) settled the mechanism for `critic-slice-3`
 * #5 AND #6: the black wedges/cut-outs are `exterior.dress.boards/chain` themselves — drawn,
 * front-facing, and SHADED (their own pixels move +2.45 under a x4 hemisphere while the frame
 * moves +15.70), but at albedo ~0.03 linear (board 0x3b3025, iron 0x2a2b2e) their whole lit
 * range lands at L 4-10, at or under the grade's black clamp. No light fixes an albedo that is
 * 20x darker than the wall it hangs on; the fix is the material, and this scenario A/Bs the
 * candidate values as LIVE UNIFORMS in one held page, on the hardware's own hide-diff mask.
 *
 * Nothing here can move `numPointLights` or recompile a program: `color`, `roughness` and
 * `metalness` are uniforms on MeshStandardMaterial. Program count printed per arm anyway.
 */
import { decodePng } from '../pxdiff.mjs';
import { hold, release } from '../still.mjs';

const lumaOf = (img, i) => 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];

function maskOf(a, b, tol = 3) {
  const n = Math.min(a.data.length, b.data.length), ch = a.channels;
  const m = new Uint8Array(Math.floor(n / ch));
  let count = 0;
  for (let i = 0, k = 0; i + ch <= n; i += ch, k++) {
    if (Math.abs(lumaOf(a, i) - lumaOf(b, i)) > tol) { m[k] = 1; count++; }
  }
  return { m, count };
}

function underMask(img, m) {
  const ch = img.channels;
  let s = 0, n = 0, dark = 0, s2 = 0, n2 = 0;
  for (let i = 0, k = 0; i + ch <= img.data.length; i += ch, k++) {
    const L = lumaOf(img, i);
    if (m[k]) { s += L; n++; if (L < 18) dark++; } else { s2 += L; n2++; }
  }
  return { mean: n ? s / n : 0, darkFrac: n ? dark / n : 0, rest: n2 ? s2 / n2 : 0 };
}

/** The candidate value sets. `base` restores the shipped numbers exactly. */
const ARMS = [
  { name: 'base', board: 0x3b3025, bRough: 0.88, iron: 0x2a2b2e, iRough: 0.52, iMetal: 0.72 },
  { name: 'aged', board: 0x7f6f58, bRough: 0.88, iron: 0x454a52, iRough: 0.48, iMetal: 0.65 },
  { name: 'deal', board: 0x94836a, bRough: 0.88, iron: 0x51565e, iRough: 0.45, iMetal: 0.60 },
  { name: 'pale', board: 0xa4937a, bRough: 0.86, iron: 0x5c6169, iRough: 0.42, iMetal: 0.55 },
];

export default async function dark3ab({ page, note, pass, fail, skip, snap, shot }) {
  const wait = async (f) => { for (let i = 0; i < f; i++) await page.waitForTimeout(40); };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const place = (anchor, yaw, pitch = 0.02) => page.evaluate(([a, y, pi]) => {
    const e = window.__rrr.engine, p = e.player;
    const v = e.room.anchor?.(a);
    if (!v) return { ok: false, why: 'no anchor ' + a };
    p.pos.copy(v); p.vel.set(0, 0, 0);
    p.aimYaw = y; p.facing = y;
    if (e.cam) { e.cam.yaw = y; e.cam.pitch = pi; e.cam._first = true; }
    e.room.setViewpoints?.([{ pos: p.pos, dir: { x: Math.sin(y), z: Math.cos(y) } }]);
    return { ok: true, space: e.room.spaceAt(p.pos)?.id ?? null };
  }, [anchor, yaw, pitch]);

  const parkPanel = (pid, back = 3.4, yawOff = 0) => page.evaluate(([id, d0, dy]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    if (!p) return { ok: false, why: 'no panel ' + id };
    const home = e.room.spaces.find((s) => s.id === p.ownerSpace?.id);
    const inSign = home ? p.sideOf({ x: home.cx, y: 0, z: home.cz }) : 1;
    const n = p.normal;
    const c = p.pointAt(0.5, 0.5);
    e.player.pos.set(c.x + n.x * d0 * inSign, e.room.floorY, c.z + n.z * d0 * inSign);
    e.player.vel.set(0, 0, 0);
    const f = Math.atan2(-n.x * inSign, -n.z * inSign) + dy;
    e.player.facing = f; e.player.aimYaw = f;
    if (e.cam) { e.cam.yaw = f; e.cam.pitch = 0; e.cam._first = true; }
    e.room.setViewpoints?.([{ pos: e.player.pos, dir: { x: Math.sin(f), z: Math.cos(f) } }]);
    return { ok: true, space: e.room.spaceAt(e.player.pos)?.id ?? null };
  }, [pid, back, yawOff]);

  const setMats = (arm) => page.evaluate((a) => {
    const e = window.__rrr.engine;
    let board = null, iron = null;
    e.scene.traverse((o) => {
      if (!o.isMesh || !o.material?.name) return;
      if (o.material.name === 'exterior.board') board = o.material;
      if (o.material.name === 'exterior.iron') iron = o.material;
    });
    if (!board || !iron) return { ok: false, why: 'materials not found' };
    board.color.setHex(a.board); board.roughness = a.bRough;
    iron.color.setHex(a.iron); iron.roughness = a.iRough; iron.metalness = a.iMetal;
    return { ok: true, programs: e.renderer.info.programs?.length ?? -1, calls: e.renderer.info.render.calls };
  }, arm);

  const hideDress = (on) => page.evaluate((v) => {
    const e = window.__rrr.engine;
    let n = 0;
    e.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (!/^exterior\.dress\.(boards|chain)/.test(o.name || '')) return;
      o.visible = !v ? true : false; n++;
    });
    return n;
  }, on);

  const STATIONS = [
    { tag: 'svc', park: () => place('service.mid', 0) },
    { tag: 'stair', park: () => parkPanel('x.study_e.stair', 3.4, 0) },
    { tag: 'galw', park: () => parkPanel('x.gallery.north_w', 3.4, 0) },
  ];

  for (const st of STATIONS) {
    const ok = await st.park();
    note(`${st.tag} ${JSON.stringify(ok)}`);
    if (!ok.ok) { skip(`${st.tag} reachable`, ok.why); continue; }
    await wait(45);
    const pinned = await hold(page);
    note(`${st.tag} hold ${JSON.stringify(pinned.pinned ?? pinned)}`);
    await wait(4);

    // the hardware's own pixels, by hide-diff, taken once per station on the BASE arm
    const base0 = decodePng(await snap(`${st.tag}-m0`));
    const nHid = await hideDress(true); await wait(5);
    const hid = decodePng(await snap(`${st.tag}-m1`));
    await hideDress(false); await wait(4);
    const { m, count } = maskOf(base0, hid, 3);
    note(`${st.tag}: dress mask ${count} px (${(count / (base0.width * base0.height) * 100).toFixed(1)}% of frame, ${nHid} meshes)`);
    if (count < 500) { skip(`${st.tag} has visible hardware`, `mask ${count} px`); await release(page); continue; }

    for (const arm of ARMS) {
      const r = await setMats(arm);
      await wait(6);
      const img = decodePng(await snap(`${st.tag}-${arm.name}`));
      await shot(`dark3-${st.tag}-${arm.name}`);
      if (!img) { note(`${st.tag} ${arm.name}: no capture`); continue; }
      const u = underMask(img, m);
      note(`${st.tag} ${arm.name.padEnd(5)} HARDWARE L ${u.mean.toFixed(1)} (${(u.darkFrac * 100).toFixed(0)}% <L18) · rest L ${u.rest.toFixed(1)} · prog=${r.programs}`);
    }
    await setMats(ARMS[0]);   // always leave the page on shipped values
    await wait(3);
    await release(page);
  }

  pass('A/B complete', 'pick from the pictures + the mask numbers');
}
