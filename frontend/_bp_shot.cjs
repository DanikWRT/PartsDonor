const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://127.0.0.1:5207/', { waitUntil: 'networkidle', timeout: 20000 }).catch(e => console.log('goto err', e.message));
  await page.waitForTimeout(2500);
  const cards = await page.locator('.donor-card').count();
  const bps = await page.locator('.db-mini').count();
  const bpParts = await page.locator('.bp-part').count();
  console.log('donor-cards:', cards, 'db-mini:', bps, 'bp-part:', bpParts);
  await page.screenshot({ path: '/tmp/bp_home.png', fullPage: false });
  console.log('console-errors:', errs.length, errs.slice(0,3));
  await browser.close();
})();
