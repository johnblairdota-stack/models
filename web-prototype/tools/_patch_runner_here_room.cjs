const fs = require('fs');
const p = 'src/party/room.js';
let s = fs.readFileSync(p, 'utf8');
const re = /      if \(intel\) base\.you = \{ \.\.\.base\.you, intel \};\r?\n    \}/;
if (!re.test(s)) throw new Error('room re missing');
if (s.includes('here: state.world')) throw new Error('already');
s = s.replace(re, (m) => m + '\n' +
`    /*
     * THE RUNNER'S OWN ROOM — proprioception, not intel.
     *
     * Playcritique feel28: the guide shouts room names into a pad that never names the room
     * the runner is standing in, so co-op has no receiving end. This is the one word a body
     * already knows. It is NOT Word from the House (still stripped from this seat) and it is
     * NOT the map. you.here is runner-audience in entitle.js; everyone else is unchanged.
     */
    if (!sock.isTV && sock.seatRole === 'runner' && base.you && state.world?.runner?.room) {
      base.you = { ...base.you, here: state.world.runner.room };
    }`);
fs.writeFileSync(p, s);
console.log('room ok');
