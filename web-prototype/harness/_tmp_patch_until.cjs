const fs = require('fs');
const p = 'src/game/follow-bed.js';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('until: mode ===')) {
  s = s.replace(
    "shot: mode === 'run' ? operator.shot : mode,",
    "shot: mode === 'run' ? operator.shot : mode,\n      until: mode === 'run' ? +Number(operator.until).toFixed(3) : null,\n      cutGen: mode === 'run' ? (operator._cutGen || 0) : null,"
  );
  s = s.replace(
    'cut(runner, lastPortal) {',
    'cut(runner, lastPortal) { this._cutGen = (this._cutGen || 0) + 1;'
  );
  fs.writeFileSync(p, s);
  console.log('PATCHED');
} else {
  console.log('ALREADY');
}