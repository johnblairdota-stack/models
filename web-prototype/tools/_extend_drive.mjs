import { readFileSync, writeFileSync } from 'fs';
const p = 'harness/_overnight_post20.mjs';
let s = readFileSync(p, 'utf8');
const marker = "  await host.screenshot({ path: path.join(OUT, 'expedition.png') }).catch(() => {});";
const insert = `  await host.screenshot({ path: path.join(OUT, 'expedition.png') }).catch(() => {});
  const phoneMid = await phones[0].page.evaluate(() => {
    const t = document.body?.innerText || '';
    return { hasTimeHeading: /\\bTIME\\b/.test(t), hasCaught: /\\bCAUGHT\\b/.test(t), top: t.slice(0, 280).replace(/\\n/g, ' | ') };
  });
  note('PHONE_MID', phoneMid);

  for (let i = 0; i < 30; i++) {
    const beat = await host.evaluate(() => window.__rrrHost?.beat);
    if (beat === 'recap') break;
    const fr = host.frames().find((f) => f !== host.mainFrame());
    if (fr) {
      await fr.evaluate(() => {
        parent.postMessage({
          t: 'follow',
          world: {
            runner: { room: 'ballroom', x: 0, y: 0 },
            hunter: { room: 'hall', x: 1, y: 0 },
            mission: { phase: 'done', room: 'gallery' },
          },
        }, '*');
      }).catch(() => {});
    }
    await sleep(700);
  }
  await sleep(1200);
  await host.screenshot({ path: path.join(OUT, 'recap-tv.png') }).catch(() => {});
  await phones[0].page.screenshot({ path: path.join(OUT, 'recap-p1.png') }).catch(() => {});
  const recapTv = await host.evaluate(() => {
    const t = document.body?.innerText || '';
    const chrome = document.querySelector('.night-phase')?.textContent || '';
    return {
      beat: window.__rrrHost?.beat, episode: window.__rrrHost?.episode, chrome,
      smashed: /\\bSMASHED\\b/.test(t), time: /\\bTIME\\b/.test(t), caught: /\\bCAUGHT\\b/.test(t),
      producerChair: /Producer chair|spike the Hunter/i.test(t),
      mapOnTv: !!document.querySelector('svg.guide-map') || /YOU ARE HERE/i.test(t),
      roleOnTv: /YOU ARE (GOOD|PRODUCTION)/i.test(t),
    };
  });
  note('RECAP_TV', recapTv);
  const recapPhone = await phones[0].page.evaluate(() => {
    const t = document.body?.innerText || '';
    return {
      h1: document.querySelector('h1')?.textContent || '',
      smashed: /\\bSMASHED\\b/.test(t), time: /\\bTIME\\b/.test(t), caught: /\\bCAUGHT\\b/.test(t),
      phonesDown: /Phones down/i.test(t), top: t.slice(0, 360).replace(/\\n/g, ' | '),
    };
  });
  note('RECAP_PHONE', recapPhone);`;
if (!s.includes(marker)) { console.error('marker missing'); process.exit(1); }
if (s.includes('PHONE_MID')) { console.log('already extended'); process.exit(0); }
s = s.replace(marker, insert);
s = s.replace(
  "const verdict = {\n    code: CODE,\n    lobby: log.find((x) => x.k === 'HOST_LOBBY')?.v,\n    casting: log.find((x) => x.k === 'HOST_CASTING')?.v,\n    liveEps: eps,\n    fixed: eps.length === 1 && eps[0] === 1,\n    stillBroken: eps.includes(2),\n    last: samples.at(-1),\n  };",
  "const phoneMid = log.find((x) => x.k === 'PHONE_MID')?.v;\n  const recapTv = log.find((x) => x.k === 'RECAP_TV')?.v;\n  const recapPhone = log.find((x) => x.k === 'RECAP_PHONE')?.v;\n  const verdict = {\n    code: CODE,\n    lobby: log.find((x) => x.k === 'HOST_LOBBY')?.v,\n    casting: log.find((x) => x.k === 'HOST_CASTING')?.v,\n    liveEps: eps,\n    fixed: eps.length === 1 && eps[0] === 1,\n    stillBroken: eps.includes(2),\n    last: samples.at(-1),\n    phoneMidNoTimeInvent: phoneMid && phoneMid.hasTimeHeading === false,\n    recapTv,\n    recapPhone,\n    phoneShowsServerEnd: !!(recapPhone && (recapPhone.smashed || recapPhone.h1 === 'SMASHED' || recapPhone.h1 === 'TIME')),\n    noCaught: !(recapTv?.caught || recapPhone?.caught),\n  };"
);
s = s.replace(
  'process.exit(verdict.fixed ? 0 : 3);',
  'const ok = verdict.fixed && verdict.noCaught && !verdict.stillBroken;\n  process.exit(ok ? 0 : 3);'
);
writeFileSync(p, s);
console.log('extended ok');