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
import { DEFAULT_LOOK, cleanLook, robotFaceSvg } from '../party/look.js';
import { mergePublicNames } from '../party/cast-ui.js';
import { followUrl } from '../party/follow.js';

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
  const token = sessionStorage.getItem(tokenKey(code, 'tv'));
  const wsUrl = `${defaultWsUrl(wsPort)}/?room=${encodeURIComponent(code)}&host=1${token ? `&token=${token}` : ''}`;

  const ui = {
    beat: 'lobby',
    err: '',
    locked: false,
  };

  /**
   * ⚠️ DECLARED BEFORE THE SOCKET, AND THAT IS NOT TIDINESS. `client.connect()` below delivers
   * `welcome` and `lobby` synchronously into `onMessage`, which calls `paint()`, which calls
   * `syncFollow()`. A `const` declared further down the function is still in its temporal dead
   * zone at that moment — measured: `ReferenceError: Cannot access 'follow' before
   * initialization`, thrown out of the first three paints, on a TV that otherwise looked fine.
   */
  const follow = { layer: null, el: null, src: null, live: false, raf: 0 };

  const client = new PartyNightClient({
    url: wsUrl,
    onMessage: (m) => {
      if (m.t === 'welcome') sessionStorage.setItem(tokenKey(code, 'tv'), m.token);
      if (m.t === 'show' && m.beat) ui.beat = m.beat;
      if (m.t === 'full') ui.err = 'The TV seat is taken. Close the other host tab, or pick a new room code.';
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
    layer.hidden = true;
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

  /** Keep the layer registered with the frame it is pretending to be inside. */
  function placeFollow() {
    if (!follow.layer || follow.layer.hidden) return;
    const frame = root.querySelector('.run-frame');
    if (!frame) { follow.layer.hidden = true; return; }
    const r = frame.getBoundingClientRect();
    const s = follow.layer.style;
    s.left = `${r.left}px`;
    s.top = `${r.top}px`;
    s.width = `${r.width}px`;
    s.height = `${r.height}px`;
    // The camera fades UP over the slate rather than the slate fading out from under a black
    // rectangle — during the bake the layer is fully transparent and the still is the picture.
    follow.layer.classList.toggle('live', follow.live);
    frame.classList.toggle('live', follow.live);
  }

  function followLoop() {
    follow.raf = follow.layer && !follow.layer.hidden ? requestAnimationFrame(followLoop) : 0;
    placeFollow();
  }

  function syncFollow(src) {
    if (!src) {
      if (follow.layer) follow.layer.hidden = true;
      if (follow.raf) { cancelAnimationFrame(follow.raf); follow.raf = 0; }
      return;
    }
    ensureFollow();
    if (follow.src !== src) {
      follow.src = src;
      follow.live = false;
      follow.el.src = src;
    }
    follow.layer.hidden = false;
    placeFollow();
    if (!follow.raf) follow.raf = requestAnimationFrame(followLoop);
  }

  // The follow reports its first rendered frame. Until then the slate is the picture.
  window.addEventListener('message', (e) => {
    if (!follow.el || e.source !== follow.el.contentWindow) return;
    if (e.data?.t !== 'follow' || !e.data.ready) return;
    follow.live = true;
    root.querySelector('.run-frame')?.classList.add('live');
  });

  function startNight() {
    client.send({ t: 'start' });
    client.send({ t: 'casting' });
    ui.beat = 'casting';
    paint();
  }

  function sendThemIn() {
    if (!(client.ballots || []).length) return;
    ui.locked = true;
    client.send({ t: 'episode', opts: {} });
    // Optimistic — the server fans expedition to every socket including this TV.
    ui.beat = 'expedition';
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
    const canLock = connected && (phase === 'CASTING' || show === 'casting')
      && (client.ballots || []).length >= 1
      && !client.events.some((e) => e.type === 'cast.pair');
    const hasPair = !!(pair.runner || recap.runner);
    const onRun = show === 'expedition' || (hasPair && show !== 'recap' && show !== 'casting');

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
      });
      body += `<div class="actions">
        <button class="btn ghost" id="to-recap">Recap</button>
        <button class="btn ghost" id="to-run">Watch the run</button>
      </div>`;
    } else if (show === 'recap') {
      body += recapBoard(recap, names);
      body += `<div class="actions"><button class="btn ghost" id="to-cast">Ballots</button>
        <button class="btn ghost" id="to-run">Run</button></div>`;
      if (episode === 1 || phase === 'DEBRIEF' || phase === 'VERDICT') {
        body += `<p class="hint" style="margin-top:16px">No eviction this episode. Phones down — talk.</p>`;
      }
    } else if (show === 'casting') {
      body += ballotBoard(votes, names, pair, recap, episode);
      body += `<div class="actions">`;
      if (canLock) body += `<button class="btn" id="lock">Send them in</button>`;
      if (hasPair) body += `<button class="btn ghost" id="to-run">Watch the run</button>`;
      body += `</div>`;
      if (episode === 1) {
        body += `<p class="hint" style="margin-top:16px">Episode 1 airs every ballot. Nobody is evicted tonight.</p>`;
      }
    } else {
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
        <p class="hint" data-live-hint style="margin-top:14px">${nLive} phone${nLive === 1 ? '' : 's'} live · need 2 to start · empty chairs stay empty</p>`;
    }

    root.innerHTML = `
      <div class="night-top">
        <div class="night-brand">Prime Time</div>
        <div class="night-phase">${esc(show.toUpperCase())} · episode ${esc(String(episode))} · ${esc(phase)}</div>
      </div>
      ${onRun ? '' : `<div class="night-line">${esc(LINE)}</div>`}
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
    };

    root.querySelector('#go')?.addEventListener('click', startNight);
    root.querySelector('#lock')?.addEventListener('click', sendThemIn);
    root.querySelector('#to-run')?.addEventListener('click', () => setBeat('expedition'));
    root.querySelector('#to-recap')?.addEventListener('click', () => setBeat('recap'));
    root.querySelector('#to-cast')?.addEventListener('click', () => setBeat('casting'));

    // Last, because it measures the frame this paint just wrote in order to sit over it. Off the
    // run beat it hides the layer rather than destroying it — see `syncFollow`.
    const runnerId = pair.runner || recap.runner;
    syncFollow(onRun && runnerId
      ? followUrl({
        beat: 'expedition',
        room: code,
        runnerId,
        name: joinedName(names, runnerId, 'The runner'),
        look: seatLook(client.lobby, runnerId) || DEFAULT_LOOK,
        worldSeed: frame?.worldSeed,
      })
      : null);
  }

  paint();
}

/**
 * Joined lobby name, never a leftover Robot N or a raw id on the TV.
 *
 * ⚠️ `'—'` IS `playerName`'s NOT-FOUND SENTINEL AND IT IS NOT A NAME. Without this line an
 * unresolved runner reaches the screen as literally "— is running", which is what the D13 drive
 * caught on a frame where the pair had not landed yet. It is truthy, it is not the id, and it is
 * not `Robot N`, so every other guard here lets it through.
 */
function joinedName(names, id, fallback) {
  const n = playerName(names, id);
  if (!n || n === '—' || n === id || /^Robot \d+$/i.test(n)) return fallback;
  return n;
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
function runStage({ names, lobby, runnerId, guideId, cameras, alarms }) {
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
            <div class="run-slot">camera warming</div>
          </div>
        </div>
      </div>
      <div class="pair-hero">${esc(runner)} walks. ${esc(guide)} talks.</div>
      <p class="night-line" style="padding:0">The rest of us watch. Cameras live ${cams?.unlocked ?? '—'} / needed ${cams?.needed ?? '—'} · alarms ${alarms ?? 0}</p>
    </div>`;
}

function seatGrid(lobby) {
  const seats = (lobby?.seats || []).filter((s) => !s.isTV);
  if (!seats.length) {
    return `<p class="hint" style="margin-top:22px">Waiting for the room…</p>`;
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

function ballotBoard(votes, names, pair, recap, episode) {
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
    : `<p class="hint">Ballots land here, huge. Lock when the room has spoken.</p>`;
  // playEpisode increments episode after the premiere; recap.episode stays 1.
  const huge = Number(episode) === 1 || recap.episode === 1;
  return `${hero}<div class="ballot${huge ? ' huge' : ''}">${rows || '<p class="hint">No ballots yet — phones pick a runner and a guide.</p>'}</div>`;
}

function recapBoard(recap, names) {
  const taken = recap.taken?.length
    ? recap.taken.map((t) => joinedName(names, t.id, 'The runner')).join(', ')
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
