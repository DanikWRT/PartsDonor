import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../cart.jsx'
import { DonorExplodedMini, statusCls } from '../components/DonorExploded.jsx'

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

function partIcon(cat) {
  const c = String(cat || '').toLowerCase()
  if (c.includes('дисплей') || c.includes('screen') || c.includes('экран')) return '📱'
  if (c.includes('аккум') || c.includes('battery')) return '🔋'
  if (c.includes('плат') || c.includes('board')) return '🧩'
  if (c.includes('камер') || c.includes('camera')) return '📷'
  if (c.includes('шлейф') || c.includes('cable') || c.includes('кабел')) return '🔌'
  if (c.includes('корпус') || c.includes('housing')) return '📦'
  return '🔧'
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

function DonorBlueprint({ donor }) {
  const comps = donor.components || []
  if (comps.length === 0) {
    return (
      <div className="donor-blueprint">
        <GenericBlueprint n={donor.component_count || 0} />
      </div>
    )
  }
  return (
    <div className="scr-mini">
      <DonorExplodedMini components={comps} />
    </div>
  )
}

function DonorCard({ lot }) {
  const { add, has } = useCart()
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

      <DonorBlueprint donor={lot} />

      <div className="donor-condition">{lot.condition || 'Состояние не указано'}</div>

      {comps.length > 0 && (
        <div className="donor-composition">
          {comps.map((c, i) => {
            const si = slotInfo(c)
            const [pc, pl] = pill(statusCls(c.status))
            return (
              <div className="comp-row" key={`${c.slot || ''}-${c.part_id || i}`}>
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
}

function PartCard({ p }) {
  const { add, has } = useCart()
  const cls = p.in_stock ? 'in' : 'order'
  const stockLabel = p.in_stock ? 'В наличии' : 'Под заказ'
  const canAdd = p.listing_id != null && p.listing_price != null
  const inCart = canAdd && has(p.listing_id)

  return (
    <div className="part-card">
      <div className="part-preview">
        <span className={`part-status ${cls}`}>{stockLabel}</span>
        {p.code && <span className="part-code">{p.code}</span>}
        <span className="scr-part-icon">{partIcon(p.category)}</span>
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
}

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

  const categories = useMemo(() => {
    const seen = {}
    parts.forEach((p) => { if (p.category) seen[p.category] = 1 })
    return Object.keys(seen).sort()
  }, [parts])

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
    if (partCat !== 'all' && p.category !== partCat) return false
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
              <button type="button" className={`tab ${partCat === 'all' ? 'active' : ''}`} onClick={() => setPartCat('all')}>Все</button>
              {categories.map((c) => (
                <button key={c} type="button" className={`tab ${partCat === c ? 'active' : ''}`} onClick={() => setPartCat(c)}>{c}</button>
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
