import { room, EXP, THREE, MOVE } from './_mr2_sim.mjs';
console.log('THE OBJECTIVE IS AN UNMARKED COORDINATE. What does a runner who only knows the ROOM face?');
console.log('wing      room area   2.2 m disc   disc/room   lawnmower sweep at 4.4 m swath, WALK 2.55 m/s');
for (const w of ['gallery','ballroom','study_w','study_e','service','chapel']) {
  const t = room.anchor(EXP.TERMINAL_AT[w]);
  const sp = room.spaceAt(t);
  if (!sp) { console.log(`  ${w.padEnd(9)} terminal is not inside any space!`); continue; }
  const W = sp.x1-sp.x0, D = sp.z1-sp.z0, A = W*D;
  const disc = Math.PI*EXP.REACH*EXP.REACH;
  const lanes = Math.ceil(Math.min(W,D)/(2*EXP.REACH));
  const len = lanes*Math.max(W,D);
  console.log(`  ${w.padEnd(9)} ${A.toFixed(0).padStart(4)} m²   ${disc.toFixed(1)} m²    ${(100*disc/A).toFixed(1).padStart(5)}%     ${lanes} lanes x ${Math.max(W,D).toFixed(1)} m = ${len.toFixed(0)} m -> ${(len/MOVE.walk).toFixed(0)} s worst case (${(len/MOVE.run).toFixed(0)} s at RUN)`);
  console.log(`            terminal at (${t.x.toFixed(2)}, ${t.z.toFixed(2)}); nearest wall ${Math.min(t.x-sp.x0,sp.x1-t.x,t.z-sp.z0,sp.z1-t.z).toFixed(2)} m. No mesh, no light, no HUD mark, no map mark.`);
}
