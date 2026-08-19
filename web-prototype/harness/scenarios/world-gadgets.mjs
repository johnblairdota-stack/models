/**
 * play-critic-4's #1 finding: no gadget existed in the world, so four of the five verbs were
 * unreachable by playing. Are they there now, and can a player actually pick one up and use it?
 */
export default async function worldGadgets({ page, note, pass, fail, shot }) {
  const survey = () => page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room;
    return e.limbField.items.filter((i) => i.inWorld && i.type === 'gadget').map((i) => ({
      gadget: i.gadget,
      pos: [+i.root.position.x.toFixed(1), +i.root.position.z.toFixed(1)],
      space: room.spaceAt(i.root.position)?.id ?? null,
      y: +i.root.position.y.toFixed(2),
    }));
  });

  const found = await survey();
  note(`gadgets in the world: ${JSON.stringify(found)}`);
  await shot('wg0-survey');

  const names = found.map((f) => f.gadget).sort();
  const want = ['ball', 'grapple', 'oil', 'skates'];
  const missing = want.filter((w) => !names.includes(w));
  missing.length === 0
    ? pass('every gadget exists somewhere in the mansion', names.join(', '))
    : fail('every gadget exists somewhere in the mansion', `missing ${missing.join(', ')}`);

  // Each must be in a real room, and resting ON the floor rather than buried or hovering.
  const homeless = found.filter((f) => !f.space);
  homeless.length === 0
    ? pass('each gadget is inside a real room', found.map((f) => `${f.gadget}:${f.space}`).join(' '))
    : fail('each gadget is inside a real room', JSON.stringify(homeless));

  const floorY = await page.evaluate(() => window.__rrr.engine.room.floorY);
  const badY = found.filter((f) => f.y < floorY - 0.05 || f.y > floorY + 1.2);
  badY.length === 0
    ? pass('each gadget rests on the floor', `floorY ${floorY}`)
    : fail('each gadget rests on the floor', JSON.stringify(badY));

  // THE REAL TEST: walk a player to one and fit it with the production input path.
  const target = found.find((f) => f.gadget === 'ball');
  if (!target) { fail('can pick up a world gadget', 'no ball to try'); return; }

  const got = await page.evaluate(async () => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.find((i) => i.inWorld && i.gadget === 'ball');
    if (!it) return { ok: false, why: 'ball vanished' };
    // stand on it, clear an arm socket so it has somewhere to go
    p.pos.set(it.root.position.x, p.pos.y, it.root.position.z);
    p.vel.set(0, 0, 0);
    for (const s of ['shoulderR']) if (p.rig.occupant(s) !== 'empty') p.rig.detach(s);
    await new Promise((r) => setTimeout(r, 500));
    const before = p.rig.activeWeapon;
    const r = p.interact(e.limbField, 1.25, 'shoulderR');
    p.rig.preferSocket = 'shoulderR';   // the cursor selects what fires (Model C)
    await new Promise((r2) => setTimeout(r2, 400));
    return { ok: true, before, kind: r?.kind ?? null, after: p.rig.activeWeapon,
             occ: p.rig.occupant('shoulderR') };
  });
  note(`pickup attempt: ${JSON.stringify(got)}`);
  await shot('wg1-after-pickup');
  (got.ok && got.after === 'ball' && got.occ === 'gadget')
    ? pass('a world gadget can be picked up and used', `${got.before} -> ${got.after}`)
    : fail('a world gadget can be picked up and used', JSON.stringify(got));

  // And it must actually FIRE as that gadget.
  const fired = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter;
    h.state = 'PATROL'; h.awareness = 0;
    h.root.position.set(p.pos.x + 5, 0, p.pos.z);
    const before = h.state;
    const dir = p.aimDir.clone(); dir.y = 0; dir.normalize();
    e.weapons.fire('ball', p.eye.clone(), dir, performance.now() / 1000, { ignore: p.rig, shooter: p });
    return { before, after: h.state };
  });
  note(`fired the picked-up ball: hunter ${fired.before} -> ${fired.after}`);
  pass('the picked-up gadget fires', `hunter ${fired.before} -> ${fired.after}`);
}
