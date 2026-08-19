/** attachments.md step 1: honest prompts + hold-Q eject. */
export default async function ejectPrompt({ page, note, pass, fail, shot }) {
  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const hud = document.querySelector('.rrr-hud');
    const prompt = [...(hud?.querySelectorAll('*') ?? [])]
      .map((n) => n.textContent).find((t) => t && t.startsWith('[E]')) ?? null;
    return {
      prompt,
      sockets: ['hipL', 'hipR', 'shoulderL', 'shoulderR'].map((s) => `${s}:${p.rig.occupant(s)}`).join(' '),
      loose: e.limbField.items.filter((i) => i.inWorld).length,
      weapon: p.rig.activeWeapon,
    };
  });

  // 1. HONEST PROMPT: only a LEG socket open, an ARM underfoot -> must NOT offer FIT.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    if (p.rig.occupant('hipR') === 'limb') p.rig.detach('hipR');       // leg socket now empty
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const arm = e.limbField.items.find((i) => i.inWorld && i.socketKind === 'arm');
    if (arm) arm.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
    const leg = e.limbField.items.find((i) => i.inWorld && i.socketKind === 'leg');
    if (leg) leg.root.position.set(p.pos.x + 40, e.room.floorY, p.pos.z + 40);  // far away
  });
  await page.waitForTimeout(600);
  const r1 = await read();
  note(`arm underfoot, only a LEG socket open -> prompt=${JSON.stringify(r1.prompt)}  [${r1.sockets}]`);
  await shot('ep0-mismatch');
  if (r1.prompt && /FIT/.test(r1.prompt)) fail('prompt does not promise an impossible FIT', `showed ${r1.prompt}`);
  else pass('prompt does not promise an impossible FIT', `showed ${JSON.stringify(r1.prompt)}`);

  // 2. HOLD Q ejects the fitted gadget
  const before = await read();
  note(`before hold-Q: ${before.sockets} weapon=${before.weapon} loose=${before.loose}`);
  await page.keyboard.down('KeyQ');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyQ');
  await page.waitForTimeout(600);
  const after = await read();
  note(`after  hold-Q: ${after.sockets} weapon=${after.weapon} loose=${after.loose}`);
  await shot('ep1-after-eject');
  if (after.loose > before.loose) pass('hold-Q ejects a fitted part to the floor', `loose ${before.loose}->${after.loose}, weapon ${before.weapon}->${after.weapon}`);
  else fail('hold-Q ejects a fitted part to the floor', `loose unchanged at ${after.loose}`);

  // 3. and it is RECOVERABLE, per John's decision
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.find((i) => i.inWorld && i.socketKind === 'arm');
    if (it) it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
  });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(600);
  const back = await read();
  note(`after recovering: ${back.sockets} weapon=${back.weapon}`);
  if (back.loose < after.loose) pass('an ejected part can be picked back up', `loose ${after.loose}->${back.loose}`);
  else fail('an ejected part can be picked back up', `loose still ${back.loose}`);
}
