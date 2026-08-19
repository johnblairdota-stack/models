/**
 * Oil as real AREA DENIAL: does a pool bend the hunter's STEERING away from it?
 *
 * ⚠️ Tests `_steerTo` directly. The first version set `state='SEARCH'` and watched the hunter
 * walk — but `_arbitrate` re-decides the state every frame from perception, so the forced
 * state was overwritten and the hunter never moved at all. The test measured nothing and
 * "failed" a working change. Steering is the unit that was modified; test that.
 */
export default async function fireDenial({ page, note, pass, fail, shot }) {
  const probe = (withFire) => page.evaluate((fire) => {
    const e = window.__rrr.engine, h = e.hunter, room = e.room;
    const a = room.anchor('gallery.mid');
    for (const f of [...e.weapons.fires]) e.weapons._douse(f);
    e.weapons.fires.length = 0;

    // hunter 6 m west of centre, goal 6 m east — the straight line runs through the middle
    h.root.position.set(a.x - 6, 0, a.z);
    h.vel.set(0, 0, 0);
    const goal = new h.root.position.constructor(a.x + 6, 0, a.z);

    if (fire) {
      e.weapons._lightFire(new h.root.position.constructor(a.x, room.floorY, a.z));
      e.weapons.fires[0].left = 60; e.weapons.fires[0].dur = 60;
    }

    // integrate the steering alone for 1.5 s of fixed steps
    for (let i = 0; i < 90; i++) {
      h._steerTo(goal, 1 / 60, 3.0);
      h.root.position.x += h.vel.x / 60;
      h.root.position.z += h.vel.z / 60;
    }
    return {
      pos: [+h.root.position.x.toFixed(2), +h.root.position.z.toFixed(2)],
      lateral: +Math.abs(h.root.position.z - a.z).toFixed(3),
      distToCentre: +Math.hypot(h.root.position.x - a.x, h.root.position.z - a.z).toFixed(2),
      fires: e.weapons.fires.length,
    };
  }, withFire);

  const clean = await probe(false);
  note(`no fire:   ended ${JSON.stringify(clean.pos)}  lateral ${clean.lateral} m  (fires ${clean.fires})`);
  const burning = await probe(true);
  note(`with fire: ended ${JSON.stringify(burning.pos)}  lateral ${burning.lateral} m  (fires ${burning.fires})`);
  await shot('fd-steering');

  burning.fires === 1 ? pass('the pool exists for the steering test') : fail('the pool exists', `${burning.fires}`);

  burning.lateral > clean.lateral + 0.2
    ? pass('a burning pool bends the hunter off the straight line', `lateral ${clean.lateral} -> ${burning.lateral} m`)
    : fail('a burning pool bends the hunter off the straight line', `lateral ${clean.lateral} -> ${burning.lateral} m`);
}
