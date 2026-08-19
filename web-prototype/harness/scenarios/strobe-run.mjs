/**
 * ADAPTER ONLY. `harness/strobe.mjs` is the tool; this is the six lines that let
 * `playtest.mjs --script` drive it. Read strobe.mjs, not this file.
 *
 * ⚠️ DO NOT RUN THIS DIRECTLY. `harness/scenarios/*.mjs` are modules `playtest.mjs` imports —
 * run one straight from the shell and it prints nothing and exits 0, which is indistinguishable
 * from a pass. Run `node harness/strobe.mjs --motion sledge` instead.
 *
 * Why an adapter at all: composing `playtest.mjs` rather than reimplementing it is what buys
 * the `@vite/client` HMR stub (a concurrent agent's file save silently truncates any long
 * session without it), the "1 navigation" assertion that proves it worked, the 180 s ready
 * wait, and the pageerror capture. None of that is worth writing twice.
 *
 * The config arrives as JSON in RRR_STROBE because a scenario takes no arguments of its own.
 */
import { MOTIONS, strobe } from '../strobe.mjs';

export default async function strobeRun(ctx) {
  const cfg = JSON.parse(process.env.RRR_STROBE || '{}');
  const m = MOTIONS[cfg.motion];
  if (!m) { ctx.skip('strobe', `unknown motion "${cfg.motion}"`); return; }
  ctx.note(`strobing ${m.label} (${cfg.mode})`);
  await strobe(ctx, { ...m, ...cfg, label: m.label });
}
