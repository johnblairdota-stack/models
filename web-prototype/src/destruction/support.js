/**
 * 🧱 **SUPPORT — WALL WITH NOTHING HOLDING IT UP COMES DOWN, AND THE CRAZING THAT SAYS SO FIRST.**
 *
 * John, 2026-08-09, after playing:
 *
 *   > *"I also want some extra pieces to break off if much of the wall has already been cleared
 *   > around it… like the Teardown game with the extra chunks flying off because it's no longer
 *   > supported by the rest of the structure. **This could create an efficiency for the player to
 *   > utilize as a skill to differentiate themselves. how effectively they can break down large
 *   > segments with the least hits.**"*
 *
 * …and then, 2026-08-10, after playing THAT:
 *
 *   > *"It does collapse everything unsupported but I think it **should not collapse the entire
 *   > wall from just hitting the bottom once in 1x dig mode**. I think instead when we blow through
 *   > and the below feels unsupported it should **also consider structural integrity of the other
 *   > connected parts of the wall**, and when **that falls below a certain threshold** that's when
 *   > **the collapse chains**."*
 *
 * ---------------------------------------------------------------------------
 * 🎯 **THE MODEL, IN TWO SENTENCES — THE ARCH.**
 * ---------------------------------------------------------------------------
 * **A wall arches over its holes.** Material with a hole anywhere beneath it in its own column is
 * not standing on the ground any more; it is *hanging*, carried sideways to the piers either side.
 * A wall tolerates that — a doorway is a hole and the wall above a doorway stands.
 *
 *  1. **THE COURSE.** A run of hole wider than `span` cannot be arched over locally, so the one
 *     course of material directly above it always comes away. It does NOT cascade: this is the
 *     crater eating upward a hand's width at a time, not a storey coming down.
 *  2. **THE ARCH.** Every connected piece of hanging material is weighed — `load`, the m² of
 *     original wall it is carrying, over the whole connected structure and not just over the cell
 *     the hammer hit. While that is under `fail` the arch holds. **Once one region's load reaches
 *     `fail` the arch gives** — and see THE SAG below for what "gives" now means.
 *  3. **THE LONELY RULE — John's "extra pieces".** A cell with almost nothing left around it drops
 *     out whatever the panel is doing. Small, constant, the crater's rim shedding chips.
 *
 * ---------------------------------------------------------------------------
 * 🧱 **THE SAG — WHAT "THE ARCH GIVES" MEANS AS OF 2026-08-10, AND WHY IT CHANGED.**
 * ---------------------------------------------------------------------------
 * John, after playing the arch:
 *
 *   > *"sometimes the whole structure above collapses in one moment and that can be satisfying
 *   > but it also **feels too uniform**. **I want the collapse to also feel more bit by bit.** the
 *   > sections all **falling down at once and in the same direction statically like a sheet**
 *   > isn't immersive either."*
 *
 * 🚨 **AND `critic-dig-8` MEASURED THE PART THAT MAKES IT STRUCTURAL RATHER THAN COSMETIC: THE
 * GRANULARITY WAS INVERTED.** On the shipped arch, `debris-collapse` C5's aimed undercut got
 * *"9 events totalling 450 cells, biggest 408"* — **91% of a skilled dig's material arrived in ONE
 * event** — while random scatter got **18 small course-sheds, biggest 18**. The bit-by-bit texture
 * John was asking for was what the game gave the player who could NOT aim. The event menu was
 * `0 plates → 1 (a course shed) → 5 → 14`, with nothing in between, **because the arch was a
 * binary by construction**: under `fail` it held everything, at `fail` it dropped everything.
 * ⚠️ **Lowering `fail` makes that worse, not more granular** — it fires the same all-or-nothing
 * event sooner. What was missing is *a middle-sized event a region can have more than once.*
 *
 * 🎯 **SO THE ARCH NOW GIVES IN STAGES, AND THE REGION HANGS BETWEEN THEM. THREE BEATS WHERE
 * THERE WAS ONE:**
 *
 *   **BEAT 1 — THE CUT.** Unchanged. The undercut widens, the crazing ramps `nearFrac` → 1.
 *   **BEAT 2 — IT SAGS.** The region's load reaches `fail`. It is marked **SAGGING** — a
 *     persistent per-cell flag (`f._sag`) that survives the blow — and it sheds its FIRST BITE,
 *     `bite` m² of itself, taken from around the blow that broke it. **The rest stays standing**:
 *     still solid, still blocking, still on the graph, and painted by `strain()` at a flat 1.0 so
 *     the whole piece that has let go is outlined on the wall. The player can walk away from it,
 *     stand under it and look at it. ⚠️ *Sagging material is still solid until it falls* — that is
 *     the safe answer to the passability question and it is what makes beat 3 necessary.
 *   **BEAT 3 — THE PULL.** A later blow whose brush REACHES the sagging region takes another
 *     `bite` out of it. Repeat until it is gone. A region that is left alone but goes on getting
 *     heavier lets go by itself at `pullFree × fail`, so a wall being worked can never become
 *     scenery.
 *
 * 📐 **WHAT THAT DOES TO THE MENU, ON THE SHIPPED LADDER** (`COLLAPSE.fail`'s own table,
 * 2.34 · 3.18 · 4.38 m²): blow 3 breaks the arch and takes 1.40 m² (~157 cells, five plates);
 * blows 4 and 5 take the rest. **A storey is three events of a middle size instead of one event
 * of 408 cells**, it costs 5 blows instead of 3, and the biggest single thing that happens is
 * about a third of what it was. `harness/scenarios/_sag1-grain.mjs` is the instrument and it
 * drives BOTH aiming policies, because a change that leaves scatter more textured than aim has
 * moved the problem rather than fixed it.
 *
 * ⚠️ **`sag: false` IS THE ABLATION AND IT IS THE SHIPPED-BEFORE BUILD, NOT AN APPROXIMATION OF
 * IT** — the branch below is the round-13 code, unmoved, so every instrument can take its own
 * before/after inside one page. `_sag1-grain` runs it as a control on every run and FAILS if the
 * ablated arm does not come back monolithic.
 *
 * 🚨 **WHAT THIS FIXED, AND THE NUMBER JOHN FELT.** The rule this replaces was the span sweep run
 * BOTTOM-UP with the cascade always live, so the first through-blow low on a face unzipped the
 * whole storey — *"the entire wall from just hitting the bottom once"*. Measured on the shipped
 * grid at ×1: **one bottom blow hangs 2.34 m² against a 3.40 m² threshold**, i.e. 69% of the way,
 * and hammering that same spot forever **stalls at 1.82 m² and never fires**. It takes a second
 * blow beside it (3.18 m², plus one course shed) and a third (4.38 m²) to bring the storey down.
 *
 * ---------------------------------------------------------------------------
 * 🚨 **SUPPORT, NOT CONNECTIVITY — `docs/design/disconnection.md` NAMES THE WRONG TEST.**
 * ---------------------------------------------------------------------------
 * That design drops material **fully severed** from the face by a connected-components flood
 * fill. It has been measured twice on the shipped grid and it is the wrong rule, not merely an
 * expensive one (`harness/scenarios/debris-collapse.mjs` C1, 220 blows × 3 seeds):
 *
 *   · connectivity severs **7 cells in 220 blows** — four components, largest 3 cells, i.e.
 *     **0.06 m² over a whole dig**, single chips at the rim that nothing could photograph;
 *   · support brings down hundreds in a handful of blows, in one slab.
 *
 * The reason is geometric and it will not change with tuning: a radial dig excavates a **bowl**.
 * The border ring of a span is always intact, so every surviving cell is still joined to the
 * house through the rim and a flood fill can never call it free. 🎯 **A cell with a hole under it
 * is UNSUPPORTED long before it is DISCONNECTED**, and a slab of wall standing over a hole is
 * still connected through its own two ends while it is quite plainly going to fall down.
 *
 * ⚠️ **THE FLOOD FILL IS STILL HERE — IT JUST FILLS THE RIGHT SET.** `arch()` finds connected
 * components of *hanging* material, not of *surviving* material. That is the one-word difference
 * between a test that fires on 7 cells in a whole dig and a test that decides the mechanic.
 *
 * `disconnection.md` §6 survives intact and is honoured by `views/game.js`'s payout: *"the piece
 * that falls is the piece that left, at the size it left."*
 *
 * ---------------------------------------------------------------------------
 * 🎯 **THE TELL IS THE RULE, ONE STEP EARLY — AND THAT IS WHY THEY SHARE THIS FILE.**
 * ---------------------------------------------------------------------------
 * *"If collapses look random there is no skill, only luck."* A player has to be able to form a
 * theory by watching, so the wall has to say **which material is about to go** before it goes,
 * diegetically (John chose *"actively taught"* over *"emergent, no UI"* when asked directly, and
 * `dig.md` §6a.2 forbids a HUD number — he repeated it the same day: *"no numeric destruction
 * meter"*).
 *
 * 🚨 **A SEPARATE HEURISTIC FOR THE TELL WOULD BE A LIE THE PLAYER LEARNS.** If the crazing were
 * "roughly where things fall" and the rule were something else, every hour of practice would be
 * teaching a model that is wrong at the margin. So `collapse()` and `strain()` call the **same
 * `arch()` sweep over the same `depth` array with the same constants**, and the only difference is
 * the threshold: `strain()` reports each region's load as a fraction of `fail` and starts drawing
 * at `nearFrac` of it, `collapse()` drops the region that reaches it. Ablate the rule and the
 * crazing disappears with it, because it is the same code.
 *
 * 🎯 **AND THE TELL IS NOW EXACT RATHER THAN APPROXIMATE.** Under the old span sweep the crazing
 * was a relaxed re-run that painted *roughly* the cascade; under the arch it paints **the
 * connected region that will fall, at its real extent**, because that region is the unit the rule
 * operates on. The player is looking at the piece.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ **DETERMINISM AND THE CYAN**
 * ---------------------------------------------------------------------------
 * Every function here is a pure function of `depth`, which is a pure function of the hit list, so
 * `replay()` reproduces every collapse and every crack bit-for-bit. No rng, no time term. The
 * flood fill's scan order is a plain raster, so region ids are stable.
 *
 * **Nothing here reads `barrier`.** That is deliberate and it is what keeps the search secret: the
 * interconnect is the one region with no cyan behind it, so a collapse — or a crack — that only
 * appeared where there is no barrier would announce the way through the first time it fired
 * (`dig.md` §5, *the search is the game*). Material in front of the cyan comes down exactly as
 * readily as material in front of the void, and **the cyan itself is never touched by either
 * function**: they write `depth`, which is how far through the DESTRUCTIBLE shell the dig has
 * got, and depth 1 means "through to whatever is behind", not "the thing behind is broken".
 */

/**
 * How many cells of unsupported run shed the course above it. Derived from the face's own
 * `cellW` rather than typed in cells, so a 2.56 m face and a 5.72 m one fail at the same
 * PHYSICAL span — the same argument `wall.js` makes for deriving `plateScale` from the face.
 * `span <= 0` ablates the course rule, and returns a number no run can ever reach.
 */
export function spanCells(C, cellW) {
  return C.span > 0 ? Math.max(2, Math.round(C.span / cellW)) : 1e9;
}

/** `fail <= 0` (or absent) ablates the arch rule. See `COLLAPSE.fail`. */
function failLoad(C) {
  return C.fail > 0 ? C.fail : Infinity;
}

/**
 * 🧱 **THE ONE SWEEP BOTH RULES AND THE TELL RUN ON.** Pure, allocation-free after the first
 * call, O(cells). It answers three questions at once:
 *
 *   · `w0[i]`   how wide, in cells, the run of REAL HOLE directly beneath cell i is. 0 if the
 *               cell below is solid. This is what the COURSE rule tests — it does not cascade,
 *               so it can only ever take one course per blow.
 *   · `w[i]`    the same run after the CASCADE: a cell that is itself hanging supports nothing,
 *               so runs merge and grow going up the face. Non-zero ⟺ the cell is HANGING.
 *   · regions   connected components (4-way) of hanging cells, and each one's `load` — the m² of
 *               ORIGINAL wall it is carrying, `Σ (1 - depth) × cellArea`. A cell that is 90% dug
 *               through weighs a tenth of a fresh one, which is what makes the measure ramp
 *               smoothly at ×0.125 where depth grows a slice at a time.
 *
 * ⚠️ **THE LOAD IS AN AREA IN m², NOT A FRACTION OF THE FACE, AND THAT IS MEASURED.** A fraction
 * would make a narrow face collapse from proportionally less damage: one bottom blow hangs 14.7%
 * of a 5.72 m face and **35.1%** of a 2.56 m one. In m² the same blow hangs **2.34 and 2.52** —
 * the mass over a 1.04 m hole is the mass over a 1.04 m hole, whatever wall it is cut into. So
 * `fail` is a physical quantity like `span`, and every face in the house fails at the same load.
 *
 * @returns {{w:Uint16Array, w0:Uint16Array, lab:Int32Array, load:Float64Array, nR:number,
 *            worst:number, total:number}}
 */
function arch(f, C) {
  const { cols, rows, depth } = f;
  const n = cols * rows;
  if (!f._archW || f._archW.length !== n) {
    f._archW = new Uint16Array(n);
    f._archW0 = new Uint16Array(n);
    f._archLab = new Int32Array(n);
    f._archStack = new Int32Array(n);
    f._archLoad = new Float64Array(64);
  }
  const GONE = C.gone;
  const w = f._archW, w0 = f._archW0, lab = f._archLab, st = f._archStack;
  let load = f._archLoad;
  w.fill(0); w0.fill(0); lab.fill(-1);
  /**
   * 🚪 **THE LINTEL — see `COLLAPSE.lintel`, where the whole argument is.** `AP` is non-null only
   * on a face that CONTAINS a doorway, which is the slab arm and nothing else, so every other
   * face in the house takes the identical branch it always took: `AP` is null, `lintelled()` is
   * `depth >= GONE`, and pass 1 below is byte-for-byte the loop it has always been.
   */
  const AP = (C.lintel === false) ? null : f.aperture;

  /**
   * 🎯 **BOTTOM-UP, AND THE DIRECTION IS WHAT MAKES IT ONE PASS.** Row 0 sits on the plinth and
   * can never be hanging. Every row above is tested against the row below — which, by the time we
   * reach it, already carries anything that row was itself hanging over. So one pass reaches the
   * top of the face and the runs merge exactly as an arch's span grows as it rises.
   */
  for (let y = 1; y < rows; y++) {
    const o = y * cols, below = (y - 1) * cols;
    /**
     * pass 1: the run of REAL hole under this row. The course rule's own question, un-cascaded.
     * 🚪 **A DOORWAY IS NOT A HOLE HERE** — it has a lintel over it. Everywhere else in this
     * function it is. See `COLLAPSE.lintel`.
     */
    let x = 0;
    while (x < cols) {
      if (depth[below + x] < GONE || (AP && AP[below + x])) { x++; continue; }
      let x1 = x;
      while (x1 + 1 < cols
        && depth[below + x1 + 1] >= GONE && !(AP && AP[below + x1 + 1])) x1++;
      const L = x1 - x + 1;
      for (let k = x; k <= x1; k++) {
        const i = o + k;
        if (depth[i] < GONE && L > w0[i]) w0[i] = L;
      }
      x = x1 + 1;
    }
    // pass 2: the same scan over "hole OR already hanging" — this is the one that cascades.
    x = 0;
    while (x < cols) {
      if (!(depth[below + x] >= GONE || w[below + x])) { x++; continue; }
      let x1 = x;
      while (x1 + 1 < cols && (depth[below + x1 + 1] >= GONE || w[below + x1 + 1])) x1++;
      const L = x1 - x + 1;
      for (let k = x; k <= x1; k++) {
        const i = o + k;
        if (depth[i] < GONE && L > w[i]) w[i] = L;
      }
      x = x1 + 1;
    }
  }

  // the connected structure. 4-way, because a diagonal touch is not a load path.
  const cellA = f.cellW * f.cellH;
  let nR = 0, worst = 0, total = 0;
  for (let s = 0; s < n; s++) {
    if (!w[s] || lab[s] >= 0) continue;
    if (nR >= load.length) {
      const g = new Float64Array(load.length * 2);
      g.set(load); load = f._archLoad = g;
    }
    const id = nR++;
    let a = 0, sp = 0;
    lab[s] = id; st[sp++] = s;
    while (sp) {
      const i = st[--sp];
      a += 1 - depth[i];
      const x = i % cols, y = (i - x) / cols;
      if (x > 0) { const j = i - 1; if (w[j] && lab[j] < 0) { lab[j] = id; st[sp++] = j; } }
      if (x < cols - 1) { const j = i + 1; if (w[j] && lab[j] < 0) { lab[j] = id; st[sp++] = j; } }
      if (y > 0) { const j = i - cols; if (w[j] && lab[j] < 0) { lab[j] = id; st[sp++] = j; } }
      if (y < rows - 1) { const j = i + cols; if (w[j] && lab[j] < 0) { lab[j] = id; st[sp++] = j; } }
    }
    load[id] = a * cellA;
    total += load[id];
    if (load[id] > worst) worst = load[id];
  }
  return { w, w0, lab, load, nR, worst, total };
}

/**
 * 🔎 **THE PANEL'S STRUCTURAL INTEGRITY, AS ONE NUMBER, FOR INSTRUMENTS.** Nothing in play reads
 * this — the rules call `arch()` directly — but a probe that wants to know how close a face is to
 * letting go should not have to re-implement the sweep and drift from it. That is the failure
 * class this whole file is arranged to prevent.
 *
 * @returns {{worst:number, total:number, regions:number, fail:number, frac:number}}
 *   `worst` is the heaviest connected hanging region in m², `frac` is that over `fail` — 1.0 is
 *   the instant the wall lets go.
 */
export function integrity(f, C) {
  const FAIL = failLoad(C);
  if (f._maxDepth < C.gone) return { worst: 0, total: 0, regions: 0, fail: FAIL, frac: 0 };
  const A = arch(f, C);
  return {
    worst: A.worst, total: A.total, regions: A.nR, fail: FAIL,
    frac: FAIL === Infinity ? 0 : A.worst / FAIL,
  };
}

/**
 * Bring down wall that has nothing holding it up. Called from `DamageField._add()` — the field's
 * ONLY writer — so a collapse is a consequence of a BLOW and not of a frame.
 *
 * @param {import('./damagefield.js').DamageField} f
 * @param {object} C  the `COLLAPSE` table, or an instance override
 * @param {null|{u:number, v:number, r:number}} hit  where this blow landed and how wide its brush
 *   is, in face uv and metres. **The PULL needs it** — see beat 3 — and it is the only argument
 *   this function has ever taken beyond the field and the table. Absent (a replay of an old hit
 *   list, a probe calling `_collapse()` by hand) means "no blow", so nothing is pulled.
 * @returns {null|{cells:number, area:number, u:number, v:number, w:number, h:number,
 *                 broke:boolean, capped:boolean, chained:boolean, waves:number, load:number,
 *                 spanCells:number, archCells:number, courseCells:number, lonelyCells:number,
 *                 sagCells:number, sagRegions:number, events:Array}}
 *   ⚠️ **`events` IS THE PAYOUT'S UNIT AND THE HOOK FOR WHATEVER LANDS ON TOP OF THIS.** Each
 *   entry is one thing that happened, with A POSITION AND A MAGNITUDE:
 *   `{kind, cells, area, load, u, v, dx, dy, w, h}` — `u`/`v` in face coords, `dx`/`dy` in metres
 *   from the blow's reported `u`/`v` (which is what `wall.js` turns into `collapseAt`), `w`/`h`
 *   the event's own extent. `kind` is `'arch'` (a bite off a sagging region), `'sag'` (a region
 *   just let go and is hanging — **`cells` is 0**), `'course'` or `'lonely'`. Anything that wants
 *   to fire on a collapse — a sound, a camera shake, a robot losing an arm — reads this array and
 *   needs nothing else.
 */
export function collapse(f, C, hit = null) {
  const { cols, rows } = f;
  const d = f.depth;
  // Nothing can be unsupported until something has gone all the way through. This early-out is
  // what keeps the pass free on a pristine or barely-scratched face.
  if (f._maxDepth < C.gone) return null;
  const GONE = C.gone;
  const SPAN = spanCells(C, f.cellW);
  const FAIL = failLoad(C);
  const LONELY = C.lonely;
  const CAP = C.cap;
  const WAVES = Math.max(1, C.waves ?? 3);
  const n = cols * rows;
  const cellA = f.cellW * f.cellH;

  /**
   * 🧱 **THE SAG STATE, AND IT IS THE ONLY THING IN THIS FILE THAT SURVIVES A BLOW.** One byte a
   * cell: 1 means "this material has let go and is hanging there". It is written only from here,
   * which is called only from `_add()`, so it stays a pure function of the hit list and `replay()`
   * still reproduces every collapse bit-for-bit. `DamageField.reset()` clears it with `depth`.
   * ⚠️ **It is gameplay-visible only through `strain()`'s A channel.** Sagging material is still
   * solid: `depth` is untouched, so `solidRects()`, `channel()`, sight and `pathPortals()` all
   * still see a wall, which is the answer this slice picked to the "does a leaning wall block?"
   * question and the reason beat 3 is necessary rather than decorative.
   */
  if (!f._sag || f._sag.length !== n) f._sag = new Uint8Array(n);
  const sag = f._sag;
  const SAGON = (C.sag ?? true) && FAIL !== Infinity;
  const BITE = C.bite > 0 ? C.bite : Infinity;
  const PULLFREE = FAIL * (C.pullFree ?? 1.75);

  let fell = 0, archFell = 0, courseFell = 0, lonelyFell = 0;
  let broke = false, capped = false, chained = false, waves = 0, peak = 0;
  let minX = cols, maxX = -1, minY = rows, maxY = -1;
  let sagCells = 0, sagRegions = 0;
  let biteLeft = BITE;
  const events = [];

  // the current event's own box, so each thing that happens is reported at its own size and its
  // own place instead of everything in the blow sharing one bounding box. A blow that sheds a
  // course at the skirting and takes a bite out of a storey overhead used to report a single
  // 5.72 x 2.43 m rect that was 27% full; these are two events and they are both tight.
  let eMinX = cols, eMaxX = -1, eMinY = rows, eMaxY = -1, eCells = 0, eLoad = 0;
  const emit = (kind, load = 0) => {
    if (eMaxX < 0) return;
    events.push({
      kind, cells: eCells, area: eCells * cellA, load: load || eLoad,
      _cx: (eMinX + eMaxX + 1) / 2, _cy: (eMinY + eMaxY + 1) / 2,
      w: (eMaxX - eMinX + 1) * f.cellW, h: (eMaxY - eMinY + 1) * f.cellH,
    });
    eMinX = cols; eMaxX = -1; eMinY = rows; eMaxY = -1; eCells = 0; eLoad = 0;
  };
  const box = (x, y) => {
    if (x < eMinX) eMinX = x;
    if (x > eMaxX) eMaxX = x;
    if (y < eMinY) eMinY = y;
    if (y > eMaxY) eMaxY = y;
  };

  const drop = (i, x, y) => {
    eLoad += (1 - d[i]) * cellA;
    d[i] = 1;
    f.data[i * 4] = 255;
    sag[i] = 0;
    if (!f.barrier[i]) broke = true;
    if (f._maxDepth < 1) f._maxDepth = 1;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    box(x, y);
    eCells++;
    fell++;
  };

  /**
   * 🎯 **THE WAVES ARE THE CHAIN, AND EACH ONE RE-WEIGHS THE WALL.** John: *"when that falls
   * below a certain threshold that's when the collapse chains."* A region coming down widens the
   * hole under whatever is beside and above it, so the sweep is re-run on the wall the last wave
   * left — one failure loads the next. It is self-limiting rather than capped by taste: dropping
   * hanging material REMOVES load, so a wall that sheds its overloaded region usually weighs in
   * under `fail` on the next wave and stops. Two waves is the common case; the loop exits the
   * moment a wave takes nothing.
   */
  let prevArch = 0;
  for (let pass = 0; pass < WAVES && !capped; pass++) {
    const A = arch(f, C);
    if (A.worst > peak) peak = A.worst;
    let fellNow = 0, archNow = 0;

    // ---- 1. THE ARCH GIVES.
    if (A.nR && FAIL !== Infinity && !SAGON) {
      /**
       * ⚠️ **THE ABLATION ARM, AND IT IS THE ROUND-13 CODE UNMOVED.** `COLLAPSE.sag = false`
       * drops the whole connected region in one event, in waves, exactly as the shipped build did
       * before the sag. It is here so every instrument can run a real before/after inside one
       * page rather than against a remembered number — see `_sag1-grain.mjs`, which runs it as a
       * control on every run and fails if this arm does not come back monolithic.
       */
      for (let i = 0; i < n; i++) {
        const id = A.lab[i];
        if (id < 0 || A.load[id] < FAIL) continue;
        if (d[i] >= GONE) continue;
        if (fell >= CAP) { capped = true; break; }
        const x = i % cols;
        drop(i, x, (i - x) / cols);
        archFell++; fellNow++; archNow++; chained = true;
      }
      emit('arch');
    } else if (A.nR && SAGON && biteLeft > 0) {
      /**
       * 🧱 **BEATS 2 AND 3 — SAG, THEN PULL.** See the header. Region ids are recomputed every
       * sweep and are NOT stable, so "is this region sagging" is asked of its CELLS, which is the
       * thing that persists. A region that has partly come down, or that has merged with a fresh
       * hanging region beside it, inherits the sag — which is right: material that has let go does
       * not re-attach because its neighbour is still standing.
       */
      const rSag = _scratch(A.nR), rHit = _scratch2(A.nR);
      for (let i = 0; i < n; i++) {
        const id = A.lab[i];
        if (id >= 0) { if (sag[i]) rSag[id] = 1; }
        else if (sag[i]) sag[i] = 0;      // no longer hanging at all: it cannot be sagging
      }
      if (hit) {
        const hx = hit.u * f.width, hy = hit.v * f.height;
        const RR = hit.r * (C.pullReach ?? 1.35), R2 = RR * RR;
        const x0 = Math.max(0, Math.floor((hx - RR) / f.cellW));
        const x1 = Math.min(cols - 1, Math.ceil((hx + RR) / f.cellW));
        const y0 = Math.max(0, Math.floor((hy - RR) / f.cellH));
        const y1 = Math.min(rows - 1, Math.ceil((hy + RR) / f.cellH));
        for (let y = y0; y <= y1; y++) {
          const py = (y + 0.5) * f.cellH - hy;
          for (let x = x0; x <= x1; x++) {
            const px = (x + 0.5) * f.cellW - hx;
            if (px * px + py * py >= R2) continue;
            const id = A.lab[y * cols + x];
            if (id >= 0) rHit[id] = 1;
          }
        }
      }
      for (let id = 0; id < A.nR; id++) {
        if (biteLeft <= 0 || capped) break;
        const already = rSag[id] === 1;
        const over = A.load[id] >= FAIL;
        if (!already && !over) continue;
        /**
         * 🎯 **THE PULL IS A POSITIONAL ACT, AND IT IS THE FIRST TIME IN THIS MECHANIC THAT WHERE
         * YOU ARE STANDING IS A DECISION.** A region that has already sagged comes down only when
         * a blow REACHES it — `pullReach` brush radii from the impact — so a swing at the far end
         * of a 5.72 m face leaves the sagging piece hanging. The blow that BREAKS the arch always
         * counts as reaching it, because it is by definition the blow that did it.
         * ⚠️ **`pullFree` is the escape valve and it is not optional.** A player who keeps cutting
         * the same region somewhere out of reach would otherwise make it heavier for ever. Past
         * `pullFree x fail` it lets go on its own.
         */
        const pull = !already || rHit[id] === 1 || A.load[id] >= PULLFREE;
        if (!already) {
          /**
           * BEAT 2. Mark the whole region and report it AT ITS OWN EXTENT — this is the event a
           * view plays the groan on, and it is the one the player is being shown. It carries
           * `cells: 0`, because nothing fell: what happened is that a piece of wall the size of
           * this box stopped holding itself up.
           */
          for (let i = 0; i < n; i++) {
            if (A.lab[i] !== id || d[i] >= GONE) continue;
            if (!sag[i]) { sagCells++; const x = i % cols; box(x, (i - x) / cols); }
            sag[i] = 1;
          }
          sagRegions++;
          chained = true;
          emit('sag', A.load[id]);
        }
        if (!pull) continue;
        const took = _peel(f, A, id, biteLeft, hit, GONE, CAP - fell, drop);
        biteLeft -= took.load;
        archFell += took.cells; fellNow += took.cells; archNow += took.cells;
        if (took.capped) capped = true;
        emit('arch', A.load[id]);
      }
    }

    /**
     * ---- 2. THE COURSE. A run of hole wider than `span` sheds the one course directly above it.
     * ⚠️ **IT READS `w0`, THE UN-CASCADED RUN, AND THAT IS THE WHOLE DIFFERENCE FROM THE RULE
     * THIS REPLACES.** Testing row y against a row y-1 that already includes what fell out of it
     * on this same blow is what unzipped a storey from one hit. `w0` is computed against `depth`
     * as it stood at the top of this wave, so this branch can only ever take one course.
     * ⚠️ **AND IT RUNS ON THE FIRST WAVE ONLY.** The waves exist for the ARCH to chain through;
     * letting the course rule have one per wave is the cascade coming back through the side door,
     * four courses at a time — measured at 0.37 m of wall eaten by a single blow before this line
     * was added. One blow, one course.
     */
    if (!capped && C.span > 0 && pass === 0) {
      for (let i = 0; i < cols * rows; i++) {
        if (A.w0[i] < SPAN || d[i] >= GONE) continue;
        if (fell >= CAP) { capped = true; break; }
        const x = i % cols;
        drop(i, x, (i - x) / cols);
        courseFell++; fellNow++;
      }
      emit('course');
    }

    /**
     * ---- 3. **THE LONELY RULE — John's "extra pieces".** A cell with almost nothing left around
     * it is not attached to anything in any useful sense, whatever a connectivity test says about
     * the rim it is still nominally joined to. Small, constant, and it is what keeps the crater's
     * edge shedding chips instead of ending in a clean arc.
     * ⚠️ **ON THE FIRST WAVE, AND AGAIN ON THE WAVE AFTER AN ARCH FAILURE** — a storey coming
     * away leaves a fresh rim with chips hanging off it, and that IS part of the same event. It
     * is not run on a wave that follows a quiet one, or `waves` would count rim erosion as
     * chaining and the number would stop meaning anything.
     */
    if (LONELY <= 8 && !capped && (pass === 0 || prevArch > 0)) {
      for (let y = 0; y < rows && !capped; y++) {
        const o = y * cols;
        for (let x = 0; x < cols; x++) {
          const i = o + x;
          if (d[i] >= GONE) continue;
          let nb = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            // outside the face is the masonry the span is cut into: solid, and it holds.
            if (yy < 0 || yy >= rows) continue;
            const oo = yy * cols;
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const xx = x + dx;
              if (xx < 0 || xx >= cols) continue;
              if (d[oo + xx] >= GONE) nb++;
            }
          }
          if (nb >= LONELY) {
            if (fell >= CAP) { capped = true; break; }
            drop(i, x, y);
            lonelyFell++; fellNow++;
          }
        }
      }
      emit('lonely');
    }

    prevArch = archNow;
    if (fellNow) waves++;
    if (!fellNow) break;
  }

  // ⚠️ **A BLOW THAT ONLY MADE THE WALL SAG STILL RETURNS A RESULT**, because something happened
  // and the view has to be able to play it. `cells` is 0 on that blow and every caller that pays
  // out debris already gates on `cells > 0` — `views/game.js` did so before this slice existed.
  if (!fell && !sagRegions) return null;
  if (fell) { f.dirty = true; f._touch(); }
  else f.dirty = true;                     // the A channel moved; the texture has to go up
  const cw = f.cellW, ch = f.cellH;
  const cu = maxX >= 0 ? ((minX + maxX + 1) / 2) / cols : (events[0]._cx / cols);
  const cv = maxY >= 0 ? ((minY + maxY + 1) / 2) / rows : (events[0]._cy / rows);
  for (const e of events) {
    // metres from the reported centre, along the face and up it — the frame `views/game.js`
    // already spawns in (`tX`/`tZ` and world y), so a view needs no new geometry to place these.
    e.u = e._cx / cols;
    e.v = e._cy / rows;
    e.dx = (e.u - cu) * f.width;
    e.dy = (e.v - cv) * f.height;
    delete e._cx; delete e._cy;
  }
  return {
    cells: fell,
    area: fell * cw * ch,
    u: cu,
    v: cv,
    w: maxX >= 0 ? (maxX - minX + 1) * cw : events[0].w,
    h: maxY >= 0 ? (maxY - minY + 1) * ch : events[0].h,
    broke, capped, chained, waves,
    /** the heaviest region weighed this blow, in m². `>= COLLAPSE.fail` means the arch gave. */
    load: peak,
    archCells: archFell, courseCells: courseFell, lonelyCells: lonelyFell,
    /** how much wall started HANGING on this blow, and in how many pieces. See beat 2. */
    sagCells, sagRegions,
    /** how much of the sag budget this blow spent — 0 means the wall let go as far as it could. */
    biteLeft: BITE === Infinity ? -1 : Math.max(0, biteLeft),
    /** kept for the instruments that read it: everything the SUPPORT rules took, arch + course. */
    spanCells: archFell + courseFell,
    /** 🎯 **ONE ENTRY PER THING THAT HAPPENED, WITH A POSITION AND A MAGNITUDE.** See the jsdoc. */
    events,
  };
}

// --------------------------------------------------------------------------------------------
// The peel, and the two scratch arrays the sag bookkeeping needs. Module-level and grown on
// demand, for the same reason `arch()`'s live on the field: a collapse must allocate nothing in
// the steady state, and these are indexed by REGION id, of which there are never many.
// --------------------------------------------------------------------------------------------
let _s1 = new Uint8Array(64), _s2 = new Uint8Array(64), _order = [];
function _scratch(n) { if (_s1.length < n) _s1 = new Uint8Array(n * 2); _s1.fill(0, 0, n); return _s1; }
function _scratch2(n) { if (_s2.length < n) _s2 = new Uint8Array(n * 2); _s2.fill(0, 0, n); return _s2; }

/**
 * 🧱 **TAKE ONE BITE OUT OF A SAGGING REGION — beat 3, and this is where "bit by bit" is made.**
 *
 * A swing can only pull so much wall down at once, so a region heavier than `bite` comes away over
 * several blows and the rest hangs there between them. **That is the middle-sized, repeatable event
 * `critic-dig-8` says the binary arch could not produce**, and it is why a skilled dig now reports
 * three events of ~157 cells where it used to report one of 408.
 *
 * 🎯 **THE ORDER IS DISTANCE FROM THE BLOW, WITH THE VERTICAL COMPRESSED, AND THAT IS A DESIGN
 * DECISION AND NOT AN IMPLEMENTATION DETAIL.** Taking the region row by row from the bottom would
 * hand the payout a 2.4 x 0.6 m strip — a sheet, in the shape John complained about, delivered one
 * course at a time. Taking it as a lump centred on the hammer means **the wall comes away where you
 * hit it**, which is the only version of this a player can aim, and it leaves an irregular hanging
 * edge rather than a straight one. `0.34` on the vertical term makes the lump stand tall, because
 * what is hanging is a column and it lets go as one.
 *
 * ⚠️ **NO RNG AND NO SORT KEY THAT DEPENDS ON ANYTHING BUT THE FIELD AND THE HIT** — the whole file
 * is a pure function of the hit list and this is the only part of it that ranks anything. Ties break
 * on the raster index, so two runs agree to the cell.
 *
 * @returns {{cells:number, load:number, capped:boolean}}
 */
function _peel(f, A, id, budget, hit, GONE, room, drop) {
  const { cols, depth } = f;
  const n = cols * f.rows;
  const cellA = f.cellW * f.cellH;
  const hx = hit ? hit.u * f.width : 0, hy = hit ? hit.v * f.height : 0;
  _order.length = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (A.lab[i] !== id || depth[i] >= GONE) continue;
    total += (1 - depth[i]) * cellA;
    if (hit) {
      const x = i % cols, y = (i - x) / cols;
      const px = (x + 0.5) * f.cellW - hx, py = (y + 0.5) * f.cellH - hy;
      _order.push(px * px + py * py * 0.34, i);
    } else {
      _order.push(i, i);                    // no blow to centre on: raster order, bottom-up
    }
  }
  if (!_order.length) return { cells: 0, load: 0, capped: false };
  // whatever is left that is smaller than a bite comes away whole — a region does not stop
  // half a plate short of gone, and a leftover crumb of sag would hang for ever.
  if (total <= budget * 1.20) {
    let cells = 0;
    for (let k = 1; k < _order.length; k += 2) {
      if (cells >= room) return { cells, load: total, capped: true };
      const i = _order[k], x = i % cols;
      drop(i, x, (i - x) / cols); cells++;
    }
    return { cells, load: total, capped: false };
  }
  // rank by the key, carrying the index with it. Pairs in one flat array: no objects, no GC.
  const idx = [];
  for (let k = 0; k < _order.length; k += 2) idx.push(k);
  idx.sort((a, b) => (_order[a] - _order[b]) || (_order[a + 1] - _order[b + 1]));
  let spent = 0, cells = 0;
  for (const k of idx) {
    if (spent >= budget) break;
    if (cells >= room) return { cells, load: spent, capped: true };
    const i = _order[k + 1], x = i % cols;
    spent += (1 - depth[i]) * cellA;
    drop(i, x, (i - x) / cols); cells++;
  }
  return { cells, load: spent, capped: false };
}

/**
 * 🕸️ **THE STRAIN TELL — the crazing that runs across material that is about to come down.**
 *
 * Writes the damage texture's **A channel**, which was the one byte in it nothing had ever used
 * (R depth, G barrier, B blurred depth for the renderer). `breakmask.js` reads it and opens
 * hairline cracks along the break-order field's own contours — so the crack you see is drawn by
 * the same function that decides where the wall snaps, and *where it crazes is where it tears*.
 *
 * 🎯 **TWO TERMS, BECAUSE THERE ARE TWO RULES, AND THE PLAYER NEEDS BOTH.**
 *
 *   · **THE ARCH.** Every hanging region is painted at `(load/fail - nearFrac) / (1 - nearFrac)`.
 *     It is UNIFORM over the region on purpose: the whole region goes at once, so the whole
 *     region is what the player must be shown. As an undercut widens, the haze spreads across the
 *     material above it and brightens together — which is exactly the event about to happen.
 *   · **THE COURSE.** A bright band along the top of any run of hole approaching `span`, from the
 *     same `w0` the course rule tests. This is the small, frequent tell that teaches the rule's
 *     first clause, and it is what a player sees before they have earned an arch failure at all.
 *
 * The A channel is the `max` of the two, so a wall that is both locally undercut and globally
 * overloaded reads at whichever is worse — which is the one that is going to get you.
 *
 * ⚠️ **WHY THE OLD `min`-CARRY IS GONE.** The rule it served cascaded row by row, so the warning
 * had to be handed upward and weakened at every step or a whole storey lit up the instant one row
 * got nervous. The arch has no such problem: the region IS the unit, its load IS the number, and
 * there is nothing to carry.
 *
 * ⚠️ **IT IS A RENDER CHANNEL AND NOTHING IN PLAY MAY READ IT** — the same rule the B channel
 * lives under. It is computed in `flush()` (once per frame per damaged face) rather than in
 * `_add()`, because unlike the collapse it changes no gameplay truth and a hammer landing three
 * times a second must not pay for it three times.
 *
 * @param {import('./damagefield.js').DamageField} f
 * @param {object} C
 * @returns {{cells:number, peak:number, load:number, frac:number}} how many cells are crazing,
 *   how hard, the heaviest region's load in m², and that as a fraction of `fail`.
 */
export function strain(f, C) {
  const { cols, rows } = f;
  const n = cols * rows;
  const d = f.depth;
  const GONE = C.gone;
  const SPAN = spanCells(C, f.cellW);
  const FAIL = failLoad(C);
  /** How far short of failing a region has to be before the wall shows it. See `COLLAPSE.nearFrac`. */
  const NEARF = C.nearFrac ?? 0.45;
  const NEAR = Math.max(2, Math.round(SPAN * NEARF));
  const LONELY = C.lonely;
  const courseOn = C.span > 0;
  const archOn = FAIL !== Infinity;
  const lonelyOn = LONELY <= 8;

  if (!f._strainV || f._strainV.length !== n) f._strainV = new Float32Array(n);
  const s = f._strainV;

  // Nothing is under strain until something has gone through — the same early-out `collapse()`
  // takes, so the two agree about when the mechanic is live at all.
  if (f._maxDepth < GONE || (!courseOn && !archOn && !lonelyOn)) {
    if (f._strainAny) {
      for (let i = 0; i < n; i++) f.data[i * 4 + 3] = 0;
      f._strainAny = 0;
    }
    return { cells: 0, peak: 0, load: 0, frac: 0 };
  }

  s.fill(0);
  let worst = 0;
  if (courseOn || archOn) {
    const A = arch(f, C);
    worst = A.worst;
    if (archOn) {
      const denom = 1 - NEARF;
      for (let i = 0; i < n; i++) {
        const id = A.lab[i];
        if (id < 0) continue;
        const q = (A.load[id] / FAIL - NEARF) / denom;
        if (q > s[i]) s[i] = q > 1 ? 1 : q;
      }
    }
    if (courseOn) {
      const denom = Math.max(1, SPAN - NEAR);
      for (let i = 0; i < n; i++) {
        const L = A.w0[i];
        if (L < NEAR || d[i] >= GONE) continue;
        const q = (L - NEAR) / denom;
        const v = q > 1 ? 1 : q;
        if (v > s[i]) s[i] = v;
      }
    }
    /**
     * 🧱 **AND A SAGGING REGION IS PAINTED AT A FLAT 1.0, WHICH IS THE WHOLE POINT OF THE STATE.**
     *
     * `critic-dig-8` on the crazing as it shipped: *"it is a promise, not a warning… the window is
     * 0.44 strength after blow 1, 0.88 after blow 2, gone on blow 3: 1.9 s with nothing the player
     * can do in it."* **The sag is what gives that window a use.** Material that has let go and is
     * hanging reads at full craze for as long as the player leaves it there — so the tell now has
     * three legible stages a player can learn (faint → hard → *this piece has gone*) instead of a
     * two-blow ramp that resolves before it means anything, and the third stage is a state the
     * player controls rather than a moment that happens to them.
     *
     * ⚠️ **IT STILL READS NOTHING BUT `depth`'S HISTORY.** `_sag` is written by `collapse()` from
     * `arch()`, which never touches `barrier`, so `debris-collapse` C6's invariance — move the
     * interconnect and every crazing byte must be identical — holds unchanged.
     */
    if (archOn && f._sag) {
      const sg = f._sag;
      for (let i = 0; i < n; i++) if (sg[i] && d[i] < GONE) s[i] = 1;
    }
  }

  if (lonelyOn) {
    // ramps over the last two neighbours, so the crater's rim carries a low constant craze and
    // only the cell that is one neighbour from leaving reads at half strength.
    const foot = LONELY - 2;
    for (let y = 0; y < rows; y++) {
      const o = y * cols;
      for (let x = 0; x < cols; x++) {
        const i = o + x;
        if (d[i] >= GONE) continue;
        let nb = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= rows) continue;
          const oo = yy * cols;
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= cols) continue;
            if (d[oo + xx] >= GONE) nb++;
          }
        }
        if (nb <= foot) continue;
        const v = Math.min(1, (nb - foot) / 2);
        if (v > s[i]) s[i] = v;
      }
    }
  }

  let cells = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const v = s[i];
    f.data[i * 4 + 3] = v > 0 ? Math.round(v * 255) : 0;
    if (v > 0) cells++;
    if (v > peak) peak = v;
  }
  f._strainAny = cells;
  return { cells, peak, load: worst, frac: archOn ? worst / FAIL : 0 };
}
