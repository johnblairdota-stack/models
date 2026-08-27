const fs = require('fs');

// --- party-phone.js ---
{
  const p = 'src/views/party-phone.js';
  let s = fs.readFileSync(p, 'utf8');
  if (s.includes('data-here')) throw new Error('phone already patched');

  // Insert here line in runner expedition HTML, after missionLine, before stick-wrap
  const htmlNeedle = '          ${missionLine(frame)}\n          <div class="stick-wrap">';
  const htmlNeedleCR = '          ${missionLine(frame)}\r\n          <div class="stick-wrap">';
  let used = null;
  if (s.includes(htmlNeedle)) used = htmlNeedle;
  else if (s.includes(htmlNeedleCR)) used = htmlNeedleCR;
  else throw new Error('html needle missing');
  s = s.replace(used, used.replace('<div class="stick-wrap">', '${hereLine(frame)}\n          <div class="stick-wrap">'));

  // patchLive: update [data-here] text
  const patchNeedle = '    if (slot) {';
  if (!s.includes(patchNeedle)) throw new Error('patchLive slot needle missing');
  const patchInsert =
`    const hereEl = root.querySelector('[data-here]');
    if (hereEl) hereEl.textContent = hereLabel(frame?.you?.here);

` + patchNeedle;
  // only first occurrence in patchLive — insert before if (slot)
  const idx = s.indexOf('  function patchLive(frame)');
  if (idx < 0) throw new Error('patchLive missing');
  const slotAt = s.indexOf(patchNeedle, idx);
  if (slotAt < 0) throw new Error('slot after patchLive missing');
  s = s.slice(0, slotAt) + patchInsert.slice(0, -patchNeedle.length) + s.slice(slotAt);

  // Add helpers near missionLine
  const missionFn = '  function missionLine(frame) {';
  if (!s.includes(missionFn)) throw new Error('missionLine missing');
  const helpers =
`  /**
   * Where the runner is standing — one word, same dictionary as the guide map.
   * Not intel. Not a map. Proprioception so a shouted room name is checkable.
   */
  function hereLabel(roomId) {
    if (!roomId) return '—';
    const labels = nightLabels();
    if (labels?.has?.(roomId)) return labels.get(roomId);
    const type = String(roomId).includes('.') ? String(roomId).split('.')[1] : String(roomId);
    if (/^\\d+$/.test(type) || String(roomId).startsWith('c')) return 'a passage';
    return roomLabel(type);
  }

  function hereLine(frame) {
    return '<p class="here">You are in <strong data-here>' + esc(hereLabel(frame?.you?.here)) + '</strong></p>';
  }

`;
  s = s.replace(missionFn, helpers + missionFn);

  fs.writeFileSync(p, s);
  console.log('phone ok');
}

// --- night-skin.js ---
{
  const p = 'src/party/night-skin.js';
  let s = fs.readFileSync(p, 'utf8');
  if (s.includes('.here {')) throw new Error('skin already has .here');
  const needle = '    .goal { margin-top:10px; color:var(--night-live); font-size:16px; font-weight:700; }';
  if (!s.includes(needle)) throw new Error('goal css missing');
  s = s.replace(needle, needle + '\n' +
    '    .here { margin: 8px 0 2px; color: var(--night-ink); font-size: 18px; font-weight: 700; letter-spacing: .02em; }\n' +
    '    .here strong[data-here] { color: var(--night-live); }');
  fs.writeFileSync(p, s);
  console.log('skin ok');
}
