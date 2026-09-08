/**
 * 📒 **YELLOW STICKIES — one-shot peelable onboarding.**
 *
 * `docs/slices/task-yellow-stickies.md`. Borrow the Last House Live session-seat pattern:
 * each TV and each persistent phone seat sees each note once, then it stays gone unless the
 * tiny Notes corner asks `restore: true`.
 *
 * ⚠️ **IMPORTS NOTHING**, so a node gate executes the shipped functions. Same bargain as
 * `runner-intel.js` / `heat.js`. No THREE, no DOM.
 *
 * Protocol: record first presentation BEFORE display. `note({ id, restore? })` → `{ show }`.
 */

export const NOTE_IDS = Object.freeze({
  PHONE_GUIDE_PIN: 'phone-guide-pin',
  PHONE_RUNNER_DODGE: 'phone-runner-dodge',
  PHONE_VOTE: 'phone-vote',
  TV_CAST_READY: 'tv-cast-ready',
});

export const FIRST_NOTE_IDS = Object.freeze([
  NOTE_IDS.PHONE_GUIDE_PIN,
  NOTE_IDS.PHONE_RUNNER_DODGE,
  NOTE_IDS.PHONE_VOTE,
  NOTE_IDS.TV_CAST_READY,
]);

/** Locked first-note copy. Guide / runner / vote language, no alignment spoilers. */
export const NOTE_COPY = Object.freeze({
  'phone-guide-pin': 'Pin a door, painting, or camera spot. Runner auto-walks there.',
  'phone-runner-dodge': 'Stick is dodge and hide. Walk is automatic to the pin.',
  'phone-vote': 'Tap a name to nominate or vote. Your pick stays private until the count.',
  'tv-cast-ready': 'Everyone joins on a phone. TV is the shared show.',
});

export const NOTE_LABEL = Object.freeze({
  'phone-guide-pin': 'Pin',
  'phone-runner-dodge': 'Dodge',
  'phone-vote': 'Vote',
  'tv-cast-ready': 'TV',
});

/** Peel release thresholds. Distances in CSS pixels; speed in px/ms. */
export const PEEL = Object.freeze({
  TAP_PX: 14,
  FLOP_PX: 72,
  SLIDE_V: 0.85,
});

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function notesPersistKey(room, seat) {
  return `rrr.party.notes:${String(room || '').toLowerCase()}:${String(seat || '')}`;
}

export function sessionStoragePersist(room, seat, storage) {
  const key = notesPersistKey(room, seat);
  const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  return {
    load() {
      if (!store) return [];
      try {
        const raw = store.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    },
    save(presented) {
      if (!store) return;
      try { store.setItem(key, JSON.stringify(presented)); } catch { /* private mode */ }
    },
  };
}

/**
 * Session store. `notesPresented` is the history. `note({ id, restore? })` records a first
 * presentation before returning `{ show: true }`. A new room is a new store (empty history).
 * Same room + same seat + same persist keeps history across reload / reconnect / restart.
 */
export function createNotesSession({ room, seat, load, save } = {}) {
  const roomId = String(room || '');
  const seatId = String(seat || '');
  let notesPresented = [];
  if (typeof load === 'function') {
    const got = load();
    if (Array.isArray(got)) notesPresented = got.map(String);
  }
  function persist() {
    if (typeof save === 'function') save(notesPresented.slice());
  }
  return {
    room: roomId,
    seat: seatId,
    get notesPresented() { return notesPresented.slice(); },
    note(cmd = {}) {
      const id = String(cmd.id || '');
      const restore = !!cmd.restore;
      if (!id || !NOTE_COPY[id]) return { show: false };
      if (restore) {
        if (!notesPresented.includes(id)) {
          notesPresented = [...notesPresented, id];
          persist();
        }
        return { show: true };
      }
      if (notesPresented.includes(id)) return { show: false };
      notesPresented = [...notesPresented, id];
      persist();
      return { show: true };
    },
  };
}

/**
 * Present-before-paint + at most one visible. Call this while building HTML, then write
 * `innerHTML`. A second id is refused while `showing` is already set.
 */
export function takeSticky(session, id, showing = null) {
  const want = String(id || '');
  if (!want || !NOTE_COPY[want] || !session) {
    return { html: '', showing: showing || null, show: false };
  }
  if (showing && showing !== want) return { html: '', showing, show: false };
  if (showing === want) return { html: stickyHtml(want), showing, show: true };
  const { show } = session.note({ id: want });
  if (!show) return { html: '', showing: showing || null, show: false };
  return { html: stickyHtml(want), showing: want, show: true };
}

export function restoreSticky(session, id) {
  const want = String(id || '');
  if (!session || !NOTE_COPY[want]) return { html: '', showing: null, show: false };
  const { show } = session.note({ id: want, restore: true });
  return { html: show ? stickyHtml(want) : '', showing: show ? want : null, show };
}

export function stickyHtml(id, { loose = false } = {}) {
  const copy = NOTE_COPY[id];
  if (!copy) return '';
  return `<aside class="sticky-note${loose ? ' loose' : ''}" data-sticky="${esc(id)}" data-sticky-id="${esc(id)}">
    <div class="sticky-paper">
      <i class="sticky-curl" aria-hidden="true"></i>
      <p class="sticky-copy">${esc(copy)}</p>
    </div>
  </aside>`;
}

export function wrapSticky(targetHtml, noteHtml) {
  return `<div class="sticky-anchor" data-sticky-anchor>${noteHtml || ''}${targetHtml}</div>`;
}

export function notesCornerHtml(presented, { open = false } = {}) {
  const ids = (presented || []).filter((id) => NOTE_COPY[id]);
  if (!ids.length) return '';
  const list = open
    ? `<div class="notes-restores">${ids.map((id) =>
      `<button type="button" class="notes-restore" data-note-restore="${esc(id)}">${esc(NOTE_LABEL[id] || id)}</button>`).join('')}</div>`
    : '';
  return `<div class="notes-corner" data-notes-corner>
    <button type="button" class="notes-tab" data-notes-tab${open ? ' aria-expanded="true"' : ''}>Notes</button>
    ${list}
  </div>`;
}

/**
 * Grab / curl lift lives in the view. This decides the release:
 * tap-to-peel, momentum slide-off, or early-release flop-back.
 */
export function peelRelease({ dx = 0, dy = 0, vx = 0, vy = 0 } = {}) {
  const dist = Math.hypot(Number(dx) || 0, Number(dy) || 0);
  const speed = Math.hypot(Number(vx) || 0, Number(vy) || 0);
  if (dist < PEEL.TAP_PX) return 'peel';
  if (speed >= PEEL.SLIDE_V || dist >= PEEL.FLOP_PX) return 'slide';
  return 'flop';
}

/**
 * ⚠️ NO BACKTICKS ANYWHERE IN THIS STRING. Interpolated into night-skin's template literal.
 */
export const STICKY_CSS = `
    .sticky-anchor { position:relative; display:flex; flex-direction:column; align-items:flex-start; gap:8px; }
    .sticky-note { --peel:0; --lift:0; position:relative; width:min(168px, 72vw); z-index:8;
      pointer-events:auto; touch-action:none; user-select:none; cursor:grab;
      transform: rotate(-2.2deg) translateY(calc(var(--lift) * -12px));
      transform-origin: 14% 10%; }
    .sticky-note.loose { position:fixed; left:12px; bottom:72px; z-index:20; }
    .sticky-paper { position:relative; padding:12px 14px 16px; color:#2c2210;
      font-family: "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive;
      font-size:13px; line-height:1.28; font-weight:600;
      background:
        linear-gradient(180deg, rgba(255,255,255,.42), transparent 30%),
        repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(170,130,30,.14) 21px),
        #f4e15a;
      box-shadow:
        1px 1px 0 rgba(255,255,255,.4) inset,
        -1px -1px 0 rgba(120,90,20,.16) inset,
        2px 4px 0 rgba(80,50,10,.12),
        4px 12px 18px rgba(0,0,0,.28);
      overflow:hidden; }
    .sticky-copy { margin:0; }
    .sticky-curl { position:absolute; right:0; bottom:0; display:block;
      width:calc(12px + var(--peel) * 52px); height:calc(12px + var(--peel) * 52px);
      background: linear-gradient(135deg, transparent 48%, #d4b44a 48%, #c4a030 100%);
      box-shadow:-2px -2px 4px rgba(0,0,0,.12); }
    .sticky-note.lifting { cursor:grabbing; }
    .sticky-note.flop { animation: sticky-flop .28s ease-out; }
    .sticky-note.slide, .sticky-note.tap-peel { animation: sticky-slide .42s ease-in forwards; pointer-events:none; }
    @keyframes sticky-flop {
      0% { transform: rotate(-2.2deg) translateY(-8px); }
      55% { transform: rotate(1.6deg) translateY(4px); }
      100% { transform: rotate(-2.2deg) translateY(0); }
    }
    @keyframes sticky-slide {
      to { transform: rotate(18deg) translate(150px, 90px); opacity:0; }
    }
    .notes-corner { position:fixed; top:36px; right:8px; z-index:18;
      display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
    .night:not(.phone) .notes-corner { top:auto; bottom:16px; right:16px; }
    .notes-tab, .notes-restore { appearance:none; font:inherit; border:0; cursor:pointer;
      font-size:10px; font-weight:800; letter-spacing:.14em; text-transform:uppercase;
      padding:5px 8px; background:#f4e15a; color:#2c2210;
      box-shadow:1px 2px 0 rgba(80,50,10,.25); }
    .notes-restores { display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
`;
