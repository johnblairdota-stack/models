/**
 * ❓ **IS `fit-settle`'s RED MINE?** A diagnostic, not a gate.
 *
 * ⚠️ **STATUS 2026-08-15, READ THIS BEFORE THE ARGUMENT BELOW.**
 *   · **`fit-settle`'s red is DIAGNOSED BUT NOT ATTRIBUTED, DELIBERATELY.** This file proves the
 *     *cause* — its selector stages a world gadget, not the arm it detached — but **nobody has
 *     run `fit-settle` on a pre-`refit-1` tree**, so "it was already red" is an inference, not a
 *     reading. A one-line selector fix in someone else's instrument, made without a before-
 *     reading, is how a real regression gets buried under a plausible explanation. **Left alone.**
 *   · **The third question below is FIXED** (`refit-1`, `limbs.js` `attach()`): a world pickup is
 *     now consumed when it goes on. That check therefore PASSES here, and the standing gate is
 *     `mechanics.mjs`'s `refit` group **R6**, which also carries the two-different-gadgets
 *     control this file does not.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_refit1-fitsettle-why.mjs \
 *        --port 5512 --q "seed=s4"
 *
 * `fit-settle.mjs` reports **"the limb went on: gadget"** on the `refit-1` tree. Before claiming
 * that is pre-existing, ask what it actually staged. Its selector is
 *
 *     e.limbField.items.find((i) => i.inWorld && i.socketKind === 'arm')
 *
 * and `LimbField.spawnGadget` tags **every arm gadget `socketKind: 'arm'`** (only skates get
 * their own kind — see its comment). The world is seeded with the ball, the nailgun, the oil and
 * the grapple before anything is ever detached, so "the first loose arm-kind thing in array
 * order" is a GADGET, and the probe then fits a gadget and asserts it is a limb. That is the same
 * defect `sledge-check`'s own header records twice and `slowframes`'s header a third time.
 *
 * 🚨 **THIS DOES NOT RE-DERIVE `interact()`.** It replays `fit-settle`'s selector verbatim, prints
 * what it chose, and separately reports what `interact()` was handed — so the answer is a fact
 * about the field's contents, not an argument about the branch order. If the selector picks the
 * detached arm, the red IS mine and this says so.
 */
export default async function fitSettleWhy({ page, note, pass, fail }) {
  const before = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return e.limbField.items.map((i) => ({
      id: String(i.id), type: i.type, kind: i.socketKind, gadget: i.gadget ?? null, inWorld: i.inWorld,
    }));
  });
  note(`field at spawn (${before.length}): ${before.map((i) => `${i.type}/${i.kind}${i.gadget ? `:${i.gadget}` : ''}`).join(' ')}`);

  const out = await page.evaluate(async () => {
    const e = window.__rrr.engine, p = e.player, room = e.room;
    p.pos.copy(room.anchor('gallery.mid')); p.vel.set(0, 0, 0);
    await new Promise((r) => setTimeout(r, 800));

    // fit-settle's own setup, verbatim
    const detached = p.rig.occupant('shoulderR') === 'limb' ? p.rig.detach('shoulderR') : null;
    await new Promise((r) => setTimeout(r, 1400));
    const chosen = e.limbField.items.find((i) => i.inWorld && i.socketKind === 'arm');
    if (chosen) chosen.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
    p.vel.set(0, 0, 0);
    await new Promise((r) => setTimeout(r, 700));

    // what the game itself would act on, at the game's own radius
    const near = e.limbField.nearest(p.pos, e.eReach ?? 1.25);
    const r = p.interact(e.limbField, 1.25, 'shoulderR');
    return {
      detachedId: detached ? String(detached.id) : null,
      chosenId: chosen ? String(chosen.id) : null,
      chosenType: chosen?.type ?? null,
      chosenGadget: chosen?.gadget ?? null,
      nearId: near ? String(near.id) : null,
      nearType: near?.type ?? null,
      nearGadget: near?.gadget ?? null,
      kind: r?.kind ?? null,
      socket: r?.socket ?? null,
      occ: p.rig.occupant('shoulderR'),
    };
  });
  note(`fit-settle staged: ${out.chosenType}${out.chosenGadget ? `:${out.chosenGadget}` : ''} (${out.chosenId})`);
  note(`it had detached:  ${out.detachedId}`);
  note(`nearest at press: ${out.nearType}${out.nearGadget ? `:${out.nearGadget}` : ''} (${out.nearId})`);
  note(`interact() -> ${out.kind} on ${out.socket}; shoulderR is now ${out.occ}`);

  // The verdict is about the SELECTOR, not about the branch order.
  if (out.chosenType === 'gadget') {
    pass('fit-settle staged a GADGET, not the arm it detached',
      `it chose ${out.chosenGadget} (${out.chosenId}) while its own detach produced ${out.detachedId} — "the limb went on: gadget" is its selector, not the fitting rule`);
  } else if (out.chosenId && out.chosenId === out.detachedId) {
    fail('fit-settle staged a GADGET, not the arm it detached',
      `it staged the detached arm ${out.chosenId} and shoulderR still ended up ${out.occ} — this red IS the fitting rule`);
  } else {
    fail('fit-settle staged a GADGET, not the arm it detached',
      `inconclusive: chose ${out.chosenId} (${out.chosenType}), detached ${out.detachedId}, occ ${out.occ}`);
  }

  // CONTROL: hand `interact()` the arm it actually detached, same socket, same call. If that
  // does not put a LIMB on, the check above is excusing a real defect.
  const ctrl = await page.evaluate(async () => {
    const e = window.__rrr.engine, p = e.player;
    if (p.rig.occupant('shoulderR') === 'gadget') p.rig.detach('shoulderR');
    await new Promise((r) => setTimeout(r, 600));
    const arm = e.limbField.items.find((i) => i.inWorld && i.type === 'limb' && i.socketKind === 'arm');
    if (!arm) return { ok: false, why: 'no loose plain arm' };
    for (const i of e.limbField.items) {
      if (i === arm || !i.inWorld) continue;
      if (i.root.position.distanceToSquared(p.pos) > 3 * 3) continue;
      i.root.position.set(p.pos.x + 6, e.room.floorY + 0.1, p.pos.z);
      i.vel.set(0, 0, 0); i.spin.set(0, 0, 0);
    }
    arm.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
    arm.vel.set(0, 0, 0); arm.spin.set(0, 0, 0);
    await new Promise((r) => setTimeout(r, 700));
    const r = p.interact(e.limbField, 1.25, 'shoulderR');
    return { ok: true, kind: r?.kind ?? null, socket: r?.socket ?? null, occ: p.rig.occupant('shoulderR') };
  });
  note(`CONTROL (a real arm staged): ${JSON.stringify(ctrl)}`);
  (ctrl.ok && ctrl.occ === 'limb')
    ? pass('CONTROL: the same call with a real arm staged puts a LIMB on', `${ctrl.kind} on ${ctrl.socket}`)
    : fail('CONTROL: the same call with a real arm staged puts a LIMB on', JSON.stringify(ctrl));

  /**
   * 🐞 **AND A SECOND QUESTION, FOUND WHILE READING THE BRANCH `interact()` HANDS A WORLD GADGET
   * TO — ✅ SINCE FIXED, so this now passes and is kept as the record of what it looked like.**
   * Every other acquisition path consumes the pickup:
   * `interact()`'s sledge branch and its skates branch both call `field.take(item)` and
   * `item.root.removeFromParent()`, and `LimbRig.attach()` does the same for a limb and for a
   * gadget ARM that fell off with its gun (`item.gadgetObj` set). The one path that does neither
   * is the one a world gadget takes: `attach()` sees `type === 'gadget'` with no `gadgetObj` and
   * returns `fitGadget(socket, item.gadget).ok` on the line before the `field.take()`.
   *
   * If that leaves the pickup registered and parented, the prop is still lying there after you
   * are wearing it, `nearest()` keeps offering it, and the nail gun is inexhaustible — which is
   * adjacent to John's report and would read to him as the same fault. **Asked of the field, not
   * of the source.** Measured pre-fix: loose **8 → 9**, `inField` and `parented` both true,
   * offered again, and a second press giving **`nailgun,nailgun` from one pickup**.
   */
  const leak = await page.evaluate(async () => {
    const e = window.__rrr.engine, p = e.player;
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) === 'gadget') p.rig.detach(s);
    await new Promise((r) => setTimeout(r, 400));
    if (p.rig.occupant('shoulderR') === 'limb') p.rig.detach('shoulderR');
    await new Promise((r) => setTimeout(r, 600));
    const gun = e.limbField.items.find((i) => i.inWorld && i.gadget === 'nailgun' && i.type === 'gadget');
    if (!gun) return { ok: false, why: 'no world nailgun loose' };
    for (const i of e.limbField.items) {
      if (i === gun || !i.inWorld) continue;
      if (i.root.position.distanceToSquared(p.pos) > 3 * 3) continue;
      i.root.position.set(p.pos.x + 6, e.room.floorY + 0.1, p.pos.z);
      i.vel.set(0, 0, 0); i.spin.set(0, 0, 0);
    }
    gun.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
    gun.vel.set(0, 0, 0); gun.spin.set(0, 0, 0);
    await new Promise((r) => setTimeout(r, 700));
    const before = e.limbField.items.filter((i) => i.inWorld).length;
    const r1 = p.interact(e.limbField, 1.25, 'shoulderR');
    await new Promise((r) => setTimeout(r, 300));
    // is the prop still on offer, and does a SECOND press mint a second gun?
    const stillThere = !!e.limbField.items.find((i) => i === gun && i.inWorld);
    const stillParented = !!gun.root.parent;
    const offeredAgain = e.limbField.nearest(p.pos, e.eReach ?? 1.25) === gun;
    // ⚠️ WAIT OUT `_interactCd` (0.35 s, set by the press above) BEFORE ASKING AGAIN. The first
    // draft pressed 300 ms later and read `null` — the cooldown refusing the call, which is
    // correct behaviour and says nothing about whether a second gun can be minted.
    await new Promise((r) => setTimeout(r, 700));
    const r2 = offeredAgain ? p.interact(e.limbField, 1.25, 'shoulderL') : null;
    return {
      ok: true, before, after: e.limbField.items.filter((i) => i.inWorld).length,
      first: r1?.kind ?? null, occR: p.rig.occupant('shoulderR'),
      stillThere, stillParented, offeredAgain,
      second: r2?.kind ?? null, occL: p.rig.occupant('shoulderL'),
      gadgets: p.rig.caps.armGadgets.join(',') || '-',
    };
  });
  note(`world-gadget pickup: ${JSON.stringify(leak)}`);
  if (!leak.ok) {
    note(`skipped the pickup-consumption question: ${leak.why}`);
  } else {
    (!leak.stillThere && !leak.stillParented)
      ? pass('fitting a world gadget consumes the pickup', `loose ${leak.before} -> ${leak.after}, shoulderR ${leak.occR}`)
      : fail('fitting a world gadget consumes the pickup',
        `NOT refit-1's — attach()'s gadget branch returns fitGadget() before field.take(): loose ${leak.before} -> ${leak.after}, still in field ${leak.stillThere}, still parented ${leak.stillParented}, offered again ${leak.offeredAgain}, a second press gave "${leak.second}" -> arms wearing ${leak.gadgets}`);
  }
}
