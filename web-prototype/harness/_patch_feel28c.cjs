const fs = require('fs');
const p = 'harness/_overnight_feel28.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  'await runner.page.mouse.down();\n      await sleep(120);\n      const during = await runner.page.evaluate',
  "await runBtn.dispatchEvent('pointerdown');\n      await sleep(120);\n      const during = await runner.page.evaluate"
);
s = s.replace(
  'await runner.page.mouse.up();\n      padFeel.runBtnVisualOn = during.runOn;',
  "await runBtn.dispatchEvent('pointerup');\n      padFeel.runBtnVisualOn = during.runOn;"
);
fs.writeFileSync(p, s);
console.log('done', s.includes("await runBtn.dispatchEvent('pointerdown')"));
