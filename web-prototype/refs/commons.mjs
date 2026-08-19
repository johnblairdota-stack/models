// Search Wikimedia Commons for images and print direct URLs + sizes
const queries = process.argv.slice(2);
const UA = 'RunRobotRun-RefGather/1.0 (johnblairdota@gmail.com)';

for (const q of queries) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  u.searchParams.set('action', 'query');
  u.searchParams.set('format', 'json');
  u.searchParams.set('generator', 'search');
  u.searchParams.set('gsrsearch', q);
  u.searchParams.set('gsrnamespace', '6');
  u.searchParams.set('gsrlimit', '25');
  u.searchParams.set('prop', 'imageinfo');
  u.searchParams.set('iiprop', 'url|size|mime');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let r = null;
    for (let a = 0; a < 5; a++) {
      try { r = await fetch(u, { headers: { 'user-agent': UA } }); if (r.ok) break; } catch (e) { r = null; }
      await sleep(2500 * (a + 1));
    }
    if (!r || !r.ok) { console.log('\n=== ' + q + ' ===\n  FAILED'); continue; }
    const j = await r.json();
    console.log('\n=== ' + q + ' ===');
    const pages = j?.query?.pages;
    if (!pages) { console.log('  (no results)'); continue; }
    for (const k of Object.keys(pages)) {
      const p = pages[k];
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      if (!/^image\/(jpeg|png|webp)$/.test(ii.mime || '')) continue;
      console.log(`${ii.width}x${ii.height}\t${p.title}\t${ii.url}`);
    }
  } catch (e) { console.log('ERR', q, e.message); }
}
