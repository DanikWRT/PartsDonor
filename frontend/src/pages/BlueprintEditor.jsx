import React, { useMemo, useRef, useState } from 'react'
import { authFetch } from '../auth.jsx'

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
export default function BlueprintEditor() {
  const [tool, setTool] = useState('rect')
  const [figures, setFigures] = useState([])
  const [draft, setDraft] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [activeColor, setActiveColor] = useState('#4fa3ff')

  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)

  const [savedSchemas, setSavedSchemas] = useState([])
  const [loadId, setLoadId] = useState('')

  const svgRef = useRef(null)
  const interactionRef = useRef(null)

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
    if (e.button !== 0) return
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

  // ---- persistence ----
  const loadSchemas = () => {
    authFetch('/api/device-schemas')
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
    const body = {
      brand: brand.trim(),
      model: model.trim(),
      inventree_donor_part_id: null,
      exploded_view_url: buildSvg(figures),
      hotspots: buildHotspots(figures),
    }
    try {
      const r = await authFetch('/api/device-schemas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) {
        setSaveMsg({ type: 'err', text: data?.detail || 'Не удалось сохранить схему' })
      } else {
        setSaveMsg({ type: 'ok', text: `Схема сохранена (id: ${data.id})` })
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
    setModel(s.model || '')
    const svgStr = s.exploded_view_url || ''
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

  const selBox = selected ? bbox(selected) : null

  return (
    <div className="bld-editor">
      <div className="bld-head">
        <div>
          <h1 className="bld-title">Конструктор схемы</h1>
          <p className="bld-sub">Нарисуйте схему устройства, задайте частям названия и ключи, сохраните.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clearCanvas}>Очистить холст</button>
      </div>

      <div className="bld-layout">
        {/* ------- Toolbar ------- */}
        <aside className="bld-toolbar" aria-label="Инструменты">
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
        </aside>

        {/* ------- Canvas ------- */}
        <div className="bld-canvas-wrap">
          <svg
            ref={svgRef}
            className={`bld-canvas tool-${tool}`}
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

            {figures.map((f) => {
              const el = shapeEl(f, false)
              return React.cloneElement(el, { className: f.id === selectedId ? 'bld-fig is-selected' : 'bld-fig' })
            })}
            {draft && <g className="bld-fig bld-draft" pointerEvents="none">{shapeEl(draft, true)}</g>}

            {/* выделение + resize-маркер */}
            {selBox && (
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
                <input className="pd-input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Apple" />
              </label>
              <label className="pd-field">
                <span className="pd-label">Модель</span>
                <input className="pd-input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="iPhone X" />
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
