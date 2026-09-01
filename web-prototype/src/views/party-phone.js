/**
 * Phone — a controller (bible D13). Join by code, claim a seat, reconnect by token.
 * Hold the role card; vote; tap a pad.
 *
 * During an expedition the RUNNER's sheet is a pad: two sticks, RUN, SWING, a room
 * label. Eyes on the TV — this screen does not mount a chase iframe. The GUIDE still
 * gets the map / flyover and never a camera. Seated phones stay a reaction pad.
 *
 * 🚨 This screen still never gets a lid-off house, a hunter mesh, or the guide's pins.
 */
import { PartyNightClient, defaultWsUrl, tokenKey, normalizeCodeDisplay, normalizeCodeWire } from '../party/night-client.js';
import { recapFromEvents } from '../party/recap.js';
import { injectNightSkin, markPartyReady, playerName } from '../party/night-skin.js';
import { ACCENTS, DEFAULT_LOOK, SHELLS, cleanLook, paintLook, robotFaceSvg } from '../party/look.js';
import { REACTIONS, REACT_COOLDOWN_MS, REACT_MOOD, cleanReaction } from '../party/react.js';
import { applyCastLock, applyCastTap, ballotFromCast, CAST_BLOCK_WHY, castPrompt, castRowBlock, castRowMark, freshCast, mergePublicNames, nominationPlayers, padlockSvg } from '../party/cast-ui.js';
import { deadIdsFromPublic, historyFromCastEvents } from '../party/ballot.js';
import { linkBlock, mergeName, WHISPER_MAX, MAX_PAIRS, pairRemaining, isDone, whisperLines } from '../party/link.js';
import { cardFor, faceDownHtml, mountRoleCard, premiereHtml } from '../party/rolecard.js';
import { EVIL } from '../party/cast.js';
import { guideMapSvg } from '../party/guidemap.js';
import { COMPASS_4, guidePad, pinDoor, pinShape, pinSpot, runnerPad } from '../party/intel-pad.js';
import { pickPlanSeed, planRoomLabels, roomLabel } from '../party/mansion.js';
import { missionFor, seekLine } from '../party/mission.js';
import {
  // RUNNER_VOICE / GUIDE_VOICE are no longer imported: with the button rows gone there is nothing
  // here to iterate. The words themselves are printed in the SAY line as plain copy, and `jobs.js`
  // stays their one owner for the harness and the recap.
  JOB, realFaceFor, drillShotFor, footstepsCue, wallWord, toolLabel,
} from '../party/jobs.js';
import { intelLine } from '../party/intel.js';
import { STICK_DEADZONE, warmLabel } from '../party/follow.js';
import { formatRemain, isTalkBeat, LATE_DEBRIEF_MS, remainingMs } from '../party/show.js';
import { outcomeLine } from '../party/win.js';
import { NO_ONE } from '../party/vote.js';
import { clearsLine } from '../party/scorekeeper.js';

export default async function partyPhone({ params }) {
  injectNightSkin();
  markPartyReady();
  document.title = 'PRIME TIME — phone';
  document.body.style.overflow = 'auto';

  const root = document.createElement('div');
  root.className = 'night phone';
  document.body.appendChild(root);

  const savedLook = cleanLook(readLook()) || { ...DEFAULT_LOOK };
  const state = {
    step: 'join',
    code: normalizeCodeWire(params.get('room') || ''),
    name: localStorage.getItem('rrr.party.name') || '',
    err: '',
    client: null,
    throttle: 'STILL',
    flash: '',
    look: savedLook,
    lookLocked: false,
    cast: freshCast(),
    castEpisode: null,
    /** null · 'deal' while the backs are flying · 'premiere' while the card is first up. */
    stage: null,
    /**
     * 📍 **THE GUIDE'S ONE PIN — D2, and the word "one" is the whole rule.**
     *
     * *"A second tap **replaces** the pin; it does not append to it. There is no pin list, no
     * ordering, no undo stack."* So this is a single slot holding `{x, z, roomId, kind}` or null,
     * and `pinDoor` returns a fresh object that is ASSIGNED here — assignment is what "replaces"
     * means, and there is no array for a route to accumulate in.
     *
     * ⚠️ **LOCAL, AND ON PURPOSE.** It reaches the runner by the guide SAYING it, which is the
     * locked *"voice is in the room"* rule — the same rule that already makes GO/HOLD and
     * CLOSE/LATE/GOING mouth-to-ear and not pad-to-pad. Putting the pin on the wire is Stage 3 of
     * `task-runner-intel.md` and wants its own review: it needs `crew` audience (runner or guide,
     * never `all` — a seated phone must not learn where the target is) and a `MATRIX` row, and
     * `MATRIX` is deny-by-default so a field without one is a hard red (`party-isolation` I1c).
     */
    pin: null,
    /**
     * 🕹️ The pad's own state. `x`/`y` is the stick as a clamped unit vector; `sent` is the last
     * thing put on the wire, which is what makes the 20 Hz tick change-gated rather than a
     * metronome. See `startPad`.
     */
    pad: {
      x: 0, y: 0, lookX: 0, lookY: 0, run: false, swing: false, act: 0, hide: false,
      sent: '', timer: 0,
    },
    /**
     * 📳 The pad's answer to the last thing the thumb did. `label` is the word under the stick,
     * `kind` is the CSS modifier, `timer` wipes it. See `padFx`.
     */
    padFx: { label: '', kind: '', timer: 0 },
    /** When this phone last fired a reaction. Feel only — the server keeps the real clock. */
    reactAt: 0,
    /** The last `mission.*` this phone painted, so the BREAK can be told from the steady state. */
    missionSeen: null,
    /*
     * 🚨 **GUIDE E'S SCOPE, MEMOISED — AND IT LIVES ON `state` BECAUSE A `let` HERE IS A TRAP.**
     *
     * `guideScopeFor` is a hoisted `function` and the structural stamp calls it near the TOP of
     * `paint()`, hundreds of lines above where the helper is written. A `let scopeMemo` beside the
     * helper is therefore in its temporal dead zone on every paint, and the whole phone threw
     * *"Cannot access 'ne' before initialization"* — minified, from inside the guide's own sheet.
     * `harness/phone-accusation.mjs` PA8 caught it; nothing in node could have, because none of the
     * node gates execute `paint()`. `state` is an object literal that is fully built before any of
     * this runs, so a field on it has no dead zone at all.
     */
    scopeMemo: { key: '', scope: null },
    /** How far along the TV's mansion bake is — fanned to every phone, not just the host. */
    warm: '',
    warmPct: 0,
    /** The deal is one moment. A reconnect replays the card; it does not re-deal it. */
    dealSeen: false,
    /** Dealt to, but the face picker still owns the screen. See `maybeRunDeal`. */
    dealPending: false,
    lastBeat: null,
    nominated: false,
    /**
     * 🔨 **WHAT THE SERVER DID WITH MY LAST NOMINATION TAP.** `{ok, target, why}` off the wire,
     * or null before it has answered.
     *
     * ⚠️ **THIS IS SERVER STATE THAT HAPPENS TO BE PARKED HERE, NOT A SECOND `state.nominated`.**
     * The distinction is the whole lesson of the old nominator receipt, which was driven by the
     * optimistic local flag and therefore LIED — see `paintNominate`'s header. `nominated` is set
     * by a thumb; this is set only by a `t:'nomOk'` frame, and it is the one thing on this screen
     * entitled to say a tap was refused. It is kept in this closure rather than on the shared
     * client object for the same reason the whispers are — no other view needs it — but its
     * provenance rule is `client.myBallot`'s exactly: nothing writes it except an incoming frame.
     */
    nomOk: null,
    /** My own READY thumb this beat. The room total arrives on the wire. */
    ready: false,
    /** Whispers this pairing. Never leaves the phone; cleared with the pair. */
    whispers: [],
    /** Half-typed line, kept across the repaint every socket message causes. */
    draft: '',
    focusWhisper: false,
    /** Was I paired on the last links message? Lets a partner walking out be named. */
    wasPaired: false,
    /** Was somebody asking me on the last links message? Fires the invitee buzz exactly once. */
    wasAsked: false,
    /** Did I tap DONE? Separates a mutual finish from being walked out on. */
    wasDone: false,
    linkNote: '',
    voted: false,
    clockTimer: 0,
    /** Late-debrief pick-list has been painted / buzzed this hold. */
    lateNomShown: false,
    /** Visible cast rejection / self-pick line. Not a second rule. */
    castNote: '',
  };

  /**
   * 🚨 THE CARD IS MOUNTED ONCE, OUTSIDE `root`. Every sheet on this screen repaints by writing
   * `root.innerHTML`, and a `pointerdown` on a node that is replaced before its `pointerup` never
   * delivers a release — the card would latch lit on a phone the owner has already put down. It is
   * the same lesson `cast-ui.js`'s structural stamp exists for, one layer up. See `rolecard.js`.
   */
  const card = mountRoleCard({
    nameOf: (id) => playerName(mergePublicNames(state.client?.frame?.players, state.client?.lobby), id),
    onClose: () => { state.stage = null; paint(); },
  });

  if (!state.code) {
    paintJoin();
    return;
  }
  await connect();

  async function connect() {
    const code = normalizeCodeWire(state.code);
    if (code.length < 4) { state.err = 'Room code is four letters.'; state.step = 'join'; paintJoin(); return; }
    state.code = code;
    const u = new URL(location.href);
    u.searchParams.set('view', 'party.phone');
    u.searchParams.set('room', code);
    history.replaceState({}, '', u);

    state.step = 'connecting';
    paintConnecting();

    const token = sessionStorage.getItem(tokenKey(code, 'phone'));
    const wsPort = +(params.get('wsPort') || 5181);
    const url = `${defaultWsUrl(wsPort)}/?room=${encodeURIComponent(code)}${token ? `&token=${token}` : ''}`;
    const client = new PartyNightClient({
      url,
      onMessage: (m) => {
        if (m.t === 'welcome') sessionStorage.setItem(tokenKey(code, 'phone'), m.token);
        if (m.t === 'full') state.err = 'Room is full (8 phones + TV).';
        if (m.t === 'warm') {
          // The wait belongs to the room, not to the host tab. A phone that has just typed its
          // name should be able to see the night loading rather than wonder if anyone is there.
          state.warm = m.stage; state.warmPct = m.pct ?? 0;
          const el = root.querySelector('[data-warm-line]');
          if (el) { el.textContent = warmSummary(); return; }
        }
        /*
         * 🔨 **THE ANSWER TO A TAP, AND THE ONLY THING THAT MAY RELEASE THE DEBOUNCE.**
         *
         * `state.nominated` is set the instant the thumb lands so a second tap cannot double-send.
         * That is right while the tap is in flight and WRONG the moment the server says it did
         * not take it — a phone left holding a debounce for a nomination that does not exist can
         * never nominate again this episode, and its sheet reads `Sending your nomination…` until
         * the beat ends. So a refusal, and only a refusal off the wire, hands the thumb back.
         *
         * An `ok` receipt deliberately does NOT feed the sheet's green plate: that plate quotes
         * `c.noms`, the public row, because a receipt this phone holds privately cannot survive a
         * reconnect and the public one can. See `paintNominate`'s header.
         */
        if (m.t === 'nomOk') {
          state.nomOk = { ok: m.ok !== false, target: typeof m.target === 'string' ? m.target : '', why: m.why || '' };
          if (!state.nomOk.ok) {
            state.nominated = false;
            padFx('Not recorded.', '', [0, 25, 40, 25]);
          }
        }
        if (m.t === 'event' && m.ev?.type === 'role.card') dealt(!!m.replay);
        /*
         * 🔒 A WHISPER LANDS HERE AND GOES NO FURTHER. It is kept in this closure, never on the
         * shared client object — nothing another view could reach should be able to hold the one
         * piece of player-authored content in the game that is private.
         *
         * ⚠️ Returns WITHOUT `routePaint()`. Rebuilding `root.innerHTML` on an incoming message
         * would wipe a half-typed reply, drop the keyboard on a phone, and reset the scroll of
         * the log — three times in a row during a fast exchange. `paintWhispers` writes the one
         * element in place, which is the same lesson `padFx` and the role card already carry.
         */
        if (m.t === 'whisper') {
          state.whispers.push({ from: m.from, text: m.text, at: m.at });
          if (state.whispers.length > 60) state.whispers.splice(0, state.whispers.length - 60);
          if (m.from !== client.welcome?.playerId) padFx('•', '', [0, 20]);
          paintWhispers();
          return;
        }
        // A pair forming or breaking DOES change the sheet, so it repaints — but the words that
        // were already said belong to the pairing that said them.
        if (m.t === 'links') {
          const me = client.welcome?.playerId;
          const stillPaired = (m.pairs || []).some((p) => p.a === me || p.b === me);
          /*
           * ⚠️ **TELL THEM WHAT HAPPENED.** Both of these were silent, and a play critic caught
           * both: a refused player's sheet simply reverted with the name they had just tapped
           * sitting there tappable again, and a player whose partner hit Disconnect mid-sentence
           * was dropped back to the pick list with no idea why their conversation ended. Being
           * turned down and being walked out on are the two most socially loaded moments this
           * mechanic produces; saying nothing reads as a bug both times.
           */
          if (m.refused?.from === me) state.linkNote = 'They said no.';
          /*
           * 🚨 **FOUR WAYS OUT, AND THIS SAID "THEY WALKED OUT ON YOU" FOR ALL OF THEM.**
           *
           * A play critic tapped DONE, watched their partner tap DONE, and was then told
           * *"They disconnected."* The same line fired when the 90-second clock ran out — which
           * `PAIR_MS`'s own header calls "nobody's fault and nobody's choice". DONE exists
           * precisely so that ending early costs nothing socially; the copy then charged it.
           *
           * `wasDone` is what separates them: if I had tapped DONE, the pair ending is the thing
           * I asked for, not something done to me.
           */
          if (state.wasPaired && !stillPaired && !m.refused) {
            state.linkNote = state.wasDone ? 'Finished. Slot back to the room.' : 'They disconnected.';
          }
          state.wasDone = (m.pairs || []).some((p) => (p.done || []).includes(me));
          if (stillPaired) state.linkNote = '';
          /*
           * 🚨 **THE BUZZ WAS ON THE WRONG PHONE.** Tapping a name buzzed the SENDER — who is
           * already looking at their screen, because they just tapped it — and the person being
           * asked got nothing at all. A play critic instrumented the invitee's handset through a
           * whole invite: `navigator.vibrate` 0 calls, audio 0, `document.title` 0 changes. In a
           * real room that phone is face-down on a knee while its owner watches the television.
           *
           * `haptic()` is a no-op on iOS Safari, which has no Vibration API at all — so the title
           * change carries it on half the handsets in any room and the buzz is a garnish. See
           * `padFx`; the pattern is longer and double so it reads as "someone wants you", not as
           * the short confirmation tick every other tap makes.
           */
          const asked = (m.pending || []).some((r) => r.to === me);
          if (asked && !state.wasAsked) {
            const from = (m.pending || []).find((r) => r.to === me)?.from;
            const who = playerName(mergePublicNames(client.frame?.players, client.lobby), from);
            padFx(`${who} wants a word`, 'smash', [0, 90, 90, 90]);
            try { document.title = `${who} → you`; } catch { /* not fatal */ }
          }
          if (!asked && state.wasAsked) { try { document.title = 'PRIME TIME — phone'; } catch { /* fine */ } }
          state.wasAsked = asked;
          state.wasPaired = stillPaired;
          if (!stillPaired) { state.whispers = []; state.draft = ''; state.focusWhisper = false; }
          else state.focusWhisper = true;
        }
        if (m.t === 'lobby' && !state.lookLocked) {
          const me = (m.seats || []).find((s) => s.id === client.welcome?.id);
          if (me?.shell && me?.accent && cleanLook(me)) {
            state.look = { shell: me.shell, accent: me.accent };
            state.lookLocked = true;
            writeLook(state.look);
            if (state.step === 'customise' || state.step === 'connecting') state.step = 'night';
          }
        }
        // The face may have just been resumed from the server rather than picked, which hands the
        // screen over the same way Lock in does.
        maybeRunDeal();
        routePaint();
      },
      onClose: () => {
        state.err = state.err || 'Dropped. Reload to reclaim your seat by token.';
        if (state.step === 'customise') paintCustomise();
        else routePaint();
      },
    });
    state.client = client;
    /*
     * 🔍 `?dev=1` ONLY — a read-only window into the pad, for probes.
     *
     * The phone keeps everything in a closure, which is right: nothing on this screen should be
     * reachable from the page. But it also means a probe watching a real Debrief can see the
     * sheet and not the state behind it, and three separate READY plumbing bugs cost a full
     * round of blind guessing each because of that. Same opt-in as the TV's skip key: a guest's
     * phone never has `?dev=1`.
     */
    if (params.get('dev') === '1') {
      window.__phone = () => ({
        step: state.step,
        lookLocked: state.lookLocked,
        id: client.welcome?.playerId ?? null,
        beat: client.beat,
        ready: client.ready,
        myReady: state.ready,
        links: client.links,
      });
      /*
       * A probe's way of pressing a button this phone owns. It is NOT a bypass of the rules —
       * everything still goes through the server, which re-checks `linkBlock`. It exists because
       * the role-card modal correctly intercepts pointer events on a fresh night, and a probe
       * that wants to check what a SHEET looks like three moves later should not have to defeat
       * an unrelated overlay to get there. `?dev=1` only.
       */
      window.__phoneSend = (msg) => client.send(msg);
    }
    try {
      await client.connect();
      if (state.name) client.send({ t: 'name', name: state.name });
    } catch (e) {
      state.err = (e && e.message) || String(e);
    }
    if (client.full || !client.welcome) { state.step = 'join'; paintJoin(); return; }
    if (!state.lookLocked) { state.step = 'customise'; paintCustomise(); return; }
    state.step = 'night';
    paint();
  }

  function routePaint() {
    const c = state.client;
    if (c?.full || (state.err && !c?.welcome)) { state.step = 'join'; paintJoin(); return; }
    if (state.step === 'customise') return;
    if (state.step === 'connecting') {
      if (c?.welcome && !state.lookLocked) { state.step = 'customise'; paintCustomise(); return; }
      if (c?.welcome && state.lookLocked) { state.step = 'night'; paint(); return; }
      return;
    }
    paint();
  }

  function paintJoin() {
    root.innerHTML = `
      <div class="phone-top"><span>Prime Time</span><span>join</span></div>
      <h1>Sit down.</h1>
      <p class="hint">Type the four-letter code on the TV.</p>
      ${state.err ? `<div class="err">${esc(state.err)}</div>` : ''}
      <input class="field code" id="code" maxlength="8" placeholder="CODE" value="${esc(normalizeCodeDisplay(state.code))}" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text">
      <input class="field" id="name" maxlength="12" placeholder="YOUR NAME" value="${esc(state.name)}" autocomplete="nickname">
      <button class="btn wide" id="join">Join</button>`;
    const codeEl = root.querySelector('#code');
    bindCodeField(codeEl);
    root.querySelector('#join').onclick = () => {
      state.code = normalizeCodeWire(codeEl.value);
      state.name = root.querySelector('#name').value;
      if (state.name) localStorage.setItem('rrr.party.name', state.name);
      connect();
    };
  }

  function paintConnecting() {
    root.innerHTML = `
      <div class="phone-top"><span>Prime Time</span><span>…</span></div>
      <div class="look-stage connecting">
        ${robotFaceSvg(state.look.shell, state.look.accent, { size: 168 })}
        <p class="hint">Sitting down…</p>
      </div>`;
  }

  function paintCustomise() {
    const look = state.look;
    root.innerHTML = `
      <div class="phone-top"><span>${esc(normalizeCodeDisplay(state.code))}</span><span>face</span></div>
      <h1>Your face.</h1>
      <p class="hint">Colour the robot. This is what the room sees on the TV.</p>
      ${state.err ? `<div class="err">${esc(state.err)}</div>` : ''}
      <div class="look-stage" id="look-stage">
        ${robotFaceSvg(look.shell, look.accent, { size: 168 })}
      </div>
      <div class="hint">SHELL</div>
      <div class="swatch-row" id="shells">${SHELLS.map((hex) =>
        `<button type="button" class="swatch${hex === look.shell ? ' on' : ''}" data-part="shell" data-hex="${hex}" style="--swatch:${hex}" aria-label="shell ${hex}"></button>`).join('')}</div>
      <div class="hint">ACCENT</div>
      <div class="swatch-row" id="accents">${ACCENTS.map((hex) =>
        `<button type="button" class="swatch${hex === look.accent ? ' on' : ''}" data-part="accent" data-hex="${hex}" style="--swatch:${hex}" aria-label="accent ${hex}"></button>`).join('')}</div>
      <button class="btn wide" id="lock-look">Lock in</button>`;
    for (const b of root.querySelectorAll('.swatch')) {
      b.addEventListener('click', () => pickLook(b.dataset.part, b.dataset.hex));
    }
    root.querySelector('#lock-look').onclick = () => {
      const locked = cleanLook(state.look) || DEFAULT_LOOK;
      state.look = locked;
      state.lookLocked = true;
      writeLook(locked);
      state.client?.send({ t: 'look', shell: locked.shell, accent: locked.accent });
      state.step = 'night';
      // A deal that landed while this sheet was up has been waiting for exactly this moment.
      maybeRunDeal();
      paint();
    };
  }

  function pickLook(part, hex) {
    if (part !== 'shell' && part !== 'accent') return;
    if (part === 'shell' && !SHELLS.includes(hex)) return;
    if (part === 'accent' && !ACCENTS.includes(hex)) return;
    state.look[part] = hex;
    // One painter for all nine coloured parts — four of them derived from the shell, so
    // patching only the part the thumb touched would leave the crown and the rim behind.
    const face = root.querySelector('.bot-face');
    if (face && !paintLook(face, state.look)) {
      face.outerHTML = robotFaceSvg(state.look.shell, state.look.accent, { size: 168 });
    }
    const row = root.querySelector(part === 'shell' ? '#shells' : '#accents');
    if (row) {
      for (const b of row.querySelectorAll('.swatch')) b.classList.toggle('on', b.dataset.hex === hex);
    }
  }

  /**
   * The night has dealt. One `role.card` per phone, at night start, before the first ballot.
   *
   * ⚠️ A REPLAYED CARD IS NOT A DEAL. A phone that drops and comes back is caught up with its own
   * card through the same filter; animating the deal again would announce a moment that already
   * happened and hide the sheet the player came back for. The card is simply there.
   */
  function dealt(replay) {
    if (state.dealSeen) return;
    state.dealSeen = true;
    if (replay) return;
    state.dealPending = true;
    maybeRunDeal();
  }

  /**
   * ⚠️ THE DEAL WAITS FOR THE FACE, IT DOES NOT SKIP. A phone that is still colouring its robot
   * when the host starts the night would otherwise play the deal underneath the swatch picker —
   * two moments at once, and the one the player is not looking at is the one that matters. It
   * fires the instant Lock in hands the screen over, so a late joiner still sees their card dealt.
   */
  function maybeRunDeal() {
    if (!state.dealPending || !state.lookLocked) return;
    state.dealPending = false;
    state.stage = 'deal';
    runDeal();
  }

  async function runDeal() {
    const seats = joinedPhones();
    await card.deal({ seats: seats.length || 1, mine: Math.max(0, myPhoneIndex(seats)) });
    if (state.stage !== 'deal') return;              // a beat moved on under us
    state.stage = 'premiere';
    card.openCard(currentCard(), { premiere: true });
    paint();
  }

  function joinedPhones() {
    return (state.client?.lobby?.seats || []).filter((s) => !s.isTV && s.joined);
  }

  function myPhoneIndex(seats) {
    return seats.findIndex((s) => s.id === state.client?.welcome?.id);
  }

  /** Has this phone been dealt to? The card event is the deal; `you.role` is standing state. */
  function hasCard() {
    return (state.client?.events || []).some((e) => e.type === 'role.card');
  }

  /**
   * What the card says right now. Read at open time rather than cached, so a Production Panel
   * that lands after the deal is on the card the next time it is held.
   */
  function currentCard() {
    const c = state.client;
    const you = c?.frame?.you || {};
    const roleEv = [...(c?.events || [])].reverse().find((e) => e.type === 'role.card');
    const panelEv = [...(c?.events || [])].reverse().find((e) => e.type === 'production.panel');
    return cardFor({
      role: you.role || roleEv?.data?.role,
      // A Production Panel is addressed and EVIL-visible, so holding one IS the alignment. The
      // frame is the source; this only covers a panel that arrived before the first frame.
      alignment: you.alignment || (panelEv ? EVIL : undefined),
      teammates: you.teammates || panelEv?.data?.teammates || [],
    });
  }

  /** §2.3's persistent tab. A card back and a label — never the role, in any phase. */
  function cardTab() {
    return hasCard() ? faceDownHtml() : '';
  }

  /** Every sheet rebuilds its own DOM, so the tab is re-bound wherever it was just emitted. */
  function bindCardTab() {
    root.querySelector('#card-tab')?.addEventListener('click', () => {
      // Opening is a tap; READING is a hold. Nothing here reveals anything.
      card.openCard(currentCard(), { premiere: state.stage === 'premiere' });
    });
  }

  function paint() {
    const c = state.client;
    if (!c || (!c.welcome && !c.full && !state.err)) {
      paintConnecting();
      return;
    }
    if (!c.welcome || c.full) { paintJoin(); return; }
    if (!state.lookLocked) { paintCustomise(); return; }

    const me = c.welcome;
    const frame = c.frame;
    const players = mergePublicNames(frame?.players, c.lobby);
    const nominees = nominationPlayers(frame?.players, c.lobby);
    const beat = c.beat || 'lobby';
    const phase = frame?.phase || 'LOBBY';
    const recap = recapFromEvents(c.events);
    const myName = playerName(players, me.playerId) || me.name || 'You';
    const pair = frame?.pair || {};
    const iAmRunner = pair.runner && pair.runner === me.playerId;
    const iAmGuide = pair.guide && pair.guide === me.playerId;

    // 🚨 THE CARD PUTS ITSELF AWAY WHEN THE SHOW MOVES. Nobody has to remember to. The premiere
    // stage ends with it, so a phone that was still holding its card when the pair locked lands
    // on the pad rather than on a card it now has to dismiss.
    const prevBeat = state.lastBeat;
    if (prevBeat !== null && beat !== prevBeat) {
      if (state.stage === 'premiere') state.stage = null;
      if (card.isOpen()) card.closeCard();
      // A refusal belongs to the beat that refused it. `debrief is still talk` is advice about a
      // window that has since opened, and a Reckoning refusal is not news in the Vote.
      state.nomOk = null;
    }
    // Face-down phones after Debrief. Same smash pattern — two beats, not a drone.
    if (beat === 'reckoning' && prevBeat !== 'reckoning') {
      padFx('Reckoning.', 'smash', [0, 45, 55, 120]);
    }
    state.lastBeat = beat;

    /**
     * 🚨 **THE STRUCTURAL STAMP — WITHOUT IT THIS SHEET REBUILT ITSELF TWICE A SECOND.**
     *
     * `src/party/room.js` `setWorld` broadcasts on every world report, which the TV sends at 2 Hz
     * for the whole expedition. Every one of those arrives here as a `state` message and used to
     * reach `root.innerHTML = ...`. The visible symptom was John's — the intel line flashing and
     * shoving the pad around — but the invisible one is worse: the stick element is destroyed and
     * rebuilt under the player's thumb, taking its `setPointerCapture` with it, so a drag stops
     * being delivered and the runner walks on after the thumb has lifted.
     *
     * Same instrument `paintCasting` already uses one sheet over. The stamp is everything that
     * changes the SHAPE of the screen; the intel text and the guide's two marks are deliberately
     * NOT in it, because those are exactly what `patchLive` writes in place.
     */
    const missionPhase = (() => {
      const last = [...(c.events ?? [])].reverse().find((e) => String(e.type ?? '').startsWith('mission.'));
      return last ? String(last.type) : 'mission.seek';
    })();
    /*
     * ⚠️ **THE HUNTER'S PRESENCE CAME OFF THIS STAMP AND THAT IS A FIX, NOT A LOOSENING.** It was
     * here because the mark appearing changed the sentence under the map, and `patchLive` only
     * wrote the marks. `patchLive` writes the sentence now — and it has to, because the peek/jam
     * cycle makes the mark come and go every few seconds, so leaving it in the stamp meant the
     * whole SVG was rebuilt on that rhythm and the interference animation restarted from frame
     * one each time. The stamp is the sheet's SHAPE; a circle is not a shape.
     */
    /**
     * 🔨 **THE ONE SWING THE HOUSE ACTUALLY REPORTS — the painting going down.**
     *
     * ⚠️ **READ OFF THE MISSION EVENT, NOT INVENTED HERE.** `mission.return` is appended by
     * `src/party/room.js` off the TV's world report, which is the only process that owns a
     * mansion and therefore the only one that knows a blow landed. This phone is told; it does
     * not decide. That is why there is no HIT on an ordinary swing — nothing on the wire carries
     * one, and a pad that said HIT on a swing at empty air would be lying to the person aiming.
     *
     * Fired from `paint()` because `paint()` runs on every socket message, and the transition is
     * the whole signal: `missionSeen` is armed by the first expedition paint, so joining a night
     * that is already on its way home does not buzz a smash that happened before you looked.
     */
    if (iAmRunner && beat === 'expedition') {
      if (state.missionSeen && state.missionSeen !== missionPhase && missionPhase === 'mission.return') {
        // Buzz-gap-BUZZ. A single long pulse reads as an error tone on a phone; two beats read as
        // an impact, and this is the only moment in the run that has earned one.
        padFx('Smash!', 'smash', [0, 45, 55, 120]);
      }
      state.missionSeen = missionPhase;
    } else {
      state.missionSeen = null;
    }

    /*
     * 🎥 **THE CAMERA IS PART OF THE SHEET'S SHAPE, so it belongs in the stamp.**
     *
     * `liveStamp` is what lets a world report patch the pad in place instead of rebuilding it —
     * a rebuild destroys the stick under the player's thumb along with its `setPointerCapture`.
     * The runner's sheet now has two SHAPES (a look stick on the ground, none under a plan-locked
     * top-down), so the camera has to be in the key or the pad would keep the wrong one forever.
     *
     * It costs exactly one rebuild per crossing, which is the frame the player is watching a
     * 1.35 s camera move on the television rather than their own hands.
     */
    const camStamp = iAmRunner ? `:${frame?.you?.view || 'chase'}` : '';
    /*
     * 🚨 **THE GUIDE'S CHIPS ARE PART OF HER SHEET'S SHAPE, AND LEAVING THEM OUT MADE THE WHOLE
     * PAD A PHOTOGRAPH.** Found 2026-09-02 while walking the loop end to end.
     *
     * The stamp above is *"everything that changes the SHAPE of the screen"*, and until now the
     * guide's half of it was `expedition:guide:{missionPhase}:{job}:{card}` — **not one term of
     * which changes when the runner walks through a door.** `patchLive` writes the here-label, the
     * intel strip, the two map marks and the sentence under them, and it has never touched the pin
     * pad. So `guidePinPad(scope)` rendered ONCE, on the first expedition frame, with the runner
     * still standing in the ballroom, and every chip on it stayed the ballroom's for the whole run.
     *
     * That is Guide E's premise inverted. The board's own argument is *"her rect plus the rects a
     * door joins to it, RIGHT NOW"*; a frozen chip row means she taps NORTH and pins a doorway out
     * of a room the runner left two rooms ago — and under auto-walk the body then walks to it.
     * Tapping a chip was equally stuck: `bindPinPad` calls `paint()`, which matched the same stamp
     * and patched, so neither the `on` highlight nor the say-line moved either.
     *
     * ⚠️ **THE FIX IS A STAMP TERM, NOT A NEW PATCH PATH, AND THE COST IS WHY.** Patching the chips
     * in place means re-deriving the scope inside `patchLive` at 2 Hz and diffing four buttons and
     * a sentence against the DOM — more machinery than the thing it saves. The guide's sheet has
     * **no stick** (`bindPad` bails at `if (!stick)`), so the argument that put this stamp here in
     * the first place — a rebuild destroys `setPointerCapture` under a thumb — does not apply to
     * her seat at all. A rebuild per DOORWAY is the same bargain `camStamp` already takes for the
     * runner's camera crossings, and `guideScope` is computed once per paint and reused below so
     * the plan is not built twice.
     */
    const guideStamp = iAmGuide && beat === 'expedition'
      ? `:${guideScopeFor(frame)?.hereId ?? '-'}:${state.pin ? `${state.pin.kind}@${state.pin.roomId}` : '-'}`
      : '';
    const liveStamp = beat === 'expedition' && !state.stage
      ? `${beat}:${iAmRunner ? 'run' : iAmGuide ? 'guide' : 'watch'}:${missionPhase}:${missionFor(frame?.airingEpisode ?? 1).job}`
        + `:${hasCard() ? 'card' : 'nocard'}${camStamp}${guideStamp}`
      : null;
    if (liveStamp && root.dataset.liveUi === liveStamp && patchLive(frame)) {
      window.__rrrPhone = { frame, beat, seat: me.seat, iAmRunner, iAmGuide };
      return;
    }

    let body = '';
    if (state.err) body += `<div class="err">${esc(state.err)}</div>`;
    /*
     * Guide E's scope, hoisted so the chips can be bound after `root.innerHTML` is written.
     * ⚠️ It cannot ride on `bindPad`: that function bails at `if (!stick)` and the guide sheet has
     * no stick, so anything bound in there never runs on this seat.
     */
    let guideScope = null;

    if (beat !== 'casting') {
      state.cast = freshCast();
      state.castEpisode = null;
      state.castNote = '';
    }

    if (state.stage) {
      // The premiere owns the sheet while the deal is landing. The ballot is one tap behind it,
      // and the beat that opens casting has usually already arrived.
      body += premiereHtml();
    } else if (beat === 'casting' && !pair.runner) {
      if (iAmDead(me, frame?.players, c.events)) {
        paintDeadWatch(me, players);
        return;
      }
      paintCasting(nominees, me, frame?.airingEpisode || c.lobby?.airingEpisode || frame?.episode || 1);
      return;
    } else if (isTalkBeat(beat)) {
      /*
       * 🚨 **TALK / LYNCH BEATS BEFORE THE LOBBY SHEET.** `phase === 'LOBBY'` (and the
       * `frame?.phase || 'LOBBY'` default) used to steal this branch whenever the state
       * frame was late or still on LOBBY. From John's seat that is a pad that never
       * offered a name. Match the beat first.
       */
      if (beat === 'debrief') {
        if (c.runEnd) body += `<h1>${esc(c.runEnd)}</h1>`;
        body += `<h1>Debrief.</h1>${phoneClock(c)}`;
        if (debriefNominateOpen(c)) {
          body += paintNominate(nominees, me, c, { late: true });
        } else {
          /*
           * ⚠️ "Phones down" IS GONE FROM THIS BEAT, deliberately, on John's say-so. Debrief is a
           * five-minute CAP now, and the phone is how the room ends it early — an instruction to
           * put the phone down beside the control that shortens the beat is a contradiction that
           * costs every table four minutes of silence.
           */
          body += `<p class="hint">Talk. Tap READY when you have said your piece — a majority ends the Debrief.</p>`;
        }
        /*
         * 🚨 **THE PAIR SHEET ONLY EXISTS WHERE THE NOMINATE LIST DOES NOT.** Both are lists of
         * the SAME names, and one of them accuses someone of murder.
         *
         * Cutting `'reckoning'` out of `LINK_BEATS` killed the RULES and left these two call
         * sites rendering, which was worse than before it was cut: a play critic photographed the
         * Reckoning sheet with three accusation buttons and, 260px below, the same three names in
         * a green box that did nothing at all. A player taps the lower ELLIE, gets no response,
         * concludes the phone is stuck, and taps the upper one.
         *
         * `debriefNominateOpen` is the late-Debrief wake-up window — the nominate list appears
         * there too, so the pair sheet has to stand down there as well. `isLinkBeat` is the rule;
         * these two conditions are the rule reaching the screen.
         */
        if (!debriefNominateOpen(c)) body += linkHtml(c, players);
        // ⚠️ THE READY DOCK GOES LAST. It is `position:sticky` and would sit on top of anything
        // appended after it — see `readyHtml`.
        body += padFxHtml();
        body += readyHtml(c);
      } else if (beat === 'reckoning') {
        body += paintNominate(nominees, me, c);
        body += padFxHtml();
        body += readyHtml(c);
      } else if (beat === 'vote') {
        body += paintLynchVote(nominees, me, c);
        body += padFxHtml();
      } else if (beat === 'execution') {
        /*
         * 🚨 **`players`, NOT `nominees` — THE EXECUTED PLAYER IS DEAD BY THE TIME THIS DRAWS.**
         *
         * `nominees` comes from `nominationPlayers()`, which correctly drops anyone with
         * `alive === false` — so at the exact moment of the execution the person being executed
         * is already gone from that list, `playerName` falls through to the raw socket id, and
         * every phone in the room reads **"p7 is out."** while the television correctly says
         * "MARY-KATE 3 IS OUT. JOHN SWINGS." A play critic photographed both screens side by
         * side. The TV was right because it uses `mergePublicNames`, which does not filter.
         *
         * The list you name the dead from must be the one that still contains them.
         */
        body += paintExecution(players, c);
      } else if (beat === 'verdict') {
        body += paintVerdict(me, c);
      } else if (beat === 'reunion') {
        body += paintReunion(me, c);
      }
    } else if (beat === 'lobby' || phase === 'LOBBY') {
      body += `<h1>${esc(myName)}</h1>
        <p class="hint">Seat ${me.seat != null ? me.seat + 1 : '—'} · waiting for the host. The TV is the show — this is a pad.</p>
        <p class="hint" data-warm-line>${esc(warmSummary())}</p>
        ${nameField()}
        ${roster(c.lobby)}`;
    } else if (beat === 'casting' && (pair.runner || recap.runner)) {
      body += `<h1>Locked.</h1>
        <p class="hint">${esc(playerName(players, pair.runner || recap.runner))} walks · ${esc(playerName(players, pair.guide || recap.guide))} talks.</p>`;
    } else if (beat === 'expedition') {
      if (iAmRunner) {
        /*
         * 🎥 **WHICH CAMERA THE SHOW IS ON, AND WHY THIS SHEET HAS TWO SHAPES.**
         *
         * D13's pad was written when there was one camera. There are four now, and the top-down
         * one changes what the sticks MEAN: it is plan-locked, so screen direction is world
         * direction and the stick is absolute — push where you want to go — and the look stick
         * has nothing to swing, because a top-down you can turn is the rotating map the whole
         * perspective exists to avoid. Printing "Right stick looks" over a dead control is worse
         * than printing nothing.
         *
         * `frame.you.view` is runner-audience (`net/party/entitle.js`), so no other seat and not
         * the TV is told which camera the show is on.
         */
        const camView = frame?.you?.view || 'chase';
        const topDown = camView === 'top' || camView === 'iso';
        /*
         * 🕹️ **FULL CONTROL, NOT FOUR SPEEDS.** John: *"replace STILL/CREEP/WALK/RUN with full
         * movement control and freedom. Runner spawns equipped with the sledge."*
         *
         * ⚠️ THE OLD PAD DID NOT EVEN SEND. `state.throttle` was set on tap and repainted, and
         * nothing ever put it on the wire — the TV's follow ran on a scripted schedule with the
         * URL's default `throttle=WALK` for the whole expedition. So this is not "a nicer control
         * for the existing thing", it is the first time this screen has moved anything.
         */
        /*
         * 🚫 **NO INTEL BLOCK ON THIS PAD, AND ITS ABSENCE IS THE FEATURE.** John: *"Remove WORD
         * FROM THE HOUSE from the runner. Runner gets info from the guide verbally."* The runner
         * is the one seat that is supposed to be looking at the television and listening to a
         * human being, and a second information channel on the thing in their hands competes
         * with both.
         *
         * ⚠️ **THE GUIDE'S SHEET LOST IT TOO** — see `intelBlock`. A good guide reads the map and
         * its static; the strip was answering the same question underneath with a different rule.
         * SEATED watchers lost it as well (DUSK, expedition): the house-word block was sitting
         * between the emote pad and the card tab, and watchers do not get a house line. Production
         * guides still get their feed.
         */
        const job = missionFor(frame?.airingEpisode ?? 1).job;
        /*
         * 📱 **RUNNER D · FRAME BEZEL.** John locked the board 2026-09-01
         * (`docs/design/refs-runner-intel/canvas/RunnerPadD.dc.html`). The bearing is not a widget
         * in the middle of the screen competing with the television for her eyes — it is a glowing
         * segment of the phone's own EDGE at the pin's angle, which peripheral vision catches while
         * she keeps watching the show. Under the plan-locked top-down the move stick is absolute,
         * so screen direction IS world direction and the segment needs no rotation in her head:
         * she pushes the thumb at the glow. Smash-ready takes the WHOLE bezel cyan — a state of the
         * hammer, never a hint about where to walk.
         *
         * ✅ **THE PIN IS ON THE WIRE AS OF 2026-09-01, AND THE BEZEL POINTS AT A REAL DOOR.**
         *
         * ⚠️ **THIS COMMENT USED TO SAY THE OPPOSITE.** It read *"the pin and the ready flag have
         * no wire yet, and the pad says so rather than pretending"* — true and honest while the
         * pin lived on the guide's handset. `you.pin.*` now has four `crew` rows and `you.at.*`
         * has two `runner` rows, so both ends of the bearing arrive and `bezelOf` can draw one.
         *
         * 🚨 **`ready` STILL HAS NO WIRE AND STILL SAYS SO.** Smash-ready is the sledge RAY
         * intersecting the armed target (D7) and only the follow slot can cast it; there is no
         * `you.smashReady` row and inventing one would be a second review. `false` is the honest
         * value, and the whole-bezel arm is the shape waiting for it.
         *
         * ⚠️ **NO COORDINATE SURVIVES THIS CALL.** `bezelOf` returns `{edge, from, to}` pixels, a
         * screen word and a range BAND — you cannot rebuild a map from a glowing segment, which
         * is the entire reason a bearing is safe in a runner's hand and a map is not (D13).
         */
        const bez = runnerPad(frame?.you?.at ?? null, frame?.you?.pin ?? null, false);
        body += `${bezelHtml(bez)}
          <h1>${job === JOB.DRILL ? 'You drill.' : 'You smash.'}</h1>
          <p class="hint">${topDown
            ? 'Eyes on the TV. She walks to the door your guide pinned. The stick only steps you left or right.'
            : 'Eyes on the TV. She walks to the pinned door on her own. The stick steps you sideways; the right stick looks.'}</p>
          <p class="hint">${job === JOB.DRILL
            ? 'No map. Say CLOSE, LATE or GOING out loud, then hold DRILL. HOLD from your guide means let go. Clock still runs.'
            : 'Listen to your guide — they have the map, you have the hammer. Two identical faces. No mark on either.'}</p>
          ${missionLine(frame, frame?.you?.here ?? null)}
          ${hereLine(frame)}
          ${job === JOB.SMASH ? runnerSmashFaces() : runnerDrillPad(c.worldSeed, frame?.airingEpisode ?? 1)}
          <div class="stick-wrap${topDown ? ' top' : ''}">
            <div class="stick-col">
              <div class="stick" id="stick"><div class="nub" data-nub></div></div>
              <div class="stick-cap">Dodge</div>
            </div>
            <div class="stick-side">
              <button class="stick-btn" id="run-btn" type="button">Run</button>
              <button class="stick-btn swing" id="swing-btn" type="button">${job === JOB.SMASH ? 'Hit' : 'Swing'}</button>
              <button class="stick-btn hide" id="hide-btn" type="button">Hide<span>needs cover</span></button>
              ${job === JOB.DRILL ? '<button class="stick-btn drill" id="drill-btn" type="button">Drill<span>loud while down</span></button>' : ''}
            </div>
            ${topDown ? '' : `<div class="stick-col">
              <div class="stick stick-look" id="stick-look"><div class="nub" data-nub-look></div></div>
              <div class="stick-cap">Look</div>
            </div>`}
          </div>
          ${padFxHtml()}`;
      } else if (iAmGuide) {
        /*
         * 🗺️ **THE GUIDE FINALLY HAS THE MAP THEY HAVE BEEN TOLD THEY HAVE.** D13 shipped the
         * sentence *"The map is yours"* over an empty screen.
         *
         * It is built from `worldSeed` — public, `all` audience — through the same
         * `pickPlanSeed` the mansion is built from, so this is the house the runner is standing
         * in rather than a diagram of a different one. The marks come from `frame.flyover`, which
         * `net/party/entitle.js` L81-84 restricts to the `guide` audience and gates on a lit
         * camera, so a blind guide gets a floor plan and knows they are blind.
         *
         * 🚨 The TV still gets none of this. `party-loop.md`'s "Do not" list, first item.
         */
        /*
         * ⚠️ `client.worldSeed`, NEVER `frame?.worldSeed ?? 0`. The TV mounts its mansion from the
         * same accessor; a local default on either side is how the two ends end up drawing
         * different houses, which `src/party/mansion.js` exists to forbid. `null` means the socket
         * does not know yet, and a map of the wrong house is worse than a map that is one message
         * late.
         */
        const seed = c.worldSeed == null ? null : pickPlanSeed(c.worldSeed).seed;
        const marks = frame?.flyover?.marks ?? [];
        const meMark = marks.find((k) => k.kind === 'you') ?? null;
        const hunterMark = marks.find((k) => k.kind === 'hunter') ?? null;
        /*
         * 📡 **THE FEED CAN BE CUT, AND THE PHONE IS TOLD SO RATHER THAN LEFT TO INFER IT.**
         * `src/party/mapfeed.js` decides; a jammed frame arrives with no hunter mark at all, so
         * without this flag a jam would be indistinguishable from an uncovered room and the
         * guide would call it as "no camera" — the wrong sentence for a screen full of static.
         */
        const jam = !!frame?.flyover?.jam;
        const job = missionFor(frame?.airingEpisode ?? 1).job;
        /*
         * 🗺️ **GUIDE E · NEIGHBOURS ONLY.** John locked the board 2026-09-01
         * (`docs/design/refs-runner-intel/canvas/GuidePadE.dc.html`). She sees the runner's own
         * room and only what its portals reach right now; everything else is fog, so the pad
         * cannot hold a route even in principle — there is no second step on it to draw.
         * `intel-pad.js` `guidePad` is the whole model and a node gate executes it directly.
         *
         * ⚠️ **NO `you` MARK, NO SCOPE — AND THE FALLBACK IS TODAY'S FLOOR PLAN.** With no idea
         * where she is standing there is no "her room" for anything to be a neighbour of, and
         * `party-warm` W8c already settled what a blind guide gets. `scope: null` is the shipped
         * map, unchanged.
         */
        const scope = guideScopeFor(frame);
        guideScope = scope;
        /*
         * 🗺️ **THE MAP IS THE PRIMARY SURFACE, AND THE ORDER OF THIS TEMPLATE IS THE WHOLE OF
         * THAT.** John, 2026-09-01: *"Guide E neighbours map is the PRIMARY surface, readable at
         * ~390x844. Pin chips in thumb country under the map… Real Aim stays a private one-liner
         * and must not shrink the map."*
         *
         * What was above the map before: an `h1`, two hint paragraphs and, on a drill night, a
         * whole three-button row further down that pushed the pin chips off the bottom of a 390×844
         * screen. The map is what she is reading and the chips are what her thumb reaches, so the
         * map goes FIRST at full width and the chips sit directly under it where a thumb rests.
         * The heading is a single line above it; everything explanatory moved below the chips or
         * out entirely.
         *
         * ⚠️ **`.guide-sheet` IS WHAT LETS THE MAP GROW.** `night-skin.js` gives the map a taller
         * `max-height` inside this class only, so the unscoped map elsewhere is unchanged — see
         * `GUIDE_MAP_CSS`'s own comment about a reskin that misses one surface.
         */
        body += `<div class="guide-sheet">
          <h1 class="gs-title">${scope ? 'One door ahead.' : 'You talk.'}</h1>
          ${seed == null
            ? '<p class="hint gm-blind">Waiting for the house…</p>'
            : guideMapSvg({
              seed,
              goal: missionFor(frame?.airingEpisode ?? 1).room,
              runner: meMark,
              flyover: hunterMark ? { hunter: hunterMark } : null,
              jam,
              scope,
            })}
          ${guidePinPad(scope)}
          <p class="hint gs-note ${hunterMark ? '' : 'gm-blind'}" data-gm-note>${esc(mapNote(jam, hunterMark))}</p>
          ${missionLine(frame, scope?.hereId ?? null)}
          ${guideJobPad(job, c.worldSeed, frame?.airingEpisode ?? 1)}
          <p class="hint gs-note">The TV does not get this map. Call the rooms out loud. Cameras live ${frame?.cameras?.unlocked ?? '—'}.</p>
          ${intelBlock(frame, { productionOnly: true })}
        </div>`;
      } else {
        /*
         * 👏 THE PAD SENDS. Until now these four buttons printed a word on this phone and
         * reached no other machine — six of eight players holding a dead remote for the whole
         * run. The face on each button is the player's OWN face wearing that reaction, because
         * what the room is about to see on the television is that exact picture.
         */
        body += `<h1>Watch.</h1>
          <p class="hint">Your face, on the TV. The room sees who reacted.</p>
          <div class="pad react-pad" id="react">
            ${REACTIONS.map((r) => `<button data-r="${r}" class="react-btn">
              ${robotFaceSvg(state.look.shell, state.look.accent, { size: 54, mood: REACT_MOOD[r] })}
              <span>${r}</span>
            </button>`).join('')}
          </div>
          ${state.flash ? `<p class="hint">${esc(state.flash)}</p>` : ''}`;
      }
    } else {
      /*
       * 🗑️ **THE RECAP CARD IS GONE FROM THIS SHEET, DELIBERATELY AND FOR NOW.** John: *"Drop
       * Recap for the moment (host and phones). It doesn't make sense before a round and isn't
       * useful yet."* Three facts about an episode that may not have happened is worse than no
       * card at all, and this screen's only job between beats is to get out of the way of the
       * conversation. The beat and `recapFromEvents` survive on the wire — the affordance is
       * what was removed, not the data — so putting the card back is a paint, not a rebuild.
       */
      /*
       * ?? THE OUTCOME WORD IS THE ONE FACT THE RUNNER NEEDS AT RECAP.
       * Playcritique F2: the pad said "Phones down." and never whether they smashed it, got
       * caught, or ran out of time. `c.runEnd` is the server's `RUN_END` — SMASHED or TIME
       * today; CAUGHT is reserved until the hunter actually takes (follow-bed still says next
       * slice). Missing end omits the word — same honesty as TV `recapBoard` — rather than
       * inventing TIME before the room has said so.
       */
      if (c.runEnd) body += `<h1>${esc(c.runEnd)}</h1>`;
      body += `<p class="hint">Phones down. Debrief is next.</p>`;
    }

    // 🚨 §2.3: *"a persistent ROLE tab … reopens it in any phase"*. It used to be a static CLEAR
    // card dumped into the sheet after the pair locked and then HIDDEN for the whole expedition —
    // readable by the neighbour for as long as its owner looked away, and gone for the twenty
    // minutes the card is actually being reasoned about. It is a face-down tab now, everywhere.
    body += cardTab();

    delete root.dataset.castUi;
    /* =========================================================================================
     * ⏱️ ONE CLOCK ON THE PHONE TOO — the same D8 defect, one screen over.
     *
     * The status strip printed `RECKONING · 34S · JOHN` and the sheet under it printed `34s` at
     * 64px, from the same tick loop. It is the television's double clock in miniature and it
     * reads as a glitch for exactly the same reason. Measured off the built body rather than a
     * list of beats, so a beat added later cannot bring the pair back — same rule as
     * `stageHasClock` in `views/party-host.js`.
     * ========================================================================================= */
    const sheetHasClock = body.includes('data-show-clock');
    root.innerHTML = `
      <div class="phone-top"><span>${esc(state.code.toUpperCase())}</span><span>${esc(beat)}${sheetHasClock ? '' : phoneClockInline(c)} · ${esc(myName)}</span></div>
      ${body}`;
    if (liveStamp) root.dataset.liveUi = liveStamp; else delete root.dataset.liveUi;

    /*
     * A read-only handle for the drive, and DELIBERATELY THIS PHONE'S OWN PROJECTED FRAME rather
     * than the client — the same reasoning as `window.__rrrHost` in `views/party-host.js`. It is
     * what the entitlement matrix already decided this socket may see, so exposing it cannot leak
     * anything a screenshot of this screen would not.
     */
    window.__rrrPhone = { frame, beat, seat: me.seat, iAmRunner, iAmGuide, showUntil: c.showUntil };

    if (beat !== 'reckoning' && beat !== 'debrief') { state.nominated = false; state.nomOk = null; }
    if (beat !== 'vote') state.voted = false;
    // My thumb belongs to ONE beat. Carrying it into the next would silently hand the next
    // talk beat a majority nobody voted for.
    if (beat !== state.readyBeat) { state.ready = false; state.readyBeat = beat; }
    startPhoneClock();
    bindNominate(c);
    bindLynchVote(c);
    bindReady(c);
    bindLink(c, players);
    paintWhispers();

    root.querySelector('#save-name')?.addEventListener('click', () => {
      const v = root.querySelector('#name')?.value || '';
      state.name = v;
      localStorage.setItem('rrr.party.name', v);
      c.send({ t: 'name', name: v });
    });
    bindPad();
    bindPinPad(guideScope);
    /*
     * ⚠️ `e.target` IS THE SVG, NOT THE BUTTON. The old handler read `dataset.r` straight off the
     * target and worked only because the buttons were plain text — with a face and a label inside
     * each one, every tap lands on a child and reads undefined. `closest` is the fix.
     *
     * The local cooldown is for FEEL, not for enforcement: the server runs the same clock and
     * refuses silently (see `applyReact`), so the worst a tampered phone achieves is its own
     * taps being dropped. Repainting the whole sheet on every tap would tear the run frame, so
     * the disabled state is toggled on the buttons in place.
     */
    root.querySelector('#react')?.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('[data-r]');
      const r = cleanReaction(btn?.dataset?.r);
      if (!r) return;
      const now = Date.now();
      if (now - state.reactAt < REACT_COOLDOWN_MS) return;
      state.reactAt = now;
      state.client?.send({ t: 'react', r });
      padFx(r, 'smash', [0, 30]);
      const pad = btn.parentElement;
      pad.classList.add('cooling');
      setTimeout(() => pad.classList.remove('cooling'), REACT_COOLDOWN_MS);
    });
    bindCardTab();
  }

  /**
   * 🕹️ **THE STICK — a pointer drag, clamped to a unit disc, posted at 20 Hz WHEN IT CHANGES.**
   *
   * Three decisions, all of which cost something if they go the other way:
   *
   * · **`setPointerCapture`.** Without it a thumb that slides off the 230 px circle stops
   *   delivering `pointermove` and the runner keeps walking into a wall until the player lifts.
   *   With it the drag belongs to the stick until `pointerup`, wherever the thumb goes.
   * · **`touch-action:none` in the CSS**, not `preventDefault` here. The browser decides whether a
   *   gesture is a scroll before the first `pointermove` fires, so a JS-side cancel is too late.
   * · **CHANGE-GATED.** A phone posting an unchanged stick twenty times a second costs battery and
   *   wire for nothing. The timer runs at 20 Hz and only sends when the rounded value moved — but
   *   it always sends the zero, so releasing the stick reliably stops the body.
   *
   * A swing is an EDGE, sent immediately rather than waiting for the tick: a hammer that fires up
   * to 50 ms after the tap reads as an unresponsive game rather than a lagged one.
   */
  function bindPad() {
    const stick = root.querySelector('#stick');
    const look = root.querySelector('#stick-look');
    const runBtn = root.querySelector('#run-btn');
    const swingBtn = root.querySelector('#swing-btn');
    if (!stick) { stopPad(); return; }

    const bindStick = (el, nub, apply) => {
      if (!el) return;
      const set = (x, y) => {
        const mag = Math.hypot(x, y);
        const k = mag > 1 ? 1 / mag : 1;
        const sx = x * k;
        const sy = y * k;
        apply(sx, sy);
        if (nub) nub.style.transform = `translate(calc(-50% + ${sx * 78}%), calc(-50% + ${-sy * 78}%))`;
        el.classList.toggle('on', Math.hypot(sx, sy) > STICK_DEADZONE);
      };
      const fromEvent = (e) => {
        const r = el.getBoundingClientRect();
        // +y is FORWARD / look-up, so the screen's downward axis is negated once, here.
        set((e.clientX - (r.left + r.width / 2)) / (r.width / 2),
          -((e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
      };
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        fromEvent(e);
        sendPad();
      });
      el.addEventListener('pointermove', (e) => {
        if (!el.hasPointerCapture(e.pointerId)) return;
        fromEvent(e);
      });
      const release = (e) => {
        try { el.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
        set(0, 0);
        sendPad();
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    };

    bindStick(stick, root.querySelector('[data-nub]'), (x, y) => {
      state.pad.x = x;
      state.pad.y = y;
    });
    bindStick(look, root.querySelector('[data-nub-look]'), (x, y) => {
      state.pad.lookX = x;
      state.pad.lookY = y;
    });

    const hold = (btn, on) => {
      btn.addEventListener('pointerdown', () => { state.pad.run = on; btn.classList.toggle('on', on); sendPad(); });
      btn.addEventListener('pointerup', () => { state.pad.run = false; btn.classList.remove('on'); sendPad(); });
      btn.addEventListener('pointercancel', () => { state.pad.run = false; btn.classList.remove('on'); sendPad(); });
    };
    if (runBtn) hold(runBtn, true);
    if (swingBtn) {
      swingBtn.addEventListener('pointerdown', () => {
        swingBtn.classList.add('on');
        sendPad(true);
        // Straight after the send, so the buzz dates the message rather than the render. 18 ms is
        // a tick, not a rumble: this fires as fast as the player can tap and a long pattern would
        // queue up behind itself into one continuous drone.
        padFx(swingBtn.textContent?.trim() === 'Hit' ? 'Hit' : 'Swing', '', 18);
        setTimeout(() => swingBtn.classList.remove('on'), 220);
      });
    }
    const drillBtn = root.querySelector('#drill-btn');
    if (drillBtn) {
      /*
       * ⚠️ **THE OLD "HAVE YOU TAPPED A WORD YET" GUARD IS GONE, AND IT WAS THE SECOND REASON THE
       * DRILL NEVER WORKED.** It refused to start the mount until the player had tapped one of
       * the CLOSE / LATE / GOING buttons — buttons that sent nothing to anybody and are now
       * removed (John, 2026-09-01: *"Drop fake tappable CLOSE/LATE/GOING and GO/HOLD cue
       * BUTTONS"*), so it was a decorative prerequisite for a real action. The first reason was
       * one hop further on: `party-host.js` `flushMove` dropped `act` entirely.
       *
       * The rule it was reaching for is unchanged and is enforced where it belongs — in the room.
       * The guide says GO. Nothing on this pad can send that, so nothing on this pad can check it.
       */
      const down = () => {
        state.pad.act = 1;
        drillBtn.classList.add('on');
        sendPad();
      };
      const up = () => {
        state.pad.act = 0;
        drillBtn.classList.remove('on');
        sendPad();
      };
      drillBtn.addEventListener('pointerdown', down);
      drillBtn.addEventListener('pointerup', up);
      drillBtn.addEventListener('pointercancel', up);
    }
    /*
     * 🫥 **HIDE — a HOLD, and the pad never learns whether it worked.**
     *
     * Deliberately: `runner-intel.js` `coverNear` refuses it in an open hall, and that refusal
     * happens in the follow bed where the furniture is. A pad that lit up green only when cover
     * was in reach would be a cover DETECTOR in the runner's hand — a second information channel
     * on the thing she is holding, which is the exact thing D13 took off this screen. She looks at
     * the television and sees whether the body ducked, like everybody else in the room does.
     */
    const hideBtn = root.querySelector('#hide-btn');
    if (hideBtn) {
      const down = () => { state.pad.hide = true; hideBtn.classList.add('on'); sendPad(); };
      const up = () => { state.pad.hide = false; hideBtn.classList.remove('on'); sendPad(); };
      hideBtn.addEventListener('pointerdown', down);
      hideBtn.addEventListener('pointerup', up);
      hideBtn.addEventListener('pointercancel', up);
    }
    startPad();
  }

  /**
   * 📳 **THE PAD ANSWERS THE THUMB — a word and a buzz, and NOTHING ELSE CHANGES.**
   *
   * 🚨 **THE SWING WAS THE ONE INPUT ON THIS SCREEN WITH NO RECEIPT.** The stick answers itself:
   * the nub moves under the thumb and the body walks on the TV. The swing had a 220 ms tint on
   * the button — under the finger that is pressing it — and then a hammer that lands somewhere
   * on a television the player is not looking at while they aim. So a tap that went out and a tap
   * that was eaten by a scroll gesture felt identical, and the honest player read was "this thing
   * is broken", which is the read a controller must never produce.
   *
   * ⚠️ **THE BUZZ IS FIRED WHERE THE MESSAGE IS SENT, NOT WHERE A RESULT COMES BACK.** It is a
   * confirmation of the INPUT — the same promise a physical button's click makes — and it has to
   * be immediate to keep it. Waiting on the mansion would put a round trip plus a swing
   * animation between the tap and the buzz, which is how haptics stop reading as your own hand.
   *
   * `navigator.vibrate` is absent on desktop and iOS Safari, and throws on nothing; the `?.` plus
   * the try is so that a phone that cannot buzz still gets the word. The word is the fallback.
   */
  function haptic(pattern) {
    try { navigator.vibrate?.(pattern); } catch { /* no motor, or the tab is not the top level */ }
  }

  function padFx(label, kind = '', pattern = 0) {
    state.padFx.label = label;
    state.padFx.kind = kind;
    haptic(pattern);
    paintPadFx();
    clearTimeout(state.padFx.timer);
    state.padFx.timer = setTimeout(() => {
      state.padFx.label = '';
      state.padFx.kind = '';
      paintPadFx();
    }, kind === 'smash' ? 1500 : 520);
  }

  /**
   * ⚠️ WRITES THE ELEMENT IN PLACE AND NEVER CALLS `paint()`. A swing is a tap-rate event and
   * `paint()` rebuilds the sheet — repainting on every swing would destroy the stick under a
   * thumb that is still holding it, which is the exact failure the `liveStamp` above exists to
   * prevent. The label is emitted from `state` by `padFxHtml` too, so a repaint the SHOW causes
   * (the mission phase changing is one) carries the word across the rebuild instead of eating it.
   */
  function paintPadFx() {
    const el = root.querySelector('[data-pad-fx]');
    if (!el) return;
    el.textContent = state.padFx.label;
    el.className = `pad-fx${state.padFx.label ? ' on' : ''}${state.padFx.kind ? ` ${state.padFx.kind}` : ''}`;
  }

  function padFxHtml() {
    return `<div class="pad-fx${state.padFx.label ? ' on' : ''}${state.padFx.kind ? ` ${state.padFx.kind}` : ''}"
      data-pad-fx aria-live="polite">${esc(state.padFx.label)}</div>`;
  }

  function sendPad(swing = false) {
    const p = state.pad;
    const msg = {
      t: 'move',
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      lookX: Math.round(p.lookX * 100) / 100,
      lookY: Math.round(p.lookY * 100) / 100,
      run: !!p.run,
      swing: !!swing,
      act: +p.act || 0,
      // 🫥 HOLD to hide. A hold like `act`, so it joins the change-gated key below rather than
      // becoming an edge — and it is a REQUEST: the bed refuses it with no furniture in reach.
      hide: !!p.hide,
    };
    const key = `${msg.x}|${msg.y}|${msg.lookX}|${msg.lookY}|${msg.run}|${msg.act}|${msg.hide}`;
    if (!swing && key === p.sent) return;
    p.sent = key;
    state.client?.send(msg);
  }

  function startPad() {
    if (state.pad.timer) return;
    state.pad.timer = setInterval(() => sendPad(), 50);      // 20 Hz, and change-gated inside
  }

  function stopPad() {
    // The word goes with the pad. A sheet that is no longer the pad has no element to write into,
    // and a stale label surviving into the next expedition would announce last episode's smash.
    clearTimeout(state.padFx.timer);
    state.padFx.label = '';
    state.padFx.kind = '';
    state.pad.act = 0;
    state.pad.hide = false;
    if (!state.pad.timer) return;
    clearInterval(state.pad.timer);
    state.pad.timer = 0;
  }

  /** What the mansion is doing, for the lobby. Identical wording to the TV's bar, deliberately. */
  function warmSummary() {
    if (!state.warm) return 'The TV is warming the mansion…';
    if (state.warm === 'ready') return 'The mansion is ready.';
    return `${warmLabel(state.warm).replace(/^./, (c) => c.toUpperCase())} · ${state.warmPct}%`;
  }

  /**
   * 🖼️ The mission, in the runner's and the guide's own words. Driven by the `mission.*` events
   * `src/party/room.js` appends off the TV's world report — PUBLIC, and carrying a room and
   * nothing else, so a spectator can follow the beat without being told who is where.
   */
  /**
   * Where the runner is standing — one word, same dictionary as the guide map.
   * Not intel. Not a map. Proprioception so a shouted room name is checkable.
   */
  function hereLabel(roomId) {
    if (!roomId) return '—';
    const labels = nightLabels();
    if (labels?.has?.(roomId)) return labels.get(roomId);
    const type = String(roomId).includes('.') ? String(roomId).split('.')[1] : String(roomId);
    if (/^\d+$/.test(type) || String(roomId).startsWith('c')) return 'a passage';
    return roomLabel(type);
  }

  function hereLine(frame) {
    return '<p class="here">You are in <strong data-here>' + esc(hereLabel(frame?.you?.here)) + '</strong></p>';
  }

  function twinFaceHtml(face, { real = false } = {}) {
    return `<div class="twin-face${real ? ' real' : ''}" data-face="${face}">
      <div class="twin-canvas"></div>
      <span class="twin-lab">${face.toUpperCase()}</span>
      ${real ? '<span class="twin-stamp">REAL</span>' : ''}
    </div>`;
  }

  function runnerSmashFaces() {
    return `<div class="twin-row" data-job-pad="smash">
      ${twinFaceHtml('left')}
      ${twinFaceHtml('right')}
      <p class="hint twin-note">Identical · same loudness · no mark on either</p>
    </div>`;
  }

  /*
   * 🗣️ **THE THREE TAPPABLE WORDS ARE GONE, AND THE RULE THEY WERE DRESSED AS IS STRONGER FOR IT.**
   *
   * John, 2026-09-01: *"Drop fake tappable CLOSE/LATE/GOING and GO/HOLD cue BUTTONS. Voice stays
   * in the room. One SAY line of text is fine. FOOTSTEPS can stay as a small line, not a 3-button
   * row."*
   *
   * The buttons were honest about themselves — they printed *"buttons send nothing"* right above
   * a row of buttons — and that is exactly what was wrong with them. A control that does nothing
   * teaches a player that the pad is where the game happens, on the one seat whose whole job is to
   * be looking at a television and listening to a person. Worse, one of them had grown teeth: the
   * DRILL button refused to start the mount until CLOSE / LATE / GOING had been tapped, so a
   * decorative widget was gating a real action (see `startPad`).
   *
   * `jobs.js` `voiceSendsNothing()` is untouched and still returns true. It used to be a promise
   * about six buttons; with nothing to press it is a statement about the whole pad.
   */
  function runnerDrillPad(seed, episode) {
    const cue = footstepsCue(Date.now(), seed ?? 0);
    return `<div class="voice-pad" data-job-pad="drill">
      <p class="say-line">Say <strong>CLOSE</strong>, <strong>LATE</strong> or <strong>GOING</strong> out loud.</p>
      <div class="voice-cue" data-foot-cue>FOOTSTEPS · ${esc(cue)}</div>
    </div>`;
  }

  function guideJobPad(job, seed, episode) {
    if (job === JOB.SMASH) {
      const real = realFaceFor(seed, episode);
      return `<div class="twin-row guide" data-job-pad="smash-guide">
        ${twinFaceHtml('left', { real: real === 'left' })}
        ${twinFaceHtml('right', { real: real === 'right' })}
        <p class="voice-know">She cannot see this. Say <strong>${esc(wallWord(real))}</strong> out loud, and pin a face.</p>
      </div>`;
    }
    const shot = drillShotFor(seed, episode);
    return `<div class="voice-pad" data-job-pad="drill-guide">
      <p class="say-line">Say <strong>GO</strong> when he cannot hear it. Say <strong>HOLD</strong> to stop her.</p>
      <p class="voice-know">REAL is the <strong>${esc(toolLabel(shot))} MOUNT</strong>. Recap will say seated either way. She cannot see this.</p>
    </div>`;
  }

  /**
   * 🚪 **GUIDE E'S WHOLE CONTROL — one chip per door out of here, in thumb country.**
   *
   * The chips ARE the scope. There is a chip for each door out of the room she is looking at and
   * there is nothing else to tap, so a route cannot be assembled by tapping twice: the second tap
   * REPLACES the pin (D2) and the map redraws around wherever the runner has walked to. A
   * direction with no door is drawn dim rather than omitted, because a missing chip and a chip for
   * a wall look identical to a thumb but mean opposite things.
   */
  /**
   * 🗺️ **GUIDE E'S SCOPE, BUILT AT MOST ONCE PER PAINT.**
   *
   * Two callers want it and they are on opposite sides of the structural stamp: the stamp itself
   * needs `hereId` to know whether the sheet's SHAPE has changed, and the guide branch needs the
   * whole thing to render. Calling `guidePad` twice would build `planRegions` twice per frame at
   * 2 Hz, which is the kind of waste that later gets "fixed" by taking the term back out of the
   * stamp — so the memo is here to make sure the honest version stays the cheap one.
   *
   * 🚨 **THE KEY IS EVERY INPUT, SO THIS CANNOT GO STALE.** Seed, the runner's mark, the pin, the
   * mission room and the job — miss one and the memo is a lie. It is not a cache of the HOUSE:
   * `neighbourScope`'s header forbids that in capitals and it is right, because the generator can
   * move a wall. This is one frame's answer, thrown away the moment any input differs.
   *
   * ⚠️ **THE MISSION ROOM COMES OFF THE PUBLIC `mission.*` EVENT** — the same read `missionLine`
   * already makes. `room.js` writes it at `VIS.PUBLIC`, so nothing new is asked for and nothing new
   * is entitled; the chips it unlocks are two targets inside a room the runner is standing in,
   * which the guide can already see the whole of.
   */
  function guideScopeFor(frame) {
    const c = state.client;
    const seed = c?.worldSeed == null ? null : pickPlanSeed(c.worldSeed).seed;
    const meMark = (frame?.flyover?.marks ?? []).find((k) => k.kind === 'you') ?? null;
    if (seed == null || !meMark) return null;
    const missionRoom = [...(c.events ?? [])].reverse()
      .find((e) => String(e.type ?? '').startsWith('mission.'))?.data?.room ?? null;
    const job = missionFor(frame?.airingEpisode ?? 1).job;
    const key = `${seed}|${meMark.x}|${meMark.z}|${JSON.stringify(state.pin ?? null)}|${missionRoom}|${job}`;
    if (state.scopeMemo.key === key) return state.scopeMemo.scope;
    state.scopeMemo = { key, scope: guidePad(seed, meMark, state.pin, { missionRoom, job }) };
    return state.scopeMemo.scope;
  }

  function guidePinPad(scope) {
    if (!scope) return '';
    const gates = new Map((scope.gates ?? []).map((g) => [g.dir, g]));
    const chips = COMPASS_4.map((dir) => {
      const g = gates.get(dir);
      const on = !!(g && state.pin && state.pin.roomId === g.toId);
      return `<button type="button" class="pin-chip${g ? '' : ' none'}${on ? ' on' : ''}"
        data-pin="${dir}"${g ? '' : ' disabled'}>
        <span class="pin-dir">${dir}</span>
        <span class="pin-to">${g ? esc(g.toLabel) : 'wall'}</span>
      </button>`;
    }).join('');
    /*
     * 🎯 **AND WHEN SHE IS STANDING IN THE MISSION ROOM, THE JOB'S OWN TARGETS.**
     *
     * John, 2026-09-02: *"Objective chips appear when the runner is in the mission room."*
     * `intel-pad.js` `guidePad` decides that — one room id against one room id — and hands back an
     * EMPTY `spots` everywhere else, so this renders nothing outside the gallery without a second
     * copy of the rule living on the phone.
     *
     * ⚠️ **THE DOOR CHIPS STAY UP BESIDE THEM.** A guide who pins a face and then wants her runner
     * back out of the room must not have to walk her out with a stick that no longer steers; the
     * north/east/south/west row is how the expedition ends, and hiding it inside the mission room
     * would be a dead end wearing a feature's clothes.
     */
    const spots = (scope.spots ?? []).map((s) => {
      const on = !!(state.pin && state.pin.kind === s.kind);
      return `<button type="button" class="pin-chip goal${on ? ' on' : ''}" data-spot="${s.kind}">
        <span class="pin-dir">goal</span>
        <span class="pin-to">${esc(s.label)}</span>
      </button>`;
    }).join('');
    return `<div class="pin-pad" data-pin-pad>
      <p class="hint">${spots
        ? 'She is in the room. Pin what she should go at, and say it out loud.'
        : 'Pin a door. She walks to it. Then say which one, out loud.'}</p>
      <div class="pin-row">${chips}</div>
      ${spots ? `<div class="pin-row pin-goals" data-goal-row>${spots}</div>` : ''}
      <p class="pin-say" data-pin-say>${esc(scope.say)}</p>
    </div>`;
  }

  /**
   * 📍 **AND NOW THE PIN SENDS — Stage 3, 2026-09-01.**
   *
   * ⚠️ **THIS COMMENT USED TO SAY THE OPPOSITE AND THE OLD SENTENCE IS WORTH KEEPING.** The pin
   * was LOCAL, on purpose, and *"Buttons send nothing"* was printed on this pad beside it: the pin
   * reached the runner because the guide SAID it, which is the locked *"voice is in the room"*
   * rule. John's lock replaces the reason rather than the rule — *"AUTO-WALK the guide's pin, one
   * door at a time… the pin MUST go on the wire"* — because a body cannot walk a fact that never
   * left the phone holding it. **The guide still has to say it out loud**; what changed is that
   * the runner's feet now follow as well as her ears, and the two are allowed to disagree, which
   * is the whole of the lie.
   *
   * Assignment stays assignment: `state.pin` is one slot, `pinDoor` returns a fresh object, and
   * the message carries exactly `intel-pad.js` `PIN_KEYS`. The server refuses it from anybody who
   * is not `pair.guide` and refuses any shape that is not those four fields.
   */
  function bindPinPad(scope) {
    if (!scope) return;
    /*
     * 📍 ASSIGNMENT, not push. See `state.pin`'s header — one slot is the whole of D2. A door chip
     * and an objective chip write the SAME slot through the SAME send, which is why a guide who
     * taps LEFT FACE and then taps NORTH has one pin and not two: `pinDoor` and `pinSpot` both
     * return a fresh object, and `state.pin = …` is what "replaces" means.
     */
    const tap = (pin) => {
      state.pin = pin;
      if (pin) {
        const wire = pinShape(pin);
        state.client?.send({ t: 'pin', x: wire.x, z: wire.z, roomId: wire.roomId, kind: wire.kind });
      }
      paint();
    };
    root.querySelectorAll('[data-pin]').forEach((btn) => {
      btn.addEventListener('click', () => tap(pinDoor(scope, String(btn.dataset.pin || ''))));
    });
    root.querySelectorAll('[data-spot]').forEach((btn) => {
      btn.addEventListener('click', () => tap(pinSpot(scope, String(btn.dataset.spot || ''))));
    });
  }

  /**
   * 📱 **RUNNER D'S BEZEL — fixed to the viewport, and deliberately not in the flow.**
   *
   * "The edge of the phone" has to actually be the edge of the phone, so this is a `position:fixed`
   * overlay rather than a border on a card. It is `pointer-events:none` throughout: the whole point
   * is that it is caught by peripheral vision while the thumb is on the stick and the eyes are on
   * the television, so it must never be able to eat a touch meant for RUN or SWING.
   *
   * `bez.runs` arrives as CSS pixels around the perimeter and can span two edges at a corner —
   * `intel-pad.js` `runsOf` does the wrapping, so there is no geometry in this function at all.
   */
  function bezelHtml(bez) {
    const rails = ['top', 'right', 'bottom', 'left']
      .map((e) => `<i class="bz-rail bz-${e}"></i>`).join('');
    const lit = (bez.runs ?? []).map((r) => {
      const len = Math.max(0, r.to - r.from);
      return (r.edge === 'top' || r.edge === 'bottom')
        ? `<i class="bz-lit bz-${r.edge}" style="left:${r.from}px;width:${len}px"></i>`
        : `<i class="bz-lit bz-${r.edge}" style="top:${r.from}px;height:${len}px"></i>`;
    }).join('');
    return `<div class="bezel${bez.whole ? ' armed' : ''}" data-bezel aria-hidden="true">${rails}${lit}</div>
      <div class="bz-read${bez.whole ? ' armed' : ''}" data-bezel-read>
        <span class="bz-cap">${bez.whole ? 'Armed — whole bezel' : (bez.pinned ? 'Your guide pinned' : 'No map here')}</span>
        <span class="bz-word">${esc(bez.whole ? 'SWING NOW' : (bez.pinned ? bez.words : 'the TV is the picture'))}</span>
      </div>`;
  }


  /**
   * 🧭 **AND IT ADVANCES ONCE SHE IS IN THE ROOM** — John, 2026-09-01: *"stop saying Find the
   * gallery."*
   *
   * The room the job is in rides the PUBLIC `mission.*` event (`room.js` L1138), which is where
   * the phase already comes from, so this is one more field off a record every phone gets.
   * `here` is the seat's own room and differs per seat by design: `you.here` is `runner` audience
   * and the guide has `scope.hereId` off her own map. A seated watcher passes neither and gets
   * the unchanged line, which is correct — they are not in any room.
   */
  function missionLine(frame, here = null) {
    const evs = state.client?.events ?? [];
    const last = [...evs].reverse().find((e) => String(e.type ?? '').startsWith('mission.'));
    const phase = last ? String(last.type).slice('mission.'.length) : 'seek';
    const spec = missionFor(frame?.airingEpisode ?? 1);
    return `<p class="goal">${esc(seekLine(spec, {
      here, missionRoom: last?.data?.room ?? null, phase,
    }))}</p>`;
  }

  /**
   * 🔎 What this phone has been told about where the bodies are.
   *
   * ⚠️ **IT RENDERS `you.intel` AND COMPUTES NOTHING.** The good/evil asymmetry is applied
   * server-side in `src/party/room.js` before projection — a good player's frame does not contain
   * an exact coordinate for this to round off. If this function ever starts doing arithmetic on a
   * position, the filter has moved to the client and stopped being a filter.
   */
  /**
   * 🚨 **A RESERVED SLOT, ALWAYS PRESENT, NEVER RE-CREATED — AND IT USED TO BE NONE OF THOSE
   * THINGS.**
   *
   * John, playing this branch: *"Guide and Runner screens are flashing 'word from the house',
   * which moves and resizes everything else on the phone."*
   *
   * Two separate faults produced that, and both are fixed here and in `patchLive` below:
   *
   *   · The block RETURNED `''` when there was no intel. A good player's read is deliberately
   *     sporadic — `intel.js` drops one in three — so the element appeared and vanished twice a
   *     second and everything under it, the stick included, jumped by its height each time.
   *     It is now always emitted and its text is swapped; `min-height` in `night-skin.js` holds
   *     the space whether it is speaking or not.
   *   · It was rebuilt by a FULL `root.innerHTML` write on every world report. That does not just
   *     look bad, it breaks the pad: the stick's element is destroyed mid-drag, so the
   *     `setPointerCapture` goes with it and the runner keeps walking after the thumb lifts.
   */
  /**
   * 🗣️ The night's unique room names, or `null` before the socket knows the seed.
   *
   * The guide's map and this feed must print the SAME words — a guide saying "North Study" while
   * the Production feed says "the Study" is two houses again, which is the thing `mansion.js`
   * exists to forbid. `planRoomLabels` caches on the seed, so calling it from `patchLive` at 2 Hz
   * does not rebuild the plan.
   */
  function nightLabels() {
    const seed = state.client?.worldSeed;
    return seed == null ? null : planRoomLabels(pickPlanSeed(seed).seed);
  }

  /*
   * 🚫 **AND ON THE GUIDE'S SHEET IT IS PRODUCTION'S CHANNEL OR IT IS NOTHING.**
   *
   * John, playing the GOOD guide: the map was showing its static correctly — which is the good
   * guide's blindness, working — and *"No word on the hunter"* was printed under it at the same
   * time. Two surfaces answering the same question with two different rules, six pixels apart, is
   * the defect `mapfeed.js` was written to close, arriving from the other side. #12 removed the
   * strip from the RUNNER; this removes it from the guide, and the reasoning is the same one both
   * times: the seat already has its channel. The runner has a human being talking to them; the
   * good guide has the map, its peek and its static.
   *
   * ⚠️ **THE EVIL GUIDE KEEPS THE PRODUCTION FEED**, because that is not the same strip wearing a
   * different label — it is the exact simultaneous read that IS the Production role
   * (`src/party/intel.js`), and it is what a Production guide steers with.
   *
   * ⚠️ **AND THE TEST IS THE ALIGNMENT, NOT THIS TICK'S GRADE.** `intelFor` returns `null` until
   * the TV's first world report lands, so `grade === 'exact'` is false for the first half second
   * of every expedition — keying the block on it would delete the element out from under a
   * Production guide and put back exactly the *"flashing 'word from the house', which moves and
   * resizes everything else"* this function's reserved slot exists to prevent. `data-intel-mode`
   * carries the decision to `patchLive` so the label cannot flip back either.
   */
  function intelBlock(frame, { productionOnly = false } = {}) {
    const intel = frame?.you?.intel;
    const production = productionOnly || frame?.you?.alignment === 'evil';
    if (productionOnly && frame?.you?.alignment !== 'evil') return '';
    const exact = production || intel?.grade === 'exact';
    return `<div class="intel${exact ? ' exact' : ''}" data-intel data-intel-mode="${exact ? 'production' : 'house'}">
      <span class="k" data-intel-k>${exact ? 'Production feed' : 'Word from the house'}</span>
      <span data-intel-v>${esc(intelLine(intel, nightLabels()))}</span>
    </div>`;
  }

  /**
   * The live half of the expedition sheet, patched in place: the intel line, and the guide's two
   * marks. Everything structural — the stick, the map's rooms and doors, the card tab — is left
   * exactly where it is.
   *
   * Returns false when the sheet is the wrong shape for patching, which sends `paint()` down the
   * full rebuild it would have done anyway.
   */
  function patchLive(frame) {
    /*
     * ⚠️ **THE INTEL SLOT IS NO LONGER PROOF THAT THIS SHEET IS PATCHABLE, AND TREATING IT AS
     * PROOF WOULD REINTRODUCE THE PAD BUG.** This used to bail on a missing `[data-intel]`,
     * which was safe while every expedition sheet had one. The runner's pad has none now, so
     * that bail would send every world report — twice a second, all run — down a full
     * `root.innerHTML` rebuild, destroying the stick under the player's thumb along with its
     * `setPointerCapture`. That is the exact failure the structural stamp exists to prevent.
     *
     * The caller has already matched `root.dataset.liveUi`, so the sheet's SHAPE is known good.
     * All this needs is one live element to write into.
     */
    const slot = root.querySelector('[data-intel]');
    const map = root.querySelector('.guide-map');
    if (!slot && !map && !root.querySelector('#stick')) return false;

    const hereEl = root.querySelector('[data-here]');
    if (hereEl) hereEl.textContent = hereLabel(frame?.you?.here);

    const foot = root.querySelector('[data-foot-cue]');
    if (foot) {
      const cue = footstepsCue(Date.now(), state.client?.worldSeed ?? 0);
      foot.textContent = `FOOTSTEPS · ${cue}`;
    }

    if (slot) {
      const intel = frame?.you?.intel;
      // A slot stamped `production` stays Production's, whatever this tick's read grades as. See
      // `intelBlock` — a Production guide's strip must not relabel itself to "Word from the house"
      // on the frames where `intelFor` happens to have nothing to say.
      const exact = slot.dataset.intelMode === 'production' || intel?.grade === 'exact';
      slot.classList.toggle('exact', exact);
      const k = slot.querySelector('[data-intel-k]');
      const v = slot.querySelector('[data-intel-v]');
      if (k) k.textContent = exact ? 'Production feed' : 'Word from the house';
      if (v) v.textContent = intelLine(intel, nightLabels());
    }

    if (map) {
      // The plan is a pure function of the seed and never moves; only the two marks do. Rewriting
      // the whole SVG at 2 Hz would re-lay-out the map under the guide's thumb.
      const marks = frame?.flyover?.marks ?? [];
      const put = (cls, m, r) => {
        let el = map.querySelector(`.${cls}`);
        if (!m) { el?.remove(); return; }
        if (!el) {
          el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          el.setAttribute('class', cls);
          el.setAttribute('r', String(r));
          map.appendChild(el);
        }
        el.setAttribute('cx', String(Math.round(m.x * 100) / 100));
        el.setAttribute('cy', String(Math.round(m.z * 100) / 100));
      };
      put('gm-runner', marks.find((m) => m.kind === 'you'), 1.15);
      put('gm-hunter', marks.find((m) => m.kind === 'hunter'), 1.3);
      /*
       * 📡 The jam is a CLASS, not a rebuild. The glyph layer is already in the SVG and its
       * animation is CSS, so cutting the feed costs one `classList` write at 2 Hz. Appending
       * the marks after the jam group would put them ON TOP of the static — the SVG paints in
       * document order — so the two marks are re-parented behind it whenever they are created.
       */
      const jam = root.querySelector('.gm-jam');
      if (jam) for (const cls of ['gm-runner', 'gm-hunter']) {
        const el = map.querySelector(`.${cls}`);
        if (el && el.compareDocumentPosition(jam) & Node.DOCUMENT_POSITION_PRECEDING) {
          map.insertBefore(el, jam);
        }
      }
      map.classList.toggle('jam', !!frame?.flyover?.jam);
      const note = root.querySelector('[data-gm-note]');
      if (note) {
        note.textContent = mapNote(!!frame?.flyover?.jam, marks.find((m) => m.kind === 'hunter'));
        note.classList.toggle('gm-blind', !marks.some((m) => m.kind === 'hunter'));
      }
    }
    return true;
  }

  /**
   * What the line under the map says, and the three states are genuinely different problems:
   * the feed is being chewed up, no camera covers the room the hunter is in, or the mark is
   * live. Collapsing the first two into "you are blind" is what would have the guide announce a
   * clear house while an evil robot eats their screen.
   */
  function mapNote(jam, hunterMark) {
    if (jam) return 'The feed is being eaten. Call what you remember, not what you can see.';
    if (hunterMark) return 'A camera has the hunter. The red mark is live.';
    return 'No camera has the hunter. You are calling this one blind.';
  }

  /**
   * Dead do not lock a runner. `me` is the welcome handshake — it has no `alive` —
   * so this reads public facts: `players[].alive` and `player.executed` / `player.taken`.
   * A missing frame falls back to lobby seats as alive:true; the log is what still
   * keeps Ada off the episode-2 ballot. Nameplate stays face-down; no READING sheet.
   */
  function iAmDead(me, players, events) {
    const id = me?.playerId;
    if (!id) return false;
    return deadIdsFromPublic({ players, events }).has(String(id));
  }

  function paintDeadWatch(me, players) {
    stopPad();
    const who = playerName(players, me.playerId) || me.name || 'You';
    root.innerHTML = `
      <div class="phone-top"><span>${esc(state.code.toUpperCase())}</span><span>${esc(who)} · out</span></div>
      <div class="cast-step">
        <h1>You are out.</h1>
        <p class="hint">Your nameplate is face-down. Watch the TV. The living pick the next pair — you do not lock a ballot.</p>
      </div>`;
    root.dataset.castUi = 'dead-watch';
  }

  function paintCasting(players, me, episode) {
    // This sheet returns before `paint()` reaches `bindPad`, so the 20 Hz tick has to be stopped
    // here or a phone that ran last episode keeps posting a stick into the casting beat.
    stopPad();
    const ep = Number(episode) || 1;
    if (state.castEpisode !== ep) {
      state.castEpisode = ep;
      state.cast = freshCast();
      state.castNote = '';
    }
    const cast = state.cast;
    const phase = cast.phase;
    const living = (players || []).filter((p) => p.alive !== false);
    const { lastPair } = historyFromCastEvents(state.client?.events);
    const lockCtx = { lastPair, livingCount: living.length, selfId: me.playerId };
    /*
     * Stamp is the sheet's SHAPE: step + who can be picked. Names and the role-card
     * tab arriving used to live here, so a lobby fanout mid-thumb rebuilt `#lock-pick`
     * and dropped the tap. Patch those in place instead. Lockout ids belong here
     * because they change which rows are buttons.
     */
    const lockId = (slot) => (living.length >= 4 ? (lastPair?.[slot] || '') : '');
    const stamp = `${phase}:${living.map((p) => p.id).join(',')}:${lockId('runner')}:${lockId('guide')}`;
    if (root.dataset.castUi === stamp) {
      syncCastHighlight(cast, me.playerId);
      patchCastSheet(players, me, cast, lockCtx);
      return;
    }

    let body = '';
    if (state.err) body += `<div class="err">${esc(state.err)}</div>`;
    if (phase === 'sent') {
      const runnerName = playerName(players, cast.runner);
      const guideName = playerName(players, cast.guide);
      const selfSent = cast.runner === me.playerId || cast.guide === me.playerId;
      body += `<h1>Sent.</h1>
        <p class="hint">You sent ${esc(runnerName)} to walk and ${esc(guideName)} to talk. The TV has the ballot.</p>
        ${selfSent ? `<p class="cast-note">You named yourself. That ballot is public.</p>` : ''}`;
    } else {
      const slot = phase === 'guide' ? 'guide' : 'runner';
      const lockHint = living.length >= 4 && (lastPair?.runner || lastPair?.guide)
        ? ' Dashed names ran or guided last time — they may swap chairs.'
        : '';
      body += `<h1>${esc(castPrompt(slot, ep))}</h1>
        <p class="hint">${phase === 'guide'
          ? `${esc(playerName(players, cast.runner))} walks. Pick someone else — nothing is sent until you lock it.`
          : `Tap a name. Nothing is sent until you lock it.${lockHint}`}</p>
        ${castList(players, me.playerId, cast, lockCtx)}
        <p class="cast-note" id="cast-note" ${state.castNote ? '' : 'hidden'}>${esc(state.castNote || ' ')}</p>
        <div class="lock-slot" id="lock-slot" ${cast.draft ? '' : 'hidden'}>
          <button class="btn wide lock-btn${cast.draft ? ' in' : ''}" id="lock-pick">${padlockSvg()} Lock ${slot}</button>
        </div>`;
    }

    root.innerHTML = `
      <div class="phone-top"><span>${esc(state.code.toUpperCase())}</span><span>casting · ${esc(playerName(players, me.playerId) || me.name || 'You')}</span></div>
      <div class="cast-step">${body}</div>
      ${cardTab()}`;
    root.dataset.castUi = stamp;
    bindCast(players, me, lockCtx);
    bindCardTab();
  }

  function patchCastSheet(players, me, cast, lockCtx) {
    for (const b of root.querySelectorAll('[data-pick]')) {
      const p = (players || []).find((x) => x.id === b.dataset.pick);
      if (!p) continue;
      const blocked = castRowBlock(p.id, cast, lockCtx);
      const mark = castRowMark(p, cast, { ...lockCtx, selfId: me.playerId });
      const label = `${p.name || p.id}${mark}`;
      if (b.textContent !== label) b.textContent = label;
      b.classList.toggle('locked-out', !!blocked);
      b.toggleAttribute('disabled', !!blocked);
      b.setAttribute('aria-disabled', blocked ? 'true' : 'false');
    }
    const mine = root.querySelector('.phone-top span:last-child');
    if (mine) {
      const want = `casting · ${playerName(players, me.playerId) || me.name || 'You'}`;
      if (mine.textContent !== want) mine.textContent = want;
    }
    const hint = root.querySelector('.cast-step > .hint');
    if (hint && cast.phase === 'guide') {
      const want = `${playerName(players, cast.runner)} walks. Pick someone else — nothing is sent until you lock it.`;
      if (hint.textContent !== want) hint.textContent = want;
    }
    if (hasCard() && !root.querySelector('#card-tab')) {
      root.insertAdjacentHTML('beforeend', faceDownHtml());
      bindCardTab();
    }
  }

  function bindCast(players, me, lockCtx) {
    for (const b of root.querySelectorAll('[data-pick]')) {
      b.addEventListener('pointerdown', (ev) => {
        if (b.disabled || b.classList.contains('locked-out') || b.getAttribute('aria-disabled') === 'true') {
          ev.preventDefault();
          ev.stopPropagation();
          const why = CAST_BLOCK_WHY[castRowBlock(b.dataset.pick, state.cast, lockCtx)];
          if (why) showCastNote(why);
        }
      });
      b.addEventListener('click', (ev) => {
        if (b.disabled || b.classList.contains('locked-out') || b.getAttribute('aria-disabled') === 'true') {
          ev.preventDefault();
          return;
        }
        state.cast = applyCastTap(state.cast, b.dataset.pick);
        if (b.dataset.pick === me.playerId) {
          showCastNote('You named yourself. That ballot is public.');
        } else if (state.castNote && state.castNote.startsWith('You named yourself')) {
          showCastNote('');
        }
        syncCastHighlight(state.cast, me.playerId);
      });
    }
    root.querySelector('#lock-pick')?.addEventListener('click', () => {
      const before = state.cast.phase;
      state.cast = applyCastLock(state.cast);
      if (state.cast.phase === 'sent') {
        const ballot = ballotFromCast(state.cast, me.playerId);
        if (ballot) state.client?.send({ t: 'ballot', runner: ballot.runner, guide: ballot.guide });
      }
      if (state.cast.phase !== before) {
        delete root.dataset.castUi;
        paintCasting(players, me, state.castEpisode);
      }
    });
  }

  function showCastNote(text) {
    state.castNote = text || '';
    const el = root.querySelector('#cast-note');
    if (!el) return;
    el.textContent = state.castNote || ' ';
    el.hidden = !state.castNote;
  }

  function syncCastHighlight(cast, selfId) {
    for (const b of root.querySelectorAll('[data-pick]')) {
      const on = !b.classList.contains('locked-out') && b.dataset.pick === cast.draft;
      b.classList.toggle('on', on);
      b.classList.toggle('self-pick', on && b.dataset.pick === selfId);
    }
    const slot = root.querySelector('#lock-slot');
    const btn = root.querySelector('#lock-pick');
    if (!slot || !btn) return;
    if (cast.draft && slot.hidden) {
      slot.hidden = false;
      btn.classList.remove('in');
      void btn.offsetWidth;
      btn.classList.add('in');
    } else if (!cast.draft) {
      slot.hidden = true;
      btn.classList.remove('in');
    }
  }

  function castList(players, me, cast, lockCtx) {
    return `<div class="pick-list">${(players || []).filter((p) => p.alive !== false).map((p) => {
      const blocked = castRowBlock(p.id, cast, lockCtx);
      const mark = castRowMark(p, cast, { ...lockCtx, selfId: me });
      const on = !blocked && cast.draft === p.id;
      const selfOn = on && p.id === me;
      return `<button type="button" class="${on ? 'on' : ''}${blocked ? ' locked-out' : ''}${selfOn ? ' self-pick' : ''}" data-pick="${esc(p.id)}" ${blocked ? 'disabled aria-disabled="true"' : 'aria-disabled="false"'}>${esc(p.name || p.id)}${esc(mark)}</button>`;
    }).join('')}</div>`;
  }

  function nameField() {
    return `<input class="field" id="name" maxlength="12" value="${esc(state.name)}" placeholder="YOUR NAME">
      <button class="btn ghost wide" id="save-name">Set name</button>`;
  }

  function roster(lobby) {
    const seats = (lobby?.seats || []).filter((s) => !s.isTV && s.joined);
    if (!seats.length) return '';
    return `<p class="hint" style="margin-top:16px">${seats.map((s) => s.name).join(' · ')}</p>`;
  }

  function phoneClock(c) {
    const label = formatRemain(remainingMs(c.showUntil));
    if (!label) return '';
    return `<div class="talk-clock phone-clock" data-show-clock>${esc(label)}</div>`;
  }

  function phoneClockInline(c) {
    const label = formatRemain(remainingMs(c.showUntil));
    return label ? ` · <span data-show-clock>${esc(label)}</span>` : '';
  }

  function startPhoneClock() {
    if (state.clockTimer) return;
    state.clockTimer = setInterval(() => {
      const c = state.client;
      const left = remainingMs(c?.showUntil);
      const label = formatRemain(left);
      for (const el of root.querySelectorAll('[data-show-clock]')) el.textContent = label;
      /*
       * ⏱️ The pair countdown rides the tick that already exists, and is written IN PLACE —
       * a repaint here would drop the keyboard and wipe a half-typed reply once a second.
       */
      const clockEl = root.querySelector('[data-pair-clock]');
      if (clockEl) {
        const mine = linkPairMine(c);
        const ms = pairRemaining(mine, Date.now());
        if (ms != null) {
          const s = Math.ceil(ms / 1000);
          clockEl.textContent = `${s}s`;
          clockEl.classList.toggle('low', s <= 15);
        }
      }
      if (c?.beat === 'debrief' && debriefNominateOpen(c) && !state.lateNomShown) {
        state.lateNomShown = true;
        padFx('Name someone', 'smash', [0, 45, 55, 120]);
        paint();
      }
      if (c?.beat !== 'debrief') state.lateNomShown = false;
    }, 250);
  }

  function debriefNominateOpen(c) {
    const left = remainingMs(c?.showUntil);
    return Number.isFinite(left) && left <= LATE_DEBRIEF_MS;
  }

  function standingNames(players, client) {
    const byId = new Map((players || []).map((p) => [p.id, p.name]));
    return (client.noms || []).map((n) => ({
      ...n,
      name: byId.get(n.target) || n.target,
      by: byId.get(n.nominator) || n.nominator,
    }));
  }

  function iCanAct(players, me) {
    return (players || []).some((p) => p.id === me.playerId && p.alive !== false);
  }

  /* ==========================================================================================
   * 🔢 WHICH SAM — the seat number and the player's own accent, on every row you can tap.
   *
   * Duplicate names are legal and John wants them to stay legal. But a pick list with two
   * identical buttons is not a deduction problem, it is a coin flip: a play critic ran a night
   * with two Sams and could not tell which one she had named, which one was on trial, or which
   * one the room had executed. The seat and the accent are already on the lobby snapshot and
   * already on the robot in the ballroom — this is the identity the room can SEE, next to the
   * name it cannot.
   * ========================================================================================== */
  function seatChip(c, id) {
    const seat = (c?.lobby?.seats || []).find((s) => s.playerId === id);
    if (!seat || seat.seat == null) return '';
    const look = cleanLook(seat) || DEFAULT_LOOK;
    return `<span class="seat-chip" style="background:${esc(look.accent)}">${esc(String(seat.seat + 1))}</span>`;
  }

  /* ==========================================================================================
   * 🩸 **THE STANDING BOARD — WHO HAS BEEN NAMED, BY WHOM, AND WHETHER IT IS YOU.**
   *
   * MEASURED FIRST (`harness/phone-accusation.mjs`, 2026-08-28, eight phones, two nominations
   * standing and confirmed on the television). What the phones said before this existed:
   *
   *   TV `.nom-board`      "1 Sam NAMED BY JOHN 3 · 2 Bo NAMED BY ELLIE 5", 2 seat chips
   *   nominator (John)     "You have nominated. Watch the TV."   0 names · 0 chips · 0 receipts
   *   nominee   (Sam, 3)   "Standing: Sam, Bo"                   0 chips  — byte-identical to
   *   bystander (Alex, 7)  "Standing: Sam, Bo"                   0 chips    the bystander's copy
   *
   * Three separate holes, and the middle one is the product one:
   *
   * 1. **`Standing: Sam` NAMES NOBODY IN A ROOM WITH TWO SAMS.** Duplicate names are a locked
   *    rule, and the seat chip is the whole answer to it — it is already on every tappable row,
   *    the vote list, the vote receipt and the TV's own board. It was on the one line that says
   *    who is on the block. Alexandria's sheet offered her `4 Sam` to tap while telling her
   *    `Sam` was standing, and those are two different people.
   * 2. **THE PERSON WHO WAS JUST NAMED IS NOT TOLD.** Sam's sheet and the bystander's sheet
   *    carried the same sentence. The television announces the accusation, her robot wears a red
   *    tag, and the thing in her hand said nothing — so the one player who has to answer it is
   *    the one player reading it off someone else's screen.
   * 3. **THE NOMINATOR HAD NO RECEIPT, AND THE PLACEHOLDER COULD LIE.** Every other beat gives
   *    one: the Vote's is `The room recorded · [3] Sam` and `loop-ui-play` S1 gates it. The
   *    Reckoning's was `You have nominated. Watch the TV.` — no name, no seat, and driven by the
   *    OPTIMISTIC local `state.nominated` rather than by the server's fanout. That is not
   *    theoretical: a run of the harness above drove a Reckoning the server had not entered, it
   *    refused all eight nominations with `not reckoning`, and every phone still read
   *    "You have nominated." over an empty ballot. Same bug the vote receipt's own header was
   *    written about; same fix, which is to quote `c.noms` and never `state.nominated`.
   *
   * 🚨 **THE ONLY TWO FIELDS TOUCHED ARE `nominator` AND `target`, AND BOTH ARE ALREADY PUBLIC.**
   * `FANOUT_KEYS.nomRow` (`net/party/local.mjs`) and `CUE_NOM_KEYS` (`src/party/follow.js`) are
   * both exactly `['nominator','target']`, the television has printed both since #34, and
   * `standingNames()` below has computed `by` all along and thrown it away. Names, seats and
   * accents are `players[].name` / the lobby seat list, every one of them an `all` row in
   * `net/party/entitle.js`. **No new field crosses any wire for this** — if a future line here
   * wants one that has no matrix row, that is a design decision and `party-isolation` I1c is
   * the thing that will say so out loud.
   *
   * Rendered entirely in CSS that already exists (`night-skin.js` owns the sheet, not this
   * file): `.pick-list button.locked-out` is the dashed, un-tappable row the cast list already
   * uses for a blocked pick, `.self-pick` is its gold "this one is you" inset, and `.receipt` /
   * `.receipt.coerced` are the green and red receipt the ballot already speaks in. Nothing here
   * animates or holds state across a repaint — `paint()` rebuilds `root.innerHTML` on every
   * socket message and anything stateful would strobe.
   * ========================================================================================== */

  /** One standing nomination as a row: WHO is on the block, and WHO put them there. */
  function standingRow(n, me, c) {
    const mine = n.target === me.playerId;
    const byMe = n.nominator === me.playerId;
    return `<button type="button" class="locked-out${mine ? ' self-pick' : ''}" disabled
        aria-disabled="true" data-standing="${esc(n.target)}">
      ${seatChip(c, n.target)}
      <span style="min-width:0">
        <span style="display:block">${esc(n.name)}${mine ? ' · YOU' : ''}</span>
        <span class="hint" style="display:flex;align-items:center;gap:7px;margin-top:4px">
          named by ${seatChip(c, n.nominator)}<span>${esc(n.by)}${byMe ? ' · you' : ''}</span>
        </span>
      </span>
    </button>`;
  }

  /** The board every phone sees, plus the red plate the named player sees and nobody else does. */
  function standingBoard(standing, me, c) {
    if (!standing.length) return '';
    const onMe = standing.find((n) => n.target === me.playerId);
    let html = '';
    if (onMe) {
      html += `<div class="receipt coerced">
        <div class="receipt-k">You have been named by</div>
        <div class="receipt-v">${seatChip(c, onMe.nominator)}<span>${esc(onMe.by)}</span></div>
        <p class="hint">You are standing. The room votes next.</p>
      </div>`;
    }
    html += `<p class="hint">Standing — ${standing.length === 1 ? 'one name' : `${standing.length} names`}, and who said them</p>
      <div class="pick-list">${standing.map((n) => standingRow(n, me, c)).join('')}</div>`;
    return html;
  }

  /* ==========================================================================================
   * 🔨 **THE TAP THAT DID NOT LAND — and why this is a plate rather than a whole new mechanic.**
   *
   * `net/party/local.mjs`'s `t:'nominate'` handler computed `applyNominate`'s answer and threw it
   * away, so a refused nomination said NOTHING to the handset that made it. The visible symptom
   * was not silence, which would at least look like nothing had happened: `state.nominated` was
   * already true from the thumb, `c.noms` never named this phone, so the `already` branch below
   * printed **`Sending your nomination…` for the rest of the beat** over a server that had
   * finished with the message. A dead handset and a refusal look identical from the sofa.
   *
   * 🚨 **EVERY REFUSAL THIS SCREEN CAN ACTUALLY MEET IS A RACE, AND THAT IS THE PRODUCT CASE.**
   * The pick list already prevents each rule locally — it filters out yourself, the dead, anyone
   * already standing, and it hides itself once your own nomination is on the board. So the only
   * taps that reach a refusal are the ones where the sheet was RIGHT when the player looked at it
   * and STALE by the time the thumb landed: two handsets naming the same person in the same
   * second, or the Reckoning clock expiring in flight. Those are exactly the moments a player
   * cannot reconstruct from the television, because the board simply shows somebody else's
   * nomination where they expected their own.
   *
   * ⚠️ **THE TABLE COVERS REASONS THIS SHEET CANNOT REACH, ON PURPOSE.** `no self-nomination` and
   * a dead NOMINATOR's `not living` are prevented by the list above and by "The dead do not
   * nominate"; `standing-nomination cap reached` is unreachable from a live wire at all, because
   * `reckoningClosed` ends the beat on the third standing name before a fourth can be refused
   * (`nom-receipt` NR8 proves it rather than asserting it). They are here so that the sheet
   * cannot go blank, and for the same reason the `default` prints the server's own string
   * verbatim: the failure being fixed is a player told nothing, and a reason nobody predicted
   * must not reproduce it.
   *
   * 🚨 **THE ONE PIECE OF INTERPRETATION IS DONE HERE, FROM PUBLIC STATE, NOT BY THE SERVER.**
   * `already nominated this episode` is TWO different refusals wearing one string — `canNominate`
   * means *you have spent yours*, `canBeNominated` means *they are already on the block* — and
   * telling a player the wrong one is worse than telling them nothing. The disambiguation reads
   * `c.noms`, the public standing board this phone already holds, and nothing else. The server
   * does not author it: a receipt reports what the server DID, and what it meant for this player
   * is a question only this player's screen has the context to answer (`CLAUDE.md`, 2026-08-28).
   *
   * Rendered in CSS that already exists — `.receipt.coerced` is the red plate the vote receipt
   * and the "you have been named" plate already speak in — and it holds no state across a
   * repaint: `state.nomOk` is written by an incoming frame and by nothing else, which is the
   * exact distinction the old lying receipt got wrong.
   * ========================================================================================== */
  function nomRefusalLine(refused, standing, target, alive) {
    switch (refused.why) {
      case 'not reckoning':
        return 'The Reckoning had closed before your tap arrived.';
      case 'debrief is still talk':
        return 'Not yet — the Debrief is still talk. Naming opens at the end of it.';
      case 'already nominated this episode':
        return standing.some((n) => n.target === target)
          ? 'Somebody named them first. Their nomination stands, not yours — name someone else.'
          : 'You have already named someone this episode. One nomination each.';
      case 'standing-nomination cap reached':
        return 'The block is full — three names already stand.';
      case 'no self-nomination':
        return 'You cannot name yourself.';
      /*
       * ⚠️ `not living` IS ALSO TWO REFUSALS IN ONE STRING — `canNominate` means *you* are not
       * in the show, `canBeNominated` means *they* are not. The nominator half is very nearly
       * unreachable here, because a dead player never gets this far: `iCanAct` has already
       * printed "The dead do not nominate" and returned. So the target reading is the default,
       * and the other is chosen only when the public board says the target IS alive — which
       * leaves the server's living list as the only thing that can have disagreed.
       */
      case 'not living':
        return alive === true
          ? 'The room does not count you among the living, so it took no nomination from you.'
          : 'They are not in the show — the room will not put a name on them.';
      default:
        return refused.why || 'The room did not take it.';
    }
  }

  /** The red plate a refused nominator gets, and nobody else — `state.nomOk` is theirs alone. */
  function nomRefusalHtml(me, c, standing) {
    const refused = state.nomOk;
    if (!refused || refused.ok) return '';
    // A nomination of mine that STANDS supersedes anything the server said about an earlier tap.
    if (standing.some((n) => n.nominator === me.playerId)) return '';
    const all = mergePublicNames(c.frame?.players, c.lobby);
    const row = all.find((p) => p.id === refused.target) || null;
    const line = nomRefusalLine(refused, standing, refused.target, row?.alive);
    // Duplicate names are legal, so the seat travels with the name — same rule as every other
    // row on this sheet. With no resolvable player the plate carries the reason alone.
    const who = row
      ? `<div class="receipt-v">${seatChip(c, refused.target)}<span>${esc(row.name)}</span></div>`
      : '';
    return `<div class="receipt coerced" data-nom-refused="${esc(refused.why || 'refused')}">
      <div class="receipt-k">The room did not record that</div>
      ${who}
      <p class="hint">${esc(line)}</p>
    </div>`;
  }

  function paintNominate(players, me, c, opts = {}) {
    const late = !!opts.late;
    const standing = standingNames(players, c);
    /*
     * ⚠️ **THE RECEIPT IS THE SERVER'S ROW; THE HIDE IS THE LOCAL FLAG.** `state.nominated` is
     * set the instant the thumb lands so a second tap cannot double-send — that is a debounce
     * and it stays. It is NOT evidence that anything was recorded, so it never gets to write a
     * name onto this sheet. See the header, and the vote receipt's.
     */
    const mine = standing.find((n) => n.nominator === me.playerId);
    const already = !!mine || state.nominated;
    const targets = (players || []).filter((p) => p.id !== me.playerId && p.alive !== false
      && !standing.some((n) => n.target === p.id));
    /* The lead is an instruction, so it is printed only when there is something to tap. It used
     * to be unconditional and sat directly above "You have nominated" — the sheet telling you to
     * do the thing it had just told you you had already done. */
    const canTap = iCanAct(players, me) && !already && targets.length > 0;
    let html = late
      ? (canTap ? `<p class="hint">Talk's ending — name someone</p>` : '')
      : `<h1>Reckoning.</h1>${phoneClock(c)}${canTap ? '<p class="hint">Tap who you name</p>' : ''}`;
    html += standingBoard(standing, me, c);
    if (c.tally?.need && c.tally?.living) {
      html += `<p class="hint" data-clears>${esc(clearsLine({ need: c.tally.need, living: c.tally.living }))}</p>`;
    }
    if (!iCanAct(players, me)) {
      html += `<p class="hint">The dead do not nominate.</p>`;
      return html;
    }
    // Below the board, above the buttons — where the eye goes next after a tap that vanished.
    // A refusal has already cleared the local debounce, so the pick list underneath is live again.
    html += nomRefusalHtml(me, c, standing);
    if (already) {
      html += mine
        ? `<div class="receipt">
            <div class="receipt-k">The room recorded your nomination</div>
            <div class="receipt-v">${seatChip(c, mine.target)}<span>${esc(mine.name)}</span></div>
            <p class="hint">Your nomination is your vote. You do not vote again.</p>
          </div>`
        : `<p class="hint">Sending your nomination…</p>`;
      return html;
    }
    if (!targets.length) {
      html += `<p class="hint">Nobody left to name — the cap or the list is spent.</p>`;
      return html;
    }
    html += `<p class="hint">First tap stands. No self-nom.</p>
      <div class="pick-list jackbox buzz">${targets.map((p) =>
        `<button type="button" data-nom="${esc(p.id)}">${seatChip(c, p.id)}<span>${esc(p.name)}</span></button>`).join('')}</div>`;
    return html;
  }

  function paintLynchVote(players, me, c) {
    // John (2026-08-24): you shouldn't be able to vote for yourself after being nominated.
    const standing = standingNames(players, c).filter((n) => n.target !== me.playerId);
    let html = `<h1>Vote.</h1>${phoneClock(c)}`;
    if (c.tally?.need && c.tally?.living) {
      html += `<p class="hint" data-clears>${esc(clearsLine({ need: c.tally.need, living: c.tally.living }))}</p>`;
    }
    if (c.lynchResult) {
      html += `<p class="hint">${c.lynchResult.executed ? 'The vote is in.' : 'Nobody cleared.'}</p>`;
      return html;
    }
    if (!iCanAct(players, me)) {
      html += `<p class="hint">The dead do not vote.</p>`;
      return html;
    }
    if (state.voted) {
      /*
       * ⚠️ **SAY WHAT THE SERVER RECORDED, NOT WHAT WAS TAPPED.** "Ballot in" was optimistic
       * local state — a dropped message showed a confirmed ballot while the server held nothing
       * — and it never named the choice, so nobody could see what they had voted for. It also
       * hid the self-vote coercion completely: a play critic's phone was byte-identical before
       * and after the server quietly turned her self-pick into NO ONE.
       */
      const b = c.myBallot;
      if (!b) {
        html += `<p class="hint">Sending your ballot…</p>`;
      } else {
        const name = b.choice === NO_ONE ? 'NO ONE' : playerName(players, b.choice);
        const tapped = standingNames(players, c).find((n) => n.target === b.choice);
        const chip = b.choice === NO_ONE ? '' : seatChip(c, b.choice);
        html += `<div class="receipt${b.why ? ' coerced' : ''}">
          <div class="receipt-k">The room recorded</div>
          <div class="receipt-v">${chip}<span>${esc(tapped?.name || name)}</span></div>
          ${b.why ? `<p class="hint">${esc(b.why)}</p>` : ''}
        </div>
        <p class="hint">Non-voters count as NO ONE.</p>`;
      }
      return html;
    }
    const myNom = standingNames(players, c).find((n) => n.nominator === me.playerId);
    if (myNom) {
      html += `<p class="hint">Your nomination of ${esc(myNom.name)} is your vote — locked. You do not vote again.</p>`;
      return html;
    }
    /*
     * ⚠️ **THE COPY HAS TO MATCH THE BUTTONS THAT ARE ACTUALLY THERE.**
     *
     * "Pick one standing nominee, or NO ONE" was printed to everybody — including the person
     * ON TRIAL, whose only button is NO ONE because you cannot vote for yourself, and including
     * a table where nobody was nominated at all, where the only button is also NO ONE. A play
     * critic photographed both: the one player who most needs to understand her ballot was told
     * to pick from a list she does not have.
     */
    const others = standing.filter((n) => n.target !== me.playerId);
    const onTrial = standing.some((n) => n.target === me.playerId);
    const lead = !others.length
      ? (onTrial
        ? 'You are the one on trial. You cannot vote for yourself, so NO ONE is your only ballot.'
        : 'Nobody was named. NO ONE is the only ballot.')
      : `Pick one standing nominee, or NO ONE.${onTrial ? ' You are on trial — you cannot vote for yourself.' : ''}`;
    html += `<p class="hint">${lead}</p>
      <div class="pick-list jackbox">
        ${others.map((n) => `<button type="button" data-lynch="${esc(n.target)}">${seatChip(c, n.target)}<span>${esc(n.name)}</span></button>`).join('')}
        <button type="button" data-lynch="${NO_ONE}"><span>NO ONE</span></button>
      </div>`;
    return html;
  }

  function paintExecution(players, c) {
    const r = c.lynchResult;
    let html = `<h1>Execution.</h1>${phoneClock(c)}`;
    if (!r || !r.executed) {
      html += `<p class="hint">Nobody cleared. Nameplates stay up. Casting is next.</p>`;
      return html;
    }
    const who = playerName(players, r.executed);
    html += `<p class="hint">${esc(who)} is out. The nameplate is face-down. Nothing about alignment.</p>`;
    return html;
  }

  /* ===========================================================================================
   * ⚖️ **THE PHONE DOES ALMOST NOTHING FOR FIFTEEN SECONDS, AND THAT IS THE POINT.**
   *
   * The Verdict is the Showrunner's announcement on the TELEVISION. A pad that competed with it
   * would split the room's attention at the one moment the night is being summarised — the same
   * argument that took WORD FROM THE HOUSE off the runner's sheet. So: the status, the one line
   * that says what happens next, whether this seat is still in the show, and nothing to press.
   *
   * 🚨 **NO ALIGNMENT, NO ROLE, NO FEED COUNT.** `alive` is already public (it is on every frame
   * and the TV shows the nameplate go down), so saying it here leaks nothing. Everything else
   * about what a player WAS is the Reunion's, and a sheet that said it a beat early would undo
   * the beat the whole design is borrowing against.
   * =========================================================================================== */
  function paintVerdict(me, c) {
    const v = c.verdict;
    const status = v?.status || '…';
    const line = v ? outcomeLine(v.status) : 'The Showrunner is deciding.';
    const cams = v ? `${v.camerasLit}${v.need == null ? '' : ` of ${v.need}`} cameras lit.` : '';
    let html = `<h1>${esc(status)}</h1>${phoneClock(c)}
      <p class="hint">${esc(line)}${cams ? ` ${esc(cams)}` : ''}</p>`;
    if (me && me.alive === false) {
      html += `<p class="hint">You are out of the show. Your nameplate is face-down — and nobody
        has been told what you were. You can still talk.</p>`;
    }
    html += `<p class="hint">Eyes on the TV. Nothing to press.</p>`;
    return html;
  }

  /* ===========================================================================================
   * 🎬 **THE ONE MOMENT THE ROLE CARD IS ALLOWED TO BE FACE-UP.**
   *
   * All night the card is hold-to-reveal and blurred at rest, so a neighbour's glance at an
   * unattended phone learns nothing. At the Reunion that rule expires: the TV is turning over
   * every nameplate anyway. This is the personal half of the roll call — the TV says what you
   * were, this says what it cost you.
   *
   * 🚨 **IT DRAWS `c.reveal` OR IT DRAWS NOTHING — never `role.card`.** The card this view has
   * held all game carries the player's COVER, not their truth: the Glitched believes they are the
   * Camera Op, and a Reunion sheet that read the card would tell them the lie one last time, on
   * the one screen whose entire job is the truth. `reunion.js` names the cover separately, as
   * `believedTheyWere`, and that distinction is what `reunion-truth` U2 caught once already.
   *
   * ⚠️ **NULL IS DRAWN AS NULL.** If the payload has not arrived this points at the television and
   * names nobody. A defaulted empty shape is how a reveal renders a beat before the beat.
   * =========================================================================================== */
  function paintReunion(me, c) {
    const status = c.season || c.verdict?.status || 'THE SEASON IS OVER';
    let html = `<h1>${esc(status)}</h1>
      <p class="hint">${esc(outcomeLine(c.season || c.verdict?.status))}</p>`;
    /*
     * 🍖 **THE SEASON'S LEDGER, ABOVE THE PERSONAL CARD AND OUTSIDE THE `mine` GUARD.**
     *
     * The feed count is a ROOM fact, not a seat fact: it is the number the Verdict withheld all
     * season because *"evil losing a partner looks exactly like evil winning"*, and the Reunion is
     * where the room finally gets to tell those two apart. So it prints for a pad that has no seat
     * in the reveal too — a spectator, a phone that joined late, a handset whose player was never
     * dealt in. COUCH-PLAN Rung 4 is explicit that the payday reaches EVERY living pad; a room
     * fact hidden behind "did I get a card" would repeat exactly the ghosting the rung is named
     * for. Gate: `room-ghosts` RG3c.
     *
     * Cameras ride beside it because the Verdict aired that number every episode and never this
     * one, and side by side is the first time the scoreboard has had both halves.
     */
    if (c.reveal?.feed) {
      const f = c.reveal.feed;
      const bar = (n, of) => (of == null ? String(n) : `${n} of ${of}`);
      html += `<p class="hint reunion-ledger">The house ledger, unsealed:
        <b>${esc(bar(f.fed, f.feedTarget))}</b> fed to the Hunter ·
        <b>${esc(bar(f.camerasLit, f.cameraTarget))}</b> cameras lit.</p>`;
    }
    const mine = (c.reveal?.seats || []).find((s) => s.id === me?.playerId);
    if (!mine) {
      html += `<p class="hint">The Reunion is on the TV: the roll call, then the awards. Every
        nameplate gets turned over.</p>`;
      return html;
    }
    /*
     * The same `.role-card` the deal drew, with no hold-to-reveal over it. Reusing the class is
     * the point: the card the player has been protecting all night is the card that goes face-up,
     * and a second look for the same object would read as a different thing.
     */
    html += `<div class="role-card reunion-card">
      <div class="rule">Your card · face up at last</div>
      <div class="role">${esc(mine.role)}</div>
      <div class="side">${esc(mine.alignment === 'evil' ? 'Production' : 'The cast')}</div>
    </div>`;
    if (mine.believedTheyWere && mine.believedTheyWere !== mine.role) {
      html += `<p class="hint">You spent the whole night believing you were the
        ${esc(mine.believedTheyWere)}. Nobody was going to tell you.</p>`;
    }
    if (mine.finalClaim) html += `<p class="hint">What you told them: “${esc(mine.finalClaim)}”</p>`;
    html += `<p class="hint">${mine.death
      ? `You were ${mine.death.by === 'EXECUTED' ? 'executed' : 'taken'}.`
      : 'You made it to the end.'}</p>`;
    const won = (c.reveal?.awards || []).filter((a) => a.winner === me?.playerId);
    for (const a of won) {
      html += `<p class="hint"><b>${esc(a.award)}</b> — ${esc(a.why)}</p>`;
    }
    return html;
  }

  /**
   * ✋ READY — "I have said my piece." A majority of the living ends the talk beat.
   *
   * The count is shown, the NAMES are not, and the server does not send them (`FANOUT_KEYS.ready`
   * is `count` and `need`). Who wants the conversation over is a live read on the room in the one
   * beat where reading the room is the whole game.
   *
   * It is a TOGGLE. Someone who taps and then thinks of one more thing can take it back, and
   * dropping below the majority disarms the countdown on the server.
   */
  /*
   * 🚨 **READY IS DOCKED TO THE BOTTOM OF THE SCREEN, NOT TO THE BOTTOM OF THE CONTENT.**
   *
   * With eight players the Reckoning sheet lays out about 1052px of content in an 844px window,
   * which put the READY button at roughly y=872 — below the fold, on the beat where a majority
   * of READY is the ONLY way to end the beat early. A play critic measured it: reachable by
   * scrolling, and nobody scrolls while eight people are shouting at each other. The bigger the
   * table, the further off-screen the control that shortens the beat, which is exactly backwards.
   *
   * `position:sticky` rather than a layout rewrite: the sheet keeps scrolling as it always has,
   * the dock rides the bottom edge of the viewport, and it lands in the bottom third of the phone
   * where the thumb already is. It has to be the LAST thing `paint()` appends to the body or it
   * will sit over whatever follows it — see the call sites in the talk beats.
   */
  function readyHtml(c) {
    const n = c?.ready || { count: 0, need: 0 };
    if (!n.need) return '';
    const mine = !!state.ready;
    const left = Math.max(0, n.need - n.count);
    const pct = Math.min(100, Math.round((Math.min(n.count, n.need) / Math.max(1, n.need)) * 100));
    return `<div class="ready-dock">
      <div class="ready-meter"><div class="ready-fill${left ? '' : ' met'}" style="width:${pct}%"></div></div>
      <button class="btn wide ready${mine ? ' on' : ''}" id="ready" type="button">
        ${mine ? 'READY ✓' : 'READY'}
      </button>
      <p class="hint" data-ready-line>${Math.min(n.count, n.need)} of ${n.need} ready${left ? ` · ${left} more ends it` : ' · ending…'}</p>
    </div>`;
  }

  /* ==========================================================================================
   * 🍮 THE PAIR SHEET — reach out, become JELLIE, and type where only one other person can read.
   *
   * The whole design in one line: **the room sees that it happened, and never what was said.**
   * The request and the merged name go on the television; the words come to this sheet and stop
   * here. That is what makes it a social deception mechanic instead of a chat window — crossing
   * the room to whisper is a move everybody watches you make.
   *
   * ⚠️ **THE WHISPER LOG IS NEVER REBUILT BY `paint()`.** `root.innerHTML` is rewritten on every
   * socket message, and a message list inside it would lose scroll position and blow away a
   * half-typed line several times a second — the same reason the role card is mounted outside
   * `root`. `state.whispers` holds the history and `paintWhispers` writes the ONE element in
   * place; `paint()` re-emits the shell around it and the text field's value is restored from
   * `state.draft` on every rebuild.
   * ========================================================================================== */

  function linkPairMine(c) {
    const me = meId();
    return (c?.links?.pairs || []).find((p) => p.a === me || p.b === me) || null;
  }
  function linkIncoming(c) {
    const me = meId();
    return (c?.links?.pending || []).filter((r) => r.to === me);
  }
  function linkOutgoing(c) {
    const me = meId();
    return (c?.links?.pending || []).find((r) => r.from === me) || null;
  }

  function linkHtml(c, players) {
    const me = meId();
    const myName = playerName(players, me);
    const mine = linkPairMine(c);
    if (mine) {
      const other = mine.a === me ? mine.b : mine.a;
      /*
       * ⏱️ The countdown is not decoration. A pair now expires on `PAIR_MS` so the room's two
       * slots rotate instead of being held for the whole Debrief — and a conversation that
       * vanished mid-sentence with no warning would read as a crash rather than as a rule.
       */
      const iAmDone = isDone(mine, me);
      const theyAreDone = isDone(mine, other);
      const left = pairRemaining(mine, Date.now());
      const secs = left == null ? null : Math.ceil(left / 1000);
      return `<div class="pairbox on">
          <div class="pair-head">
            <div class="pair-name">${esc(mine.name)}</div>
            ${secs == null ? '' : `<div class="pair-clock${secs <= 15 ? ' low' : ''}" data-pair-clock>${secs}s</div>`}
          </div>
          <p class="hint">You and ${esc(playerName(players, other))}. The room can see you paired.
            It cannot read this.</p>
          <div class="whispers" data-whispers>${whisperListHtml()}</div>
          <input class="field" id="whisper" maxlength="${WHISPER_MAX}" placeholder="Say it quietly…"
            autocomplete="off" value="${esc(state.draft || '')}">
          <p class="hint charcount" data-charcount>${Math.max(0, WHISPER_MAX - (state.draft || '').length)} left</p>
          <button class="btn wide" id="whisper-send" type="button">Send</button>
          <!--
            DONE is the way out that costs nobody anything. Disconnect is "I am walking out on
            you" and spends the leaver's turn, so it was never used, so a pair that finished in
            twenty seconds sat on one of the room's two slots for the other seventy.
            It takes BOTH thumbs: one tap alone would be a politer Disconnect with none of its
            cost, and a partner mid-sentence would be cut off by someone who got bored.
            NO BACKTICKS IN HERE — this comment is inside a template literal and one ends it.
          -->
          <button class="btn wide done${iAmDone ? ' on' : ''}" id="finish" type="button">
            ${iAmDone ? 'Waiting for them…' : (theyAreDone ? 'They are done · finish' : 'Done')}
          </button>
          <!--
            ⚠️ DISCONNECT IS A ONE-WAY DOOR AND IT USED TO BE UNLABELLED, DIRECTLY UNDER THE BIG
            ORANGE SEND. A play critic hit it and only then discovered every name had gone grey:
            leaving spends your conversation for the whole beat. One fat thumb away from SEND,
            with no warning, on an action that cannot be undone. So it says what it costs, and it
            is pushed down and away from the send button.
          -->
          <button class="btn ghost wide danger" id="unlink" type="button">Disconnect · ends your turn</button>
        </div>`;
    }

    const incoming = linkIncoming(c);
    if (incoming.length) {
      /*
       * ⚠️ **SHOW THE MERGED NAME BEFORE THEY AGREE TO WEAR IT.** The seam is the requester's
       * onset plus the target's tail, and the requester controls their own name and picks the
       * target — so a merge can be STEERED at somebody. An adversarial playtester demonstrated
       * `merge('Da','Ike')`. `MERGE_BLOCK` catches the obvious ones and cannot catch a clever
       * one. The prompt used to show only who was asking; the plate then landed over BOTH heads
       * on the television, and leaving now costs the victim their turn for the beat.
       *
       * Consent to the NAME, not just the person. `mergeName` is pure and deterministic, so the
       * phone can show exactly what the server will produce.
       */
      return `<div class="pairbox ask">${incoming.map((r) => `
        <p class="hint"><strong>${esc(playerName(players, r.from))}</strong> reached out to you.</p>
        <p class="hint">You would become <strong>${esc(mergeName(playerName(players, r.from), myName))}</strong> on the TV.</p>
        <div class="pair-actions">
          <button class="btn" data-accept="${esc(r.from)}" type="button">Connect</button>
          <button class="btn ghost" data-decline="${esc(r.from)}" type="button">No</button>
        </div>`).join('')}</div>`;
    }

    const out = linkOutgoing(c);
    if (out) {
      return `<div class="pairbox wait">
        <p class="hint">Waiting on ${esc(playerName(players, out.to))}…</p>
        <button class="btn ghost wide" id="unlink" type="button">Never mind</button>
      </div>`;
    }

    /*
     * ⚠️ **JOINED HUMANS, NOT EIGHT CHAIRS.** The first version listed `players`, which is the
     * merged state frame — so a three-player table was offered ROBOT 4 through ROBOT 8, five
     * empty seats nobody is sitting in. `nominationPlayers` is the existing answer to exactly
     * this question and `party-night` N1a7 already guards it for the nominate sheet; reusing it
     * means there is ONE definition of "people you can actually pick", not two that drift.
     */
    const seated = nominationPlayers(c?.frame?.players, c?.lobby);
    const others = seated.filter((p) => p.id !== me && p.alive !== false);
    if (!others.length) return '';

    /*
     * ⚠️ **ASK `linkBlock`, DO NOT RE-DERIVE THE RULES HERE.** The first version greyed out only
     * people currently in a pair, so once Disconnect-ends-your-turn shipped the sheet still
     * offered live buttons to a player who had spent their conversation — a tap the server
     * silently refused. Found by playing it, not by any gate. `castRowBlock` learned this exact
     * lesson for the casting padlock: a tap that does nothing reads as a broken phone, and the
     * fix is to NAME the state rather than hide it. One definition of the rules, in `link.js`,
     * consulted by both ends.
     */
    const L = c?.links || { pending: [], pairs: [], used: [] };
    const living = seated.map((p) => p.id);
    const MARK = { busy: ' · busy', spent: ' · your turn is done', theirs: ' · they have talked',
      already: ' · asked', outgoing: ' · waiting', crowded: ' · room is full' };
    const spentMe = why(L, me, others[0]?.id, living, c?.beat) === 'spent';
    const crowdedNow = (L.pairs || []).length >= MAX_PAIRS;

    return `<div class="pairbox">
      <p class="hint">${esc(state.linkNote
        || (spentMe
          ? 'You have had your conversation this round. Talk out loud like everyone else.'
          : crowdedNow
            ? 'Two conversations are already going. Wait for one to end.'
            : 'Reach out to one person. The room sees who — not what.'))}</p>
      <div class="picks">${others.map((p) => {
    const block = why(L, me, p.id, living, c?.beat);
    /*
     * 🔢 **WHICH SAM — AND THIS IS THE LIST WHERE IT MATTERS MOST.**
     *
     * Every other tappable or aired list already carries the seat chip: `paintNominate`,
     * `paintLynchVote`, the vote receipt, the TV's nominee board, the casting lamps. This one
     * did not, and it is the list where you pick who to have a PRIVATE conversation with — so
     * on a table with two players called Sam it offered two identical buttons and no way to
     * tell which one you were about to open a channel to. Photographed at N=8 in
     * `progress/r5/05-phone-debrief.png`; duplicate names are a locked rule, not an accident.
     *
     * ⚠️ `party-warm` W35e could not catch this: it asserts three `seatChip(` CALL SITES exist
     * in the source, and all three did. A fourth list that never called it was invisible to a
     * source grep. `loop-ui-play` L1 counts rendered chips against tappable rows instead.
     */
    return `<button type="button" data-link="${esc(p.id)}" ${block ? 'disabled aria-disabled="true"' : ''}>
          ${seatChip(c, p.id)}<span>${esc(p.name || p.id)}${MARK[block] || ''}</span>
        </button>`;
  }).join('')}</div>
    </div>`;
  }

  /** One question — "may I reach out to them?" — answered by `link.js` and nowhere else. */
  function why(L, from, to, living, beat) {
    if (!to) return null;
    return linkBlock(L, from, to, { living, beat });
  }

  /*
   * 🔒 THE PRIVATE HALF OF THE SPLIT, and the list itself now lives in `link.js` beside the
   * public half. It used to be built inline here, which meant the one screen that is SUPPOSED to
   * carry the words could only be quoted from a browser — so "the partner pad shows the words"
   * was a claim about a template literal no node gate could execute. `whisperLines` is pure, both
   * ends call it, and `harness/whisper-split.mjs` renders this exact element from real socket
   * bytes. Escaping stays here, where the HTML is.
   */
  function whisperListHtml() {
    return whisperLines(state.whispers, meId()).map((w) =>
      `<p class="whisper${w.mine ? ' me' : ''}">${esc(w.text)}</p>`).join('');
  }

  /** In place, never through `paint()`. See the block header. */
  function paintWhispers() {
    const el = root.querySelector('[data-whispers]');
    if (!el) return;
    el.innerHTML = whisperListHtml();
    el.scrollTop = el.scrollHeight;
  }

  function bindLink(c, players) {
    for (const b of root.querySelectorAll('[data-link]')) {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        state.linkNote = '';
        c.send({ t: 'link', to: b.dataset.link });
        padFx('Reaching out…', '', [0, 25]);
      });
    }
    for (const b of root.querySelectorAll('[data-accept]')) {
      b.addEventListener('click', () => {
        c.send({ t: 'link', accept: b.dataset.accept });
        padFx('Connected.', 'smash', [0, 40, 60, 40]);
      });
    }
    for (const b of root.querySelectorAll('[data-decline]')) {
      b.addEventListener('click', () => c.send({ t: 'link', decline: b.dataset.decline }));
    }
    root.querySelector('#finish')?.addEventListener('click', () => {
      const mine = linkPairMine(c);
      const now = !isDone(mine, meId());
      c.send({ t: 'finish', on: now });
      padFx(now ? 'Done.' : 'Still talking.', '', now ? [0, 30] : 0);
    });
    root.querySelector('#unlink')?.addEventListener('click', () => {
      state.whispers = [];
      state.draft = '';
      c.send({ t: 'unlink' });
    });

    const field = root.querySelector('#whisper');
    const send = () => {
      const v = (field?.value || '').trim();
      if (!v) return;
      c.send({ t: 'whisper', text: v });
      field.value = '';
      state.draft = '';
      // ⚠️ RESET THE COUNTER TOO. It read '124 left' over an empty field after every send,
      // because send() cleared the value and left the label alone.
      const cc = root.querySelector('[data-charcount]');
      if (cc) cc.textContent = WHISPER_MAX + ' left';
    };
    // Keep the half-typed line across the repaints that every socket message causes.
    field?.addEventListener('input', () => {
      state.draft = field.value;
      /*
       * ⚠️ A SILENT TRUNCATION ON THE ONE CHANNEL BUILT FOR A CAREFUL ACCUSATION. A play critic
       * sent 410 characters; the partner received 139, cut mid-word, with no ellipsis and no
       * warning to either side.  now stops it at the wire limit and this says how
       * much room is left. Written IN PLACE — a repaint here would drop the keyboard.
       */
      const el = root.querySelector('[data-charcount]');
      // Clamped:  stops a THUMB at the limit but not a scripted value, and a
      // counter reading "-60 left" is worse than no counter.
      if (el) el.textContent = Math.max(0, WHISPER_MAX - field.value.length) + ' left';
    });
    field?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    root.querySelector('#whisper-send')?.addEventListener('click', send);
    if (field && state.focusWhisper) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
  }

  function bindReady(c) {
    root.querySelector('#ready')?.addEventListener('click', () => {
      state.ready = !state.ready;
      padFx(state.ready ? 'Ready.' : 'Still talking.', '', state.ready ? [0, 30] : 0);
      c.send({ t: 'ready', on: state.ready });
      paint();
    });
  }

  function bindNominate(c) {
    for (const b of root.querySelectorAll('[data-nom]')) {
      b.addEventListener('click', () => {
        if (state.nominated) return;
        state.nominated = true;
        padFx('Named.', 'smash', [0, 40, 50, 110]);
        c.send({ t: 'nominate', target: b.dataset.nom });
        paint();
      });
    }
  }

  function bindLynchVote(c) {
    for (const b of root.querySelectorAll('[data-lynch]')) {
      b.addEventListener('click', () => {
        if (state.voted) return;
        const choice = b.dataset.lynch;
        if (choice === meId()) return;
        const mine = (c.noms || []).find((n) => n.nominator === meId());
        if (mine) return;
        state.voted = true;
        padFx('Locked in.', '', [0, 35]);
        c.send({ t: 'lynchVote', choice });
        paint();
      });
    }
  }

  function meId() {
    return state.client?.welcome?.playerId || '';
  }

}

function bindCodeField(input) {
  if (!input) return;
  const apply = () => {
    const next = normalizeCodeDisplay(input.value);
    if (input.value === next) return;
    const start = input.selectionStart;
    input.value = next;
    try { input.setSelectionRange(start, start); } catch { /* ignore */ }
  };
  input.addEventListener('input', apply);
  input.addEventListener('paste', () => requestAnimationFrame(apply));
  apply();
}

function readLook() {
  try { return JSON.parse(localStorage.getItem('rrr.party.look') || ''); } catch { return null; }
}

function writeLook(look) {
  localStorage.setItem('rrr.party.look', JSON.stringify(look));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
