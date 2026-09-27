import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../cart.jsx'
import { statusCls } from '../components/DonorExploded.jsx'
import DonorBlueprintMini from '../components/DonorBlueprintMini.jsx'

const fmt = (n) => (Number(n) || 0).toLocaleString('ru-RU')

const SLOT_LABEL = { display: 'Дисплей', board: 'Плата', battery: 'Аккумулятор', camera: 'Камера', backcover: 'Корпус' }
const SLOT_ICON = { display: '📱', board: '🧩', battery: '🔋', camera: '📷', backcover: '📦' }
function slotInfo(c) {
  const s = String(c?.slot || '').toLowerCase()
  if (s.includes('дисплей') || s.includes('display') || s.includes('экран')) return { label: SLOT_LABEL.display, icon: SLOT_ICON.display }
  if (s.includes('плат') || s.includes('board')) return { label: SLOT_LABEL.board, icon: SLOT_ICON.board }
  if (s.includes('аккум') || s.includes('battery')) return { label: SLOT_LABEL.battery, icon: SLOT_ICON.battery }
  if (s.includes('камер') || s.includes('camera')) return { label: SLOT_LABEL.camera, icon: SLOT_ICON.camera }
  if (s.includes('корпус') || s.includes('cover') || s.includes('back')) return { label: SLOT_LABEL.backcover, icon: SLOT_ICON.backcover }
  return { label: c?.title || c?.slot || 'Деталь', icon: '🔧' }
}

// donor component status → pill (in/order/none) + label
function pill(cls) {
  if (cls === 'in') return ['in', 'В наличии']
  if (cls === 'negotiated') return ['order', 'Под заказ']
  if (cls === 'sold') return ['none', 'Продано']
  return ['none', 'Скрыто']
}

// =============================================================================
// SVG-иконки компонентов/деталей (эталон ref 03-donors-parts.html, ICONS).
// Рендерятся как настоящий SVG внутри .part-preview (не эмодзи).
// =============================================================================
const ICONS = {
  screen: (
    <svg viewBox="0 0 110 180">
      <rect x="4" y="4" width="102" height="172" rx="16" fill="#1a2440" stroke="#2e3543" />
      <rect x="10" y="10" width="90" height="160" rx="10" fill="#060a14" />
      <rect x="40" y="18" width="30" height="8" rx="4" fill="#000" />
    </svg>
  ),
  battery: (
    <svg viewBox="0 0 140 90">
      <rect x="4" y="4" width="132" height="82" rx="7" fill="#1c202a" stroke="#3a4051" />
      <rect x="12" y="62" width="50" height="14" rx="2" fill="#22c55e" opacity=".85" />
      <rect x="126" y="36" width="10" height="18" rx="2" fill="#3a4051" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 110 110">
      <rect x="4" y="4" width="102" height="102" rx="22" fill="#161a22" stroke="#353c4d" />
      <circle cx="38" cy="38" r="20" fill="#050608" />
      <circle cx="38" cy="38" r="14" fill="#252a3a" />
      <circle cx="38" cy="38" r="7" fill="#000" />
      <circle cx="72" cy="38" r="20" fill="#050608" />
      <circle cx="72" cy="38" r="14" fill="#252a3a" />
      <circle cx="72" cy="38" r="7" fill="#000" />
      <circle cx="38" cy="72" r="18" fill="#050608" />
      <circle cx="38" cy="72" r="12" fill="#252a3a" />
      <circle cx="38" cy="72" r="5" fill="#000" />
      <circle cx="72" cy="72" r="8" fill="#1a1f28" />
      <circle cx="72" cy="72" r="4" fill="#f5e6b8" />
    </svg>
  ),
  coil: (
    <svg viewBox="0 0 140 140">
      <path d="M 60 10 L 60 16 L 40 16 L 40 40 L 55 40 L 55 50 L 75 50 L 75 40 L 90 40 L 90 16 L 78 16 L 78 10 Z" fill="#1a1a1a" />
      <rect x="58" y="12" width="22" height="6" rx="1" fill="#c9962a" />
      <circle cx="70" cy="100" r="42" fill="#0d0d0d" stroke="#1a1a1a" />
      <circle cx="70" cy="100" r="35" fill="none" stroke="#c99160" strokeWidth="2.5" />
      <circle cx="70" cy="100" r="25" fill="none" stroke="#c99160" strokeWidth="2" />
      <circle cx="70" cy="100" r="15" fill="none" stroke="#c99160" strokeWidth="2" />
    </svg>
  ),
  charging: (
    <svg viewBox="0 0 200 160">
      <path d="M 20 8 L 20 20 L 30 20 L 30 50 L 22 50 L 22 90 L 38 90 L 38 20 L 48 20 L 48 8 Z" fill="#1a1a1a" />
      <rect x="18" y="4" width="34" height="10" rx="1" fill="#c9962a" />
      <path d="M 20 90 L 180 90 L 180 150 L 20 150 Z" fill="#1a1a1a" />
      <rect x="55" y="128" width="65" height="22" rx="3" fill="#c9962a" />
      <rect x="60" y="132" width="55" height="14" rx="7" fill="#0a0a0a" />
    </svg>
  ),
  board: (
    <svg viewBox="0 0 130 100">
      <path d="M 6 6 L 124 6 L 124 30 L 105 30 L 105 45 L 124 45 L 124 94 L 6 94 L 6 75 L 22 75 L 22 45 L 6 45 Z" fill="#1e4d38" stroke="#3a7050" />
      <rect x="16" y="14" width="22" height="22" fill="#0a0c10" stroke="#3a4051" />
      <rect x="46" y="14" width="30" height="18" fill="#0a0c10" stroke="#3a4051" />
      <rect x="84" y="14" width="18" height="18" fill="#0a0c10" stroke="#3a4051" />
      <rect x="16" y="52" width="28" height="28" fill="#0a0c10" stroke="#3a4051" />
      <rect x="52" y="52" width="34" height="20" fill="#0a0c10" stroke="#3a4051" />
    </svg>
  ),
  speaker: (
    <svg viewBox="0 0 120 80">
      <rect x="4" y="4" width="112" height="72" rx="10" fill="#0a0c12" stroke="#353c4d" />
      <circle cx="60" cy="40" r="28" fill="#050608" stroke="#1a1f28" />
      <circle cx="60" cy="40" r="22" fill="none" stroke="#353c4d" strokeDasharray="2 3" />
      <circle cx="60" cy="40" r="16" fill="none" stroke="#353c4d" strokeDasharray="2 3" />
    </svg>
  ),
  buzzer: (
    <svg viewBox="0 0 100 90">
      <rect x="4" y="4" width="92" height="82" rx="10" fill="#0a0c12" stroke="#353c4d" />
      <circle cx="50" cy="45" r="26" fill="#050608" />
      <circle cx="50" cy="45" r="18" fill="none" stroke="#353c4d" strokeDasharray="2 3" />
      <circle cx="50" cy="45" r="10" fill="none" stroke="#353c4d" strokeDasharray="2 3" />
      <circle cx="50" cy="45" r="4" fill="#353c4d" />
    </svg>
  ),
  'btn-power': (
    <svg viewBox="0 0 100 140">
      <path d="M 50 8 L 50 20 L 40 20 L 40 40 L 30 40 L 30 60 L 40 60 L 40 100 L 50 100 L 50 120 L 60 120 L 60 100 L 70 100 L 70 60 L 60 60 L 60 40 L 70 40 L 70 20 L 60 20 L 60 8 Z" fill="#1a1a1a" />
      <rect x="42" y="4" width="16" height="8" rx="1" fill="#c9962a" />
      <rect x="30" y="110" width="40" height="22" rx="3" fill="#1a1a1a" stroke="#c9962a" />
    </svg>
  ),
  'btn-vol': (
    <svg viewBox="0 0 100 160">
      <rect x="30" y="20" width="40" height="18" rx="2" fill="#1a1a1a" stroke="#333" />
      <rect x="30" y="55" width="40" height="26" rx="2" fill="#1a1a1a" stroke="#333" />
      <rect x="30" y="95" width="40" height="26" rx="2" fill="#1a1a1a" stroke="#333" />
      <path d="M 50 18 L 50 8 L 60 8 L 60 130 L 70 130 L 70 140 L 40 140 L 40 130 L 30 130 L 30 8 L 40 8 L 40 18 Z" fill="#1a1a1a" opacity=".7" />
    </svg>
  ),
  'mic-bottom': (
    <svg viewBox="0 0 120 80">
      <rect x="4" y="4" width="112" height="72" rx="10" fill="#0a0c12" stroke="#353c4d" />
      <circle cx="20" cy="40" r="3" fill="none" stroke="#4a5468" />
      <circle cx="40" cy="40" r="3" fill="none" stroke="#4a5468" />
      <circle cx="60" cy="40" r="3" fill="none" stroke="#4a5468" />
      <circle cx="80" cy="40" r="3" fill="none" stroke="#4a5468" />
      <circle cx="100" cy="40" r="3" fill="none" stroke="#4a5468" />
    </svg>
  ),
  housing: (
    <svg viewBox="0 0 120 200">
      <rect x="4" y="4" width="112" height="192" rx="22" fill="#e81c10" stroke="#7a0500" />
      <rect x="12" y="14" width="58" height="58" rx="16" fill="#5a0800" />
      <circle cx="30" cy="32" r="11" fill="#0a0a0a" />
      <circle cx="52" cy="32" r="11" fill="#0a0a0a" />
      <circle cx="30" cy="56" r="10" fill="#0a0a0a" />
      <circle cx="52" cy="56" r="10" fill="#0a0a0a" />
    </svg>
  ),
}

// Fixed tab set (ref 03): label → normalized catalog category key.
const PART_TABS = [
  { k: 'all', l: 'Все' },
  { k: 'дисплей', l: 'Дисплеи' },
  { k: 'аккумулятор', l: 'Аккумуляторы' },
  { k: 'плата', l: 'Платы' },
  { k: 'камера', l: 'Камеры' },
  { k: 'шлейф', l: 'Шлейфы' },
  { k: 'корпус', l: 'Корпуса' },
]

// Normalize arbitrary catalog category string → one of the ref tab keys.
function normalizeCat(cat) {
  const c = String(cat || '').toLowerCase()
  if (c.includes('диспл') || c.includes('screen') || c.includes('экран')) return 'дисплей'
  if (c.includes('аккум') || c.includes('battery') || c.includes('аккумулятор')) return 'аккумулятор'
  if (c.includes('плат') || c.includes('board')) return 'плата'
  if (c.includes('камер') || c.includes('camera')) return 'камера'
  if (c.includes('шлейф') || c.includes('кабел') || c.includes('cable')) return 'шлейф'
  if (c.includes('корпус') || c.includes('housing')) return 'корпус'
  return null
}

const PART_CAT_ICON = {
  'дисплей': 'screen',
  'аккумулятор': 'battery',
  'плата': 'board',
  'камера': 'camera',
  'шлейф': 'charging',
  'корпус': 'housing',
}

// Pick the real SVG icon key for a catalog part (by name first, then category).
function partIconKey(p) {
  const name = String(p?.name || '').toLowerCase()
  if (name.includes('заряд') || name.includes('шлейф заряд')) return 'charging'
  if (name.includes('power') || name.includes('включ') || name.includes('кнопка вкл')) return 'btn-power'
  if (name.includes('громк') || name.includes('volume')) return 'btn-vol'
  if (name.includes('микрофон') || name.includes('mic')) return 'mic-bottom'
  if (name.includes('катушк') || name.includes('magsafe')) return 'coil'
  if (name.includes('динамик') || name.includes('speaker')) return 'speaker'
  if (name.includes('бузер') || name.includes('зуммер') || name.includes('buzzer')) return 'buzzer'
  return PART_CAT_ICON[normalizeCat(p?.category)] || 'coil'
}

// Fallback phone blueprint stamped «N деталей» when donor detail has no components.
function GenericBlueprint({ n }) {
  return (
    <svg className="scr-fallback-bp" viewBox="0 0 340 240" aria-hidden="true">
      <defs>
        <filter id="pencil-g" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <rect x="140" y="30" width="60" height="180" rx="14" fill="none" stroke="#b8c4d8" strokeWidth="1.2" filter="url(#pencil-g)" opacity=".55" />
      <rect x="146" y="36" width="48" height="168" rx="10" fill="rgba(79,163,255,.06)" stroke="#4fa3ff" strokeWidth="0.6" opacity=".6" />
      <line x1="160" y1="50" x2="192" y2="50" stroke="#4fa3ff" strokeWidth="0.4" strokeDasharray="2 2" opacity=".4" />
      <line x1="160" y1="190" x2="192" y2="190" stroke="#4fa3ff" strokeWidth="0.4" strokeDasharray="2 2" opacity=".4" />
      <text x="170" y="16" fontSize="7" fill="#4fa3ff" textAnchor="middle" fontFamily="Courier New" letterSpacing="1">ДОНОР · {n} ДЕТАЛЕЙ</text>
    </svg>
  )
}

function DonorBlueprint({ donor, hoverId, onHoverPart }) {
  const comps = donor.components || []
  if (comps.length === 0) {
    return (
      <div className="donor-blueprint">
        <GenericBlueprint n={donor.component_count || 0} />
      </div>
    )
  }
  return (
    <div className="donor-blueprint">
      <DonorBlueprintMini
        components={comps}
        uId={donor.id}
        hoverId={hoverId}
        onHoverPart={onHoverPart}
      />
    </div>
  )
}

const DonorCard = React.memo(function DonorCard({ lot }) {
  const { add, has } = useCart()
  const [hoverPart, setHoverPart] = useState(null)
  const comps = lot.components || []
  const total = comps.reduce((s, c) => s + (Number(c.price_rub) || 0), 0)
  const avail = comps.filter((c) => statusCls(c.status) === 'in').length
  const canAdd = lot.listing_id != null && total > 0
  const inCart = canAdd && has(lot.listing_id)

  return (
    <div className="donor-card">
      <div className="donor-head">
        <div className="donor-name">
          {lot.brand} {lot.model}
          <span className="rev">{lot.title}</span>
        </div>
        <span className="donor-badge">Донор</span>
      </div>

      <DonorBlueprint donor={lot} hoverId={hoverPart} onHoverPart={setHoverPart} />

      <div className="donor-condition">
        {lot.condition === 'for_parts'
          ? 'Состояние: на запчасти'
          : lot.condition === 'used'
            ? 'Состояние: б/у'
            : lot.condition || 'Состояние не указано'}
        {lot.provenance ? ` · ${lot.provenance}` : ''}
      </div>

      {comps.length > 0 && (
        <div className="donor-composition">
          {comps.map((c, i) => {
            const si = slotInfo(c)
            const [pc, pl] = pill(statusCls(c.status))
            const pid = c.part_id != null ? c.part_id : String(c.slot || '')
            const hl = hoverPart != null && String(hoverPart) === String(pid)
            return (
              <div
                className={`comp-row${hl ? ' hl' : ''}`}
                key={`${c.slot || ''}-${c.part_id || i}`}
                onMouseEnter={() => setHoverPart(pid)}
                onMouseLeave={() => setHoverPart(null)}
              >
                <div className="cr-icon">{si.icon}</div>
                <div className="cr-name">
                  {si.label}
                  <span className={`cr-status ${pc}`}>{pl}</span>
                </div>
                <div className={`cr-price ${pc === 'none' ? 'sold' : ''}`}>{fmt(c.price_rub)} ₽</div>
              </div>
            )
          })}
        </div>
      )}

      <div className="donor-foot">
        <div className="donor-price-block">
          <div className="dp-total">{fmt(total)} ₽</div>
          <div className="dp-lbl">
            {avail} из {comps.length || lot.component_count || 0} деталей · {lot.seller_name}
            {lot.seller_verified && <span className="verified"> · ✓ проверен</span>}
          </div>
        </div>
        <div className="donor-foot-actions">
          <Link to={`/donor-lot/${lot.id}`} className="btn btn-sm btn-ghost">Подробнее</Link>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={!canAdd || inCart}
            onClick={() => {
              if (!canAdd) return
              add({
                listing_id: lot.listing_id,
                title: `${lot.brand} ${lot.model} (весь лот)`,
                price_rub: total,
                condition: lot.condition,
                seller_name: lot.seller_name,
              })
            }}
          >
            {inCart ? '✓ В корзине' : 'В корзину'}
          </button>
        </div>
      </div>
    </div>
  )
})

// Part status → (chip cls, label). in/order/donor/none per ref 03.
function partStatus(p) {
  if (p.in_stock) return ['in', 'В наличии']
  if (p.listing_status === 'sold') return ['none', 'Нет']
  if (p.listing_status === 'reserved' || p.listing_status === 'negotiated') return ['order', 'Под заказ']
  return ['order', 'Под заказ']
}

const PartCard = React.memo(function PartCard({ p }) {
  const { add, has } = useCart()
  const [cls, stockLabel] = partStatus(p)
  const iconKey = partIconKey(p)
  const canAdd = p.listing_id != null && p.listing_price != null
  const inCart = canAdd && has(p.listing_id)

  return (
    <div className="part-card">
      <div className="part-preview">
        <span className={`part-status ${cls}`}>{stockLabel}</span>
        {p.code && <span className="part-code">{p.code}</span>}
        {ICONS[iconKey] || ICONS.coil}
      </div>
      <div className="part-name">{p.name}</div>
      <div className="part-meta">{p.category || 'Запчасть'}</div>
      <div className="part-bottom">
        <div className="part-price">{p.listing_price != null ? `${fmt(p.listing_price)} ₽` : 'Цена по запросу'}</div>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={!canAdd || inCart}
          onClick={() => {
            if (!canAdd) return
            add({
              listing_id: p.listing_id,
              title: p.name,
              price_rub: p.listing_price,
              condition: p.listing_condition,
              seller_name: p.seller_name,
            })
          }}
        >
          {inCart ? '✓ В корзине' : 'В корзину'}
        </button>
      </div>
    </div>
  )
})

const DONOR_TABS = [
  { k: 'all', l: 'Все' },
  { k: 'iphone', l: 'iPhone' },
  { k: 'samsung', l: 'Samsung' },
  { k: 'full', l: 'Полный комплект' },
  { k: 'partial', l: 'Частично' },
]

export default function Catalog() {
  const [q, setQ] = useState('')
  const [donors, setDonors] = useState([])
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [donorTab, setDonorTab] = useState('all')
  const [partCat, setPartCat] = useState('all')

  // Load donor list + parts, then fetch each donor detail for its components.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/donor-lots').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/catalog').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ])
      .then(([lots, parts]) => {
        const list = Array.isArray(lots) ? lots : []
        return Promise.all(
          list.map((lot) =>
            fetch(`/api/donor-lots/${lot.id}`)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ),
        ).then((details) => {
          if (cancelled) return
          const merged = list.map((lot, i) => {
            const d = details && details[i]
            const comps = d && Array.isArray(d.components) ? d.components : []
            return { ...lot, components: comps }
          })
          setDonors(merged)
          setParts(Array.isArray(parts) ? parts : [])
          setLoading(false)
        })
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const ql = q.trim().toLowerCase()

  const visibleDonors = donors.filter((d) => {
    const brandModel = `${d.brand} ${d.model}`.toLowerCase()
    const n = d.components.length
    let ok = true
    if (donorTab === 'iphone') ok = /apple|iphone|айфон/.test(brandModel)
    else if (donorTab === 'samsung') ok = /samsung/.test(brandModel)
    else if (donorTab === 'full') ok = (n >= 4 || (d.component_count || 0) >= 4)
    else if (donorTab === 'partial') ok = n < 4
    if (!ok || !ql) return ok
    const hay = `${d.brand} ${d.model} ${d.title} ${(d.components || []).map((c) => `${slotInfo(c).label} ${c.title}`).join(' ')}`.toLowerCase()
    return hay.includes(ql)
  })

  const visibleParts = parts.filter((p) => {
    if (partCat !== 'all' && normalizeCat(p.category) !== partCat) return false
    if (!ql) return true
    return `${p.name} ${p.category} ${p.code || ''}`.toLowerCase().includes(ql)
  })

  const stats = {
    donors: donors.length,
    parts: parts.length,
    stock: parts.filter((p) => p.in_stock).length,
    sellers: new Set([...donors.map((d) => d.seller_name), ...parts.map((p) => p.seller_name)].filter(Boolean)).size,
  }

  return (
    <div className="scr-showcase">
      <div className="bg-blueprint" aria-hidden="true" />

      {/* HERO + SEARCH */}
      <div className="hero">
        <h1>Доноры и запчасти <em>в одном месте</em></h1>
        <p>
          Разобранные телефоны на детали и отдельные комплектующие. Оригинал б/у с прослеживаемым
          происхождением — для мастеров, сервисов и розницы.
        </p>
        <div className="hero-stats">
          <div className="hero-stat"><div className="num">{fmt(stats.donors)}</div><div className="lbl">Доноров</div></div>
          <div className="hero-stat"><div className="num">{fmt(stats.parts)}</div><div className="lbl">Деталей</div></div>
          <div className="hero-stat"><div className="num">{fmt(stats.stock)}</div><div className="lbl">В наличии</div></div>
          <div className="hero-stat"><div className="num">{fmt(stats.sellers)}</div><div className="lbl">Продавцов</div></div>
        </div>
        <div className="hero-search">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Поиск по модели или детали: iPhone 16, дисплей, плата..."
            aria-label="Поиск по рынку"
          />
          <button className="btn btn-primary" onClick={() => document.getElementById('scr-donors')?.scrollIntoView({ behavior: 'smooth' })}>
            Найти
          </button>
        </div>
      </div>

      {/* ДОНОРЫ */}
      <div className="section" id="scr-donors">
        <div className="section-head">
          <div className="left">
            <h2><em>Доноры</em> на разбор</h2>
            <div className="sub">Каждый телефон — как набор деталей. Состав, цены и мини-развёртка.</div>
          </div>
          <div className="right">
            <div className="tabs">
              {DONOR_TABS.map((t) => (
                <button key={t.k} type="button" className={`tab ${donorTab === t.k ? 'active' : ''}`} onClick={() => setDonorTab(t.k)}>
                  {t.l}
                </button>
              ))}
            </div>
          </div>
        </div>
        {loading ? (
          <div className="scr-loading">Загрузка доноров…</div>
        ) : visibleDonors.length === 0 ? (
          <div className="scr-empty">Ничего не найдено. Попробуйте изменить поиск или фильтры.</div>
        ) : (
          <div className="donors-grid">
            {visibleDonors.map((d) => <DonorCard key={d.id} lot={d} />)}
          </div>
        )}
      </div>

      {/* ЗАПЧАСТИ ПОШТУЧНО */}
      <div className="section" id="scr-parts">
        <div className="section-head">
          <div className="left">
            <h2><em>Запчасти</em> поштучно</h2>
            <div className="sub">Дисплеи, шлейфы, аккумуляторы, платы — оригинал б/у и новое.</div>
          </div>
          <div className="right">
            <div className="tabs">
              {PART_TABS.map((t) => (
                <button key={t.k} type="button" className={`tab ${partCat === t.k ? 'active' : ''}`} onClick={() => setPartCat(t.k)}>
                  {t.l}
                </button>
              ))}
            </div>
          </div>
        </div>
        {loading ? (
          <div className="scr-loading">Загрузка запчастей…</div>
        ) : visibleParts.length === 0 ? (
          <div className="scr-empty">Деталей поштучно пока нет.</div>
        ) : (
          <div className="parts-grid">
            {visibleParts.map((p) => <PartCard key={p.id} p={p} />)}
          </div>
        )}
      </div>
    </div>
  )
}
