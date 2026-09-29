const { chromium } = require('playwright')

const BASE = 'http://127.0.0.1:5183'        // vite dev (BE_PORT -> 8031)
const BE = 'http://127.0.0.1:8031'          // my backend from this worktree
const results = []
const ok = (name, cond) => { results.push([name, !!cond]); console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name) }

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

  // ---------------- 1. presets panel renders with categories + full grid ----------------
  await page.goto(BASE + '/editor', { waitUntil: 'networkidle' })
  ok('presets panel renders', await page.locator('aside.bld-presets').count() === 1)
  const catBtns = await page.locator('.bld-preset-cat').allTextContents()
  ok('category chips rendered (>= 11 cats incl Все)', catBtns.length >= 11 && catBtns[0].includes('Все'))
  const allCards = await page.locator('.bld-preset-card').count()
  ok('preset cards grid non-empty (>= 12)', allCards >= 12)
  console.log('   total preset cards:', allCards)

  // ---------------- 2. category filter narrows the grid ----------------
  await page.locator('.bld-preset-cat', { hasText: 'Дисплей' }).click()
  await page.waitForTimeout(120)
  const screenCards = await page.locator('.bld-preset-card').count()
  ok('category filter: Дисплей narrows grid (>=1 and < all)', screenCards >= 1 && screenCards < allCards)
  const namesScreen = await page.locator('.bld-preset-name').allTextContents()
  ok('filtered cards are display parts', namesScreen.some((n) => /Дисплей|Тачскрин|Матрица|Стекло/.test(n)))
  await page.locator('.bld-preset-cat', { hasText: 'Все' }).click()
  await page.waitForTimeout(120)

  // ---------------- 3. click a preset adds ready figure onto canvas ----------------
  const beforeFigs = await page.locator('svg.bld-canvas .bld-fig:not(.bld-draft)').count()
  await page.locator('.bld-preset-cat', { hasText: 'Аккумулятор' }).click()
  await page.waitForTimeout(120)
  await page.locator('.bld-preset-card', { hasText: 'Аккумулятор (АКБ)' }).first().click()
  await page.waitForTimeout(150)
  const afterFigs = await page.locator('svg.bld-canvas .bld-fig:not(.bld-draft)').count()
  ok('click preset adds a figure on canvas', afterFigs === beforeFigs + 1)

  // ---------------- 4. added figure has correct key + RU name ----------------
  const addedProps = await page.evaluate(() => {
    const els = document.querySelectorAll('svg.bld-canvas .bld-fig:not(.bld-draft)')
    const sel = els[els.length - 1]
    return { title: sel ? (sel.querySelector('title') || {}).textContent : null }
  })
  ok('added figure has RU name in its <title>', !!addedProps.title && addedProps.title.includes('Аккумулятор'))
  const keyInput = page.locator('.bld-props .pd-input').nth(1)
  const nameInput = page.locator('.bld-props .pd-input').nth(0)
  ok('properties panel shows key=battery for added figure', (await keyInput.inputValue()).trim() === 'battery')
  ok('properties panel shows RU name', (await nameInput.inputValue()).trim().includes('Аккумулятор'))

  // ---------------- 5. added figure selectable; select tool active ----------------
  const activeTool = await page.locator('.bld-tool.is-active').textContent()
  ok('select tool active after preset add', activeTool.includes('Выбор'))

  // ---------------- 6. add several presets for a layered phone ----------------
  await page.locator('.bld-preset-cat', { hasText: 'Дисплей' }).click()
  await page.waitForTimeout(120)
  await page.locator('.bld-preset-card', { hasText: 'Дисплей в сборе' }).first().click()
  await page.waitForTimeout(100)
  await page.locator('.bld-preset-cat', { hasText: 'Плата' }).click()
  await page.waitForTimeout(120)
  await page.locator('.bld-preset-card', { hasText: 'Материнская плата' }).first().click()
  await page.waitForTimeout(100)
  const total = await page.locator('svg.bld-canvas .bld-fig:not(.bld-draft)').count()
  ok('battery + display + motherboard = 3 figures', total === 3)

  // ---------------- 7. save persists preset figures with key/name ----------------
  await page.goto(BASE + '/editor', { waitUntil: 'networkidle' })
  await page.waitForSelector('svg.bld-canvas', { timeout: 9000 })
  await page.waitForTimeout(700)
  const brandSel = page.locator('select.bld-bm-select').nth(0)
  const modelSel = page.locator('select.bld-bm-select').nth(1)
  const hasBrandSel = await page.locator('select.bld-bm-select').count()
  if (hasBrandSel === 2) {
    const optsB = await brandSel.locator('option').allTextContents()
    const okBrand = optsB.find((t) => t.trim() === 'Apple')
    if (okBrand) {
      await brandSel.selectOption({ label: okBrand.trim() })
      await page.waitForTimeout(150)
      await modelSel.selectOption({ index: 1 })
    }
  }
  const bIn = page.locator('.bld-save-grid .pd-input, .bld-save-grid .pd-select').nth(0)
  const mIn = page.locator('.bld-save-grid .pd-input, .bld-save-grid .pd-select').nth(1)
  const bv = await bIn.inputValue().catch(() => '')
  const mv = await mIn.inputValue().catch(() => '')
  if (!String(bv).trim()) await bIn.fill('Apple')
  if (!String(mv).trim()) await mIn.fill('iPhone 13 Pro')
  await page.waitForTimeout(100)
  await page.locator('.bld-preset-card', { hasText: 'Аккумулятор (АКБ)' }).first().click()
  await page.waitForTimeout(150)
  await page.locator('.bld-save-form button[type=submit]').click()
  await page.waitForSelector('.bld-msg.ok', { timeout: 9000 }).catch(() => {})
  const saveMsg = await page.locator('.bld-msg.ok').textContent().catch(() => null)
  ok('save after preset add shows ok', !!saveMsg && /Схема (сохранена|обновлена)/.test(saveMsg))
  const idMatch = saveMsg ? String(saveMsg).match(/id: ([0-9a-f-]{36})/) : null
  // Note: BLD-3 API offers GET /blueprints (list), GET /blueprints/{brand}/{model},
  // PUT /blueprints/{id} — no GET-by-id. So verify persistence by scanning the list
  // for a blueprint row whose parts include the battery preset (key=battery, RU name).
  const list = await fetch(BE + '/blueprints').then((r) => r.json()).catch(() => [])
  const hasBattery = (Array.isArray(list) ? list : []).some((b) =>
    Array.isArray(b?.parts) && b.parts.some((p) => p.key === 'battery' && /Аккумулятор/.test(p.name || '')))
  ok('persisted parts include battery preset', !!hasBattery)
  ok('got blueprint id from save for traceability', !!idMatch)

  // ---------------- 8. no horizontal overflow on mobile ----------------
  await page.screenshot({ path: 'bld4_editor_desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 800 })
  await page.waitForTimeout(200)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ok('no horizontal overflow on mobile', overflow)
  await page.screenshot({ path: 'bld4_editor_mobile.png', fullPage: true })

  await browser.close()
  const allOk = results.every(([, c]) => c)
  console.log('ALL_RESULT=' + (allOk ? 'PASS' : 'FAIL'))
  process.exit(allOk ? 0 : 1)
})().catch((e) => { console.error('ERROR', e); process.exit(2) })
