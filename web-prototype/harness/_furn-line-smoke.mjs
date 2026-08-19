/**
 * Smoke: ?furnline=1 places 16 Meshy smash props.
 */
export default async function run({ page, pass, fail, note, waitFor }) {
  await waitFor?.(2000);
  const info = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e) return null;
    const fps = (e.room?.furnProps ?? []).filter((f) => String(f.id).startsWith('lineup.'));
    return {
      placed: e.__furnLineup?.placed ?? null,
      missing: e.__furnLineup?.missing ?? null,
      lineupCount: fps.length,
      ids: fps.map((f) => f.id),
      furnLine: !!e.__furnLine,
      sledge: !!e.player?.sledge?.owned,
    };
  });
  if (!info) {
    fail('furnline engine', 'no engine');
    return;
  }
  note(`furnline: ${JSON.stringify(info)}`);
  if (info.lineupCount === 16) pass('evidence: furnline placed 16', String(info.lineupCount));
  else fail('evidence: furnline placed 16', `${info.lineupCount} missing=${JSON.stringify(info.missing)}`);
  if (info.sledge) pass('evidence: sledge equipped', 'true');
  else fail('evidence: sledge equipped', String(info.sledge));
  if (info.furnLine) pass('evidence: park arm ran', 'true');
  else fail('evidence: park arm ran', String(info.furnLine));
}
