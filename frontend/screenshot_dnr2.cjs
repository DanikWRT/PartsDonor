const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const WORKSPACE = '/home/aifactory/.hermes/kanban/workspaces/t_824f9f57';
fs.mkdirSync(WORKSPACE, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  
  // Desktop shot
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/donor/Apple/iPhone-13-Pro', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  
  // Take desktop screenshot before click
  await page.screenshot({ path: path.join(WORKSPACE, 'DNR2-desktop-before.png'), fullPage: false });
  
  // Check what's actually in the page
  const html = await page.evaluate(() => document.documentElement.outerHTML.substring(0, 5000));
  console.log('--- PAGE HTML (first 5000 chars) ---');
  console.log(html);
  
  // Check if there's any SVG
  const svgCount = await page.evaluate(() => document.querySelectorAll('svg').length);
  const partCount = await page.evaluate(() => document.querySelectorAll('.svg-part').length);
  const gCount = await page.evaluate(() => document.querySelectorAll('.pd-blowup g').length);
  console.log('SVGs:', svgCount, 'svg-parts:', partCount, 'g in blowup:', gCount);
  
  // Check if page loaded data
  const pageText = await page.evaluate(() => document.body.textContent.substring(0, 2000));
  console.log('--- PAGE TEXT ---');
  console.log(pageText);
  
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
