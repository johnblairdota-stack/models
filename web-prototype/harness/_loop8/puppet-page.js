/**
 * Playwright thumbs for loop8. Every whisper / ship goes through the real
 * pad selectors — `[data-link]`, `[data-accept]`, `#whisper`, `#whisper-send`.
 * Do not invent a `{ t: 'whisper' }` that never left a phone.
 */

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function snap(page) {
  return page.evaluate(() => (typeof window.__phone === 'function' ? window.__phone() : null));
}

export async function hostSnap(tv) {
  return tv.evaluate(() => window.__rrrHost || null);
}

export async function beatOf(tv) {
  const h = await hostSnap(tv);
  if (h?.beat) return String(h.beat).toUpperCase();
  return tv.evaluate(() => (document.body.innerText.match(/EPISODE\s+\d+\s*[·.]\s*([A-Z]+)/) || [])[1] || '');
}

export async function waitBeat(tv, want, { ms = 90000 } = {}) {
  const need = Array.isArray(want) ? want.map((w) => String(w).toUpperCase()) : [String(want).toUpperCase()];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const b = await beatOf(tv);
    if (need.includes(b)) return b;
    await sleep(400);
  }
  throw new Error(`beat ${need.join('/')} never arrived (last ${await beatOf(tv)})`);
}

export async function skipBeat(tv) {
  await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
}

export async function typeJoin(page, { code, name }) {
  await page.waitForSelector('#code', { timeout: 45000 });
  await page.fill('#code', String(code).toUpperCase());
  await page.fill('#name', name);
  await page.click('#join');
  await page.waitForSelector('#lock-look', { timeout: 45000 });
  await page.click('#lock-look');
}

/** Hold the role card, read PRODUCTION / GOOD, put it down. */
export async function readCard(page) {
  await page.waitForSelector('#card-done', { timeout: 45000 }).catch(() => {});
  const bar = await page.$('#card-hold');
  if (bar) {
    const box = await bar.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await sleep(400);
    }
  }
  const card = await page.evaluate(() => {
    const g = (sel) => document.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      align: g('.card-view .align'),
      role: g('.card-view .role'),
      mates: [...document.querySelectorAll('.card-view .mates .m b')].map((el) => el.textContent.trim()),
    };
  });
  await page.mouse.up().catch(() => {});
  await page.click('#card-done', { timeout: 8000 }).catch(() => {});
  const snapNow = await snap(page);
  const evil = /PRODUCTION/i.test(card.align) || snapNow?.alignment === 'evil';
  return { ...card, evil, id: snapNow?.id || null, name: snapNow?.name || null, snap: snapNow };
}

/** Sequential runner + guide lock. `runnerId` / `guideId` are seat ids. */
export async function castBallot(page, runnerId, guideId) {
  const pick = async (id) => {
    const b = await page.$(`[data-pick="${id}"]`);
    if (!b) return false;
    const disabled = await b.evaluate((el) => el.disabled || el.getAttribute('aria-disabled') === 'true');
    if (disabled) return false;
    await b.click({ timeout: 2500 }).catch(() => {});
    return true;
  };
  if (!(await pick(runnerId))) return false;
  await sleep(180);
  const lock1 = await page.$('#lock-pick, button:has-text("LOCK")');
  if (lock1) await lock1.click({ timeout: 2500 }).catch(() => {});
  await sleep(220);
  if (!(await pick(guideId))) return false;
  await sleep(180);
  const lock2 = await page.$('#lock-pick, button:has-text("LOCK")');
  if (lock2) await lock2.click({ timeout: 2500 }).catch(() => {});
  return true;
}

export async function tapReady(page) {
  const on = await page.evaluate(() => !!document.querySelector('#ready.on'));
  if (!on) await page.click('#ready', { timeout: 4000 }).catch(() => {});
}

export async function nom(page, targetId) {
  const b = await page.$(`[data-nom="${targetId}"]`);
  if (!b) return false;
  await b.click({ timeout: 3000 }).catch(() => {});
  return true;
}

export async function lynch(page, targetId) {
  const sel = targetId ? `[data-lynch="${targetId}"]` : '[data-lynch]';
  const b = await page.$(sel);
  if (!b) return false;
  await b.click({ timeout: 3000 }).catch(() => {});
  return true;
}

export async function livingFromPad(page) {
  return page.evaluate(() => {
    const ids = new Set();
    for (const b of document.querySelectorAll('[data-pick], [data-nom], [data-link], [data-lynch]')) {
      const id = b.dataset.pick || b.dataset.nom || b.dataset.link || b.dataset.lynch;
      if (id && id !== 'NO ONE') ids.add(id);
    }
    return [...ids];
  });
}

/** Reach out through the real `[data-link]` button. */
export async function reach(page, toId) {
  const b = await page.$(`[data-link="${toId}"]:not([disabled])`);
  if (!b) return false;
  await b.click({ timeout: 3000 }).catch(() => {});
  return true;
}

export async function acceptLink(page) {
  const b = await page.$('[data-accept]');
  if (!b) return false;
  await b.click({ timeout: 3000 }).catch(() => {});
  return true;
}

/**
 * Type + send on the pair sheet. Returns false if `#whisper-send` is not
 * on this phone — caller must treat that as a sim hole, not write talk.json.
 */
export async function whisperThroughPad(page, text) {
  const field = await page.$('#whisper');
  const send = await page.$('#whisper-send');
  if (!field || !send) return false;
  await field.fill(String(text).slice(0, 120));
  await send.click({ timeout: 3000 }).catch(() => {});
  return true;
}

export async function recapTaken(tv) {
  return tv.evaluate(() => {
    const facts = document.querySelector('.recap.talk-facts')?.innerText || '';
    const host = window.__rrrHost || {};
    return {
      taken: Array.isArray(host.taken) ? host.taken : [],
      cameBack: /CAME BACK/i.test(facts) && !/TAKEN/i.test(facts),
      facts: facts.replace(/\s+/g, ' ').trim(),
      runner: host.runner || null,
      guide: host.guide || null,
    };
  });
}
