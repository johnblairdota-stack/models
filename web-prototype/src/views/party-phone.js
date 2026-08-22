/**
 * Phone — a controller (bible D13), not a first-person mansion.
 *
 * Join by code, claim a seat, reconnect by token. Hold the role card; vote; tap a pad.
 * The TV is the show. This screen never renders the house.
 */
import { PartyNightClient, defaultWsUrl, tokenKey } from '../party/night-client.js';
import { recapFromEvents } from '../party/recap.js';
import { injectNightSkin, markPartyReady, playerName, roleLabel, sideLabel } from '../party/night-skin.js';

export default async function partyPhone({ params }) {
  injectNightSkin();
  markPartyReady();
  document.title = 'PRIME TIME — phone';
  document.body.style.overflow = 'auto';

  const root = document.createElement('div');
  root.className = 'night phone';
  document.body.appendChild(root);

  const state = {
    code: (params.get('room') || '').toLowerCase(),
    name: localStorage.getItem('rrr.party.name') || '',
    err: '',
    client: null,
    runner: null,
    guide: null,
    throttle: 'STILL',
    flash: '',
  };

  if (!state.code) {
    paintJoin();
    return;
  }
  await connect();

  async function connect() {
    const code = state.code.replace(/[^a-z0-9]/g, '').slice(0, 8);
    if (code.length < 4) { state.err = 'Room code is four letters.'; paintJoin(); return; }
    state.code = code;
    const u = new URL(location.href);
    u.searchParams.set('view', 'party.phone');
    u.searchParams.set('room', code);
    history.replaceState({}, '', u);

    const token = sessionStorage.getItem(tokenKey(code, 'phone'));
    const wsPort = +(params.get('wsPort') || 5181);
    const url = `${defaultWsUrl(wsPort)}/?room=${encodeURIComponent(code)}${token ? `&token=${token}` : ''}`;
    const client = new PartyNightClient({
      url,
      onMessage: (m) => {
        if (m.t === 'welcome') sessionStorage.setItem(tokenKey(code, 'phone'), m.token);
        if (m.t === 'full') state.err = 'Room is full (8 phones + TV).';
        paint();
      },
      onClose: () => { state.err = state.err || 'Dropped. Reload to reclaim your seat by token.'; paint(); },
    });
    state.client = client;
    try {
      await client.connect();
      if (state.name) client.send({ t: 'name', name: state.name });
    } catch (e) {
      state.err = (e && e.message) || String(e);
    }
    paint();
  }

  function paintJoin() {
    root.innerHTML = `
      <div class="phone-top"><span>Prime Time</span><span>join</span></div>
      <h1>Sit down.</h1>
      <p class="hint">Type the four-letter code on the TV.</p>
      ${state.err ? `<div class="err">${esc(state.err)}</div>` : ''}
      <input class="field" id="code" maxlength="8" placeholder="CODE" value="${esc(state.code)}" autocomplete="off" autocapitalize="characters">
      <input class="field" id="name" maxlength="12" placeholder="YOUR NAME" value="${esc(state.name)}" autocomplete="nickname">
      <button class="btn wide" id="join">Join</button>`;
    root.querySelector('#join').onclick = () => {
      state.code = root.querySelector('#code').value;
      state.name = root.querySelector('#name').value;
      if (state.name) localStorage.setItem('rrr.party.name', state.name);
      connect();
    };
  }

  function paint() {
    const c = state.client;
    if (!c || (!c.welcome && !c.full && !state.err)) {
      root.innerHTML = `<div class="phone-top"><span>Prime Time</span><span>…</span></div><p class="hint">Connecting…</p>`;
      return;
    }
    if (!c.welcome || c.full) { paintJoin(); return; }

    const me = c.welcome;
    const frame = c.frame;
    const players = frame?.players || [];
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

    if (beat === 'lobby' || phase === 'LOBBY') {
      body += `<h1>${esc(myName)}</h1>
        <p class="hint">Seat ${me.seat != null ? me.seat + 1 : '—'} · waiting for the host. The TV is the show — this is a pad.</p>
        ${nameField()}
        ${roster(c.lobby)}`;
    } else if (beat === 'casting' && !recap.runner && !pair.runner) {
      body += `<h1>Who goes in?</h1>
        <p class="hint">Pick a runner and a different guide. Who you send is public.</p>
        <div class="hint">RUNNER</div>
        ${pickList('runner', players, me.playerId)}
        <div class="hint">GUIDE</div>
        ${pickList('guide', players, me.playerId)}
        <button class="btn wide" id="vote">Send ballot</button>`;
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

    root.innerHTML = `
      <div class="phone-top"><span>${esc(state.code.toUpperCase())}</span><span>${esc(beat)} · ${esc(myName)}</span></div>
      ${body}`;

    root.querySelector('#save-name')?.addEventListener('click', () => {
      const v = root.querySelector('#name')?.value || '';
      state.name = v;
      localStorage.setItem('rrr.party.name', v);
      c.send({ t: 'name', name: v });
    });
    root.querySelector('#vote')?.addEventListener('click', () => {
      if (state.runner && state.guide && state.runner !== state.guide) {
        c.send({ t: 'ballot', runner: state.runner, guide: state.guide });
      }
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
    for (const b of root.querySelectorAll('[data-pick]')) {
      b.addEventListener('click', () => {
        state[b.dataset.slot] = b.dataset.pick;
        paint();
      });
    }
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

  function pickList(slot, players, me) {
    return `<div class="pick-list">${(players || []).filter((p) => p.alive !== false).map((p) => {
      const on = state[slot] === p.id ? 'on' : '';
      return `<button class="${on}" data-slot="${slot}" data-pick="${esc(p.id)}">${esc(p.name || p.id)}${p.id === me ? ' (you)' : ''}</button>`;
    }).join('')}</div>`;
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

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
