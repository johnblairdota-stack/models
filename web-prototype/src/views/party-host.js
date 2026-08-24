/**
 * TV / host — the shared screen. Not game.play. Not a flyover. Not a sledge tutorial.
 *
 * Host socket is the TV spectator. Phones are robots.
 *
 * 🎥 **D13: DURING EXPEDITION THE RUN FRAME IS A REAL MANSION CAMERA.** This file is still DOM
 * only — no THREE, no scene, no flyover. What it does is mount `?view=party.follow` in an iframe
 * inside `.run-frame` and hand it a closed set of URL params (`src/party/follow.js`). That
 * iframe is the ownership boundary as well as the render: the follow has no socket, so it is
 * structurally incapable of putting a role, a hunter or the guide's map on the shared screen.
 * `docs/slices/task-d13-tv-follow.md`.
 */
import { PartyNightClient, defaultWsUrl, makeCode, tokenKey } from '../party/night-client.js';
import { recapFromEvents } from '../party/recap.js';
import { injectNightSkin, markPartyReady, playerName } from '../party/night-skin.js';
import { qrSvg } from '../party/qr.js';
import {
  DEFAULT_LOOK, SHOW_LINE, SHOW_TITLE, cleanLook, codeBugHtml, countdownHtml, nameplateHtml,
  recBugHtml, robotFaceSvg, rundownRailHtml, titlePlateHtml, verdictPlateHtml,
} from '../party/look.js';
import { mergePublicNames, publicName } from '../party/cast-ui.js';
import { cueViolations, warmLabel, warmPct, warmUrl } from '../party/follow.js';
import { formatRemain, holdMsFor, isTalkBeat, remainingMs, rundownRibbon } from '../party/show.js';
import { NO_ONE, SHOWRUNNER } from '../party/vote.js';
import { describeCastTiebreaks, previewCastTiebreaks } from '../party/ballot.js';

/** TV chrome 3·2·1 after ballots can lock a pair, then `{ t: 'episode' }`. */
const SEND_COUNTDOWN_MS = 3000;
/**
 * Follow introsDone arrives from the iframe's rAF loop, which stops when the TV
 * tab is hidden. Overnight grind then never arms the 3·2·1. ~12s after send
 * (or after the tab is backgrounded) we force the beat so a pair can still go in.
 * Visible nights wait for the real walk-in — 8-player intros are longer than 12s.
 */
const INTROS_DONE_MS = 12000;

export default async function partyHost({ params }) {
  injectNightSkin();
  markPartyReady();
  document.title = 'PRIME TIME — host';
  document.body.style.overflow = 'hidden';

  const root = document.createElement('div');
  root.className = 'night';
  document.body.appendChild(root);

  let code = (params.get('room') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (code.length < 4) {
    code = makeCode();
    const u = new URL(location.href);
    u.searchParams.set('view', 'party.host');
    u.searchParams.set('room', code);
    history.replaceState({}, '', u);
  }

  const joinPath = `${location.origin}/?view=party.phone&room=${encodeURIComponent(code)}`;
  const wsPort = +(params.get('wsPort') || 5181);
  const token = sessionStorage.getItem(tokenKey(code, 'tv'));
  const wsUrl = `${defaultWsUrl(wsPort)}/?room=${encodeURIComponent(code)}&host=1${token ? `&token=${token}` : ''}`;

  const ui = {
    beat: 'lobby',
    /** SMASHED / TIME from the server's `show` message — how the last live run ended. Never
     *  guessed on the TV; see `recapBoard` and `RUN_END` in `src/party/show.js`. */
    runEnd: null,
    err: '',
    locked: false,
    /** 3 s auto-send after a casting pair is decidable. Host tap is gone. */
    sendArmed: false,
    sendUntil: 0,
    /** The mansion's own progress, straight off the slot. `''` until the iframe says anything. */
    warm: '',
    warmPct: 0,
    /** Set once the intro cue has gone out, so a repaint cannot fire it twice. */
    introsSent: false,
    introsDone: false,
    introsTimer: 0,
    /** The runner the run cue named, so a repaint cannot re-cue the same runner. */
    cuedRunner: null,
    /** How many world reports have been relayed. Read by the drive, never by the UI. */
    worldSent: 0,
    /** Epoch ms from the server `show.until`. Clients tick; the server owns the deadline. */
    showUntil: null,
    /** Seated-circle cue after the run, so debrief is not an empty ballroom. */
    sitCued: false,
    nomsKey: '',
  };

  /**
   * ⚠️ DECLARED BEFORE THE SOCKET, AND THAT IS NOT TIDINESS. `client.connect()` below delivers
   * `welcome` and `lobby` synchronously into `onMessage`, which calls `paint()`, which calls
   * `syncFollow()`. A `const` declared further down the function is still in its temporal dead
   * zone at that moment — measured: `ReferenceError: Cannot access 'follow' before
   * initialization`, thrown out of the first three paints, on a TV that otherwise looked fine.
   */
  const follow = { layer: null, el: null, src: null, live: false, raf: 0, mode: 'warm' };

  /** The latest pad message, and the frame that will deliver it. See `onMessage`'s `t:'move'`. */
  const pad = { pending: null, raf: 0 };
  function flushMove() {
    pad.raf = 0;
    const m = pad.pending;
    if (!m) return;
    pad.pending = null;
    sendCue({
      kind: 'move',
      x: +m.x || 0,
      y: +m.y || 0,
      lookX: +m.lookX || 0,
      lookY: +m.lookY || 0,
      run: !!m.run,
      swing: !!m.swing,
    });
  }
  function queueMove(m) {
    // A swing is an EDGE and must not be swallowed by a later stick sample that has no swing on
    // it — coalescing the stick is free, coalescing a tap loses the blow the player asked for.
    if (pad.pending?.swing) m = { ...m, swing: true };
    pad.pending = m;
    if (!pad.raf) pad.raf = requestAnimationFrame(flushMove);
  }

  const client = new PartyNightClient({
    url: wsUrl,
    onMessage: (m) => {
      if (m.t === 'welcome') sessionStorage.setItem(tokenKey(code, 'tv'), m.token);
      // `end` rides with `beat` and is cleared whenever a `show` message omits it (an expedition
      // start never carries one) — the TV must not keep showing SMASHED/TIME from a past run.
      if (m.t === 'show' && m.beat) {
        ui.beat = m.beat;
        ui.runEnd = m.end || null;
        ui.showUntil = Number.isFinite(m.until) ? m.until : null;
      }
      if (m.t === 'full') ui.err = 'The TV seat is taken. Close the other host tab, or pick a new room code.';
      /*
       * 🕹️ THE RUNNER'S THUMBS, ON THEIR WAY TO THE BODY. The server relays these to the TV alone
       * (`net/party/local.mjs`), because the TV is the only socket with a mansion in it.
       *
       * ⚠️ **COALESCED TO ONE CUE PER ANIMATION FRAME.** The phone posts at 20 Hz and the mansion
       * renders at up to 60; forwarding each message the instant it lands would post into the
       * iframe from a socket callback, several times between frames, for a value the bed only
       * reads once per `step`. `pending` holds the latest and the rAF delivers it.
       */
      if (m.t === 'move') { queueMove(m); return; }
      if (m.t === 'warm' && !follow.el) {
        // A second TV, or a host that reloaded mid-night: adopt the reported progress rather than
        // showing a bar at zero next to a mansion somebody else already baked.
        ui.warm = m.stage; ui.warmPct = m.pct ?? warmPct(m.stage);
      }
      if (m.t === 'lobby' && patchLobby(root, client, ui, m)) return;
      paint();
    },
    onClose: () => { ui.err = ui.err || 'Disconnected from the room server.'; paint(); },
  });

  try {
    await client.connect();
    if (client.welcome?.isTV === false) {
      ui.err = 'This tab was seated as a robot, not the TV. Open ?view=party.host on a fresh room.';
    }
  } catch (e) {
    ui.err = (e && e.message) || String(e);
  }

  function phones() {
    return (client.lobby?.seats || []).filter((s) => !s.isTV && s.joined);
  }
  function livePhones() {
    return phones().filter((s) => s.connected);
  }
  function players() {
    return mergePublicNames(client.frame?.players, client.lobby);
  }

  function setBeat(beat) {
    ui.beat = beat;
    client.send({ t: 'show', beat });
    paint();
  }

  /**
   * 🎥 THE FOLLOW SLOT — one iframe, in a LAYER over the run frame, never inside it.
   *
   * 🚨 **`paint()` REBUILDS `root.innerHTML` ON EVERY WEBSOCKET MESSAGE, INCLUDING EVERY LOBBY
   * SNAPSHOT.** An `<iframe>` emitted inside that string is destroyed and rebuilt each time — a
   * fresh WebGL context and a fresh multi-second mansion bake, several times a second, which
   * presents as a TV that never finishes loading.
   *
   * 🚨 **AND MOVING AN IFRAME BETWEEN PARENTS RELOADS IT TOO, WHICH IS WHY THE OBVIOUS FIX DOES
   * NOT WORK.** Holding the element in this closure and `appendChild`-ing it into a mount point
   * the current paint had just written *looks* like it preserves the element, and it does — but
   * the HTML spec discards a nested browsing context when its `iframe` is removed from a
   * document, and re-inserting it creates a new one and re-fetches `src`. So the element would
   * survive and the mansion inside it would not. That was built, run, and measured reloading;
   * this is the second design, and it is why `runStage()` emits no mount point.
   *
   * What works: a LAYER — a `position:fixed` element created once, parented to `document.body`,
   * outside everything `paint()` touches. It never moves in the DOM, so it never reloads. It is
   * positioned over `.run-frame`'s client rect each frame while it is visible; one
   * `getBoundingClientRect` per frame on a static layout is not a cost worth avoiding, and it
   * cannot drift out of register the way a paint-time-only sync could.
   *
   * 🚨 **ASSIGNING THE SAME `src` STRING AGAIN IS ALSO A RELOAD.** `followUrl()` is a pure
   * function of (beat, room, runner, name, look, seed) exactly so this comparison is meaningful;
   * `harness/party-follow.mjs` F6 is the assertion that keeps it pure.
   *
   * ⚠️ **THE LAYER IS HIDDEN OFF THE RUN BEAT, NOT DESTROYED.** The mansion is baked once per
   * night, not once per episode: a recap that tore the context down would make every episode
   * after the first pay the bake again, in front of the room. `teardownFollow()` exists for the
   * one case that does need it — the socket going away.
   *
   * (`follow` itself is declared above the socket. See the note there.)
   */
  function ensureFollow() {
    if (follow.layer) return;
    const layer = document.createElement('div');
    layer.className = 'run-cam-layer';
    const f = document.createElement('iframe');
    f.className = 'run-cam';
    f.title = 'Follow camera';
    // Scripts and same-origin only: the follow needs WebGL and `parent.postMessage`, and
    // nothing else. No forms, no popups, no top navigation.
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    f.setAttribute('allow', 'autoplay');
    layer.appendChild(f);
    document.body.appendChild(layer);
    follow.layer = layer;
    follow.el = f;
  }

  function teardownFollow() {
    if (follow.raf) { cancelAnimationFrame(follow.raf); follow.raf = 0; }
    follow.layer?.remove();
    follow.layer = null;
    follow.el = null;
    follow.src = null;
    follow.live = false;
  }

  /**
   * 🔥 **THE LAYER HAS TWO PLACEMENTS, AND NEITHER OF THEM IS `display:none`.**
   *
   * `run` — sized to `.run-frame`'s client rect, over the show, exactly as D13 shipped it.
   * `warm` — full-bleed, BEHIND the lobby, opacity ramping with the bake.
   *
   * ⚠️ **THE WARM LAYER IS DIMMED, NEVER HIDDEN, AND THAT IS A BROWSER CONSTRAINT RATHER THAN A
   * TASTE CALL.** `display:none` and `visibility:hidden` both let a browser throttle or stop
   * `requestAnimationFrame` in a same-origin iframe — which would pause the bake this whole slice
   * exists to run early. So the mansion is always composited; during the lobby it is simply turned
   * down to a backdrop under a scrim.
   *
   * That turns out to be the better indicator anyway. A spinner tells you something is happening;
   * a mansion fading up behind the join code tells you WHAT is happening, and it is the thing they
   * are about to be inside.
   */
    function placeFollow() {
    if (!follow.layer) return;
    const frame = root.querySelector('.run-frame') || root.querySelector('.intro-frame');
    const s = follow.layer.style;
    const runMode = (follow.mode === 'run' || follow.mode === 'intros') && !!frame;
    follow.layer.classList.toggle('warm', !runMode);
    follow.layer.classList.toggle('intros', follow.mode === 'intros' && runMode);
    if (runMode) {
      const r = frame.getBoundingClientRect();
      s.left = `${r.left}px`;
      s.top = `${r.top}px`;
      s.width = `${r.width}px`;
      s.height = `${r.height}px`;
    } else {
      s.left = '0px'; s.top = '0px'; s.width = '100vw'; s.height = '100vh';
    }
    // The camera fades UP over the slate rather than the slate fading out from under a black
    // rectangle — during the bake the layer is fully transparent and the still is the picture.
    follow.layer.classList.toggle('live', follow.live);
    frame?.classList.toggle('live', follow.live && runMode);
    // The lobby only becomes a scrim once there is a rendered frame to be a scrim over.
    document.body.classList.toggle('rrr-warming', !runMode && follow.live);
  }

  function followLoop() {
    follow.raf = follow.layer ? requestAnimationFrame(followLoop) : 0;
    placeFollow();
  }

  /**
   * 🚨 **MOUNTED ONCE PER NIGHT. THE `src` IS ASSIGNED EXACTLY ONCE AND NEVER AGAIN.**
   *
   * `ensureFollow`'s header already records what a reassignment costs: the HTML spec discards a
   * nested browsing context when its iframe is removed or its `src` re-set, so a fresh WebGL
   * context and a fresh multi-second bake. This slice makes that worse — a reload now also
   * re-fetches a 9.0 MB character — and it makes it avoidable, because `warmUrl` is a function of
   * (room, worldSeed) and neither of those changes after the TV has connected.
   *
   * Everything that DOES change during a night — who is running, what their thumbs are doing —
   * goes over `sendCue` instead. That is the whole reason the cue channel exists.
   */
  function mountFollow() {
    ensureFollow();
    if (follow.src) return;
    /*
     * 🚨 **NOT ONE BYTE OF `src` UNTIL THE SEED IS REAL. THIS GUARD IS THE SECOND HALF OF A FIX
     * FOR A NIGHT-BREAKING RACE, AND IT USED TO READ `client.frame?.worldSeed ?? 0`.**
     *
     * `connect()` resolves on `welcome` and this view paints on every message, so the first paint
     * ran with `client.frame` still null. The `?? 0` then baked seed 0 into a URL that is
     * ASSIGNED EXACTLY ONCE PER NIGHT — while every phone derived its guide map from
     * `frame.worldSeed`, which the server defaults to 1. The TV rendered one mansion and the
     * guide called rooms off the plan of another, all night, silently.
     *
     * `worldSeed` now rides the welcome (`net/party/local.mjs`), so in practice this never has to
     * wait. The guard stays anyway: a default seed is a silent wrong house, and a late mount is a
     * bar that sits at 0% for one message. Those failures are not close to equally bad.
     */
    const seed = client.worldSeed;
    if (seed == null) return;
    follow.src = warmUrl({ room: code, worldSeed: seed });
    follow.el.src = follow.src;
    if (!follow.raf) follow.raf = requestAnimationFrame(followLoop);
  }

  /**
   * 🔁 Hand the mansion a cue. Refused at BOTH ends — see `views/party-follow.js`'s listener.
   *
   * A throw here would take out the paint that raised it, so a violation is logged and dropped on
   * this side and refused on the other. The gate (`harness/party-warm.mjs` W3) is what makes sure
   * a violation is a bug in the caller rather than a leak in the channel.
   */
  function sendCue(cue) {
    if (!follow.el?.contentWindow) return false;
    const bad = cueViolations(cue);
    if (bad.length) { console.error(`[host] refusing to send a cue: ${bad.join(', ')}`); return false; }
    follow.el.contentWindow.postMessage({ t: 'cue', cue }, location.origin);
    return true;
  }

  /**
   * The run cue must land AFTER the follow iframe can hear it. paint() used to stamp
   * `cuedRunner` before `sendCue`, so a Send-them-in that beat the iframe's first frame
   * dropped the cue forever — TV chrome said EXPEDITION, followLive flipped true off
   * `ready`, and the bed stayed in `warm` (slug "WARM · STILL", no runner in the shot).
   * Only mark cued once postMessage succeeded; `ready` retries the same path.
   */
  function cueRun(runnerId, names) {
    if (!runnerId || follow.mode !== 'run') return false;
    if (ui.cuedRunner === runnerId) return true;
    const look = seatLook(client.lobby, runnerId) || DEFAULT_LOOK;
    const ok = sendCue({
      kind: 'run',
      runner: String(runnerId),
      name: joinedName(names || players(), runnerId, 'The runner'),
      shell: look.shell,
      accent: look.accent,
      episode: Number(client.frame?.airingEpisode ?? client.lobby?.airingEpisode ?? 1),
    });
    if (ok) ui.cuedRunner = runnerId;
    return ok;
  }

  /** The joined phones, as the closed public subset the `intros` cue may carry. */
  function introCast() {
    return phones().map((s) => {
      const look = cleanLook(s) || DEFAULT_LOOK;
      return {
        id: s.playerId ?? s.id, seat: s.seat ?? 0,
        name: s.name ?? null, shell: look.shell, accent: look.accent,
      };
    });
  }

  /**
   * Everything the mansion reports back: its bake progress, its first frame, the end of the
   * intros, and — during the run only — where the bodies are.
   */
  window.addEventListener('message', (e) => {
    if (!follow.el || e.source !== follow.el.contentWindow) return;
    const m = e.data;
    if (m?.t !== 'follow') return;

    if (m.warm) {
      ui.warm = m.warm;
      ui.warmPct = warmPct(m.warm);
      paintWarm();
      // The room's wait, not the host's: a phone that has just typed its name should be able to
      // see that the night is loading rather than wonder whether anyone is there.
      client.send({ t: 'warm', stage: m.warm, pct: ui.warmPct });
      // The house being ready is what the intros were waiting for, if Start already happened.
      if (m.warm === 'ready') maybeIntros();
      return;
    }
    if (m.ready) {
      follow.live = true;
      root.querySelector('.run-frame')?.classList.add('live');
      /* Once the bed is live/run, CAMERA WARMING must not stay readable in the host underlay. */
      const warmSlot = root.querySelector('.run-slot');
      if (warmSlot) warmSlot.textContent = '';
      /*
       * Overnight post-#25: sendCue can "succeed" (contentWindow exists) before the
       * iframe has installed its message listener — cuedRunner latches and the bed
       * stays in warm, stamping WARM · WALK over a live ready expedition. Clear and
       * retry once the follow view is actually listening (this ready message).
       */
      const pair = client.frame?.pair || {};
      const recap = recapFromEvents(client.events);
      const runnerId = pair.runner || recap.runner || null;
      if (runnerId) {
        ui.cuedRunner = null;
        cueRun(runnerId, players());
      }
      return;
    }
    if (m.intros === 'done') {
      markIntrosDone();
      return;
    }
    if (m.world) {
      /*
       * 🌍 THE TV IS THE WORLD AUTHORITY AND THE SERVER IS THE FILTER. See
       * `src/party/follow.js`'s `WORLD_KEYS` header for why the arrow points this way, and
       * `src/party/intel.js` for what the server does with it. The host does not read this — it
       * relays it. A TV that interpreted the report would be a TV that knew where the hunter was,
       * which is the second item on `party-loop.md`'s "Do not" list.
       */
      ui.worldSent = (ui.worldSent || 0) + 1;
      client.send({ t: 'world', ...m.world });
    }
  });

  /**
   * 🎬 **THE INTROS RUN WHEN THE NIGHT HAS STARTED *AND* THE HOUSE IS READY — in either order.**
   *
   * Those two events race, and which one wins is the whole point of this slice. If the bake
   * finishes first (the normal case now, because it began when the first phone was still typing
   * its name) the intros fire the instant Start is pressed. If the room starts early, the warm bar
   * stays up and this fires later, off the `ready` report.
   *
   * ⚠️ **START IS NEVER BLOCKED ON THE BAKE.** A host button greyed out because a shader is
   * compiling is a worse failure than a wait with a visible cause — the room cannot tell those
   * apart from a broken TV, and John's note was about not knowing what was happening.
   */
  function maybeIntros() {
    if (ui.introsSent) return;
    if (ui.warm !== 'ready') return;
    if (ui.beat === 'lobby') return;
    /*
     * Late bake used to fire cast intros AFTER Send-them-in. playcritique overnight
     * post-#22: TV chrome already said EXPEDITION · episode 1, phones had the pad, and
     * the follow layer stamped INTROS · WALK over the live run. Intros are a casting
     * beat — once the pair is walking, the run cue owns the camera.
     */
    if (ui.beat === 'expedition' || ui.beat === 'recap' || ui.beat === 'debrief') return;
    if (ui.beat === 'reckoning' || ui.beat === 'vote' || ui.beat === 'execution') return;
    const cast = introCast();
    if (!cast.length) return;
    ui.introsSent = true;
    sendCue({ kind: 'intros', cast });
    armIntrosWatchdog();
  }

  function markIntrosDone() {
    if (ui.introsTimer) { clearTimeout(ui.introsTimer); ui.introsTimer = 0; }
    if (ui.introsDone) return;
    ui.introsDone = true;
    paint();
  }

  /**
   * Hidden-tab failsafe. `armSendCountdown` waits on introsDone; follow rAF never
   * flips it while the TV is backgrounded. Visible nights keep waiting.
   */
  function armIntrosWatchdog() {
    if (ui.introsTimer) { clearTimeout(ui.introsTimer); ui.introsTimer = 0; }
    if (ui.introsDone || !ui.introsSent) return;
    ui.introsTimer = setTimeout(() => {
      ui.introsTimer = 0;
      if (ui.introsDone) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
      markIntrosDone();
    }, INTROS_DONE_MS);
  }
  window.addEventListener('visibilitychange', () => {
    if (ui.introsSent && !ui.introsDone && document.visibilityState === 'hidden') {
      armIntrosWatchdog();
    }
  });

  function cueSitDown() {
    if (ui.sitCued) return;
    const cast = introCast();
    if (!cast.length) return;
    if (ui.cuedRunner) {
      sendCue({ kind: 'idle' });
      ui.cuedRunner = null;
    }
    ui.sitCued = sendCue({ kind: 'intros', cast, talk: true });
  }

  function cueNominees() {
    const show = ui.beat;
    const live = show === 'reckoning' || show === 'vote';
    const standing = live
      ? (client.noms || []).map((n) => ({ nominator: n.nominator, target: n.target }))
      : [];
    const key = `${show}|${standing.map((n) => n.target).join(',')}`;
    if (key === ui.nomsKey) return;
    if (sendCue({ kind: 'noms', standing })) ui.nomsKey = key;
  }

  function startClockTick() {
    if (ui.clockTimer) return;
    ui.clockTimer = setInterval(() => {
      const sendLeft = sendCountdownLeft();
      if (sendLeft != null) {
        if (sendLeft <= 0) { sendThemIn(); return; }
        const n = String(Math.max(1, Math.ceil(sendLeft / 1000)));
        for (const el of root.querySelectorAll('[data-send-count]')) el.textContent = n;
      }
      const left = remainingMs(ui.showUntil);
      const label = formatRemain(left);
      for (const el of root.querySelectorAll('[data-show-clock]')) el.textContent = label;
      const bar = root.querySelector('[data-rail-drain]');
      if (!bar) return;
      const hold = Number(bar.getAttribute('data-rail-hold'));
      if (left == null || !Number.isFinite(hold) || hold <= 0) return;
      bar.style.width = `${Math.max(0, Math.min(100, (left / hold) * 100))}%`;
    }, 250);
  }

  function startNight() {
    client.send({ t: 'start' });
    client.send({ t: 'casting' });
    ui.beat = 'casting';
    maybeIntros();
    paint();
  }

  function sendThemIn() {
    if (ui.locked) return;
    if (!(client.ballots || []).length) return;
    ui.sitCued = false;
    ui.locked = true;
    ui.sendArmed = false;
    ui.sendUntil = 0;
    client.send({ t: 'episode', opts: {} });
    // Optimistic — the server fans expedition to every socket including this TV.
    ui.beat = 'expedition';
    paint();
  }

  /**
   * Once ballots can lock a runner+guide pair, count 3·2·1 on the TV and send
   * `{ t: 'episode' }` — the same path as the old Send them in button. Intros
   * keep the picture until they finish; a live expedition / already-counting
   * TV must not double-fire.
   */
  function armSendCountdown(canLock, show) {
    if (ui.locked || show === 'expedition' || ui.beat === 'expedition') return;
    if (show !== 'casting') {
      ui.sendArmed = false;
      ui.sendUntil = 0;
      return;
    }
    if (ui.introsSent && !ui.introsDone) return;
    if (!ui.introsSent && ui.warm !== 'ready') return;
    if (!canLock) return;
    if (ui.sendArmed) return;
    ui.sendArmed = true;
    ui.sendUntil = Date.now() + SEND_COUNTDOWN_MS;
  }

  function sendCountdownLeft() {
    if (!ui.sendArmed || ui.locked) return null;
    if (ui.beat !== 'casting') return null;
    return Math.max(0, ui.sendUntil - Date.now());
  }

  /**
   * 📊 The warm bar, patched in place rather than repainted.
   *
   * `paint()` rebuilds `root.innerHTML`, and the bake reports five times over twenty-odd seconds
   * during which the lobby is also fanning a snapshot on every join. Repainting the whole screen
   * for a percentage would throw away the seat grid's in-place animation for no reason — this is
   * the same reasoning `patchLobby` exists for, one element over.
   */
  function paintWarm() {
    const bar = root.querySelector('[data-warm-fill]');
    const txt = root.querySelector('[data-warm-text]');
    if (!bar || !txt) { paint(); return; }
    bar.style.width = `${ui.warmPct}%`;
    txt.textContent = `${warmLabel(ui.warm)} · ${ui.warmPct}%`;
    root.querySelector('.warm')?.classList.toggle('ready', ui.warm === 'ready');
  }

  /** The indicator itself. Present from the first lobby paint, because the bake starts there. */
  function warmBar() {
    const pct = ui.warmPct;
    const label = ui.warm ? `${warmLabel(ui.warm)} · ${pct}%` : 'warming the mansion · 0%';
    return `<div class="warm${ui.warm === 'ready' ? ' ready' : ''}">
      <div class="warm-text" data-warm-text>${esc(label)}</div>
      <div class="warm-track"><div class="warm-fill" data-warm-fill style="width:${pct}%"></div></div>
    </div>`;
  }

  function seatedLivingIds() {
    const dead = new Set((client.frame?.players || []).filter((p) => p.alive === false).map((p) => p.id));
    return phones().map((s) => s.playerId).filter((id) => id && !dead.has(id));
  }

  function castTiebreaks(votes, episode) {
    return previewCastTiebreaks({
      ballots: votes,
      living: seatedLivingIds(),
      events: client.events,
      ep: episode,
      matchSeed: client.worldSeed,
    });
  }

  function paint() {
    const frame = client.frame;
    const phase = frame?.phase || client.lobby?.phase || 'LOBBY';
    /* airingEpisode = episode on the air; frame.episode is already bumped post-playEpisode. */
    const episode = frame?.airingEpisode ?? client.lobby?.airingEpisode ?? frame?.episode ?? client.lobby?.episode ?? 1;
    const recap = recapFromEvents(client.events);
    const names = players();
    const votes = client.ballots;
    const pair = frame?.pair || {};
    const show = ui.beat;

    const connected = client.connected && client.welcome && !client.full;
    const nLive = livePhones().length;
    const canStart = connected && nLive >= 2 && (phase === 'LOBBY' || show === 'lobby') && !ui.locked;
    const canLock = connected && (phase === 'CASTING' || show === 'casting')
      && (client.ballots || []).length >= 1
      && !pair.runner;
    const hasPair = !!pair.runner;
    armSendCountdown(canLock, show);
    const sendLeft = sendCountdownLeft();
    const onTalk = show === 'recap' || show === 'debrief' || show === 'reckoning'
      || show === 'vote' || show === 'execution';
    const onStage = isTalkBeat(show);
    const onRecap = show === 'recap';
    const onCastPicture = show === 'casting' && ui.introsSent;
    const onCircle = onStage || onRecap || onCastPicture;
    const onRun = show === 'expedition' || (hasPair && !onTalk && show !== 'casting');
    const clock = formatRemain(remainingMs(ui.showUntil));

    let body = '';
    if (ui.err) body += `<div class="err">${esc(ui.err)}</div>`;

    if (onRun) {
      body += runStage({
        names,
        lobby: client.lobby,
        runnerId: pair.runner || recap.runner,
        guideId: pair.guide || recap.guide,
        cameras: frame?.cameras,
        alarms: frame?.incident?.alarms,
        followLive: follow.live,
      });
      /*
       * 🗑️ **THE RECAP BUTTON IS GONE, AND IT IS THE AFFORDANCE RATHER THAN THE BEAT THAT WENT.**
       * John: *"Drop Recap for now (host and phones). It doesn't make sense before a round and
       * isn't useful yet."* It sat next to "Watch the run" all through the expedition, so the one
       * button on the TV that could cut the show short was a card of three facts about an episode
       * that had not finished. `show.js`'s clock still walks to `recap` on its own and
       * `recapBoard` still draws it, so nothing was deleted from the wire — but nobody can reach
       * it by hand, which is what John was asking for.
       *
       * Overnight post-#23: the mid-expedition "Watch the run" button is gone too. Mid-run it only
       * re-setBeat('expedition') — a no-op that still looked like the host should press it
       * (playcritique residual). Casting keeps the button when a pair is already locked so a
       * refreshed TV can jump back onto the run; recap keeps "Run" for the same recovery.
       */
    } else if (show === 'recap') {
      body += talkStage({
        recap, names, lobby: client.lobby, runEnd: ui.runEnd, clock,
        kicker: 'Phones down. Debrief is next.', beat: 'recap',
        who: joinedName(names, recap.runner, 'The circle'),
        whoSub: 'live · recap',
        whoId: recap.runner,
      });
      body += `<div class="actions recap-actions"><button class="btn ghost" id="to-run">Run</button></div>`;
    } else if (show === 'debrief') {
      body += talkStage({
        recap, names, lobby: client.lobby, runEnd: ui.runEnd, clock,
        kicker: 'Phones down — talk.', beat: 'debrief',
        who: joinedName(names, recap.runner, 'The circle'),
        whoSub: 'live · debrief',
        whoId: recap.runner,
      });
    } else if (show === 'reckoning') {
      body += talkStage({
        recap, names, lobby: client.lobby, runEnd: ui.runEnd, clock,
        kicker: 'Nominate. First tap stands.', beat: 'reckoning',
        who: standingLead(client.noms, names) || 'Reckoning',
        whoSub: client.noms?.length ? 'live · named' : 'live · waiting',
        whoId: client.noms?.[0]?.target,
        standing: client.noms,
      });
    } else if (show === 'vote') {
      body += talkStage({
        recap, names, lobby: client.lobby, runEnd: ui.runEnd, clock,
        kicker: 'One ballot. Living majority.', beat: 'vote',
        who: standingLead(client.noms, names) || 'The ballot',
        whoSub: 'live · vote',
        whoId: client.noms?.[0]?.target,
        standing: client.noms,
        tally: client.lynchResult ? { votes: client.lynchVotes, result: client.lynchResult } : null,
      });
    } else if (show === 'execution') {
      const executed = client.lynchResult?.executed;
      body += talkStage({
        recap, names, lobby: client.lobby, runEnd: ui.runEnd, clock,
        kicker: executionLine(client.lynchResult, names), beat: 'execution',
        who: executed ? joinedName(names, executed, 'A player') : 'Nobody',
        whoSub: executed ? 'nameplate down' : 'no eviction',
        whoId: executed,
        verdict: executionLine(client.lynchResult, names),
        executed: !!executed,
        tally: client.lynchResult ? { votes: client.lynchVotes, result: client.lynchResult } : null,
      });
    } else if (show === 'casting') {
      const showingIntros = ui.introsSent && !ui.introsDone;
      if (showingIntros) {
        body += `<div class="intro-frame" aria-label="Player intros"></div>
          <p class="intro-hint">the cast, walking in · phones are voting</p>`;
      } else if (ui.introsSent) {
        body += talkStage({
          recap, names, lobby: client.lobby, runEnd: ui.runEnd, clock,
          kicker: 'Ballots land here. A pair goes in after a short count.', beat: 'casting',
          who: joinedName(names, pair.runner || recap.runner, 'The circle'),
          whoSub: 'live · casting',
          whoId: pair.runner || recap.runner,
          aside: ballotBoard(votes, names, pair, recap, episode, castTiebreaks(votes, episode)),
        });
      } else {
        body += ballotBoard(votes, names, pair, recap, episode, castTiebreaks(votes, episode));
      }
      body += `<div class="actions">`;
      if (sendLeft != null) {
        const n = Math.max(1, Math.ceil(sendLeft / 1000));
        body += `<div class="send-go"><div class="send-go-k">they go in</div>
          <div class="send-count" data-send-count>${n}</div></div>`;
      }
      if (hasPair) body += `<button class="btn ghost" id="to-run">Watch the run</button>`;
      body += `</div>`;
      if (episode === 1 && !showingIntros && !ui.introsSent) {
        body += `<p class="hint spaced">Episode 1 airs every ballot. After the run the room nominates.</p>`;
      }
    } else {
      body += `
        <div class="lobby-show">
          ${titlePlateHtml()}
          <div class="night-row">
            ${codeBugHtml({ code: code.toUpperCase(), url: joinPath })}
            <div class="night-qr" aria-label="QR join">${qrSvg(joinPath, { dim: 200 })}</div>
          </div>
          ${seatGrid(client.lobby)}
          ${warmBar()}
          <div class="actions">
            <button class="btn" id="go" ${canStart ? '' : 'disabled'}>Start the night</button>
          </div>
          <p class="hint live-hint" data-live-hint>${nLive} phone${nLive === 1 ? '' : 's'} live · need 2 to start · empty chairs stay empty</p>
        </div>`;
    }

    // 📺 `on-run` is what lets the night skin give the picture 90% of the television — see
    // `TV_FRAME_PCT` and the `.night.on-run` block in `night-skin.js`.
    /*
     * ?? THE CHROME PRINTS THE SHOW BEAT, NOT THE PHASE MACHINE.
     *
     * `playEpisode` resolves a whole episode synchronously, so by the time the TV is on the live
     * expedition `state.phase` is already VERDICT. Printing both made the top-right read
     * "EXPEDITION · EPISODE 2 · VERDICT" while Ellie was still walking — playcritique F4, and a
     * watcher who glances at the corner thinks the night is over. The durable beat on the wire is
     * `show` (`ui.beat`); that is the only word this chrome may say.
     */
    const onIntro = show === 'casting' && ui.introsSent && !ui.introsDone;
    const onTalkFrame = onStage || onRecap || (show === 'casting' && ui.introsSent && ui.introsDone);
    const ribbon = onRun || rundownRibbon(show);
    const hold = holdMsFor(show, client.noms?.length ?? 0);
    root.className = `night${onRun ? ' on-run' : ''}${onIntro ? ' on-intro' : ''}${onTalkFrame ? ' on-talk' : ''}${onRecap ? ' on-recap' : ''}`;
    root.innerHTML = `
      <div class="night-top">
        <div class="night-brand-row">
          <div class="night-brand">${esc(SHOW_TITLE)}</div>
          ${recBugHtml({ cam: 'ON AIR' })}
        </div>
        <div class="night-phase">
          <span class="show-ep">episode ${esc(String(episode))} · ${esc(show)}</span>
          ${clock ? `<span class="show-mast-clock" data-show-clock>${esc(clock)}</span>` : ''}
        </div>
      </div>
      ${rundownRailHtml({ beat: show, until: ui.showUntil, holdMs: hold, ribbon })}
      ${onRun || onStage || onRecap || show === 'lobby' ? '' : `<div class="night-line">${esc(SHOW_LINE)}</div>`}
      <div class="night-main">${body}</div>`;

    /*
     * A read-only handle for `harness/party-follow-drive.mjs`, and DELIBERATELY A PROJECTION
     * RATHER THAN THE CLIENT. The follow iframe is same-origin, so anything hung on this window
     * is reachable from `parent` — exposing `client` would put the TV's whole message history
     * one property away from a renderer this slice's entire safety argument says has no socket.
     * These five fields are what is already painted on the screen.
     */
    window.__rrrHost = {
      beat: show, phase, episode,
      runner: pair.runner || recap.runner || null,
      runnerName: joinedName(names, pair.runner || recap.runner, null),
      followSrc: follow.src,
      followLive: follow.live,
      // The three the warm slice added, so `party-follow-drive` can assert the lobby really is
      // baking rather than the TV merely claiming to.
      warm: ui.warm,
      warmPct: ui.warmPct,
      followMode: follow.mode,
      cuedRunner: ui.cuedRunner,
      worldSent: ui.worldSent,
      showUntil: ui.showUntil,
      sitCued: ui.sitCued,
      sendArmed: ui.sendArmed,
      sendUntil: ui.sendUntil,
    };

    root.querySelector('#go')?.addEventListener('click', startNight);
    root.querySelector('#to-run')?.addEventListener('click', () => setBeat('expedition'));
    root.querySelector('#to-cast')?.addEventListener('click', () => setBeat('casting'));

    /*
     * 🔥 **LAST, AND UNCONDITIONAL. THE MANSION IS MOUNTED FROM THE FIRST PAINT.**
     *
     * This used to be gated on `onRun && runnerId`, and that gate WAS the bug John played: the
     * iframe came into existence at the instant the room finished nominating, and then spent
     * twenty-odd seconds loading in front of everybody. It is now mounted whenever the TV has a
     * room, which is immediately, and the same context lives all night.
     *
     * `placeFollow` reads `.run-frame` on every animation frame, so switching between the
     * behind-the-lobby placement and the over-the-show one is a class and a rect, not a remount.
     */
    const runnerId = pair.runner || recap.runner;
    follow.mode = onRun && runnerId ? 'run'
      : (onCircle ? 'intros' : 'warm');
    if (onCircle && ui.cuedRunner) {
      sendCue({ kind: 'idle' });
      ui.cuedRunner = null;
    }
    // Walk-in owns CASTING until it finishes; then Recap / Debrief / later Casting
    // keep the seated-circle talk director on the same chairs.
    if (onStage || onRecap || (show === 'casting' && ui.introsDone)) cueSitDown();
    if (show === 'expedition') ui.sitCued = false;
    cueNominees();
    mountFollow();
    placeFollow();
    startClockTick();

    /*
     * The run cue, sent once per runner. `cuedRunner` is what stops a lobby snapshot — which
     * arrives several times a second — from re-cueing the same person and resetting them to the
     * ballroom mid-corridor. Only set after a successful postMessage (see `cueRun`).
     */
    if (follow.mode === 'run' && runnerId) cueRun(runnerId, names);
  }

  paint();
}

/**
 * Joined lobby name on the TV. Stock `Robot N` is a name — do not paint it as
 * "The runner" / "The guide". Missing names, the em-dash sentinel, and a raw id
 * still fall back (D13: "— is running" on a pair that had not landed).
 */
function joinedName(names, id, fallback) {
  return publicName(playerName(names, id), id, fallback);
}

function seatLook(lobby, playerId) {
  const seat = (lobby?.seats || []).find((s) => s.playerId === playerId);
  return cleanLook(seat);
}

/**
 * 🎥 The run frame — a mount for the D13 follow camera, with the PR #5 still behind it as the
 * slate.
 *
 * The slate is not a fallback that nobody sees: the mansion takes seconds to bake, and until it
 * reports ready this IS the picture. It is the same face + name PR #5 shipped, so a TV that
 * cannot build WebGL at all degrades to exactly the screen it had before rather than to black.
 * `.run-frame.live` fades it out under the canvas.
 *
 * ⚠️ THE `<iframe>` IS NOT WRITTEN HERE, AND THERE IS NO MOUNT POINT FOR IT EITHER. `paint()`
 * rebuilds `root.innerHTML` on every websocket message, so an iframe in this string would be
 * destroyed and re-created — a fresh WebGL context and a fresh bake — several times a second.
 * The camera is a `position:fixed` layer on `<body>`, sized to this element's client rect; it
 * never enters this subtree at all. See `syncFollow()` and slice §5.1 for why an empty div here
 * to append into would not have worked.
 */
function runStage({ names, lobby, runnerId, guideId, cameras, alarms, followLive }) {
  const runner = joinedName(names, runnerId, 'The runner');
  const guide = joinedName(names, guideId, 'The guide');
  const look = seatLook(lobby, runnerId) || DEFAULT_LOOK;
  const face = robotFaceSvg(look.shell, look.accent, { size: 220 });
  const cams = cameras;
  return `
    <div class="run-stage">
      <div class="run-frame" aria-label="${esc(runner)} is running">
        <div class="run-slate">
          <div class="run-follow">
            <div class="run-face">${face}</div>
            <div class="run-tag">${esc(runner)} is running</div>
            <div class="run-slot">${followLive ? '' : 'camera warming'}</div>
          </div>
        </div>
      </div>
      <div class="pair-hero">${esc(runner)} walks. ${esc(guide)} talks.</div>
      <div class="run-facts">Cameras ${cams?.unlocked ?? '—'} / ${cams?.needed ?? '—'} · alarms ${alarms ?? 0}</div>
    </div>`;
}

function seatGrid(lobby) {
  const seats = (lobby?.seats || []).filter((s) => !s.isTV);
  if (!seats.length) {
    return `<p class="hint waiting">Waiting for the room…</p>`;
  }
  return `<div class="seats">${seats.map((s) => seatCard(s)).join('')}</div>`;
}

function seatCard(s) {
  const cls = s.connected ? 'seat on' : (s.joined ? 'seat away' : 'seat');
  const meta = s.connected ? 'live' : (s.joined ? 'reconnect' : 'empty');
  return `<div class="${cls}" data-seat-id="${esc(s.id)}">${seatFace(s)}<div class="who">${esc(s.name)}</div><div class="meta">${meta}</div></div>`;
}

function seatFace(s) {
  const look = cleanLook(s);
  if (!look) return `<div class="seat-face" hidden></div>`;
  return `<div class="seat-face">${robotFaceSvg(look.shell, look.accent, { size: 52 })}</div>`;
}

/** In-place lobby update so a locked colour animates instead of remounting the page. */
function patchLobby(root, client, ui, lobby) {
  if (!patchSeats(root, lobby)) return false;
  const nLive = (lobby.seats || []).filter((s) => !s.isTV && s.connected).length;
  const go = root.querySelector('#go');
  const connected = client.connected && client.welcome && !client.full;
  const phase = client.frame?.phase || lobby.phase || 'LOBBY';
  const canStart = connected && nLive >= 2 && (phase === 'LOBBY' || ui.beat === 'lobby') && !ui.locked;
  if (go) go.disabled = !canStart;
  const hint = root.querySelector('[data-live-hint]');
  if (hint) {
    hint.textContent = `${nLive} phone${nLive === 1 ? '' : 's'} live · need 2 to start · empty chairs stay empty`;
  }
  return true;
}

function patchSeats(root, lobby) {
  const grid = root.querySelector('.seats');
  if (!grid || !lobby?.seats) return false;
  const seats = lobby.seats.filter((s) => !s.isTV);
  const have = [...grid.querySelectorAll('[data-seat-id]')];
  if (have.length !== seats.length) return false;
  for (const s of seats) {
    const el = grid.querySelector(`[data-seat-id="${cssEscape(s.id)}"]`);
    if (!el) return false;
    el.className = s.connected ? 'seat on' : (s.joined ? 'seat away' : 'seat');
    const who = el.querySelector('.who');
    const meta = el.querySelector('.meta');
    if (who) who.textContent = s.name;
    if (meta) meta.textContent = s.connected ? 'live' : (s.joined ? 'reconnect' : 'empty');
    let faceWrap = el.querySelector('.seat-face');
    const look = cleanLook(s);
    if (!faceWrap) {
      el.insertAdjacentHTML('afterbegin', look ? seatFace(s) : `<div class="seat-face" hidden></div>`);
      continue;
    }
    const shell = faceWrap.querySelector('.bot-shell');
    const wedge = faceWrap.querySelector('.bot-wedge');
    if (look && shell && wedge) {
      faceWrap.hidden = false;
      shell.setAttribute('fill', look.shell);
      wedge.setAttribute('fill', look.accent);
    } else if (look) {
      faceWrap.hidden = false;
      faceWrap.innerHTML = robotFaceSvg(look.shell, look.accent, { size: 52 });
    } else {
      faceWrap.hidden = true;
      faceWrap.innerHTML = '';
    }
  }
  return true;
}

function cssEscape(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function ballotBoard(votes, names, pair, recap, episode, tiebreaks) {
  const rows = (votes || []).map((v) => `
    <div class="row">
      <div class="who">${esc(joinedName(names, v.voter, 'Someone'))}</div>
      <div class="arrow">sent</div>
      <div class="pick">RUNNER ${esc(joinedName(names, v.runner, 'The runner'))}<br>GUIDE ${esc(joinedName(names, v.guide, 'The guide'))}</div>
    </div>`).join('');
  const runner = pair.runner || recap.runner;
  const guide = pair.guide || recap.guide;
  const hero = runner
    ? `<div class="pair-hero">${esc(joinedName(names, runner, 'The runner'))} walks · ${esc(joinedName(names, guide, 'The guide'))} talks</div>`
    : `<p class="hint">Ballots land here, huge. A pair goes in on its own.</p>`;
  const why = describeCastTiebreaks(tiebreaks).join(' · ');
  const whyLine = why ? `<p class="ballot-why">${esc(why)}</p>` : '';
  // playEpisode increments episode after the premiere; recap.episode stays 1.
  const huge = Number(episode) === 1 || recap.episode === 1;
  return `${hero}${whyLine}<div class="ballot${huge ? ' huge' : ''}">${rows || '<p class="hint">No ballots yet — phones pick a runner and a guide.</p>'}</div>`;
}

function standingLead(standing, names) {
  const first = (standing || [])[0];
  return first ? joinedName(names, first.target, 'Someone') : '';
}

function talkStage({
  recap, names, lobby, runEnd, clock, kicker, beat,
  who, whoSub, whoId, standing, tally, verdict, executed, aside,
}) {
  const look = whoId ? seatLook(lobby, whoId) : null;
  const face = look ? robotFaceSvg(look.shell, look.accent, { size: 64 }) : '';
  const plate = who
    ? nameplateHtml({ name: who, sub: whoSub || `live · ${beat || 'debrief'}`, face })
    : '';
  const spectacle = verdict
    ? verdictPlateHtml({
      kicker: executed ? 'VERDICT READY' : 'NO EVICTION',
      line: verdict,
      sub: tally?.result
        ? `threshold ${tally.result.threshold ?? '—'} · abstained ${tally.result.abstained ?? 0}`
        : '',
    })
    : '';
  const side = `${aside || ''}${nomBoard(standing, names, lobby)}${tally ? lynchBoard(tally.votes, tally.result, names) : ''}`;
  return `
    <div class="talk-stage${side ? ' has-side' : ''}">
      <div class="talk-chrome-top">
        ${recapMini(recap, names, runEnd)}
        ${countdownHtml({ clock, label: (beat || 'debrief').toUpperCase() })}
      </div>
      <div class="talk-well">
        <div class="talk-picture">
          <div class="intro-frame talk-frame" aria-label="Ballroom circle"></div>
        </div>
        ${side ? `<aside class="talk-side">${side}</aside>` : ''}
      </div>
      <div class="talk-chrome-bot">
        ${spectacle}
        ${plate}
        <p class="talk-kicker">${esc(kicker || 'Phones down — talk.')}</p>
      </div>
    </div>`;
}

function recapMini(recap, names, runEnd) {
  const taken = recap.taken?.length
    ? recap.taken.map((t) => joinedName(names, t.id, 'The runner')).join(', ')
    : 'CAME BACK';
  const outcome = runEnd ? `<span class="mini-v ${runEnd === 'SMASHED' ? 'ok' : 'bad'}">${esc(runEnd)}</span>` : '';
  const cam = recap.cameraLit ? 'CAM LIT' : 'CAM DARK';
  return `<div class="recap-mini">${outcome}
    <span class="mini-v ${recap.cameraLit ? 'ok' : 'bad'}">${esc(cam)}</span>
    <span class="mini-v">${esc(taken)}</span>
  </div>`;
}

function nomBoard(standing, names, lobby) {
  if (!standing) return '';
  const rows = standing.map((n, i) => {
    const look = seatLook(lobby, n.target) || DEFAULT_LOOK;
    const face = robotFaceSvg(look.shell, look.accent, { size: 48 });
    return `
    <div class="nom-row show-nom">
      <div class="nom-n">${i + 1}</div>
      ${nameplateHtml({
        name: joinedName(names, n.target, 'Someone'),
        sub: `named by ${joinedName(names, n.nominator, 'a player')}`,
        face,
      })}
    </div>`;
  }).join('');
  return `<div class="nom-board">${rows || '<p class="hint">Waiting on phones — nominate.</p>'}</div>`;
}

function lynchBoard(votes, result, names) {
  const counts = result?.counts || {};
  const tally = Object.entries(counts).map(([id, n]) => `
    <div class="show-tally-row">
      <div class="who">${esc(joinedName(names, id, 'Someone'))}</div>
      <div class="n">${esc(String(n))}</div>
    </div>`).join('');
  const aired = (votes || []).map((v) => `
    <div class="nom-row">
      <div class="nom-who">${esc(joinedName(names, v.voter, 'Someone'))}</div>
      <div class="nom-by">${v.choice === NO_ONE ? 'NO ONE' : esc(joinedName(names, v.choice, 'Someone'))}</div>
    </div>`).join('');
  return `<div class="nom-board lynch-board">
    ${tally ? `<div class="show-tally">${tally}</div>` : ''}
    ${aired}
  </div>`;
}

function executionLine(result, names) {
  if (!result) return 'The vote is in.';
  if (!result.executed) return 'Nobody cleared. No eviction.';
  const who = joinedName(names, result.executed, 'A player');
  const swing = result.executioner === SHOWRUNNER
    ? 'the Showrunner'
    : joinedName(names, result.executioner, 'the nominator');
  return `${who} is out. ${swing} swings.`;
}

function recapBoard(recap, names, runEnd, clock) {
  const taken = recap.taken?.length
    ? recap.taken.map((t) => joinedName(names, t.id, 'The runner')).join(', ')
    : 'CAME BACK';
  // SMASHED/TIME straight off the server (`RUN_END` in `src/party/show.js`). `runEnd` is null
  // until the room says otherwise, so a stale or missing message just omits the fact rather than
  // guessing — CAUGHT is not wired yet and must never appear here on its own.
  const outcome = runEnd
    ? `<div class="fact"><div class="k">Outcome</div><div class="v ${runEnd === 'SMASHED' ? 'ok' : 'bad'}">${esc(runEnd)}</div></div>`
    : '';
  return `<div class="recap-stage">
    <div class="recap-head">${countdownHtml({ clock, label: 'RECAP' })}</div>
    <div class="recap">
      ${outcome}
      <div class="fact"><div class="k">Camera</div><div class="v ${recap.cameraLit ? 'ok' : 'bad'}">${recap.cameraLit ? 'LIT' : 'STAYED DARK'}</div></div>
      <div class="fact"><div class="k">Runner</div><div class="v ${recap.taken?.length ? 'bad' : 'ok'}">${esc(taken)}</div></div>
      <div class="fact"><div class="k">Alarms</div><div class="v">${esc(String(recap.alarmCount ?? 0))}</div></div>
    </div>
  </div>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
