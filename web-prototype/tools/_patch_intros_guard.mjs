import { readFileSync, writeFileSync } from 'node:fs';
const p = 'src/views/party-host.js';
let s = readFileSync(p, 'utf8');
const start = s.indexOf('  function maybeIntros() {');
if (start < 0) { console.error('start not found'); process.exit(1); }
const end = s.indexOf('  function startNight()', start);
if (end < 0) { console.error('end not found'); process.exit(1); }
const neu = `  function maybeIntros() {
    if (ui.introsSent) return;
    if (ui.warm !== 'ready') return;
    if (ui.beat === 'lobby') return;
    /*
     * Late bake used to fire cast intros AFTER Send-them-in. playcritique overnight
     * post-#22: TV chrome already said EXPEDITION · episode 1, phones had the pad, and
     * the follow layer stamped INTROS · WALK over the live run. Intros are a casting
     * beat — once the pair is walking, the run cue owns the camera.
     */
    if (ui.beat === 'expedition' || ui.beat === 'recap') return;
    const cast = introCast();
    if (!cast.length) return;
    ui.introsSent = true;
    sendCue({ kind: 'intros', cast });
  }

`;
s = s.slice(0, start) + neu + s.slice(end);
writeFileSync(p, s);
console.log('patched', p);
