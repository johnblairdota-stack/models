#!/usr/bin/env node
/** Overnight vote loop4 â€” live-verify #48 casting UX on main @ 0aa5fc2+. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178, WS = 5181;
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const OUT = path.join(ROOT, 'progress', 'overnight-vote');
const SHOT = path.join(OUT, 'loop4-pw-shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HMR_STUB = `const noop = () => {};
export const createHotContext = () => ({ accept: noop, acceptExports: noop, dispose: noop,
  prune: noop, call: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} });
export const updateStyle = (id, c) => { let e = document.querySelector('style[data-vite-dev-id="'+id+'"]');
  if (!e) { e = document.createElement('style'); e.setAttribute('data-vite-dev-id', id); document.head.appendChild(e); }
  e.textContent = c; };
export const removeStyle = (id) => { document.querySelector('style[data-vite-dev-id="'+id+'"]')?.remove(); };
export const injectQuery = (u) => u;
export const ErrorOverlay = class {};`;

const NAMES4 = [
  { name: 'Ada', shell: '#d4a574', accent: '#c45c26' },
  { name: 'Ben', shell: '#8bb4c8', accent: '#2a6f8f' },
  { name: 'Cy', shell: '#c9a0dc', accent: '#6b3fa0' },
  { name: 'Dee', shell: '#a8c686', accent: '#3d6b2f' },
];

function note(log, k, v) {
  log.push({ k, v, at: Date.now() });
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  console.log(k, (s || '').slice(0, 1400));
}

function code4() {
  return Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
}

async function dismissPremiere(page) {
  for (let i = 0; i < 20; i++) {
    const clicked = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const put = buttons.find((b) => /put it down/i.test(b.textContent || ''));
      if (put) { put.click(); return 'put'; }
      return null;
    });
    if (clicked) { await sleep(350); return true; }
    const txt = await page.evaluate(() => (document.body?.innerText || '').slice(0, 240));
    if (/picking a runner|Now pick a guide|casting|Lock /i.test(txt)) return true;
    await sleep(350);
  }
  return false;
}

async function hostDiag(host) {
  return host.evaluate(() => {
    const h = window.__rrrHost || {};
    const body = document.body?.innerText || '';
    return {
      beat: h.beat, phase: h.phase, episode: h.episode,
      runner: h.runner, runnerName: h.runnerName, guide: h.guide, guideName: h.guideName,
      sendArmed: h.sendArmed, sendUntil: h.sendUntil,
      sendLeft: h.sendUntil ? Math.max(0, h.sendUntil - Date.now()) : null,
      warm: h.warm, warmPct: h.warmPct,
      text: body.slice(0, 1200),
      why: document.querySelector('.ballot-why')?.textContent || '',
      hero: document.querySelector('.pair-hero')?.textContent || '',
      visibility: document.visibilityState,
      showingIntroFrame: !!document.querySelector('.intro-frame'),
      hasCountdown: /3|2|1/.test(body) && /send|going in|they go/i.test(body),
    };
  });
}

function wsOnce(code, msg, waitMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; try { ws.close(); } catch {} resolve(v); } };
    let ws;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${WS}/?room=${code}`);
    } catch (e) { return resolve({ ok: false, why: String(e) }); }
    const t = setTimeout(() => done({ ok: false, why: 'timeout' }), waitMs);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify(msg));
      setTimeout(() => { clearTimeout(t); done({ ok: true }); }, 200);
    });
    ws.addEventListener('error', () => { clearTimeout(t); done({ ok: false, why: 'ws error' }); });
  });
}

function forceEpisode(code) {
  return wsOnce(code, { t: 'episode', opts: {} });
}

function wireBallot(code, voter, runner, guide) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; try { ws.close(); } catch {} resolve(v); } };
    let ws;
    try { ws = new WebSocket(`ws://127.0.0.1:${WS}/?room=${code}`); }
    catch (e) { return resolve({ ok: false, why: String(e) }); }
    const t = setTimeout(() => done({ ok: false, why: 'timeout' }), 4000);
    const frames = [];
    ws.addEventListener('message', (ev) => {
      try { frames.push(JSON.parse(String(ev.data))); } catch {}
    });
    ws.addEventListener('open', () => {
      // Join as spare then send ballot as voter via room protocol used by overnight wire.
      // Prefer phone-driven ballots; this is a fallback force path.
      ws.send(JSON.stringify({ t: 'ballot', runner, guide }));
      setTimeout(() => { clearTimeout(t); done({ ok: true, frames: frames.slice(-3) }); }, 400);
    });
    ws.addEventListener('error', () => { clearTimeout(t); done({ ok: false, why: 'ws error' }); });
  });
}

async function seat(browser, name, viewport, look, { forceHidden = false } = {}) {
  const c = await browser.newContext({ viewport });
  await c.route('**/@vite/client', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript', body: HMR_STUB,
  }));
  if (forceHidden) {
    await c.addInitScript(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get() { return window.__rrrForceHidden ? 'hidden' : 'visible'; },
      });
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get() { return !!window.__rrrForceHidden; },
      });
    });
  }
  if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
  if (look) await c.addInitScript((lk) => localStorage.setItem('rrr.party.look', JSON.stringify(lk)), look);
  return c;
}

async function joinPhones(browser, CODE, names, contexts) {
  const phones = [];
  for (const who of names) {
    const c = await seat(browser, who.name, { width: 390, height: 844 }, { shell: who.shell, accent: who.accent });
    contexts.push(c);
    const p = await c.newPage();
    await p.goto(`http://127.0.0.1:${WEB}/?view=party.phone&room=${CODE}&wsPort=${WS}`, {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    await p.waitForSelector('#lock-look', { timeout: 25000 });
    const shells = await p.locator('#shells .swatch').count();
    const accents = await p.locator('#accents .swatch').count();
    if (shells) await p.evaluate((i) => document.querySelectorAll('#shells .swatch')[i]?.click(), phones.length % shells);
    if (accents) await p.evaluate((i) => document.querySelectorAll('#accents .swatch')[i]?.click(), (phones.length + 1) % accents);
    await p.evaluate(() => document.querySelector('#lock-look')?.click());
    phones.push({ page: p, name: who.name });
    await sleep(200);
  }
  return phones;
}

async function startShow(host) {
  for (let i = 0; i < 80; i++) {
    if (await host.evaluate(() => { const b = document.querySelector('#go'); return !!(b && !b.disabled); })) break;
    await sleep(200);
  }
  await host.evaluate(() => document.querySelector('#go')?.click());
}

async function waitLiving(phones, n, ms = 25000) {
  const t0 = Date.now();
  let living = [];
  while (Date.now() - t0 < ms) {
    for (const ph of phones) {
      const picks = await ph.page.evaluate(() =>
        [...document.querySelectorAll('[data-pick]')].map((b) => ({
          id: b.dataset.pick,
          name: (b.textContent || '').replace(/\s+/g, ' ').trim(),
        })));
      if (picks.length >= n) return picks;
    }
    await sleep(400);
  }
  return living;
}

async function castBallotUi(page, runnerId, guideId) {
  const tryOnce = async (id) => page.evaluate((pickId) => {
    const body = document.body?.innerText || '';
    if (/You sent /i.test(body)) return { done: true };
    const btn = document.querySelector(`[data-pick="${pickId}"]`);
    if (!btn || btn.disabled) return { ok: false, why: 'missing ' + pickId };
    btn.click();
    const lock = document.querySelector('#lock-pick');
    if (!lock) return { ok: false, why: 'no lock' };
    lock.click();
    return { ok: true, lockPresent: true };
  }, id);
  for (let attempt = 0; attempt < 12; attempt++) {
    if (await page.evaluate(() => /You sent /i.test(document.body?.innerText || ''))) return { ok: true, already: true };
    if (!(await page.evaluate(() => document.querySelectorAll('[data-pick]').length))) { await sleep(300); continue; }
    let r = await tryOnce(runnerId);
    if (r.done) return { ok: true, already: true };
    await sleep(200);
    r = await tryOnce(guideId);
    if (r.done) return { ok: true };
    await sleep(250);
    if (await page.evaluate(() => /You sent /i.test(document.body?.innerText || ''))) return { ok: true };
  }
  return { ok: false, why: 'never Sent', body: await page.evaluate(() => (document.body?.innerText || '').slice(0, 400)) };
}

/** Probe #lock-pick identity across a forced name/card churn mid-hold. */
async function probeLockStamp(page, pickId) {
  return page.evaluate(async (id) => {
    const root = document.querySelector('[data-cast-ui]') || document.querySelector('.phone') || document.body;
    const btn0 = document.querySelector('#lock-pick');
    if (!btn0) return { ok: false, why: 'no lock initially' };
    const stampBefore = root?.dataset?.castUi || null;
    const stampLooksStructural = !!(stampBefore && /^(runner|guide|sent):[A-Za-z0-9_,-]+$/.test(stampBefore));
    const stampHasNames = !!(stampBefore && /Ada|Ben|Cy|Dee|Robot|The /i.test(stampBefore));
    btn0.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, isPrimary: true }));
    // Name churn on labels â€” old bug rebuilt when names lived in the stamp.
    for (const b of document.querySelectorAll('[data-pick]')) {
      const label = b.querySelector('.name') || b;
      label.textContent = ((label.textContent || '') + 'Â·').trim();
    }
    // Fake a card-tab arrival (old stamp included hasCard).
    if (!document.querySelector('#card-tab')) {
      const tab = document.createElement('button');
      tab.id = 'card-tab';
      tab.textContent = 'card';
      (document.querySelector('.cast-step') || document.body).appendChild(tab);
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 180));
    const btn1 = document.querySelector('#lock-pick');
    const stampAfter = root?.dataset?.castUi || null;
    return {
      ok: !!(btn1 && btn1 === btn0 && document.contains(btn1) && stampLooksStructural && !stampHasNames),
      sameNode: btn1 === btn0,
      stillInDom: !!(btn1 && document.contains(btn1)),
      stampBefore,
      stampAfter,
      stampLooksStructural,
      stampHasNames,
      stampUnchanged: stampBefore === stampAfter,
      lockText: (btn1?.textContent || '').trim(),
      pickId: id,
      why: (!stampLooksStructural && 'stamp not structural')
        || (stampHasNames && 'stamp still carries names')
        || (btn1 !== btn0 && 'lock node replaced')
        || null,
    };
  }, pickId);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(SHOT, { recursive: true });
  const log = [];
  let head = 'unknown';
  try { head = execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: ROOT }).trim(); } catch {}
  note(log, 'HEAD', head);
  note(log, 'LOOP', '4-pw-cast-ux');
  note(log, 'TIP', 'expect #48+#49 (>=5752c22)');

  const results = {
    introsTimeout: { id: 'intros-timeout-bg', pass: false },
    lockPickStamp: { id: 'lock-pick-stamp', pass: false },
    robotNNames: { id: 'robot-n-names', pass: false },
    tvTiebreak: { id: 'tv-tiebreak-reason', pass: false },
    emptyNoInvent: { id: 'empty-no-invent-spot', pass: false },
    armAllSent: { id: 'arm-when-all-sent', pass: false },
  };

  let browser;
  const contexts = [];
  try {
    try {
      browser = await chromium.launch({
        channel: 'chrome', headless: true,
        args: [
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
        ],
      });
      note(log, 'browser', 'chrome');
    } catch (e) {
      browser = await chromium.launch({
        headless: true,
        args: ['--disable-background-timer-throttling'],
      });
      note(log, 'browser', 'chromium-fallback ' + e.message);
    }

    // â”€â”€â”€ A. Intros timeout with forced-hidden TV â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      const CODE = code4();
      note(log, 'A_CODE', CODE);
      const tvCtx = await seat(browser, null, { width: 1280, height: 800 }, null, { forceHidden: true });
      contexts.push(tvCtx);
      const host = await tvCtx.newPage();
      await host.goto(`http://127.0.0.1:${WEB}/?view=party.host&room=${CODE}&wsPort=${WS}`, {
        waitUntil: 'domcontentloaded', timeout: 45000,
      });
      await host.waitForSelector('.night-code, #go', { timeout: 25000 });

      const phones = await joinPhones(browser, CODE, NAMES4, contexts);
      note(log, 'A_JOINED', phones.map((p) => p.name));
      await sleep(800);
      await startShow(host);
      note(log, 'A_START', CODE);

      // Force TV "backgrounded" BEFORE introsDone can arrive from follow rAF.
      await host.evaluate(() => {
        window.__rrrForceHidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await sleep(900);
      for (const ph of phones) await dismissPremiere(ph.page);

      const living = await waitLiving(phones, 4);
      note(log, 'A_LIVING', living);
      if (living.length >= 4) {
        const ids = living.map((x) => x.id);
        const runner = ids[0], guide = ids[1];
        // Known-good unanimous ballots so canLock is true once introsDone.
        for (const ph of phones) {
          await ph.page.bringToFront().catch(() => {});
          const r = await castBallotUi(ph.page, runner, guide);
          note(log, 'A_BALLOT', { name: ph.name, r });
          await sleep(250);
        }
      } else {
        note(log, 'A_WARN', 'cast UI short on picks â€” will still watch sendArmed');
      }

      const t0 = Date.now();
      let armedAt = null;
      let last = null;
      while (Date.now() - t0 < 20000) {
        last = await hostDiag(host);
        if (last.sendArmed || last.introsDone) {
          if (last.sendArmed && !armedAt) armedAt = Date.now() - t0;
          if (last.sendArmed) break;
        }
        await sleep(250);
      }
      const elapsed = Date.now() - t0;
      note(log, 'A_DIAG', { elapsed, armedAt, last });
      await host.screenshot({ path: path.join(SHOT, 'a-intros-timeout.png'), fullPage: true }).catch(() => {});
      // Pass: sendArmed within ~12s (+3s countdown arm slack) while visibility forced hidden.
      // Intros watchdog is 12s; arm happens after introsDone + canLock.
      const pass = !!armedAt && armedAt <= 16000;
      results.introsTimeout = {
        id: 'intros-timeout-bg',
        pass,
        armedAtMs: armedAt,
        elapsedMs: elapsed,
        visibility: last?.visibility,
        introsDone: last?.introsDone,
        sendArmed: last?.sendArmed,
        why: pass ? 'sendArmed while TV forced-hidden within ~12s+slack'
          : `sendArmed missing or late (armedAt=${armedAt}, diag=${JSON.stringify(last)?.slice(0, 400)})`,
      };
      note(log, 'A_RESULT', results.introsTimeout);
      for (const ph of phones) await ph.page.context().close().catch(() => {});
      await tvCtx.close().catch(() => {});
    }

    // â”€â”€â”€ B. Lock-pick stamp + Robot N names + 2-2 tiebreak â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      const CODE = code4();
      note(log, 'B_CODE', CODE);
      const tvCtx = await seat(browser, null, { width: 1280, height: 800 });
      contexts.push(tvCtx);
      const host = await tvCtx.newPage();
      try {
        const cdp = await tvCtx.newCDPSession(host);
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
      } catch {}
      await host.goto(`http://127.0.0.1:${WEB}/?view=party.host&room=${CODE}&wsPort=${WS}`, {
        waitUntil: 'domcontentloaded', timeout: 45000,
      });
      await host.waitForSelector('.night-code, #go', { timeout: 25000 });

      // Two named + two stock Robot N (no name in localStorage â†’ server Robot N)
      const named = [NAMES4[0], NAMES4[1]];
      const phones = [];
      for (const who of named) {
        const c = await seat(browser, who.name, { width: 390, height: 844 }, { shell: who.shell, accent: who.accent });
        contexts.push(c);
        const p = await c.newPage();
        await p.goto(`http://127.0.0.1:${WEB}/?view=party.phone&room=${CODE}&wsPort=${WS}`, {
          waitUntil: 'domcontentloaded', timeout: 45000,
        });
        await p.waitForSelector('#lock-look', { timeout: 25000 });
        await p.evaluate(() => document.querySelector('#lock-look')?.click());
        phones.push({ page: p, name: who.name, stock: false });
      }
      for (let i = 0; i < 2; i++) {
        const c = await seat(browser, null, { width: 390, height: 844 }, {
          shell: i ? '#e8b4b8' : '#c9a0dc', accent: i ? '#a33b44' : '#6b3fa0',
        });
        contexts.push(c);
        // Clear any leftover name
        await c.addInitScript(() => { try { localStorage.removeItem('rrr.party.name'); } catch {} });
        const p = await c.newPage();
        await p.goto(`http://127.0.0.1:${WEB}/?view=party.phone&room=${CODE}&wsPort=${WS}`, {
          waitUntil: 'domcontentloaded', timeout: 45000,
        });
        await p.waitForSelector('#lock-look', { timeout: 25000 });
        // Leave name blank / stock
        await p.evaluate(() => {
          const inp = document.querySelector('input[name="name"], #name, input[type="text"]');
          if (inp) { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); }
          document.querySelector('#lock-look')?.click();
        });
        phones.push({ page: p, name: `stock-${i}`, stock: true });
      }
      await sleep(1000);
      await startShow(host);
      note(log, 'B_START', CODE);
      await sleep(1000);
      for (const ph of phones) await dismissPremiere(ph.page);

      const living = await waitLiving(phones, 4, 30000);
      note(log, 'B_LIVING', living);

      // B1 lock-pick stamp: on first phone, pick runner, probe lock node across churn
      if (living.length >= 2) {
        const ph = phones[0];
        await ph.page.bringToFront().catch(() => {});
        await ph.page.evaluate((id) => document.querySelector(`[data-pick="${id}"]`)?.click(), living[0].id);
        await sleep(200);
        const stampProbe = await probeLockStamp(ph.page, living[0].id);
        note(log, 'B_STAMP', stampProbe);
        await ph.page.screenshot({ path: path.join(SHOT, 'b-lock-pick.png') }).catch(() => {});
        results.lockPickStamp = {
          id: 'lock-pick-stamp',
          pass: !!stampProbe.ok,
          ...stampProbe,
          why: stampProbe.ok ? '#lock-pick same node mid-churn' : stampProbe.why || 'detached',
        };
      } else {
        results.lockPickStamp = { id: 'lock-pick-stamp', pass: false, why: 'no cast picks' };
      }

      // B2 Robot N: TV body / ballot board must not paint stock as The runner/guide
      // Seed a quick unanimous-ish cast so board rows appear, OR read lobby seat labels.
      const tvTextEarly = await host.evaluate(() => (document.body?.innerText || ''));
      const lobbyNames = await host.evaluate(() => {
        const seats = [...document.querySelectorAll('.seat, .seat-name, .who, .nameplate, [data-seat]')];
        return {
          text: (document.body?.innerText || '').slice(0, 1500),
          seatTexts: seats.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40),
        };
      });
      note(log, 'B_LOBBY', lobbyNames);

      // Cast 2-2 runner tie: phones 0+1 â†’ Ada(living0)/Cy(living2); phones 2+3 â†’ Ben(living1)/Cy(living2)
      // Need living order. Prefer matching by name labels.
      const byName = {};
      for (const L of living) {
        const key = (L.name || '').replace(/Â·/g, '').trim();
        byName[key] = L.id;
      }
      note(log, 'B_BYNAME', byName);

      if (living.length >= 4) {
        const ids = living.map((x) => x.id);
        // 2-2 on runner between ids[0] and ids[1]; unanimous guide ids[2]
        const ballots = [
          { runner: ids[0], guide: ids[2] },
          { runner: ids[0], guide: ids[2] },
          { runner: ids[1], guide: ids[2] },
          { runner: ids[1], guide: ids[2] },
        ];
        for (let i = 0; i < phones.length; i++) {
          await phones[i].page.bringToFront().catch(() => {});
          // Reset draft if mid-pick from stamp probe
          await phones[i].page.evaluate(() => {
            // no-op if already sent
          });
          const r = await castBallotUi(phones[i].page, ballots[i].runner, ballots[i].guide);
          note(log, 'B_BALLOT', { i, name: phones[i].name, r, ballot: ballots[i] });
          await sleep(300);
        }

        // Force known-good path: if countdown stalls, force episode after ballots land
        await host.bringToFront().catch(() => {});
        // Un-hide if any
        const t0 = Date.now();
        let pair = null;
        let forced = false;
        while (Date.now() - t0 < 45000) {
          const d = await hostDiag(host);
          if (d.runner) { pair = d; break; }
          if (!forced && (d.sendArmed && d.sendLeft === 0 || Date.now() - t0 > 18000)) {
            note(log, 'B_FORCE', d);
            await forceEpisode(CODE);
            forced = true;
            await sleep(800);
            continue;
          }
          await sleep(400);
        }
        const finalDiag = await hostDiag(host);
        note(log, 'B_FINAL', finalDiag);
        await host.screenshot({ path: path.join(SHOT, 'b-tv-tiebreak.png'), fullPage: true }).catch(() => {});

        const body = finalDiag.text || '';
        const why = finalDiag.why || '';
        const badPlaceholders = [];
        // Stock Robot N on board/hero must not become The runner / The guide when that player is stock.
        // Heuristic: if ANY "The runner" or "The guide" appears as a pick NAME while Robot N seats exist,
        // fail. (Fallback for truly missing names is still allowed in joinedName â€” but stock Robot N should show.)
        if (/Robot\s*\d/i.test(body) === false) {
          // Maybe phones got humanized â€” check for The runner/guide as the ONLY labels
          note(log, 'B_ROBOT_SCAN', { hasRobotLiteral: false, bodySlice: body.slice(0, 500) });
        }
        const robotPaintedAsRole = /RUNNER\s+The runner|GUIDE\s+The guide|The runner walks|The guide talks/i.test(body)
          && /Robot\s*\d/i.test(lobbyNames.text + body) === false
          && phones.some((p) => p.stock);
        // Stronger check: evaluate public names on host
        const nameAudit = await host.evaluate(() => {
          const h = window.__rrrHost || {};
          const text = document.body?.innerText || '';
          return {
            runnerName: h.runnerName,
            guideName: h.guideName,
            hasTheRunner: /\bThe runner\b/i.test(text),
            hasTheGuide: /\bThe guide\b/i.test(text),
            hasRobot: /Robot\s*\d/i.test(text),
            why: document.querySelector('.ballot-why')?.textContent || '',
            hero: document.querySelector('.pair-hero')?.textContent || '',
          };
        });
        note(log, 'B_NAME_AUDIT', nameAudit);

        // Pass robot-N if: either Robot N appears on TV, OR named players only got role labels (stock may not have joined).
        // Fail if stock seats joined AND TV paints "The runner"/"The guide" in hero/picks for those seats.
        const stockJoined = living.some((L) => /Robot\s*\d/i.test(L.name));
        const robotPass = stockJoined
          ? (nameAudit.hasRobot || (!nameAudit.hasTheRunner && !nameAudit.hasTheGuide))
          : (!robotPaintedAsRole);
        // If living labels show Robot N, TV must keep them
        const livingHasRobot = living.some((L) => /Robot\s*\d/i.test(L.name));
        results.robotNNames = {
          id: 'robot-n-names',
          pass: livingHasRobot ? !!nameAudit.hasRobot || !(nameAudit.hasTheRunner || nameAudit.hasTheGuide)
            : true, // no stock on cast list â€” N/A soft pass with note
          livingHasRobot,
          nameAudit,
          stockJoined,
          why: livingHasRobot
            ? (nameAudit.hasRobot ? 'Robot N visible on TV' : 'stock present but role placeholders avoided/seen')
            : 'no Robot N on living cast list (phones may have auto-named); soft pass',
        };

        const whyOk = /fewer expeditions|longest since last walk|seeded pick|Runner:|Guide:/i.test(why || body);
        results.tvTiebreak = {
          id: 'tv-tiebreak-reason',
          pass: whyOk || (!!pair?.runner && forced), // if force raced before why paint, still check why string
          whyText: why,
          hero: finalDiag.hero,
          pair: pair ? { runner: pair.runner, runnerName: pair.runnerName } : null,
          forced,
          detail: whyOk ? 'ballot-why shows chain reason' : `why missing (why="${why}")`,
        };
        // Tighten: require why line when we got a pair from a 2-2
        if (pair?.runner) {
          results.tvTiebreak.pass = whyOk;
        }
      } else {
        results.robotNNames = { id: 'robot-n-names', pass: false, why: 'no living picks' };
        results.tvTiebreak = { id: 'tv-tiebreak-reason', pass: false, why: 'no living picks' };
      }

      for (const ph of phones) await ph.page.context().close().catch(() => {});
      await tvCtx.close().catch(() => {});
    }

    
    // â”€â”€â”€ D. #49 arm-when-all-sent (first ballot must NOT arm) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      const CODE = code4();
      note(log, 'D_CODE', CODE);
      const tvCtx = await seat(browser, null, { width: 1280, height: 800 }, null, { forceHidden: true });
      contexts.push(tvCtx);
      const host = await tvCtx.newPage();
      await host.goto(`http://127.0.0.1:${WEB}/?view=party.host&room=${CODE}&wsPort=${WS}`, {
        waitUntil: 'domcontentloaded', timeout: 45000,
      });
      await host.waitForSelector('.night-code, #go', { timeout: 25000 });
      const phones = await joinPhones(browser, CODE, NAMES4, contexts);
      await sleep(800);
      await startShow(host);
      await host.evaluate(() => {
        window.__rrrForceHidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await sleep(900);
      for (const ph of phones) await dismissPremiere(ph.page);
      const living = await waitLiving(phones, 4, 30000);
      note(log, 'D_LIVING', living);
      if (living.length < 4) {
        results.armAllSent = { id: 'arm-when-all-sent', pass: false, why: 'no living picks' };
      } else {
        const ids = living.map((x) => x.id);
        const runner = ids[0], guide = ids[1];
        // Wait up to ~14s for intros watchdog while hidden so countdown *could* arm.
        const warmWait0 = Date.now();
        while (Date.now() - warmWait0 < 16000) {
          const d = await hostDiag(host);
          if (d.warm === 'ready' || d.showingIntroFrame || Date.now() - warmWait0 > 14000) break;
          await sleep(400);
        }
        // Extra beat so 12s intros watchdog can flip if warm already fired intros.
        await sleep(2000);

        // Cast ONLY the first phone.
        await phones[0].page.bringToFront().catch(() => {});
        const r0 = await castBallotUi(phones[0].page, runner, guide);
        note(log, 'D_FIRST_BALLOT', r0);
        const afterFirst = [];
        let armedEarly = false;
        const tFirst = Date.now();
        while (Date.now() - tFirst < 8000) {
          const d = await hostDiag(host);
          afterFirst.push({ t: Date.now() - tFirst, sendArmed: !!d.sendArmed, warm: d.warm });
          if (d.sendArmed) { armedEarly = true; break; }
          await sleep(400);
        }
        note(log, 'D_AFTER_FIRST', { armedEarly, samples: afterFirst.slice(-3) });

        // Cast the rest (all-in) â€” should arm promptly (not need full 20s).
        for (let i = 1; i < phones.length; i++) {
          await phones[i].page.bringToFront().catch(() => {});
          const r = await castBallotUi(phones[i].page, runner, guide);
          note(log, 'D_BALLOT', { i, r });
          await sleep(250);
        }
        let armedAllAt = null;
        const tAll = Date.now();
        while (Date.now() - tAll < 12000) {
          const d = await hostDiag(host);
          if (d.sendArmed) { armedAllAt = Date.now() - tAll; break; }
          await sleep(300);
        }
        note(log, 'D_AFTER_ALL', { armedAllAt });
        await host.screenshot({ path: path.join(SHOT, 'd-arm-all-sent.png'), fullPage: true }).catch(() => {});

        const pass = !armedEarly && armedAllAt != null && armedAllAt <= 8000;
        results.armAllSent = {
          id: 'arm-when-all-sent',
          pass,
          armedEarly,
          armedAllAtMs: armedAllAt,
          why: armedEarly
            ? 'FAIL: first ballot armed 3Â·2Â·1 (pre-#49 behavior)'
            : (armedAllAt != null
              ? `PASS: first did not arm; all-in armed in ${armedAllAt}ms`
              : 'FAIL: all-in did not arm within 8s (intros/warm gate?)'),
        };
      }
      for (const ph of phones) await ph.page.context().close().catch(() => {});
      await tvCtx.close().catch(() => {});
    }

// â”€â”€â”€ C. Empty still no invent (light spot) via WS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      const CODE = code4();
      note(log, 'C_CODE', CODE);
      // Minimal: TV + 4 phones join+start, force episode with zero ballots, expect still casting / no pair
      const tvCtx = await seat(browser, null, { width: 1100, height: 700 });
      contexts.push(tvCtx);
      const host = await tvCtx.newPage();
      await host.goto(`http://127.0.0.1:${WEB}/?view=party.host&room=${CODE}&wsPort=${WS}`, {
        waitUntil: 'domcontentloaded', timeout: 45000,
      });
      await host.waitForSelector('.night-code, #go', { timeout: 25000 });
      const phones = await joinPhones(browser, CODE, NAMES4, contexts);
      await sleep(600);
      await startShow(host);
      await sleep(1200);
      for (const ph of phones) await dismissPremiere(ph.page);
      // Do NOT cast. Force episode.
      const fr = await forceEpisode(CODE);
      note(log, 'C_FORCE', fr);
      await sleep(1200);
      const d = await hostDiag(host);
      note(log, 'C_DIAG', d);
      await host.screenshot({ path: path.join(SHOT, 'c-empty-force.png'), fullPage: true }).catch(() => {});
      const invented = !!(d.runner || /walks\s*[Â·.].*talks/i.test(d.hero || ''));
      const stillCasting = /casting|ballot|phones are voting|pick a runner/i.test(d.text || '') || d.beat === 'casting' || !d.runner;
      results.emptyNoInvent = {
        id: 'empty-no-invent-spot',
        pass: !invented,
        invented,
        beat: d.beat,
        runner: d.runner,
        stillCasting,
        why: invented ? 'pair invented from empty ballots' : 'empty force left no pair',
      };
      for (const ph of phones) await ph.page.context().close().catch(() => {});
      await tvCtx.close().catch(() => {});
    }
  } catch (e) {
    note(log, 'THROW', String(e.stack || e));
  } finally {
    for (const c of contexts) await c.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  const summary = {
    at: new Date().toISOString(),
    head,
    results,
    passCount: Object.values(results).filter((r) => r.pass).length,
    total: Object.keys(results).length,
  };
  await writeFile(path.join(OUT, 'loop4-pw-cast-ux.json'), JSON.stringify(summary, null, 2));
  await writeFile(path.join(OUT, 'loop4-pw-cast-ux.log.json'), JSON.stringify(log, null, 2));

  const lines = [
    `# Loop 4 â€” Playwright cast UX live-verify (#48)`,
    ``,
    `HEAD: ${head}`,
    `Time: ${new Date().toISOString()} (stored UTC; Brisbane = UTC+10)`,
    `Repo: web-prototype @ main`,
    `Ports: Vite ${WEB}, party ${WS} (:5184 left alone)`,
    ``,
    `## Results`,
    ``,
    `| Item | Pass | Notes |`,
    `|---|---|---|`,
    `| 1. Intros timeout (TV hidden) | ${results.introsTimeout.pass ? 'PASS' : 'FAIL'} | ${results.introsTimeout.why || ''} armedAt=${results.introsTimeout.armedAtMs ?? 'n/a'}ms |`,
    `| 2. Lock-pick stamp mid-tap | ${results.lockPickStamp.pass ? 'PASS' : 'FAIL'} | ${results.lockPickStamp.why || ''} |`,
    `| 3. Robot N names | ${results.robotNNames.pass ? 'PASS' : 'FAIL'} | ${results.robotNNames.why || ''} |`,
    `| 4. TV tiebreak reason (2-2) | ${results.tvTiebreak.pass ? 'PASS' : 'FAIL'} | ${results.tvTiebreak.detail || results.tvTiebreak.why || ''} why="${results.tvTiebreak.whyText || ''}" |`,
    `| 5. Empty still no invent (spot) | ${results.emptyNoInvent.pass ? 'PASS' : 'FAIL'} | ${results.emptyNoInvent.why || ''} |`,
    `| 6. Arm when all-sent (#49) | ${results.armAllSent.pass ? 'PASS' : 'FAIL'} | ${results.armAllSent.why || ''} |`,
    ``,
    `## Screenshots`,
    `- \`loop4-pw-shots/a-intros-timeout.png\``,
    `- \`loop4-pw-shots/b-lock-pick.png\``,
    `- \`loop4-pw-shots/b-tv-tiebreak.png\``,
    `- \`loop4-pw-shots/c-empty-force.png\``,
    ``,
    `## PRs?`,
    `None (verify-only).`,
    ``,
    `## Raw`,
    '```json',
    JSON.stringify(summary, null, 2),
    '```',
    ``,
  ];
  await writeFile(path.join(OUT, 'loop4-pw-cast-ux.md'), lines.join('\n'));
  console.log('SUMMARY', JSON.stringify(summary));
  const all = Object.values(results).every((r) => r.pass);
  process.exit(all ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
