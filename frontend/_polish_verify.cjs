const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://127.0.0.1:5173';
const LOT = 'ba777dfc-7db7-43cd-8f6a-f707226f5a7d';
const OUT = '/home/aifactory/PartsDonor/backend/_polish_verify.log';
const SHOT = '/home/aifactory/PartsDonor';
let lines = [];
const log = (s,p,f)=>{ const l = p==='' ? `--- ${s} ---` : `[${s}] ${p?'PASS':'FAIL'}: ${f}`; lines.push(l); console.log(l); };
const fret = async (page, msg, file)=>{
  const b=await page.evaluate(()=>{const d={sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth};return d;});
  log(msg, b.sw<=b.cw+1, `scrollW=${b.sw} clientW=${b.cw}`);
  await page.screenshot({path:`${SHOT}/${file}`, fullPage:true});
};

// dead-button sweep: returns list of visible buttons with no onClick and not type=submit-in-form
const sweepDead = async (page, label) => {
  const dead = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button').forEach((b) => {
      const r = b.getBoundingClientRect();
      const vis = r.width>0 && r.height>0 && getComputedStyle(b).visibility!=='hidden' && b.offsetParent!==null;
      if (!vis) return;
      const hasHandler = b.onclick || b.getAttribute('onclick');
      const inForm = b.type==='submit' && b.closest('form');
      if (!hasHandler && !inForm) out.push((b.textContent||'').trim().slice(0,40) || b.className);
    });
    return out;
  });
  if (dead.length===0) log(`${label}-deadbtns`, true, 'no dead visible buttons');
  else log(`${label}-deadbtns`, false, 'dead buttons: '+JSON.stringify(dead));
};

(async()=>{
  const browser = await chromium.launch({headless:true});
  const ctx = await browser.newContext({viewport:{width:1280,height:800}});
  const page = await ctx.newPage();
  const failures = [];

  // ===== TASK 4: nav «Доноры» =====
  log('NAV','','');
  try{
    await page.goto(BASE); await page.waitForLoadState('networkidle');
    const nav = await page.$$eval('.pd-nav a', as=>as.map(a=>(a.textContent||'').trim()));
    log('nav-donor', nav.some(t=>t.includes('Доноры')), JSON.stringify(nav));
    await page.screenshot({path:`${SHOT}/pd-polish-nav-desktop.png`, fullPage:false});
    // click it
    await page.click('.pd-nav a:has-text("Доноры")');
    await page.waitForLoadState('networkidle'); await page.waitForTimeout(800);
    const h2 = await page.$eval('h2', el=>el.textContent||'').catch(()=>'');
    log('nav-donor-click', /Донор/.test(h2), `h2=${JSON.stringify(h2)}`);
  }catch(e){log('nav',false,e.message);failures.push('nav');}

  // ===== TASK 1: /part/6 exploded view with BOM =====
  log('PART6 EXPLODED','','');
  try{
    await page.goto(`${BASE}/part/6`); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1800);
    const head = await page.$eval('.pd-polish-head h3', el=>(el.textContent||'').trim()).catch(()=>'');
    log('part6-head', /Развёртка/.test(head), `head=${JSON.stringify(head)}`);
    const layers = await page.$$('.pd-polish-section .pd-layer-btn, .pd-polish-section .pd-flat-hotspot');
    log('part6-layers', layers.length>=5, `layers=${layers.length}`);
    const partBtns = await page.$$('.pd-polish-section .pd-part');
    log('part6-boms', partBtns.length>=5, `bom rows=${partBtns.length}`);
    // click a layer -> panel appears
    if (layers.length>0){ await layers[0].click(); await page.waitForTimeout(400); }
    const panel = await page.$eval('.pd-polish-section .pd-pt-panel', el=>(el.textContent||'').trim()).catch(()=>'');
    log('part6-panel', panel.length>0 && /Цена/.test(panel), `panel=${JSON.stringify(panel.slice(0,50))}`);
    const donorLink = !!(await page.$('.pd-polish-section a[href*="/donor-lot/"]'));
    log('part6-donorlink', donorLink, 'as-donor-link present');
    await fret(page,'part6-desktop-overflow','pd-polish-part6-desktop.png');
    // mobile
    await page.setViewportSize({width:400,height:800}); await page.waitForTimeout(600);
    await fret(page,'part6-mobile-overflow','pd-polish-part6-mobile.png');
  }catch(e){log('part6',false,e.message);failures.push('part6');}

  // ===== TASK 2: donor-lot anon renders (already backend-public) =====
  log('DONOR-LOT ANON','','');
  try{
    await page.setViewportSize({width:1280,height:800});
    await page.goto(`${BASE}/donor-lot/${LOT}`); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1800);
    const layers = await page.$$('.pd-layer-btn, .pd-flat-hotspot');
    log('dl-exploded', layers.length>=5, `layers=${layers.length}`);
    const err = await page.$eval('.pd-muted', el=>(el.textContent||'').trim()).catch(()=>'');
    log('dl-no-error', !/Ошибка/.test(err), `muted=${JSON.stringify(err)}`);
    await fret(page,'dl-desktop-overflow','pd-polish-donor-anon-desktop.png');
    await page.setViewportSize({width:400,height:800}); await page.waitForTimeout(600);
    await fret(page,'dl-mobile-overflow','pd-polish-donor-lot-mobile.png');
    await sweepDead(page,'dl');
  }catch(e){log('donor-lot',false,e.message);failures.push('dl');}

  // ===== TASK 3: dead-button sweep on key pages =====
  for (const [path,lbl] of [['/','cat'],['/donor-lots','donors'],['/part/6','p6']]){
    await page.setViewportSize({width:1280,height:800});
    await page.goto(BASE+path); await page.waitForLoadState('networkidle'); await page.waitForTimeout(800);
    await sweepDead(page,lbl);
  }

  fs.writeFileSync(OUT, lines.join('\n')+`\n--- SUMMARY ---\nPASS=${lines.filter(l=>l.includes('PASS')).length} FAIL=${lines.filter(l=>l.includes('FAIL')).length} FAILURES=${JSON.stringify(failures)}\n`);
  console.log('WROTE '+OUT);
  await browser.close();
})().catch(e=>{console.error('Fatal:',e.message);process.exit(1);});
