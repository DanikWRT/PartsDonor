const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://127.0.0.1:5207/', { waitUntil: 'networkidle', timeout: 20000 }).catch(()=>{});
  await page.waitForTimeout(2500);
  // Inspect first donor card's svg
  const svg = await page.locator('.donor-blueprint .db-mini').first();
  const vb = await svg.getAttribute('viewBox');
  console.log('viewBox:', vb);
  const rects = await svg.locator('rect').count();
  const paths = await svg.locator('path').count();
  const texts = await svg.locator('text').allTextContents();
  console.log('rects:', rects, 'paths:', paths);
  console.log('texts:', texts.slice(0,10));
  const hasDim = await svg.getAttribute('innerHTML').then(h=>/71\.6/.test(h));
  console.log('has 71.6 dim:', hasDim);
  // find a bp-part, get its data-part, and hover the corresponding comp-row
  const part = svg.locator('.bp-part').first();
  const dp = await part.getAttribute('data-part');
  console.log('first bp-part data-part:', dp);
  const activeBefore = await part.evaluate(el=>el.className.baseVal);
  console.log('class before hover:', activeBefore);
  // hover the comp-row matching data-part
  const row = page.locator('.comp-row').filter({ has: page.locator(`div`) });
  // Simulate hover on part, check row hl
  await part.hover();
  await page.waitForTimeout(300);
  const rowHl = await page.locator('.comp-row.hl').count();
  console.log('rows highlighted after hover part:', rowHl);
  await part.dispatchEvent('mouseleave');
  await page.waitForTimeout(200);
  // hover a comp-row, check bp-part.active
  if (rowHl > 0) {
    const hlRow = page.locator('.comp-row.hl').first();
    await hlRow.dispatchEvent('mouseleave');
  }
  const anyRow = page.locator('.comp-row').first();
  await anyRow.hover();
  await page.waitForTimeout(300);
  const activeParts = await svg.locator('.bp-part.active').count();
  console.log('active bp-Parts after row hover:', activeParts);
  await browser.close();
})();
