import { chromium } from 'playwright';
const WEB=5178,WS=5181;
const ABC='abcdefghjkmnpqrstuvwxyz';
const CODE=Array.from({length:4},()=>ABC[Math.floor(Math.random()*ABC.length)]).join('');
const HMR=`const noop=()=>{};export const createHotContext=()=>({accept:noop,acceptExports:noop,dispose:noop,prune:noop,decline:noop,invalidate:noop,on:noop,off:noop,send:noop,data:{}});export const updateStyle=(id,c)=>{let e=document.querySelector('style[data-vite-dev-id="'+id+'"]');if(!e){e=document.createElement('style');e.setAttribute('data-vite-dev-id',id);document.head.appendChild(e);}e.textContent=c;};export const removeStyle=(id)=>{document.querySelector('style[data-vite-dev-id="'+id+'"]')?.remove();};export const injectQuery=(u)=>u;export const ErrorOverlay=class{};`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=`http://127.0.0.1:${WEB}`;
async function seat(name,vp){const c=await browser.newContext({viewport:vp});await c.route('**/@vite/client',r=>r.fulfill({status:200,contentType:'application/javascript',body:HMR}));if(name)await c.addInitScript(n=>localStorage.setItem('rrr.party.name',n),name);return c;}
const host=await (await seat(null,{width:1280,height:800})).newPage();
await host.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}`,{waitUntil:'domcontentloaded'});
await host.waitForSelector('.night-code',{timeout:20000});
const phones=[];
for (const who of ['Ellie','Hai']) {
  const p=await (await seat(who,{width:390,height:844})).newPage();
  await p.goto(`${base}/?view=party.phone&room=${CODE}&wsPort=${WS}`,{waitUntil:'domcontentloaded'});
  await p.waitForSelector('#lock-look',{timeout:20000});
  await p.click('#lock-look');
  phones.push({page:p,name:who});
}
await sleep(800);
await host.locator('#go').click({timeout:20000,force:true});
for (const {page} of phones){await page.waitForSelector('#card-done',{state:'visible',timeout:30000});await page.click('#card-done');}
for (const {page,name} of phones){
  await page.waitForSelector('[data-pick]',{timeout:20000});
  for (const step of [0,1]){
    const picks=await page.$$('[data-pick]:not([disabled])');
    await picks[step===0?0:Math.min(1,picks.length-1)].click();
    await page.waitForSelector('#lock-pick',{state:'visible',timeout:15000});
    await page.click('#lock-pick');
    await sleep(200);
  }
}
await sleep(500);
await host.waitForSelector('#lock:not([disabled])',{timeout:20000});
await host.locator('#lock').click({timeout:20000,force:true});
await sleep(2500);
for (let i=0;i<8;i++){await host.evaluate(()=>document.querySelector('#to-run')?.click());await sleep(400);}
const snap=[];
for (const {page,name} of phones){
  snap.push(await page.evaluate((n)=>({
    name:n,
    h1:document.querySelector('h1')?.textContent||'',
    hasMap:!!document.querySelector('svg.guide-map'),
    youAreHere:/YOU ARE HERE/i.test(document.body.innerText||''),
    top:(document.body.innerText||'').slice(0,280).replace(/\n/g,' | '),
  }), name));
}
const tv=await host.evaluate(()=>({
  chrome:document.querySelector('.night-phase')?.textContent,
  cameras:(document.body.innerText.match(/CAMERAS?\s*\d+\s*\/\s*\d+/i)||[])[0]||null,
  alarms:(document.body.innerText.match(/ALARMS?\s*\d+/i)||[])[0]||null,
  mapOnTv:!!document.querySelector('svg.guide-map'),
  slateWarm:/camera warming/i.test(document.body.innerText||''),
}));
console.log(JSON.stringify({CODE,tv,phones:snap},null,2));
await browser.close();
