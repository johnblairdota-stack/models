# Slice: yellow stickies (one-shot peelable onboarding)

Borrow from Last House Live. Spec + first UI. Do not merge.

## Why

First-use controls need peelable yellow paper notes that teach without spoiling roles. Borrow the LHL one-shot sticky pattern so each session seat sees each note once, then it stays gone unless restored from a tiny Notes corner.

LHL ref: `C:\Users\John\Documents\Codex\2026-09-06\build-the-first-playable-prototype-of\outputs\last-house-live\`

## Decisions

1. **Literal yellow paper notes** beside first-use controls. Notes must not obscure the control they annotate.
2. **Peel interaction:** grab, curl lift, early-release flop-back, momentum slide off, tap-to-peel.
3. **One-shot automatic spawn per session seat:**
   - Record first presentation **BEFORE** display.
   - Scope: per TV and per persistent phone seat.
   - Reload / reconnect: no fresh auto spawn.
   - Peeled notes stay gone.
   - Tiny Notes corner supports `restore: true`.
   - New room resets history.
   - Same-room restart keeps history.
4. **At most one sticky visible at a time.**
5. **No role spoilers.**

## First note ids

| id | Copy |
| --- | --- |
| `phone-guide-pin` | Pin a door, painting, or camera spot. Runner auto-walks there. |
| `phone-runner-dodge` | Stick is dodge and hide. Walk is automatic to the pin. |
| `phone-vote` | Tap a name to nominate or vote. Your pick stays private until the count. |
| `tv-cast-ready` | Everyone joins on a phone. TV is the shared show. |

## Ownership

| Area | Owner |
| --- | --- |
| Phone sticky UI / peel | `party-phone.js` |
| Host / TV sticky UI | `party-host.js` |
| Session store | `notesPresented` + note command `{id, restore?}` → `{show: bool}` |
| Styling | CSS (yellow paper, curl / peel) |
| Tests | `gates:party` harness mirroring LHL `engine.test` notes cases |

**Do not edit:** `win.js`, `pin[]`, emote, assimilation, KEEP/EXPEL, route menu, live sit-down.

## Protocol

- Present before paint: record presentation, then show.
- Mirror LHL tests:
  - first show → `true`
  - rejoin → `false`
  - other seat → `true`
  - restore → `true`
  - new room → empty history

## Traps

- Recording presentation after paint can re-spawn on flaky paint paths.
- Showing more than one sticky at once breaks the “at most one” lock.
- Auto-spawn on reload/reconnect violates one-shot seat history.
- Role-flavored copy is out; keep guide / runner / vote language non-spoiling.
- Restoring must go through the Notes corner `restore: true` path, not a second auto spawn.

## Verification gate

Named `gates:party` harness with red/green rules mirroring LHL notes cases:

- first presentation shows
- rejoin does not auto-show
- other seat can still auto-show its own first note
- restore shows again
- new room clears presented history

## Out of scope

- Route menu
- Private-heat
- KEEP / EXPEL
- Guide / runner replacement
