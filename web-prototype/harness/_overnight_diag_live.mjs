import { chromium } from 'playwright';
const WEB=5178,WS=5181;
const ABC='abcdefghjkmnpqrstuvwxyz23456789';
const CODE=[...Array(4)].map(()=>ABC[Math.floor(Math.random()*ABC.length)]).join('');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const HMR=`const noop=()=>{};
export const createHotContext=()=>({accept:noop,acceptExports:noop,dispose:noop,prune:noop,call:noop,invalidate:noop,on:noop,off:noop,send:noop,data:{}});
export const updateStyle=(id,c)=>{let e=document.querySelector('style[data-vite-dev-id="'+id+'"]');if(!e){e=document.createElement('style');e.setAttribute('data-vite-dev-id',id);document.head.appendChild(e);}e.textContent=c;};
export const removeStyle=id=>document.querySelector('style[data-vite-dev-id="'+id+'"]')?.remove();
export const injectQuery=u=>u; export const ErrorOverlay=class{};`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=desktop','--disable-gpu-driver-bug-workarounds']});
async function seat(name,vp){const c=await browser.newContext({viewport:vp});await c.route('**/@vite/client',r=>r.fulfill({status:200,contentType:'application/javascript',body:HMR}));if(name)await c.addInitScript(n=>localStorage.setItem('rrr.party.name',n),name);return c;}
const base=`http://127.0.0.1:${WEB}`;
const host=await (await seat(null,{width:1280,height:800})).newPage();
await host.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}`,{waitUntil:'domcontentloaded',timeout:45000});
await host.waitForSelector('.night-code',{timeout:25000});
console.log('CODE',CODE);
const phones=[];
for(const who of ['Ada','Ben']){
  const p=await (await seat(who,{width:390,height:844})).newPage();
  await p.goto(`${base}/?view=party.phone&room=${CODE}&wsPort=${WS}`,{waitUntil:'domcontentloaded'});
  for(let i=0;i<40;i++){const st=await p.evaluate(()=>({lock:!!document.querySelector('#lock-look'),join:!!document.querySelector('#join')})); if(st.lock)break; if(st.join) await p.locator('#join').click({force:true}).catch(()=>{}); await sleep(300);}
  await p.waitForSelector('#lock-look',{timeout:25000}); await p.click('#lock-look'); phones.push(p); console.log('JOIN',who);
}
for(let i=0;i<40;i++){if(await host.evaluate(()=>{const b=document.querySelector('#go');return b&&!b.disabled;}))break;await sleep(300);}
await host.locator('#go').click({timeout:20000,force:true});
for(const p of phones){
  await p.waitForFunction(()=>{const b=document.querySelector('#card-done');const v=document.querySelector('.card-view');return !!b&&!!v&&!v.classList.contains('hide');},{timeout:45000});
  const bar=await p.$('#card-hold'); if(bar){const box=await bar.boundingBox(); if(box){await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await sleep(300);await p.mouse.up();await sleep(400);}}
  await p.locator('#card-done').click({timeout:15000,force:true});
}
for(const p of phones){
  await p.waitForSelector('[data-pick]',{timeout:45000});
  for(const step of [0,1]){await p.waitForSelector('[data-pick]:not([disabled])',{timeout:20000}); const picks=await p.$$('[data-pick]:not([disabled])'); await picks[step===0?0:Math.min(1,picks.length-1)].click(); await p.waitForSelector('#lock-pick',{state:'visible',timeout:15000}); await p.locator('#lock-pick').click({timeout:20000,force:true}); await sleep(300);}
}
await sleep(800);
for(let i=0;i<80;i++){if(await host.evaluate(()=>!!document.querySelector('#lock'))){await host.locator('#lock').click({force:true});break;} const btn=host.locator('button:has-text("Send them in")'); if(await btn.count()){await btn.first().click({force:true});break;} await sleep(400);}
console.log('LOCK sent');
for(let i=0;i<120;i++){
  const s=await host.evaluate(()=>{
    const h=window.__rrrHost||{};
    return {i, beat:h.beat, warm:h.warm, followLive:h.followLive, followMode:h.followMode, body:(document.body?.innerText||'').slice(0,300).replace(/\n/g,' | '), hasFrame:!!document.querySelector('.run-frame'), iframe:document.querySelectorAll('iframe').length};
  });
  if(i%10===0 || (s.followLive && s.beat==='expedition')) console.log('TICK', JSON.stringify(s).slice(0,500));
  if(s.beat==='expedition' && s.followLive && (s.warm==='ready' || s.warm==null || s.warm===true)) { console.log('LIVE_OK', s); break; }
  await sleep(500);
}
await host.screenshot({path:'progress/overnight-hunt29b/tv-diag.png'}).catch(()=>{});
await browser.close();
console.log('DIAG_DONE');
