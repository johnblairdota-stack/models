/**
 * Builds every .dc.html artboard for the Prime Time loop redesign from ONE shared chrome
 * vocabulary. The whole point of the redesign is continuity Lobby -> Reunion, so the chrome
 * lives in one place here and every beat spends it the same way.
 *
 *   node docs/design/refs-loop-redesign/artboards/_build.mjs
 *
 * Colour names match src/party/palette.js so the implementation maps 1:1.
 * Two values are PROPOSED and not in palette.js yet: --rec and --scrim (see the token table
 * in prime-time-loop-redesign-plan.md).
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

/* ---------------------------------------------------------------- tokens */

const T = `
      --bg:#0c0a08; --deep:#080604; --panel:#161310; --well:#12100c;
      --accent:#f5a14a; --accent-rgb:245,161,74;
      --ink:#f3ece3; --soft:#a89884; --dim:#8a7d70;
      --live:#9ff2c8; --live-well:#122019;
      --bad:#ff8a7a; --bad-rgb:255,138,122;
      --rec:#e8452f;                       /* PROPOSED: the on-air dot. --bad is a text salmon. */
      --scrim:rgba(8,6,4,.78);             /* PROPOSED: safe-area bed over live picture */
`;

/* ------------------------------------------------------------ shared css */

export const CSS = `
    *{box-sizing:border-box;margin:0;padding:0;}
    :root{${T}    }
    body{width:1280px;height:720px;overflow:hidden;background:var(--bg);color:var(--ink);
      font-family:'Archivo',ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased;
      font-variant-numeric:tabular-nums;}
    a{color:var(--accent);} a:hover{color:#ffc07f;}

    /* THE FRAME ------------------------------------------------------- */
    .tv{position:relative;width:1280px;height:720px;display:flex;flex-direction:column;
      background:radial-gradient(900px 520px at 50% -8%,rgba(var(--accent-rgb),.10),transparent 58%),var(--bg);}

    /* TOP BAR — brand, on-air dot, episode, beat, clock ---------------- */
    .bar{flex:0 0 auto;height:46px;display:flex;align-items:center;justify-content:space-between;
      padding:0 30px;gap:20px;}
    .brand{display:flex;align-items:center;gap:10px;}
    .brand .mark{font-size:15px;font-weight:900;letter-spacing:.22em;color:var(--accent);}
    .rec{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:800;letter-spacing:.20em;
      color:var(--ink);}
    .rec i{width:9px;height:9px;border-radius:50%;background:var(--rec);display:block;
      box-shadow:0 0 0 3px rgba(232,69,47,.22);}
    .barR{display:flex;align-items:center;gap:16px;}
    .ep{font-size:13px;font-weight:700;letter-spacing:.20em;color:var(--dim);}
    .clock{font-size:34px;font-weight:900;letter-spacing:.01em;line-height:1;color:var(--ink);}
    .clock.hot{color:var(--accent);}

    /* THE RUNDOWN RAIL — the whole shooting schedule, always on screen -- */
    .rail{flex:0 0 auto;display:flex;gap:3px;height:50px;padding:0 30px 10px;}
    .rail .b{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:6px;
      padding:0 10px 7px;border-bottom:3px solid rgba(var(--accent-rgb),.16);position:relative;}
    .rail .b span{font-size:13px;font-weight:800;letter-spacing:.14em;color:#544a40;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .rail .b.done span{color:var(--dim);}
    .rail .b.done{border-bottom-color:rgba(var(--accent-rgb),.34);}
    .rail .b.now span{color:var(--accent);}
    .rail .b.now{border-bottom-color:rgba(var(--accent-rgb),.28);}
    .rail .b.now::after{content:"";position:absolute;left:0;bottom:-3px;height:3px;
      background:var(--accent);box-shadow:0 0 12px rgba(var(--accent-rgb),.7);}

    /* Slim variant — over live picture the rail gives the frame its height back */
    .rail.thin{height:22px;padding:0 30px 6px;}
    .rail.thin .b{padding-bottom:4px;}
    .rail.thin .b span{display:none;}
    .rail.thin .b.now span{display:block;font-size:11px;letter-spacing:.16em;}

    /* STAGE ----------------------------------------------------------- */
    .stage{flex:1;min-height:0;position:relative;padding:0 30px;}
    .stage.bleed{padding:0;}
    .plate{position:absolute;inset:0;overflow:hidden;background:#05070a;}
    .plate img{width:100%;height:100%;object-fit:cover;display:block;}
    .plate.dim img{filter:brightness(.30) saturate(.7);}
    .scrimT{position:absolute;left:0;right:0;top:0;height:120px;
      background:linear-gradient(180deg,var(--scrim),transparent);}
    .scrimB{position:absolute;left:0;right:0;bottom:0;height:190px;
      background:linear-gradient(0deg,var(--scrim) 30%,transparent);}

    /* LOWER THIRD — one nameplate language, Lobby to Reunion ----------- */
    .lt{position:absolute;left:30px;bottom:22px;display:flex;align-items:center;gap:16px;}
    .lt .chev{width:52px;height:52px;flex:0 0 auto;}
    .lt .who{font-size:46px;font-weight:900;line-height:1;letter-spacing:-.01em;}
    .lt .role{margin-top:7px;display:flex;align-items:center;gap:9px;font-size:13px;font-weight:800;
      letter-spacing:.20em;color:var(--live);}
    .lt .role b{color:var(--soft);font-weight:800;}
    .cam{position:absolute;right:30px;bottom:30px;display:flex;align-items:center;gap:9px;
      font-size:13px;font-weight:800;letter-spacing:.20em;color:var(--soft);}
    .cam i{width:8px;height:8px;border-radius:50%;background:var(--rec);}

    /* TYPE RAMP ------------------------------------------------------- */
    .hero{font-size:132px;font-weight:900;line-height:.88;letter-spacing:-.025em;}
    .big{font-size:74px;font-weight:900;line-height:.94;letter-spacing:-.015em;}
    .name{font-size:44px;font-weight:800;line-height:1;}
    .beat{font-size:30px;font-weight:900;letter-spacing:.10em;text-transform:uppercase;}
    .body{font-size:20px;font-weight:500;color:var(--soft);line-height:1.35;}
    .lab{font-size:13px;font-weight:800;letter-spacing:.20em;text-transform:uppercase;color:var(--dim);}
    .mint{color:var(--live);} .salmon{color:var(--bad);} .amber{color:var(--accent);}

    /* PANELS ---------------------------------------------------------- */
    .card{background:var(--panel);border:1px solid rgba(var(--accent-rgb),.16);border-radius:10px;}
    .card.lit{border-color:var(--accent);box-shadow:0 0 0 1px rgba(var(--accent-rgb),.30);}

    /* BOTTOM STRIP ---------------------------------------------------- */
    .strip{flex:0 0 auto;height:76px;display:flex;flex-direction:column;align-items:center;
      justify-content:center;gap:5px;padding:0 30px;}
    .strip .line{font-size:26px;font-weight:800;letter-spacing:-.005em;}
    .strip .facts{font-size:13px;font-weight:700;letter-spacing:.20em;color:var(--dim);
      text-transform:uppercase;}
`;

/* -------------------------------------------------------------- helpers */

/** The nameplate chevron — one shape, reused as the show's only icon. */
export const chev = (fill = 'var(--accent)', size = 52) => `<svg class="chev" width="${size}" height="${size}" viewBox="0 0 52 52" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="50" height="50" rx="9" fill="${fill}" opacity=".16"/>
        <rect x="1" y="1" width="50" height="50" rx="9" stroke="${fill}" stroke-width="2"/>
        <path d="M18 26 26 17 34 26 26 35Z" fill="${fill}"/>
      </svg>`;

/**
 * A robot face chip. STYLE_CONTRACT §2 says nine colours and no more, so every robot on the
 * board is the SAME robot — identity is carried by the nameplate, never by a player colour.
 */
export const face = (px = 64, state = 'on') => {
  const shell = state === 'out' ? '#4a4c4e' : '#EDEFF0';
  const glass = state === 'out' ? '#1b2531' : '#2659A0';
  const lite = state === 'out' ? '#2e3a48' : '#7EBDF0';
  const mint = state === 'out' ? '#41504c' : '#8FC9BD';
  return `<svg width="${px}" height="${px}" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <rect x="9" y="6" width="46" height="48" rx="17" fill="${shell}"/>
          <rect x="15" y="16" width="34" height="22" rx="11" fill="${glass}"/>
          <circle cx="25" cy="27" r="4.2" fill="${lite}"/><circle cx="39" cy="27" r="4.2" fill="${lite}"/>
          <rect x="6" y="44" width="52" height="8" rx="4" fill="${mint}"/>
        </svg>`;
};

/** A stand-in QR block — deterministic noise plus the three finder eyes, so it reads as a code. */
const qr = (px = 150) => {
  const N = 21, cells = [];
  const eye = (r, c) => (r < 7 && c < 7) || (r < 7 && c > 13) || (r > 13 && c < 7);
  let s = 7;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    if (!eye(r, c) && (s >> 16) % 100 < 46) cells.push(`<rect x="${c}" y="${r}" width="1" height="1"/>`);
  }
  const finder = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#f4efe6"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
  return `<svg width="${px}" height="${px}" viewBox="0 0 21 21" fill="#0c0a08" shape-rendering="crispEdges" aria-hidden="true">
          ${cells.join('')}${finder(0, 0)}${finder(14, 0)}${finder(0, 14)}
        </svg>`;
};

const BEATS = ['CASTING', 'EXPEDITION', 'RECAP', 'DEBRIEF', 'RECKONING', 'VOTE', 'EXECUTION', 'VERDICT'];

/** The rail. `now` is a beat name or null (lobby / reunion sit outside the episode). */
export const rail = (now, { thin = false, pct = 40 } = {}) => {
  const i = BEATS.indexOf(now);
  return `<div class="rail${thin ? ' thin' : ''}">${BEATS.map((b, n) => {
    const cls = n === i ? 'b now' : n < i ? 'b done' : 'b';
    const fill = n === i ? `<style>.rail .b.now::after{width:${pct}%;}</style>` : '';
    return `<div class="${cls}">${fill}<span>${b}</span></div>`;
  }).join('')}</div>`;
};

export const bar = (right) => `<div class="bar">
      <div class="brand"><div class="mark">PRIME TIME</div><div class="rec"><i></i>ON AIR</div></div>
      <div class="barR">${right}</div>
    </div>`;

export const clock = (t, hot = false) => `<div class="clock${hot ? ' hot' : ''}">${t}</div>`;
export const ep = (n, beat) => `<div class="ep">EPISODE ${n} &middot; ${beat}</div>`;

/** Wrap a body into a complete .dc.html artboard. */
export const doc = (inner) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&display=swap">
  <style>${CSS}  </style>
</helmet>
${inner}
</x-dc>
</body>
</html>
`;

export const write = (name, inner) => {
  fs.writeFileSync(path.join(OUT, name), doc(inner), 'utf8');
  return name;
};

/* ================================================================ PAGE 1
   Three directions, all drawn on the SAME beat — Expedition — because that is
   where chrome and picture actually fight for the screen.
   ====================================================================== */

/* A — CAMERA BUG. The picture is the show; chrome shrinks to a corner bug. */
write('DirectionA.dc.html', `<div class="tv">
  <div class="stage bleed">
    <div class="plate"><img src="plate-chase.jpg" alt=""></div>
    <div class="scrimT"></div>
    <div class="scrimB"></div>

    <div style="position:absolute;left:30px;top:24px;display:flex;align-items:center;gap:12px;">
      <div class="rec"><i></i>ON AIR</div>
      <div class="mark" style="font-size:14px;font-weight:900;letter-spacing:.22em;color:var(--accent);">PRIME TIME</div>
    </div>
    <div style="position:absolute;right:30px;top:22px;text-align:right;">
      <div class="lab" style="color:var(--soft);">EP 2 &middot; EXPEDITION</div>
      <div class="clock" style="font-size:30px;margin-top:4px;">1:04</div>
    </div>

    <div class="lt">
      ${chev()}
      <div>
        <div class="who">Ellie</div>
        <div class="role">RUNNER <b>&middot; ON THE FLOOR</b></div>
      </div>
    </div>
    <div class="cam"><i></i>RRR CAM 01</div>
  </div>
</div>`);

/* B — RUNDOWN RAIL. The shooting schedule is the game, so it is always on screen. */
write('DirectionB.dc.html', `<div class="tv">
  ${bar(`${ep(2, 'EXPEDITION')}${clock('1:04')}`)}
  ${rail('EXPEDITION', { thin: true, pct: 31 })}
  <div class="stage bleed">
    <div class="plate"><img src="plate-chase.jpg" alt=""></div>
    <div class="scrimB"></div>
    <div class="lt">
      ${chev()}
      <div>
        <div class="who">Ellie</div>
        <div class="role">RUNNER <b>&middot; ON THE FLOOR</b></div>
      </div>
    </div>
    <div class="cam"><i></i>RRR CAM 01</div>
  </div>
  <div class="strip">
    <div class="line">Ellie walks. Ozz talks.</div>
    <div class="facts">CAMERAS 2 / 2 &middot; ALARMS 2 &middot; SMASH ARMED</div>
  </div>
</div>`);

/* C — STUDIO CARD. Loudest. The picture is a plate inside a built set. */
write('DirectionC.dc.html', `<div class="tv" style="background:var(--deep);">
  <div style="display:flex;height:720px;">
    <div style="flex:0 0 210px;background:var(--accent);color:#1a1208;display:flex;flex-direction:column;
      justify-content:space-between;padding:26px 22px;">
      <div style="font-size:15px;font-weight:900;letter-spacing:.22em;">PRIME&nbsp;TIME</div>
      <div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:62px;font-weight:900;
        line-height:1;letter-spacing:.02em;margin:8px 0;">EXPEDITION</div>
      <div>
        <div style="font-size:13px;font-weight:800;letter-spacing:.20em;opacity:.66;">TIME LEFT</div>
        <div style="font-size:78px;font-weight:900;line-height:.9;letter-spacing:-.02em;">1:04</div>
        <div style="font-size:13px;font-weight:800;letter-spacing:.20em;opacity:.66;margin-top:8px;">EPISODE 2 OF 5</div>
      </div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;padding:26px 30px 24px;gap:16px;min-width:0;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div class="rec"><i></i>LIVE FROM THE MANSION</div>
        <div class="lab" style="color:var(--soft);">RRR CAM 01</div>
      </div>
      <div class="plate" style="position:relative;flex:1;border-radius:8px;border:2px solid rgba(var(--accent-rgb),.42);">
        <img src="plate-chase.jpg" alt="">
      </div>
      <div style="display:flex;align-items:center;gap:16px;">
        ${chev('var(--accent)', 56)}
        <div style="flex:1;">
          <div class="name" style="font-size:48px;">Ellie</div>
          <div class="role" style="margin-top:6px;display:flex;gap:9px;font-size:13px;font-weight:800;
            letter-spacing:.20em;color:var(--live);">RUNNER <b style="color:var(--soft);">&middot; OZZ IS GUIDING</b></div>
        </div>
        <div style="text-align:right;">
          <div class="lab">ALARMS</div>
          <div style="font-size:38px;font-weight:900;line-height:1;">2</div>
        </div>
      </div>
    </div>
  </div>
</div>`);

/* ================================================================ PAGE 2
   The whole night in the leading direction (B — Rundown Rail).
   ====================================================================== */

/* --- EXPEDITION (the entry artboard) ---------------------------------- */
write('Main.dc.html', `<div class="tv">
  ${bar(`${ep(2, 'EXPEDITION')}${clock('1:04')}`)}
  ${rail('EXPEDITION', { thin: true, pct: 31 })}
  <div class="stage bleed">
    <div class="plate"><img src="plate-chase.jpg" alt=""></div>
    <div class="scrimB"></div>

    <div style="position:absolute;left:30px;top:18px;display:flex;gap:10px;align-items:center;">
      <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:5px;
        background:rgba(159,242,200,.12);border:1px solid rgba(159,242,200,.42);">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--live);display:block;"></span>
        <span style="font-size:13px;font-weight:800;letter-spacing:.18em;color:var(--live);">SMASH ARMED</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:5px;
        background:rgba(255,138,122,.10);border:1px solid rgba(255,138,122,.36);">
        <span style="font-size:13px;font-weight:800;letter-spacing:.18em;color:var(--bad);">ALARMS 2</span>
      </div>
    </div>

    <div class="lt">
      ${chev()}
      <div>
        <div class="who">Ellie</div>
        <div class="role">RUNNER <b>&middot; OZZ IS GUIDING</b></div>
      </div>
    </div>
    <div class="cam"><i></i>RRR CAM 01</div>
  </div>
  <div class="strip">
    <div class="line">Find the gallery. Break the painting.</div>
    <div class="facts">CAMERAS 2 / 2 &middot; THE MAP IS ON OZZ&#39;S PHONE, NOT ON THIS SCREEN</div>
  </div>
</div>`);

/* --- LOBBY ------------------------------------------------------------ */
const SEATS = [
  { n: 'John', on: 1 }, { n: 'Ellie', on: 1 }, { n: 'Ozz', on: 1 }, { n: 'Mara', on: 1 },
  { n: 'Bex', on: 1 }, { n: 'Tobi', on: 0 }, { n: 'Nils', on: 0 }, { n: 'Ada', on: 0 },
];
/**
 * Seated circle: eight chairs on a ring with the ring actually DRAWN, because eight faces on an
 * invisible ellipse read as scatter, not as a table. Seats fill clockwise from the top.
 */
const circle = `<div style="position:absolute;left:50%;top:262px;transform:translate(-50%,-50%);
      width:352px;height:298px;border:1px solid rgba(var(--accent-rgb),.20);border-radius:50%;"></div>
    <div style="position:absolute;left:50%;top:262px;transform:translate(-50%,-50%);width:236px;height:198px;
      border-radius:50%;background:radial-gradient(closest-side,rgba(var(--accent-rgb),.10),transparent);"></div>
    ${SEATS.map((s, i) => {
  const a = (-90 + i * 45) * Math.PI / 180;
  const x = 230 + Math.cos(a) * 176, y = 262 + Math.sin(a) * 149;
  return `<div style="position:absolute;left:${(x - 55).toFixed(0)}px;top:${(y - 46).toFixed(0)}px;width:110px;
        display:flex;flex-direction:column;align-items:center;gap:4px;${s.on ? '' : 'opacity:.38;'}">
        ${face(50, s.on ? 'on' : 'out')}
        <div style="font-size:${s.on ? 21 : 18}px;font-weight:800;line-height:1;white-space:nowrap;">${s.on ? s.n : 'Robot ' + (i + 1)}</div>
        <div style="font-size:13px;font-weight:800;letter-spacing:.16em;color:${s.on ? 'var(--live)' : 'var(--dim)'};">${s.on ? 'SEATED' : 'EMPTY'}</div>
      </div>`;
}).join('')}`;

write('Lobby.dc.html', `<div class="tv">
  ${bar(`<div class="ep">PRE-SHOW &middot; LOBBY</div>`)}
  ${rail(null)}
  <div class="stage" style="display:flex;gap:34px;align-items:stretch;">
    <div style="position:relative;flex:0 0 500px;">${circle}</div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:20px;min-width:0;">
      <div>
        <div class="lab">JOIN ON YOUR PHONE &middot; ROOM CODE</div>
        <div style="font-size:104px;font-weight:900;letter-spacing:.20em;line-height:1;margin-top:6px;">RB42</div>
      </div>
      <div style="display:flex;gap:22px;align-items:center;">
        <div style="background:#f4efe6;border-radius:8px;padding:11px;flex:0 0 auto;line-height:0;">${qr(150)}</div>
        <div style="min-width:0;">
          <div class="body" style="color:var(--ink);font-weight:700;font-size:22px;">Two of you go in.<br>One walks, one talks.</div>
          <div class="body" style="margin-top:8px;">The rest of us watch. Someone here is lying.</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:18px;">
        <div style="background:var(--accent);color:#1a1208;font-size:21px;font-weight:900;letter-spacing:.14em;
          padding:19px 30px;border-radius:7px;">START THE NIGHT</div>
        <div>
          <div style="font-size:20px;font-weight:800;">5 phones live</div>
          <div class="lab" style="margin-top:3px;">EMPTY CHAIRS STAY EMPTY</div>
        </div>
      </div>
    </div>
  </div>
  <div class="strip">
    <div class="facts" style="letter-spacing:.20em;">WARMING THE MANSION &middot; 84%</div>
    <div style="width:520px;height:5px;border-radius:3px;background:rgba(var(--accent-rgb),.18);overflow:hidden;">
      <div style="width:84%;height:100%;background:var(--accent);"></div>
    </div>
  </div>
</div>`);

/* --- CASTING ---------------------------------------------------------- */
write('Casting.dc.html', `<div class="tv">
  ${bar(`${ep(2, 'CASTING')}${clock('0:12', true)}`)}
  ${rail('CASTING', { pct: 73 })}
  <div class="stage" style="display:flex;flex-direction:column;gap:14px;">
    <div class="card" style="padding:16px 24px;display:flex;align-items:center;gap:26px;">
      <div><div class="lab">TONIGHT&#39;S MISSION</div>
        <div style="font-size:34px;font-weight:900;line-height:1;margin-top:5px;">Break the painting</div></div>
      <div style="width:1px;height:46px;background:rgba(var(--accent-rgb),.20);"></div>
      <div><div class="lab">WING</div>
        <div style="font-size:34px;font-weight:900;line-height:1;margin-top:5px;">The Gallery</div></div>
      <div style="margin-left:auto;text-align:right;">
        <div class="lab">SAT OUT LAST EPISODE</div>
        <div style="font-size:19px;font-weight:800;margin-top:5px;color:var(--soft);">Mara &middot; Bex</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;flex:0 0 auto;">
      <div class="card lit" style="padding:20px 26px;display:flex;flex-direction:column;gap:9px;">
        <div class="lab" style="color:var(--accent);">CAST AS RUNNER</div>
        <div style="display:flex;align-items:center;gap:16px;">
          ${face(66)}
          <div class="hero" style="font-size:66px;">Ellie</div>
        </div>
        <div class="body" style="font-size:19px;">Walks the house. Holds the hammer. Cannot see the map.</div>
      </div>
      <div class="card lit" style="padding:20px 26px;display:flex;flex-direction:column;gap:9px;">
        <div class="lab" style="color:var(--accent);">CAST AS GUIDE</div>
        <div style="display:flex;align-items:center;gap:16px;">
          ${face(66)}
          <div class="hero" style="font-size:66px;">Ozz</div>
        </div>
        <div class="body" style="font-size:19px;">Gets the map on their phone. Talks. Never on this screen.</div>
      </div>
    </div>

    <div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:9px;">
      <div class="lab">BALLOTS, IN THE AIR</div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
        ${[['John', 'Ellie', 'Ozz'], ['Ellie', 'Ellie', 'Ozz'], ['Ozz', 'Ellie', 'Bex'],
    ['Mara', 'Ellie', null], ['Bex', 'Mara', 'Ozz']].map(([who, r, g]) => `
        <div class="card" style="flex:1;padding:0 20px;display:flex;align-items:center;gap:20px;">
          <div style="flex:0 0 96px;font-size:23px;font-weight:900;line-height:1;">${who}</div>
          <div style="flex:0 0 1px;height:26px;background:rgba(var(--accent-rgb),.16);"></div>
          <div style="flex:1;display:flex;align-items:baseline;gap:12px;">
            <span class="lab" style="font-size:12px;flex:0 0 76px;">RUNNER</span>
            <span style="font-size:23px;font-weight:800;color:${r === 'Ellie' ? 'var(--accent)' : 'var(--soft)'};">${r}</span>
          </div>
          <div style="flex:1;display:flex;align-items:baseline;gap:12px;">
            <span class="lab" style="font-size:12px;flex:0 0 66px;">GUIDE</span>
            <span style="font-size:23px;font-weight:800;color:${g === 'Ozz' ? 'var(--accent)' : g ? 'var(--soft)' : 'var(--bad)'};">${g || 'REFUSED THE CHAIR'}</span>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </div>
  <div class="strip">
    <div class="line">Ballots are in. Send them in.</div>
    <div class="facts">5 OF 5 PHONES VOTED</div>
  </div>
</div>`);

/* --- RECAP ------------------------------------------------------------ */
const recapRow = (lab, val, tone) => `<div class="card" style="flex:1;padding:22px 24px;display:flex;
      flex-direction:column;gap:9px;min-width:0;">
      <div class="lab">${lab}</div>
      <div style="font-size:52px;font-weight:900;line-height:.96;letter-spacing:-.02em;color:${tone};">${val}</div>
    </div>`;

write('Recap.dc.html', `<div class="tv">
  ${bar(`${ep(2, 'RECAP')}${clock('0:08', true)}`)}
  ${rail('RECAP', { pct: 60 })}
  <div class="stage bleed" style="position:relative;">
    <div class="plate dim"><img src="plate-chase.jpg" alt=""></div>
    <div style="position:absolute;inset:0;padding:14px 30px 20px;display:flex;flex-direction:column;gap:14px;">
      <div style="display:flex;align-items:baseline;gap:18px;">
        <div class="beat" style="color:var(--accent);">THAT WAS THE RUN</div>
        <div class="lab">ELLIE WALKED &middot; OZZ TALKED &middot; 1 MIN 42 SEC</div>
      </div>
      <div style="flex:1;display:flex;gap:14px;">
        ${recapRow('OUTCOME', 'SMASHED', 'var(--live)')}
        ${recapRow('CAMERA', 'STAYED DARK', 'var(--bad)')}
        ${recapRow('RUNNER', 'CAME BACK', 'var(--live)')}
      </div>
      <div style="flex:1;display:flex;gap:14px;">
        ${recapRow('ALARMS TRIPPED', '2', 'var(--ink)')}
        ${recapRow('HUNTER GOT WITHIN', '4 m', 'var(--bad)')}
        ${recapRow('ROOMS CALLED', '6', 'var(--ink)')}
      </div>
    </div>
  </div>
  <div class="strip">
    <div class="line">Phones down. Debrief is next.</div>
    <div class="facts">NOBODY&#39;S ALIGNMENT IS REVEALED UNTIL THE REUNION</div>
  </div>
</div>`);

/* --- DEBRIEF ---------------------------------------------------------- */
const seatRow = (people, opt = {}) => `<div style="display:flex;gap:${opt.gap || 12}px;justify-content:center;align-items:flex-end;">
    ${people.map((p) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;
      ${p.up ? 'transform:translateY(-22px);' : ''}${p.out ? 'opacity:.38;' : ''}">
      ${p.up ? `<div style="font-size:12px;font-weight:800;letter-spacing:.18em;color:var(--accent);">STANDING</div>` : ''}
      <div style="${p.up ? 'box-shadow:0 0 0 3px var(--accent);border-radius:14px;' : ''}">${face(opt.px || 62, p.out ? 'out' : 'on')}</div>
      <div style="font-size:${opt.nm || 22}px;font-weight:800;line-height:1;">${p.n}</div>
      <div style="font-size:12px;font-weight:800;letter-spacing:.16em;height:14px;color:${p.tone || 'var(--dim)'};">${p.sub || ''}</div>
    </div>`).join('')}
  </div>`;

write('Debrief.dc.html', `<div class="tv">
  ${bar(`${ep(2, 'DEBRIEF')}${clock('0:47')}`)}
  ${rail('DEBRIEF', { pct: 37 })}
  <div class="stage bleed" style="position:relative;">
    <div class="plate dim"><img src="plate-chase.jpg" alt=""></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
      justify-content:center;gap:6px;">
      <div class="lab" style="color:var(--accent);">TALK IT OUT &middot; PHONES DOWN</div>
      <div class="hero" style="font-size:158px;">0:47</div>
      <div class="body" style="font-size:23px;color:var(--ink);font-weight:700;">Ellie says the camera was already dead.</div>
    </div>
    <div style="position:absolute;left:0;right:0;bottom:20px;">
      ${seatRow([{ n: 'John' }, { n: 'Ellie', sub: 'RAN', tone: 'var(--live)' }, { n: 'Ozz', sub: 'GUIDED', tone: 'var(--live)' },
  { n: 'Mara' }, { n: 'Bex' }], { px: 58, nm: 21 })}
    </div>
  </div>
  <div class="strip">
    <div class="facts">NOMINATIONS OPEN ON YOUR PHONE IN 27 SECONDS</div>
  </div>
</div>`);

/* --- RECKONING -------------------------------------------------------- */
write('Reckoning.dc.html', `<div class="tv">
  ${bar(`${ep(2, 'RECKONING')}${clock('0:31')}`)}
  ${rail('RECKONING', { pct: 45 })}
  <div class="stage" style="display:flex;flex-direction:column;gap:16px;">
    <div style="display:flex;align-items:baseline;gap:18px;">
      <div class="beat" style="color:var(--accent);">NAME SOMEONE</div>
      <div class="lab">YOU CANNOT NAME YOURSELF &middot; 2 OF 5 HAVE NAMED</div>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;">
      ${seatRow([{ n: 'John' }, { n: 'Ellie', up: 1 }, { n: 'Ozz' }, { n: 'Mara', up: 1 }, { n: 'Bex' }],
    { px: 132, nm: 36, gap: 40 })}
    </div>
    <div style="flex:0 0 auto;display:flex;gap:14px;">
      ${[['JOHN', 'Ellie', 'She was alone in the gallery for ten seconds.'],
    ['BEX', 'Mara', 'She refused the chair. Twice.']].map(([by, who, why]) => `
      <div class="card lit" style="flex:1;padding:15px 22px;display:flex;align-items:center;gap:16px;">
        ${chev('var(--accent)', 42)}
        <div style="flex:0 0 auto;">
          <div class="lab" style="white-space:nowrap;">NOMINATED BY ${by}</div>
          <div class="name" style="margin-top:4px;font-size:40px;">${who}</div>
        </div>
        <div class="body" style="margin-left:auto;text-align:right;font-size:19px;">&ldquo;${why}&rdquo;</div>
      </div>`).join('')}
    </div>
  </div>
  <div class="strip">
    <div class="facts">EACH NAME ADDS 15 SECONDS &middot; CAP 1:30</div>
  </div>
</div>`);

/* --- VOTE ------------------------------------------------------------- */
/**
 * A tally column. The votes are named out loud — a bare count on a television teaches nobody
 * anything, and "who voted for you" is the whole argument at the next Debrief.
 */
const tally = (n, need, voters) => {
  const hit = voters.length >= need;
  return `<div class="card${hit ? ' lit' : ''}"
      style="flex:1;padding:20px 22px 18px;display:flex;flex-direction:column;align-items:center;gap:12px;min-width:0;">
      ${face(72)}
      <div style="font-size:40px;font-weight:900;line-height:1;">${n}</div>
      <div style="display:flex;gap:7px;">
        ${Array.from({ length: need + 1 }, (_, i) => `<span style="width:18px;height:18px;border-radius:50%;
          ${i < voters.length ? 'background:var(--accent);' : 'background:transparent;border:2px solid rgba(var(--accent-rgb),.26);'}"></span>`).join('')}
      </div>
      <div style="width:100%;flex:1;display:flex;flex-direction:column;gap:7px;">
        ${voters.map((v) => `<div style="display:flex;align-items:center;gap:11px;padding:8px 13px;border-radius:6px;
          background:var(--well);">
          <span style="width:9px;height:9px;border-radius:50%;background:var(--accent);flex:0 0 auto;"></span>
          <span style="font-size:21px;font-weight:800;">${v}</span>
          <span class="lab" style="margin-left:auto;font-size:12px;">VOTED</span>
        </div>`).join('')}
      </div>
      <div style="font-size:15px;font-weight:900;letter-spacing:.18em;color:${hit ? 'var(--accent)' : 'var(--dim)'};">
        ${voters.length} OF ${need} NEEDED</div>
    </div>`;
};

write('Vote.dc.html', `<div class="tv">
  ${bar(`${ep(2, 'VOTE')}${clock('0:09', true)}`)}
  ${rail('VOTE', { pct: 64 })}
  <div class="stage" style="display:flex;flex-direction:column;gap:16px;">
    <div style="display:flex;align-items:baseline;gap:18px;">
      <div class="beat" style="color:var(--accent);">THE VOTE</div>
      <div class="lab">3 OF 5 LIVING IS A MAJORITY &middot; NOBODY VOTES FOR THEMSELVES</div>
    </div>
    <div style="flex:1;display:flex;gap:16px;align-items:stretch;">
      ${tally('Ellie', 3, ['John', 'Bex', 'Ozz'])}
      ${tally('Mara', 3, ['Ellie'])}
      <div class="card" style="flex:0 0 300px;padding:20px 22px;display:flex;flex-direction:column;gap:14px;">
        <div>
          <div class="lab">NOT YET VOTED</div>
          <div style="font-size:34px;font-weight:900;color:var(--soft);margin-top:5px;">Mara</div>
        </div>
        <div style="height:1px;background:rgba(var(--accent-rgb),.16);"></div>
        <div>
          <div class="lab">THE NOMINATOR SWINGS</div>
          <div class="body" style="color:var(--ink);margin-top:6px;font-size:19px;">A tie is broken by whoever named them &mdash; tonight that is <span class="amber">John</span>.</div>
        </div>
        <div style="margin-top:auto;">
          <div class="lab">NOBODY VOTES FOR THEMSELVES</div>
          <div class="body" style="margin-top:6px;font-size:18px;">Ellie&#39;s and Mara&#39;s own ballots cannot land on their own plate.</div>
        </div>
      </div>
    </div>
  </div>
  <div class="strip">
    <div class="line">Ellie has the majority.</div>
    <div class="facts">LOCKING IN 9 SECONDS</div>
  </div>
</div>`);

/* --- EXECUTION -------------------------------------------------------- */
write('Execution.dc.html', `<div class="tv">
  ${bar(`${ep(2, 'EXECUTION')}${clock('0:14')}`)}
  ${rail('EXECUTION', { pct: 30 })}
  <div class="stage" style="display:flex;align-items:center;justify-content:center;gap:60px;">
    <div style="text-align:right;max-width:430px;">
      <div class="lab">THE HOUSE HAS VOTED OFF</div>
      <div class="hero" style="font-size:118px;margin-top:8px;">Ellie</div>
      <div class="body" style="margin-top:14px;">Three votes to one. John named her, and John did not blink.</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;">
        ${['John', 'Bex', 'Ozz'].map((v) => `<span style="font-size:16px;font-weight:800;padding:8px 14px;
          border-radius:6px;background:var(--well);border:1px solid rgba(var(--accent-rgb),.20);">${v}</span>`).join('')}
      </div>
    </div>
    <div style="width:300px;height:420px;border-radius:14px;background:var(--well);
      border:2px solid rgba(var(--accent-rgb),.42);display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:18px;position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:
        repeating-linear-gradient(135deg,rgba(var(--accent-rgb),.09) 0 9px,transparent 9px 18px);"></div>
      <div style="position:relative;font-size:15px;font-weight:900;letter-spacing:.24em;color:var(--accent);">FACE DOWN</div>
      ${chev('var(--accent)', 92)}
      <div style="position:relative;text-align:center;padding:0 26px;">
        <div class="body" style="font-size:19px;">Her card is not turned over.</div>
        <div class="body" style="font-size:19px;color:var(--accent);font-weight:800;margin-top:6px;">Nobody learns a thing until the Reunion.</div>
      </div>
    </div>
  </div>
  <div class="strip">
    <div class="facts">4 PLAYERS LEFT &middot; VERDICT NEXT</div>
  </div>
</div>`);

/* --- VERDICT ---------------------------------------------------------- */
write('Verdict.dc.html', `<div class="tv" style="background:var(--deep);">
  ${bar(`${ep(2, 'VERDICT')}${clock('0:11')}`)}
  ${rail('VERDICT', { pct: 26 })}
  <div class="stage" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;">
    <div class="lab" style="color:var(--soft);">THE NETWORK HAS DECIDED</div>
    <div class="hero" style="font-size:196px;color:var(--live);">RENEWED</div>
    <div class="body" style="font-size:26px;color:var(--ink);font-weight:700;">The painting broke. The show goes another episode.</div>
    <div style="display:flex;gap:12px;margin-top:12px;">
      <div class="card" style="padding:14px 22px;"><span class="lab">EPISODES SHOT</span>
        <div style="font-size:32px;font-weight:900;margin-top:3px;">2 OF 5</div></div>
      <div class="card" style="padding:14px 22px;"><span class="lab">STILL IN THE HOUSE</span>
        <div style="font-size:32px;font-weight:900;margin-top:3px;">4</div></div>
      <div class="card" style="padding:14px 22px;opacity:.5;"><span class="lab">THE OTHER SLATE</span>
        <div style="font-size:32px;font-weight:900;margin-top:3px;color:var(--bad);">CANCELLED</div></div>
    </div>
  </div>
  <div class="strip">
    <div class="line">Casting opens in 11 seconds.</div>
    <div class="facts">EPISODE 3 &middot; TWO NEW CHAIRS</div>
  </div>
</div>`);

/* --- REUNION ---------------------------------------------------------- */
/** One turned card. The night's whole argument, settled: side, fate, and what they actually did. */
const roll = (n, side, note, out, log) => `<div class="card" style="padding:18px 16px 14px;display:flex;
      flex-direction:column;align-items:center;gap:8px;${out ? 'opacity:.74;' : ''}">
      ${face(68, out ? 'out' : 'on')}
      <div style="font-size:30px;font-weight:900;line-height:1;">${n}</div>
      <div style="font-size:16px;font-weight:900;letter-spacing:.14em;
        color:${side === 'PRODUCTION' ? 'var(--bad)' : 'var(--live)'};">${side}</div>
      <div style="font-size:13px;font-weight:700;letter-spacing:.10em;color:var(--dim);text-align:center;">${note}</div>
      <div style="width:100%;height:1px;background:rgba(var(--accent-rgb),.14);margin:4px 0 2px;"></div>
      <div style="width:100%;flex:1;display:flex;flex-direction:column;gap:5px;">
        ${log.map(([e, what]) => `<div style="display:flex;align-items:baseline;gap:9px;">
          <span class="lab" style="font-size:12px;flex:0 0 34px;">EP${e}</span>
          <span style="font-size:16px;font-weight:700;color:${what === '—' ? 'var(--dim)' : 'var(--soft)'};">${what}</span>
        </div>`).join('')}
      </div>
    </div>`;

write('Reunion.dc.html', `<div class="tv">
  ${bar(`<div class="ep">THE REUNION &middot; ROLL CALL</div>`)}
  ${rail(null)}
  <div class="stage" style="display:flex;flex-direction:column;gap:16px;">
    <div style="display:flex;align-items:baseline;gap:18px;">
      <div class="beat" style="color:var(--accent);">NOW EVERYONE TURNS THEIR CARD</div>
      <div class="lab">FIVE EPISODES &middot; THREE EVICTIONS</div>
    </div>
    <div style="flex:1;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;align-items:start;align-content:center;">
      ${roll('John', 'CAST', 'SURVIVED', 0, [[1, 'Runner'], [2, '—'], [3, 'Guide'], [4, '—'], [5, 'Runner']])}
      ${roll('Ellie', 'CAST', 'VOTED OFF EP 2', 1, [[1, 'Guide'], [2, 'Runner'], [3, '—'], [4, '—'], [5, '—']])}
      ${roll('Ozz', 'PRODUCTION', 'THE PRODUCER', 0, [[1, '—'], [2, 'Guide'], [3, 'Runner'], [4, 'Guide'], [5, '—']])}
      ${roll('Mara', 'CAST', 'VOTED OFF EP 4', 1, [[1, '—'], [2, 'Refused'], [3, 'Runner'], [4, '—'], [5, '—']])}
      ${roll('Bex', 'PRODUCTION', 'THE PLANT', 0, [[1, '—'], [2, '—'], [3, 'Guide'], [4, 'Runner'], [5, 'Guide']])}
    </div>
  </div>
  <div class="strip">
    <div class="line"><span class="salmon">Production wins.</span> Ozz ran the Hunter twice and never got named.</div>
    <div class="facts">THAT&#39;S A WRAP</div>
  </div>
</div>`);

/* ------------------------------------------------------------- manifest */

const A = (file, x, y, page) => ({ file, x, y, w: 1280, h: 720, page });

fs.writeFileSync(path.join(OUT, 'canvas.json'), JSON.stringify({
  pages: [
    { id: 'page-1', name: 'Pick a direction' },
    { id: 'page-2', name: 'The night — Rundown Rail' },
  ],
  artboards: [
    A('DirectionA.dc.html', 0, 0, 'page-1'),
    A('DirectionB.dc.html', 1400, 0, 'page-1'),
    A('DirectionC.dc.html', 2800, 0, 'page-1'),

    A('Lobby.dc.html', 0, 0, 'page-2'),
    A('Casting.dc.html', 1400, 0, 'page-2'),
    A('Main.dc.html', 2800, 0, 'page-2'),
    A('Recap.dc.html', 0, 900, 'page-2'),
    A('Debrief.dc.html', 1400, 900, 'page-2'),
    A('Reckoning.dc.html', 2800, 900, 'page-2'),
    A('Vote.dc.html', 0, 1800, 'page-2'),
    A('Execution.dc.html', 1400, 1800, 'page-2'),
    A('Verdict.dc.html', 2800, 1800, 'page-2'),
    A('Reunion.dc.html', 0, 2700, 'page-2'),
  ],
  annotations: [
    {
      id: 'dir-a', x: 0, y: -190, w: 460, page: 'page-1',
      text: 'A — CAMERA BUG\nChrome shrinks to a corner bug; the picture is the whole screen.\n\nWhy: the run is the only thing on the TV worth looking at.\nCost: someone walking in cannot tell the beat or the time from the couch. Problem 2 unsolved.',
    },
    {
      id: 'dir-b', x: 1400, y: -190, w: 460, page: 'page-1',
      text: 'B — RUNDOWN RAIL  (recommended)\nThe shooting schedule sits across the top all night. Current beat lit, its bar draining.\n\nWhy: fixes phase literacy and continuity in one move — same rail Lobby to Reunion.\nCost: 22px of picture during the run, and eight chips is real furniture.',
    },
    {
      id: 'dir-c', x: 2800, y: -190, w: 460, page: 'page-1',
      text: 'C — STUDIO CARD\nA built set: amber spine, beat name and clock set huge, picture inset as a plate.\n\nWhy: loudest and most readable across a room. Most obviously a show.\nCost: the picture loses about a third of the frame. Hard to sit through for 90 seconds of chase.',
    },
    {
      id: 'night-note', x: 0, y: -190, w: 520, page: 'page-2',
      text: 'THE NIGHT IN DIRECTION B\nOne rail, one nameplate, one clock, one colour code:\namber = the show · mint = true/alive · salmon = false/dark/gone.\n\nAsymmetry held: the guide map never appears here, and no plate reveals an alignment before the Reunion.',
    },
  ],
  launch: { view: 'canvas', page: 'page-1' },
}, null, 2), 'utf8');

console.log('built', fs.readdirSync(OUT).filter((f) => f.endsWith('.dc.html')).length, 'artboards + canvas.json');
