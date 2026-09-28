const { chromium } = require('playwright')

const BASE = 'http://127.0.0.1:5211/editor'
const results = []
const ok = (name, cond) => { results.push([name, !!cond]); console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name) }

const toClient = (page, sx, sy) => page.evaluate(([sx, sy]) => {
  const svg = document.querySelector('svg.bld-canvas')
  const ctm = svg.getScreenCTM()
  const p = new DOMPoint(sx, sy).matrixTransform(ctm)
  return { x: p.x, y: p.y }
}, [sx, sy])

async function selectSchema(page, text) {
  await page.locator('select.bld-select').selectOption({ label: text })
  await page.locator('.bld-load-row button', { hasText: 'Загрузить' }).click()
  await page.waitForSelector('.bld-msg.ok', { timeout: 8000 })
  await page.waitForTimeout(400)
}

async function overflow(page, width) {
  await page.setViewportSize({ width, height: 900 })
  await page.waitForTimeout(200)
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

  await page.goto(BASE, { waitUntil: 'networkidle' })
  ok('editor page title', await page.locator('.bld-title').textContent().then(t => t.includes('Конструктор')))

  // 1. Mode toggle renders
  const modeBtns = await page.locator('.bld-mode-btn').allTextContents()
  ok('mode toggle renders (2 buttons)', modeBtns.length === 2
    && /Редактирование/.test(modeBtns[0]) && /Просмотр/.test(modeBtns[1]))

  // 2. Load the seeded schema with figures (green display + red no-key)
  await selectSchema(page, 'BLD2Verif Pro')
  const figCount = await page.locator('svg.bld-canvas .bld-fig:not(.bld-draft)').count()
  ok('schema loaded with 3 figures', figCount === 3)

  // 3. Switch to view mode
  await page.locator('.bld-mode-btn', { hasText: 'Просмотр' }).click()
  await page.waitForTimeout(900) // let catalog lookups settle
  const viewFigs = await page.locator('svg.bld-canvas .bld-view-fig').count()
  ok('view mode renders clickable figures', viewFigs === 3)
  const hitAreas = await page.locator('.bld-view-hitarea').count()
  ok('each figure has a hit-area', hitAreas === 3)

  // 4. GREEN path: the display figure has key дисплей -> catalog in_stock => available
  //    (its stored manual fill is #4fa3ff blue, but view halo must be green)
  const displayFig = page.locator('.bld-view-fig').filter({ has: page.locator('.bld-view-hitarea[data-name="Экран"]') })
  ok('display figure is green (not unavailable)', (await displayFig.getAttribute('class')).split(/\s+/).indexOf('unavailable') === -1)
  const displayFill = await displayFig.locator('rect,circle,ellipse').first().getAttribute('fill')
  ok('green determined automatically (manual fill is blue, view fill transparent)', displayFill === 'transparent')

  // 5. Click display figure -> detail card opens with В наличии + price
  await displayFig.locator('.bld-view-hitarea').click()
  await page.waitForSelector('.bld-detail-card', { timeout: 3000 })
  ok('detail card opens', await page.locator('.bld-detail-card').count() === 1)
  const cardText = await page.locator('.bld-detail-card').innerText()
  ok('card shows status В наличии', /В наличии/.test(cardText))
  ok('card shows formatted price (ru-RU)', /1\s*500\s*₽/.test(cardText))

  // 6. RED path: no-key figure -> unavailable + price dash
  await page.locator('.bld-detail-close').click()
  const noKey = page.locator('.bld-view-fig').filter({ has: page.locator('.bld-view-hitarea[data-name="Деталь"]') })
  ok('no-key figure is red (unavailable)', (await noKey.getAttribute('class')).includes('unavailable'))
  await noKey.locator('.bld-view-hitarea').click()
  await page.waitForTimeout(150)
  const card2 = await page.locator('.bld-detail-card').innerText()
  ok('no-key card shows Нет в наличии', /Нет в наличии/.test(card2))
  ok('no-key card shows price dash', /—/.test(card2))

  // 7. Hit-area dimensions match figure bounding box
  const dim = await page.evaluate(() => {
    const ha = document.querySelector('.bld-view-hitarea[data-name="Экран"]')
    return {
      x: Number(ha.getAttribute('x')), y: Number(ha.getAttribute('y')),
      w: Number(ha.getAttribute('width')), h: Number(ha.getAttribute('height')),
    }
  })
  ok('hit-area covers whole figure bbox (x,y>=0,w,h>0)', dim.x === 85 && dim.y === 150 && dim.w === 140 && dim.h === 120)
  const halo = await page.evaluate(() => {
    const h = document.querySelector('.bld-view-fig:not(.unavailable) .bld-view-halo')
    return { x: Number(h.getAttribute('x')), y: Number(h.getAttribute('y')), w: Number(h.getAttribute('width')), h: Number(h.getAttribute('height')) }
  })
  ok('halo matches bbox too', halo.w === dim.w && halo.h === dim.h && halo.x === dim.x && halo.y === dim.y)

  // 8. Hover over whole area highlights (pointer-events all)
  const p = await toClient(page, 155, 210) // inside the display bbox (not on stroke edge)
  await page.mouse.move(p.x, p.y)
  await page.waitForTimeout(100)
  const hovered = await page.locator('.bld-view-fig:hover').count()
  ok('hover highlights whole area', hovered >= 1)

  // 9. Adaptive: no horizontal overflow
  ok('no horizontal overflow at 1440px', await overflow(page, 1440))
  ok('no horizontal overflow at 390px', await overflow(page, 390))

  // 10. Editing mode still works (round-trip draw persists)
  await page.locator('.bld-mode-btn', { hasText: 'Редактирование' }).click()
  await page.locator('.bld-tool', { hasText: 'Круг' }).click()
  const a = await toClient(page, 60, 300)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(a.x + 60, a.y + 60, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  ok('draw circle in edit mode persists', await page.locator('svg.bld-canvas circle.bld-fig[r]').count() >= 1)

  // 11. Editing round-trip: save -> reload does not regress
  const inputs = page.locator('.bld-save-form .pd-input')
  await inputs.nth(0).fill('BLD2Verif')
  await inputs.nth(1).fill('RT')
  await page.locator('.bld-save-form button[type=submit]').click()
  await page.waitForSelector('.bld-msg.ok', { timeout: 8000 })
  ok('round-trip save ok', /Схема сохранена/.test(await page.locator('.bld-msg.ok').textContent()))
  await page.waitForTimeout(500) // list refreshes
  await selectSchema(page, 'BLD2Verif RT')
  const reloaded = await page.locator('svg.bld-canvas .bld-fig:not(.bld-draft)').count()
  ok('round-trip reload loads all figures', reloaded >= 4)

  await page.screenshot({ path: 'bld2_view_desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 800 })
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'bld2_view_mobile.png', fullPage: true })

  await browser.close()

  const allOk = results.every(([, c]) => c)
  console.log('ALL_RESULT=' + (allOk ? 'PASS' : 'FAIL'))
  process.exit(allOk ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
