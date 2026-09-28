const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  const results = []
  const ok = (name, cond) => { results.push([name, !!cond]); console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name) }

  await page.goto('http://127.0.0.1:5179/editor', { waitUntil: 'networkidle' })

  ok('editor page title', await page.locator('.bld-title').textContent().then(t => t.includes('Конструктор схемы')))
  ok('svg canvas present', await page.locator('svg.bld-canvas').count() === 1)
  const vbox = await page.locator('svg.bld-canvas').getAttribute('viewBox')
  ok('viewBox 340x640', vbox === '0 0 340 640')
  ok('phone outline rect', await page.locator('svg.bld-canvas rect[width="308"]').count() >= 1)
  ok('global nav link', await page.locator('.pd-nav a[href="/editor"]').count() === 1)

  const toClient = (sx, sy) => page.evaluate(([sx, sy]) => {
    const svg = document.querySelector('svg.bld-canvas')
    const ctm = svg.getScreenCTM()
    const p = new DOMPoint(sx, sy).matrixTransform(ctm)
    return { x: p.x, y: p.y }
  }, [sx, sy])

  const drag = async (ax, ay, bx, by, steps = 8) => {
    const a = await toClient(ax, ay)
    const b = await toClient(bx, by)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps)
    }
    await page.mouse.up()
  }

  // 2. Draw rect (default tool)
  await drag(60, 120, 160, 220)
  await page.waitForTimeout(120)
  ok('rect persisted', await page.locator('svg.bld-canvas rect.bld-fig[width][height]').count() >= 1)

  // 3. Draw a circle
  await page.locator('.bld-tool', { hasText: 'Круг' }).click()
  await drag(90, 330, 140, 330)
  await page.waitForTimeout(120)
  ok('circle persisted', await page.locator('svg.bld-canvas circle.bld-fig[r]').count() >= 1)

  // 4. Select & move the rect
  await page.locator('.bld-tool', { hasText: 'Выбор' }).click()
  const rectAttr = (name) => page.locator('svg.bld-canvas rect.bld-fig').first().getAttribute(name)
  const rx0 = await rectAttr('x')
  const ry0 = await rectAttr('y')
  await drag(110, 170, 135, 205)
  await page.waitForTimeout(120)
  const rx1 = await rectAttr('x')
  const ry1 = await rectAttr('y')
  ok('rect moved (x changed)', Number(rx1) > Number(rx0))
  ok('rect moved (y changed)', Number(ry1) > Number(ry0))

  // 5. Resize via handle
  const bb = await page.evaluate(() => {
    const r = document.querySelector('svg.bld-canvas rect.bld-fig')
    return { x: Number(r.getAttribute('x')), y: Number(r.getAttribute('y')), w: Number(r.getAttribute('width')), h: Number(r.getAttribute('height')) }
  })
  const rw0 = bb.w, rh0 = bb.h
  await drag(bb.x + bb.w, bb.y + bb.h, bb.x + bb.w + 40, bb.y + bb.h + 30)
  await page.waitForTimeout(120)
  const bb2 = await page.evaluate(() => {
    const r = document.querySelector('svg.bld-canvas rect.bld-fig')
    return { w: Number(r.getAttribute('width')), h: Number(r.getAttribute('height')) }
  })
  ok('rect resized larger', bb2.w > rw0 && bb2.h > rh0)

  // 6. Properties panel on selection (click rect center)
  await drag(135, 205, 135, 205)
  await page.waitForTimeout(60)
  const nameInput = page.locator('.bld-props .pd-input').first()
  const hasProps = await nameInput.count() === 1
  ok('property panel shown on selection', hasProps)
  if (hasProps) {
    await nameInput.fill('Экран')
    await page.locator('.bld-props .pd-input').nth(1).fill('display')
  }

  // 7. Save to backend
  const inputs = page.locator('.bld-save-form .pd-input')
  await inputs.nth(0).fill('BLD1Verif')
  await inputs.nth(1).fill('EditorPro')
  await page.locator('.bld-save-form button[type=submit]').click()
  await page.waitForSelector('.bld-msg.ok', { timeout: 8000 })
  const msg = await page.locator('.bld-msg.ok').textContent()
  ok('save succeeded (ok msg)', /Схема сохранена/.test(msg))
  const savedId = msg.match(/id: ([0-9a-f-]+)/)?.[1]
  ok('save returned schema id', !!savedId)

  ok('at least 2 fixed figures drawn', await page.locator('svg.bld-canvas .bld-fig:not(.bld-draft)').count() >= 2)

  await browser.close()

  const allOk = results.every(([, c]) => c)
  console.log('ALL_RESULT=' + (allOk ? 'PASS' : 'FAIL'))
  console.log('SAVED_ID=' + (savedId || ''))
  process.exit(allOk ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
