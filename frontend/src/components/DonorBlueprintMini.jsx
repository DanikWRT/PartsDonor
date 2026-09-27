import React from 'react'
import { statusCls } from './DonorExploded.jsx'

// =============================================================================
// FIX-CATALOG-REF03: мини-чертёж донора для карточки каталога (/ и Catalog.jsx).
// Эталон — ref 03-donors-parts.html: plastic-phone 340x240 по центру (rx=14),
// детали разнесены по окружности radius=90 вокруг центра 170,120, пунктирные
// выноски к центру, штамп «ДОНОР · N ДЕТАЛЕЙ». Карандашный feTurbulence-фильтр.
//
// API НЕ меняется: components/uId/hoverId/onHoverPart.
// Двусторонняя подсветка: hover по .comp-row -> круг на чертеже (.bp-part.active),
// hover по кругу -> строка в списке. Связь через c.part_id.
// Цветовая индикация: в наличии=бирюзовый неон, под заказ=янтарь, продано=красный,
// скрыто/отсутствует=полупрозрачно + серый.
// =============================================================================

function slotIcon(c) {
  const s = String(c?.slot || '').toLowerCase()
  if (s.includes('дисплей') || s.includes('display') || s.includes('экран')) return '📱'
  if (s.includes('плат') || s.includes('board')) return '🧩'
  if (s.includes('аккум') || s.includes('battery')) return '🔋'
  if (s.includes('камер') || s.includes('camera')) return '📷'
  if (s.includes('корпус') || s.includes('cover') || s.includes('back')) return '📦'
  if (s.includes('шлейф') || s.includes('cable') || s.includes('кабел')) return '🔌'
  return '🔧'
}

// Цвет круга по статусу детали (реюз partTint).
function partTint(status) {
  switch (statusCls(status)) {
    case 'negotiated': return { fill: 'rgba(251,191,36,.14)', stroke: 'rgba(251,191,36,.6)' }     // Под заказ — янтарный
    case 'sold':       return { fill: 'rgba(239,68,68,.14)',  stroke: 'rgba(239,68,68,.6)' }      // Продано — красный
    case 'grey':       return { fill: 'rgba(148,163,184,.08)', stroke: 'rgba(148,163,184,.35)' }  // Скрыто — серый
    default:           return { fill: 'rgba(124,247,208,.10)', stroke: 'rgba(124,247,208,.55)' }  // В наличии — бирюзовый неон
  }
}

function donorId(c) {
  return c?.part_id != null ? c.part_id : String(c.slot || '')
}

// Чертеж-«пластинка»: телефон по центру + детали по кругу (эталон 03).
function DonorBlueprintMini({ components = [], uId = 'db', hoverId = null, onHoverPart = () => {} }) {
  const comps = components.slice(0, 8) // держим чертёж читаемым
  const n = comps.length
  const pencil = `pencil-${uId}`

  return (
    <svg
      className="db-mini"
      viewBox="0 0 340 240"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Донор · ${n} деталей`}
    >
      <defs>
        <filter id={pencil} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>

      {/* корпус телефона по центру (карандашный фильтр, как в эталоне) */}
      <rect x="140" y="30" width="60" height="180" rx="14" fill="none" stroke="#b8c4d8" strokeWidth="1.2" filter={`url(#${pencil})`} opacity=".55" />
      <rect x="146" y="36" width="48" height="168" rx="10" fill="rgba(79,163,255,.06)" stroke="#4fa3ff" strokeWidth="0.6" opacity=".6" />

      {/* разнесённые детали вокруг телефона */}
      {comps.map((c, i) => {
        const id = donorId(c)
        const tint = partTint(c.status)
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2
        const radius = 90
        const cx = 170 + Math.cos(angle) * radius
        const cy = 120 + Math.sin(angle) * radius
        const active = hoverId != null && String(hoverId) === String(id)
        const unav = statusCls(c.status) === 'sold' || statusCls(c.status) === 'grey'

        return (
          <g
            key={`${id}-${i}`}
            className={`bp-part${active ? ' active' : ''}${unav ? ' unavailable' : ''}`}
            data-part={id}
            onMouseEnter={() => onHoverPart(id)}
            onMouseLeave={() => onHoverPart(null)}
          >
            {/* пунктирная выноска к центру */}
            <line x1="170" y1="120" x2={cx} y2={cy} stroke="#4fa3ff" strokeWidth="0.4" strokeDasharray="2 2" opacity=".35" />
            {/* круг детали с tint по статусу */}
            <circle className="bp-part-shape" cx={cx} cy={cy} r="14" fill={tint.fill} stroke={tint.stroke} strokeWidth="0.8" />
            <text x={cx} y={cy + 4} fontSize="11" textAnchor="middle" fill="#b8c4d8" style={{ pointerEvents: 'none' }}>{slotIcon(c)}</text>
          </g>
        )
      })}

      {/* штамп */}
      <text x="170" y="16" fontSize="7" fill="#4fa3ff" textAnchor="middle" fontFamily="monospace" letterSpacing="1">ДОНОР · {n} ДЕТАЛЕЙ</text>
    </svg>
  )
}

export default DonorBlueprintMini
