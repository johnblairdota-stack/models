/* THE DESK — board client. Renders cards, moves lanes, runs backend verify.
   The client never decides Done; it only displays what /verify returned. */

const LANE_NEXT = { pitch: 'route', route: 'verify' };

async function api(path, opts) {
  const res = await fetch(path, opts && {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(opts),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function renderCard(card) {
  const node = document.getElementById('card-tpl').content.firstElementChild.cloneNode(true);
  node.dataset.card = card.id;
  node.dataset.lane = card.lane;

  const conf = node.querySelector('.badge-confidence');
  conf.dataset.confidence = card.confidence;
  conf.textContent = card.confidence === 'verified' ? 'VERIFIED IN REPO' : 'HUNCH';

  node.querySelector('.badge-route').textContent = card.route ? `→ ${card.route}` : 'unrouted';
  node.querySelector('.card-title').textContent = card.title;
  node.querySelector('.card-pitch').textContent = card.pitch;
  node.querySelector('.card-done-means span').textContent = card.doneMeans;

  const ev = node.querySelector('.card-evidence');
  for (const line of card.evidence) ev.appendChild(el('li', null, line));

  const routeSel = node.querySelector('.route-select');
  routeSel.value = card.route || '';
  const ownerIn = node.querySelector('.owner-input');
  ownerIn.value = card.owner || '';
  const saveRoute = async () => {
    await api(`/api/cards/${card.id}/route`, { route: routeSel.value || null, owner: ownerIn.value });
    load();
  };
  routeSel.addEventListener('change', () => saveRoute().catch(showError));
  ownerIn.addEventListener('change', () => saveRoute().catch(showError));

  const advance = node.querySelector('.btn-advance');
  const next = LANE_NEXT[card.lane];
  if (next) {
    advance.textContent = `advance → ${next}`;
    advance.addEventListener('click', () =>
      api(`/api/cards/${card.id}/move`, { lane: next }).then(load).catch(showError));
  } else {
    advance.disabled = true;
    advance.textContent = card.lane === 'done' ? 'earned' : 'awaiting verify';
  }

  node.querySelector('.btn-verify').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'verifying…';
    try { await api(`/api/cards/${card.id}/verify`, {}); } catch (err) { showError(err); }
    load();
  });

  if (card.lastVerify) {
    const report = node.querySelector('.verify-report');
    report.hidden = false;
    report.querySelector('h5').textContent =
      `last verify · ${card.lastVerify.pass ? 'PASSED' : 'FAILED'} · ${new Date(card.lastVerify.at).toLocaleString()}`;
    const rows = report.querySelector('.verify-rows');
    for (const r of card.lastVerify.requirements) {
      const li = el('li');
      li.dataset.pass = String(r.pass);
      li.appendChild(el('span', 'mark', r.pass ? '✓' : '✗'));
      li.appendChild(el('span', 'req-name', r.name));
      li.appendChild(el('span', null, r.detail));
      rows.appendChild(li);
    }
  }
  return node;
}

function showError(err) {
  console.error(err);
  alert(err.message);
}

async function load() {
  const { cards } = await api('/api/cards');
  for (const laneEl of document.querySelectorAll('.lane-cards')) laneEl.textContent = '';
  for (const card of cards) {
    const lane = document.querySelector(`.lane[data-lane="${card.lane}"] .lane-cards`);
    if (lane) lane.appendChild(renderCard(card));
  }
}

load().catch(showError);
