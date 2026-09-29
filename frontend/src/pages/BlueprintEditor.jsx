import React, { useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { authFetch } from '../auth.jsx'
import { PRESETS, PRESET_CATEGORIES, polygonPointsToFigures } from '../presets.js'

// =============================================================================
// BLD-1: 'Конструктор схемы' — SVG blueprint scheme drawing editor.
// -----------------------------------------------------------------------------
// • Canvas driven by viewBox="0 0 340 640" (portrait phone outline as backdrop).
// • Tools: rect / circle / ellipse / polygon / select(двигать+ресайз).
// • Драг (mousedown => preview => mouseup) создаёт фигуру.
// • В режиме select фигуру можно выделить, перетащить и изменить размер
//   (унифицированный ресайз через bounding box для всех типов).
// • У каждой фигуры есть свойства name / key (редактируются в панели).
// • Палитра цветов задаёт fill (включая статус наличия: зелёный/красный).
// • 'Сохранить схему' POST'ит на /api/device-schemas: создаёт DeviceSchema,
//   где exploded_view_url = полный SVG (внутри — сериализуемый список фигур),
//   hotspots = карта {figId -> {x,y}} (нормализованный центр) — валиден для бэка.
// =============================================================================

const VB_W = 340
const VB_H = 640

// Палитра (blueprint-цвета + статусы наличия).
const PALETTE = ['#4fa3ff', '#7cf7d0', '#60a5fa', '#a78bfa', '#fbbf24', '#22c55e', '#ef4444', '#f0f3f8']

const TOOLS = [
  { id: 'select', label: 'Выбор', icon: '🖱️' },
  { id: 'rect', label: 'Прямоугольник', icon: '▭' },
  { id: 'circle', label: 'Круг', icon: '●' },
  { id: 'ellipse', label: 'Эллипс', icon: '⬭' },
  { id: 'polygon', label: 'Произвольная', icon: '✒️' },
]

const uid = () => Math.random().toString(36).slice(2, 10)

// ---------------------------------------------------------------- geometry ----
function bbox(fig) {
  switch (fig.type) {
    case 'rect':
      return { x: fig.x, y: fig.y, w: fig.w, h: fig.h }
    case 'circle':
      return { x: fig.cx - fig.r, y: fig.cy - fig.r, w: fig.r * 2, h: fig.r * 2 }
    case 'ellipse':
      return { x: fig.cx - fig.rx, y: fig.cy - fig.ry, w: fig.rx * 2, h: fig.ry * 2 }
    case 'polygon': {
      let x = Infinity, y = Infinity, X = -Infinity, Y = -Infinity
      fig.points.forEach((p) => {
        x = Math.min(x, p.x); y = Math.min(y, p.y); X = Math.max(X, p.x); Y = Math.max(Y, p.y)
      })
      return { x, y, w: X - x, h: Y - y }
    }
    default:
      return { x: 0, y: 0, w: 0, h: 0 }
  }
}

function translateFigure(fig, dx, dy) {
  switch (fig.type) {
    case 'rect':
      return { ...fig, x: fig.x + dx, y: fig.y + dy }
    case 'circle':
      return { ...fig, cx: fig.cx + dx, cy: fig.cy + dy }
    case 'ellipse':
      return { ...fig, cx: fig.cx + dx, cy: fig.cy + dy }
    case 'polygon':
      return { ...fig, points: fig.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
    default:
      return fig
  }
}

// Унифицированный ресайз: пересчёт геометрии относительно фиксированного
// верхнего левого угла bounding box (newLeft/newTop) к новым размерам.
function rescaleFigure(fig, oldL, oldT, oldW, oldH, nL, nT, nW, nH) {
  if (nW <= 0) nW = 1
  if (nH <= 0) nH = 1
  const sx = nW / oldW
  const sy = nH / oldH
  switch (fig.type) {
    case 'rect':
      return { ...fig, x: nL, y: nT, w: nW, h: nH }
    case 'circle': {
      const r = Math.max(nW, nH) / 2
      return { ...fig, cx: nL + nW / 2, cy: nT + nH / 2, r }
    }
    case 'ellipse':
      return { ...fig, cx: nL + nW / 2, cy: nT + nH / 2, rx: nW / 2, ry: nH / 2 }
    case 'polygon':
      return {
        ...fig,
        points: fig.points.map((p) => ({ x: nL + (p.x - oldL) * sx, y: nT + (p.y - oldT) * sy })),
      }
    default:
      return fig
  }
}

function pointInPoly(pt, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j]
    const hit = a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x
    if (hit) inside = !inside
  }
  return inside
}

// Возвращает самую верхнюю фигуру под точкой или null.
function hitTest(p, figs) {
  for (let i = figs.length - 1; i >= 0; i--) {
    const f = figs[i]
    if (f.type === 'rect' && p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) return f
    if (f.type === 'circle' && Math.hypot(p.x - f.cx, p.y - f.cy) <= f.r) return f
    if (f.type === 'ellipse' && ((p.x - f.cx) ** 2) / f.rx ** 2 + ((p.y - f.cy) ** 2) / f.ry ** 2 <= 1) return f
    if (f.type === 'polygon' && pointInPoly(p, f.points)) return f
  }
  return null
}

// --------------------------------------------------------------- rendering ----
function shapeEl(fig, live) {
  const fill = fig.fill || '#4fa3ff'
  const common = { fill, fillOpacity: live ? 0.22 : 0.18, stroke: fill, strokeWidth: live ? 1.6 : 1.2 }
  const n = fig.name || fig.key || ''
  switch (fig.type) {
    case 'rect':
      return <rect key={fig.id} {...common} x={fig.x} y={fig.y} width={fig.w} height={fig.h}>
        {n ? <title>{n}</title> : null}
      </rect>
    case 'circle':
      return <circle key={fig.id} {...common} cx={fig.cx} cy={fig.cy} r={fig.r}>
        {n ? <title>{n}</title> : null}
      </circle>
    case 'ellipse':
      return <ellipse key={fig.id} {...common} cx={fig.cx} cy={fig.cy} rx={fig.rx} ry={fig.ry}>
        {n ? <title>{n}</title> : null}
      </ellipse>
    case 'polygon': {
      const pts = fig.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      return <polygon key={fig.id} {...common} points={pts}>
        {n ? <title>{n}</title> : null}
      </polygon>
    }
    default:
      return null
  }
}

// Полный SVG-маркер для сохранения. Внутри data-figures — сериализуемый список
// фигур (id/type/geometry/name/key/fill), чтобы можно было перезагрузить.
function buildSvg(figures) {
  const fdata = JSON.stringify(figures)
  const safe = fdata.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const shapes = figures.map((f) => {
    let el
    if (f.type === 'rect') el = `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="${f.fill}" fill-opacity="0.18" stroke="${f.fill}" stroke-width="1.2"/>`
    else if (f.type === 'circle') el = `<circle cx="${f.cx}" cy="${f.cy}" r="${f.r}" fill="${f.fill}" fill-opacity="0.18" stroke="${f.fill}" stroke-width="1.2"/>`
    else if (f.type === 'ellipse') el = `<ellipse cx="${f.cx}" cy="${f.cy}" rx="${f.rx}" ry="${f.ry}" fill="${f.fill}" fill-opacity="0.18" stroke="${f.fill}" stroke-width="1.2"/>`
    else if (f.type === 'polygon') {
      const pts = f.points.map((p) => `${p.x},${p.y}`).join(' ')
      el = `<polygon points="${pts}" fill="${f.fill}" fill-opacity="0.18" stroke="${f.fill}" stroke-width="1.2"/>`
    }
    return el
  }).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" data-figures="${safe}">` +
    `<rect x="16" y="18" width="308" height="604" rx="26" fill="none" stroke="#2a3348" stroke-width="2"/>` +
    `<circle cx="170" cy="40" r="7" fill="none" stroke="#2a3348" stroke-width="2"/>` +
    shapes +
    `</svg>`
  )
}

function buildHotspots(figures) {
  const hs = {}
  figures.forEach((f) => {
    const b = bbox(f)
    hs[f.key || f.id] = {
      x: Math.max(0, Math.min(1, (b.x + b.w / 2) / VB_W)),
      y: Math.max(0, Math.min(1, (b.y + b.h / 2) / VB_H)),
    }
  })
  return hs
}

// =============================================================================
// BLD-4: панель «Пресеты» — миниатюра-иконка готовой запчасти для вставки.
// Рисует мини-<svg viewBox="0 0 340 640"> с формой пресета (огрызок геометрии
// показывается поверх всей карточки, масштаб 1/4).
// =============================================================================
function PresetIcon({ preset }) {
  const p = preset
  const s = 1 / 4
  let use = null
  if (Array.isArray(p.shapes) && p.shapes.length > 0) {
    use = p.shapes.map((sh, i) => {
      const f = sh.fill || p.fill
      const common = { key: i, fill: f, fillOpacity: 0.6, stroke: f, strokeWidth: 1 }
      const g = sh.g
      if (sh.shape === 'rect') {
        return <rect {...common} x={g.x * s} y={g.y * s} width={Math.max(1, g.w * s)} height={Math.max(1, g.h * s)} rx={(g.rx || 0) * s} />
      } else if (sh.shape === 'circle') {
        return <circle {...common} cx={g.cx * s} cy={g.cy * s} r={Math.max(1, g.r * s)} />
      } else if (sh.shape === 'ellipse') {
        return <ellipse {...common} cx={g.cx * s} cy={g.cy * s} rx={Math.max(1, g.rx * s)} ry={Math.max(1, g.ry * s)} />
      } else if (sh.shape === 'polygon') {
        const pts = g.points.map(([x, y]) => `${(x * s).toFixed(1)},${(y * s).toFixed(1)}`).join(' ')
        return <polygon {...common} points={pts} />
      }
      return null
    })
  } else if (p.shape === 'rect') {
    use = <rect x={p.g.x * s} y={p.g.y * s} width={Math.max(1, p.g.w * s)} height={Math.max(1, p.g.h * s)} rx={(p.g.rx || 0) * s} fill={p.fill} fillOpacity="0.6" stroke={p.fill} strokeWidth="1" />
  } else if (p.shape === 'circle') {
    use = <circle cx={p.g.cx * s} cy={p.g.cy * s} r={Math.max(1, p.g.r * s)} fill={p.fill} fillOpacity="0.6" stroke={p.fill} strokeWidth="1" />
  } else if (p.shape === 'polygon') {
    const pts = p.g.points.map(([x, y]) => `${(x * s).toFixed(1)},${(y * s).toFixed(1)}`).join(' ')
    use = <polygon points={pts} fill={p.fill} fillOpacity="0.6" stroke={p.fill} strokeWidth="1" />
  }
  return <svg className="bld-preset-shape" viewBox="0 0 340 640" preserveAspectRatio="xMidYMid meet" role="img" aria-label={p.name}>{use}</svg>
}


// =============================================================================
// BLD-3: связка схемы с моделью (brand+model) + редактирование существующих.
//  • BRAND/MODEL dropdown'ы из каталога моделей доноров (/api/donor-lots) с
//    фолбэком на ручной ввод, если каталог пуст/недоступен.
//  • Роут /editor/:brand/:model — предзаполняет brand/model и загружает
//    существующий blueprint через GET /api/blueprints/{brand}/{model}.
//  • Сохранение: PUT /api/blueprints/{id} если схема уже существует, иначе
//    POST /api/blueprints. Тело: { brand, model, svg, parts }.
// =============================================================================
export default function BlueprintEditor() {
  const params = useParams()
  const [tool, setTool] = useState('rect')
  const [figures, setFigures] = useState([])
  const [draft, setDraft] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [activeColor, setActiveColor] = useState('#4fa3ff')

  // BLD-3: dropdown-каталог brand/model + текущий (существующий) blueprint id.
  const [modelCatalog, setModelCatalog] = useState([]) // [{brand, model}, ...]
  const [selBrand, setSelBrand] = useState('')
  const [editingId, setEditingId] = useState(null) // id существующего blueprint для PUT

  // BLD-2: режим просмотра (view) — кликабельные фигуры с авто-наличием из каталога.
  const [mode, setMode] = useState('edit') // 'edit' | 'view'
  const [viewSelectedId, setViewSelectedId] = useState(null)
  const [catalogMap, setCatalogMap] = useState({}) // key -> { available, price }

  // BLD-4: панель пресетов — активная категория фильтра.
  const [presetCat, setPresetCat] = useState('') // '' = все категории

  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)

  const [savedSchemas, setSavedSchemas] = useState([])
  const [loadId, setLoadId] = useState('')

  const svgRef = useRef(null)
  const interactionRef = useRef(null)

  // ---- BLD-2: авто-наличие из /api/catalog (ключ фигуры -> каталог) ----
  const keyList = useMemo(() => {
    const s = new Set()
    figures.forEach((f) => { if (f.key && String(f.key).trim()) s.add(String(f.key).trim()) })
    return [...s]
  }, [figures])

  React.useEffect(() => {
    let cancelled = false
    const out = {}
    Promise.all(
      keyList.map(async (k) => {
        try {
          const r = await authFetch('/api/catalog?q=' + encodeURIComponent(k))
          if (!r.ok) { out[k] = { available: false, price: null }; return }
          const list = (await r.json()) || []
          const stock = list.filter((it) => it && it.in_stock === true)
          out[k] = {
            available: stock.length > 0,
            price: stock.length ? stock[0].listing_price : null,
          }
        } catch {
          out[k] = { available: false, price: null }
        }
      }),
    ).then(() => { if (!cancelled) setCatalogMap(out) })
    return () => { cancelled = true }
  }, [keyList])

  // Состояние наличия фигуры (авто из каталога; без key — нет данных => нет в наличии).
  const viewStateOf = (f) => {
    const k = f && f.key ? String(f.key).trim() : ''
    if (!k || !catalogMap[k]) return { available: false, price: null }
    return catalogMap[k]
  }

  const fmtPrice = (p) => {
    if (p === null || p === undefined) return '—'
    try {
      return new Intl.NumberFormat('ru-RU').format(p) + ' ₽'
    } catch {
      return String(p) + ' ₽'
    }
  }

  const selected = useMemo(
    () => figures.find((f) => f.id === selectedId) || null,
    [figures, selectedId],
  )

  const svgPoint = (e) => {
    const svg = svgRef.current
    const ctm = svg.getScreenCTM().inverse()
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm)
    return { x: p.x, y: p.y }
  }

  const draftFrom = (ia, p) => {
    const color = ia.color
    switch (ia.tool) {
      case 'rect': {
        const x = Math.min(ia.start.x, p.x), y = Math.min(ia.start.y, p.y)
        return { id: 'draft', type: 'rect', x, y, w: Math.abs(p.x - ia.start.x), h: Math.abs(p.y - ia.start.y), name: '', key: '', fill: color }
      }
      case 'circle': {
        const r = Math.hypot(p.x - ia.start.x, p.y - ia.start.y)
        return { id: 'draft', type: 'circle', cx: ia.start.x, cy: ia.start.y, r, name: '', key: '', fill: color }
      }
      case 'ellipse': {
        const rx = Math.abs(p.x - ia.start.x) / 2, ry = Math.abs(p.y - ia.start.y) / 2
        return { id: 'draft', type: 'ellipse', cx: (ia.start.x + p.x) / 2, cy: (ia.start.y + p.y) / 2, rx, ry, name: '', key: '', fill: color }
      }
      case 'polygon': {
        const pts = [ia.start, ...ia.points]
        return { id: 'draft', type: 'polygon', points: pts, name: '', key: '', fill: color }
      }
      default:
        return null
    }
  }

  const figValid = (f) => {
    if (!f) return false
    if (f.type === 'rect') return f.w > 2 && f.h > 2
    if (f.type === 'circle') return f.r > 2
    if (f.type === 'ellipse') return f.rx > 1 && f.ry > 1
    if (f.type === 'polygon') return f.points.length >= 3
    return false
  }

  // ---- pointer handlers ----
  const onPointerDown = (e) => {
    if (e.button !== 0 || mode === 'view') return
    const p = svgPoint(e)
    e.currentTarget.setPointerCapture(e.pointerId)

    if (tool === 'select') {
      // Сначала проверяем resize-маркер выбранной фигуры.
      if (selectedId) {
        const sel = figures.find((f) => f.id === selectedId)
        if (sel) {
          const b = bbox(sel)
          const hx = b.x + b.w, hy = b.y + b.h
          if (Math.abs(p.x - hx) <= 8 && Math.abs(p.y - hy) <= 8) {
            interactionRef.current = {
              kind: 'resize', figId: sel.id,
              left: b.x, top: b.y, w: b.w, h: b.h,
            }
            return
          }
        }
      }
      const hit = hitTest(p, figures)
      if (hit) {
        setSelectedId(hit.id)
        const b = bbox(hit)
        interactionRef.current = { kind: 'move', figId: hit.id, px: p.x, py: p.y }
      } else {
        setSelectedId(null)
      }
      return
    }

    // Рисование
    interactionRef.current = {
      kind: 'draw', tool, start: p, color: activeColor, points: tool === 'polygon' ? [] : null,
    }
    setDraft(draftFrom(interactionRef.current, p))
  }

  const onPointerMove = (e) => {
    if (mode === 'view') return
    const ia = interactionRef.current
    if (!ia) return
    const p = svgPoint(e)
    if (ia.kind === 'draw') {
      if (ia.tool === 'polygon') {
        const last = ia.points[ia.points.length - 1]
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 2) ia.points.push(p)
      }
      setDraft(draftFrom(ia, p))
    } else if (ia.kind === 'move') {
      const dx = p.x - ia.px, dy = p.y - ia.py
      ia.px = p.x; ia.py = p.y
      setFigures((prev) => prev.map((f) => (f.id === ia.figId ? translateFigure(f, dx, dy) : f)))
    } else if (ia.kind === 'resize') {
      const nL = ia.left, nT = ia.top, nW = p.x - ia.left, nH = p.y - ia.top
      setFigures((prev) =>
        prev.map((f) => (f.id === ia.figId ? rescaleFigure(f, ia.left, ia.top, ia.w, ia.h, nL, nT, nW, nH) : f)),
      )
    }
  }

  const onPointerUp = (e) => {
    if (mode === 'view') return
    const ia = interactionRef.current
    if (!ia) return
    if (ia.kind === 'draw') {
      const p = svgPoint(e)
      const fig = draftFrom(ia, p)
      if (figValid(fig)) setFigures((prev) => [...prev, { ...fig, id: uid() }])
      setDraft(null)
    }
    interactionRef.current = null
  }

  // ---- property editing ----
  const patchSelected = (patch) => {
    if (!selectedId) return
    setFigures((prev) => prev.map((f) => (f.id === selectedId ? { ...f, ...patch } : f)))
  }

  const deleteSelected = () => {
    if (!selectedId) return
    setFigures((prev) => prev.filter((f) => f.id !== selectedId))
    setSelectedId(null)
  }

  const pickColor = (c) => {
    setActiveColor(c)
    if (selectedId) patchSelected({ fill: c })
  }

  // ---- BLD-3: каталог моделей для dropdown (brand+model из /api/donor-lots) ----
  React.useEffect(() => {
    let cancelled = false
    authFetch('/api/donor-lots')
      .then((r) => (r.ok ? r.json() : []))
      .then((lots) => {
        if (cancelled) return
        const arr = Array.isArray(lots) ? lots : []
        const seen = new Set()
        const pairs = []
        arr.forEach((l) => {
          const b = String(l.brand || '').trim()
          const m = String(l.model || '').trim()
          if (!b || !m) return
          const key = b.toLowerCase() + '\u0001' + m.toLowerCase()
          if (seen.has(key)) return
          seen.add(key)
          pairs.push({ brand: b, model: m })
        })
        setModelCatalog(pairs)
      })
      .catch(() => { /* фолбэк: остаёмся на ручном вводе */ })
    return () => { cancelled = true }
  }, [])

  // ---- BLD-3: если URL нёс brand+model — предзаполнить и попытаться загрузить ----
  const routeBrand = (params.brand || '').trim()
  const routeModel = (params.model || '').trim()
  React.useEffect(() => {
    if (!routeBrand || !routeModel) return
    const b = routeBrand.replace(/-/g, ' ')
    const m = routeModel.replace(/-/g, ' ')
    setBrand(b)
    setSelBrand(b)
    setModel(m)
    authFetch(`/api/blueprints/${encodeURIComponent(routeBrand)}/${encodeURIComponent(routeModel)}`)
      .then((r) => (r.ok ? r.json() : null)) // 404 -> пустой холст с предзаполненными brand/model
      .then((bp) => {
        if (!bp) { setSaveMsg({ type: 'ok', text: 'Создаётся новая схема для этой модели' }); return }
        setBrand(bp.brand)
        setModel(bp.model)
        if (Array.isArray(bp.parts)) {
          setFigures(bp.parts)
          setEditingId(bp.id)
          setSelectedId(null)
          setSaveMsg({ type: 'ok', text: `Схема загружена (${bp.brand} ${bp.model}) — можно отредактировать и сохранить` })
        }
      })
      .catch(() => { /* ignore */ })
  }, [routeBrand, routeModel])

  // производные списки для dropdown
  const brands = useMemo(() => {
    const s = new Set()
    modelCatalog.forEach((p) => s.add(p.brand))
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [modelCatalog])

  const modelsForBrand = useMemo(() => {
    if (!selBrand) return [...new Set(modelCatalog.map((p) => p.model))]
    return modelCatalog.filter((p) => p.brand === selBrand).map((p) => p.model)
  }, [modelCatalog, selBrand])

  // ---- persistence ----
  const loadSchemas = () => {
    authFetch('/api/blueprints')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => { setSavedSchemas(list || []) })
      .catch(() => setSavedSchemas([]))
  }

  React.useEffect(() => { loadSchemas() }, [])

  const save = async (e) => {
    e.preventDefault()
    setSaveMsg(null)
    if (!brand.trim() || !model.trim()) {
      setSaveMsg({ type: 'err', text: 'Укажите бренд и модель устройства' })
      return
    }
    if (figures.length === 0) {
      setSaveMsg({ type: 'err', text: 'Холст пуст — сначала нарисуйте фигуры' })
      return
    }
    setSaving(true)
    const isUpdate = !!editingId
    const body = {
      brand: brand.trim(),
      model: model.trim(),
      svg: buildSvg(figures),
      parts: figures,
    }
    try {
      const url = isUpdate ? `/api/blueprints/${editingId}` : '/api/blueprints'
      const r = await authFetch(url, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) {
        setSaveMsg({ type: 'err', text: data?.detail || (isUpdate ? 'Не удалось обновить схему' : 'Не удалось сохранить схему') })
      } else {
        setEditingId(data.id)
        setSaveMsg({ type: 'ok', text: isUpdate ? `Схема обновлена (${data.brand} ${data.model})` : `Схема сохранена (id: ${data.id})` })
        loadSchemas()
      }
    } catch (err) {
      setSaveMsg({ type: 'err', text: 'Ошибка соединения с сервером' })
    } finally {
      setSaving(false)
    }
  }

  const loadSaved = async () => {
    const s = savedSchemas.find((x) => x.id === loadId)
    if (!s) return
    setBrand(s.brand || '')
    setSelBrand(s.brand || '')
    setModel(s.model || '')
    setEditingId(s.id || null)
    if (Array.isArray(s.parts)) {
      setFigures(s.parts)
      setSelectedId(null)
      setSaveMsg({ type: 'ok', text: 'Схема загружена' })
      return
    }
    // фолбэк: парсим data-figures из svg
    const svgStr = s.svg || ''
    const m = svgStr.match(/data-figures="([^"]*)"/)
    if (m) {
      try {
        const list = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
        if (Array.isArray(list)) {
          setFigures(list)
          setSelectedId(null)
          setSaveMsg({ type: 'ok', text: 'Схема загружена' })
          return
        }
      } catch {
        /* ignore */
      }
    }
    setSaveMsg({ type: 'err', text: 'В схеме нет данных фигур' })
  }

  const clearCanvas = () => {
    setFigures([])
    setDraft(null)
    setSelectedId(null)
  }

  // ---- BLD-4: добавление готовой фигуры по пресету ----
  // Разбор одной примитивной фигуры (shape-объект) в фигуру холста.
  const shapeToFig = (sh, name, key, groupId) => {
    const fig = { id: uid(), name, key, fill: sh.fill, z: sh.z, group: groupId }
    const g = sh.g
    if (sh.shape === 'rect') {
      fig.type = 'rect'
      fig.x = g.x; fig.y = g.y; fig.w = g.w; fig.h = g.h
      if (g.rx) fig.rx = g.rx
    } else if (sh.shape === 'circle') {
      fig.type = 'circle'
      fig.cx = g.cx; fig.cy = g.cy; fig.r = g.r
    } else if (sh.shape === 'ellipse') {
      fig.type = 'ellipse'
      fig.cx = g.cx; fig.cy = g.cy; fig.rx = g.rx; fig.ry = g.ry
    } else if (sh.shape === 'polygon') {
      fig.type = 'polygon'
      fig.points = polygonPointsToFigures(g.points)
    }
    return fig
  }

  const addPreset = (preset) => {
    // Композитный пресет: все примитивы одной группы добавляются вместе.
    if (Array.isArray(preset.shapes) && preset.shapes.length > 0) {
      const gid = 'g-' + uid()
      const newFigs = preset.shapes.map((sh) => shapeToFig(sh, preset.name, preset.key, gid))
      setFigures((prev) => [...prev, ...newFigs])
      setSelectedId(newFigs[newFigs.length - 1].id)
      setTool('select')
      setSaveMsg({ type: 'ok', text: `Добавлено: ${preset.name}` })
      return
    }
    const fig = { id: uid(), name: preset.name, key: preset.key, fill: preset.fill, z: preset.z }
    if (preset.shape === 'rect') {
      fig.type = 'rect'
      fig.x = preset.g.x; fig.y = preset.g.y; fig.w = preset.g.w; fig.h = preset.g.h
      if (preset.g.rx) fig.rx = preset.g.rx
    } else if (preset.shape === 'circle') {
      fig.type = 'circle'
      fig.cx = preset.g.cx; fig.cy = preset.g.cy; fig.r = preset.g.r
    } else if (preset.shape === 'polygon') {
      fig.type = 'polygon'
      fig.points = polygonPointsToFigures(preset.g.points)
    }
    setFigures((prev) => [...prev, fig])
    setSelectedId(fig.id)
    setTool('select')
    setSaveMsg({ type: 'ok', text: `Добавлено: ${preset.name}` })
  }

  // Стабильная сортировка для отрисовки по z-index (пресеты из справочника имеют
  // z 1..9; рисованные вручную фигуры — по умолчанию 5). Stable: равный z
  // сохраняет порядок вставки (Array.prototype.sort стабилен в современных V8).
  const renderFigs = useMemo(
    () => figures.map((f, i) => ({ f, i })).sort((a, b) => ((a.f.z ?? 5) - (b.f.z ?? 5)) || (a.i - b.i)).map((x) => x.f),
    [figures],
  )

  const filteredPresets = presetCat ? PRESETS.filter((p) => p.cat === presetCat) : PRESETS

  const selBox = selected ? bbox(selected) : null
  const viewSelected = mode === 'view' ? figures.find((f) => f.id === viewSelectedId) || null : null
  const viewSelState = viewSelected ? viewStateOf(viewSelected) : null

  return (
    <div className="bld-editor">
      <div className="bld-head">
        <div>
          <h1 className="bld-title">Конструктор схемы</h1>
          <p className="bld-sub">Нарисуйте схему устройства, задайте частям названия и ключи, сохраните.</p>
        </div>
        <div className="bld-mode-toggle" role="group" aria-label="Режим">
          <button type="button" className={`bld-mode-btn${mode === 'edit' ? ' is-active' : ''}`} onClick={() => setMode('edit')}>✏️ Редактирование</button>
          <button type="button" className={`bld-mode-btn${mode === 'view' ? ' is-active' : ''}`} onClick={() => setMode('view')}>👁 Просмотр</button>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clearCanvas}>Очистить холст</button>
      </div>

      <div className="bld-layout">
        {/* ------- Toolbar ------- */}
        <aside className="bld-toolbar" aria-label="Инструменты">
          {mode === 'edit' ? (
            <>
              <span className="bld-toolbar-label">Инструменты</span>
              <div className="bld-tools">
                {TOOLS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`bld-tool${tool === t.id ? ' is-active' : ''}`}
                    title={t.label}
                    onClick={() => setTool(t.id)}
                  >
                    <span className="bld-tool-icon">{t.icon}</span>
                    <span className="bld-tool-name">{t.label}</span>
                  </button>
                ))}
              </div>

              <span className="bld-toolbar-label">Цвет / наличие</span>
              <div className="bld-palette">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`bld-swatch${activeColor === c ? ' is-active' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => pickColor(c)}
                    aria-label={`Цвет ${c}`}
                  />
                ))}
              </div>
              <p className="bld-palette-hint">
                <span className="dot" style={{ background: '#22c55e' }} /> в наличии
                <span className="dot" style={{ background: '#ef4444' }} /> нет в наличии
              </p>
            </>
          ) : (
            <div className="bld-view-note">
              <span className="bld-toolbar-label">Режим просмотра</span>
              <p className="bld-muted">Нажмите на деталь, чтобы увидеть карточку. Наличие и цена определяются автоматически по каталогу.</p>
              <p className="bld-view-legend">
                <span className="bld-view-dot is-green" /> в наличии
                <span className="bld-view-dot is-red" /> нет в наличии
              </p>
            </div>
          )}
        </aside>

        {/* ------- BLD-4: Панель «Пресеты» (готовые части) ------- */}
        <aside className="bld-presets" aria-label="Пресеты запчастей">
          <div className="bld-presets-head">
            <span className="bld-toolbar-label">Пресеты</span>
            <span className="bld-presets-count">{filteredPresets.length}</span>
          </div>
          <div className="bld-presets-cats" role="tablist" aria-label="Категории">
            <button
              type="button"
              role="tab"
              aria-selected={presetCat === ''}
              className={`bld-preset-cat${presetCat === '' ? ' is-active' : ''}`}
              onClick={() => setPresetCat('')}
            >
              Все
            </button>
            {PRESET_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={presetCat === c.id}
                className={`bld-preset-cat${presetCat === c.id ? ' is-active' : ''}`}
                onClick={() => setPresetCat(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="bld-presets-grid">
            {filteredPresets.map((p) => (
              <button
                key={p.key}
                type="button"
                className="bld-preset-card"
                title={`${p.name} — клик, чтобы добавить`}
                onClick={() => addPreset(p)}
              >
                <span className="bld-preset-thumb"><PresetIcon preset={p} /></span>
                <span className="bld-preset-name">{p.name}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* ------- Canvas ------- */}
        <div className="bld-canvas-wrap">
          <svg
            ref={svgRef}
            className={`bld-canvas${mode === 'view' ? ' is-view' : ''} tool-${tool}`}
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            role="img"
            aria-label="Холст схемы"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* фон-сетка (blueprint) */}
            <defs>
              <pattern id="bld-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0H0V20" fill="none" stroke="rgba(79,163,255,.06)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#bld-grid)" />
            {/* телефонная рамка-подложка */}
            <rect x="16" y="18" width="308" height="604" rx="26" fill="rgba(255,255,255,.015)" stroke="#2a3348" strokeWidth="2" />
            <rect x="24" y="58" width="292" height="548" rx="8" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="1" />
            <circle cx="170" cy="40" r="7" fill="none" stroke="#2a3348" strokeWidth="2" />

            {mode === 'view'
              ? renderFigs.map((f) => {
                  const b = bbox(f)
                  const st = viewStateOf(f)
                  const avail = st.available
                  const col = avail ? '#22c55e' : '#ef4444'
                  const el = shapeEl(f, true)
                  const name = f.name || f.key || 'Деталь'
                  return (
                    <g
                      key={f.id}
                      className={`bld-view-fig${avail ? '' : ' unavailable'}${viewSelectedId === f.id ? ' is-selected' : ''}`}
                      data-fig={f.id}
                      onClick={() => setViewSelectedId(f.id)}
                    >
                      {React.cloneElement(el, { fill: 'transparent', stroke: col })}
                      {/* постоянное гало-подсветка всего bbox по цвету наличия */}
                      <rect className="bld-view-halo" x={b.x} y={b.y} width={b.w} height={b.h} />
                      {/* прозрачная hit-зона на весь bbox (клик/ховер всей области) */}
                      <rect className="bld-view-hitarea" x={b.x} y={b.y} width={b.w} height={b.h} data-name={name} />
                    </g>
                  )
                })
              : (
                <>
                  {renderFigs.map((f) => {
                    const el = shapeEl(f, false)
                    return React.cloneElement(el, { className: f.id === selectedId ? 'bld-fig is-selected' : 'bld-fig' })
                  })}
                  {draft && <g className="bld-fig bld-draft" pointerEvents="none">{shapeEl(draft, true)}</g>}
                </>
              )}

            {/* выделение + resize-маркер (только в режиме редактирования) */}
            {mode === 'edit' && selBox && (
              <g className="bld-sel" pointerEvents="none">
                <rect
                  x={selBox.x - 3} y={selBox.y - 3}
                  width={selBox.w + 6} height={selBox.h + 6}
                  fill="none" stroke="#4fa3ff" strokeDasharray="4 3" strokeWidth="1.2"
                />
                <rect
                  className="bld-resize-handle"
                  x={selBox.x + selBox.w - 4} y={selBox.y + selBox.h - 4}
                  width="8" height="8"
                  fill="#050608" stroke="#4fa3ff" strokeWidth="2"
                />
              </g>
            )}
          </svg>
        </div>

        {/* ------- Properties + Save ------- */}
        <aside className="bld-panel" aria-label="Свойства и сохранение">
          {mode === 'edit' ? (
            <>
              <span className="bld-toolbar-label">Свойства фигуры</span>
              {selected ? (
                <div className="bld-props">
                  <label className="pd-field">
                    <span className="pd-label">Название</span>
                    <input className="pd-input" value={selected.name || ''} placeholder="напр. Экран"
                      onChange={(e) => patchSelected({ name: e.target.value })} />
                  </label>
                  <label className="pd-field">
                    <span className="pd-label">Key-идентификатор</span>
                    <input className="pd-input" value={selected.key || ''} placeholder="напр. display"
                      onChange={(e) => patchSelected({ key: e.target.value })} />
                  </label>
                  <div className="bld-props-row">
                    <span className="pd-label">Цвет</span>
                    <span className="bld-swatch-mini" style={{ background: selected.fill || '#4fa3ff' }} />
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm bld-del" onClick={deleteSelected}>Удалить фигуру</button>
                </div>
              ) : (
                <p className="bld-muted">Выберите фигуру инструментом «Выбор».</p>
              )}

              <hr className="bld-hr" />

              <span className="bld-toolbar-label">Сохранение схемы</span>
              <form className="bld-save-form" onSubmit={save}>
                <div className="bld-save-grid">
                  <label className="pd-field">
                    <span className="pd-label">Бренд</span>
                    {brands.length ? (
                      <select className="pd-select bld-bm-select" value={brand} onChange={(e) => { setSelBrand(e.target.value); setBrand(e.target.value) }}>
                        <option value="">— выберите бренд —</option>
                        {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    ) : (
                      <input className="pd-input" value={brand} onChange={(e) => { setBrand(e.target.value); setSelBrand(e.target.value) }} placeholder="Apple (ручной ввод)" />
                    )}
                  </label>
                  <label className="pd-field">
                    <span className="pd-label">Модель</span>
                    {modelsForBrand.length ? (
                      <select className="pd-select bld-bm-select" value={model} onChange={(e) => setModel(e.target.value)}>
                        <option value="">— выберите модель —</option>
                        {modelsForBrand.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : (
                      <input className="pd-input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="iPhone X (ручной ввод)" />
                    )}
                  </label>
                </div>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Сохранение…' : '💾 Сохранить схему'}
                </button>
              </form>
              {saveMsg && (
                <p className={saveMsg.type === 'ok' ? 'bld-msg ok' : 'bld-msg err'} role="status">{saveMsg.text}</p>
              )}

              <hr className="bld-hr" />
            </>
          ) : (
            <>
              <span className="bld-toolbar-label">Карточка детали</span>
              {viewSelected ? (
                <div className="bld-detail-card">
                  <div className="bld-detail-head">
                    <div className="bld-detail-title">{viewSelected.name || viewSelected.key || 'Деталь'}</div>
                    <button type="button" className="bld-detail-close" aria-label="Закрыть" onClick={() => setViewSelectedId(null)}>✕</button>
                  </div>
                  <div className={`bld-avail-row${viewSelState?.available ? ' is-on' : ' is-off'}`}>
                    <span className="bld-avail-dot" />
                    <span className="bld-avail-text">{viewSelState?.available ? 'В наличии' : 'Нет в наличии'}</span>
                  </div>
                  <div className="bld-detail-price">
                    <span className="pd-label">Цена</span>
                    <span className="bld-detail-price-val">{fmtPrice(viewSelState?.price ?? null)}</span>
                  </div>
                  <p className="bld-muted bld-detail-key">Key: {viewSelected.key || '—'}</p>
                </div>
              ) : (
                <p className="bld-muted">Нажмите на деталь на схеме, чтобы открыть карточку.</p>
              )}

              <hr className="bld-hr" />
            </>
          )}

          <span className="bld-toolbar-label">Загрузить</span>
          <div className="bld-load-row">
            <select className="pd-select bld-select" value={loadId} onChange={(e) => setLoadId(e.target.value)}>
              <option value="">— выбрать схему —</option>
              {savedSchemas.map((s) => (
                <option key={s.id} value={s.id}>{s.brand} {s.model}</option>
              ))}
            </select>
            <button type="button" className="btn btn-sm" onClick={loadSaved} disabled={!loadId}>Загрузить</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
