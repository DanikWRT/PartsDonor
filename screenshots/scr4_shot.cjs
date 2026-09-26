const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = '/home/aifactory/PartsDonor/.worktrees/t_8765d60e/screenshots';
fs.mkdirSync(OUT, { recursive: true });
const PORT = process.env.FE_PORT || 5199;
const URL = `http://127.0.0.1:${PORT}/donor/new`;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  const ctxD = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  const pageD = await ctxD.newPage();
  await pageD.goto(URL, { waitUntil: 'networkidle', timeout: 40000 });
  await pageD.waitForTimeout(2500);
  const stepper = await pageD.evaluate(() => document.querySelectorAll('.wz-step').length);
  const overflowD = await pageD.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  console.log('desktop stepper:', stepper, 'noHScroll:', overflowD);
  await pageD.screenshot({ path: path.join(OUT, 'scr4-wizard-desktop.png'), fullPage: false });
  await ctxD.close();

  const ctxM = await browser.newContext({ viewport: { width: 400, height: 860 }, isMobile: true });
  const pageM = await ctxM.newPage();
  await pageM.goto(URL, { waitUntil: 'networkidle', timeout: 40000 });
  await pageM.waitForTimeout(2500);
  const stepperM = await pageM.evaluate(() => document.querySelectorAll('.wz-step').length);
  const overflowM = await pageM.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  console.log('mobile stepper:', stepperM, 'noHScroll:', overflowM);
  await pageM.screenshot({ path: path.join(OUT, 'scr4-wizard-mobile.png'), fullPage: false });
  await ctxM.close();

  await browser.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
