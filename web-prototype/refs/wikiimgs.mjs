// List images used on a wiki page (any MediaWiki), with direct URLs + sizes.
// usage: node wikiimgs.mjs <apiBase> <PageTitle> [PageTitle...]
const [apiBase, ...titles] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

for (const t of titles) {
  const u = new URL(apiBase);
  u.searchParams.set('action', 'query');
  u.searchParams.set('format', 'json');
  u.searchParams.set('generator', 'images');
  u.searchParams.set('titles', t);
  u.searchParams.set('gimlimit', '200');
  u.searchParams.set('prop', 'imageinfo');
  u.searchParams.set('iiprop', 'url|size|mime');
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA } });
    const txt = await r.text();
    if (!r.ok) { console.log('HTTP', r.status, t, txt.slice(0, 200)); continue; }
    const j = JSON.parse(txt);
    console.log('\n=== ' + t + ' ===');
    const pages = j?.query?.pages || {};
    for (const k of Object.keys(pages)) {
      const p = pages[k];
      const ii = p.imageinfo?.[0];
      if (!ii) { continue; }
      if (!/^image\/(jpeg|png|webp)$/.test(ii.mime || '')) continue;
      console.log(`${ii.width}x${ii.height}\t${p.title}\t${ii.url}`);
    }
  } catch (e) { console.log('ERR', t, e.message); }
}
