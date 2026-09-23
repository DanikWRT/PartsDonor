const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await pg.goto('http://127.0.0.1:5173/donor/Apple/iPhone%2013%20Pro', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(2500);
  const info = await pg.evaluate(() => {
    const out = [];
    document.querySelectorAll('.pd-layer-btn, .pd-flat-hotspot').forEach((el) => {
      out.push({ title: el.getAttribute('title'), top: el.style.top, left: el.style.left, cls: el.className.split(' ')[1]||el.className.split(' ')[0] });
    });
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
