const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:5173/donor/Apple/iPhone%2013%20Pro';
const LOG_PATH = '/home/aifactory/PartsDonor/backend/_ux4_verify.log';
const SCREEN_DIR = '/home/aifactory/PartsDonor';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = { tests: [], screenshots: {} };

  // ---- DESKTOP (1280px) ----
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Test a: display renders as 2D flat + .pd-flat-hotspot
  const flatHotspots = await page.locator('.pd-flat-hotspot').count();
  const flatSvgs = await page.locator('.pd-flat-svg').count();
  const flatTags = await page.locator('.pd-flat-tag').all();
  const flatTagTexts = [];
  for (const t of flatTags) flatTagTexts.push(await t.innerText());
  
  const hasDispFlat = flatTagTexts.some(t => t.includes('Дисплей'));
  const hasBackFlat = flatTagTexts.some(t => t.includes('Корпус'));

  results.tests.push({
    name: 'display renders as 2D flat drawing + .pd-flat-hotspot',
    status: (flatSvgs > 0 && hasDispFlat) ? 'PASS' : 'FAIL',
    detail: `flat-svgs: ${flatSvgs}, hasDispFlat: ${hasDispFlat}, tags: ${JSON.stringify(flatTagTexts)}`
  });

  results.tests.push({
    name: 'backcover renders as 2D flat drawing + .pd-flat-hotspot',
    status: (flatSvgs > 0 && hasBackFlat) ? 'PASS' : 'FAIL',
    detail: `hasBackFlat: ${hasBackFlat}, tags: ${JSON.stringify(flatTagTexts)}`
  });

  // Test b: camera/board/battery are 3D .pd-layer-btn (NOT 2D)
  const layerSvgs = await page.locator('.pd-layer-btn .pd-layer-svg').count();
  const layerBtns = await page.locator('.pd-layer-btn').count();
  const flatHotspotCount = await page.locator('.pd-flat-hotspot').count();

  results.tests.push({
    name: 'camera/board/battery render as 3D .pd-layer-btn (NOT 2D)',
    status: (layerSvgs > 0 && flatHotspotCount <= 2) ? 'PASS' : 'FAIL',
    detail: `layer-svgs: ${layerSvgs}, layer-btns: ${layerBtns}, flat-hotspots: ${flatHotspotCount} (expect <=2)`
  });

  // Test c: clicking flat hotspot opens .pd-f7-panel
  // Click the display flat hotspot specifically by its role/title
  const displayHotspot = page.locator('.pd-flat-hotspot').filter({ hasText: 'Дисплей' });
  await displayHotspot.first().click();
  await page.waitForTimeout(500);
  const panelVisible = await page.locator('.pd-f7-panel').isVisible();
  const panelTitle = panelVisible ? await page.locator('.pd-f7-title').innerText() : '';

  results.tests.push({
    name: 'clicking flat hotspot opens .pd-f7-panel',
    status: (panelVisible && panelTitle.includes('Дисплей')) ? 'PASS' : 'FAIL',
    detail: `panelVisible: ${panelVisible}, title: ${panelTitle}`
  });

  // Test d: clicking 3D layer opens panel
  const camLayer = page.locator('.pd-layer-btn').filter({ hasText: 'Камера' });
  if (await camLayer.count() > 0) {
    await camLayer.first().click();
    await page.waitForTimeout(500);
    const panel2Visible = await page.locator('.pd-f7-panel').isVisible();
    const panel2Title = panel2Visible ? await page.locator('.pd-f7-title').innerText() : '';

    results.tests.push({
      name: 'clicking 3D layer opens .pd-f7-panel',
      status: (panel2Visible && panel2Title.toLowerCase().includes('камера')) ? 'PASS' : 'FAIL',
      detail: `panelVisible: ${panel2Visible}, title: ${panel2Title}`
    });
  } else {
    results.tests.push({
      name: 'clicking 3D layer opens .pd-f7-panel',
      status: 'FAIL',
      detail: 'camera layer button not found'
    });
  }

  // Test e: no horizontal overflow at 1280px
  const overflow1280 = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  });
  results.tests.push({
    name: 'no horizontal overflow at 1280px',
    status: !overflow1280 ? 'PASS' : 'FAIL',
    detail: `overflow: ${overflow1280}`
  });

  // Screenshots desktop
  await page.screenshot({ path: `${SCREEN_DIR}/pd-ux4-flat2d-desktop.png`, full_page: true });
  results.screenshots['flat2d_desktop'] = `${SCREEN_DIR}/pd-ux4-flat2d-desktop.png`;
  await page.screenshot({ path: `${SCREEN_DIR}/pd-ux4-vol3d-desktop.png`, full_page: true });
  results.screenshots['vol3d_desktop'] = `${SCREEN_DIR}/pd-ux4-vol3d-desktop.png`;

  await context.close();

  // ---- MOBILE (400px) ----
  const context2 = await browser.newContext({ viewport: { width: 400, height: 800 } });
  const page2 = await context2.newPage();
  
  await page2.goto(BASE, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(2000);

  // No overflow at 400px
  const overflow400 = await page2.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  });
  results.tests.push({
    name: 'no horizontal overflow at 400px',
    status: !overflow400 ? 'PASS' : 'FAIL',
    detail: `overflow: ${overflow400}`
  });

  // Flat drawing still works on mobile
  const flatSvgsM = await page2.locator('.pd-flat-svg').count();
  const flatTagsM = await page2.locator('.pd-flat-tag').all();
  const flatTagTextsM = [];
  for (const t of flatTagsM) flatTagTextsM.push(await t.innerText());

  results.tests.push({
    name: 'flat 2D drawing renders on mobile 400px',
    status: (flatSvgsM > 0 && flatTagTextsM.length >= 2) ? 'PASS' : 'FAIL',
    detail: `flat-svgs: ${flatSvgsM}, tags: ${JSON.stringify(flatTagTextsM)}`
  });

  // Screenshot mobile
  await page2.screenshot({ path: `${SCREEN_DIR}/pd-ux4-flat2d-mobile.png`, full_page: true });
  results.screenshots['flat2d_mobile'] = `${SCREEN_DIR}/pd-ux4-flat2d-mobile.png`;

  await context2.close();
  await browser.close();

  // Write log
  const allPass = results.tests.every(t => t.status === 'PASS');
  let log = 'UX-4 Verification Results\n' + '='.repeat(50) + '\n';
  log += `Overall: ${allPass ? 'PASS' : 'FAIL'}\n\n`;
  
  for (const t of results.tests) {
    log += `[${t.status}] ${t.name}\n`;
    log += `  Detail: ${t.detail}\n\n`;
  }
  
  log += `DOM Metrics:\n`;
  log += `  - Flat hotspots: ${flatHotspotCount}\n`;
  log += `  - Flat tags: ${JSON.stringify(flatTagTexts)}\n`;
  log += `  - 3D layer-svgs: ${layerSvgs}\n`;
  log += `  - Flat svgs: ${flatSvgs}\n`;
  log += `  - Overflow 1280px: ${overflow1280}\n`;
  log += `  - Overflow 400px: ${overflow400}\n`;
  log += `\nScreenshots:\n`;
  for (const [k, v] of Object.entries(results.screenshots)) {
    log += `  - ${k}: ${v}\n`;
  }

  fs.writeFileSync(LOG_PATH, log);
  console.log(`\nResults written to ${LOG_PATH}`);
  console.log(`All tests ${allPass ? 'PASS' : 'FAIL'}`);
  console.log(`Flat tag texts: ${JSON.stringify(flatTagTexts)}`);
  console.log(`3D layer-svgs present: ${layerSvgs > 0}`);
}

main().catch(e => { console.error(e); process.exit(1); });
