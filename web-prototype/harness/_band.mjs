import { ROOMS, hunterVisibleToGuide, camerasLive, coverageFraction } from '../src/party/coverage.js';
import { guideSight, blindStrip } from '../src/party/darkrun.js';
import { expectedHonestError, T3_BAND } from '../src/party/coverage.js';
const hash=(...p)=>{let h=0x811c9dc5>>>0;const s=p.join(':');for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h>>>0;};
const pick=(n,...p)=>(hash(...p)>>>8)%n;
const TILT=62, H=4.80;
console.log('blind strip at 62deg /4.8m storey =', blindStrip(H,TILT).toFixed(3),'m; wallDistance is drawn uniform on [0,8)');
console.log('\nlit | live cams | coverage | P(guide actually SEES) | honest error (1-p)/2 | in T3 band 15-25%?');
for (let lit=0; lit<=5; lit++) {
  let seen=0,n=0;
  for(let ws=1; ws<=4000; ws++) for(let ep=1; ep<=5; ep++){
    const hunterRoom = ROOMS[pick(6,ws,'hunter',ep)];
    const covered = hunterVisibleToGuide({ worldSeed: ws, unlocked: camerasLive(lit), hunterRoom });
    const wall = pick(800, ws, 'wall', ep)/100;
    if (guideSight({covered, wallDistance: wall, tiltDeg: TILT, storeyH: H}).seen) seen++;
    n++;
  }
  const p=seen/n, err=(1-p)/2;
  console.log(`  ${lit} |     ${camerasLive(lit)}     |   ${(coverageFraction(1,camerasLive(lit))*100).toFixed(0)}%   |        ${(p*100).toFixed(1)}%        |       ${(err*100).toFixed(1)}%       | ${err>=T3_BAND.lo&&err<=T3_BAND.hi?'YES':'no'}`);
}
console.log('\nwhat guide-coverage C2 models instead (coverage only, no blind strip):');
for (let live=0; live<=5; live++) console.log(`  ${live} live cams -> modelled honest error ${(expectedHonestError(coverageFraction(1,live))*100).toFixed(1)}%  (gate only iterates 0..3)`);
