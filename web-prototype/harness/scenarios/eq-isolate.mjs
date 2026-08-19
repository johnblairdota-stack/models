/** Is E broken in the INPUT layer or the LOGIC layer? Call interact() directly and compare. */
export default async function iso({ page, note, pass, fail }) {
  await page.evaluate(() => window.__rrr.engine.player.rig.detach('hipR'));
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.find((i) => i.inWorld);
    if (it) { it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z); }
  });
  await page.waitForTimeout(400);

  // 1. LOGIC layer: call it directly, bypassing input entirely.
  const direct = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const before = { held: p.rig.held?.label ?? null, cd: +(p._interactCd ?? -1).toFixed(3) };
    const near = e.limbField.nearest(p.pos, 1.25);
    const r = p.interact(e.limbField);
    return {
      before,
      nearFound: near ? near.label : null,
      nearKind: near ? near.socketKind : null,
      result: r ? r.kind : null,
      after: { held: p.rig.held?.label ?? null },
      freeHand: p.rig._freeHandSide ? p.rig._freeHandSide() : 'n/a',
      sockets: ['hipL', 'hipR', 'shoulderL', 'shoulderR'].map((s) => `${s}:${p.rig.occupant(s)}`),
    };
  });
  note(`DIRECT interact(): ${JSON.stringify(direct)}`);
  if (direct.result) pass('logic layer works when called directly', direct.result);
  else fail('logic layer works when called directly', `returned null; sockets=${direct.sockets} freeHand=${direct.freeHand} near=${direct.nearFound}/${direct.nearKind}`);

  // 2. INPUT layer: does the key even reach consume()?
  const seen = await page.evaluate(() => {
    const e = window.__rrr.engine;
    window.__eqSeen = [];
    const inp = e.input ?? e._input;
    if (!inp) return 'no input object on engine';
    const orig = inp.consume.bind(inp);
    inp.consume = (k) => { const v = orig(k); if (v) window.__eqSeen.push(k); return v; };
    return 'hooked';
  });
  note(`input hook: ${seen}`);
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(500);
  const keys = await page.evaluate(() => window.__eqSeen ?? null);
  note(`consume() saw: ${JSON.stringify(keys)}`);
  if (keys && keys.length) pass('input layer delivers E/Q to consume()', keys.join(','));
  else fail('input layer delivers E/Q to consume()', `consume() never returned true for E or Q (saw ${JSON.stringify(keys)})`);
}
