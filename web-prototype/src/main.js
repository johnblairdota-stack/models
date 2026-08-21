import { VIEWS, VIEW_BY_ID, GROUPS } from './views.js';
import { debugChrome } from './core/debug.js';

const params = new URLSearchParams(location.search);
const viewId = params.get('view') ?? 'mat.marble';
const isCapture = params.has('capture');
if (isCapture) document.body.dataset.capture = '1';
// The view list is a development instrument, not part of the game. See `debugChrome()`.
const showChrome = debugChrome(viewId);

const bootEl = document.getElementById('boot');
const bootMsg = document.getElementById('bootmsg');
const errEl = document.getElementById('err');

function fail(e) {
  const text = (e && (e.stack || e.message)) || String(e);
  errEl.style.display = 'block';
  errEl.textContent = `VIEW "${viewId}" FAILED\n\n${text}`;
  bootEl.classList.add('gone');
  document.body.dataset.rrrError = '1';
  window.__rrrError = text;
  console.error(e);
}

window.addEventListener('error', (e) => fail(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => fail(e.reason));

if (!isCapture && showChrome) buildViewMenu();

const entry = VIEW_BY_ID.get(viewId);
if (!entry) {
  fail(new Error(`unknown view "${viewId}".\n\nknown:\n${VIEWS.map((v) => '  ' + v.id).join('\n')}`));
} else {
  bootMsg.textContent = entry.title;
  if (String(viewId).startsWith('party.')) {
    const hint = document.getElementById('boothint');
    if (hint) hint.textContent = 'joining the room…';
  }

  // NOTE: do not add a loading overlay from here. `#boot` in index.html is z-index:100 and
  // covers the whole app until the view resolves, so anything created in JS lands underneath
  // it — present in the DOM and invisible on screen. The progress bar is static markup inside
  // `#boot` for exactly that reason.
  entry.module()
    .then((mod) => {
      if (typeof mod.default !== 'function') throw new Error(`view module for "${viewId}" has no default export function`);
      return mod.default({ ...(entry.args ?? {}), viewId, params, entry });
    })
    .then(() => { bootEl.classList.add('gone'); })
    .catch(fail);
}

function buildViewMenu() {
  const nav = document.createElement('nav');
  nav.id = 'views';
  for (const g of GROUPS) {
    const h = document.createElement('div');
    h.className = 'grp';
    h.textContent = g;
    nav.appendChild(h);
    for (const v of VIEWS.filter((x) => x.group === g)) {
      const a = document.createElement('a');
      a.href = `?view=${encodeURIComponent(v.id)}`;
      a.textContent = v.id;
      a.title = `${v.title}\nbar: ${v.bar}`;
      if (v.id === viewId) a.className = 'on';
      nav.appendChild(a);
    }
  }
  document.body.appendChild(nav);
}
