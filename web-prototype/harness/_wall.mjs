const hash=(...p)=>{let h=0x811c9dc5>>>0;const s=p.join(':');for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h>>>0;};
const pick=(n,...p)=>(hash(...p)>>>8)%n;
const mk=i=>hash('sd',i,'world');
const STRIP=2.552;
const pctf=x=>(x*100).toFixed(2)+'%';
console.log('wall distance = pick(800,...)/100 in [0,8); the guide is blind when wall <= 2.552');
console.log('\nP(blind at ep+1 | blind at ep) vs P(blind at ep+1 | not blind), 400k seeds');
for(let ep=1;ep<=4;ep++){
  let a=0,ab=0,na=0,nb=0;
  for(let i=0;i<400000;i++){const ws=mk(i);
    const b1=pick(800,ws,'wall',ep)/100<=STRIP, b2=pick(800,ws,'wall',ep+1)/100<=STRIP;
    if(b1){a++;if(b2)ab++;}else{na++;if(b2)nb++;}}
  console.log(`  ep${ep}->${ep+1}: P(blind'|blind)=${pctf(ab/a)} · P(blind'|sighted)=${pctf(nb/na)} · marginal ${pctf(a/(a+na))}`);
}
console.log('\ncorrelation of the raw wall value across episodes (Pearson r)');
for(let ep=1;ep<=4;ep++){
  let sx=0,sy=0,sxy=0,sxx=0,syy=0,n=400000;
  for(let i=0;i<n;i++){const ws=mk(i);const x=pick(800,ws,'wall',ep),y=pick(800,ws,'wall',ep+1);
    sx+=x;sy+=y;sxy+=x*y;sxx+=x*x;syy+=y*y;}
  const r=(n*sxy-sx*sy)/Math.sqrt((n*sxx-sx*sx)*(n*syy-sy*sy));
  console.log(`  ep${ep}->${ep+1}: r = ${r.toFixed(4)}`);
}
console.log('\nthrottle detent (pick(3)) repeat across episodes, ideal 33.3%');
for(let ep=1;ep<=4;ep++){
  let s=0;for(let i=0;i<400000;i++){const ws=mk(i);if(pick(3,ws,'throttle',ep)===pick(3,ws,'throttle',ep+1))s++;}
  console.log(`  ep${ep}->${ep+1}: ${pctf(s/400000)}`);
}
console.log('\nprowl loudness (pick(4)) repeat across episodes, ideal 25%');
for(let ep=1;ep<=4;ep++){
  let s=0;for(let i=0;i<400000;i++){const ws=mk(i);if(pick(4,ws,'prowl',ep)===pick(4,ws,'prowl',ep+1))s++;}
  console.log(`  ep${ep}->${ep+1}: ${pctf(s/400000)}`);
}
