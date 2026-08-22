/**
 * Phone — a controller (bible D13), not a first-person mansion.
 *
 * Join by code, claim a seat, reconnect by token. Hold the role card; vote; tap a pad.
 * The TV is the show. This screen never renders the house.
 */
import { PartyNightClient, defaultWsUrl, tokenKey, normalizeCodeDisplay, normalizeCodeWire } from '../party/night-client.js';
import { recapFromEvents } from '../party/recap.js';
import { injectNightSkin, markPartyReady, playerName, roleLabel, sideLabel } from '../party/night-skin.js';
import { ACCENTS, DEFAULT_LOOK, SHELLS, cleanLook, robotFaceSvg } from '../party/look.js';
import { applyCastLock, applyCastTap, ballotFromCast, castPrompt, freshCast, mergePublicNames, nominationPlayers, padlockSvg } from '../party/cast-ui.js';

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
  };

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
        if (m.t === 'lobby' && !state.lookLocked) {
          const me = (m.seats || []).find((s) => s.id === client.welcome?.id);
          if (me?.shell && me?.accent && cleanLook(me)) {
            state.look = { shell: me.shell, accent: me.accent };
            state.lookLocked = true;
            writeLook(state.look);
            if (state.step === 'customise' || state.step === 'connecting') state.step = 'night';
          }
        }
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
    const you = frame?.you;
    const beat = c.beat || 'lobby';
    const phase = frame?.phase || 'LOBBY';
    const recap = recapFromEvents(c.events);
    const myName = playerName(players, me.playerId) || me.name || 'You';
    const roleEv = [...c.events].reverse().find((e) => e.type === 'role.card');
    const panelEv = [...c.events].reverse().find((e) => e.type === 'production.panel');
    const role = you?.role || roleEv?.data?.role;
    const align = you?.alignment;
    const pair = frame?.pair || {};
    const iAmRunner = pair.runner && pair.runner === me.playerId;
    const iAmGuide = pair.guide && pair.guide === me.playerId;

    let body = '';
    if (state.err) body += `<div class="err">${esc(state.err)}</div>`;

    if (beat !== 'casting') {
      state.cast = freshCast();
      state.castEpisode = null;
    }

    if (beat === 'casting' && !recap.runner && !pair.runner) {
      paintCasting(nominees, me, frame?.episode || c.lobby?.episode || 1);
      return;
    } else if (beat === 'lobby' || phase === 'LOBBY') {
      body += `<h1>${esc(myName)}</h1>
        <p class="hint">Seat ${me.seat != null ? me.seat + 1 : '—'} · waiting for the host. The TV is the show — this is a pad.</p>
        ${nameField()}
        ${roster(c.lobby)}`;
    } else if (beat === 'casting' && (pair.runner || recap.runner)) {
      body += roleBlock(role, align, panelEv, players)
        + `<p class="hint">${esc(playerName(players, pair.runner || recap.runner))} walks · ${esc(playerName(players, pair.guide || recap.guide))} talks.</p>`;
    } else if (beat === 'expedition') {
      if (iAmRunner) {
        body += `<h1>You walk.</h1>
          <p class="hint">Eyes on the TV. Thumbs on this pad. RUN is loud.</p>
          <div class="pad" id="thr">
            ${['STILL', 'CREEP', 'WALK', 'RUN'].map((t) =>
              `<button data-t="${t}" class="${state.throttle === t ? 'on' : ''}">${t}</button>`).join('')}
          </div>`;
      } else if (iAmGuide) {
        body += `<h1>You talk.</h1>
          <p class="hint">The map is yours. The TV does not get it. Call rooms. Do not read a debug overlay that is not here.</p>
          <p class="hint">Cameras live ${frame?.cameras?.unlocked ?? '—'}.</p>`;
      } else {
        body += `<h1>Watch.</h1>
          <p class="hint">Reaction only. Dead air is the metric.</p>
          <div class="pad" id="react">
            <button data-r="CLAP">👏 Clap</button>
            <button data-r="BOO">👎 Boo</button>
            <button data-r="SUS">❓ Sus</button>
            <button data-r="SHOCK">‼ Shock</button>
          </div>
          ${state.flash ? `<p class="hint">${esc(state.flash)}</p>` : ''}`;
      }
    } else {
      body += `<h1>Recap</h1>
        <p class="hint">Phones down — talk.</p>
        <div class="role-card">
          <div class="rule">Camera ${recap.cameraLit ? 'LIT' : 'STAYED DARK'}</div>
          <div class="rule">Runner ${recap.taken?.length ? 'TAKEN' : 'CAME BACK'}</div>
          <div class="rule">${recap.alarmCount} alarm${recap.alarmCount === 1 ? '' : 's'}</div>
        </div>
        ${roleBlock(role, align, panelEv, players)}`;
    }

    delete root.dataset.castUi;
    root.innerHTML = `
      <div class="phone-top"><span>${esc(state.code.toUpperCase())}</span><span>${esc(beat)} · ${esc(myName)}</span></div>
      ${body}`;

    root.querySelector('#save-name')?.addEventListener('click', () => {
      const v = root.querySelector('#name')?.value || '';
      state.name = v;
      localStorage.setItem('rrr.party.name', v);
      c.send({ t: 'name', name: v });
    });
    root.querySelector('#thr')?.addEventListener('click', (e) => {
      const t = e.target?.dataset?.t;
      if (!t) return;
      state.throttle = t;
      paint();
    });
    root.querySelector('#react')?.addEventListener('click', (e) => {
      const r = e.target?.dataset?.r;
      if (!r) return;
      state.flash = r;
      paint();
    });
  }

  function paintCasting(players, me, episode) {
    const ep = Number(episode) || 1;
    if (state.castEpisode !== ep) {
      state.castEpisode = ep;
      state.cast = freshCast();
    }
    const cast = state.cast;
    const phase = cast.phase;
    const living = (players || []).filter((p) => p.alive !== false);
    const stamp = `${phase}:${living.map((p) => `${p.id}:${p.name}`).join(',')}`;
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
      <div class="cast-step">${body}</div>`;
    root.dataset.castUi = stamp;
    bindCast(players, me);
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

  function roleBlock(role, align, panelEv, players) {
    if (!role) return `<p class="hint">Your card arrives when the cast locks.</p>`;
    const mates = (panelEv?.data?.teammates || youTeammates()).map((t) => playerName(players, t.id)).filter(Boolean);
    return `<div class="role-card">
      <div class="role">${esc(roleLabel(role))}</div>
      <div class="side">${esc(sideLabel(align))}</div>
      <div class="rule">${align === 'evil'
        ? 'You are Production. Do not get caught. Do not feed the room your card.'
        : 'You want the cameras lit. Someone in this room is lying.'}</div>
      ${mates.length ? `<div class="rule">Your table: ${esc(mates.join(', '))}</div>` : ''}
    </div>`;
  }

  function youTeammates() {
    return state.client?.frame?.you?.teammates || [];
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
