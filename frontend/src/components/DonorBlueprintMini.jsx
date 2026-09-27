import React from 'react'
import { statusCls } from './DonorExploded.jsx'

// =============================================================================
// FIX-CATALOG-BLUEPRINT: мини-чертёж донора для карточки каталога — 1-в-1 по
// эталону ref-parthub/03-donors-parts.html(.donor-blueprint).
// Вместо того чтобы сжимать большую вертикальную 3D-развёртку (DonorExplodedMini)
// в 260px (из-за чего слои/надписи превращались в нечитаемую кашу), рисуем
// специальный компактный чертёж: контур смартфона по центру (штамп «ДОНОР · N
// ДЕТАЛЕЙ» сверху) и детали в кружках, разнесённые вокруг по кругу (радиус 90,
// диаметр кружка 28). Цвет кружка зависит от статуса детали.
// Двусторонняя подсветка: hover по .comp-row подсвечивает кружок (#7cf7d0, glow);
// hover по кружку подсвечивает строку в списке.
// =============================================================================

const fmtIcon = { display: '📱', board: '🧩', battery: '🔋', camera: '📷', backcover: '📦' }

function slotKey(c) {
  const s = String(c?.slot || '').toLowerCase()
  if (s.includes('дисплей') || s.includes('display') || s.includes('экран')) return 'display'
  if (s.includes('плат') || s.includes('board')) return 'board'
  if (s.includes('аккум') || s.includes('battery')) return 'battery'
  if (s.includes('камер') || s.includes('camera')) return 'camera'
  if (s.includes('корпус') || s.includes('cover') || s.includes('back')) return 'backcover'
  return 'part'
}

// Цвет кружка по статусу детали (зависит от statusCls).
function partTint(status) {
  switch (statusCls(status)) {
    case 'negotiated': return { fill: 'rgba(251,191,36,.12)', stroke: 'rgba(251,191,36,.45)' }      // Под заказ — янтарный
    case 'sold':       return { fill: 'rgba(239,68,68,.12)',  stroke: 'rgba(239,68,68,.45)' }       // Продано — красный
    case 'grey':       return { fill: 'rgba(148,163,184,.10)', stroke: 'rgba(148,163,184,.30)' }    // Скрыто — серый
    default:           return { fill: 'rgba(79,163,255,.09)', stroke: 'rgba(120,160,220,.40)' }     // В наличии — синий
  }
}

function donorId(c) {
  return c?.part_id != null ? c.part_id : String(c.slot || '')
}

// Мини-чертёж донора (карточка на главной / в Catalog.jsx)
function DonorBlueprintMini({ components = [], uId = 'db', hoverId = null, onHoverPart = () => {} }) {
  const comps = components.slice(0, 8) // пунктирные линии к центру держим читаемыми
  const n = comps.length
  const pencil = `pencil-${uId}`
  return (
    <svg className="db-mini" viewBox="0 0 340 240" role="img" aria-label={`Донор · ${n} деталей`}>
      <defs>
        <filter id={pencil} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>

      {/* Штамп сверху */}
      <text x="170" y="16" fontSize="7" fill="#4fa3ff" textAnchor="middle" fontFamily="monospace" letterSpacing="1">ДОНОР · {n} ДЕТАЛЕЙ</text>

      {/* Контур смартфона по центру (пунктирный, карандашный фильтр) */}
      <rect x="140" y="30" width="60" height="180" rx="14" fill="none" stroke="#b8c4d8" strokeWidth="1.2" filter={`url(#${pencil})`} opacity=".55" />
      <rect x="146" y="36" width="48" height="168" rx="10" fill="rgba(79,163,255,.06)" stroke="#4fa3ff" strokeWidth="0.6" opacity=".6" />

      {/* Разнесённые детали вокруг по кругу */}
      {comps.map((c, i) => {
        const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
        const radius = 90
        const cx = 170 + Math.cos(angle) * radius
        const cy = 120 + Math.sin(angle) * radius
        const id = donorId(c)
        const tint = partTint(c.status)
        const icon = c.slot && fmtIcon[slotKey(c)] ? fmtIcon[slotKey(c)] : '🔧'
        const active = hoverId != null && String(hoverId) === String(id)
        return (
          <g
            key={`${id}-${i}`}
            className={`bp-part${active ? ' active' : ''}`}
            data-part={id}
            onMouseEnter={() => onHoverPart(id)}
            onMouseLeave={() => onHoverPart(null)}
          >
            <line x1="170" y1="120" x2={cx} y2={cy} stroke="#4fa3ff" strokeWidth="0.4" strokeDasharray="2 2" opacity=".35" />
            <circle className="bp-part-shape" cx={cx} cy={cy} r="14" fill={tint.fill} stroke={tint.stroke} strokeWidth="0.8" />
            <text x={cx} y={cy + 3} fontSize="11" textAnchor="middle" fill="#b8c4d8" style={{ pointerEvents: 'none' }}>{icon}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default DonorBlueprintMini
