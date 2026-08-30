import { estate } from './_studio.js';
import { buildFollowBed } from '../game/follow-bed.js';
import { SEAT_ANCHOR_CONTROL } from '../characters/mesh-avatar.js';
import {
  CAM_LABEL, FOLLOW_CHROME_CSS, cleanCampose, cleanThrottle, cueViolations, followViolations,
  warmViolations, liveTexture, dropDeadMaps,
} from '../party/follow.js';
import { DEFAULT_LOOK, cleanLook, robotFaceSvg } from '../party/look.js';
import { pickPlanSeed } from '../party/mansion.js';
import { NIGHT_TOKENS } from '../party/palette.js';

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
  document.body.style.cssText = 'margin:0;background:#080604;overflow:hidden';   // --night-deep

  /*
   * The closed schema, enforced at the door. A violation THROWS rather than being dropped:
   * `main.js` turns that into the visible failure card, which is the correct outcome, because a
   * follow slot that silently swallowed a `flyover=1` would be a silent guide-map leak on the
   * one screen everybody is looking at.
   */
  /*
   * 🔥 THE WARM SLOT IS THE STRICTER DOOR, AND IT IS CHECKED SEPARATELY.
   *
   * `?warm=1` is the night-long slot `views/party-host.js` mounts at LOBBY
   * (`docs/slices/task-prime-time-lobby-warm-night.md` §3.1). It carries no cast at all — that
   * arrives later on the cue channel — so a `runner=` or a `name=` on a warm URL is a sign
   * something is building the wrong slot, and it fails here rather than rendering a night whose
   * URL will need reassigning (which is a reload, which is the whole defect).
   */
  const warm = params.get('warm') === '1';
  const bad = warm ? warmViolations(params) : followViolations(params);
  if (bad.length) throw new Error(`follow slot: forbidden or unknown params — ${bad.join(', ')}`);

  const runnerId = params.get('runner') || '';
  const name = (params.get('name') || 'The runner').slice(0, 12);
  const look = cleanLook({ shell: params.get('shell'), accent: params.get('accent') }) || DEFAULT_LOOK;
  const seed = Number(params.get('seed'));
  const throttle = cleanThrottle(params.get('throttle'));

  /*
   * 📊 **THE PROGRESS REPORT, AND IT IS THE FIRST THING THIS VIEW DOES.**
   *
   * John's note on `bb7cf6a` was three complaints and one of them was *"no loading indicator"*.
   * The other two — loading late, loading slowly — are answered by mounting at lobby; this is the
   * answer to the third, and it has to fire BEFORE `estate()` because the several seconds between
   * the iframe existing and the engine existing were previously indistinguishable from a dead
   * frame.
   *
   * `warmPct` lives in `src/party/follow.js` so `harness/party-warm.mjs` W5 can assert the ladder
   * is monotonic without a browser. Nothing here interpolates: a bar that eases on a timer is a
   * lie that gets found out on the slow TV where the bar is the only thing that matters.
   */
  const report = (stage) => {
    document.body.dataset.rrrWarm = stage;
    try { parent.postMessage({ t: 'follow', warm: stage }, '*'); } catch { /* standalone */ }
  };
  report('boot');

  const chrome = buildChrome({ name, look, warm });

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
  report('engine');

  /*
   * 🏚️ THE PLAN IS DERIVED, NEVER TYPED. `plan` is on `FOLLOW_FORBIDDEN` and stays there; the
   * party night is always procedural and always keyed to the public `worldSeed`, so the guide's
   * phone can derive the identical house from the identical number. A standalone camera opened
   * with no `seed` gets `pickPlanSeed(0)` — a real generated house rather than the authored bed,
   * because "always different each night" should be true of the developer's window too.
   */
  const plan = pickPlanSeed(Number.isFinite(seed) ? seed | 0 : 0);
  if (!plan.ok) {
    console.warn(`[follow] no candidate plan near seed ${seed} had a reachable gallery and ballroom; `
      + `falling back to ${plan.seed}. The mission may be unplayable on this seed.`);
  }

  const bed = await buildFollowBed(engine, {
    seed: Number.isFinite(seed) ? seed | 0 : 0,
    planSeed: plan.seed,
    warm,
    throttle,
    accent: parseInt(look.accent.slice(1), 16),
    still: params.get('still') === '1',
    pinShot: params.get('shot') || null,
    campose: cleanCampose(params.get('campose')),
    onStage: report,
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

  /*
   * 🔁 **THE CUE LISTENER — the second door into this renderer, with the same lock on it.**
   *
   * The view still has NO SOCKET, and that is still the safety argument. What it now has is a
   * message channel from its own parent — which is `views/party-host.js`, same origin, and the
   * only window that can reach it — carrying six known shapes. Everything a socket would have
   * given it (a frame to mis-project, an event log to over-replay) is still absent.
   *
   * ⚠️ **`cueViolations` IS CHECKED HERE AS WELL AS AT THE SENDER, AND THAT IS NOT BELT AND
   * BRACES.** The host is one sender today. A closed schema that is only enforced by the caller is
   * a convention; enforced at the door it is a property of this view, and it stays true for
   * whatever mounts this iframe next.
   */
  window.addEventListener('message', (e) => {
    if (e.source !== parent) return;
    const cue = e.data;
    if (!cue || cue.t !== 'cue') return;
    const violations = cueViolations(cue.cue);
    if (violations.length) {
      console.error(`[follow] refused a cue: ${violations.join(', ')}`);
      return;
    }
    try {
      bed.cue(cue.cue);
      guardSceneTextures(engine.scene);
    } catch (err) {
      /*
       * A cue throw used to paint VIEW "party.follow" FAILED over a live Verdict.
       * Episode 3 after Fox, 30 Aug: idle read `.length` on a null last-cast.
       * The show stays up; the next intros cue still dresses the ballroom.
       */
      console.error('[follow] cue failed', err);
      window.__rrrClearViewFail?.();
    }
  });

  let first = true;
  let told = 0;
  engine.onUpdate((dt, t) => {
    try {
      // `Engine._liveLoop` already clamps dt to 0.1. Do not clamp harder: on a slow TV (or a
      // software rasteriser) a tighter clamp does not protect anything, it just makes the runner
      // crawl — the simulation falls behind the wall clock in proportion to the clamp.
      bed.step(dt, t);
      chrome.tick(bed.readout(), t, bed);
      if (first) {
        first = false;
        report('ready');
        // The host cross-fades its slate off this, and `harness/party-follow-drive.mjs` waits on it.
        document.body.dataset.rrrFollow = 'live';
        try { parent.postMessage({ t: 'follow', ready: true, shot: bed.readout().shot }, '*'); } catch { /* standalone */ }
      }
      /*
       * 🌍 TWICE A SECOND, AND ONLY DURING THE RUN. `src/party/room.js` `setWorld` broadcasts on
       * every report, so this rate is the intel's refresh rate as well as its cost; 2 Hz is fast
       * enough for a guide to call a room and far too slow to be a position feed anyone could aim
       * with. Nothing is reported during `warm` or `intros` — there is no expedition to report on,
       * and a hunter mark on a lobby screen would be a leak with no game behind it.
       */
      if (bed.mode === 'run' && t - told >= 0.5) {
        told = t;
        try { parent.postMessage({ t: 'follow', world: bed.world() }, '*'); } catch { /* standalone */ }
      }
      if (bed.mode === 'intros' && bed.introsDone()) {
        try { parent.postMessage({ t: 'follow', intros: 'done' }, '*'); } catch { /* standalone */ }
      }
    } catch (err) {
      console.error('[follow] tick failed', err);
      window.__rrrClearViewFail?.();
    }
  });

  /*
   * C — last-look popup AFTER the graded B picture. Scissor a small bottom-right
   * feed from the accused's chair eyeline. One black frame on the cut, then gone.
   * Never the full frame. DOM labels live in `#fl .lastlook`.
   */
  const camC = engine.camera.clone();
  const rawRender = engine.pipeline.render.bind(engine.pipeline);
  const restoreCanvas = (r) => {
    const canvas = r.domElement;
    r.setScissorTest(false);
    r.setViewport(0, 0, canvas.width, canvas.height);
    r.setRenderTarget(null);
  };
  engine.pipeline.render = (ms) => {
    try {
      rawRender(ms);
    } catch (err) {
      /*
       * A missing map `.image` after execute/wreck used to paint VIEW FAILED
       * and leave it up. Drop the dead texture, keep the ballroom.
       */
      console.error('[follow] picture failed', err);
      window.__rrrClearViewFail?.();
      guardSceneTextures(engine.scene);
      try {
        rawRender(ms);
      } catch {
        try {
          const r = engine.renderer;
          restoreCanvas(r);
          r.render(engine.scene, engine.camera);
        } catch (fallbackErr) {
          console.error('[follow] fallback picture failed', fallbackErr);
        }
      }
      return;
    }
    try {
      const ll = bed.lastLook?.();
      if (!ll || (ll.state !== 'live' && ll.state !== 'cut')) return;
      const r = engine.renderer;
      r.setRenderTarget(null);
      const canvas = r.domElement;
      const w = canvas.width;
      const h = canvas.height;
      const bw = Math.max(96, Math.round(w * 0.22));
      const bh = Math.max(54, Math.round(bw * 9 / 16));
      const x = w - bw - Math.round(w * 0.028);
      const y = Math.round(h * 0.11);
      const prevAuto = r.autoClear;
      r.autoClear = false;
      r.setScissorTest(true);
      r.setViewport(x, y, bw, bh);
      r.setScissor(x, y, bw, bh);
      r.setClearColor(0x000000, 1);
      r.clear(true, true, true);
      if (ll.state === 'live' && ll.eye && ll.at) {
        camC.fov = ll.fov || 46;
        camC.aspect = bw / Math.max(1, bh);
        camC.near = 0.08;
        camC.far = 40;
        camC.position.set(ll.eye.x, ll.eye.y, ll.eye.z);
        camC.up.set(0, 1, 0);
        camC.lookAt(ll.at.x, ll.at.y, ll.at.z);
        camC.updateProjectionMatrix();
        r.render(engine.scene, camC);
      } else if (ll.state === 'cut') {
        bed.consumeLastLookCut?.();
      }
      r.setScissorTest(false);
      r.setViewport(0, 0, w, h);
      r.autoClear = prevAuto;
      void ms;
    } catch (err) {
      console.error('[follow] last-look failed', err);
      try { restoreCanvas(engine.renderer); } catch { /* keep last frame */ }
    }
  };

  /*
   * Live before the first rAF so a verdict-frame throw cannot paint `#err`.
   * Last-look C is still the corner PIP; this only stops a null `.image`
   * from owning the show.
   */
  document.body.dataset.rrrFollow = 'live';
  guardSceneTextures(engine.scene);
  engine.markReady();
  engine.start();

  // The drive reads these to prove the camera is standing IN the house rather than in a slate.
  window.__rrrFollow = {
    room: bed.room,
    runner: bed.runner,
    readout: () => bed.readout(),
    spaceOfCamera: () => bed.room.spaceAt(engine.camera.position)?.id ?? null,
    cameraY: () => engine.camera.position.y,
    mode: () => bed.mode,
    world: () => bed.world(),
    /*
     * The patrol, for `harness/party-playtest-drive.mjs`. A window property on a same-origin
     * iframe, deliberately NOT the DOM: `party-follow-drive` D6 greps this document's whole
     * `innerHTML` and the slot's `src` for the word "hunter", and it must keep coming back clean.
     * There is still nothing here to render and nothing here to see.
     */
    /* 🟢 The link streams in flight, for jellie-play. A count and how many glyphs are lit —
     * there is nothing here about WHO is paired that the television is not already showing, and
     * nothing at all about what was said. */
    stream: () => bed.streamReport?.() ?? [],
    /*
     * 🎥 The lens, for `harness/cam-clip-drive.mjs`. How far it is from the runner, which way the
     * STICK's frame points, and how many times the shot has had to be corrected — the three
     * numbers John's *"the camera pushes into the players robot and the direction of the movement
     * is affected"* is made of. Nothing here is a secret: it is the shot the room is watching.
     */
    cam: () => bed.camReport?.() ?? null,
    /*
     * 🎭 The Reckoning's staging, for `harness/accusation-beat.mjs`. `accusation()` is what the
     * stage believes (live keys, un-fired beats, who is performing, which plates wear the
     * accusation ink); `sit()` is the seated circle a row at a time, each row carrying the
     * PERFORMANCE (`seatedAction`) as well as the seat's resting `clip`. Without these two a
     * bone probe can watch a robot stand up and cannot say what it is playing — AB2c's "the
     * animation is real and no instrument can see which one it is".
     *
     * Both are public facts about a picture the whole room is watching: who was nominated is
     * already on the plate, on the `!` and on the TV board. Neither reaches a phone, and this
     * view still has no socket.
     */
    accusation: () => bed.accusationReport?.() ?? null,
    sit: () => bed.sitReport?.() ?? [],
    execution: () => bed.executionReport?.() ?? null,
    lastLook: () => bed.lastLook?.() ?? null,
    /*
     * 🚦 **THE GATE'S CONTROL, AND IT IS THE ONE SWITCH HERE THAT CHANGES THE PICTURE.**
     * `accusation-beat` AB2d-ctl flips this on to restore the unbounded hips accumulation the
     * gate was written against, proves AB2d still goes red, and leaves it off. It is a pelvis
     * offset and nothing else — it cannot reach a role, a frame or a socket — and it is the
     * same shape as `room.js`'s `leak:` switches: the fault lives in the product file, off by
     * default, reachable only from a harness. Nothing in the night calls it.
     */
    anchorControl: (on) => {
      SEAT_ANCHOR_CONTROL.integrate = !!on;
      return SEAT_ANCHOR_CONTROL.integrate;
    },
    hunter: () => bed.hunterTelemetry(),
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
function buildChrome({ name, look, warm }) {
  /*
   * 🎨 THE PALETTE IS IMPORTED, NOT INHERITED, AND THIS SURFACE IS THE REASON IT HAS TO BE.
   *
   * `palette.js` (#6): *"the card's colours are not hexes… a reskin that misses the card now
   * fails a gate instead of a playtest."* Same hazard, one frame further out — this overlay lives
   * in an IFRAME, so it is in a different document from `injectNightSkin()`'s `:root` block and
   * inherits nothing at all. Without these two lines the follow would be the one surface in the
   * house that a reskin could not reach, on the biggest screen in the room.
   *
   * The rules themselves are in `src/party/follow.js` so a bare-node gate can walk them, exactly
   * as `rolecard.js` holds `ROLE_CARD_CSS` for `role-peek` P11.
   */
  const style = document.createElement('style');
  style.textContent = `${NIGHT_TOKENS}\n${FOLLOW_CHROME_CSS}`;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'fl';
  el.innerHTML = `
    <div class="wash"></div>
    <div class="bar t"></div><div class="bar b"></div>
    <div class="rec"><span class="dot"></span><span>${esc(CAM_LABEL)}</span></div>
    <div class="third">
      <div class="face">${robotFaceSvg(look.shell, look.accent, { size: 64, treatment: 'chip' })}</div>
      <div>
        <div class="who">${esc(name)}</div>
        <div class="sub">live · expedition</div>
      </div>
    </div>
    <div class="slug"><b data-shot>chase</b> · <span data-thr>walk</span></div>
    <div class="lastlook" hidden>
      <div class="ll-top"><span class="ll-dot"></span><span class="ll-tag">THEIR EYES</span><span class="ll-name"></span></div>
      <div class="ll-dead">DEAD</div>
    </div>`;
  document.body.appendChild(el);

  /*
   * 🔥 **THE BROADCAST FURNITURE IS OFF DURING THE WARM AND THE INTROS, AND IT COMES ON WITH THE
   * RUN.** A REC dot and a lower-third naming a runner, over a slow drift through an empty
   * ballroom behind a lobby's QR code, would be the TV claiming to be broadcasting a show that has
   * not been cast yet. `#fl.pre` keeps the letterbox and the wash — the frame is still a frame —
   * and hides the production graphics until there is a production.
   */
  if (warm) el.classList.add('pre');

  const shotEl = el.querySelector('[data-shot]');
  const thrEl = el.querySelector('[data-thr]');
  const whoEl = el.querySelector('.who');
  const subEl = el.querySelector('.sub');
  const lookEl = el.querySelector('.lastlook');
  const lookName = el.querySelector('.lastlook .ll-name');
  const lookTag = el.querySelector('.lastlook .ll-tag');
  let last = '';
  let lastLookKey = '';
  return {
    tick(read, t, bed) {
      const mode = bed?.mode ?? 'run';
      el.classList.toggle('pre', mode !== 'run');
      /*
       * The lower-third names whoever the picture is actually on: the arriving robot during the
       * intros, the runner during the run. It is the ONE place a name reaches the shared screen,
       * and a name is a published nameplate — not a role. `party-follow` F8d's rule still holds:
       * the overlay never names a ROOM.
       */
      const who = mode === 'intros' ? 'the cast' : (bed?.runnerName ?? name);
      const key = `${mode}|${read.shot}|${read.throttle}|${who}`;
      if (key !== last) {
        last = key;
        shotEl.textContent = read.shot;
        thrEl.textContent = String(read.throttle).toLowerCase();
        whoEl.textContent = who;
        subEl.textContent = mode === 'run' ? 'live · expedition' : `live · ${mode}`;
      }
      /*
       * C is its own clock. A shared early-return used to leave THEIR EYES up after
       * death because the lower-third key had not changed. Hard-cut, no fade.
       */
      const ll = bed?.lastLook?.() ?? { state: 'off' };
      const lk = `${ll.state}|${ll.name || ''}`;
      if (lk === lastLookKey) return;
      lastLookKey = lk;
      lookEl.hidden = ll.state !== 'live' && ll.state !== 'cut';
      lookEl.classList.toggle('on', ll.state === 'live');
      lookEl.classList.toggle('cut', ll.state === 'cut');
      lookTag.textContent = ll.state === 'cut' ? 'OFF AIR' : 'THEIR EYES';
      lookName.textContent = ll.name || '';
    },
  };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Drop maps / env / cube faces whose `.image` is null so three cannot throw
 * on the live TV. Meshes stay — a wreck stays on the floor.
 */
function guardSceneTextures(scene) {
  if (!scene) return;
  if (scene.environment && liveTexture(scene.environment) == null) scene.environment = null;
  if (scene.background && scene.background.isTexture && liveTexture(scene.background) == null) {
    scene.background = null;
  }
  scene.traverse?.((o) => {
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) dropDeadMaps(m);
  });
}
