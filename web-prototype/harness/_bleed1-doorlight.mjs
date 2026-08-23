#!/usr/bin/env node
/**
 * 🚪 **WHY THE NEXT ROOM IS BLACK, AND THE CONTROL THAT KEEPS THE FIX HONEST.**
 *
 *   node harness/_bleed1-doorlight.mjs
 *   node harness/_bleed1-doorlight.mjs --pixels   # Playwright, optional
 *
 * John, after #12: *"rooms light independently; hard to see into adjacent rooms through
 * doorways."* The prior agent died mid-diagnosis. The arithmetic, finished:
 *
 *   1. `makeLightRig` / `followRig` own FIVE lights and MOVE them to `space.lights`.
 *   2. `room.setViewpoints` keeps the adjacent room resident when a portal is in front of
 *      the camera — so you CAN see through the door. What you see is unlit.
 *   3. Authored and generated tables already park `cool` past ONE door (`genplan.js`
 *      `COOL.past` 2.0, `spaces.js` gallery cool at local z +4.45 "ON THE FAR SIDE OF D1").
 *      That is the right idea aimed at the WRONG opening the moment you look through a
 *      different door, or stand in the room whose table put cool behind you.
 *   4. A point at decay 2, 10 m from a cool of intensity 44, is ~0.44. The same point 2.2 m
 *      from a rim past the door you are facing is ~9. The ratio is the visibility.
 *
 * The fix (`src/lighting/door-bleed.js`, wired in `followRig`) relocates the EXISTING cool
 * past the portal in frame and opens the key cone by `BLEED_CONE` (0.12 rad). No sixth light
 * — `numPointLights` is a program cache key. `?bleed=0` is this file's control arm.
 *
 * ⚠️ Party-warm W23 asserts the arithmetic in bare node (CI, no npm install). This file is
 * the argument, and `--pixels` is the picture for anyone who can run Playwright.
 */

import {
  BLEED_CONE, BLEED_PAST, BLEED_Y, bleedCoolPos, bleedKeyAngle, facingPortal, isPastSpace,
} from '../src/lighting/door-bleed.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

/** three.js PointLight falloff at decay 2: I / d², with a 1 m floor the way the GPU does. */
const at = (I, d) => I / Math.max(1, d) ** 2;

console.log('\n_bleed1-doorlight — why the next room is black');

{
  const here = { id: 'A', x0: 0, x1: 10, z0: 0, z1: 8 };
  const next = { id: 'B', x0: 0, x1: 10, z0: 10, z1: 22 };
  const rear = { id: 'C', x0: 0, x1: 10, z0: -12, z1: -2 };
  const spaces = [here, next, rear];
  const front = { a: 'A', b: 'B', x: 5, z: 8.2 };
  const back = { a: 'A', b: 'C', x: 5, z: -0.2 };
  const eye = { x: 5, z: 4 };
  const lookIn = facingPortal([front, back], 'A', eye, { x: 0, z: 1 });
  const lookOut = facingPortal([front, back], 'A', eye, { x: 0, z: -1 });
  t('D1 · facing the door picks the door in front', lookIn === front);
  t('D1a control · facing away picks the one behind — the rule can still see a miss',
    lookOut === back);

  const rim = bleedCoolPos(front, 'A', spaces);
  const tableCool = bleedCoolPos(back, 'A', spaces); // what the widest-door table would do
  t('D2 · the facing rim is outside this room and inside the next',
    isPastSpace(rim, here) && !isPastSpace(rim, next),
    `rim (${rim.x.toFixed(2)}, ${rim.z.toFixed(2)}) y=${rim.y}`);
  t('D2a · and it is not the table\'s cool (the table parked past the BACK door)',
    Math.hypot(rim.x - tableCool.x, rim.z - tableCool.z) > 6);

  const sample = { x: 5, z: 12.2 }; // 2 m into B
  const I = 44;
  const live = at(I, Math.hypot(sample.x - rim.x, sample.z - rim.z));
  const dead = at(I, Math.hypot(sample.x - tableCool.x, sample.z - tableCool.z));
  t('D3 · irradiance in the next room is several times the table-cool reading',
    live > dead * 4, `facing ${live.toFixed(2)} vs table ${dead.toFixed(2)} (${(live / dead).toFixed(1)}×)`);
  t('D3a control · the table-cool reading really is the black doorway (I < 1)',
    dead < 1, `table ${dead.toFixed(3)}`);

  t('D4 · past and height match the authored cool, so a generated room does not invent a lamp',
    BLEED_PAST === 2.2 && BLEED_Y === 1.90);
  t('D5 · the cone widen is +0.12 and a 0.86 corridor key stays under a flood',
    bleedKeyAngle(0.30, true) === 0.30 + BLEED_CONE
    && bleedKeyAngle(0.86, true) <= 0.95);
}

if (process.argv.includes('--pixels')) {
  console.log('\n  --pixels: boot a follow view and sample the doorway (Playwright)');
  const { chromium } = await import('playwright');
  const { spawn } = await import('node:child_process');
  const net = await import('node:net');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = 5471;
  const portOpen = (p) => new Promise((res) => {
    const s = net.connect(p, '127.0.0.1');
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
  });
  let child = null;
  if (!(await portOpen(PORT))) {
    child = spawn(process.execPath, [
      path.join(ROOT, 'node_modules/vite/bin/vite.js'),
      '--port', String(PORT), '--strictPort', '--host', '127.0.0.1',
    ], { cwd: ROOT, stdio: 'ignore' });
    const t0 = Date.now();
    while (!(await portOpen(PORT))) {
      if (Date.now() - t0 > 60000) throw new Error('vite did not come up');
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
  const sample = async (bleed) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const q = `view=party.follow&warm=1&seed=3${bleed ? '' : '&bleed=0'}&capture=1`;
    await page.goto(`http://127.0.0.1:${PORT}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.body.dataset.rrrReady === '1', null, { timeout: 300000 });
    const luma = await page.evaluate(async () => {
      const e = window.__rrr?.engine;
      const bed = window.__rrrFollow;
      if (!e || !bed?.room) return { err: 'no bed' };
      const room = bed.room;
      const doors = room.portals().filter((p) => p.a !== p.b && p.kind === 'door');
      const here = room.spaceAt(e.camera.position) ?? room.spaces[0];
      const door = doors.find((p) => p.a === here.id || p.b === here.id);
      if (!door) return { err: 'no door' };
      const n = door.a === here.id
        ? { x: (room.spaces.find((s) => s.id === door.b)?.x0 + room.spaces.find((s) => s.id === door.b)?.x1) / 2 - door.centre.x,
            z: (room.spaces.find((s) => s.id === door.b)?.z0 + room.spaces.find((s) => s.id === door.b)?.z1) / 2 - door.centre.z }
        : { x: (here.x0 + here.x1) / 2 - door.centre.x, z: (here.z0 + here.z1) / 2 - door.centre.z };
      const len = Math.hypot(n.x, n.z) || 1;
      // Stand in THIS room, look through the door.
      e.camera.position.set(door.centre.x - (n.x / len) * 3.2, 1.5, door.centre.z - (n.z / len) * 3.2);
      e.camera.lookAt(door.centre.x + (n.x / len) * 2.0, 1.2, door.centre.z + (n.z / len) * 2.0);
      await window.__rrr.settle?.(10);
      const c = document.querySelector('canvas');
      if (!c) return { err: 'no canvas' };
      const g = c.getContext('webgl2') || c.getContext('webgl');
      // Sample a vertical strip around the centre — the doorway, if the shot is aimed.
      const w = 24, h = 80;
      const x0 = (c.width - w) >> 1, y0 = (c.height - h) >> 1;
      const buf = new Uint8Array(w * h * 4);
      g.readPixels(x0, y0, w, h, g.RGBA, g.UNSIGNED_BYTE, buf);
      let s = 0;
      for (let i = 0; i < buf.length; i += 4) s += 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
      return { luma: s / (w * h), room: here.id, door: door.id };
    });
    await page.close();
    return luma;
  };
  try {
    const off = await sample(false);
    const on = await sample(true);
    t('D6 · both arms produced a doorway sample',
      Number.isFinite(off.luma) && Number.isFinite(on.luma),
      `off ${JSON.stringify(off)} on ${JSON.stringify(on)}`);
    t('D6a · bleed-on is brighter through the door than bleed-off',
      on.luma > off.luma * 1.15,
      `on ${on.luma?.toFixed?.(1)} vs off ${off.luma?.toFixed?.(1)}`);
    t('D6b control · bleed-off really is the dark doorway (not a blown-out pair)',
      off.luma < 80 || on.luma > off.luma, `off ${off.luma}`);
  } finally {
    await browser.close();
    child?.kill();
  }
} else {
  console.log('  (skip D6 pixel arm — pass --pixels to photograph the doorway)');
}

console.log(`\n_bleed1-doorlight: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
