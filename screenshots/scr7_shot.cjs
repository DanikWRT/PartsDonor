// SCR-7 KB screenshots: seed a few articles + author, then shoot desktop/mobile/modal.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = '/home/aifactory/PartsDonor/.worktrees/t_3e7123f2';
const OUT = path.join(ROOT, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const FE_PORT = process.env.FE_PORT || '5180';
const FE = `http://127.0.0.1:${FE_PORT}`;
const API = 'http://127.0.0.1:8001'; // live backend (raw paths)

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
  const sEmail = `scr7_author_${R}@gmail.com`;
  await reg(API, sEmail, 'seller', `КБ Мастер ${R}`);
  const s = await login(API, sEmail);
  const sellerTok = s.access_token;
  const sellerId = s.user_id;
  const AU = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sellerTok };

  const arts = [
    { cat: 'схемы', title: `Схема разводки iPhone X ${R}`, excerpt: 'Распиновка шлейфов и платы по ревизиям.', body: 'Первая строка.\nВторая строка с деталями.', model: 'iPhone X', tags: 'схема, iphone, плата' },
    { cat: 'разборка', title: `Как разобрать Samsung A52 ${R}`, excerpt: 'Пошаговая разборка корпуса без повреждений.', body: 'Шаг 1: прогреть клей.\nШаг 2: снять модуль.', model: 'Samsung A52', tags: 'разборка, samsung, клей' },
    { cat: 'лайфхаки', title: `Лайфхак: пайка Flex ${R}`, excerpt: 'Проверенный способ восстановления шлейфа.', body: 'Пользуйтесь флюсом.\nНе перегревайте.', model: '', tags: 'пайка, флюс, flex' },
  ];
  for (const a of arts) {
    const r = await fetch(`${API}/kb/articles`, { method: 'POST', headers: AU, body: JSON.stringify({ ...a, priority: a.title.includes('iPhone') ? 3 : 0 }) });
    if (!r.ok) throw new Error('post article ' + r.status + ' ' + (await r.text()));
  }
  const list = await (await fetch(`${API}/kb/articles?limit=100`)).json();
  for (const a of list.slice(0, 3)) await fetch(`${API}/kb/articles/${a.id}`);
  console.log('seeded', arts.length, 'articles as', sEmail);
  console.log('sellerTok', sellerTok.slice(0, 12) + '...');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  // desktop (3-col + hero)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 } });
    const page = await ctx.newPage();
    await page.addInitScript(({ tok, uid }) => {
      localStorage.setItem('pd-token', tok);
      localStorage.setItem('pd-session', JSON.stringify({ token: tok, role: 'seller', user_id: uid, email: 'master@example.com', company_id: null }));
    }, { tok: sellerTok, uid: sellerId });
    await page.goto(`${FE}/kb`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);
    const noH = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    const info = await page.evaluate(() => ({
      hero: document.querySelectorAll('.kb-hero-stat').length,
      cats: document.querySelectorAll('.kb-cat-item').length,
      cards: document.querySelectorAll('.kb-card').length,
      authors: document.querySelectorAll('.kb-author-row').length,
    }));
    console.log('desktop noHScroll', noH, JSON.stringify(info));
    await page.screenshot({ path: path.join(OUT, 'scr7-kb-desktop.png') });
    await ctx.close();
  }

  // mobile (no h-scroll)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await ctx.newPage();
    await page.addInitScript(({ tok, uid }) => {
      localStorage.setItem('pd-token', tok);
      localStorage.setItem('pd-session', JSON.stringify({ token: tok, role: 'seller', user_id: uid, email: 'master@example.com', company_id: null }));
    }, { tok: sellerTok, uid: sellerId });
    await page.goto(`${FE}/kb`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);
    const noH = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    console.log('mobile noHScroll', noH);
    await page.screenshot({ path: path.join(OUT, 'scr7-kb-mobile.png') });
    await ctx.close();
  }

  // modal open (needs logged-in session so btnCreate shows)
  {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript(({ tok, uid }) => {
      localStorage.setItem('pd-token', tok);
      localStorage.setItem('pd-session', JSON.stringify({ token: tok, role: 'seller', user_id: uid, email: 'master@example.com', company_id: null }));
    }, { tok: sellerTok, uid: sellerId });
    await page.goto(`${FE}/kb`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    await page.click('.kb-create-btn');
    await page.waitForTimeout(600);
    const open = await page.evaluate(() => !!document.querySelector('.kb-modal-overlay'));
    const choices = await page.evaluate(() => document.querySelectorAll('.kb-choice').length);
    console.log('modal open', open, 'choices', choices);
    await page.screenshot({ path: path.join(OUT, 'scr7-kb-modal.png') });
    await ctx.close();
  }

  await browser.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
