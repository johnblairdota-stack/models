from pathlib import Path
p = Path('src/views/party-host.js')
s = p.read_text(encoding='utf-8')
nl = '\r\n' if '\r\n' in s else '\n'

def block(lines):
    return nl.join(lines)

old_send = block([
  '  function sendCue(cue) {',
  '    if (!follow.el?.contentWindow) return;',
  '    const bad = cueViolations(cue);',
  "    if (bad.length) { console.error(`[host] refusing to send a cue: ${bad.join(', ')}`); return; }",
  "    follow.el.contentWindow.postMessage({ t: 'cue', cue }, location.origin);",
  '  }',
])

new_send = block([
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
])

if old_send not in s:
    raise SystemExit('sendCue block missing')
s = s.replace(old_send, new_send, 1)

old_ready = block([
  '    if (m.ready) {',
  '      follow.live = true;',
  "      root.querySelector('.run-frame')?.classList.add('live');",
  '      return;',
  '    }',
])

new_ready = block([
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
])

if old_ready not in s:
    raise SystemExit('ready block missing')
s = s.replace(old_ready, new_ready, 1)

old_paint = block([
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
])

new_paint = block([
  '    /*',
  '     * The run cue, sent once per runner. `cuedRunner` is what stops a lobby snapshot — which',
  '     * arrives several times a second — from re-cueing the same person and resetting them to the',
  '     * ballroom mid-corridor. Only set after a successful postMessage (see `cueRun`).',
  '     */',
  "    if (follow.mode === 'run' && runnerId) cueRun(runnerId, names);",
])

if old_paint not in s:
    raise SystemExit('paint cue block missing')
s = s.replace(old_paint, new_paint, 1)

p.write_bytes(s.encode('utf-8'))
print('patched ok')
