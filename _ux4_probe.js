const { chromium } = require('playwright');
(async () => {
  try {
    const b = await chromium.launch({ headless: true });
    const pg = await b.newPage();
    await pg.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await pg.waitForTimeout(1500);
    console.log('TITLE=', await pg.title());
    const body = await pg.evaluate(() => document.body ? document.body.innerText.slice(0, 200) : 'NOBODY');
    console.log('BODY=', body);
    await b.close();
    console.log('PLAYWRIGHT_OK');
  } catch (e) {
    console.error('ERR', e.message);
    process.exit(1);
  }
})();
