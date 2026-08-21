/**
 * TV / host — the shared screen. Not game.play. Not a flyover. Not a sledge tutorial.
 *
 * Host socket is the TV spectator. Phones are robots. The mansion stays on ?view=game.play.
 */
import { PartyNightClient, defaultWsUrl, makeCode, tokenKey } from '../party/night-client.js';
import { recapFromEvents } from '../party/recap.js';
import { injectNightSkin, markPartyReady, playerName } from '../party/night-skin.js';
import { qrSvg } from '../party/qr.js';

const LINE = 'Two of you go in. One walks, one talks. The rest of us watch. Someone in this room is lying.';

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
  const token = sessionStorage.getItem(tokenKey(code));
  const wsUrl = `${defaultWsUrl(wsPort)}/?room=${encodeURIComponent(code)}&seat=tv${token ? `&token=${token}` : ''}`;

  const ui = {
    beat: 'lobby',
    err: '',
    locked: false,
  };

  const client = new PartyNightClient({
    url: wsUrl,
    onMessage: (m) => {
      if (m.t === 'welcome') sessionStorage.setItem(tokenKey(code), m.token);
      if (m.t === 'show' && m.beat) ui.beat = m.beat;
      if (m.t === 'full') ui.err = 'The TV seat is taken. Close the other host tab, or pick a new room code.';
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
    return client.frame?.players || (client.lobby?.seats || [])
      .filter((s) => !s.isTV)
      .map((s) => ({ id: s.playerId, name: s.name, seat: s.seat, alive: true }));
  }

  function setBeat(beat) {
    ui.beat = beat;
    client.send({ t: 'show', beat });
    paint();
  }

  function startNight() {
    client.send({ t: 'start' });
    client.send({ t: 'casting' });
    ui.beat = 'casting';
    paint();
  }

  function sendThemIn() {
    ui.locked = true;
    client.send({ t: 'episode', opts: {} });
    ui.beat = 'casting';
    paint();
  }

  function paint() {
    const frame = client.frame;
    const phase = frame?.phase || client.lobby?.phase || 'LOBBY';
    const episode = frame?.episode || client.lobby?.episode || 1;
    const recap = recapFromEvents(client.events);
    const names = players();
    const votes = client.ballots;
    const pair = frame?.pair || {};
    const show = ui.beat;

    const connected = client.connected && client.welcome && !client.full;
    const nLive = livePhones().length;
    const canStart = connected && nLive >= 2 && (phase === 'LOBBY' || show === 'lobby') && !ui.locked;
    const canLock = connected && (phase === 'CASTING' || show === 'casting') && !client.events.some((e) => e.type === 'cast.pair');
    const hasPair = !!(pair.runner || recap.runner);
    const hasRecap = client.events.some((e) => e.type === 'phase.RECAP' || e.type === 'run.camera_lit' || e.type === 'panel.alarm');

    let body = '';
    if (ui.err) body += `<div class="err">${esc(ui.err)}</div>`;

    if (show === 'lobby' || (!hasPair && show !== 'casting')) {
      body += `
        <div class="night-row">
          <div>
            <div class="night-code">${esc(code.toUpperCase())}</div>
            <div class="night-sub">room code · phones open the join URL</div>
            <div class="night-sub" style="margin-top:14px;letter-spacing:.03em;text-transform:none;max-width:28rem;word-break:break-all">${esc(joinPath)}</div>
          </div>
          <div class="night-qr" aria-label="QR join">${qrSvg(joinPath, { dim: 200 })}</div>
        </div>
        ${seatGrid(client.lobby)}
        <div class="actions">
          <button class="btn" id="go" ${canStart ? '' : 'disabled'}>Start the night</button>
        </div>
        <p class="hint" style="margin-top:14px">${nLive} phone${nLive === 1 ? '' : 's'} live · need 2 to start · empty chairs still sit in the deal as Robot N</p>`;
    } else if (show === 'casting') {
      body += ballotBoard(votes, names, pair, recap);
      body += `<div class="actions">`;
      if (canLock) body += `<button class="btn" id="lock">Send them in</button>`;
      if (hasPair) body += `<button class="btn ghost" id="to-run">Watch the run</button>`;
      body += `</div>`;
      if (episode === 1) {
        body += `<p class="hint" style="margin-top:16px">Episode 1 airs every ballot. Nobody is evicted tonight.</p>`;
      }
    } else if (show === 'expedition') {
      const runner = playerName(names, pair.runner || recap.runner);
      const guide = playerName(names, pair.guide || recap.guide);
      const cams = frame?.cameras;
      body += `
        <div class="pair-hero">${esc(runner)} walks.<br>${esc(guide)} talks.</div>
        <p class="night-line" style="padding:0">The rest of us watch. The mansion is dark. The hammer is automatic — do not aim it.</p>
        <p class="hint">Cameras live ${cams?.unlocked ?? '—'} / needed ${cams?.needed ?? '—'} · alarms ${frame?.incident?.alarms ?? 0}</p>
        <div class="actions"><button class="btn" id="to-recap">Recap</button></div>`;
    } else {
      body += recapBoard(recap, names);
      body += `<div class="actions"><button class="btn ghost" id="to-cast">Ballots</button>
        <button class="btn ghost" id="to-run">Run</button></div>`;
      if (episode === 1 || phase === 'DEBRIEF' || phase === 'VERDICT') {
        body += `<p class="hint" style="margin-top:16px">No eviction this episode. Phones down — talk.</p>`;
      }
    }

    root.innerHTML = `
      <div class="night-top">
        <div class="night-brand">Prime Time</div>
        <div class="night-phase">${esc(show.toUpperCase())} · episode ${esc(String(episode))} · ${esc(phase)}</div>
      </div>
      <div class="night-line">${esc(LINE)}</div>
      <div class="night-main">${body}</div>`;

    root.querySelector('#go')?.addEventListener('click', startNight);
    root.querySelector('#lock')?.addEventListener('click', sendThemIn);
    root.querySelector('#to-run')?.addEventListener('click', () => setBeat('expedition'));
    root.querySelector('#to-recap')?.addEventListener('click', () => setBeat('recap'));
    root.querySelector('#to-cast')?.addEventListener('click', () => setBeat('casting'));
  }

  paint();
}

function seatGrid(lobby) {
  const seats = (lobby?.seats || []).filter((s) => !s.isTV);
  if (!seats.length) {
    return `<p class="hint" style="margin-top:22px">Waiting for the room…</p>`;
  }
  return `<div class="seats">${seats.map((s) => {
    const cls = s.connected ? 'seat on' : (s.joined ? 'seat away' : 'seat');
    const meta = s.connected ? 'live' : (s.joined ? 'reconnect' : 'empty');
    return `<div class="${cls}"><div class="who">${esc(s.name)}</div><div class="meta">${meta}</div></div>`;
  }).join('')}</div>`;
}

function ballotBoard(votes, names, pair, recap) {
  const rows = (votes || []).map((v) => `
    <div class="row">
      <div class="who">${esc(playerName(names, v.voter))}</div>
      <div class="arrow">sent</div>
      <div class="pick">RUNNER ${esc(playerName(names, v.runner))}<br>GUIDE ${esc(playerName(names, v.guide))}</div>
    </div>`).join('');
  const runner = pair.runner || recap.runner;
  const guide = pair.guide || recap.guide;
  const hero = runner
    ? `<div class="pair-hero">${esc(playerName(names, runner))} walks · ${esc(playerName(names, guide))} talks</div>`
    : `<p class="hint">Ballots land here, huge. Lock when the room has spoken.</p>`;
  return `${hero}<div class="ballot">${rows || '<p class="hint">No ballots yet — phones pick a runner and a guide.</p>'}</div>`;
}

function recapBoard(recap, names) {
  const taken = recap.taken?.length
    ? recap.taken.map((t) => playerName(names, t.id)).join(', ')
    : 'CAME BACK';
  return `<div class="recap">
    <div class="fact"><div class="k">Camera</div><div class="v ${recap.cameraLit ? 'ok' : 'bad'}">${recap.cameraLit ? 'LIT' : 'STAYED DARK'}</div></div>
    <div class="fact"><div class="k">Runner</div><div class="v ${recap.taken?.length ? 'bad' : 'ok'}">${esc(taken)}</div></div>
    <div class="fact"><div class="k">Alarms</div><div class="v">${esc(String(recap.alarmCount ?? 0))}</div></div>
  </div>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
