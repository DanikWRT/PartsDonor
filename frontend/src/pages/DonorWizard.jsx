import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authFetch, readSession } from '../auth.jsx'
import { normalizeSlot, SLOT_META } from '../components/DonorExploded.jsx'

/* ============================================================
   SCR-4: wizard добавления донора (/donor/new) — 4 steps
   Устройство -> Разборка -> Цены и статусы -> Публикация
   Photoupload, blueprint-picker (DonorExploded reuse), preview
   card with 5% commission, sticky bottom bar (черновик/публикация).
   Consumes BE-1 wizard endpoints via authFetch.
   ============================================================ */

// --- Condition chips (step 1) -> backend PartCondition ---
const COND_OPTS = [
  { v: 'fallen', label: 'После падения' },
  { v: 'liquid', label: 'Залитие' },
  { v: 'dead', label: 'Не включается' },
  { v: 'working', label: 'Рабочее, но разукомплектовано' },
]
const COND_BCK = { fallen: 'for_parts', liquid: 'no_guarantee', dead: 'untested', working: 'working' }

// --- Provenance (step 1) ---
const ORIG_OPTS = [
  { v: 'original', label: '✅ Всё оригинал' },
  { v: 'mixed', label: '🔀 Смешанные' },
  { v: 'copy', label: '📋 Копии' },
]

// --- Colors (step 1) ---
const COLOR_OPTS = ['Не указан', 'Чёрный', 'Белый', 'Титановый', 'PRODUCT(RED)', 'Синий', 'Зелёный']

// --- Part status (step 3) -> ListingStatus values reused from Storefront ---
const STATUS_OPTS = [
  { value: 'active', label: 'В наличии', cls: 'green' },
  { value: 'negotiated', label: 'Под заказ', cls: 'yellow' },
  { value: 'sold', label: 'Нет в наличии', cls: 'red' },
]

// --- Deadline (step 4) ---
const DEADLINE_OPTS = ['7 дней', '14 дней', '30 дней', 'Без ограничений']

// --- Seed / fallback device-schemas (used when BE unreachable, e.g. screenshots) ---
const SEED_SCHEMAS = [
  { id: 'iphone16', brand: 'iPhone', model: '16', inventree_donor_part_id: 1 },
  { id: 'iphone16pro', brand: 'iPhone', model: '16 Pro', inventree_donor_part_id: 2 },
  { id: 'iphone16promax', brand: 'iPhone', model: '16 Pro Max', inventree_donor_part_id: 3 },
  { id: 'iphone17', brand: 'iPhone', model: '17', inventree_donor_part_id: 4 },
  { id: 'iphone17promax', brand: 'iPhone', model: '17 Pro Max', inventree_donor_part_id: 5 },
  { id: 's25u', brand: 'Samsung', model: 'Galaxy S25 Ultra', inventree_donor_part_id: 6 },
]

// --- Seed / fallback exploded components (DonorSchema.components shape) ---
const SEED_COMPONENTS = [
  { slot: 'display', title: 'Дисплей в сборе', part_id: 1, price_rub: 45000, status: 'active', hotspot: {}, image: '/photos/display.jpg' },
  { slot: 'board', title: 'Материнская плата', part_id: 2, price_rub: 24000, status: 'active', hotspot: {}, image: '/photos/board.jpg' },
  { slot: 'camera', title: 'Камера основная', part_id: 3, price_rub: 12800, status: 'active', hotspot: {}, image: '/photos/camera.jpg' },
  { slot: 'battery', title: 'Аккумулятор', part_id: 4, price_rub: 4500, status: 'active', hotspot: {}, image: '/photos/battery.jpg' },
  { slot: 'backcover', title: 'Корпус / задняя крышка', part_id: 5, price_rub: 4000, status: 'active', hotspot: {}, image: '/photos/backcover.jpg' },
]

// --- Blueprint zone positions (fixed grid fallback when no hotspot) ---
const ZONE_POS = {
  display: { x: 22, y: 30, w: 256, h: 500 },
  board: { x: 40, y: 62, w: 120, h: 150 },
  camera: { x: 170, y: 62, w: 100, h: 100 },
  battery: { x: 40, y: 255, w: 225, h: 150 },
  backcover: { x: 60, y: 440, w: 130, h: 80 },
}

const VIEW = { w: 300, h: 560 }

function zoneFor(comp, i) {
  if (comp.hotspot && comp.hotspot.x != null && comp.hotspot.y != null) {
    return { x: 24 + comp.hotspot.x * 252, y: 34 + comp.hotspot.y * 492, w: 70, h: 36 }
  }
  const key = normalizeSlot(comp.slot) || comp.slot
  const pos = ZONE_POS[key]
  if (pos) return pos
  const nx = i % 3, ny = Math.floor(i / 3)
  return { x: 30 + nx * 95, y: 440 + ny * 40, w: 74, h: 30 }
}

function fmtRub(n) {
  return Number(n || 0).toLocaleString('ru-RU') + ' ₽'
}
function partIcon(comp) {
  const k = normalizeSlot(comp && comp.slot)
  if (k === 'display') return '📱'
  if (k === 'board') return '🧩'
  if (k === 'battery') return '🔋'
  if (k === 'camera') return '📷'
  if (k === 'backcover') return '🏠'
  return '⚙️'
}

function Toast({ message }) {
  return <div className={`toast${message ? ' show' : ''}`}>{message}</div>
}
function EmptyState({ emoji, text }) {
  const lines = String(text).split('\n')
  return (
    <div className="wz-empty-state"><span className="wz-empty-emoji">{emoji}</span>{lines.map((l, i) => <React.Fragment key={i}>{i > 0 && <br />}{l}</React.Fragment>)}</div>
  )
}

export default function DonorWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)

  // Step 1
  const [schemas, setSchemas] = useState([])
  const [schemaId, setSchemaId] = useState('')
  const [schema, setSchema] = useState(null)
  const [schemaError, setSchemaError] = useState('')
  const [revision, setRevision] = useState('')
  const [color, setColor] = useState('Не указан')
  const [condition, setCondition] = useState('fallen')
  const [description, setDescription] = useState('')
  const [provenance, setProvenance] = useState('original')
  const [photos, setPhotos] = useState([]) // {url, file?}

  // Step 2
  const [donorSchema, setDonorSchema] = useState(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [selected, setSelected] = useState({}) // slot -> part def

  // Step 4
  const [city, setCity] = useState('Москва')
  const [deadline, setDeadline] = useState('14 дней')
  const [toggles, setToggles] = useState({ wholeLot: false, perPart: true, warranty: true, retail: true, b2b: true })

  // Persistence / ui
  const [donorId, setDonorId] = useState(null)
  const partIdsRef = useRef({}) // slot -> db part id
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [toast, setToast] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const fileRef = useRef(null)

  const session = useMemo(() => readSession(), [])

  function showToast(msg) {
    setToast(msg)
    window.clearTimeout(showToast._t)
    showToast._t = window.setTimeout(() => setToast(''), 2200)
  }

  // --- Load device-schemas (public) ---
  useEffect(() => {
    if (schemas.length) return
    fetch('/api/device-schemas')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((list) => {
        if (Array.isArray(list) && list.length) setSchemas(list)
        else throw new Error('empty')
      })
      .catch(() => setSchemas(SEED_SCHEMAS))
  }, [])

  // --- Select model -> load exploded donor schema (public) ---
  function selectSchema(id) {
    setSchemaId(id)
    setSchema(null)
    setDonorSchema(null)
    const found = schemas.find((s) => s.id === id)
    if (!found) return
    if (!found.inventree_donor_part_id) {
      setSchema(found)
      setDonorSchema({ brand: found.brand, model: found.model, exploded_view_url: '', components: SEED_COMPONENTS })
      return
    }
    setSchemaLoading(true)
    fetch(`/api/donor/${found.inventree_donor_part_id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((d) => {
        setSchema(found)
        setDonorSchema({ ...d, components: (d.components && d.components.length ? d.components : SEED_COMPONENTS) })
        setSchemaError('')
      })
      .catch(() => {
        setSchema(found)
        setDonorSchema({ brand: found.brand, model: found.model, exploded_view_url: '', components: SEED_COMPONENTS })
        setSchemaError('')
      })
      .finally(() => setSchemaLoading(false))
  }

  const selSchema = schema
  const selBrand = selSchema?.brand || donorSchema?.brand || ''
  const selModel = selSchema?.model || donorSchema?.model || ''
  const deviceTitle = [selBrand, selModel].filter(Boolean).join(' ') || 'Выберите модель'

  // --- Parts ---
  function togglePart(comp) {
    const key = comp.slot
    setSelected((prev) => {
      const next = { ...prev }
      if (next[key]) delete next[key]
      else next[key] = { slot: comp.slot, title: comp.title || comp.slot, part_id: comp.part_id, price_rub: comp.price_rub || 0, status: comp.status === 'active' ? 'active' : 'active', sort: Object.keys(prev).length }
      return next
    })
  }
  function removePart(slot) {
    setSelected((prev) => { const n = { ...prev }; delete n[slot]; return n })
  }
  function setPrice(slot, v) {
    setSelected((prev) => ({ ...prev, [slot]: { ...prev[slot], price_rub: Number(v) || 0 } }))
  }
  function setStatus(slot, status) {
    setSelected((prev) => ({ ...prev, [slot]: { ...prev[slot], status } }))
  }

  const parts = useMemo(() => Object.values(selected), [selected])
  const partCount = parts.length
  const loutSum = useMemo(() => parts.reduce((s, p) => s + (Number(p.price_rub) || 0), 0), [parts])
  const fee = Math.round(loutSum * 0.05)
  const net = loutSum - fee

  // --- Photos ---
  function handleFiles(files) {
    const arr = Array.from(files || []).filter((f) => f.type.startsWith('image/')).slice(0, 10 - photos.length)
    if (!arr.length) return
    const next = arr.map((f) => ({
      url: URL.createObjectURL(f),
      file: f,
      name: f.name,
      size: f.size,
    }))
    setPhotos((p) => [...p, ...next].slice(0, 10))
  }
  function removePhoto(i) {
    setPhotos((p) => p.filter((_, idx) => idx !== i))
  }

  // --- Save draft ---
  async function syncParts() {
    if (!donorId) return
    const dbIds = partIdsRef.current
    for (const p of parts) {
      if (!dbIds[p.slot]) {
        const r = await authFetch(`/api/donors/${donorId}/parts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slot: p.slot, title: p.title, inventree_part_id: p.part_id,
            price_rub: p.price_rub, status: p.status, sort: p.sort,
          }),
        })
        if (r.ok) {
          const j = await r.json()
          dbIds[p.slot] = j.id
        }
      } else {
        const r = await authFetch(`/api/donors/${donorId}/parts/${dbIds[p.slot]}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: p.title, price_rub: p.price_rub, status: p.status }),
        })
        void r
      }
    }
    for (const slot of Object.keys(dbIds)) {
      if (!selected[slot]) {
        await authFetch(`/api/donors/${donorId}/parts/${dbIds[slot]}`, { method: 'DELETE' })
        delete dbIds[slot]
      }
    }
  }

  async function persistPhotos() {
    if (!donorId) return
    for (const ph of photos) {
      if (!ph.uploaded) {
        const fd = new FormData()
        fd.append('file', ph.file)
        fd.append('owner_type', 'donor')
        fd.append('owner_id', donorId)
        const r = await authFetch('/api/uploads', { method: 'POST', body: fd })
        if (r.ok) ph.uploaded = true
      }
    }
  }

  async function saveDraft() {
    if (!session?.token) { showToast('Необходим вход (JWT отсутствует)'); return }
    setSaving(true)
    try {
      const payload = {
        device_schema_id: schemaId || null,
        brand: selBrand,
        model: selModel,
        title: deviceTitle,
        price_rub: loutSum,
        condition: COND_BCK[condition] || 'untested',
        provenance,
        parts: parts.map((p) => ({ slot: p.slot, title: p.title, inventree_part_id: p.part_id, price_rub: p.price_rub, status: p.status, sort: p.sort })),
      }
      if (!donorId) {
        const r = await authFetch('/api/donors', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j.detail || 'HTTP ' + r.status)
        if (j.id) {
          setDonorId(j.id)
          j.parts?.forEach((p) => { if (p.slot) partIdsRef.current[p.slot] = p.id })
        }
      } else {
        await authFetch(`/api/donors/${donorId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_schema_id: schemaId || null, brand: selBrand, model: selModel,
            title: deviceTitle, price_rub: loutSum, condition: COND_BCK[condition] || 'untested', provenance,
          }),
        })
        await syncParts()
      }
      await persistPhotos()
      showToast('Черновик сохранён')
    } catch (e) {
      showToast('Ошибка сохранения: ' + (e.message || ''))
    } finally {
      setSaving(false)
    }
  }

  // --- Publish ---
  async function publish() {
    if (partCount === 0) { showToast('Добавьте хотя бы одну деталь'); return }
    if (!schemaId) { showToast('Выберите модель устройства'); return }
    if (!session?.token) { showToast('Необходим вход (JWT отсутствует)'); return }
    setPublishing(true)
    try {
      if (!donorId) {
        await saveDraft()
      }
      if (!donorId) throw new Error('Не удалось создать черновик')
      const r = await authFetch(`/api/donors/${donorId}/publish`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.detail || 'HTTP ' + r.status)
      showToast('Донор опубликован')
      window.setTimeout(() => { if (j.donor_lot_id) navigate(`/donor-lot/${j.donor_lot_id}`); else navigate('/donor-lots') }, 900)
    } catch (e) {
      showToast('Ошибка публикации: ' + (e.message || ''))
    } finally {
      setPublishing(false)
    }
  }

  const STEP_LIST = ['Устройство', 'Разборка', 'Цены и статусы', 'Публикация']

  const previewCard = (
    <div className="wz-preview-card">
      <div className="wz-pc-head">
        <div className="wz-pc-icon">📱</div>
        <div>
          <div className="wz-pc-title">Новый донор</div>
          <div className="wz-pc-sub">{deviceTitle === 'Выберите модель' ? 'Выберите модель' : `${deviceTitle} · ${color}`}</div>
        </div>
      </div>
      <div className="wz-pc-desc">
        {description || 'Описание появится здесь...'}
        {condition !== 'fallen' ? ` · ${COND_OPTS.find((c) => c.v === condition)?.label}` : ''}
        {' · '}{ORIG_OPTS.find((o) => o.v === provenance)?.label.replace(/^[^ ]+ /, '')}
      </div>
    </div>
  )

  const summary = (
    <>
      <div className="wz-summary-row"><span className="k">Деталей в лоте</span><span className="v">{partCount}</span></div>
      <div className="wz-summary-row"><span className="k">Сумма поштучно</span><span className="v">{fmtRub(loutSum)}</span></div>
      <div className="wz-summary-row"><span className="k">Комиссия платформы (5%)</span><span className="v">{fmtRub(fee)}</span></div>
      <div className="wz-summary-row total"><span className="k">Вы получите</span><span className="v">{fmtRub(net)}</span></div>
    </>
  )

  const tips = (
    <div className="wz-tips">
      • Подробное описание и фото повышают доверие и цену.<br />
      • Указывайте остаточную ёмкость аккумулятора.<br />
      • Отмечайте, если плата не восстанавливалась.<br />
      • Мастера чаще берут лот целиком, розница — поштучно.
    </div>
  )

  const partsList = parts.length ? (
    parts.map((p) => (
      <button key={p.slot} type="button" className="wz-part-item selected" onClick={() => togglePart({ slot: p.slot, title: p.title, part_id: p.part_id })}>
        <span className="wz-pi-icon">{partIcon({ slot: p.slot })}</span>
        <span className="wz-pi-info">
          <span className="wz-pi-name">{p.title}</span>
          <span className="wz-pi-meta">{STATUS_OPTS.find((s) => s.value === p.status)?.label || p.status}</span>
        </span>
        <span className="wz-pi-price">{p.price_rub ? fmtRub(p.price_rub) : '—'}</span>
      </button>
    ))
  ) : (
    <EmptyState emoji="📐" text={'Кликните на деталь\nна чертеже'} />
  )

  return (
    <div className="wz-page">
      <div className="bg-blueprint" aria-hidden="true" />

      <div className="wz-breadcrumb">
        <span>Кабинет</span><span className="wz-sep">/</span><span>Мои доноры</span><span className="wz-sep">/</span><span className="wz-cur">Новый донор</span>
        <span className="wz-breadcrumb-spacer" />
        <button type="button" className="btn btn-sm" onClick={saveDraft}>💾 Черновик</button>
        <button type="button" className="btn btn-sm" onClick={() => setPreviewOpen(true)}>👁 Предпросмотр</button>
      </div>

      {/* Stepper */}
      <div className="wz-steps" role="tablist" aria-label="Шаги визарда">
        {STEP_LIST.map((label, i) => {
          const n = i + 1
          return (
            <React.Fragment key={n}>
              {n > 1 && <span className="wz-step-arrow">→</span>}
              <button
                type="button"
                className={`wz-step${step === n ? ' active' : ''}${step > n ? ' done' : ''}`}
                onClick={() => setStep(n)}
                role="tab"
                aria-selected={step === n}
              >
                <span className="wz-num">{step > n ? '✓' : n}</span> {label}
              </button>
            </React.Fragment>
          )
        })}
      </div>

      <div className="wz-layout">
        <div className="wz-main-col">
          {/* ===== STEP 1: УСТРОЙСТВО ===== */}
          {step === 1 && (
            <>
              <section className="wz-panel">
                <div className="wz-panel-title">
                  <h2><span className="wz-ico">📱</span> Информация о <b>доноре</b></h2>
                  <span className="wz-hint">Шаг 1 из 4</span>
                </div>
                <div className="wz-form-grid">
                  <div className="wz-field full">
                    <label>Модель устройства <span className="wz-req">*</span>
                      {schemaLoading && <em className="wz-loading">загрузка чертежа…</em>}
                    </label>
                    {schemas.length ? (
                      <select value={schemaId} onChange={(e) => selectSchema(e.target.value)} disabled={schemaLoading}>
                        <option value="">Выберите модель...</option>
                        {['iPhone', 'Samsung'].map((br) => (
                          <optgroup key={br} label={br}>
                            {schemas.filter((s) => s.brand === br).map((s) => (
                              <option key={s.id} value={s.id}>{s.brand} {s.model}</option>
                            ))}
                          </optgroup>
                        ))}
                        {!schemas.some((s) => s.brand === 'iPhone' || s.brand === 'Samsung') && schemas.map((s) => (
                          <option key={s.id} value={s.id}>{s.brand} {s.model}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="wz-disabled">
                        Каталог схем устройств пуст. Для чертежа нужна добавленная device-schema.
                      </div>
                    )}
                  </div>
                  <div className="wz-field">
                    <label>Ревизия / парт-номер</label>
                    <input type="text" value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="Напр. A2897" />
                  </div>
                  <div className="wz-field">
                    <label>Цвет</label>
                    <select value={color} onChange={(e) => setColor(e.target.value)}>
                      {COLOR_OPTS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="wz-field">
                    <label>Состояние донора</label>
                    <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                      {COND_OPTS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="wz-field full">
                    <label>Описание донора</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Опишите состояние: что произошло, что осталось, какие детали целые. Эта информация видна покупателям и повышает доверие." />
                  </div>
                  <div className="wz-field full">
                    <label>Оригинальность компонентов</label>
                    <div className="wz-choice-group">
                      {ORIG_OPTS.map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          className={`wz-choice${provenance === o.v ? ' active green' : ''}`}
                          onClick={() => setProvenance(o.v)}
                        >{o.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="wz-panel">
                <div className="wz-panel-title">
                  <h2><span className="wz-ico">📸</span> Фото <b>устройства</b></h2>
                  <span className="wz-hint">От 1 до 10 фото</span>
                </div>
                <div
                  className={`wz-upload-zone${photos.length >= 10 ? ' disabled' : ''}`}
                  onClick={() => photos.length < 10 && fileRef.current && fileRef.current.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
                >
                  <div className="wz-uico">📷</div>
                  <div className="wz-utitle">Перетащите фото сюда или нажмите</div>
                  <div className="wz-usub">JPG, PNG · до 5 МБ · максимум 10 фото</div>
                  <input ref={fileRef} type="file" multiple accept="image/*" hidden
                    onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
                </div>
                {photos.length > 0 && (
                  <div className="wz-photo-grid">
                    {photos.map((p, i) => (
                      <div key={i} className="wz-photo-thumb">
                        <img src={p.url} alt={p.name || 'фото'} loading="lazy" />
                        <button type="button" className="wz-rm" onClick={() => removePhoto(i)} aria-label="Удалить">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* ===== STEP 2: РАЗБОРКА ===== */}
          {step === 2 && (
            <section className="wz-panel">
              <div className="wz-panel-title">
                <h2><span className="wz-ico">⚙️</span> Разборка <b>по чертежу</b></h2>
                <span className="wz-hint">Шаг 2 из 4 · Кликните на деталь</span>
              </div>
              {!selSchema ? (
                <EmptyState emoji="🗺️" text={'Сначала выберите модель устройства (шаг 1).\nМожно пропустить — перейти к шагу 3.'} />
              ) : (
                <div className="wz-blueprint-picker">
                  <div className="wz-bp-frame">
                    <div className="wz-stamp">
                      <span>{deviceTitle || ''} · РАЗБОРКА</span>
                      <b id="bpStampModel">{selSchema ? deviceTitle : '— не выбрано —'}</b>
                    </div>
                    <svg className="wz-bp-svg" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label="Развёртка донора">
                      <defs>
                        <filter id="wz-pencil">
                          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="noise" />
                          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.5" xChannelSelector="R" yChannelSelector="G" />
                        </filter>
                      </defs>
                      <rect x="15" y="15" width="270" height="530" rx="42" fill="none" stroke="#b8c4d8" strokeWidth="1.3" filter="url(#wz-pencil)" opacity=".8" />
                      {(donorSchema?.components || []).map((comp, i) => {
                        const z = zoneFor(comp, i)
                        const isSel = !!selected[comp.slot]
                        return (
                          <rect
                            key={`${comp.slot}-${comp.part_id ?? i}`}
                            className={`wz-part-zone${isSel ? ' selected' : ''}`}
                            x={z.x} y={z.y} width={z.w} height={z.h} rx="8"
                            onClick={() => togglePart(comp)}
                            role="button"
                            aria-label={comp.title || comp.slot}
                            aria-pressed={isSel}
                          />
                        )
                      })}
                      <line x1="15" y1="8" x2="285" y2="8" stroke="#4fa3ff" strokeWidth="0.5" opacity=".6" />
                      <text x="150" y="6" fontSize="7" fill="#4fa3ff" textAnchor="middle" fontFamily="monospace">71.6 mm</text>
                    </svg>
                    <div className="wz-bp-hint">Выбрано: <b>{partCount}</b> деталей</div>
                  </div>

                  <div>
                    <div className="wz-side-label">Детали в лоте</div>
                    <div className="wz-parts-list">{partsList}</div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ===== STEP 3: ЦЕНЫ И СТАТУСЫ ===== */}
          {step === 3 && (
            <section className="wz-panel">
              <div className="wz-panel-title">
                <h2><span className="wz-ico">💰</span> Цены и <b>статусы</b></h2>
                <span className="wz-hint">Шаг 3 из 4</span>
              </div>
              {partCount === 0 ? (
                <EmptyState emoji="⚙️" text="Сначала выберите детали на чертеже (шаг 2)" />
              ) : (
                <div className="wz-price-list">
                  {parts.map((p) => (
                    <div key={p.slot} className="wz-price-row">
                      <div className="wz-price-head">
                        <span className="wz-pi-icon">{partIcon({ slot: p.slot })}</span>
                        <div className="wz-price-info">
                          <div className="wz-price-name">{p.title}</div>
                          <div className="wz-price-slot">{p.slot}</div>
                        </div>
                        <button type="button" className="wz-rm" onClick={() => removePart(p.slot)} aria-label="Убрать">✕</button>
                      </div>
                      <div className="wz-price-fields">
                        <div className="wz-field">
                          <label>Цена, ₽</label>
                          <input type="number" min="0" step="50" value={p.price_rub || ''} onChange={(e) => setPrice(p.slot, e.target.value)} />
                        </div>
                        <div className="wz-field">
                          <label>Статус</label>
                          <select value={p.status} onChange={(e) => setStatus(p.slot, e.target.value)}>
                            {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div className="wz-field wz-price-cls">
                          <label>Сумма</label>
                          <div className="wz-price-total">{fmtRub(p.price_rub)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ===== STEP 4: ПУБЛИКАЦИЯ ===== */}
          {step === 4 && (
            <section className="wz-panel">
              <div className="wz-panel-title">
                <h2><span className="wz-ico">🚀</span> Параметры <b>публикации</b></h2>
                <span className="wz-hint">Шаг 4 из 4</span>
              </div>
              <div className="wz-form-grid">
                <div className="wz-field">
                  <label>Город</label>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Москва" />
                </div>
                <div className="wz-field">
                  <label>Срок продажи</label>
                  <select value={deadline} onChange={(e) => setDeadline(e.target.value)}>
                    {DEADLINE_OPTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="wz-field full">
                  <label>Условия</label>
                  {[
                    { k: 'wholeLot', l: 'Продажа целиком (лот-донор)' },
                    { k: 'perPart', l: 'Продажа поштучно' },
                    { k: 'warranty', l: 'Гарантия на детали' },
                  ].map((t) => (
                    <div key={t.k} className="wz-toggle-row">
                      <span className="wz-tl">{t.l}</span>
                      <button type="button" className={`wz-switch${toggles[t.k] ? ' on' : ''}`} aria-pressed={toggles[t.k]} onClick={() => setToggles((s) => ({ ...s, [t.k]: !s[t.k] }))} />
                    </div>
                  ))}
                  {[
                    { k: 'retail', l: 'Показывать в рознице (B2C)' },
                    { k: 'b2b', l: 'Показывать мастерам и сервисам (B2B)' },
                  ].map((t) => (
                    <div key={t.k} className="wz-toggle-row">
                      <span className="wz-tl">{t.l}</span>
                      <button type="button" className={`wz-switch${toggles[t.k] ? ' on' : ''}`} aria-pressed={toggles[t.k]} onClick={() => setToggles((s) => ({ ...s, [t.k]: !s[t.k] }))} />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Step nav */}
          <div className="wz-step-nav">
            {step > 1 && <button type="button" className="btn" onClick={() => setStep(step - 1)}>← Назад</button>}
            {step < 4 && <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>Далее →</button>}
          </div>
        </div>

        {/* Right side column (preview + tips) — desktop */}
        <aside className="wz-side-col">
          <div className="wz-panel">
            <div className="wz-panel-title"><h2><span className="wz-ico">👁</span> <b>Предпросмотр</b></h2></div>
            {previewCard}
            {summary}
          </div>
          <div className="wz-panel">
            <div className="wz-panel-title"><h2><span className="wz-ico">💡</span> <b>Советы</b></h2></div>
            {tips}
          </div>
        </aside>
      </div>

      {/* Sticky bottom bar */}
      <div className="wz-bottom-bar">
        <div className="wz-bb-info"><b>{partCount}</b> деталей · сумма <b>{fmtRub(loutSum)}</b></div>
        <div className="wz-bb-actions">
          <button type="button" className="btn" onClick={saveDraft} disabled={saving}>
            {saving ? 'Сохранение…' : '💾 Сохранить черновик'}
          </button>
          <button type="button" className="btn btn-primary" onClick={publish} disabled={publishing || partCount === 0 || !schemaId}>
            {publishing ? 'Публикация…' : '🚀 Опубликовать'}
          </button>
        </div>
      </div>

      <Toast message={toast} />

      {/* Preview modal (from any step) */}
      {previewOpen && (
        <div className="wz-modal-overlay" onClick={() => setPreviewOpen(false)}>
          <div className="wz-modal" role="dialog" aria-label="Предпросмотр донора" onClick={(e) => e.stopPropagation()}>
            <div className="wz-modal-head">
              <h2><span className="wz-ico">👁</span> Предпросмотр</h2>
              <button type="button" className="wz-modal-close" onClick={() => setPreviewOpen(false)}>✕</button>
            </div>
            {previewCard}
            {summary}
            <div className="wz-panel-title" style={{ marginTop: 18 }}><h2><span className="wz-ico">💡</span> <b>Советы</b></h2></div>
            {tips}
          </div>
        </div>
      )}
    </div>
  )
}
