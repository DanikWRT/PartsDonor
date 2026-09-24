// UX-FIX verification: photo <img> presence + exploded spread + screenshots
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5173';
const LOT = '/donor-lot/ba777dfc-7db7-43cd-8f6a-f707226f5a7d';
const PART6 = '/part/6';
const OUT = '/home/aifactory/PartsDonor';

async function probe(page, url, label) {
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const imgCount = await page.locator('img').count();
  const imgs = [];
  for (const e of await page.locator('img').all()) {
    const src = await e.getAttribute('src');
    imgs.push(src);
  }
  // exploded layer buttons (both layer + flat), distinct tops
  const tops = [];
  const btns = page.locator('.pd-layer-btn, .pd-flat-hotspot');
  const btnCount = await btns.count();
  for (let i = 0; i < btnCount; i++) {
    const b = btns.nth(i);
    const box = await b.boundingBox();
    if (box) tops.push(Math.round(box.y));
  }
  const distinct = new Set(tops).size;
  const allDistinct = tops.length > 0 && distinct === tops.length;
  return { label, url, imgCount, imgs, btnCount, tops, distinctTops: distinct, allDistinct };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const [vw, vh, tag] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
    const context = await browser.newContext({ viewport: { width: vw, height: vh } });
    const page = await context.newPage();

    for (const [url, slug] of [[LOT, 'donorlot'], [PART6, 'part6']]) {
      const r = await probe(page, url, slug);
      results.push(r);
      await page.waitForTimeout(400);
      const shot = `${OUT}/pd-uxfix-${r.label}-${tag}.png`;
      await page.screenshot({ path: shot, fullPage: true });
      r.screenshot = shot;
    }
    await context.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})();
