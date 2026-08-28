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
  paintLook, recBugHtml, robotFaceSvg, rundownRailHtml, titlePlateHtml, verdictPlateHtml,
} from '../party/look.js';
import { REACT_MOOD, onAir } from '../party/react.js';
import { mergePublicNames, publicName } from '../party/cast-ui.js';
import { cueViolations, nextPerspective, warmLabel, warmPct, warmUrl } from '../party/follow.js';
import { formatRemain, holdMsFor, isTalkBeat, nextShowBeat, remainingMs, rundownRibbon } from '../party/show.js';
import { NO_ONE, SHOWRUNNER } from '../party/vote.js';
import { describeCastTiebreaks, previewCastTiebreaks, shouldArmCastSend } from '../party/ballot.js';
import { MAX_PAIRS } from '../party/link.js';

/** TV chrome 3·2·1 after every living ballot (or the 20s backstop), then `{ t: 'episode' }`. */
const SEND_COUNTDOWN_MS = 3000;
/**
 * Follow introsDone arrives from the iframe's rAF loop, which stops when the TV
 * tab is hidden. Overnight grind then never arms the 3·2·1. ~12s after send
 * (or after the tab is backgrounded) we force the beat so a pair can still go in.
 * Visible nights wait for the real walk-in — 8-player intros are longer than 12s.
 */
const INTROS_DONE_MS = 12000;
/**
 * How long 'BEX TURNED MARA DOWN' stays on the television. Long enough that a room looking at
 * each other rather than the screen still catches it; short enough that it does not stack up
 * over a five-minute Debrief and bury the live requests underneath it.
 */
const REFUSAL_HOLD_MS = 6000;

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
    /** 3 s auto-send after every living phone has voted, or the 20s backstop. */
    sendArmed: false,
    sendUntil: 0,
    /** Epoch ms of the first ballot this casting window. Backstop is 20s from here. */
    firstBallotAt: 0,
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
    /** Refusals still on air. Transient — an event, not a fact. See REFUSAL_HOLD_MS. */
    refusals: [],
    /** Last pair set pushed into the mansion, so a links fanout on every tap does not churn it. */
    pairKey: '',
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
      /*
       * A refusal is an EVENT, so the TV holds it itself rather than the server storing it —
       * there is nothing here for a reconnecting screen to catch up on, and a refusal that
       * persisted in state would still be on air two minutes later.
       */
      if (m.t === 'links' && m.refused) {
        ui.refusals.push({ ...m.refused, until: Date.now() + REFUSAL_HOLD_MS });
        setTimeout(() => {
          ui.refusals = ui.refusals.filter((r) => r.until > Date.now());
          paint();
        }, REFUSAL_HOLD_MS + 50);
      }
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

  /**
   * ✋ "4 of 5 ready" under a talk beat. The COUNT, never the names — `FANOUT_KEYS.ready` carries
   * no list and the TV must not invent one. Who wants the conversation over is a read on the
   * room, and putting it on the shared screen would turn it into a public loyalty test in the one
   * beat where reading the room is the whole game.
   */
  /**
   * 🍮 THE PUBLIC HALF OF THE PAIR, ON THE SHARED SCREEN.
   *
   * *"JOHN reaches out to ELLIE"* while it is pending, then the merged name once they connect.
   * This line is the entire notification system for the mechanic and it is deliberately the
   * television rather than a buzz: `navigator.vibrate` does not exist on iOS Safari at all, so a
   * phone nudge would reach roughly half a room and silently miss the rest. The TV reaches every
   * guest on every handset, and a request everyone can see is better design than a private one —
   * crossing the room to whisper is a move the room is supposed to watch you make.
   *
   * ⚠️ **NEVER THE WORDS.** `FANOUT_KEYS.links` carries `from`/`to`/`name` and no text, and the
   * TV socket is not in any pair's audience, so there is nothing here to leak even by mistake.
   */
  /*
   * ⚠️ **THREE BUGS LIVED IN THE FIRST VERSION OF THIS FUNCTION, AND THEY ALL DELETED THE
   * MECHANIC'S PUBLIC HALF** — the half the whole design rests on. A play critic caught them by
   * running eight real phones:
   *
   *   1. It rendered `pend[0]` ONLY. With four requests standing at once the television showed
   *      one of them. The other three reaches happened in silence.
   *   2. `if (pairs.length)` returned early, so the instant ANY pair formed, every pending
   *      request vanished from the screen. A live request to a third player simply disappeared.
   *   3. A REFUSAL left no trace anywhere — the row was filtered out of `pending` and that was
   *      that. Being turned down in front of the room is the juiciest event this mechanic can
   *      produce, and the show did not air it.
   *
   * Pending and paired are DIFFERENT FACTS and the room wants both. `link.js`' header claims
   * reaching out is "a move everybody gets to see you make"; that claim was false on screen.
   */
  function linkNames(names, id, fallback) {
    return publicName(playerName(names, id), id, fallback);
  }

  function linkKicker(names, fallback) {
    const L = client.links || { pending: [], pairs: [] };
    const pairs = L.pairs || [];
    const pend = L.pending || [];
    const parts = [];

    // A refusal is loud and brief. Newest first, and it outranks everything else on the line.
    for (const r of ui.refusals) {
      parts.push(`${linkNames(names, r.to, 'Someone')} TURNED ${linkNames(names, r.from, 'someone')} DOWN`);
    }
    for (const r of pend) {
      parts.push(`${linkNames(names, r.from, 'Someone')} reaches out to ${linkNames(names, r.to, 'someone')}…`);
    }
    for (const p of pairs) {
      parts.push(`${p.name} — ${linkNames(names, p.a, 'someone')} + ${linkNames(names, p.b, 'someone')}`);
    }
    /*
     * The room is only allowed two private conversations at once (`MAX_PAIRS`), so say when it
     * is full. Scarcity is the thing that makes pairing conspicuous rather than camouflaged, and
     * scarcity nobody can see is just a refusal that looks like a bug.
     */
    if (pairs.length >= MAX_PAIRS) parts.push('the room is full');
    if (!parts.length) return fallback;
    // The pair line earns its explanation; a list of four does not have room for it.
    if (parts.length === 1 && pairs.length === 1) return `${parts[0]} · connected. You can see it. You cannot read it.`;
    return parts.join('  ·  ');
  }

  /**
   * 📊 **THE READY COUNT, AT THE SIZE A SOFA CAN READ IT.**
   *
   * This replaces `readyKicker`, which folded the count into a sentence that `talkStage` then
   * printed in the 12px uppercase kicker — so the number saying how close the room is to ending
   * the beat was the smallest ink on a 1080p television, three metres from anybody. Photographed
   * at `progress/r5/04-tv-debrief.png`: `0 OF 5 READY · TALK. A MAJORITY TAPS READY TO MOVE ON.`
   * flush against the bottom edge, under a 36px nameplate reading "The circle".
   *
   * Returning the count as DATA lets the band set it like the Vote's `tallyBoard` already does,
   * which is the one place in the loop that got this right. It also makes L74's rule structural
   * rather than incidental: the count was a kicker ARGUMENT that link activity could replace,
   * and it is now its own element that nothing else competes for.
   *
   * ⚠️ **AND IT IS STILL A COUNT.** `FANOUT_KEYS.ready` carries `count` and `need` and no
   * identities; nothing here adds any. `party-warm` W37a control.
   */
  function readyState() {
    const r = client.ready;
    if (!r?.need) return null;
    const count = Math.min(r.count, r.need);
    return { n: count, of: `of ${r.need} ready`, done: count >= r.need };
  }

  function setBeat(beat) {
    ui.beat = beat;
    client.send({ t: 'show', beat });
    paint();
  }

  /**
   * ⏭️ THE SKIP KEY — `?dev=1` only.
   *
   * John, on wanting a five-minute Debrief: *"I didn't want to wait 5mins each time I have to
   * test it."* A designer who has to sit through a beat to reach the one after it stops testing
   * the one after it. `{t:'show', beat}` is already accepted from any socket — it is how the TV's
   * own "Watch the run" workaround moves the night — so this is a key on top of an existing door,
   * not a new one.
   *
   * ⚠️ IT IS NOT THE PRODUCT CLOCK AND MUST NEVER BE MISTAKEN FOR IT. Two guards:
   *   1. Opt-in on the URL. A guest's TV never has `?dev=1`.
   *   2. It SAYS SO ON SCREEN, permanently, whenever it is armed. A dev build that looks exactly
   *      like a real one is how a timing bug gets explained away as "that's just dev mode" — or
   *      worse, how a real playtest gets run on skipped beats and believed.
   *
   * The badge is mounted OUTSIDE `root` for the same reason the role card is: `paint()` rewrites
   * `root.innerHTML` on every socket message and would delete it several times a second.
   */
  if (params.get('dev') === '1') {
    const badge = document.createElement('div');
    badge.className = 'dev-badge';
    badge.textContent = 'DEV · ] BEAT · P CAMERA';
    document.body.appendChild(badge);
    /* The badge is the toast. It is mounted outside `.night`, so paint() cannot delete it. */
    let toastTimer = 0;
    const showDevToast = (msg) => {
      badge.textContent = msg.toUpperCase();
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { badge.textContent = 'DEV · ] BEAT · P CAMERA'; }, 2200);
    };
    /*
     * ⚠️ `nextShowBeat` DOES NOT COVER THE WHOLE NIGHT, and the first version of this key was
     * useless because of it. `AFTER_RUN_NEXT` is the post-run chain — it has no entry for lobby,
     * casting or expedition, because those beats are ended by a thing happening (a ballot pair
     * locking, the runner reaching the ballroom) rather than by a clock. So `]` did nothing at
     * casting, which is exactly where a designer heading for the Debrief gets stuck: the only way
     * past was to cast a real pair and sit through a real expedition.
     *
     * These three entries are DEV-ONLY and deliberately jump OVER the expedition. They are not a
     * second running order — `AFTER_RUN_NEXT` is still the product's chain and this table cannot
     * be reached without `?dev=1`.
     */
    const DEV_SKIP = { lobby: 'casting', casting: 'recap', expedition: 'recap' };
    window.addEventListener('keydown', (e) => {
      if (e.key !== ']' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      const next = nextShowBeat(ui.beat) || DEV_SKIP[ui.beat];
      if (!next) return;
      e.preventDefault();
      setBeat(next);
    });

    /* =========================================================================================
     * 🎥 **`P` CYCLES THE PERSPECTIVE — chase → wide → iso → top.**
     *
     * John cannot judge a camera from a description: *"3rd person but further back or top down or
     * isometric… I'm not sure where it will go yet."* So all four ship live on one key and he
     * picks by feel, which is the only way this project has ever settled a taste call.
     *
     * It rides the `shot` cue, which already exists, is already in `CUE_KINDS`, and is already
     * validated at the iframe's door by `cueViolations` — no new channel and no new hole. The
     * held perspective survives the cue being re-sent, so a repeat is a no-op rather than a
     * flicker.
     * ========================================================================================= */
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'p' && e.key !== 'P') return;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      e.preventDefault();
      ui.perspective = nextPerspective(ui.perspective || 'chase');
      sendCue({ kind: 'shot', shot: ui.perspective });
      showDevToast(`camera · ${ui.perspective}`);
    });
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

  /**
   * 🍮 Push the merged names into the mansion so the plates over the two robots change.
   *
   * ⚠️ **KEYED, LIKE `cueNominees`.** The links fanout arrives on EVERY tap by anybody — a
   * request, a decline, a disconnect — and `postMessage` into the iframe on each of those, for a
   * value the bed reads once per frame, is the churn `queueMove`'s header warns about one layer
   * up. The key is the thing the mansion can actually see: who is paired and what they are
   * called. Requests are deliberately absent from it — a pending request changes the TV's
   * caption, not anybody's plate.
   */
  function cuePairs() {
    const live = isTalkBeat(ui.beat);
    const pairs = live
      ? (client.links?.pairs || []).map((p) => ({ a: p.a, b: p.b, name: p.name }))
      : [];
    const key = `${ui.beat}|${pairs.map((p) => `${p.a}>${p.b}=${p.name}`).join(',')}`;
    if (key === ui.pairKey) return;
    if (sendCue({ kind: 'pair', pairs })) ui.pairKey = key;
  }

  /**
   * 👏 THE REACTION STRIP, patched in place along the bottom of the run.
   *
   * `onAir()` decides what is still up — newest first, one row per player, capped at six. The
   * rebuild is keyed so an unchanged strip is not re-written four times a second: an `innerHTML`
   * assignment on every tick would restart the entrance animation on every face and make a quiet
   * strip flicker for the whole run.
   */
  function paintReactStrip() {
    const mount = root.querySelector('[data-react-strip]');
    if (!mount) return;
    const live = onAir(client.reacts || [], Date.now());
    const key = live.map((e) => `${e.from}:${e.r}`).join(',');
    if (key === ui.reactKey) return;
    ui.reactKey = key;
    const names = mergePublicNames(client.lobby, client.links?.pairs);
    const seatOf = (id) => (client.lobby?.seats || []).find((s) => s.playerId === id)?.seat ?? 99;
    /*
     * 🪑 **SORTED BY SEAT, NOT BY WHO REACTED LAST.** `onAir` picks the six by recency, but
     * DISPLAYING them by recency means every arrival shoves everyone along one place — which
     * both restarts their animation and makes a player's reaction appear somewhere new each
     * time. Seat order is stable, so a face stays where the room learned to look for it.
     */
    const rows = [...live].sort((a, b) => seatOf(a.from) - seatOf(b.from));
    const want = new Map(rows.map((e) => [e.from, e]));

    /*
     * 👉 **ADD AND REMOVE ONE CHIP — NEVER REBUILD THE ROW.** This used to assign `innerHTML`,
     * which destroys and recreates all six chips every time ANY of them changes. During a busy
     * run that fires several times a second, and each rebuild restarted the `night-rise`
     * entrance on every face — so the strip juddered continuously, directly under the one thing
     * the room is watching. It was doing that before a single symbol was added.
     *
     * Keyed on the PLAYER, not on the timestamp: a player who reacts again keeps their node and
     * only their face is swapped, so the badge's loop carries on instead of snapping back to the
     * start of its entrance. Gate: `party-warm` W42.
     */
    for (const el of [...mount.children]) {
      if (!want.has(el.dataset.rk)) el.remove();
    }
    let prev = null;
    for (const e of rows) {
      const look = seatLook(client.lobby, e.from) || DEFAULT_LOOK;
      const mood = REACT_MOOD[e.r] || 'idle';
      let el = [...mount.children].find((c) => c.dataset.rk === e.from);
      if (!el) {
        el = document.createElement('div');
        el.className = 'react-chip';
        el.dataset.rk = e.from;
        el.innerHTML = `${robotFaceSvg(look.shell, look.accent, { size: 56, mood })}
          <span class="react-who">${esc(joinedName(names, e.from, 'Someone'))}</span>`;
        // Insert in seat order without touching the siblings already on air.
        if (prev) prev.after(el); else mount.prepend(el);
      } else if (el.dataset.rr !== e.r) {
        // Same player, new reaction — swap the face only, leave the node and its name alone.
        const face = el.querySelector('.bot-face');
        if (face) face.outerHTML = robotFaceSvg(look.shell, look.accent, { size: 56, mood });
      }
      el.dataset.rr = e.r;
      prev = el;
    }
  }

  function startClockTick() {
    if (ui.clockTimer) return;
    ui.clockTimer = setInterval(() => {
      maybeArmFromBackstop();
      paintReactStrip();
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
    ui.firstBallotAt = 0;
    client.send({ t: 'episode', opts: {} });
    // Optimistic — the server fans expedition to every socket including this TV.
    ui.beat = 'expedition';
    paint();
  }

  /**
   * 3·2·1 after every living phone has balloted, or ~20s after the first ballot.
   * Not after the first ballot alone — copy-last/herding stays on the board
   * while late phones still pick. Empty never arms (empty-never-invent).
   */
  function armSendCountdown(canLock, show) {
    if (ui.locked || show === 'expedition' || ui.beat === 'expedition') return;
    if (show !== 'casting') {
      ui.sendArmed = false;
      ui.sendUntil = 0;
      ui.firstBallotAt = 0;
      return;
    }
    if (ui.introsSent && !ui.introsDone) return;
    if (!ui.introsSent && ui.warm !== 'ready') return;
    if (!canLock) return;
    if (ui.sendArmed) return;
    ui.sendArmed = true;
    ui.sendUntil = Date.now() + SEND_COUNTDOWN_MS;
  }

  function noteFirstBallot(votes, show) {
    if (show !== 'casting' || !(votes || []).length) {
      ui.firstBallotAt = 0;
      return;
    }
    if (!ui.firstBallotAt) ui.firstBallotAt = Date.now();
  }

  /** Clock tick — the 20s backstop must fire without a new socket message. */
  function maybeArmFromBackstop() {
    if (ui.locked || ui.sendArmed) return;
    if (ui.beat !== 'casting') return;
    const phase = client.frame?.phase || client.lobby?.phase || '';
    const votes = client.ballots || [];
    noteFirstBallot(votes, 'casting');
    const canLock = (phase === 'CASTING' || ui.beat === 'casting')
      && shouldArmCastSend({
        livingIds: seatedLivingIds(),
        votes,
        firstBallotAt: ui.firstBallotAt,
        now: Date.now(),
      })
      && !client.frame?.pair?.runner;
    if (!canLock) return;
    armSendCountdown(true, 'casting');
    if (ui.sendArmed) paint();
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

  /*
   * The bake, for the casting board. `paintWarm` already patches `[data-warm-fill]` in place on
   * every warm message, so the bar animates on the casting screen exactly as it does in the
   * lobby without a repaint — same element, same hooks, one instance on screen at a time.
   */
  function castWarm() {
    return { stage: ui.warm, pct: ui.warmPct, bar: warmBar() };
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
    noteFirstBallot(votes, show);
    const canLock = connected && (phase === 'CASTING' || show === 'casting')
      && shouldArmCastSend({
        livingIds: seatedLivingIds(),
        votes,
        firstBallotAt: ui.firstBallotAt,
        now: Date.now(),
      })
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
      /*
       * 🗞️ **THE FACTS ARE THE RECAP.** This beat used to carry the same lower-third nameplate as
       * every other talk beat and nothing else, so ten seconds of the show consisted of the
       * runner's name — a name the room had just watched for a whole expedition — while the
       * outcome it is supposed to establish sat in two 13px chips at the top of the screen.
       * `recapFacts` is the board that has been written and uncalled in this file all along.
       */
      body += talkStage({
        recap, names, lobby: client.lobby, runEnd: ui.runEnd, clock,
        kicker: 'Phones down. Debrief is next.', beat: 'recap',
        who: joinedName(names, recap.runner, 'The circle'),
        whoSub: 'live · recap',
        whoId: recap.runner,
        facts: recapFacts(recap, names, ui.runEnd),
      });
      body += `<div class="actions recap-actions"><button class="btn ghost" id="to-run">Run</button></div>`;
    } else if (show === 'debrief') {
      /*
       * ⚠️ **THE READY COUNT IS NO LONGER A FALLBACK.** `linkKicker(names, readyKicker(...))`
       * passed the ready line as the thing to show WHEN THERE WAS NO LINK ACTIVITY — so the
       * instant anybody reached out, the beat's own end condition vanished from the television.
       * A play critic caught it: the count disappears exactly when the room is most engaged.
       * The pairs moved to the side board, so the count stays put.
       *
       * ⚠️ **AND IT IS NO LONGER IN THE KICKER AT ALL** — see `readyState`. Printing it in both
       * would have been the Execution's own defect in a second costume: one fact, twice, in two
       * sizes. The band carries the number; the kicker carries the rule the number obeys.
       *
       * ⚠️ **AND THE LOWER THIRD NO LONGER NAMES THE RUNNER.** During Debrief it named whoever
       * went on the expedition — the biggest thing in the band, about the wrong beat, drowning
       * the pair feed underneath it.
       */
      body += talkStage({
        recap, names, lobby: client.lobby, runEnd: ui.runEnd, clock,
        kicker: 'Talk. A majority taps READY to move on.', beat: 'debrief',
        state: readyState(),
        who: 'The circle',
        whoSub: 'live · debrief',
        aside: pairBoard(client.links, names, client.lobby, ui.refusals),
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
        // The ballot box filling up, above the nominees. Count and threshold only — see
        // `tallyBoard`. It disappears the moment the result is aired, because the result is
        // then the loudest true thing on the screen.
        aside: client.lynchResult ? '' : tallyBoard(client.tally),
      });
    } else if (show === 'execution') {
      const executed = client.lynchResult?.executed;
      body += talkStage({
        recap, names, lobby: client.lobby, runEnd: ui.runEnd, clock,
        /*
         * 🚫 **ONE FACT, ONCE.** `kicker` and `verdict` were the SAME `executionLine` string,
         * and the nameplate under them said the name a third time. Now: the plate names the
         * hand, the nameplate names who is out, and the kicker says what happens next — three
         * elements, three different facts. `party-warm` W37c is the lock.
         */
        kicker: 'Casting is next.', beat: 'execution',
        who: executed ? joinedName(names, executed, 'A player') : 'Nobody',
        whoSub: executed ? 'out' : 'no eviction',
        whoId: executed,
        verdict: executionSwing(client.lynchResult, names),
        executed: !!executed,
        tally: client.lynchResult ? { votes: client.lynchVotes, result: client.lynchResult } : null,
      });
    } else if (show === 'casting') {
      const showingIntros = ui.introsSent && !ui.introsDone;
      if (showingIntros) {
        body += `<div class="intro-frame" aria-label="Player intros"></div>
          <p class="intro-hint">the cast, walking in · phones are voting</p>`;
      } else if (ui.introsSent) {
        /*
         * 🎬 **THE BOARD HAS TO OUTLIVE THE ROLE-CARD WINDOW OR ITS COUNTER IS A LIE.**
         *
         * First cut drew `castBoard` only on the pre-intros screen — which is the blank window
         * the critic complained about, so that looked right. It is not: intros only fire once the
         * mansion has finished baking, and the first ballot cannot land until after that. The
         * board therefore vanished a beat BEFORE the lamps it prints could ever light, and a
         * probe driving eight real phones caught it — the lamps never lit, in either window. So
         * it still rides through this window; it is now a strip over the picture rather than a
         * band under it.
         *
         * It stands down for the 3·2·1: at that point every lamp is lit by definition, so the
         * strip is saying what the countdown is already shouting, and the count needs the corner.
         */
        const counting = sendLeft != null || hasPair;
        body += castStage({
          votes, names,
          tiebreaks: castTiebreaks(votes, episode),
          board: counting ? '' : castBoard(client.lobby, votes, castWarm()),
        });
      } else {
        // The role-card window: the room's own shape, instead of an empty ballroom.
        body += castBoard(client.lobby, votes, castWarm());
        body += ballotBoard(votes, names, recap, episode, castTiebreaks(votes, episode));
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
    /*
     * 🎬 **CASTING IS THE PICTURE.** John: *"make the live feed bigger to utilise that space,
     * also extend the live feed to fill the right side ... run the ballots as an overlay on the
     * live feed."* Post-walk casting is no longer a talk beat with a reserved side column and a
     * lower band — it is a full-bleed camera with the ballots and the lamp strip floating on it.
     * It still takes `on-talk` (the frame sizing and the padding are the same rules); `on-cast`
     * is what lifts the night above the camera plate and takes the chrome bands away. See the
     * `.night.on-cast` block in `night-skin.js` for why the stacking has to move with it.
     */
    const onCast = show === 'casting' && ui.introsSent && ui.introsDone;
    const onTalkFrame = onStage || onRecap || onCast;
    /* =========================================================================================
     * ⏱️ ONE CLOCK. NOT TWO.
     *
     * The mast printed `EPISODE 1 · RECAP 12S` at 36px, and four inches below it the stage's own
     * `countdownHtml` printed `RECAP / 12s` at 64px — the same number, from the same tick loop,
     * twice on one screen, occasionally a frame out of step with itself. A play critic
     * photographed it on every talk beat and read the pair as a bug before reading it as a clock.
     *
     * The rule is measured, not guessed at: the mast prints the number ONLY when the body did
     * not. Asking the built HTML means the two can never drift apart the way a hand-maintained
     * list of "beats that have a stage clock" would the first time a beat is added.
     * ========================================================================================= */
    const stageHasClock = body.includes('data-show-clock');
    const ribbon = onRun || rundownRibbon(show);
    const hold = holdMsFor(show, client.noms?.length ?? 0);
    root.className = `night${onRun ? ' on-run' : ''}${onIntro ? ' on-intro' : ''}${onTalkFrame ? ' on-talk' : ''}${onCast ? ' on-cast' : ''}${onRecap ? ' on-recap' : ''}`;
    // The camera plate is a body child, so squaring it off for the full-bleed cast frame has to
    // be said on <body> rather than inside `root` — same shape as `rrr-warming` in `placeFollow`.
    document.body.classList.toggle('rrr-cast', onCast);
    root.innerHTML = `
      <div class="night-top">
        <div class="night-brand-row">
          <div class="night-brand">${esc(SHOW_TITLE)}</div>
          ${recBugHtml({ cam: 'ON AIR' })}
        </div>
        <div class="night-phase">
          <span class="show-ep">episode ${esc(String(episode))} · ${esc(show)}</span>
          ${clock && !stageHasClock ? `<span class="show-mast-clock" data-show-clock>${esc(clock)}</span>` : ''}
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
    cuePairs();
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

/* =============================================================================================
 * 🔢 THE SEAT CHIP — which SAM is this one.
 *
 * Duplicate names are legal and stay legal; John was clear that the room sorting out two Sams is
 * part of the fun. But the rule ALLOWS duplicates, it does not require them to be
 * indistinguishable — and `room.js` calls the aired ballot "the cheapest deduction fuel in the
 * game", which two identical rows switch off entirely. A play critic ran a night with two players
 * called Sam and could not tell, on any list or on the aired ballot, which one had been named or
 * which one had been executed.
 *
 * The seat index and the player's own accent are already on the lobby snapshot and already on the
 * robot in the ballroom, so this leaks nothing and invents nothing — it puts the identity the
 * room can SEE next to the name it cannot.
 * ============================================================================================= */
function seatChip(lobby, playerId) {
  const seat = (lobby?.seats || []).find((s) => s.playerId === playerId);
  if (!seat || seat.seat == null) return '';
  const accent = cleanLook(seat)?.accent || DEFAULT_LOOK.accent;
  return `<span class="seat-chip" style="background:${esc(accent)}">${esc(String(seat.seat + 1))}</span>`;
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
      <!-- 👏 Filled by paintReactStrip on the 250 ms tick, NOT by paint(). A reaction expires by
           wall clock, and repainting the run frame four times a second to age it out would
           remount the follow camera's canvas mid-chase. Empty mount, patched in place. -->
      <div class="react-strip" data-react-strip aria-live="off"></div>
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
  return `<div class="seat-face">${robotFaceSvg(look.shell, look.accent, { size: 52, treatment: 'chip' })}</div>`;
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
    const mounted = faceWrap.querySelector('.bot-face');
    if (look && mounted && paintLook(mounted, look)) {
      faceWrap.hidden = false;
    } else if (look) {
      faceWrap.hidden = false;
      faceWrap.innerHTML = robotFaceSvg(look.shell, look.accent, { size: 52, treatment: 'chip' });
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

function ballotBoard(votes, names, recap, episode, tiebreaks) {
  const rows = (votes || []).map((v) => `
    <div class="row">
      <div class="who">${esc(joinedName(names, v.voter, 'Someone'))}</div>
      <div class="arrow">sent</div>
      <div class="pick">RUNNER ${esc(joinedName(names, v.runner, 'The runner'))}<br>GUIDE ${esc(joinedName(names, v.guide, 'The guide'))}</div>
    </div>`).join('');
  const why = describeCastTiebreaks(tiebreaks).join(' · ');
  const whyLine = why ? `<p class="ballot-why">${esc(why)}</p>` : '';
  // playEpisode increments episode after the premiere; recap.episode stays 1.
  const huge = Number(episode) === 1 || recap.episode === 1;
  return `${whyLine}<div class="ballot${huge ? ' huge' : ''}">${rows || '<p class="hint">No ballots yet — phones pick a runner and a guide.</p>'}</div>`;
}

function standingLead(standing, names) {
  const first = (standing || [])[0];
  return first ? joinedName(names, first.target, 'Someone') : '';
}

/* =============================================================================================
 * 🎬 **THE CASTING STAGE — ONE PICTURE, EDGE TO EDGE, WITH THE BALLOTS ON TOP OF IT.**
 *
 * What this deliberately does NOT emit, because John asked for all four of them to go:
 *
 *  - the ballot counter under the lamps (`n of m`). The lamps ARE the count — one lights when
 *    that player's ballot lands — and the slips on the right name every one of them.
 *  - the lower-third nameplate (`live · casting · seat n`). Nobody is being interviewed; the
 *    plate named whoever happened to be leading the tally and re-cast itself mid-beat.
 *  - the kicker under it, which explained where ballots were about to land. The board no longer
 *    needs explaining, and the sentence was the same every night of the show's life.
 *  - the pair hero — the runner's and the guide's names either side of a middot, in 120px. It is
 *    re-cast every episode, so a watcher reads it, learns it, and then has to unlearn it two
 *    minutes later; and by the time it can be printed at all, the slips already say the same
 *    thing. `ballotBoard` lost it too, for the same reason.
 *
 * The whole lower band and the whole right column went with them, and the frame took the space:
 * `.night.on-cast` in `night-skin.js` drops `night-main`'s padding to zero and lets `.talk-frame`
 * run to all four edges, so the follow layer — placed on that rect every frame by `placeFollow` —
 * is the full width of the television rather than 74% of it.
 *
 * ⚠️ **THE OVERLAY IS A CASTING-ONLY EXEMPTION.** Talk beats (debrief / reckoning / vote /
 * execution / recap) still keep their chrome in reserved bands outside the frame — see the
 * `.talk-chrome-*` note in `look.js`, and `harness/talk-frames.mjs`, which measures those five
 * beats for exactly that. Casting can float chrome over the picture only because `on-cast` lifts
 * the night above the body-level camera plate; nothing else on the TV may assume that stacking.
 * ============================================================================================= */
function castStage({ votes, names, tiebreaks, board }) {
  return `
    <div class="talk-stage cast-stage">
      <div class="talk-well">
        <div class="talk-picture">
          <div class="intro-frame talk-frame" aria-label="Ballroom circle"></div>
        </div>
      </div>
      ${castOverlay(votes, names, tiebreaks)}
      ${board ? `<div class="cast-strip">${board}</div>` : ''}
    </div>`;
}

/**
 * One slip per ballot: who sent it, then the two names on it. Two lines, not a three-column grid
 * at 84px — the picture behind it is the thing being watched, and a slip that has to be read
 * across a 300px column is a slip nobody reads at all.
 */
function castOverlay(votes, names, tiebreaks) {
  const slips = (votes || []).map((v) => `
    <div class="cast-slip">
      <div class="cast-voter">${esc(joinedName(names, v.voter, 'Someone'))}</div>
      <div class="cast-picks">
        <span><em>run</em>${esc(joinedName(names, v.runner, 'The runner'))}</span>
        <span><em>guide</em>${esc(joinedName(names, v.guide, 'The guide'))}</span>
      </div>
    </div>`).join('');
  const why = describeCastTiebreaks(tiebreaks).join(' · ');
  return `<aside class="cast-overlay" aria-label="Ballots">
    <div class="cast-overlay-k">ballots</div>
    <div class="cast-slips">${slips || '<p class="cast-empty">phones are picking</p>'}</div>
    ${why ? `<p class="cast-why">${esc(why)}</p>` : ''}
  </aside>`;
}

function talkStage({
  recap, names, lobby, runEnd, clock, kicker, beat,
  who, whoSub, whoId, standing, tally, verdict, executed, aside, facts, state,
}) {
  const look = whoId ? seatLook(lobby, whoId) : null;
  const face = look ? robotFaceSvg(look.shell, look.accent, { size: 64, treatment: 'chip' }) : '';
  /*
   * 🔢 The lower third names ONE person and it is the biggest thing on the screen — so when two
   * players are called Sam it is also the least useful thing on the screen. Every list already
   * carries the seat; the plate the room actually reads has to as well.
   */
  const seatNo = whoId ? (lobby?.seats || []).find((s) => s.playerId === whoId)?.seat : null;
  const sub = whoSub || `live · ${beat || 'debrief'}`;
  /*
   * 🚫 **A NAMEPLATE WITH NO PERSON IS NOT DRAWN.**
   *
   * `who` falls back to a WORD when nobody is resolved yet — `'The circle'` at Recap and
   * Debrief, `'Reckoning'` before the first nomination, `'The ballot'` before the Vote opens —
   * and that word was then set at 56px as the biggest thing on the television. A lower third
   * exists to answer "who is this"; answering it with the name of the beat, which the rundown
   * rail is already printing twice, is furniture where the room needed the state.
   *
   * `whoId` is the test rather than `who`, because `whoId` is only ever a real player id: the
   * plate now appears the instant there IS somebody to name (a runner resolves, a nomination
   * lands, an eviction is read out) and stays away the rest of the time. Nothing that named a
   * real person before stops naming them.
   */
  const plate = who && whoId
    ? nameplateHtml({ name: who, sub: seatNo == null ? sub : `${sub} · seat ${seatNo + 1}`, face })
    : '';
  /*
   * 📊 The count, at broadcast size — see `readyState`. Sits where the plate would, so a beat
   * with nobody to name still has something in the band, and it is the thing that moves.
   */
  const stateBoard = state
    ? `<div class="beat-state${state.done ? ' done' : ''}">
        <div class="beat-n">${esc(String(state.n))}</div>
        <div class="beat-of">${esc(state.of)}</div>
      </div>`
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
  const side = `${aside || ''}${nomBoard(standing, names, lobby, beat)}${tally ? lynchBoard(tally.votes, tally.result, names) : ''}`;
  return `
    <div class="talk-stage${side ? ' has-side' : ''}">
      <div class="talk-chrome-top">
        ${facts ? '' : recapMini(recap, names, runEnd)}
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
        ${facts || ''}
        <div class="talk-band">${stateBoard}${plate}</div>
        <p class="talk-kicker">${esc(kicker || 'Talk.')}</p>
      </div>
    </div>`;
}

/*
 * The two-chip strip in the top chrome. It carries the LAST expedition into the beats that argue
 * about it, so Debrief / Reckoning / Vote all want it — but on the Recap itself the same three
 * facts are 56px high in the lower band, and printing them twice on one screen is the D8 double
 * clock in another costume. `talkStage` stands it down whenever a `facts` board is on screen.
 */
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

/*
 * ⚠️ THIS BOARD HAS NO EMPTY STATE ANY MORE, AND THAT RETIRED A BUG RATHER THAN HIDING IT.
 *
 * It used to print the Reckoning's instruction whenever it had no rows — including on the VOTE
 * beat, where nominating is over and the instruction is impossible; a play critic photographed a
 * Vote screen telling the room to do something it could no longer do. That was first fixed by
 * gating the copy on `beat`.
 *
 * The copy is now gone outright: an empty board still reserved `.talk-side`, a fifth of the
 * television, to say one grey sentence the kicker under the picture was already saying. It
 * returns '' with no rows, the ballroom takes the width back, and a board that draws nothing
 * when empty cannot mis-instruct on any beat. `beat` stays — it still selects the row styling,
 * and the Vote and Execution still pass it. Gates: `link-merge` L94, `party-warm` W37b.
 */
function nomBoard(standing, names, lobby, beat) {
  if (!standing) return '';
  const rows = standing.map((n, i) => {
    const look = seatLook(lobby, n.target) || DEFAULT_LOOK;
    const face = robotFaceSvg(look.shell, look.accent, { size: 48, treatment: 'chip' });
    return `
    <div class="nom-row show-nom">
      <div class="nom-n">${i + 1}</div>
      ${nameplateHtml({
        name: joinedName(names, n.target, 'Someone'),
        sub: `named by ${joinedName(names, n.nominator, 'a player')}`,
        face,
      })}
      ${seatChip(lobby, n.target)}
    </div>`;
  }).join('');
  /*
   * 🚫 **AN EMPTY BOARD IS NOT A BOARD — IT IS A COLUMN THE PICTURE COULD HAVE HAD.**
   *
   * `talkStage` reserves `.talk-side` (300px, ~19% of the television) whenever `side` is a
   * non-empty string, and this used to return a `<div>` wrapping one grey sentence — so for the
   * first half of every Reckoning the room looked at a picture cropped by a fifth to make room
   * for one grey sentence asking the phones to nominate. Photographed at
   * `progress/talk/tv-reckoning.png`.
   *
   * That sentence was a duplicate as well as a cost: the kicker under the picture already says
   * `Nominate. First tap stands.` Returning '' collapses the column, the ballroom takes the
   * width back, and the board appears the moment the first nomination gives it something to
   * draw. `party-warm` W37b is the lock.
   */
  if (!rows) return '';
  return `<div class="nom-board">${rows}</div>`;
}

/* =============================================================================================
 * 🍮 THE PAIR BOARD — the public half of the mechanic, finally on the shared screen.
 *
 * A play critic simulated three metres from a 55" panel and could not read any of it: *"who
 * paired into what, who refused whom, who is waiting, and how many are ready are all invisible
 * from a sofa."* The whole thing lived in `linkKicker` — 12px `--night-dim`, in the bottom-left
 * gutter, under a lower-third naming the EXPEDITION RUNNER, which is the biggest thing in the
 * band and irrelevant during Debrief.
 *
 * The slot for it already existed and was empty: `talkStage`'s `aside` renders into `.talk-side`,
 * which `look.js` already styles at 26% / 280px with names at `clamp(16px,1.8vw,24px)`. Casting
 * fills it with `ballotBoard`, Reckoning with `nomBoard`, and **Debrief passed nothing at all**.
 *
 * ⚠️ IT CARRIES BOTH REAL NAMES. Merging overwrites the plate above each robot, so during a pair
 * the television knows four people only as JELLIE and JELLIE — it erases the identity of everyone
 * who is doing something, in the beat whose whole job is tracking who said what. John chose the
 * merged word alone on the 3D plate and that stands; this is where the names come back.
 * ============================================================================================= */
function pairBoard(links, names, lobby, refusals) {
  const L = links || { pending: [], pairs: [] };
  const face = (id) => {
    const look = seatLook(lobby, id) || DEFAULT_LOOK;
    return robotFaceSvg(look.shell, look.accent, { size: 40, treatment: 'chip' });
  };
  const who = (id) => joinedName(names, id, 'Someone');

  const pairs = (L.pairs || []).map((p, i) => `
    <div class="nom-row show-nom pair-row pair-${i}">
      <div class="pair-faces">${face(p.a)}${face(p.b)}</div>
      ${nameplateHtml({ name: p.name, sub: `${who(p.a)} + ${who(p.b)}` })}
    </div>`).join('');

  const waiting = (L.pending || []).map((r) => `
    <div class="nom-row show-nom pair-wait">
      ${nameplateHtml({ name: who(r.from), sub: `reaching out to ${who(r.to)}` })}
    </div>`).join('');

  const said = (refusals || []).map((r) => `
    <div class="nom-row show-nom pair-no">
      ${nameplateHtml({ name: who(r.to), sub: `turned ${who(r.from)} down` })}
    </div>`).join('');

  const body = pairs + waiting + said;
  // 🚫 Same rule as `nomBoard`: an empty Connections board cost the Debrief a fifth of the
  // television for the first half of the beat, to say that nobody had reached out — which is
  // exactly what an empty column already says. It draws when there is a connection to draw.
  // `party-warm` W37b.
  if (!body) return '';
  const full = (L.pairs || []).length >= MAX_PAIRS
    ? '<p class="hint">Two conversations · the room is full</p>' : '';
  return `<div class="nom-board pair-board">
    <div class="pair-board-k">Connections</div>
    ${body}
    ${full}
  </div>`;
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

/**
 * 🔪 **THE HAND, WITHOUT THE NAME — because the nameplate beside it is already the name.**
 *
 * `executionLine` says both facts in one sentence, and the Execution beat was printing that one
 * sentence THREE TIMES: as the verdict plate's line, as the nameplate's context, and again as
 * the 12px kicker, with `NO EVICTION` appearing twice on top of that. Photographed at
 * `progress/talk/tv-execution.png` — three elements, one fact, three type sizes, and none of
 * them saying the thing the room came for.
 *
 * The room came for two facts and they are now one each: the NAMEPLATE names who is out (with
 * their seat and their face, so a table with two Sams can tell which), and this line names the
 * hand. `executionLine` is untouched — the phone and the log still want the whole sentence.
 */
function executionSwing(result, names) {
  if (!result) return '';
  if (!result.executed) return 'Nobody reached the threshold.';
  const swing = result.executioner === SHOWRUNNER
    ? 'The Showrunner'
    : joinedName(names, result.executioner, 'The nominator');
  return result.executioner === SHOWRUNNER
    ? 'The Showrunner swings.'
    : `${swing} swings — they named them, so their vote was already cast.`;
}

/* =============================================================================================
 * 🗞️ THE RECAP FACTS — ten seconds of designed airtime that used to say nothing.
 *
 * These four facts have existed in this file since the beat did, inside a `recapBoard()` that was
 * **defined and never called**: `show === 'recap'` renders `talkStage`, whose only recap content
 * is `recapMini` — two 13px chips in the top chrome. A play critic photographed a Recap from
 * sofa distance and could not read the outcome of the expedition the whole room had just
 * watched. The Recap is the beat that sets up what the Debrief argues about; it has to be able
 * to be read from a sofa.
 *
 * `recapBoard`'s own `countdownHtml({label:'RECAP'})` head is deliberately NOT carried over. It
 * was the second clock in a beat that already had one — the D8 defect on the same screen.
 * ============================================================================================= */
function recapFacts(recap, names, runEnd) {
  const taken = recap.taken?.length
    ? recap.taken.map((t) => joinedName(names, t.id, 'The runner')).join(', ')
    : 'CAME BACK';
  // SMASHED/TIME straight off the server (`RUN_END` in `src/party/show.js`). `runEnd` is null
  // until the room says otherwise, so a stale or missing message just omits the fact rather than
  // guessing — CAUGHT is not wired yet and must never appear here on its own.
  const outcome = runEnd
    ? `<div class="fact"><div class="k">Outcome</div><div class="v ${runEnd === 'SMASHED' ? 'ok' : 'bad'}">${esc(runEnd)}</div></div>`
    : '';
  return `<div class="recap talk-facts">
      ${outcome}
      <div class="fact"><div class="k">Camera</div><div class="v ${recap.cameraLit ? 'ok' : 'bad'}">${recap.cameraLit ? 'LIT' : 'STAYED DARK'}</div></div>
      <div class="fact"><div class="k">Runner</div><div class="v ${recap.taken?.length ? 'bad' : 'ok'}">${esc(taken)}</div></div>
      <div class="fact"><div class="k">Alarms</div><div class="v">${esc(String(recap.alarmCount ?? 0))}</div></div>
    </div>`;
}

/* =============================================================================================
 * 📊 THE BALLOT BOX, FILLING UP — the Vote's own end condition, on the shared screen.
 *
 * Every other beat that ends on a count already shows it: Casting arms a visible 3·2·1 when the
 * last ballot lands, Debrief and Reckoning print "0 of 5 ready". The lynch ballot showed neither
 * the count nor the threshold, so a play critic sat through twenty-two seconds of a Vote in which
 * every ballot was already in and nothing on the television said so. That is the deadest stretch
 * in the night, in the beat that should be the tensest.
 *
 * ⚠️ **IT NAMES NOBODY AND TALLIES NOTHING.** `FANOUT_KEYS.tally` is `in`, `living` and `need` —
 * see `lynchProgress` in `src/party/room.js`. Who has voted, and what for, is aired at the
 * Execution twenty-five seconds later; putting either here would hand the room the result early.
 * ============================================================================================= */
function tallyBoard(tally) {
  const t = tally || null;
  if (!t || !t.living) return '';
  const inCount = Math.min(t.in | 0, t.living | 0);
  const all = inCount >= t.living;
  const pct = Math.round((inCount / Math.max(1, t.living)) * 100);
  const note = all ? 'every ballot in — closing' : `needs ${t.need} to carry`;
  return `<div class="nom-board tally-board${all ? ' full' : ''}">
    <div class="pair-board-k">Ballots in</div>
    <div class="tally-n"><span class="tally-in">${esc(String(inCount))}</span><span class="tally-of">of ${esc(String(t.living))}</span></div>
    <div class="tally-bar"><div class="tally-fill" style="width:${pct}%"></div></div>
    <p class="hint">${esc(note)}</p>
  </div>`;
}

/* =============================================================================================
 * 🎬 THE CASTING BOARD — the twenty seconds nobody had anything to look at.
 *
 * Casting opens with every player head-down reading a role card, and the television showed an
 * empty ballroom and one grey line. It is the one moment in the night when the room is reliably
 * silent and looking at their hands, and it was the emptiest screen in the show.
 *
 * ⚠️ **IT COUNTS BALLOTS, IT DOES NOT READ CARDS.** "Who has finished reading" is not a fact any
 * machine in this room has. What IS on the wire is who has sent a casting ballot — already aired
 * by `ballotBoard`, so nothing new is exposed. A lamp goes on when that player's ballot lands.
 *
 * ⚠️ **AND WHILE THE HOUSE IS STILL BAKING, THE BAR IS THE BAKE — NOT THE BALLOTS.** The blank
 * window this board exists to fill is mostly the mansion compiling: intros cannot fire until
 * `ui.warm === 'ready'` and the first ballot cannot land until after the intros, so a ballot
 * counter during that window is pinned at zero by construction. An eight-phone probe caught the
 * first cut doing exactly that — a progress line that could never progress. John's own note on
 * the load was that it had "no loading indicator"; this is that window, so this is where it goes.
 * ============================================================================================= */
function castBoard(lobby, votes, warm) {
  const seats = (lobby?.seats || []).filter((s) => !s.isTV);
  if (!seats.length) return '';
  const baking = !!warm && warm.stage !== 'ready';
  const sent = new Set((votes || []).map((v) => v.voter));
  const done = seats.filter((s) => sent.has(s.playerId)).length;
  const all = done >= seats.length && seats.length > 0;
  const lamps = seats.map((s) => {
    const look = cleanLook(s) || DEFAULT_LOOK;
    const on = sent.has(s.playerId);
    return `<div class="cast-lamp${on ? ' on' : ''}">
      <span class="seat-chip" style="background:${esc(look.accent)}">${esc(String((s.seat ?? 0) + 1))}</span>
      <div class="who">${esc(s.name)}</div>
      <div class="meta">${on ? 'ballot in' : 'reading'}</div>
    </div>`;
  }).join('');
  /*
   * 🚫 **NO `n of m` UNDER THE LAMPS.** John cut the counter off the casting screen, and the
   * lamps are why it can go: eight of them, one per chair, each lit by that player's own ballot —
   * a watcher reads the same fact off the row without a number restating it, and the slips on the
   * right name every ballot the number was summarising. `done` / `all` stay: `all` is what swaps
   * the lead line to "Every ballot is in."
   *
   * ⚠️ **THE BAKE BAR IS NOT THE COUNTER AND DOES NOT GO WITH IT.** While the mansion is
   * compiling, no ballot can exist — intros wait on `ui.warm === 'ready'` and the first ballot
   * waits on the intros — so the bar is the only honest progress on this screen and it is the
   * loading indicator John asked for by name. `party-warm` W35c2 is the control on that.
   */
  const foot = baking ? `<div class="cast-warm">${warm.bar}</div>` : '';
  return `<div class="cast-board">
    <div class="cast-k">Read your card</div>
    <div class="cast-lead">${all ? 'Every ballot is in.' : 'Nobody says a word yet.'}</div>
    <div class="cast-lamps">${lamps}</div>
    ${foot}
  </div>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
