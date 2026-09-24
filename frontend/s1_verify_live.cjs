const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const BASE = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:8001';
const LOT = 'ba777dfc-7db7-43cd-8f6a-f707226f5a7d';
const OUT = '/home/aifactory/PartsDonor/backend/_s1_verify_live.log';
const SHOT = '/home/aifactory/PartsDonor';
let lines = [];
const log = (s,p,f)=>{ const l = p==='' ? `--- ${s} ---` : `[${s}] ${p?'PASS':'FAIL'}: ${f}`; lines.push(l); console.log(l); };
function req(m,p,b,t){return new Promise((res,rej)=>{const d=b?JSON.stringify(b):null;const r=http.request(API+p,{method:m,headers:{...(d?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(d)}:{}),...(t?{'Authorization':'Bearer '+t}:{})}},x=>{let s='';x.on('data',c=>s+=c);x.on('end',()=>{let j=null;try{j=JSON.parse(s)}catch{}res({status:x.statusCode,body:j});});});r.on('error',rej);r.setTimeout(20000,()=>{r.destroy();rej(new Error('timeout'))});if(d)r.write(d);r.end();});}
(async()=>{
  const browser = await chromium.launch({headless:true});
  const ctx = await browser.newContext({viewport:{width:1280,height:800}});
  const page = await ctx.newPage();

  // nav Доноры
  log('NAV','', '');
  try{
    await page.goto(BASE); await page.waitForLoadState('networkidle');
    const navTexts = await page.$$eval('.pd-nav a', as=>as.map(a=>(a.textContent||'').trim()));
    log('nav-donor', navTexts.some(t=>t.includes('Доноры')), JSON.stringify(navTexts));
    await page.screenshot({path:`${SHOT}/pd-s1-nav-desktop.png`, fullPage:false});
  }catch(e){log('nav',false,e.message);}

  // donor-lot page renders exploded with layers
  log('DONOR-LOT ANON','', '');
  try{
    await page.goto(`${BASE}/donor-lot/${LOT}`); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1800);
    const layers = await page.$$('.pd-layer-btn, .pd-flat-hotspot');
    log('dl-exploded', layers.length>=5, `layers=${layers.length}`);
    const price = await page.$eval('.pd-donor-lot-price', el=>(el.textContent||'').trim()).catch(()=>'');
    log('dl-price', price.includes('38 000'), `price=${JSON.stringify(price)}`);
    const hasBuy = !!(await page.$('button:has-text("Купить целиком")'));
    const hasNote = !!(await page.$('text=Необходим вход для покупки целиком'));
    log('dl-buy-gate', hasNote || !hasBuy, `buyBtn=${hasBuy} anonNote=${hasNote}`);
    await page.screenshot({path:`${SHOT}/pd-s1-donor-lot-desktop.png`, fullPage:true});
    // mobile
    await page.setViewportSize({width:400,height:800}); await page.waitForTimeout(600);
    const ov = await page.evaluate(()=>{const b=document.body;return {sw:Math.max(b.scrollWidth,document.documentElement.scrollWidth),cw:Math.max(b.clientWidth,document.documentElement.clientWidth)};});
    log('dl-mobile-overflow', ov.sw<=ov.cw+1, `scrollW=${ov.sw} clientW=${ov.cw}`);
    await page.screenshot({path:`${SHOT}/pd-s1-donor-lot-mobile.png`, fullPage:true});
  }catch(e){log('donor-lot',false,e.message);}

  // catalog toggle -> donor cards
  log('CATALOG DONORS','', '');
  try{
    await page.setViewportSize({width:1280,height:800});
    await page.goto(BASE); await page.waitForLoadState('networkidle'); await page.waitForSelector('.pd-toggle-btn',{timeout:12000});
    const toggles = await page.$$eval('.pd-toggle-btn', bs=>bs.map(b=>(b.textContent||'').trim()));
    log('cat-toggle', toggles.some(t=>t.includes('Доноры целиком')), JSON.stringify(toggles));
    await page.click('button.pd-toggle-btn:has-text("Доноры целиком")'); await page.waitForTimeout(1200);
    await page.waitForSelector('.pd-donor-card-grid',{timeout:12000});
    const cards = await page.$$('.pd-donor-card');
    log('cat-cards', cards.length>0, `donor cards=${cards.length}`);
  }catch(e){log('catalog',false,e.message);}

  fs.writeFileSync(OUT, lines.join('\n')+`\n--- SUMMARY ---\nPASS=${lines.filter(l=>l.includes('PASS')).length} FAIL=${lines.filter(l=>l.includes('FAIL')).length}\n`);
  console.log('WROTE '+OUT);
  await browser.close();
})().catch(e=>{console.error('Fatal:',e.message);process.exit(1);});
