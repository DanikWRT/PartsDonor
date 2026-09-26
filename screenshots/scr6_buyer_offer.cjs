// Shoot the chat as the BUYER (offer recipient) to confirm Принять/Отклонить buttons render.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = '/home/aifactory/PartsDonor/.worktrees/t_89350a4f';
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, '_scr6_seed.json')));
const FE_PORT = process.env.FE_PORT || '5177';
const FE = `http://127.0.0.1:${FE_PORT}`;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  const page = await ctx.newPage();
  await page.addInitScript(({ tok, uid }) => {
    localStorage.setItem('pd-token', tok);
    localStorage.setItem('pd-session', JSON.stringify({ token: tok, role: 'buyer', user_id: uid, email: 'buyer@example.com', company_id: null }));
  }, { tok: seed.buyerTok, uid: seed.buyerId });
  await page.goto(`${FE}/chat/${seed.did}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);
  const offerBtns = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.ch-offer-actions button')).map(b => b.textContent.trim());
    return { btns, offerStatus: document.querySelector('.ch-offer-status')?.textContent || null };
  });
  console.log('buyer view offer buttons:', JSON.stringify(offerBtns));
  await page.screenshot({ path: path.join(ROOT, 'screenshots/scr6-chat-buyer-offer.png'), fullPage: false });
  await browser.close();
  console.log('done');
}
main().catch(e => { console.error(e); process.exit(1); });
