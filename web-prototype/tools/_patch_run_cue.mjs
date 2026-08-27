import { readFileSync, writeFileSync } from 'node:fs';

const p = process.argv[2] || 'src/views/party-host.js';
let s = readFileSync(p, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';
const block = (lines) => lines.join(nl);

const oldSend = block([
  '  function sendCue(cue) {',
  '    if (!follow.el?.contentWindow) return;',
  '    const bad = cueViolations(cue);',
  "    if (bad.length) { console.error(`[host] refusing to send a cue: ${bad.join(', ')}`); return; }",
  "    follow.el.contentWindow.postMessage({ t: 'cue', cue }, location.origin);",
  '  }',
]);

const newSend = block([
  '  function sendCue(cue) {',
  '    if (!follow.el?.contentWindow) return false;',
  '    const bad = cueViolations(cue);',
  "    if (bad.length) { console.error(`[host] refusing to send a cue: ${bad.join(', ')}`); return false; }",
  "    follow.el.contentWindow.postMessage({ t: 'cue', cue }, location.origin);",
  '    return true;',
  '  }',
  '',
  '  /**',
  '   * The run cue must land AFTER the follow iframe can hear it. paint() used to stamp',
  '   * `cuedRunner` before `sendCue`, so a Send-them-in that beat the iframe\'s first frame',
  '   * dropped the cue forever — TV chrome said EXPEDITION, followLive flipped true off',
  '   * `ready`, and the bed stayed in `warm` (slug "WARM · STILL", no runner in the shot).',
  '   * Only mark cued once postMessage succeeded; `ready` retries the same path.',
  '   */',
  '  function cueRun(runnerId, names) {',
  "    if (!runnerId || follow.mode !== 'run') return false;",
  '    if (ui.cuedRunner === runnerId) return true;',
  '    const look = seatLook(client.lobby, runnerId) || DEFAULT_LOOK;',
  '    const ok = sendCue({',
  "      kind: 'run',",
  '      runner: String(runnerId),',
  "      name: joinedName(names || players(), runnerId, 'The runner'),",
  '      shell: look.shell,',
  '      accent: look.accent,',
  '    });',
  '    if (ok) ui.cuedRunner = runnerId;',
  '    return ok;',
  '  }',
]);

if (!s.includes(oldSend)) { console.error('sendCue block missing'); process.exit(1); }
s = s.replace(oldSend, newSend);

const oldReady = block([
  '    if (m.ready) {',
  '      follow.live = true;',
  "      root.querySelector('.run-frame')?.classList.add('live');",
  '      return;',
  '    }',
]);

const newReady = block([
  '    if (m.ready) {',
  '      follow.live = true;',
  "      root.querySelector('.run-frame')?.classList.add('live');",
  '      /*',
  '       * Overnight post-#23: if Send-them-in painted before this ready, the run cue was',
  '       * dropped on a null contentWindow and never retried. The bed kept drifting warm.',
  '       */',
  '      const pair = client.frame?.pair || {};',
  '      const runnerId = pair.runner || null;',
  '      if (runnerId) cueRun(runnerId, players());',
  '      return;',
  '    }',
]);

if (!s.includes(oldReady)) { console.error('ready block missing'); process.exit(1); }
s = s.replace(oldReady, newReady);

const oldPaint = block([
  '    /*',
  '     * The run cue, sent once per runner. `cuedRunner` is what stops a lobby snapshot — which',
  '     * arrives several times a second — from re-cueing the same person and resetting them to the',
  '     * ballroom mid-corridor.',
  '     */',
  "    if (follow.mode === 'run' && ui.cuedRunner !== runnerId) {",
  '      ui.cuedRunner = runnerId;',
  '      const look = seatLook(client.lobby, runnerId) || DEFAULT_LOOK;',
  '      sendCue({',
  "        kind: 'run',",
  '        runner: String(runnerId),',
  "        name: joinedName(names, runnerId, 'The runner'),",
  '        shell: look.shell,',
  '        accent: look.accent,',
  '      });',
  '    }',
]);

const newPaint = block([
  '    /*',
  '     * The run cue, sent once per runner. `cuedRunner` is what stops a lobby snapshot — which',
  '     * arrives several times a second — from re-cueing the same person and resetting them to the',
  '     * ballroom mid-corridor. Only set after a successful postMessage (see `cueRun`).',
  '     */',
  "    if (follow.mode === 'run' && runnerId) cueRun(runnerId, names);",
]);

if (!s.includes(oldPaint)) { console.error('paint cue block missing'); process.exit(1); }
s = s.replace(oldPaint, newPaint);

writeFileSync(p, s);
console.log('patched ok', p);
