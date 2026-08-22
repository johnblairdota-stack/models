/**
 * 🎴 **YOUR CARD — FULL-BLEED, DEALT, AND HOLD-TO-REVEAL.**
 *
 * `docs/design/rrr-phone-ux.md` §2.3, verbatim: *"Full-bleed card, one line of rule text at
 * 24 px, the role name at 34 px, and the word GOOD or PRODUCTION spelled out (never colour
 * alone). It is hold-to-reveal: the card is blurred until a finger is held on it, so a
 * neighbour's glance at an unattended phone reveals nothing. Releasing re-blurs after 400 ms. A
 * persistent ROLE tab in the bottom strip reopens it in any phase."*
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 NOT `:hover`, AND NOT TAP-TO-TOGGLE. THE SECOND ONE IS THE TRAP.
 * ---------------------------------------------------------------------------------------------
 * The doc's own *cheap v1* was tap to open, tap to close, and `show-phone.html` shipped it before
 * b69f800 replaced it. A parked open card is readable by the person beside you for exactly as
 * long as its owner is distracted, and eight people on a sofa is a room built out of distraction.
 * `:hover` is worse again: it does not exist on the only device this screen runs on, and where it
 * is emulated it latches until the next tap somewhere else.
 *
 * So the blur is the RESTING state and `lit` is the exception. A script that fails to run leaves
 * the card unreadable rather than open — the safe direction to fail in.
 *
 * ⚠️ POINTER EVENTS WITH `setPointerCapture`, NOT `touchstart`. Without capture a finger that
 * drifts off the element never delivers `pointerup` to it, and the card stays lit on a phone
 * lying face-up on a sofa arm — precisely the failure the blur exists to prevent.
 *
 * ⚠️ THE 400 ms IS THE SPEC'S NUMBER RATHER THAN A FEEL ONE. It stops a finger that slips
 * mid-read from snapping the card shut and training people to press harder.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE DOM IS BUILT ONCE AND LIVES OUTSIDE THE SHEET THAT REPAINTS.
 * ---------------------------------------------------------------------------------------------
 * `party-phone.js` repaints by writing `root.innerHTML`, and a `pointerdown` on a node that is
 * replaced before the `pointerup` never delivers a release — the card would latch lit. This
 * module appends to `document.body` and keeps node identity for the whole night, so a frame
 * landing mid-hold cannot orphan the finger that is holding.
 *
 * No THREE, no DOM at module scope — the copy, the CSS and the html builders are pure strings so
 * `harness/role-peek.mjs` can assert them in bare node. `mount()` is the only browser half.
 */

import { SCRIPT } from './roles.js';
import { EVIL } from './cast.js';

/** §2.3's number. Not tunable by feel — the gate asserts it. */
export const REBLUR_MS = 400;

/** How long the deal runs before it settles into the blurred card. */
export const DEAL_MS = 1600;

/**
 * The strip above the hold bar is a STATE READOUT, not a second instruction. The bar already says
 * what to do; what the player cannot otherwise tell is which state the card is in — and the state
 * is the whole security property, so it is the thing named out loud.
 */
export const HOLD_NOTE = 'Blurred · nobody can read this';
export const HOLD_NOTE_LIT = 'Reading · release to hide';
export const HOLD_BUTTON = 'Hold to read';
export const CARD_TAB = 'Your card — hold to read';
export const FACE_DOWN = 'Your card';
export const DEALING = 'Dealing the cast';

/**
 * §1's premiere. The middle sentence is the brief's copy and is load-bearing: it is the only
 * place the phone explains that the card is not a thing you open and put away.
 */
export const PREMIERE_COPY = 'It is on this phone and on no screen in the room. Hold the button '
  + 'below to read it — it stays blurred until a finger is on it, so nobody beside you can read '
  + 'it over your shoulder and nobody has to remember to put it away.';
export const PREMIERE_FOOT = 'Then put the phone down. Everything after this happens out loud.';

/** Display name. `SCRIPT` has carried one for every card since it was written. */
export function roleName(id) {
  return SCRIPT[id]?.name || (id ? String(id) : '—');
}

/** The one line of rule text. §2.3's 24 px row, and it is only the line — nothing here fires. */
export function roleLine(id) {
  return SCRIPT[id]?.line || '';
}

/**
 * 🚨 SPELLED OUT, NEVER COLOUR ALONE — §2.3, and §6's accessibility rule. Red text on a black
 * card in a dark lounge is not a message, it is a hint.
 */
export function sideLabel(alignment) {
  if (alignment === EVIL) return 'PRODUCTION';
  if (alignment === 'good') return 'GOOD';
  return '';
}

/**
 * 🚨 ALIGNMENT COMES FROM `you.alignment` AND IS NOT INFERRED FROM `teammates`. At 6-8 players
 * there are two in Production so the array is non-empty and a guess holds. At 4-5 there is
 * exactly ONE — the array is empty, `project()`'s prune legitimately deletes it, and the sole
 * traitor's own phone would read GOOD. A player who reads that card plays the whole evening for
 * the other side.
 *
 * @param {{role?:string, alignment?:string, teammates?:Array<{id:string,role:string}>}} you
 * @returns {{role:string|null, name:string, line:string, side:string, evil:boolean,
 *            sentence:string, teammates:Array<{id:string,role:string}>}}
 */
export function cardFor(you = {}) {
  const role = you.role || null;
  const evil = you.alignment === EVIL;
  return {
    role,
    name: roleName(role),
    line: roleLine(role),
    side: sideLabel(you.alignment),
    evil,
    sentence: evil
      ? 'Your job is to lose the show without ever being the reason.'
      : 'Light the cameras. Nobody will tell you if you are right.',
    // The Production Panel is the one exception in the whole matrix, and it exists only here.
    teammates: evil ? (you.teammates || []) : [],
  };
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * The face — everything the blur hides. Nothing outside this element carries the role, so the
 * one CSS rule is the whole secret.
 *
 * @param {ReturnType<typeof cardFor>} card
 * @param {(id:string)=>string} nameOf  players list lookup; ids are useless to a reader
 */
export function roleCardFaceHtml(card, nameOf = (id) => id) {
  const mates = (card.teammates || []).map((m) =>
    `<div class="m"><b>${esc(nameOf(m.id))}</b><span class="r">${esc(roleName(m.role))}</span></div>`).join('');
  return `<div class="align">You are ${esc(card.side || '—')}</div>
    <div class="role">${esc(card.name)}</div>
    ${card.line ? `<div class="line">${esc(card.line)}</div>` : ''}
    <div class="sentence">${esc(card.sentence)}</div>
    ${mates ? `<div class="mates"><h3>Production</h3>${mates}</div>` : ''}`;
}

/** The face-down tile that reopens it in any phase — §2.3's persistent ROLE tab. */
export function faceDownHtml(label = FACE_DOWN, sub = HOLD_BUTTON) {
  return `<button class="card-tab" id="card-tab" type="button">
    <span class="back" aria-hidden="true"></span>
    <span class="lbl"><b>${esc(label)}</b><span>${esc(sub)}</span></span>
  </button>`;
}

/** The premiere sheet. The card button sits under it, which is what "the button below" means. */
export function premiereHtml() {
  return `<h1>Your card</h1>
    <p class="hint">${esc(PREMIERE_COPY)}</p>
    <p class="hint" style="margin-top:10px">${esc(PREMIERE_FOOT)}</p>`;
}

/**
 * ⚠️ EVERY `font:` SHORTHAND CARRIES THE WHOLE FAMILY STACK, AND THE OVERLAYS DECLARE ONE.
 * The shorthand RESETS `font-family`, and these two elements are appended to `document.body`
 * rather than inside `.night`, so there is nothing to inherit: `font:800 34px/1.1 ui-sans-serif`
 * rendered §2.3's 34 px role name in the browser's default SERIF on a screen where every other
 * word is sans. Caught in a real Chromium, not in a review.
 */
export const NIGHT_FONT = 'ui-sans-serif, system-ui, sans-serif';

/**
 * 🚨 NOT ONE COLOUR LITERAL BELOW THIS LINE. Every colour is a `--night-*` token from
 * `palette.js`, and `role-peek` P11 asserts there is no raw hex or `rgb(` in the whole block.
 *
 * PR #5 reskinned the night from a cold blue to a broadcast amber and this file was written
 * against the blue, so the card was one cyan surface in an amber lounge with nothing able to say
 * so — a hex is a hex, and no gate can tell a deliberate colour from a stale one. Naming the
 * palette is what turns the next reskin into a failing gate instead of a failing playtest.
 */

export const ROLE_CARD_CSS = `
  /* ---- the face-down tab. Never the role: a card back and a label, in any phase. */
  .card-tab { display:flex; align-items:center; gap:14px; width:100%; margin:14px 0 4px;
    padding:14px 16px; border-radius:12px; border:1px solid rgba(var(--night-accent-rgb), .28);
    background:var(--night-panel); color:var(--night-ink); font:inherit; text-align:left; cursor:pointer; }
  .card-tab .back { flex:0 0 auto; width:38px; height:54px; border-radius:6px;
    border:1px solid rgba(var(--night-accent-rgb), .5);
    background:
      repeating-linear-gradient(45deg, rgba(var(--night-accent-rgb), .16) 0 3px, transparent 3px 6px),
      var(--night-well); }
  .card-tab .lbl { display:flex; flex-direction:column; gap:4px; }
  .card-tab .lbl b { font-size:19px; letter-spacing:.04em; }
  .card-tab .lbl span { color:var(--night-dim); font-size:13px; letter-spacing:.14em; text-transform:uppercase; }

  /* ---- §2.3's full-bleed card. touch-action:none so a hold is a hold, not a scroll.
     The same wash the night wears, so the card is this room rather than a modal over it. */
  .card-view { position:fixed; inset:0; z-index:9; padding:26px 20px;
    background:
      radial-gradient(900px 520px at 50% -8%, rgba(var(--night-accent-rgb), .10), transparent 58%),
      var(--night-bg);
    display:flex; flex-direction:column; justify-content:center; gap:18px; touch-action:none;
    -webkit-tap-highlight-color:transparent;
    font-family:${NIGHT_FONT}; color:var(--night-ink); }
  .card-view.hide, .card-view .hide { display:none; }
  /* 🚨 THE BLUR IS THE RESTING STATE AND .lit IS THE EXCEPTION. A script that never runs
     leaves the card unreadable rather than open. */
  .card-view .face { filter:blur(16px); transition:filter .16s ease;
    user-select:none; -webkit-user-select:none; }
  .card-view.lit .face { filter:none; }
  .card-view .align { font:600 12px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing:.24em; text-transform:uppercase;
    color:var(--night-dim); }
  /* §2.3: the role name at 34 px. */
  .card-view .role { font:800 34px/1.1 ui-sans-serif, system-ui, sans-serif; margin-top:8px; }
  /* §2.3: one line of rule text at 24 px, the card's own words, above the team sentence. */
  .card-view .line { font:500 24px/1.35 ui-sans-serif, system-ui, sans-serif; color:var(--night-ink); margin-top:12px; }
  .card-view .sentence { color:var(--night-soft); font-size:16px; line-height:1.45; margin-top:14px; }
  .card-view .mates { margin-top:18px; border-top:1px solid rgba(var(--night-accent-rgb), .18); padding-top:12px; }
  .card-view .mates h3 { font:600 12px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing:.18em; text-transform:uppercase;
    color:var(--night-dim); margin:0 0 10px; }
  .card-view .mates .m { display:flex; gap:10px; align-items:baseline; font-size:17px; margin-top:6px; }
  .card-view .mates .m b { color:var(--night-bad); }
  .card-view .mates .m .r { color:var(--night-soft); font-size:14px; }
  .card-view .note { color:var(--night-dim); font-size:14px; line-height:1.45; }
  .card-view .holdnote { font:600 13px/1.4 ui-sans-serif, system-ui, sans-serif; letter-spacing:.18em; text-transform:uppercase;
    color:var(--night-dim); text-align:center; }
  .card-view.lit .holdnote { color:var(--night-live); }
  .card-view .when-lit, .card-view.lit .when-dark { display:none; }
  .card-view.lit .when-lit { display:inline; }
  .card-view .hold-bar { width:100%; min-height:88px; border-radius:14px;
    border:1px dashed rgba(var(--night-accent-rgb), .5);
    background:var(--night-well); color:var(--night-ink);
    font:700 20px/1.2 ui-sans-serif, system-ui, sans-serif; letter-spacing:.14em;
    text-transform:uppercase; touch-action:none; }
  .card-view.lit .hold-bar { border-style:solid; border-color:var(--night-live); background:var(--night-live-well); }
  .card-view .card-done { width:100%; }

  /* ---- the deal. Card backs out of the middle, then this phone's own back to the front. */
  .deal-view { position:fixed; inset:0; z-index:10; display:flex;
    background:
      radial-gradient(680px 420px at 50% 46%, rgba(var(--night-accent-rgb), .09), transparent 62%),
      var(--night-deep);
    flex-direction:column; align-items:center; justify-content:center; gap:22px;
    font-family:${NIGHT_FONT}; color:var(--night-ink); }
  .deal-view.hide { display:none; }
  .deal-view .deck { position:relative; width:min(86vw,360px); height:min(46vh,300px); }
  .deal-view .b { position:absolute; left:50%; top:50%; width:52px; height:74px;
    margin:-37px 0 0 -26px; border-radius:7px; border:1px solid rgba(var(--night-accent-rgb), .45);
    background:
      repeating-linear-gradient(45deg, rgba(var(--night-accent-rgb), .18) 0 3px, transparent 3px 6px),
      var(--night-well);
    opacity:0; animation:deal-out .5s cubic-bezier(.2,.8,.25,1) forwards; }
  .deal-view .b.mine { border-color:var(--night-accent); box-shadow:0 10px 30px rgba(0,0,0,.6);
    animation:deal-out .5s cubic-bezier(.2,.8,.25,1) forwards, deal-mine .62s .78s cubic-bezier(.3,.9,.25,1) forwards; }
  .deal-view .cap { letter-spacing:.22em; text-transform:uppercase; font-size:13px; color:var(--night-accent); }
  .deal-view .sub { color:var(--night-dim); font-size:15px; text-align:center; max-width:26rem; }
  @keyframes deal-out {
    from { opacity:0; transform:translate(0,0) rotate(0deg) scale(.7); }
    to   { opacity:1; transform:translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(1); }
  }
  @keyframes deal-mine {
    from { transform:translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(1); }
    to   { transform:translate(0,0) rotate(0deg) scale(2.15); }
  }
  @media (prefers-reduced-motion: reduce) {
    .deal-view .b, .deal-view .b.mine { animation-duration:.01s; animation-delay:0s; opacity:1; }
  }
`;

/**
 * Build the deck for the deal: one back per joined phone, fanned, with this phone's own back
 * marked so it is the one that comes to the front.
 *
 * @param {number} n     joined phones
 * @param {number} mine  index of this phone in that list
 */
export function dealDeckHtml(n, mine = 0) {
  const count = Math.max(1, Math.min(8, n | 0));
  const spread = Math.min(132, 26 * (count - 1) + 26);
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    const dx = Math.round(t * spread);
    const dy = Math.round(-Math.cos(t * 1.35) * 34 + 34);
    const rot = Math.round(t * 16);
    const delay = i * 90;
    return `<span class="b${i === mine ? ' mine' : ''}" style="--dx:${dx}px;--dy:${dy}px;`
      + `--rot:${rot}deg;animation-delay:${delay}ms${i === mine ? `,${Math.max(delay + 260, 780)}ms` : ''}"></span>`;
  }).join('');
}

/**
 * Mount the card. Idempotent per document; returns the controller `party-phone.js` drives.
 *
 * @param {{nameOf?:(id:string)=>string, onClose?:()=>void}} opts
 * @returns {{openCard:(card:object, o?:{premiere?:boolean})=>void, closeCard:()=>void,
 *            isOpen:()=>boolean, deal:(o:{seats:number, mine:number})=>Promise<void>,
 *            destroy:()=>void}}
 */
export function mountRoleCard({ nameOf = (id) => id, onClose = () => {} } = {}) {
  const view = document.createElement('div');
  view.className = 'card-view hide';
  view.innerHTML = `<div class="face" id="card-face"></div>
    <div class="note hide" id="card-note"></div>
    <div class="holdnote" id="card-holdnote"><span class="when-dark">${esc(HOLD_NOTE)}</span><span class="when-lit">${esc(HOLD_NOTE_LIT)}</span></div>
    <button class="hold-bar" id="card-hold" type="button">${esc(HOLD_BUTTON)}</button>
    <button class="btn ghost card-done" id="card-done" type="button">Put it down</button>`;
  document.body.appendChild(view);

  const dealView = document.createElement('div');
  dealView.className = 'deal-view hide';
  document.body.appendChild(dealView);

  const face = view.querySelector('#card-face');
  const note = view.querySelector('#card-note');
  const done = view.querySelector('#card-done');

  /**
   * 🚨 THE ONLY TWO CALLS THAT TOUCH `lit`. On is immediate; off waits §2.3's 400 ms, and the
   * pending timer is always cleared first so a second finger cannot leave a re-blur armed.
   */
  let reblur = null;
  function lit(on) {
    clearTimeout(reblur);
    reblur = null;
    if (on) { view.classList.add('lit'); return; }
    reblur = setTimeout(() => { reblur = null; view.classList.remove('lit'); }, REBLUR_MS);
  }

  function press(e) {
    if (e.target === done) return;
    e.preventDefault();
    // Capture is what makes the release reliable when the finger drifts off the element.
    try { view.setPointerCapture(e.pointerId); } catch { /* not every engine has it */ }
    lit(true);
  }
  view.addEventListener('pointerdown', press);
  for (const ev of ['pointerup', 'pointercancel']) view.addEventListener(ev, () => lit(false));
  // A phone that sleeps or is swiped away mid-hold gets no `pointerup`. Re-blur anyway.
  const onHidden = () => { if (document.visibilityState !== 'visible') lit(false); };
  document.addEventListener('visibilitychange', onHidden);

  done.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCard();
    onClose();
  });

  function openCard(card, { premiere = false } = {}) {
    face.innerHTML = roleCardFaceHtml(card, nameOf);
    note.classList.toggle('hide', !premiere);
    note.textContent = premiere ? PREMIERE_COPY : '';
    // Opening is never a reveal. The card arrives blurred however it was opened.
    view.classList.remove('lit');
    clearTimeout(reblur);
    reblur = null;
    view.classList.remove('hide');
  }

  function closeCard() {
    view.classList.remove('lit');
    clearTimeout(reblur);
    reblur = null;
    view.classList.add('hide');
  }

  const isOpen = () => !view.classList.contains('hide');

  function deal({ seats = 1, mine = 0 } = {}) {
    dealView.innerHTML = `<div class="cap">${esc(DEALING)}</div>
      <div class="deck">${dealDeckHtml(seats, mine)}</div>
      <div class="sub">One card each. Nobody else gets yours, and the television never sees it.</div>`;
    dealView.classList.remove('hide');
    return new Promise((resolve) => setTimeout(() => {
      dealView.classList.add('hide');
      dealView.innerHTML = '';
      resolve();
    }, DEAL_MS));
  }

  return {
    openCard,
    closeCard,
    isOpen,
    deal,
    destroy() {
      clearTimeout(reblur);
      document.removeEventListener('visibilitychange', onHidden);
      view.remove();
      dealView.remove();
    },
  };
}
