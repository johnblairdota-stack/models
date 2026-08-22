#!/usr/bin/env node
/**
 * 📺 Builds the per-phase screen canvas: what the television shows, and what each of the eight
 * phones shows, at every phase of one episode.
 *
 * The copy is lifted verbatim from `net/party/show-tv.html`'s phase table and
 * `net/party/show-phone.html`'s SAY/DARK_SAY tables. Where a line here differs from those files,
 * those files are right and this is stale.
 *
 * The deal is one legal 8-player deal under COMPOSITION[8] (informed 4, outsider 2, minion 1,
 * producer 1) and GUARANTEED[8]. It deliberately includes the Glitched-covered-as-Continuity
 * case — 22.6% of eight-player games — because two phones holding exactly inverse dossiers is
 * the clearest thing this canvas can teach.
 */
import { writeFileSync } from 'node:fs';

const T = {
  ink:'#f2f4f8', dim:'#8b93a3', bg:'#0b0d12', panel:'#161b25', edge:'#262d3d',
  tvPanel:'#141821', tvEdge:'#232937', live:'#4cc27a', gone:'#e4483a', warn:'#e0b23c',
};

// seat, name, role they BELIEVE they hold, true role, alignment
const CAST = [
  { n:1, name:'Ana',  believes:'Continuity',    truly:'Continuity',    align:'good' },
  { n:2, name:'Ben',  believes:'Camera Op',     truly:'Camera Op',     align:'good' },
  { n:3, name:'Cass', believes:'Focus Puller',  truly:'Focus Puller',  align:'good' },
  { n:4, name:'Dev',  believes:'The Editor',    truly:'The Editor',    align:'good' },
  { n:5, name:'Eve',  believes:'Continuity',    truly:'Glitched',      align:'good' },
  { n:6, name:'Finn', believes:'The Static',    truly:'The Static',    align:'good' },
  { n:7, name:'Gus',  believes:'The Plant',     truly:'The Plant',     align:'evil' },
  { n:8, name:'Hana', believes:'The Producer',  truly:'The Producer',  align:'evil' },
];
const RUNNER = 2, GUIDE = 6, WING = 'the gallery';

const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/** One phone screen. `body` is raw html for the screen's middle. */
function phone(seat, { body, tone = '', chip = '' }, hasPair = true) {
  // ⚠️ NO PAIR EXISTS UNTIL `resolveCasting` RUNS. Tagging a runner during the premiere or
  // the ballot would show the room a fact the game has not produced yet.
  const role = !hasPair ? '' : seat.n === RUNNER ? 'RUNNER' : seat.n === GUIDE ? 'GUIDE' : '';
  return `<div class="ph${tone ? ' ' + tone : ''}">
    <div class="ph-top"><span class="seat">${seat.n}</span><span class="nm">${esc(seat.name)}</span>
      ${role ? `<span class="tag ${role.toLowerCase()}">${role}</span>` : ''}</div>
    <div class="ph-scr">${body}</div>
    ${chip ? `<div class="ph-foot">${chip}</div>` : ''}
  </div>`;
}

const dark = (line) => `<div class="dk"><div class="dk-i">●</div><div class="dk-t">${esc(line)}</div></div>`;
const say  = (line) => `<div class="say">${esc(line)}</div>`;
const btns = (...bs) => `<div class="btns">${bs.map((b)=>`<div class="btn${b.startsWith('*')?' big':''}">${esc(b.replace(/^\*/,''))}</div>`).join('')}</div>`;

/* ------------------------------------------------------------------ the phases */
const PHASES = [
  {
    id:'Premiere', name:'PREMIERE', secs:'150', ep:'once, before episode 1',
    role:'The cards are dealt. Every private envelope in the whole game is written here.',
    tvBig:'Check your phone.',
    tvSub:'Your card is private. Read it, then put the phone face down.',
    phone: (s) => ({
      body:`<div class="card"><div class="c-role">${esc(s.believes)}</div>
        <div class="c-al ${s.align}">${s.align === 'evil' ? 'You are PRODUCTION' : 'You are GOOD'}</div>
        <div class="c-line">${esc(s.truly === 'The Static'
          ? '—'
          : s.believes === 'Continuity' ? 'Once per game, as a pair is announced, learn whether that pair contains a member of Production.'
          : s.believes === 'Camera Op' ? 'Each episode, learn whether the Hunter noticed the runner by sight or by sound.'
          : s.believes === 'Focus Puller' ? 'Each episode, learn how many seconds the Hunter was visible on the guide’s flyover.'
          : s.believes === 'The Editor' ? 'Once per game, force the show to re-air ten seconds raw and uncut from any camera.'
          : s.believes === 'The Plant' ? 'You know Production. You register as good to every Cast information role.'
          : 'Once per episode, from your chair, spike the Hunter’s interest in any room.')}</div>
        ${s.align === 'evil' ? `<div class="panel-blk"><b>Production</b>${CAST.filter(x=>x.align==='evil'&&x.n!==s.n).map(x=>`<span>${esc(x.name)} · ${esc(x.truly)}</span>`).join('')}</div>` : ''}
      </div>`,
      tone: s.align === 'evil' ? 'evil' : '',
      chip: s.truly === 'Glitched' ? '<span class="w">reads a cover — is not told</span>'
          : s.truly === 'The Static' ? '<span class="w">no line: the card withholds it</span>' : '',
    }),
    note:'<b>The Static’s card carries no line at all</b>, and that is not a tell — printing <i>“your flyover is a second and a half behind”</i> would hand them the one fact the card exists to withhold. <b>Eve is the Glitched</b>, dealt a Continuity cover: she reads somebody else’s card in full and nothing on her phone can tell her apart.',
  },
  {
    id:'Casting', name:'CASTING', secs:'45', ep:'episode 2',
    role:'The wing is announced first, then the pair is voted in. Two things now happen on close.',
    tvBig:'Who runs, and who guides?',
    tvSub:`${WING} this episode. Two taps each — argue about the job, not the person.`,
    phone: (s) => ({
      body: say(`Who goes into ${WING}? Two taps: your runner first, then your guide.`) +
        `<div class="pick"><div class="pk-h">Runner</div>${btns('Ana','Ben','Cass','…')}
         <div class="pk-h">Guide</div>${btns('Dev','Eve','Finn','…')}</div>`,
    }),
    newOnClose:'On close — never during — the attributed slate is published and Continuity fires.',
    note:'<b>Aired on close, never during.</b> <code>resolveCasting</code> runs on exit, so no phone can watch the slate build and no last voter is decisive. Measured: <b>0 of 1818 casting frames</b> carry a slate.',
  },
  {
    id:'Expedition', name:'EXPEDITION', secs:'90', ep:'episode 2',
    role:'The only phase that touches the engine. Six of eight are watching a screen they cannot act on.',
    tvBig:`Into ${WING}.`,
    tvSub:'Finn is watching the cameras.',
    tvKind:'live',
    phone: (s) => {
      if (s.n === GUIDE) return { tone:'guide', body:
        `<div class="map"><div class="mp-h">FLYOVER · gallery</div>
          <svg viewBox="0 0 150 96" class="mp"><rect x="6" y="8" width="138" height="80" rx="3" fill="#161b25" stroke="#2a3244"/>
            <rect x="14" y="16" width="58" height="30" fill="#1b2331" stroke="#2a3244"/>
            <rect x="78" y="16" width="58" height="30" fill="#1b2331" stroke="#2a3244"/>
            <rect x="14" y="52" width="122" height="30" fill="#1b2331" stroke="#2a3244"/>
            <circle cx="42" cy="66" r="5" fill="#4cc27a"/><text x="42" y="82" fill="#8b93a3" font-size="7" text-anchor="middle">you</text>
          </svg>
          <div class="mp-r">NO SIGNAL <span>on the Hunter</span></div></div>` +
        say('You can see what the cameras can see. Tell them.') + btns('*CLEAR','*HOLD'),
        chip:'<span class="w">the only private frame surface in the game</span>' };
      if (s.n === RUNNER) return { tone:'runner', body:
        say('Your guide is looking. Then it is your call.') +
        `<div class="stick"><div class="knob"></div></div>` + btns('*GO','*WAIT') };
      return { body: say('Watch the television.') + `<div class="idle">Phone down.</div>` };
    },
    note:'The guide’s flyover is <b>the whole of the private frame surface</b> — and Finn is the Static, so it is a second and a half behind and they are not told. An honest guide who cannot see must have nothing to point at, or the deniable mistake the design rests on stops being available to them.',
  },
  {
    id:'Recap', name:'RECAP', secs:'20', ep:'episode 2',
    role:'Was one word for twenty seconds. Now carries the two facts that make the guide checkable.',
    tvBig:'<span class="bad">Taken.</span>', tvSub:'The terminal stays dark.',
    tvFacts:[['Cameras','1 of 4 lit'],['Incidents','3 this season'],['The guide','<span class="cl">had them on camera</span>'],['The Hunter','<span class="bad">was in the gallery</span>']],
    tvNew:true,
    phone: () => ({ body: dark('The recap is on the television. Nothing on this phone will remember it for you.'), tone:'off' }),
    note:'<b>Finn could see, and called CLEAR, and Ben was taken.</b> Blind and wrong is unlucky; sighted and wrong is something else. That distinction is the honest-error mechanic finally made legible — and it is deliberately not the Hunter’s room, which would be brute-forceable back to the seed.',
  },
  {
    id:'Debrief', name:'DEBRIEF', secs:'75', ep:'episode 2',
    role:'The phase whose whole purpose is arguing from shared evidence. It now has some.',
    tvBig:'Talk.',
    tvFacts:[['Wing','the gallery'],['Ran','Ben'],['Guided','Finn'],['Outcome','<span class="bad">The Hunter had them</span>'],['Cameras','1 of 4 lit'],['Incidents','3 this season']],
    tvSlate:true, tvNew:true,
    phone: (s) => ({ body: say('Talk. Out loud, to the room. A nameplate is the only thing you can put in writing.') +
      `<div class="plate"><div class="pl-h">YOUR NAMEPLATE</div><div class="pl-v">${esc(s.align === 'evil' ? (s.truly === 'The Producer' ? 'Camera Op' : 'The Editor') : s.believes)}</div>
        <div class="pl-s">${s.align === 'evil' ? 'draft — not published' : 'undeclared'}</div></div>` +
      (s.believes === 'Continuity' ? `<div class="doss"><div class="ds-h">WHAT YOU HAVE LEARNED</div>
        <div class="ds-r"><span>Ep 1</span><b>Ana &amp; Dev</b><i class="${s.truly==='Glitched'?'yes':'no'}">${s.truly==='Glitched'?'PRODUCTION':'CLEAR'}</i></div>
        <div class="ds-r"><span>Ep 2</span><b>Ben &amp; Finn</b><i class="${s.truly==='Glitched'?'yes':'no'}">${s.truly==='Glitched'?'PRODUCTION':'CLEAR'}</i></div>
        <div class="ds-n">Nobody else has this. Nobody else can check it.</div></div>` : ''),
      tone: s.believes === 'Continuity' ? 'holds' : '',
      chip: s.truly === 'Glitched' ? '<span class="r">every entry is the exact inverse</span>'
          : s.truly === 'Continuity' ? '<span class="g">the true dossier</span>' : '' }),
    note:'<b>Two phones hold a dossier and they disagree on every line.</b> <code>falsify(‘boolean’)</code> returns <code>!truth</code>, so the Glitched’s reading is the exact inverse of the real one — and neither holder is told which they are. 22.6% of eight-player games.',
  },
  {
    id:'Reckoning', name:'RECKONING', secs:'45–90', ep:'episode 2',
    role:'Fifteen seconds bought per nomination, capped at ninety. Skipped entirely in episode 1.',
    tvBig:'On the block', tvNoms:[['Finn','Ana'],['Gus','Cass']],
    phone: (s) => ({ body: say('Nominate once, or keep it. Three stand at most.') + btns('Ana','Ben','Cass','Dev','Eve','*Keep it') }),
    note:'Episode 1 stops before this phase. An eviction decided on nothing is the fastest way to teach a table the vote is arbitrary, so episode 1’s only job is to teach the loop.',
  },
  {
    id:'Vote', name:'VOTE', secs:'25', ep:'episode 2',
    role:'Held back until close, so the last voter is never decisive.',
    tvBig:'Vote.', tvSub:'More than half the living, or nobody swings. Abstaining protects them.',
    phone: (s) => ({ body: say('More than half the living, or nobody swings. Abstaining protects them.') +
      btns('*Finn','*Gus','*Abstain') }),
    note:'A vote may be changed until the phase closes and is not aired until then. <b>The vote is still worth about two points over guessing</b> — 24.8% of executions hit Production against a 22.7% baseline — and today’s two evidence channels are not in that number.',
  },
  {
    id:'Execution', name:'EXECUTION', secs:'20', ep:'episode 2',
    role:'Was a name and nothing else. The arithmetic that killed them was projected and never drawn.',
    tvBig:'<span class="bad">Finn</span> voted out', tvSub:'Nominated by Ana — who swings. Nobody says what they were.',
    tvRecord:true, tvNew:true,
    phone: () => ({ body: dark('Nobody says what they were.'), tone:'off' }),
    note:'<code>tally.counts.*</code> and <code>tally.threshold</code> were rowed <code>all</code>, projected to every socket, and rendered on no screen — found by <code>wire-parity</code> P4c. <b>Abstentions are the story of a survived vote</b>: the threshold is more than half the living, so the gap between the winning count and the threshold is what the room needs.',
  },
  {
    id:'Verdict', name:'VERDICT', secs:'15', ep:'episode 2',
    role:'Renewed, or not. Nothing hangs off this phase — closing an episode is the queue emptying.',
    tvBig:'Renewed.', tvSub:'1 of 4 cameras lit · 3 incidents',
    phone: () => ({ body: dark('Cameras and incidents, on the television.'), tone:'off' }),
    note:'The win check deliberately does not live here: <code>orderFor(1)</code> has no VERDICT, and when it did the counter was never reached and the show shot episode one forever.',
  },
  {
    id:'Reunion', name:'REUNION', secs:'240', ep:'after the last episode',
    role:'The same replay with the filter off. Everything the show ever knew comes out.',
    tvBig:'The Reunion', tvRoll:true,
    phone: () => ({ body: dark('It is over. Look up.'), tone:'off' }),
    note:'<code>log.reunion()</code> <b>is</b> <code>log.all()</code> — one stream, filter removed. A leak and a missing Reunion reveal are the same bug, found by the same gate. Every SEALED entry, including the Hunter’s room every episode, lands here.',
  },
];
export { PHASES, CAST, T, phone, esc, say, dark, btns, RUNNER, GUIDE, WING };

/* ------------------------------------------------------------------ render */
const CSS = `
:root{--ink:#f2f4f8;--dim:#8b93a3;--bg:#0b0d12;--panel:#161b25;--edge:#262d3d;
 --tvp:#141821;--tve:#232937;--live:#4cc27a;--gone:#e4483a;--warn:#e0b23c}
*{box-sizing:border-box;margin:0;padding:0}
.board{width:1420px;height:1075px;background:var(--bg);color:var(--ink);
 font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:30px 32px;
 display:flex;flex-direction:column;gap:16px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:#a9b4c8}
.hd{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;
 border-bottom:1px solid var(--edge);padding-bottom:13px}
.hd .l .ph-n{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--warn)}
.hd .l h2{font-size:31px;font-weight:700;letter-spacing:-.02em;margin-top:3px}
.hd .l p{font-size:13px;color:var(--dim);line-height:1.45;margin-top:6px;max-width:840px}
.hd .r{text-align:right;flex:0 0 auto}
.hd .r .s{font-size:36px;font-weight:700;letter-spacing:-.03em;line-height:1}
.hd .r .u{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-top:5px}
.badge{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
 color:#0b0d12;background:var(--live);border-radius:4px;padding:2px 6px;margin-left:7px;vertical-align:middle}
/* ---- television */
.tvwrap{display:flex;justify-content:center}
.tv{width:860px;background:var(--tvp);border:1px solid var(--tve);border-radius:10px;
 box-shadow:0 18px 44px -22px #000;position:relative;padding:26px 30px;min-height:342px;
 display:flex;flex-direction:column;justify-content:center;gap:13px}
.tv::before{content:"THE TELEVISION";position:absolute;top:-9px;left:20px;background:var(--bg);padding:0 8px;
 font-size:9px;letter-spacing:.2em;color:#5f6e8a}
.tv .big{font-size:40px;font-weight:700;letter-spacing:-.025em;line-height:1.05}
.tv .sub{font-size:15.5px;color:var(--dim);line-height:1.45}
.bad{color:var(--gone)} .cl{color:var(--live)}
.shot{border-radius:8px;overflow:hidden;border:1px solid var(--tve);position:relative;background:#0c1017}
.shotsvg{display:block;width:100%;height:186px}
.shot-hud{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;
 padding:7px 11px;font:600 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#8b93a3;
 background:linear-gradient(transparent,#0b0d12cc)}
.shot-hud .clk{color:var(--warn)}
.facts{display:grid;grid-template-columns:auto 1fr;gap:5px 22px;margin-top:4px}
.facts dt{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);align-self:center}
.facts dd{font-size:16px;font-weight:600}
.slate{margin-top:8px;border-top:1px solid var(--tve);padding-top:10px}
.slate .h{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);margin-bottom:7px}
.slate table{width:100%;border-collapse:collapse;font-size:13px;font-weight:600}
.slate td,.slate th{padding:3px 8px;text-align:left}
.slate thead th{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);font-weight:600}
.slate tbody tr{border-top:1px solid var(--tve)}
.slate tbody th{color:var(--dim);font-weight:600}
.slate .self{color:var(--warn);font-size:8.5px;letter-spacing:.12em}
.slate .dm{color:var(--dim)}
.noms .n{font-size:16px;margin-top:5px}
.noms .n b{font-weight:700}
.roll{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:6px}
.roll div{background:#1a1f2b;border:1px solid var(--tve);border-radius:7px;padding:7px 9px;font-size:12.5px}
.roll span{display:block;color:var(--dim);font-size:10.5px;margin-top:2px}
/* ---- phones */
.rail-h{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:#5f6e8a;text-align:center}
.rail{display:flex;gap:9px;justify-content:center}
.ph{width:158px;background:var(--panel);border:1px solid var(--edge);border-radius:13px;padding:8px;
 display:flex;flex-direction:column;gap:6px}
.ph.evil{border-color:#3a2226} .ph.guide{border-color:#2f4a38} .ph.runner{border-color:#3a3320}
.ph.holds{border-color:#3d3016} .ph.off{opacity:.5}
.ph-top{display:flex;align-items:center;gap:5px;font-size:10px}
.seat{width:15px;height:15px;border-radius:50%;background:#232b3b;color:var(--dim);
 display:flex;align-items:center;justify-content:center;font-size:8.5px;font-weight:700;flex:none}
.nm{font-weight:600;font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tag{font-size:7.5px;font-weight:700;letter-spacing:.1em;padding:2px 4px;border-radius:3px}
.tag.guide{background:#1d3327;color:var(--live)} .tag.runner{background:#332c18;color:var(--warn)}
.ph-scr{background:#0d1017;border:1px solid #1e2532;border-radius:9px;padding:9px;flex:1;
 display:flex;flex-direction:column;gap:7px;min-height:258px}
.ph-foot{font-size:8px;line-height:1.3;text-align:center}
.ph-foot .w{color:var(--warn)} .ph-foot .r{color:var(--gone)} .ph-foot .g{color:var(--live)}
.say{font-size:10.5px;line-height:1.4;color:var(--dim)}
.btns{display:flex;flex-direction:column;gap:4px;margin-top:auto}
.btn{background:#1a2130;border:1px solid #283143;border-radius:7px;padding:6px;text-align:center;
 font-size:10px;font-weight:600}
.btn.big{padding:9px;font-size:11.5px;background:#20293a}
.dk{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;text-align:center}
.dk-i{color:#2a3244;font-size:15px} .dk-t{font-size:9.5px;color:#5f6e8a;line-height:1.45}
.idle{margin-top:auto;text-align:center;color:#3d4658;font-size:9.5px}
.card .c-role{font-size:15px;font-weight:700;letter-spacing:-.01em}
.card .c-al{font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-top:2px}
.card .c-al.evil{color:var(--gone)}
.card .c-line{font-size:9.5px;line-height:1.42;color:var(--dim);margin-top:7px}
.panel-blk{margin-top:8px;border-top:1px solid #1e2532;padding-top:6px;font-size:9px}
.panel-blk b{display:block;color:var(--gone);font-size:8px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:3px}
.panel-blk span{display:block;color:var(--dim);line-height:1.4}
.pick{margin-top:auto} .pk-h{font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:#5f6e8a;margin:5px 0 3px}
.map{background:#0b0e14;border:1px solid #1e2532;border-radius:7px;padding:6px}
.mp-h{font-size:7.5px;letter-spacing:.14em;color:#5f6e8a;margin-bottom:4px}
.mp{width:100%;display:block}
.mp-r{font-size:9.5px;font-weight:700;color:var(--dim);margin-top:4px;letter-spacing:.06em}
.mp-r span{font-weight:400;letter-spacing:0}
.stick{height:56px;background:#0b0e14;border:1px solid #1e2532;border-radius:7px;position:relative;margin-top:auto}
.knob{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:26px;height:26px;
 border-radius:50%;background:#232b3b;border:1px solid #2f3a4e}
.plate{background:#0b0e14;border:1px solid #1e2532;border-radius:7px;padding:7px;margin-top:4px}
.pl-h{font-size:7.5px;letter-spacing:.14em;color:#5f6e8a} .pl-v{font-size:12px;font-weight:600;margin-top:3px}
.pl-s{font-size:8px;color:#4d566a;margin-top:2px}
.doss{margin-top:6px;border-top:1px solid #2b2415;padding-top:6px}
.ds-h{font-size:7.5px;letter-spacing:.14em;color:var(--warn);margin-bottom:5px}
.ds-r{display:grid;grid-template-columns:26px 1fr;gap:1px 5px;font-size:9px;margin-top:6px}
.ds-r span{color:#5f6e8a;font-size:8px;padding-top:1px}
.ds-r b{font-weight:600;line-height:1.25}
.ds-r i{grid-column:2;font-style:normal;font-weight:700;font-size:8px;letter-spacing:.08em}
.ds-r i.yes{color:var(--warn)} .ds-r i.no{color:var(--dim)}
.ds-n{font-size:7.5px;color:#4d566a;margin-top:6px;line-height:1.35}
/* ---- footer note */
.note{margin-top:auto;background:var(--panel);border:1px solid var(--edge);border-left:3px solid var(--warn);
 border-radius:11px;padding:12px 16px;font-size:12.5px;line-height:1.5;color:#cfd5e0}
.note b{color:var(--ink);font-weight:600} .note i{font-style:italic;color:var(--dim)}
.oncl{background:#101a14;border:1px solid #234533;border-left:3px solid var(--live);
 border-radius:11px;padding:10px 16px;font-size:12.5px;color:#cfe6d8}
`;

function tvBody(p) {
  if (p.tvKind === 'live') return tvShot() + `<div class="big">${p.tvBig}</div>`
    + `<div class="sub">${esc(p.tvSub)}</div>`;
  let h = `<div class="big">${p.tvBig}</div>`;
  if (p.tvSub) h += `<div class="sub">${esc(p.tvSub)}</div>`;
  if (p.tvFacts) h += `<dl class="facts">${p.tvFacts.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  if (p.tvSlate) {
    const rows = [['Ana','Ben','Finn'],['Ben','Cass','Ben*'],['Cass','Ben','Finn'],['Dev','—','—'],
                  ['Eve','Ben','Finn'],['Finn','Dev','Finn*'],['Gus','Ana','Dev'],['Hana','Ben','Finn']];
    h += `<div class="slate"><div class="h">Who sent them</div><table>
      <thead><tr><th></th><th>Runner</th><th>Guide</th></tr></thead><tbody>` +
      rows.map(([v,r,g])=>`<tr><th>${esc(v)}</th>
        <td>${r==='—'?'<span class="dm">—</span>':esc(r)}</td>
        <td>${g==='—'?'<span class="dm">—</span>':g.endsWith('*')?esc(g.slice(0,-1))+' <span class="self">SELF</span>':esc(g)}</td></tr>`).join('') +
      `</tbody></table></div>`;
  }
  if (p.tvRecord) {
    h += `<div class="slate"><div class="h">The vote &middot; 4 to swing</div><table><tbody>
      <tr><th>Finn</th><td class="bad">4</td></tr>
      <tr><th>Gus</th><td class="dm">2</td></tr>
      <tr><th>Abstained</th><td class="dm">1</td></tr>
      </tbody></table></div>`;
  }
  if (p.tvNoms) h += `<div class="noms">${p.tvNoms.map(([t,n])=>`<div class="n"><b>${esc(t)}</b> — put up by ${esc(n)}</div>`).join('')}</div>`;
  if (p.tvRoll) h += `<div class="roll">${CAST.map(c=>`<div>${esc(c.name)}<span>${esc(c.truly)}</span></div>`).join('')}</div>`;
  return h;
}

/** The expedition is the one phase the television is a rendered shot rather than a card. */
function tvShot() {
  return `<div class="shot">
    <svg viewBox="0 0 820 250" preserveAspectRatio="none" class="shotsvg">
      <defs><linearGradient id="fl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1a2130"/><stop offset="1" stop-color="#0c1017"/></linearGradient></defs>
      <rect width="820" height="250" fill="url(#fl)"/>
      <path d="M0 168 L820 168 L820 250 L0 250Z" fill="#12161f"/>
      <path d="M120 168 L215 46 L605 46 L700 168Z" fill="#161b25" stroke="#242c3c"/>
      <path d="M215 46 L215 168 M605 46 L605 168" stroke="#242c3c"/>
      <rect x="352" y="96" width="66" height="72" fill="#0d1017" stroke="#2a3244"/>
      <g opacity=".92"><rect x="392" y="150" width="34" height="52" rx="5" fill="#2b3446" stroke="#3c485e"/>
        <circle cx="409" cy="142" r="13" fill="#333d52" stroke="#46536b"/>
        <circle cx="409" cy="142" r="4" fill="#4cc27a"/></g>
      <g opacity=".55"><rect x="560" y="128" width="30" height="46" rx="4" fill="#241c22" stroke="#3a2830"/>
        <circle cx="575" cy="120" r="11" fill="#2c2028" stroke="#452e37"/>
        <circle cx="575" cy="120" r="3.4" fill="#e4483a"/></g>
    </svg>
    <div class="shot-hud"><span class="cam">CAM 2 · GALLERY</span><span class="clk">0:41</span></div>
  </div>`;
}

const NO_PAIR = new Set(['Premiere', 'Casting']);

function artboard(p, i) {
  const phones = CAST.map((s) => phone(s, p.phone(s), !NO_PAIR.has(p.id))).join('');
  return `<script src="./support.js"></script>
<div class="board"><style>${CSS}</style>
  <div class="hd">
    <div class="l">
      <div class="ph-n">${String(i+1).padStart(2,'0')} · ${esc(p.ep)}</div>
      <h2>${esc(p.name)}${p.tvNew ? '<span class="badge">changed today</span>' : ''}</h2>
      <p>${p.role}</p>
    </div>
    <div class="r"><div class="s">${esc(p.secs)}</div><div class="u">seconds</div></div>
  </div>
  <div class="tvwrap"><div class="tv">${tvBody(p)}</div></div>
  ${p.newOnClose ? `<div class="oncl">${p.newOnClose}</div>` : ''}
  <div class="rail-h">the eight phones</div>
  <div class="rail">${phones}</div>
  <div class="note">${p.note}</div>
</div>`;
}

const files = [];
PHASES.forEach((p, i) => {
  const name = (i === 0 ? 'Main' : p.id) + '.dc.html';
  writeFileSync(name, artboard(p, i));
  files.push({ file:name, id:p.id });
});

// canvas.json — two rows of five, in running order
const W = 1420, H = 1075, GX = 130, GY = 210;
const boards = files.map((f, i) => ({
  file: f.file, x: (i % 5) * (W + GX), y: Math.floor(i / 5) * (H + GY), w: W, h: H,
  title: PHASES[i].name,
}));
writeFileSync('canvas.json', JSON.stringify({
  artboards: boards,
  annotations: [
    { id:'how', x:0, y:-170, w:640,
      text:'One episode, eight players, read left to right. The television is the shared screen; the eight phones below it are what each seat is actually holding at that moment. Copy is lifted verbatim from show-tv.html and show-phone.html.' },
    { id:'deal', x:760, y:-170, w:640,
      text:'The deal: Ana Continuity · Ben Camera Op · Cass Focus Puller · Dev Editor · Eve GLITCHED, covered as Continuity · Finn The Static · Gus The Plant (evil) · Hana The Producer (evil). Ben runs, Finn guides.' },
  ],
  launch: { view:'canvas' },
}, null, 2));
console.log('wrote', files.length, 'artboards +', 'canvas.json');
