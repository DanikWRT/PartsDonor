const { chromium } = require('playwright')

const BASE = 'http://127.0.0.1:5183'        // vite dev (BE_PORT -> 8031)
const BE = 'http://127.0.0.1:8031'          // my backend from this worktree
const results = []
const ok = (name, cond) => { results.push([name, !!cond]); console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name) }

const toClient = (page, sx, sy) => page.evaluate(([sx, sy]) => {
  const svg = document.querySelector('svg.bld-canvas')
  const ctm = svg.getScreenCTM()
  const p = new DOMPoint(sx, sy).matrixTransform(ctm)
  return { x: p.x, y: p.y }
}, [sx, sy])

async function drag(page, ax, ay, bx, by, steps = 8) {
  const a = await toClient(page, ax, ay)
  const b = await toClient(page, bx, by)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps)
  }
  await page.mouse.up()
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

  // ---------------- 1. /editor renders canvas + dropdowns from catalog ----------------
  await page.goto(BASE + '/editor', { waitUntil: 'networkidle' })
  ok('editor renders canvas', await page.locator('svg.bld-canvas').count() === 1)
  const brandSel = page.locator('select.bld-bm-select').nth(0)
  const modelSel = page.locator('select.bld-bm-select').nth(1)
  ok('brand+model dropdowns rendered', await page.locator('select.bld-bm-select').count() === 2)
  await page.waitForTimeout(700) // let donor-lots populate
  const brandOpts = await brandSel.locator('option').allTextContents()
  const modelOptsRaw = await modelSel.locator('option').allTextContents()
  ok('brand dropdown populated from catalog (>=1 brand)', brandOpts.some((t) => t.trim() === 'Apple'))
  ok('model dropdown initially lists models', modelOptsRaw.length >= 1)

  // select Apple / iPhone 13 Pro from the catalog dropdowns
  await brandSel.selectOption({ label: 'Apple' })
  await page.waitForTimeout(200)
  const modelOpts = await modelSel.locator('option').allTextContents()
  ok('model dropdown filtered to Apple models', modelOpts.some((t) => t.trim() === 'iPhone 13 Pro'))
  await modelSel.selectOption({ label: 'iPhone 13 Pro' })
  ok('brand/model selected', norm(await brandSel.inputValue()) === 'apple' && norm(await modelSel.inputValue()) === 'iphone 13 pro')

  // ---------------- 2. draw rect + circle, save -> POST /blueprints ----------------
  await drag(page, 60, 120, 160, 220) // rect (default tool)
  await page.locator('.bld-tool', { hasText: 'Круг' }).click()
  const c = await toClient(page, 100, 400)
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x + 70, c.y + 70, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  ok('drew rect + circle on canvas', await page.locator('svg.bld-canvas .bld-fig:not(.bld-draft)').count() >= 2)

  await page.locator('.bld-save-form button[type=submit]').click()
  await page.waitForSelector('.bld-msg.ok', { timeout: 9000 })
  const okMsg = await page.locator('.bld-msg.ok').textContent()
  ok('save msg ok (POST)', /Схема сохранена/.test(okMsg))
  const idMatch = String(okMsg).match(/id: ([0-9a-f-]{36})/)
  const savedId = idMatch ? idMatch[1] : null
  ok('received blueprint id from POST', !!savedId)

  const after = await fetch(BE + '/blueprints/Apple/iPhone%2013%20Pro').then((r) => r.json()).catch(() => null)
  ok('POST persisted brand/model + figures in DB', !!after && after.brand === 'Apple' && after.model === 'iPhone 13 Pro' && Array.isArray(after.parts) && after.parts.length >= 2)

  // ---------------- 3. /editor/:brand/:model loads existing figures back ----------------
  await page.goto(BASE + '/editor/Apple/iPhone-13-Pro', { waitUntil: 'networkidle' })
  await page.waitForSelector('.bld-canvas', { timeout: 9000 })
  await page.waitForTimeout(900) // let blueprint GET + donor-lots settle
  const loadedFigs = await page.locator('svg.bld-canvas .bld-fig:not(.bld-draft)').count()
  ok('editor/:brand/:model hydrated canvas from GET', loadedFigs >= 2)
  const bv = norm(await brandSel.inputValue())
  const mv = norm(await modelSel.inputValue())
  ok('editor/:brand/:model prefilled brand/model', bv === 'apple' && mv === 'iphone 13 pro')

  // ---------------- 4. edit (move a figure) + save -> PUT /blueprints/{id} ----------------
  await page.locator('.bld-tool', { hasText: 'Выбор' }).click()
  // move the loaded rect (top-left ~60,120..160,220) a bit
  await drag(page, 110, 170, 130, 190)
  await page.waitForTimeout(150)
  await page.locator('.bld-save-form button[type=submit]').click()
  await page.waitForSelector('.bld-msg.ok', { timeout: 9000 })
  const updMsg = await page.locator('.bld-msg.ok').textContent()
  ok('edit saved -> PUT updated message', /Схема обновлена/.test(updMsg))

  const ver = await fetch(BE + '/blueprints/Apple/iPhone%2013%20Pro').then((r) => r.json()).catch(() => null)
  ok('PUT persisted (row still exists, id stable)', !!ver && (savedId ? ver.id === savedId : true))

  // ---------------- 5. /donor/:brand/:model still renders + custom blueprint detected ----------------
  await page.goto(BASE + '/donor/Apple/iPhone-13-Pro', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const banner = await page.locator('.bld3-donor-banner').count()
  ok('/donor renders custom-blueprint edit link', banner === 1)
  const editLinkHref = await page.locator('.bld3-donor-editlink').getAttribute('href').catch(() => null)
  ok('edit link points to /editor/:brand/:model', !!editLinkHref && editLinkHref.indexOf('/editor/') === 0)
  ok('/donor page did not crash (body ok)', (await page.locator('body').count()) === 1)

  await page.screenshot({ path: 'bld3_editor_desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 800 })
  await page.waitForTimeout(200)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ok('no horizontal overflow on mobile', overflow)

  await browser.close()

  const allOk = results.every(([, c]) => c)
  console.log('ALL_RESULT=' + (allOk ? 'PASS' : 'FAIL'))
  process.exit(allOk ? 0 : 1)
})().catch((e) => { console.error('ERROR', e); process.exit(2) })
