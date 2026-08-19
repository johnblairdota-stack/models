/** attachments.md step 2+3: socket targeting on the rosette, and one-press swap. */
export default async function socketTarget({ page, note, pass, fail, shot }) {
  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    return {
      target: e.gameHud?.targetSocket?.() ?? null,
      sockets: Object.fromEntries(['hipL', 'hipR', 'shoulderL', 'shoulderR'].map((s) => [s, p.rig.occupant(s)])),
      loose: e.limbField.items.filter((i) => i.inWorld).length,
      weapon: p.rig.activeWeapon,
    };
  });

  // put an ARM under the player so the arm sockets are the targets
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    if (p.rig.occupant('shoulderR') === 'limb') p.rig.detach('shoulderR');
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const arm = e.limbField.items.find((i) => i.inWorld && i.socketKind === 'arm');
    if (arm) arm.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
  });
  await page.waitForTimeout(600);

  const t0 = await read();
  note(`initial target: ${t0.target}  sockets=${JSON.stringify(t0.sockets)}`);
  t0.target ? pass('a socket is targeted by default', t0.target)
            : fail('a socket is targeted by default', 'null');
  await shot('st0-target');

  // hold E cycles the target
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(400);
  const t1 = await read();
  note(`after hold-E: ${t1.target}`);
  (t1.target && t1.target !== t0.target)
    ? pass('hold-E cycles the targeted socket', `${t0.target} -> ${t1.target}`)
    : fail('hold-E cycles the targeted socket', `still ${t1.target}`);
  await shot('st1-cycled');

  // tap E fits to the TARGETED socket specifically
  const before = await read();
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(600);
  const after = await read();
  note(`after tap-E: sockets=${JSON.stringify(after.sockets)} loose=${after.loose}`);
  await shot('st2-fitted');
  (after.sockets[before.target] !== 'empty' && after.sockets[before.target] !== before.sockets[before.target])
    ? pass('tap-E fits to the TARGETED socket', `${before.target}: ${before.sockets[before.target]} -> ${after.sockets[before.target]}`)
    : fail('tap-E fits to the targeted socket', `${before.target} is ${after.sockets[before.target]}`);

  // one-press SWAP: target the gadget arm, stand on a loose arm, press E
  const sw = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const gad = ['shoulderR', 'shoulderL'].find((s) => p.rig.occupant(s) === 'gadget');
    if (!gad) return null;
    // make sure something loose is underfoot
    let it = e.limbField.items.find((i) => i.inWorld && i.socketKind === 'arm');
    if (!it) { p.rig.detach(gad === 'shoulderR' ? 'shoulderL' : 'shoulderR'); }
    return gad;
  });
  if (!sw) { note('no gadget fitted — skipping swap check'); return; }
  await page.waitForTimeout(600);
  await page.evaluate((gad) => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.find((i) => i.inWorld && i.socketKind === 'arm');
    if (it) it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
    window.__want = gad;
  }, sw);
  await page.waitForTimeout(500);
  // aim the cursor at the gadget socket
  for (let i = 0; i < 3; i++) {
    const cur = await read();
    if (cur.target === sw) break;
    await page.keyboard.down('KeyE'); await page.waitForTimeout(500); await page.keyboard.up('KeyE');
    await page.waitForTimeout(300);
  }
  const bs = await read();
  note(`swap: target=${bs.target} (want ${sw}) sockets=${JSON.stringify(bs.sockets)} loose=${bs.loose}`);
  if (bs.target !== sw) { note('could not aim at the gadget socket; skipping'); return; }
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(700);
  const as = await read();
  note(`after swap: sockets=${JSON.stringify(as.sockets)} loose=${as.loose} weapon=${as.weapon}`);
  await shot('st3-swapped');
  (as.sockets[sw] === 'limb' && as.loose >= bs.loose)
    ? pass('one press swaps a fitted gadget for a limb, ejecting the old', `${sw}: gadget -> ${as.sockets[sw]}, loose ${bs.loose}->${as.loose}`)
    : fail('one press swaps a fitted gadget', `${sw} is ${as.sockets[sw]}, loose ${bs.loose}->${as.loose}`);
}
