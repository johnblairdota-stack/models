const fs = require('fs');

// 1) entitle.js
{
  const p = 'net/party/entitle.js';
  let s = fs.readFileSync(p, 'utf8');
  const needle = "  ['you.intel.age',            'self'],";
  if (!s.includes(needle)) throw new Error('entitle needle missing');
  if (s.includes("'you.here'")) throw new Error('you.here already present');
  const insert = needle + "\n\n  /*\n" +
    "   * ---- where THIS phone's body is standing right now.\n" +
    "   *\n" +
    "   * Not intel. Not the map. Not Word from the House. A person in a room knows which room\n" +
    "   * they are in; the runner pad saying that one word makes the guide's shouted room name\n" +
    "   * checkable. Audience is runner — seated phones and the TV never see it.\n" +
    "   */\n" +
    "  ['you.here',                 'runner'],";
  s = s.replace(needle, insert);
  fs.writeFileSync(p, s);
  console.log('entitle ok');
}

// 2) room.js
{
  const p = 'src/party/room.js';
  let s = fs.readFileSync(p, 'utf8');
  const needle = '      if (intel) base.you = { ...base.you, intel };\n    }';
  if (!s.includes(needle)) throw new Error('room needle missing: ' + JSON.stringify(s.includes('if (intel) base.you')));
  if (s.includes('here: state.world')) throw new Error('here already wired');
  const insert = needle + '\n    /*\n' +
    '     * THE RUNNER\'S OWN ROOM — proprioception, not intel.\n' +
    '     *\n' +
    '     * Playcritique feel28: the guide shouts room names into a pad that never names the room\n' +
    '     * the runner is standing in, so co-op has no receiving end. This is the one word a body\n' +
    '     * already knows. It is NOT Word from the House (still stripped from this seat) and it is\n' +
    '     * NOT the map. you.here is runner-audience in entitle.js; everyone else is unchanged.\n' +
    '     */\n' +
    '    if (!sock.isTV && sock.seatRole === \'runner\' && base.you && state.world?.runner?.room) {\n' +
    '      base.you = { ...base.you, here: state.world.runner.room };\n' +
    '    }';
  s = s.replace(needle, insert);
  fs.writeFileSync(p, s);
  console.log('room ok');
}
