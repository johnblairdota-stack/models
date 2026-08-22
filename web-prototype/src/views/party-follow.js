import { estate } from './_studio.js';
import { buildFollowBed } from '../game/follow-bed.js';
import { followViolations, cleanThrottle } from '../party/follow.js';
import { DEFAULT_LOOK, cleanLook, robotFaceSvg } from '../party/look.js';

/**
 * 📺 **THE FOLLOW — what is actually on the TV during the run.**
 *
 * `docs/slices/task-d13-tv-follow.md` §3.3. Mounted by `views/party-host.js` in an iframe inside
 * the run frame; never opened by a person, though `?view=party.follow&runner=x` works standalone
 * and is how you develop it.
 *
 * 🚨 **IT HAS NO SOCKET, AND THAT IS THE SAFETY ARGUMENT, NOT AN OVERSIGHT.**
 * Everything this view knows arrives in its URL, through `src/party/follow.js`'s closed schema.
 * A renderer that cannot read the room cannot leak the room: there is no frame here to
 * mis-project, no event log to over-replay, and no way for a role, an alignment, the guide's
 * flyover or the hunter's position to reach the shared screen. Do not "helpfully" give it a
 * connection so it can read `pair` live — add a param, put it on `FOLLOW_KEYS`, and gate it.
 *
 * ⚠️ **THE OVERLAY MAY NOT NAME A ROOM, A HEADING OR A COORDINATE.** Calling rooms is the
 * guide's whole job (`party-loop.md` line 20: *"One is the guide (private phone flyover)... The
 * TV is not the map"*), and a TV that captions the room has taken it off them. The readout is
 * deliberately the SHOT and the THROTTLE — production facts, not navigation.
 */

const REC_LABEL = 'RRR CAM 01';

export default async function partyFollow({ params }) {
  /*
   * ⚠️ KILL `#boot` FIRST. `main.js` only adds `.gone` when the view's promise RESOLVES, and the
   * mansion takes seconds to bake — so without this the TV embeds a page showing the project's
   * "RUN ROBOT RUN / booting…" splash inside the show's own frame. `views/game.js` L4212 does the
   * same thing for the same reason, and its note records the 283 ms of two cards printed over
   * each other that made anyone look.
   */
  const boot = document.getElementById('boot');
  if (boot) { boot.style.transition = 'none'; boot.style.display = 'none'; }

  document.title = 'PRIME TIME — follow';
  document.body.style.cssText = 'margin:0;background:#07060a;overflow:hidden';

  /*
   * The closed schema, enforced at the door. A violation THROWS rather than being dropped:
   * `main.js` turns that into the visible failure card, which is the correct outcome, because a
   * follow slot that silently swallowed a `flyover=1` would be a silent guide-map leak on the
   * one screen everybody is looking at.
   */
  const bad = followViolations(params);
  if (bad.length) throw new Error(`follow slot: forbidden or unknown params — ${bad.join(', ')}`);

  const runnerId = params.get('runner') || '';
  const name = (params.get('name') || 'The runner').slice(0, 12);
  const look = cleanLook({ shell: params.get('shell'), accent: params.get('accent') }) || DEFAULT_LOOK;
  const seed = Number(params.get('seed'));
  const throttle = cleanThrottle(params.get('throttle'));

  const chrome = buildChrome({ name, look });

  // `game.js` L84-98's numbers, including the envIntensity argument. Read that block before
  // moving 3.20 — it is the answer to a measured "the mid-tones were missing", not a taste call.
  const engine = await estate({
    cameraPos: [0, 1.6, 8.0],
    target: [0, 1.2, 3.0],
    fov: 62,
    far: 90,
    orbit: false,
    envIntensity: 3.20,
    seed: Number.isFinite(seed) ? (0x5eed ^ (seed | 0)) : 0x5eed,
  });

  const bed = await buildFollowBed(engine, {
    seed: Number.isFinite(seed) ? seed | 0 : 0,
    throttle,
    accent: parseInt(look.accent.slice(1), 16),
    still: params.get('still') === '1',
    pinShot: params.get('shot') || null,
  });

  /*
   * ⚠️ ONE LAP WITH EVERYTHING VISIBLE, THEN FINALIZE, THEN HAND RESIDENCY BACK.
   * `finalizeScene()` patches materials for screen AO and drives a compile pass, and BOTH walk
   * VISIBLE objects only (`views/game.js` L3320-3330). A room hidden at this moment compiles its
   * shaders on the frame the camera first cuts into it — which on a TV is a hitch in the middle
   * of the show, in front of the whole room.
   */
  for (const s of bed.room.spaces) if (s.root) s.root.visible = true;
  engine.finalizeScene();
  bed.step(0, 0);

  let first = true;
  engine.onUpdate((dt, t) => {
    bed.step(Math.min(dt, 0.05), t);
    chrome.tick(bed.readout(), t);
    if (first) {
      first = false;
      // The host cross-fades its slate off this, and `harness/party-follow-drive.mjs` waits on it.
      document.body.dataset.rrrFollow = 'live';
      try { parent.postMessage({ t: 'follow', ready: true, shot: bed.readout().shot }, '*'); } catch { /* standalone */ }
    }
  });

  engine.markReady();
  engine.start();

  // The drive reads these to prove the camera is standing IN the house rather than in a slate.
  window.__rrrFollow = {
    room: bed.room,
    runner: bed.runner,
    readout: () => bed.readout(),
    spaceOfCamera: () => bed.room.spaceAt(engine.camera.position)?.id ?? null,
    cameraY: () => engine.camera.position.y,
    storeyOfCamera: () => bed.room.spaceAt(engine.camera.position)?.storey ?? null,
  };

  return engine;
}

/**
 * The broadcast furniture — REC dot, lower-third, letterbox, scanline wash.
 *
 * DOM over the canvas rather than in-scene, because it is a BROADCAST overlay: it belongs to the
 * production, not to the house, and putting it in the scene would put it through the grade and
 * the bloom. Palette is `src/party/night-skin.js`'s, so the follow and the TV around it are one
 * picture rather than two.
 */
function buildChrome({ name, look }) {
  const style = document.createElement('style');
  style.textContent = `
    #fl { position:fixed; inset:0; pointer-events:none; z-index:20;
      font-family: ui-sans-serif, system-ui, sans-serif; color:#f3ece3; }
    #fl .bar { position:absolute; left:0; right:0; height:6.5%; background:#000; }
    #fl .bar.t { top:0; } #fl .bar.b { bottom:0; }
    #fl .wash { position:absolute; inset:0;
      background:
        radial-gradient(ellipse 92% 88% at 50% 46%, transparent 52%, rgba(0,0,0,.55) 100%),
        repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 1px, transparent 1px 3px); }
    #fl .rec { position:absolute; top:9%; left:2.6%; display:flex; align-items:center; gap:9px;
      letter-spacing:.24em; text-transform:uppercase; font-size:12px; font-weight:700;
      color:#e8dcc8; text-shadow:0 2px 10px rgba(0,0,0,.9); }
    #fl .dot { width:11px; height:11px; border-radius:50%; background:#ff4d3d;
      box-shadow:0 0 12px rgba(255,77,61,.85); animation: fl-rec 2s ease-in-out infinite; }
    #fl .third { position:absolute; left:2.6%; bottom:10.5%; display:flex; align-items:flex-end; gap:14px; }
    #fl .third .face { width:64px; height:64px; filter: drop-shadow(0 8px 20px rgba(0,0,0,.8)); }
    #fl .third .who { font-size:clamp(30px, 4.6vw, 62px); font-weight:800; line-height:.98;
      text-shadow:0 3px 18px rgba(0,0,0,.95); }
    #fl .third .sub { margin-top:6px; font-size:12px; letter-spacing:.26em; text-transform:uppercase;
      color:#f5a14a; text-shadow:0 2px 10px rgba(0,0,0,.9); }
    #fl .slug { position:absolute; right:2.6%; bottom:11%; text-align:right;
      font-size:11px; letter-spacing:.26em; text-transform:uppercase; color:#a89884;
      text-shadow:0 2px 10px rgba(0,0,0,.9); }
    #fl .slug b { color:#e8dcc8; font-weight:700; }
    @keyframes fl-rec { 0%,100% { opacity:.25; } 50% { opacity:1; } }`;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'fl';
  el.innerHTML = `
    <div class="wash"></div>
    <div class="bar t"></div><div class="bar b"></div>
    <div class="rec"><span class="dot"></span><span>${esc(REC_LABEL)}</span></div>
    <div class="third">
      <div class="face">${robotFaceSvg(look.shell, look.accent, { size: 64 })}</div>
      <div>
        <div class="who">${esc(name)}</div>
        <div class="sub">live · expedition</div>
      </div>
    </div>
    <div class="slug"><b data-shot>chase</b> · <span data-thr>walk</span></div>`;
  document.body.appendChild(el);

  const shotEl = el.querySelector('[data-shot]');
  const thrEl = el.querySelector('[data-thr]');
  let last = '';
  return {
    tick(read) {
      const key = `${read.shot}|${read.throttle}`;
      if (key === last) return;                 // a DOM write a frame is a DOM write too many
      last = key;
      shotEl.textContent = read.shot;
      thrEl.textContent = String(read.throttle).toLowerCase();
    },
  };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
