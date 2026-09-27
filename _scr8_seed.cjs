// SCR-8 seed: register seller + full master profile + reviews for a rich detail page.
const fs = require('fs');
const path = require('path');

const API = process.env.API || 'http://127.0.0.1:8001';
const OUT = '/home/aifactory/PartsDonor/.worktrees/t_1af02732/_scr8_seed.json';

const R = Math.floor(Math.random() * 1e6);
const email = `scr8_master_${R}@gmail.com`;
const company = `РазборкаТех ${R}`;

async function reg(email, role, company) {
  const r = await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', role, ...(company ? { company_name: company } : {}) }),
  });
  if (!r.ok) throw new Error('register ' + email + ' ' + r.status + ' ' + (await r.text()));
  return r.json();
}
async function login(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123' }),
  });
  if (!r.ok) throw new Error('login ' + r.status);
  return r.json();
}

async function main() {
  const u = await reg(email, 'seller', company);
  const cid = u.company_id;
  const s = await login(email);
  const tok = s.access_token;
  const A = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok };

  const profile = {
    tagline: 'Модульный ремонт, замена стекла, пайка BGA, прошивка и чистка после залития. Работаю с розницей и B2B-партнёрами по всей России.',
    city: 'Москва',
    since: 2017,
    experience: [
      { year: 2022, title: 'Основатель мастерской', desc: 'Полный цикл ремонта iPhone, Samsung, Xiaomi. BGA-оборудование, работа с B2B-партнёрами.' },
      { year: 2019, title: 'Ведущий мастер', desc: 'Пайка BGA, восстановление плат после залития, модульный ремонт.' },
      { year: 2017, title: 'Мастер по ремонту', desc: 'Замена дисплеев, аккумуляторов, стекла.' },
    ],
    services: ['Модульный ремонт (замена дисплея)', 'Замена стекла (сепарация + ламинация)', 'Замена аккумулятора', 'Пайка BGA и реболл', 'Ремонт после залития (чистка УЗ)', 'Прошивка iPhone / Samsung', 'Восстановление Face ID / True Tone', 'Замена камеры, шлейфов, кнопок', 'Ремонт материнской платы', 'Восстановление данных', 'Диагностика и смета'],
    arsenal: [
      { name: 'Микроскоп Leica A60', note: 'Бинокулярный, 10–30×, для BGA и микро-пайки' },
      { name: 'Паяльная станция Hakko FX-888D', note: 'Аналоговая, 70 Вт' },
      { name: 'Термовоздушная станция Quick 861DW', note: '1000 Вт, 100–500°C' },
      { name: 'УЗ-ванна GT Sonic 3л', note: 'Для отмывки плат после залития' },
      { name: 'Программатор JCID P15', note: 'Прошивка iPhone' },
      { name: 'Ламинатор + автоклав', note: 'Модульный ремонт, ламинация OLED' },
    ],
    portfolio: [
      { title: 'iPhone 16 Pro Max', desc: 'Замена дисплея + Face ID' },
      { title: 'iPhone 15 Pro', desc: 'Реболл A17 Pro' },
      { title: 'iPhone 14 Pro', desc: 'Ремонт после залития' },
      { title: 'Samsung S24 Ultra', desc: 'Пайка контроллера питания' },
      { title: 'iPhone 13 Pro', desc: 'Замена стекла (модульный)' },
      { title: 'Xiaomi 14 Pro', desc: 'Восстановление после КЗ' },
    ],
    b2b: ['Опт и регулярные объёмы', 'Работа как подрядчик', 'Договор и закрывающие документы', 'Отсрочка платежа для постоянных'],
    contacts: [
      { type: 'telegram', value: '@razborka_tech' },
      { type: 'phone', value: '+7 (999) 000-42-18' },
      { type: 'address', value: 'Москва, м. Динамо' },
    ],
  };
  const put = await fetch(`${API}/master/profiles/${cid}`, { method: 'PUT', headers: A, body: JSON.stringify(profile) });
  if (!put.ok) throw new Error('PUT profile ' + put.status + ' ' + (await put.text()));
  console.log('profile saved for company', cid);

  // seed some reviews so rating distribution + avg show real values
  const ratings = [5, 5, 5, 4, 3];
  for (const rating of ratings) {
    await fetch(`${API}/reviews`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, comment: 'Отзыв через API', seller_id: cid }),
    });
  }
  console.log('seeded', ratings.length, 'reviews');

  fs.writeFileSync(OUT, JSON.stringify({ email, company, cid, tok, R }));
  console.log('wrote', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
