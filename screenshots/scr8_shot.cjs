// SCR-8 master profile screenshots (desktop + mobile) + overflow checks.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = '/home/aifactory/PartsDonor/.worktrees/t_1af02732';
const OUT = path.join(ROOT, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const FE = 'http://127.0.0.1:5185';
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, '_scr8_seed.json'), 'utf8'));
const CID = seed.cid;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  const shots = [
    { name: 'scr8-master-list-desktop.png', width: 1440, height: 920, url: `${FE}/masters`, isMobile: false },
    { name: 'scr8-master-list-mobile.png', width: 390, height: 844, url: `${FE}/masters`, isMobile: true },
    { name: 'scr8-master-desktop.png', width: 1440, height: 920, url: `${FE}/master/${CID}`, isMobile: false },
    { name: 'scr8-master-mobile.png', width: 390, height: 844, url: `${FE}/master/${CID}`, isMobile: true },
    { name: 'scr8-master-full-desktop.png', width: 1440, height: 920, url: `${FE}/master/${CID}`, isMobile: false, fullPage: true },
  ];

  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, isMobile: s.isMobile });
    const page = await ctx.newPage();
    await page.goto(s.url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2500);
    const checks = await page.evaluate(() => {
      const de = document.documentElement;
      const q = (sel) => document.querySelectorAll(sel).length;
      const detail = !!document.querySelector('.ms-hero');
      return {
        noHScroll: de.scrollWidth <= de.clientWidth,
        cards: q('.ms-card'),
        gridCols: detail ? -1 : getComputedStyle(document.querySelector('.ms-grid') || document.body).gridTemplateColumns.split(' ').length,
        arsenal: q('.ms-arsenal-item'),
        services: q('.ms-service'),
        exp: q('.ms-exp-item'),
        portfolio: q('.ms-portfolio-item'),
        b2b: q('.ms-b2b-item'),
        contacts: q('.ms-contact'),
        ratingBars: q('.ms-rating-bar'),
        detail,
      };
    });
    console.log(s.name, 'W=' + s.width, 'noHScroll=' + checks.noHScroll, JSON.stringify(checks));
    await page.screenshot({ path: path.join(OUT, s.name), fullPage: !!s.fullPage });
    await ctx.close();
  }

  await browser.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
