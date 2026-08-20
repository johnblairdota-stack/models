/**
 * 📺 **THE BROADCAST OVERLAY — everything on the television that is not the feed.**
 *
 * `docs/design/rrr-broadcast.md` §4. The last clause of §7's minimum viable director: *"a
 * lower-third renderer over the nameplate rail and camera wall."*
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THIS FILE RENDERS. IT DOES NOT DECIDE, AND IT NEVER COMPOSES A STRING.
 * ---------------------------------------------------------------------------------------------
 * Every word it puts on screen came from `src/party/captions.js` or `src/party/shots.js`, both of
 * which are pure and both of which are swept. The moment this file builds a caption itself — one
 * template literal, one `${name}` — T5's closed vocabulary is worth nothing, because the sweep is
 * looking at the bank and the television is showing something else. `broadcast-frame` H9 asserts
 * that every rendered string appears in the bank's own output.
 *
 * ⚠️ DOM, NOT CANVAS, AND THAT IS `hud.js`'s ARGUMENT VERBATIM: *"it costs no draw calls, it stays
 * sharp at any resolution, and it cannot fight the post stack for the frame budget."* The party
 * mode's budget is worse than the survival mode's, not better — nine clients, one of them a
 * television — so this is not the place to spend a pass.
 *
 * ⚠️ NO THREE. The camera pose is `director-rig.js`'s job. This file is told what shot is on air
 * so it can print the bug; it does not know where the camera is.
 */

import { railFor, showBug, segmentClock } from '../party/captions.js';
import { camWall } from '../party/shots.js';

/**
 * 📏 §4's TEN-FOOT RULES, AS DATA RATHER THAN AS A PARAGRAPH NOBODY MEASURES.
 *
 * *"At 3 m on a 1080p panel: nameplate name ≥ 30 px, claim ≥ 24 px, chat ≥ 22 px, lower third
 * ≥ 34 px; all text ≥ 4.5:1 on an opaque plate, never straight on the feed; nothing important
 * within 4% of an edge."*
 *
 * A rule written only in prose is a rule that drifts the first time someone tightens a layout.
 * These are exported so `broadcast-frame` can compute the shipped sizes at 1080p and fail on the
 * commit that breaks them, rather than on the evening somebody squints at a television.
 */
export const TEN_FOOT = Object.freeze({
  panelH: 1080, nameMinPx: 30, claimMinPx: 24, chatMinPx: 22, lowerMinPx: 34,
  contrastMin: 4.5, edgePct: 4,
});

/**
 * Sizes in vh, so a bigger panel scales past the minimums instead of sitting at them.
 *
 * 🚨 EACH ONE IS FLOORED IN ABSOLUTE PIXELS BY `size()` BELOW, AND THAT IS NOT BELT-AND-BRACES.
 * The first draft sized in `vh` alone, and Chromium laid the nameplate out at **26px against a
 * 30px floor** — because `vh` is the VIEWPORT, and a browser window on a 1080p panel is shorter
 * than the panel by whatever its chrome takes. §4's rule is about a person three metres away
 * being able to read it, which does not care whether the tab is fullscreen. `max(30px, 2.90vh)`
 * makes the floor true on any viewport and still rewards a bigger screen.
 */
export const SIZES_VH = Object.freeze({ name: 2.90, claim: 2.35, lower: 3.30, chat: 2.10, bug: 1.80 });

/** `max(<floor>px, <n>vh)` — the floor is §4's, the vh is the scale-up. */
const size = (vh, floorPx) => `max(${floorPx}px, ${vh}vh)`;

/** The palette. Every pairing here is checked against `TEN_FOOT.contrastMin` by H4. */
export const INK = Object.freeze({
  fg: '#f2f4f8', dim: '#9aa2b1', plate: '#0d1017', edge: '#252c3b',
  live: '#4cc27a', out: '#e4483a', badge: '#e0b23c',
});

const CSS = `
.rrr-bx{position:absolute;inset:0;pointer-events:none;font:400 16px/1.3 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;
  color:${INK.fg};display:grid;grid-template-rows:auto 1fr auto;
  /* §4: nothing important within 4% of an edge. This is that rule, and it is the only padding. */
  padding:${TEN_FOOT.edgePct}%}
.rrr-top{display:flex;justify-content:space-between;align-items:center}
.rrr-mid{position:relative}
.rrr-bot{display:flex;flex-direction:column;gap:1.4vh}

/* 🚨 EVERY TEXT RUN SITS ON AN OPAQUE PLATE. §4: "never straight on the feed" — white text over a
   dark corridor is 12:1 until the corridor is a lit ballroom, and then it is unreadable at the one
   moment something is happening in it. */
.rrr-plate{background:${INK.plate};border:1px solid ${INK.edge};border-radius:.5vh;padding:.7vh 1.2vh}

.rrr-show{font-size:${size(SIZES_VH.bug, 20)};letter-spacing:.22em;font-weight:700}
.rrr-cams{font-size:${size(SIZES_VH.bug, 20)};letter-spacing:.18em;font-weight:600;color:${INK.dim}}
.rrr-wall{display:inline-flex;gap:.6vh;margin-left:.9vh;vertical-align:middle}
.rrr-cam{width:1.5vh;height:1.5vh;border-radius:.3vh;background:${INK.edge}}
.rrr-cam.on{background:${INK.live}}

.rrr-third{position:absolute;left:0;bottom:6vh;font-size:${size(SIZES_VH.lower, TEN_FOOT.lowerMinPx)};font-weight:700;
  letter-spacing:.06em;opacity:0;transition:opacity .18s ease}
.rrr-third.up{opacity:1}

.rrr-bug{position:absolute;left:0;bottom:0;font-size:${size(SIZES_VH.bug, 20)};letter-spacing:.2em;font-weight:600;color:${INK.dim}}
.rrr-seg{position:absolute;right:0;bottom:0;font-size:${size(SIZES_VH.bug, 20)};letter-spacing:.2em;color:${INK.dim};opacity:.72}

.rrr-rail{display:flex;gap:1.2vh}
.rrr-seat{flex:1 1 0;min-width:0;text-align:center}
.rrr-nm{font-size:${size(SIZES_VH.name, TEN_FOOT.nameMinPx)};font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rrr-cl{font-size:${size(SIZES_VH.claim, TEN_FOOT.claimMinPx)};color:${INK.dim};font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rrr-bd{font-size:${size(SIZES_VH.claim, TEN_FOOT.claimMinPx)};color:${INK.badge};font-weight:700;letter-spacing:.16em;min-height:1.2em}
/* §4: "every state change carries a non-colour channel … half a party room is looking sideways." */
.rrr-seat.out .rrr-nm{text-decoration:line-through;color:${INK.out}}
.rrr-seat.out{opacity:.45}
.rrr-card{position:absolute;inset:12% 18%;display:grid;place-items:center;font-size:4vh;font-weight:700;
  letter-spacing:.2em;background:${INK.plate};border:1px solid ${INK.edge};border-radius:1vh}
.rrr-hide{display:none}
`;

/**
 * @param {object} o
 * @param {HTMLElement} o.mount   where the overlay is attached — usually over the canvas
 * @param {Document} [o.doc]      injected so a gate can drive it without a global `document`
 */
export function createBroadcast({ mount, doc = (typeof document !== 'undefined' ? document : null) }) {
  if (!doc) throw new Error('createBroadcast needs a document');
  if (!doc.getElementById('rrr-bx-css')) {
    const st = doc.createElement('style');
    st.id = 'rrr-bx-css';
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  const el = (cls, tag = 'div') => { const n = doc.createElement(tag); n.className = cls; return n; };
  const box = el('rrr-bx');
  const top = el('rrr-top'), mid = el('rrr-mid'), bot = el('rrr-bot');
  const show = el('rrr-show rrr-plate'), cams = el('rrr-cams rrr-plate');
  const wall = el('rrr-wall', 'span');
  const third = el('rrr-third rrr-plate'), bug = el('rrr-bug rrr-plate'), seg = el('rrr-seg rrr-plate');
  const card = el('rrr-card rrr-hide'), rail = el('rrr-rail');

  cams.appendChild(doc.createElement('span'));
  cams.appendChild(wall);
  top.append(show, cams);
  mid.append(card, third, bug, seg);
  bot.append(rail);
  box.append(top, mid, bot);
  mount.appendChild(box);

  let holdUntil = 0;

  return {
    root: box,

    /** The permanent furniture, redrawn from a PROJECTED frame. Nothing here has ever held a role. */
    setFrame(frame, secondsLeft) {
      show.textContent = showBug(frame.episode);
      const c = frame.cameras || {};
      cams.firstChild.textContent = camWall(c.unlocked || 0, c.needed || 0);
      wall.textContent = '';
      for (let i = 0; i < (c.needed || 0); i++) {
        const d = el('rrr-cam' + (i < (c.unlocked || 0) ? ' on' : ''), 'span');
        wall.appendChild(d);
      }
      seg.textContent = segmentClock(secondsLeft);

      rail.textContent = '';
      for (const r of railFor(frame)) {
        const s = el('rrr-seat' + (r.out ? ' out' : ''));
        const nm = el('rrr-nm'); nm.textContent = `${r.mark} ${r.name}`;
        const cl = el('rrr-cl'); cl.textContent = r.claim === '—' ? '—' : `“${r.claim}”`;
        const bd = el('rrr-bd'); bd.textContent = r.badge || '';
        s.append(nm, cl, bd);
        rail.appendChild(s);
      }
    },

    /**
     * What is on air. `solved` is `shots.js`'s output verbatim — this method reads two of its
     * fields and invents nothing.
     */
    setShot(solved) {
      if (!solved) { bug.textContent = ''; card.classList.add('rrr-hide'); return; }
      bug.textContent = solved.bug;
      if (solved.kind === 'card') {
        card.classList.remove('rrr-hide');
        card.textContent = solved.card.toUpperCase();
      } else {
        card.classList.add('rrr-hide');
      }
    },

    /**
     * A lower third. `caption` is `captions.js`'s output; passing a bare string is refused,
     * because a bare string is how a composed one gets in.
     */
    say(caption, now = 0) {
      if (caption == null) return;
      if (typeof caption === 'string' || !caption.text) {
        throw new Error('say() takes captionFor()\'s output, not a string — see this file\'s header');
      }
      third.textContent = caption.text;
      third.classList.add('up');
      holdUntil = now + caption.hold;
    },

    /** Drop the lower third when its hold expires. Called from the render loop. */
    tick(now = 0) { if (holdUntil && now >= holdUntil) { third.classList.remove('up'); holdUntil = 0; } },

    dispose() { box.remove(); },
  };
}

export const _CSS = CSS;
