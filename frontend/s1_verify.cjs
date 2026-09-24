/**
 * S1 Live Verification (clean) using Playwright against http://127.0.0.1:5173
 * Verifies spec section F + all ACCEPTANCE criteria.
 * Dynamic deal capture; buyer + seller roles.
 */
const { chromium } = require('playwright');
const http = require('http');

const BASE = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:8001';
const LOT_ID = 'ba777dfc-7db7-43cd-8f6a-f707226f5a7d';
const VERIFY_LOG = '/home/aifactory/PartsDonor/backend/_s1_verify.log';
const SCREENSHOTS_DIR = '/home/aifactory/PartsDonor';

const BUYER = { email: 'ux2sub.verify@gmail.com', pass: 'buyer123', role: 'buyer' };
const SELLER = { email: 'donor.seller.verify@gmail.com', pass: 'seller123', role: 'seller' };

let logLines = [];
let dealId = null;

function norm(s) { return (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }

function log(step, pass, facts) {
  if (pass === '') { logLines.push(`--- ${step} ---`); console.log(`--- ${step} ---`); return; }
  const line = `[${step}] ${pass ? 'PASS' : 'FAIL'}: ${facts}`;
  logLines.push(line);
  console.log(line);
}

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(API + path, {
      method, headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        let parsed = null; try { parsed = JSON.parse(d) } catch { parsed = d }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    r.on('error', reject); r.setTimeout(20000, () => { r.destroy(); reject(new Error('timeout')) });
    if (data) r.write(data); r.end();
  });
}
const apiGet = (p, t) => req('GET', p, null, t);
const apiPost = (p, b, t) => req('POST', p, b, t);

async function login(c) {
  const r = await apiPost('/auth/login', { email: c.email, password: c.pass });
  if (r.status === 200 && r.body.access_token) {
    return { token: r.body.access_token, role: r.body.role, user_id: r.body.user_id, company_id: r.body.company_id };
  }
  throw new Error('Login failed ' + r.status);
}

async function seedSession(page, s) {
  await page.addInitScript(({ token, role, email, user_id, company_id }) => {
    localStorage.setItem('pd-token', token);
    localStorage.setItem('pd-session', JSON.stringify({ token, role, user_id, email, company_id }));
  }, s);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // -------- login tokens --------
  let buyer, seller;
  try { buyer = await login(BUYER); log('AUTH-buyer', true, `buyer token, company=${buyer.company_id}`); } catch (e) { log('AUTH-buyer', false, e.message); }
  try { seller = await login(SELLER); log('AUTH-seller', true, `seller token, company=${seller.company_id}`); } catch (e) { log('AUTH-seller', false, e.message); }

  // ============ F(a) CATALOG TOGGLE + DONOR CARD ============
  log('F(a) CATALOG TOGGLE', '', '');
  try {
    await page.goto(BASE); await page.waitForLoadState('networkidle');
    await page.waitForSelector('.pd-toggle-btn', { timeout: 12000 });
    const btnTexts = [];
    for (const b of await page.$$('.pd-toggle-btn')) btnTexts.push((await b.textContent()).trim());
    const hasCatalog = btnTexts.some(t => t.includes('Каталог деталей'));
    const hasDonors = btnTexts.some(t => t.includes('Доноры целиком'));
    log('F(a)-toggle', hasCatalog && hasDonors, `toggle buttons: ${JSON.stringify(btnTexts)}`);

    const donorBtn = await page.$('button.pd-toggle-btn:has-text("Доноры целиком")');
    if (donorBtn) await donorBtn.click();
    await page.waitForTimeout(1200);
    await page.waitForSelector('.pd-donor-card-grid', { timeout: 12000 });
    const cards = await page.$$('.pd-donor-card');
    log('F(a)-grid', cards.length > 0, `${cards.length} donor card(s)`);
    if (cards.length > 0) {
      const c = norm(await cards[0].textContent());
      const hasPrice = c.includes('38 000');
      const hasMeta = c.includes('5 деталей');
      const hasSeller = c.includes('СмартРемонт');
      log('F(a)-card-content', hasPrice && hasMeta && hasSeller, `card: price38k=${hasPrice} meta5=${hasMeta} seller=${hasSeller}`);
    }
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/pd-s1-donor-catalog-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 400, height: 800 }); await page.waitForTimeout(600);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/pd-s1-donor-catalog-mobile.png`, fullPage: true });
    log('F(a)-shots', true, 'saved donor-catalog desktop+mobile pngs');
  } catch (e) { log('F(a)', false, e.message); }

  // ============ F(b) DONOR LOT PAGE ============
  log('F(b) DONOR LOT PAGE', '', '');
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/donor-lot/${LOT_ID}`); await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1600);
    const layers = await page.$$('.pd-layer-btn, .pd-flat-hotspot');
    const priceEl = await page.$('.pd-donor-lot-price');
    const priceTxt = norm(priceEl ? await priceEl.textContent() : '');
    const hasBuy = !!(await page.$('button:has-text("Купить целиком")'));
    log('F(b)-exploded', layers.length >= 5, `ExplodedScheme layers=${layers.length} (need>=5)`);
    log('F(b)-price', norm(priceTxt).includes('38 000'), `price=${JSON.stringify(priceTxt)}`);
    log('F(b)-buy', hasBuy, 'Купить целиком button present');
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/pd-s1-donor-lot-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 400, height: 800 }); await page.waitForTimeout(600);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/pd-s1-donor-lot-mobile.png`, fullPage: true });
    log('F(b)-shots', true, 'saved donor-lot desktop+mobile pngs');
  } catch (e) { log('F(b)', false, e.message); }

  // ============ F(c) BUY WHOLE -> DEAL ============
  log('F(c) BUY WHOLE -> DEAL', '', '');
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    // seed buyer session
    if (buyer) await seedSession(page, { token: buyer.token, role: 'buyer', email: BUYER.email, user_id: buyer.user_id, company_id: buyer.company_id });
    await page.goto(`${BASE}/donor-lot/${LOT_ID}`); await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const buyBtn = await page.$('button:has-text("Купить целиком")');
    if (buyBtn) { await buyBtn.click(); await page.waitForTimeout(2500); } else { log('F(c)-click', false, 'buy button not found'); }
    // capture deal id from Смотреть сделку link
    const dealLink = await page.$('a[href^="/deal/"]');
    if (dealLink) { const href = await dealLink.getAttribute('href'); dealId = href.replace('/deal/', ''); }
    log('F(c)-deal-id', !!dealId, `captured deal_id=${dealId}`);
    // verify deal via API
    let dealOk = false;
    if (dealId) {
      const dr = await apiGet(`/deals/${dealId}`);
      dealOk = dr.status === 200 && dr.body && dr.body.id === dealId;
      log('F(c)-deal-api', dealOk, `GET /deals/${dealId} -> ${dr.status}`);
    }
    // lot status negotiated
    const lot = await apiGet(`/donor-lots/${LOT_ID}`);
    const lotStatus = lot.body && lot.body.status;
    log('F(c)-lot-negotiated', lotStatus === 'negotiated', `lot.status=${lotStatus}`);
    // listing negotiated
    const listings = await apiGet('/listings');
    const dl = (listings.body || []).filter(l => l.donor_lot_id === LOT_ID);
    const anyNeg = dl.some(l => l.status === 'negotiated');
    log('F(c)-listing-negotiated', anyNeg, `donor listings=${dl.length} statuses=${JSON.stringify(dl.map(x => x.status))} (donor_lot_id present=${dl.every(l=>l.donor_lot_id===LOT_ID)})`);
    await page.goto(`${BASE}/donor-lot/${LOT_ID}`); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/pd-s1-deal-desktop.png`, fullPage: true });
    log('F(c)-shot', true, 'saved deal png');
  } catch (e) { log('F(c)', false, e.message); }

  // ============ F(d) REQUEST / TORG ============
  log('F(d) REQUEST (ТОРГ)', '', '');
  try {
    // buyer submits request via UI
    if (buyer) await seedSession(page, { token: buyer.token, role: 'buyer', email: BUYER.email, user_id: buyer.user_id, company_id: buyer.company_id });
    await page.goto(`${BASE}/donor-lot/${LOT_ID}`); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1400);
    const amountInput = await page.$('input[type="number"]');
    const messageInput = await page.$('textarea');
    if (amountInput && messageInput) {
      await amountInput.fill('35000');
      await messageInput.fill('Предлагаю цену 35000 ₽ (торг)');
      const submitBtn = await page.$('button:has-text("Отправить заявку")');
      if (submitBtn) { await submitBtn.click(); await page.waitForTimeout(1500); }
    }
    const notice = await page.$('.pd-notice');
    const noticeTxt = notice ? (await notice.textContent()).trim() : '';
    log('F(d)-ui-notice', noticeTxt.includes('Заявка отправлена'), `notice=${JSON.stringify(noticeTxt)}`);
    // seller sees requests via API
    const sr = await apiGet(`/donor-lots/${LOT_ID}/requests`, seller ? seller.token : null);
    const reqs = Array.isArray(sr.body) ? sr.body : (sr.body && sr.body.requests) || [];
    const hasReq = reqs.length > 0 && reqs.some(r => r.amount_rub === 35000 && r.status === 'pending');
    log('F(d)-seller-sees', hasReq, `GET /requests (seller) -> ${sr.status}, count=${reqs.length}, ${JSON.stringify(reqs.map(r => ({amt:r.amount_rub,st:r.status}))) || 'none'}`);
    // seller UI: load as seller role on the DonorLot page
    if (seller) await seedSession(page, { token: seller.token, role: 'seller', email: SELLER.email, user_id: seller.user_id, company_id: seller.company_id });
    await page.goto(`${BASE}/donor-lot/${LOT_ID}`); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1400);
    const reqSection = await page.$('.pd-requests-section');
    const hasReqSection = !!reqSection;
    const reqItems = reqSection ? await reqSection.$$('.pd-request-item') : [];
    log('F(d)-seller-ui', hasReqSection && reqItems.length > 0, `seller section=${hasReqSection}, request items=${reqItems.length}`);
  } catch (e) { log('F(d)', false, e.message); }

  // ============ F(e) ADAPTIVE OVERFLOW ============
  log('F(e) ADAPTIVE OVERFLOW', '', '');
  try {
    for (const width of [400, 1280]) {
      await page.setViewportSize({ width, height: 800 }); await page.waitForTimeout(800);
      const ov = await page.evaluate(() => {
        const b = document.body, h = document.documentElement;
        const sw = Math.max(b.scrollWidth, h.scrollWidth);
        const cw = Math.max(b.clientWidth, h.clientWidth);
        return { sw, cw, over: sw > cw + 1 };
      });
      log(`F(e)-overflow-${width}`, !ov.over, `scrollWidth=${ov.sw} clientWidth=${ov.cw} overflow=${ov.over}`);
      const els = await page.evaluate(() => {
        const l = document.querySelectorAll('.pd-layer-btn, .pd-flat-hotspot');
        const broken = Array.from(l).some(el => { const r = el.getBoundingClientRect(); return r.right > window.innerWidth + 1 || r.left < -1; });
        return { n: l.length, broken };
      });
      log(`F(e)-elements-${width}`, !els.broken, `layers=${els.n} broken=${els.broken}`);
    }
  } catch (e) { log('F(e)', false, e.message); }

  // ============ SUMMARY ============
  const fs = require('fs');
  const pass = logLines.filter(l => l.includes('PASS')).length;
  const fail = logLines.filter(l => l.includes('FAIL')).length;
  const summ = logLines.join('\n') + `\n\n--- SUMMARY ---\nTotal PASS: ${pass}, FAIL: ${fail}\ndeal_id: ${dealId || 'none'}\n`;
  fs.writeFileSync(VERIFY_LOG, summ);
  console.log(`\nWROTE ${VERIFY_LOG}: PASS=${pass} FAIL=${fail} deal_id=${dealId}`);
  await browser.close();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
