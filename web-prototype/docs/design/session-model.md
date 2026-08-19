# Session model — lobby, split screen, phones as controllers, and a human hunter

**Status: DIRECTION, not a spec.** John's words: *"The idea needs some work but we should add it
to the relevant files so we can develop it further down the line."* Treat every section below as
a starting position. The **Open questions** at the end are genuinely open, and the
**Implications** section contains things that constrain work happening right now.

Nothing here is scheduled. It sits beyond phase 4 in `GAUNTLET.md`, and phase 4 is not started.

---

## The direction

Inspired by the Netflix Games couch-co-op model (Overcooked): everyone in the room plays on one
screen, using their own phone as a controller, joined by scanning a QR code.

Applied here:

- A **lobby** holding up to **8 players plus one hunter**, joined by QR code.
- The **hunter connects separately, on its own device** — a human, not the AI.
- Each player picks how they participate:
  1. **Split screen** — 2, 3 or 4 share one display, each with their own viewport.
  2. **Phone as controller** — the phone is input only; the game renders on the shared display.
  3. **Phone as the whole game** — solo on the handset, with a mobile-appropriate UI.

## The controller reference

Two screenshots of the Netflix controller are the visual reference (landscape, thumbs at the
outer edges). What matters from them:

- **The phone renders none of the game.** Black field, controls only. A controller client
  therefore needs *no renderer at all* — it is an input socket. That is the single most
  important architectural consequence on this page.
- **Two movement modes are offered** — a 4-way d-pad and a floating analog puck in a ring —
  which reads as a user setting, not two products. Worth copying; thumb preference varies and it
  costs one toggle.
- **Four colour-coded face buttons** (A/B/X/Y), large targets, high contrast, minimal chrome.
- A settings gear and a menu, centred at the top, out of thumb reach — deliberate, so nothing
  destructive sits where a thumb rests.

Our action set is not Overcooked's. We need at minimum: move, look/aim, fire, interact/pick up,
**detach limb**, and swap gadget. Limb detachment is the game's signature mechanic and should get
its own dedicated control rather than a menu.

---

## Implications — including one that constrains work happening NOW

### ⚠️ Split screen breaks the current perf budget, and the multiplier is worse than it looks

This is the part to internalise before doing more art. Measured facts as of round 28:

- One view of four robots on a studio cyc: **600 draw calls against a 625 budget**, **879k
  triangles against 900k**, GPU straddling the **1.389 ms** line.
- **The scene already renders in four passes.** A builder measured this directly: 148 mesh
  instances produce 600 calls, and triangles carry the same ×4. So a new material on a joint
  costs **16** draw calls across a 4-robot sheet, not 4.

Four-way split screen means four viewports, and in Three.js that is four render traversals — so
draw calls and triangles multiply **again** by the number of viewports on top of the existing
pass multiplier. A room that fits in budget single-view does not fit four-up, and the target is
integrated graphics.

**This is not a reason to stop.** It is a reason to know now that:
- per-viewport resolution scaling, LOD and instancing are load-bearing, not polish;
- `collapseDrawCalls` in `unit4h.js` becomes more important, not less;
- the whole-room budget of 300 calls quoted in `unit4h.js`'s comments — which the harness does
  not currently enforce, it enforces 625 — is the number that matters for this future, and the
  gap between those two figures should be resolved before phase 4 plans around either.

Anyone doing perf work should read this section first.

### The server assumes one player per socket

`net-smoke` verified the protocol genuinely works with real concurrent clients (see `HANDOFF.md`
item 5 — the previous "never run with two clients" claim was false). But every mode above breaks
the one-player-per-socket assumption in a different way:

- **Split screen** — one client, one renderer, *N players*. Either the socket carries N players,
  or each controller phone holds its own socket and the display holds a spectator/render socket.
- **Controller phone** — a socket that sends input and receives nothing but lobby state.
- **Solo phone** — the current model, one player one socket.

The cleanest shape is probably **input sources and render surfaces as separate concepts**, with
a player identity binding one of each — but that is a design decision, not a conclusion.

Related: the server was tested with three clients. **Eight players plus a hunter is nine**, and
nothing has run at that count.

### A human hunter is an asymmetric-multiplayer change, not a control swap

Today the hunter is an NPC driven by `src/game/hunter-ai.js`. Handing it to a person changes the
game's shape:

- The hunter's abilities were tuned against AI behaviour, not human intent.
- It needs its own UI — it is much larger, hunts by different senses, and grows by absorbing
  parts. Its screen is not a player's screen with a different skin.
- The AI still has to exist for lobbies with no human hunter, so both must stay balanced.
- `hunterSlam` is currently in the damage table and, per `net-smoke`, was reachable by any client
  through an ungated path. When the hunter becomes a real role that gate stops being purely a
  security fix and becomes the role boundary itself.

### QR joining

Standard flow: display shows a room code and QR; the phone opens a URL carrying the code and
lands directly in the lobby. Implies the server serves a small mobile page, and the room code
lives in the protocol. Nothing here is hard, but none of it exists.

---

## Open questions

These are unresolved, and guessing at them is how a design like this gets built twice.

1. **Does the hunter see the same world?** Asymmetric horror usually gives the monster different
   senses — heat, sound, wall-penetrating vision. That is a design pillar, not a UI detail.
2. **What happens when a split-screen display drops?** Two to four players vanish at once.
3. **Is the mobile-solo mode the same game?** A phone screen cannot show what a shared TV shows;
   either the camera works differently or it is a different experience with the same world.
4. **8 players and one hunter — is that balanced?** The current design is small robots hunted by
   one large one. Eight-to-one may need a second hunter, or hunter growth tuned to player count.
5. **Do controller phones get any screen?** Overcooked says no. But limb detachment and gadget
   swapping are inventory-ish, and inventory on a shared screen with four players is crowded. A
   small phone-side inventory may earn its place.
6. **Latency budget?** Couch co-op over a LAN is forgiving; a phone on cellular is not. Which are
   we designing for?

---

## Where this connects

- `GAUNTLET.md` phase 4 — the playable slice, and `net-owner`. This is that work's eventual shape.
- `HANDOFF.md` item 5 — the three live multiplayer defects and the client-wiring gap. Note that
  `src/net/client.js` is **not yet wired into `src/views/game.js`**; `game.play` still runs
  single-authority offline. That wiring is the first step toward any of this.
- `src/game/rules.js` — `WEAPON_DAMAGE`, `WEAPON_COOLDOWN`, `MOVE`. Any control scheme has to
  express these.
