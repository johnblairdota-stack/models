/**
 * Phone — a controller (bible D13), not a first-person mansion.
 *
 * Join by code, claim a seat, reconnect by token. Hold the role card; vote; tap a pad.
 * The TV is the show. This screen never renders the house.
 */
import { PartyNightClient, defaultWsUrl, tokenKey, normalizeCodeDisplay, normalizeCodeWire } from '../party/night-client.js';
import { recapFromEvents } from '../party/recap.js';
import { injectNightSkin, markPartyReady, playerName } from '../party/night-skin.js';
import { ACCENTS, DEFAULT_LOOK, SHELLS, cleanLook, robotFaceSvg } from '../party/look.js';
import { applyCastLock, applyCastTap, ballotFromCast, castPrompt, freshCast, mergePublicNames, nominationPlayers, padlockSvg } from '../party/cast-ui.js';
import { cardFor, faceDownHtml, mountRoleCard, premiereHtml } from '../party/rolecard.js';
import { EVIL } from '../party/cast.js';
import { guideMapSvg } from '../party/guidemap.js';
import { MISSION_ROOM, pickPlanSeed, planRoomLabels, roomLabel } from '../party/mansion.js';
import { intelLine } from '../party/intel.js';
import { STICK_DEADZONE, warmLabel } from '../party/follow.js';

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
     * 🕹️ The pad's own state. `x`/`y` is the stick as a clamped unit vector; `sent` is the last
     * thing put on the wire, which is what makes the 20 Hz tick change-gated rather than a
     * metronome. See `startPad`.
     */
    pad: { x: 0, y: 0, run: false, swing: false, sent: '', timer: 0 },
    /**
     * 📳 The pad's answer to the last thing the thumb did. `label` is the word under the stick,
     * `kind` is the CSS modifier, `timer` wipes it. See `padFx`.
     */
    padFx: { label: '', kind: '', timer: 0 },
    /** The last `mission.*` this phone painted, so the BREAK can be told from the steady state. */
    missionSeen: null,
    /** How far along the TV's mansion bake is — fanned to every phone, not just the host. */
    warm: '',
    warmPct: 0,
    /** The deal is one moment. A reconnect replays the card; it does not re-deal it. */
    dealSeen: false,
    /** Dealt to, but the face picker still owns the screen. See `maybeRunDeal`. */
    dealPending: false,
    lastBeat: null,
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
        if (m.t === 'event' && m.ev?.type === 'role.card') dealt(!!m.replay);
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
    const face = root.querySelector('.bot-face');
    if (face) {
      const node = face.querySelector(part === 'shell' ? '.bot-shell' : '.bot-wedge');
      if (node) node.setAttribute('fill', hex);
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
    if (state.lastBeat !== null && beat !== state.lastBeat) {
      if (state.stage === 'premiere') state.stage = null;
      if (card.isOpen()) card.closeCard();
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

    const liveStamp = beat === 'expedition' && !state.stage
      ? `${beat}:${iAmRunner ? 'run' : iAmGuide ? 'guide' : 'watch'}:${missionPhase}`
        + `:${hasCard() ? 'card' : 'nocard'}`
      : null;
    if (liveStamp && root.dataset.liveUi === liveStamp && patchLive(frame)) {
      window.__rrrPhone = { frame, beat, seat: me.seat, iAmRunner, iAmGuide };
      return;
    }

    let body = '';
    if (state.err) body += `<div class="err">${esc(state.err)}</div>`;

    if (beat !== 'casting') {
      state.cast = freshCast();
      state.castEpisode = null;
    }

    if (state.stage) {
      // The premiere owns the sheet while the deal is landing. The ballot is one tap behind it,
      // and the beat that opens casting has usually already arrived.
      body += premiereHtml();
    } else if (beat === 'casting' && !recap.runner && !pair.runner) {
      paintCasting(nominees, me, frame?.episode || c.lobby?.episode || 1);
      return;
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
         * SEATED players keep it, and that is the one seat it was always for: it is their whole
         * contribution from a chair.
         */
        body += `<h1>You walk.</h1>
          <p class="hint">Eyes on the TV. Drag to move, hold RUN, tap SWING. Running is loud.</p>
          <p class="hint">Listen to your guide — they have the map, you have the hammer.</p>
          ${missionLine(frame)}
          <div class="stick-wrap">
            <div class="stick" id="stick"><div class="nub" data-nub></div></div>
            <div class="stick-side">
              <button class="stick-btn" id="run-btn" type="button">Run</button>
              <button class="stick-btn swing" id="swing-btn" type="button">Swing</button>
            </div>
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
        body += `<h1>You talk.</h1>
          <p class="hint">The map is yours. The TV does not get it — call the rooms out loud.</p>
          ${seed == null
            ? '<p class="hint gm-blind">Waiting for the house…</p>'
            : guideMapSvg({
              seed,
              goal: MISSION_ROOM,
              runner: meMark,
              flyover: hunterMark ? { hunter: hunterMark } : null,
              jam,
            })}
          <p class="hint ${hunterMark ? '' : 'gm-blind'}" data-gm-note>${esc(mapNote(jam, hunterMark))}</p>
          ${missionLine(frame)}
          <p class="hint">Cameras live ${frame?.cameras?.unlocked ?? '—'}.</p>
          ${intelBlock(frame, { productionOnly: true })}`;
      } else {
        body += `<h1>Watch.</h1>
          <p class="hint">Reaction only. Dead air is the metric.</p>
          <div class="pad" id="react">
            <button data-r="CLAP">👏 Clap</button>
            <button data-r="BOO">👎 Boo</button>
            <button data-r="SUS">❓ Sus</button>
            <button data-r="SHOCK">‼ Shock</button>
          </div>
          ${intelBlock(frame)}
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
      body += `<h1>Phones down.</h1>
        <p class="hint">Talk. The next ballot comes to this screen when the room is ready.</p>`;
    }

    // 🚨 §2.3: *"a persistent ROLE tab … reopens it in any phase"*. It used to be a static CLEAR
    // card dumped into the sheet after the pair locked and then HIDDEN for the whole expedition —
    // readable by the neighbour for as long as its owner looked away, and gone for the twenty
    // minutes the card is actually being reasoned about. It is a face-down tab now, everywhere.
    body += cardTab();

    delete root.dataset.castUi;
    root.innerHTML = `
      <div class="phone-top"><span>${esc(state.code.toUpperCase())}</span><span>${esc(beat)} · ${esc(myName)}</span></div>
      ${body}`;
    if (liveStamp) root.dataset.liveUi = liveStamp; else delete root.dataset.liveUi;

    /*
     * A read-only handle for the drive, and DELIBERATELY THIS PHONE'S OWN PROJECTED FRAME rather
     * than the client — the same reasoning as `window.__rrrHost` in `views/party-host.js`. It is
     * what the entitlement matrix already decided this socket may see, so exposing it cannot leak
     * anything a screenshot of this screen would not.
     */
    window.__rrrPhone = { frame, beat, seat: me.seat, iAmRunner, iAmGuide };

    root.querySelector('#save-name')?.addEventListener('click', () => {
      const v = root.querySelector('#name')?.value || '';
      state.name = v;
      localStorage.setItem('rrr.party.name', v);
      c.send({ t: 'name', name: v });
    });
    bindPad();
    root.querySelector('#react')?.addEventListener('click', (e) => {
      const r = e.target?.dataset?.r;
      if (!r) return;
      state.flash = r;
      paint();
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
    const nub = root.querySelector('[data-nub]');
    const runBtn = root.querySelector('#run-btn');
    const swingBtn = root.querySelector('#swing-btn');
    if (!stick) { stopPad(); return; }

    const set = (x, y) => {
      const mag = Math.hypot(x, y);
      const k = mag > 1 ? 1 / mag : 1;
      state.pad.x = x * k;
      state.pad.y = y * k;
      if (nub) nub.style.transform = `translate(calc(-50% + ${state.pad.x * 78}%), calc(-50% + ${-state.pad.y * 78}%))`;
      stick.classList.toggle('on', Math.hypot(state.pad.x, state.pad.y) > STICK_DEADZONE);
    };

    const fromEvent = (e) => {
      const r = stick.getBoundingClientRect();
      // +y is FORWARD, so the screen's downward axis is negated once, here, rather than at the
      // three places downstream that would each have to remember to.
      set((e.clientX - (r.left + r.width / 2)) / (r.width / 2),
        -((e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
    };

    stick.addEventListener('pointerdown', (e) => {
      stick.setPointerCapture(e.pointerId);
      fromEvent(e);
      sendPad();
    });
    stick.addEventListener('pointermove', (e) => {
      if (!stick.hasPointerCapture(e.pointerId)) return;
      fromEvent(e);
    });
    const release = (e) => {
      try { stick.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
      set(0, 0);
      sendPad();
    };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);

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
        padFx('Swing', '', 18);
        setTimeout(() => swingBtn.classList.remove('on'), 220);
      });
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
      run: !!p.run,
      swing: !!swing,
    };
    const key = `${msg.x}|${msg.y}|${msg.run}`;
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
  function missionLine(frame) {
    const evs = state.client?.events ?? [];
    const last = [...evs].reverse().find((e) => String(e.type ?? '').startsWith('mission.'));
    const phase = last ? String(last.type).slice('mission.'.length) : 'seek';
    if (phase === 'done') return `<p class="goal">Home. That is the run.</p>`;
    if (phase === 'return') return `<p class="goal">The painting is down. Get back to the ballroom.</p>`;
    return `<p class="goal">Find the ${esc(roomLabel(MISSION_ROOM).toLowerCase())}. Break the painting.</p>`;
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

  function paintCasting(players, me, episode) {
    // This sheet returns before `paint()` reaches `bindPad`, so the 20 Hz tick has to be stopped
    // here or a phone that ran last episode keeps posting a stick into the casting beat.
    stopPad();
    const ep = Number(episode) || 1;
    if (state.castEpisode !== ep) {
      state.castEpisode = ep;
      state.cast = freshCast();
    }
    const cast = state.cast;
    const phase = cast.phase;
    const living = (players || []).filter((p) => p.alive !== false);
    // The card arriving is a change of SHAPE — the tab appears — so it belongs in the structural
    // stamp. Without it the sheet would keep a cached DOM that has no way to reach the card.
    const stamp = `${phase}:${hasCard() ? 'card' : 'nocard'}:${living.map((p) => `${p.id}:${p.name}`).join(',')}`;
    if (root.dataset.castUi === stamp) {
      syncCastHighlight(cast);
      return;
    }

    let body = '';
    if (state.err) body += `<div class="err">${esc(state.err)}</div>`;
    if (phase === 'sent') {
      const runnerName = playerName(players, cast.runner);
      const guideName = playerName(players, cast.guide);
      body += `<h1>Sent.</h1>
        <p class="hint">You sent ${esc(runnerName)} to walk and ${esc(guideName)} to talk. The TV has the ballot.</p>`;
    } else {
      const slot = phase === 'guide' ? 'guide' : 'runner';
      body += `<h1>${esc(castPrompt(slot, ep))}</h1>
        <p class="hint">${phase === 'guide'
          ? `${esc(playerName(players, cast.runner))} walks. Pick someone else — nothing is sent until you lock it.`
          : 'Tap a name. Nothing is sent until you lock it.'}</p>
        ${castList(players, me.playerId, cast)}
        <div class="lock-slot" id="lock-slot" ${cast.draft ? '' : 'hidden'}>
          <button class="btn wide lock-btn${cast.draft ? ' in' : ''}" id="lock-pick">${padlockSvg()} Lock ${slot}</button>
        </div>`;
    }

    root.innerHTML = `
      <div class="phone-top"><span>${esc(state.code.toUpperCase())}</span><span>casting · ${esc(playerName(players, me.playerId) || me.name || 'You')}</span></div>
      <div class="cast-step">${body}</div>
      ${cardTab()}`;
    root.dataset.castUi = stamp;
    bindCast(players, me);
    bindCardTab();
  }

  function bindCast(players, me) {
    for (const b of root.querySelectorAll('[data-pick]')) {
      b.addEventListener('click', () => {
        if (b.disabled || b.classList.contains('locked-out')) return;
        state.cast = applyCastTap(state.cast, b.dataset.pick);
        syncCastHighlight(state.cast);
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

  function syncCastHighlight(cast) {
    for (const b of root.querySelectorAll('[data-pick]')) {
      b.classList.toggle('on', b.dataset.pick === cast.draft);
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

  function castList(players, me, cast) {
    return `<div class="pick-list">${(players || []).filter((p) => p.alive !== false).map((p) => {
      const blocked = cast.phase === 'guide' && p.id === cast.runner;
      const on = !blocked && cast.draft === p.id ? 'on' : '';
      const mark = blocked ? ' · runner' : (p.id === me ? ' (you)' : '');
      return `<button class="${on}${blocked ? ' locked-out' : ''}" data-pick="${esc(p.id)}" ${blocked ? 'disabled' : ''}>${esc(p.name || p.id)}${esc(mark)}</button>`;
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
