const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const WORKSPACE = '/home/aifactory/.hermes/kanban/workspaces/t_824f9f57';
fs.mkdirSync(WORKSPACE, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  
  // Desktop shot
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/donor/Apple/iPhone-13-Pro', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Take desktop screenshot before click
  await page.screenshot({ path: path.join(WORKSPACE, 'DNR2-desktop-before.png'), fullPage: false });
  
  // Click on a layer (first .svg-part)
  try {
    const svgPart = await page.waitForSelector('.svg-part', { timeout: 5000 });
    await svgPart.click();
    await page.waitForTimeout(2000);
    
    // Take desktop screenshot after click
    await page.screenshot({ path: path.join(WORKSPACE, 'DNR2-desktop.png'), fullPage: false });
    
    // Also get the y-coords of layers
    const layerRects = await page.evaluate(() => {
      const parts = document.querySelectorAll('.svg-part');
      return Array.from(parts).map((p, i) => {
        const rect = p.getBoundingClientRect();
        const text = p.querySelector('.callout-text');
        return { index: i, y: rect.y, label: text?.textContent || '' };
      });
    });
    console.log('Desktop layer rects:', JSON.stringify(layerRects, null, 2));
    
    // Verify no overlap
    const ys = layerRects.map(r => r.y);
    const sorted = [...ys].sort((a,b) => a-b);
    let overlap = false;
    for (let i = 1; i < sorted.length; i++) {
      if (Math.abs(sorted[i] - sorted[i-1]) < 5) overlap = true;
    }
    console.log('Layer y-coords distinct (no overlap):', !overlap);
    
  } catch(e) {
    console.log('Could not click svg-part:', e.message);
    // Still take screenshot
    await page.screenshot({ path: path.join(WORKSPACE, 'DNR2-desktop.png'), fullPage: false });
  }
  
  await browser.close();
  
  // Mobile shot
  const browser2 = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const ctx2 = await browser2.newContext({ viewport: { width: 390, height: 844 } });
  const page2 = await ctx2.newPage();
  await page2.goto('http://localhost:5173/donor/Apple/iPhone-13-Pro', { waitUntil: 'networkidle', timeout: 30000 });
  await page2.waitForTimeout(3000);
  await page2.screenshot({ path: path.join(WORKSPACE, 'DNR2-mobile.png'), fullPage: false });
  
  await browser2.close();
  console.log('DONE');
}

main().catch(e => { console.error(e); process.exit(1); });
