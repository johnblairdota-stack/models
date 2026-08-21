/** _ru_render — run the proposed show-tv render block against a real payload, headless. */
import { readFileSync } from 'node:fs';
import { play } from './_ru_probe7.mjs';
import { reunion } from '../src/party/reunion.js';
const seed = Number(process.argv[2] || 15);
const r = play({ castSeed: seed * 41, worldSeed: seed });
const special = { ...reunion(r.log, r.ctx), outcome: r.s.state.outcome };
const frame = { players: r.s.state.players.map((p) => ({ id: p.id, name: p.name })) };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nameOf = (id) => { const p = frame.players.find((x) => x.id === id); return p ? p.name : '—'; };
const swingerName = (id) => (id === 'SHOWRUNNER' ? 'nobody left standing — the Showrunner' : nameOf(id));
const big = (a, b) => `<div class="big">${a}</div><div class="sub">${b}</div>`;
const DECIDED_BY = { 'win.W3': 'the feed had taken enough of them', 'last death': 'the last death of the season' };
let render = () => {};
const block = readFileSync(process.env.BLOCK, 'utf8');
const src = `${block}\n return { reunionStage, startReveal: () => { cue = 1e9; } };`;
// eslint-disable-next-line no-new-func
const mk = new Function('special', 'esc', 'nameOf', 'swingerName', 'big', 'DECIDED_BY', 'render', 'setInterval', 'clearInterval', src);
const api = mk(special, esc, nameOf, swingerName, big, DECIDED_BY, render, () => 0, () => {});
api.startReveal();
const html = api.reunionStage();
console.log(html.replace(/<\/div>/g, '</div>\n').replace(/><span/g, '>\n    <span'));
console.log('\n--- ' + html.length + ' bytes of HTML · raw ids present: ' + /\bp\d+\b/.test(html) + ' · role identifiers present: '
  + ['focusPuller','methodActor','glitched','cameraOp','contestant','producer','plant','fixer','theStatic','continuity','editor','fanFavourite','stuntDouble'].some((k) => html.includes(k)));
