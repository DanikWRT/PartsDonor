const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = '/home/aifactory/PartsDonor/.worktrees/t_6a07133f/screenshots';
fs.mkdirSync(OUT, { recursive: true });
// slug is persisted by backend/_scr3_e2e.sh for THIS run; override via SLUG env
const SLUG = encodeURIComponent(process.env.SLUG || (fs.existsSync('/home/aifactory/PartsDonor/.worktrees/t_6a07133f/backend/_scr3_e2e_out.slug') ? fs.readFileSync('/home/aifactory/PartsDonor/.worktrees/t_6a07133f/backend/_scr3_e2e_out.slug', 'utf8').trim() : 'скр3-витрина-тест'));
const PORT = process.env.FE_PORT || 5199;
const URL = `http://127.0.0.1:${PORT}/storefront/${SLUG}`;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  const ctxD = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  const pageD = await ctxD.newPage();
  await pageD.goto(URL, { waitUntil: 'networkidle', timeout: 40000 });
  await pageD.waitForTimeout(2500);
  const heroD = await pageD.evaluate(() => document.body.textContent.includes('отзывов'));
  const cardsD = await pageD.evaluate(() => document.querySelectorAll('.sf-product-card').length);
  const darkD = await pageD.evaluate(() => !!(document.querySelector('.pd-app-storefront')) && !!(document.querySelector('.pd-app-showcase')));
  console.log('desktop hero?', heroD, 'cards:', cardsD, 'scopedDark:', darkD);
  await pageD.screenshot({ path: path.join(OUT, 'scr3-storefront-desktop.png'), fullPage: false });
  await ctxD.close();

  const ctxM = await browser.newContext({ viewport: { width: 400, height: 860 }, isMobile: true });
  const pageM = await ctxM.newPage();
  await pageM.goto(URL, { waitUntil: 'networkidle', timeout: 40000 });
  await pageM.waitForTimeout(2500);
  const cardsM = await pageM.evaluate(() => document.querySelectorAll('.sf-product-card').length);
  console.log('mobile cards:', cardsM);
  await pageM.screenshot({ path: path.join(OUT, 'scr3-storefront-mobile.png'), fullPage: false });
  await ctxM.close();

  await browser.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
