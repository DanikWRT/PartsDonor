// SCR-6 chat screenshots: seed a dialog+seller via API, then shoot desktop/mobile.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = '/home/aifactory/PartsDonor/.worktrees/t_89350a4f';
const OUT = path.join(ROOT, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const FE_PORT = process.env.FE_PORT || '5177';
const FE = `http://127.0.0.1:${FE_PORT}`;
const API = 'http://127.0.0.1:8019'; // live backend (raw paths)

async function reg(api, email, role, company) {
  const r = await fetch(`${api}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', role, ...(company ? { company_name: company } : {}) }),
  });
  if (!r.ok) throw new Error('register ' + email + ' ' + r.status + ' ' + (await r.text()));
  return r.json();
}
async function login(api, email) {
  const r = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123' }),
  });
  if (!r.ok) throw new Error('login ' + email + ' ' + r.status);
  return r.json();
}

async function main() {
  const R = Math.floor(Math.random() * 1e6);
  const sEmail = `scr6_sell_${R}@gmail.com`;
  const bEmail = `scr6_buy_${R}@gmail.com`;

  // seed users
  await reg(API, sEmail, 'seller', `Разборка ${R}`);
  await reg(API, bEmail, 'buyer');
  const s = await login(API, sEmail);
  const b = await login(API, bEmail);
  const sellerId = s.user_id;
  const sellerTok = s.access_token;
  const buyerId = b.user_id;
  const buyerTok = b.access_token;

  // create a listing for the seller (so the dialog can pin an item)
  const listing = await fetch(`${API}/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sellerTok },
    body: JSON.stringify({ title: `Дисплей iPhone 16 Pro Max ${R}`, price_rub: 18900, condition: 'working', provenance: 'e2e' }),
  });
  const listingData = await listing.json();
  const listingId = listingData.id;

  // seller creates dialog with buyer (pinned to the listing)
  const dia = await fetch(`${API}/dialogs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sellerTok },
    body: JSON.stringify({ participant_id: buyerId, listing_id: listingId }),
  });
  const dialog = await dia.json();
  const did = dialog.id;
  const S = { Authorization: 'Bearer ' + sellerTok, 'Content-Type': 'application/json' };
  const B = { Authorization: 'Bearer ' + buyerTok, 'Content-Type': 'application/json' };

  // seller: text
  await fetch(`${API}/dialogs/${did}/messages`, { method: 'POST', headers: S, body: JSON.stringify({ kind: 'text', body: 'Здравствуйте! Дисплей ещё в наличии?' }) });
  // buyer: reply text
  await fetch(`${API}/dialogs/${did}/messages`, { method: 'POST', headers: B, body: JSON.stringify({ kind: 'text', body: 'Да, в наличии. Оригинал, без царапин.' }) });
  // seller: pending OFFER (buyer will see accept/decline when THEY open, but we shoot as seller)
  const off = await fetch(`${API}/dialogs/${did}/messages`, { method: 'POST', headers: S, body: JSON.stringify({ kind: 'offer', offer_price: 17000, body: 'Могу отдать за 17 000 ₽' }) });
  const offData = await off.json();
  console.log('seeded dialog', did, 'offer', offData.offer_id, 'listing', listingId);
  console.log('sellerTok', sellerTok.slice(0, 12) + '...');

  fs.writeFileSync(path.join(ROOT, '_scr6_seed.json'), JSON.stringify({ did, offer_id: offData.offer_id, sellerTok, sellerId, buyerTok, buyerId, listingId, R }));

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  const shots = [
    { name: 'scr6-chat-desktop.png', width: 1440, height: 920, url: `${FE}/chat/${did}`, isMobile: false },
    { name: 'scr6-chat-mobile.png', width: 390, height: 844, url: `${FE}/chat/${did}`, isMobile: true },
    { name: 'scr6-dialogs-desktop.png', width: 1440, height: 920, url: `${FE}/chats`, isMobile: false },
  ];

  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, isMobile: s.isMobile });
    const page = await ctx.newPage();
    // inject auth before app loads
    await page.addInitScript(({ tok, uid }) => {
      localStorage.setItem('pd-token', tok);
      localStorage.setItem('pd-session', JSON.stringify({ token: tok, role: 'seller', user_id: uid, email: 'seller@example.com', company_id: null }));
    }, { tok: sellerTok, uid: sellerId });
    await page.goto(s.url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2500);
    const noH = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    const info = await page.evaluate(() => {
      const q = (sel) => document.querySelectorAll(sel).length;
      return { rows: q('.ch-row'), bubbles: q('.ch-bubble'), offer: q('.ch-offer'), pinned: q('.ch-pinned') };
    });
    console.log(s.name, 'viewport', s.width, 'noHScroll', noH, JSON.stringify(info));
    await page.screenshot({ path: path.join(OUT, s.name), fullPage: false });
    await ctx.close();
  }

  await browser.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
