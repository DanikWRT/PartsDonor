import React, { useState, useMemo, useEffect } from 'react'
import { authFetch } from '../auth.jsx'
import {
  ExplodedScheme,
  SLOT_META,
  statusText,
  SlotLayer,
} from './DonorExploded.jsx'

// =============================================================================
// FIX-EXPLODED: Развёртка донора 1-в-1 по эталону blueprint-exploded.
// Трёхколоночный чертёжный экран:
//   left   phone-zone   — blueprint-фрейм со штампом (ревизия, 1:1), чертёж
//                         контура смартфона с размерами (71.6 / 147.6 мм) и
//                         интерактивными зонами узлов + панель инструментов.
//   center parts-canvas — сетка/список компонентов (карточки со статусом).
//   right  right-col    — спецификация узлов (status-точки) + карточка детали.
//   bottom quick-bar    — плавающая панель быстрых действий.
// Связка: наведение/клик по узлу подсвечивает его везде и открывает деталь.
// =============================================================================

const SLOT_DEFS = {
  display:   { label: 'Дисплей',           sn: '001' },
  board:     { label: 'Материнская плата', sn: '002' },
  battery:   { label: 'Аккумулятор',       sn: '003' },
  camera:    { label: 'Камера',            sn: '004' },
  backcover: { label: 'Корпус',            sn: '005' },
}

// Статус-класс в терминах эталона: in-stock / order / none
function refStatus(comp) {
  const s = comp && comp.status
  if (s === 'sold' || s === 'hidden') return 'none'
  if (s === 'negotiated') return 'order'
  return 'in-stock'
}
function refStatusLabel(comp) {
  const r = refStatus(comp)
  if (r === 'order') return 'Под заказ'
  if (r === 'none') return 'Нет'
  return 'В наличии'
}
const DOT_MAP = { 'in-stock': 'green', order: 'yellow', none: 'red' }

const fmt = (n) => (n || 0).toLocaleString('ru-RU')

// Мини-превью узла для карточки (тёмный чертёжный как в эталоне).
function SlotPreview({ slot }) {
  const a = SLOT_META[slot]?.accent || '#4fa3ff'
  const w = 150
  return (
    <svg className="ex-preview-svg" viewBox="-90 -30 180 60" aria-hidden="true">
      <rect x={-w / 2} y={-12} width={w} height={24} rx={6} fill="rgba(120,160,220,.06)" stroke={a} strokeWidth="1.3" />
      {slot !== 'backcover' && slot !== 'display' && (
        <rect x={-w / 2 + 4} y={-8} width={w - 8} height={16} rx={3} fill="none" stroke={a} strokeWidth="0.7" strokeDasharray="4 3" opacity="0.5" />
      )}
      {slot === 'display' && (<>
        <rect x={-14} y={-22} width={28} height={44} rx={5} fill="rgba(30,58,95,.55)" stroke={a} strokeWidth="1" />
        <rect x={-4} y={-18} width={8} height={4} rx={1} fill="#05070b" />
        <circle cx={10} cy={-16} r={1.2} fill="#0a1c30" />
      </>)}
      {slot === 'backcover' && (<>
        <rect x={-10} y={-18} width={20} height={28} rx={6} fill="rgba(90,95,110,.35)" stroke={a} strokeWidth="1" />
        <circle cx={26} cy={-10} r={6} fill="#08090b" stroke="#3a3f47" />
      </>)}
      {slot === 'camera' && (<>
        <rect x={-22} y={-16} width={44} height={26} rx={7} fill="rgba(30,40,60,.5)" stroke={a} strokeWidth="1" />
        {[-10, 0, 10].map((dx) => <circle key={dx} cx={dx} cy={-3} r={6} fill="#08090b" stroke="#3a3f47" />)}
      </>)}
      {slot === 'board' && (<>
        <rect x={-20} y={-16} width={40} height={26} rx={3} fill="rgba(14,80,50,.4)" stroke={a} strokeWidth="1" />
        <text x={0} y={-3} textAnchor="middle" fontSize="7" fontWeight="700" fill="#c8cdd4">A15</text>
      </>)}
      {slot === 'battery' && (<>
        <rect x={-24} y={-14} width={48} height={22} rx={5} fill="rgba(40,45,55,.5)" stroke={a} strokeWidth="1" />
        <text x={-16} y={-2} fontSize="6" fill="#aeb4bc">Li-Polymer</text>
        <rect x={20} y={-6} width={8} height={12} rx={1} fill="#08090b" stroke="#3a3f47" />
      </>)}
      <g stroke={a} strokeWidth="0.7" fill="none" opacity="0.7">
        <circle cx={-48} cy={0} r={3.5} />
        <circle cx={48} cy={0} r={3.5} />
      </g>
    </svg>
  )
}

const isUnavailable = (c) => c.status === 'sold' || c.status === 'hidden'

// --- Карточка узла (в центре) ---
function PartThumb({ comp, index, active, onHover, onLeave, onClick }) {
  const def = SLOT_DEFS[comp.slot] || { label: comp.title, sn: String(index + 1).padStart(3, '0') }
  const sCls = refStatus(comp)
  const unavailable = isUnavailable(comp)
  return (
    <button
      type="button"
      className={`ex-thumb${active ? ' active' : ''}${unavailable ? ' unavailable' : ''}`}
      onMouseEnter={() => onHover(comp.slot)}
      onMouseLeave={onLeave}
      onClick={() => onClick(comp)}
      data-part={comp.slot}
    >
      <div className="ex-thumb-preview">
        <span className={`ex-thumb-status ${sCls}`}>{refStatusLabel(comp)}</span>
        <span className="ex-thumb-code">{def.sn}</span>
        <SlotPreview slot={comp.slot} />
      </div>
      <div className="ex-thumb-name">{def.label}</div>
      <div className="ex-thumb-meta">
        {comp.seller_name ? <span className="seller">🏪 <b>{comp.seller_name}</b></span> : null}
      </div>
      <div className="ex-thumb-bottom">
        <div className="ex-thumb-price">{unavailable ? '—' : `${fmt(comp.price_rub)} ₽`}</div>
        <div className="ex-thumb-stock">{unavailable ? 'нет' : statusText(comp.status)}</div>
      </div>
    </button>
  )
}

// Строка вида «Список» в центре
function PartRow({ comp, index, active, onHover, onLeave, onClick }) {
  const def = SLOT_DEFS[comp.slot] || { label: comp.title }
  const unavailable = isUnavailable(comp)
  return (
    <button
      type="button"
      className={`ex-row${active ? ' active' : ''}${unavailable ? ' unavailable' : ''}`}
      onMouseEnter={() => onHover(comp.slot)}
      onMouseLeave={onLeave}
      onClick={() => onClick(comp)}
    >
      <span className={`pl-dot ${DOT_MAP[refStatus(comp)]}`} />
      <span className="ex-row-name">{def.label}</span>
      <span className="ex-row-price">{unavailable ? '—' : `${fmt(comp.price_rub)} ₽`}</span>
    </button>
  )
}

// --- Правая колонка: спецификация (status-точки) ---
function SpecList({ components, active, onHover, onLeave, onClick }) {
  return (
    <div className="pl-list">
      {components.map((c, i) => {
        const def = SLOT_DEFS[c.slot] || { label: c.title, sn: '' }
        const sCls = refStatus(c)
        const unavailable = isUnavailable(c)
        return (
          <div
            key={c.slot}
            className={`pl-item${active === c.slot ? ' active' : ''}${unavailable ? ' unavailable' : ''}`}
            onMouseEnter={() => onHover(c.slot)}
            onMouseLeave={onLeave}
            onClick={() => onClick(c)}
            data-part={c.slot}
          >
            <span className={`pl-dot ${DOT_MAP[sCls]}`} />
            <span className="pl-name">{def.label}</span>
            <span className="pl-price">{unavailable ? '—' : `${fmt(c.price_rub)} ₽`}</span>
          </div>
        )
      })}
    </div>
  )
}

// Состояние детали -> текст спеки с цветовым классом.
function conditionText(comp) {
  const unavailable = isUnavailable(comp)
  if (unavailable) return { text: 'Нет предложений', cls: 'red' }
  const cond = comp.listing?.condition
  if (cond === 'passed' || cond === 'tested') return { text: 'Проверено', cls: 'green' }
  if (cond === 'untested') return { text: 'Не проверено', cls: 'yellow' }
  if (cond === 'no_guarantee') return { text: 'Без гарантии', cls: 'red' }
  return { text: 'Новое, оригинал', cls: 'green' }
}

function warrantyText(comp) {
  if (isUnavailable(comp)) return '—'
  if (comp.listing?.warranty === true) return '12 месяцев'
  if (comp.listing?.warranty === false) return 'Без гарантии'
  return '—'
}

// --- Карточка выбранной детали (справа снизу) ---
function DetailCard({ comp, index }) {
  const empty = (
    <div className="ex-panel-empty" id="panel-empty">
      <span className="emoji">📐</span>
      Наведите или кликните на узел<br />в чертеже или в списке
    </div>
  )
  if (!comp) return empty

  const def          = SLOT_DEFS[comp.slot] || { label: comp.title, sn: String(index + 1).padStart(3, '0') }
  const unavailable  = isUnavailable(comp)
  const price        = unavailable ? '—' : `${fmt(comp.price_rub)} ₽`

  const sellerName = comp.seller_name ?? comp.listing?.seller_name ?? 'Продавец'
  const rating = comp.listing?.seller_rating || 0
  const ratingText = rating ? String(rating).replace('.', ',') : '—'

  // statusNote (аналог «в наличии · 1 шт · Москва» из эталона)
  let statusNote
  if (unavailable)          statusNote = 'нет предложений'
  else if (refStatus(comp) === 'order') statusNote = 'под заказ · уточните цену'
  else                      statusNote = 'в наличии · 1 шт · Москва'

  const cond = conditionText(comp)

  if (unavailable) {
    // Деталь недоступна — мутная карточка, всегда реальная (не пустой экран).
    return (
      <div className="ex-detail-info active">
        <div className="dp-header">
          <div className="dp-thumb"><SlotPreview slot={comp.slot} /></div>
          <div>
            <div className="dp-title">{def.label}</div>
            <div className="dp-seller">🏪 {sellerName} · <span className="star">★</span> {ratingText}</div>
          </div>
        </div>
        <div>
          <div className="dp-price dp-price-muted">{price}</div>
          <div className="dp-note">{statusNote}</div>
        </div>
        <div className="dp-specs">
          <div className="dp-spec"><span className="k">Черт. №</span><span className="v muted">{def.sn}</span></div>
          <div className="dp-spec"><span className="k">Состояние</span><span className={`v ${cond.cls}`}>{cond.text}</span></div>
          <div className="dp-spec"><span className="k">Гарантия</span><span className="v muted">{warrantyText(comp)}</span></div>
        </div>
      </div>
    )
  }

  return (
    <div className="ex-detail-info active">
      <div className="dp-header">
        <div className="dp-thumb"><SlotPreview slot={comp.slot} /></div>
        <div>
          <div className="dp-title">{def.label}</div>
          <div className="dp-seller">🏪 {sellerName} · <span className="star">★</span> {ratingText}</div>
        </div>
      </div>
      <div>
        <div className="dp-price">{price}</div>
        <div className="dp-note">{statusNote}</div>
      </div>
      <div className="dp-specs">
        <div className="dp-spec"><span className="k">Черт. №</span><span className="v">{def.sn}</span></div>
        <div className="dp-spec"><span className="k">Состояние</span><span className={`v ${cond.cls}`}>{cond.text}</span></div>
        <div className="dp-spec"><span className="k">Гарантия</span><span className="v">{warrantyText(comp)}</span></div>
      </div>
      <div className="dp-actions">
        <button type="button" className="btn btn-primary">Купить сейчас</button>
        <button type="button" className="btn">Запросить цену</button>
      </div>
    </div>
  )
}

// =============================================================================
// BlueprintExploded — единый экран развёртки, общий для /donor и /donor-lot.
// =============================================================================
export default function BlueprintExploded({
  components = [],
  meta = {},
  detailExtra,
  back,
}) {
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [hoverSlot, setHoverSlot] = useState(null)
  const [view, setView] = useState('grid') // 'grid' | 'list'

  const sorted = useMemo(() => {
    return [...components].sort((a, b) => {
      const ay = (a.hotspot?.y != null) ? a.hotspot.y : 0
      const by = (b.hotspot?.y != null) ? b.hotspot.y : 0
      return ay - by
    })
  }, [components])

  const activeKey = hoverSlot || selectedSlot
  const selected = sorted.find((c) => c.slot === activeKey) || null
  const availableCount = sorted.filter((c) => !isUnavailable(c)).length

  // A) DEFAULT SELECT: как только компоненты есть и ничего не выбрано —
  //    выбираем первый доступный узел (та же сортировка, что в спецификации),
  //    чтобы правая колонка никогда не была пустой на загрузке.
  useEffect(() => {
    if (selectedSlot == null) {
      const first = sorted.find((c) => !isUnavailable(c))
      if (first) setSelectedSlot(first.slot)
    }
  }, [sorted, selectedSlot])

  return (
    <div className="ex-stage">
      {/* Hero: заголовок + метки как в эталоне */}
      <div className="ex-hero">
        {back}
        <div className="ex-hero-title">
          <h1>{(meta.brand || '')} {(meta.model || '')} — <em>технический чертёж разборки</em></h1>
        </div>
        <div className="ex-hero-meta">
          <div className="meta-chip"><b>{availableCount} / {sorted.length}</b> узлов доступно</div>
          <div className="meta-chip">Ревизия <b>{meta.revision || 'A2897'}</b></div>
          <div className="meta-chip">Донор <b>#{meta.donorPartId ?? '—'}</b></div>
          <div className="meta-chip">Масштаб <b>1:1</b></div>
        </div>
      </div>

      <div className="ex-stage-grid">
        {/* ============ ЛЕВО: чертёж ============ */}
        <div className="phone-zone">
          <div className="blueprint-frame">
            <div className="corner tl" /><div className="corner tr" />
            <div className="corner bl" /><div className="corner br" />
            <div className="blueprint-stamp">
              <div className="stamp-left">
                <span className="stamp-title">{(meta.model || 'МОДЕЛЬ')} · <b>РАЗБОРКА</b></span>
                <span className="stamp-sub">РЕВ. {meta.revision || 'A2897'} · 1:1</span>
              </div>
              <div className="stamp-code">
                <span className="big">{meta.revision || 'A2897'}</span>
                № {String(sorted.length).padStart(3, '0')}
              </div>
            </div>
            <div className="phone-drawing">
              <ExplodedScheme
                components={sorted}
                selectedKey={activeKey}
                onSelectedKey={(c) => setSelectedSlot(c.slot)}
                bgUrl={meta.explodedUrl}
              />
            </div>
          </div>
          <div className="phone-controls">
            <button type="button" className="ctrl-btn" title="Повернуть">⟲</button>
            <button type="button" className="ctrl-btn active" title="Рентген">👁</button>
            <button type="button" className="ctrl-btn" title="Разобрать">⚡</button>
            <div className="ctrl-divider" />
            <button type="button" className="ctrl-btn" title="Сравнить">⚖</button>
            <button type="button" className="ctrl-btn" title="Поделиться">↗</button>
          </div>
        </div>

        {/* ============ ЦЕНТР: карточки ============ */}
        <div className="parts-canvas">
          <div className="canvas-title">
            <h2>Компоненты чертежа · <b>{sorted.length} узлов</b></h2>
            <div className="view-toggle">
              <button type="button" className={`view-btn${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')}>Сетка</button>
              <button type="button" className={`view-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>Список</button>
            </div>
          </div>

          {view === 'grid' ? (
            <div className="thumbs-grid">
              {sorted.map((c, i) => (
                <PartThumb
                  key={c.slot}
                  comp={c}
                  index={i}
                  active={activeKey === c.slot}
                  onHover={setHoverSlot}
                  onLeave={() => setHoverSlot(null)}
                  onClick={(comp) => setSelectedSlot(comp.slot)}
                />
              ))}
            </div>
          ) : (
            <div className="ex-list-rows">
              {sorted.map((c, i) => (
                <PartRow key={c.slot} comp={c} index={i} active={activeKey === c.slot} onHover={setHoverSlot} onLeave={() => setHoverSlot(null)} onClick={(comp) => setSelectedSlot(comp.slot)} />
              ))}
            </div>
          )}
        </div>

        {/* ============ ПРАВО: спецификация + деталь ============ */}
        <div className="right-col">
          <div className="side-card">
            <div className="side-title">
              <h3>Спецификация узлов</h3>
              <span className="side-count">{availableCount} / {sorted.length}</span>
            </div>
            <SpecList
              components={sorted}
              active={activeKey}
              onHover={setHoverSlot}
              onLeave={() => setHoverSlot(null)}
              onClick={(comp) => setSelectedSlot(comp.slot)}
            />
          </div>
          <div className="side-card">
            <DetailCard comp={selected} index={sorted.findIndex((c) => c.slot === selected?.slot)} />
            {selected && detailExtra && detailExtra(selected)}
          </div>
        </div>
      </div>

      {/* ============ ПЛАВАЮЩАЯ ПАНЕЛЬ ============ */}
      <div className="quick-bar">
        <button type="button" className="qb-item"><span className="icon">🔍</span>Найти</button>
        <button type="button" className="qb-item highlight"><span className="icon">📦</span>Собрать комплект</button>
        <button type="button" className="qb-item"><span className="icon">🔔</span>Подписаться</button>
        <button type="button" className="qb-item"><span className="icon">📢</span>Заявка на донора</button>
        <div className="qb-divider" />
        <button type="button" className="qb-item"><span className="icon">📐</span>Скачать чертёж</button>
        <button type="button" className="qb-item"><span className="icon">⚡</span>Разобрать</button>
      </div>
    </div>
  )
}
