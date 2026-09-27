import React from 'react'
import { statusCls } from './DonorExploded.jsx'

// =============================================================================
// FIX-REAL-BLUEPRINT: мини-чертёж донора для карточки каталога (/ и Catalog.jsx).
// Замена «кружков вокруг телефона» на НАСТОЯЩИЙ инженерный чертёж анатомии
// смартфона: узлы рисуются строго на своих физических местах ВНУТРИ контура
// телефона, один-в-один по эталонным координатам (ref 02-add-donor.html,
// viewBox 300x560). Карандашный feTurbulence-фильтр, штриховка недоступных
// деталей, размерные линии 71.6мм/147.6мм, штамп «ДОНОР · N ДЕТАЛЕЙ» сверху.
//
// API НЕ меняется: components/uId/hoverId/onHoverPart.
// Двусторонняя подсветка: hover по .comp-row -> узел на чертеже (связь через
// c.part_id), hover по узлу -> строка в списке.
// Цветовая индикация: в наличии=бирюзовый неон, под заказ=янтарь, продано=красный,
// скрыто/отсутствует=полупрозрачно + штриховка (hatch).
// =============================================================================

const fmtIcon = { display: '📱', board: '🧩', battery: '🔋', camera: '📷', backcover: '📦' }

// Маппинг цириллического slot -> категория узла (реюз существующего метода).
function slotKey(c) {
  const s = String(c?.slot || '').toLowerCase()
  if (s.includes('дисплей') || s.includes('display') || s.includes('экран')) return 'display'
  if (s.includes('плат') || s.includes('board')) return 'board'
  if (s.includes('аккум') || s.includes('battery')) return 'battery'
  if (s.includes('камер') || s.includes('camera')) return 'camera'
  if (s.includes('корпус') || s.includes('cover') || s.includes('back')) return 'backcover'
  return 'part'
}

// Цвет узла по статусу детали (реюз partTint из старой версии).
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

// ---- Геометрия физических узлов (эталон 02-add-donor.html, viewBox 300x560) ----
function zoneGeometry(slot) {
  switch (slot) {
    case 'display': // Дисплей (весь экран) + динамик сверху
      return { bbox: { x: 14, y: 14, w: 272, h: 532, rx: 44 } }
    case 'board': // L-образная плата
      return { bbox: { x: 33, y: 53, w: 99, h: 164, rx: 8 } }
    case 'camera': // Камера
      return { bbox: { x: 160, y: 55, w: 105, h: 105, rx: 22 } }
    case 'battery': // Аккумулятор
      return { bbox: { x: 35, y: 250, w: 230, h: 160, rx: 12 } }
    case 'backcover': // Корпус/задняя панель (вся внутренняя область)
      return { bbox: { x: 24, y: 24, w: 252, h: 512, rx: 38 } }
    default: // Бузер/катушка/нижний модуль
      return { bbox: { x: 158, y: 428, w: 110, h: 74, rx: 12 } }
  }
}

// Рисуем инженерную «начинку» каждого узла (без внешней заливки — она накладывается ниже).
function zoneDetails(slot, idf) {
  switch (slot) {
    case 'display':
      return (
        <>
          {/* динамик верхний */}
          <g className="sketch-detail">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <line key={i} x1={132 + i * 11} y1={34} x2={132 + i * 11} y2={43} stroke="#b8c4d8" strokeWidth="0.6" opacity=".7" />
            ))}
          </g>
          {/* изгибы стекла по углам */}
          <g className="sketch-detail" stroke="#b8c4d8" strokeWidth="0.4" fill="none" opacity=".4">
            <rect x="34" y="42" width="232" height="496" rx="26" strokeDasharray="3 4" />
          </g>
        </>
      )
    case 'board':
      return (
        <g className="sketch-detail">
          <rect x={50} y={70} width={34} height={30} fill="none" stroke="#b8c4d8" strokeWidth="0.5" />
          <text x={67} y={88} fontSize="6" fill="#8a98b0" textAnchor="middle" fontFamily="monospace" letterSpacing=".5">A18</text>
          <rect x={90} y={70} width={30} height={22} fill="none" stroke="#b8c4d8" strokeWidth="0.4" />
          <rect x={50} y={108} width={44} height={30} fill="none" stroke="#b8c4d8" strokeWidth="0.4" />
          <rect x={100} y={108} width={24} height={24} fill="none" stroke="#b8c4d8" strokeWidth="0.4" />
          {/* дорожки */}
          <path d="M 70 144 L 124 144" fill="none" stroke="#b8c4d8" strokeWidth="0.3" opacity=".5" />
          <path d="M 50 178 L 96 178 L 96 200" fill="none" stroke="#b8c4d8" strokeWidth="0.3" opacity=".5" />
        </g>
      )
    case 'camera':
      return (
        <g className="sketch-detail">
          <rect x={168} y={63} width={89} height={89} rx={16} fill="none" stroke="#b8c4d8" strokeWidth="0.4" opacity=".5" />
          <circle cx={196} cy={85} r={12} fill="none" stroke="#b8c4d8" strokeWidth="0.6" />
          <circle cx={230} cy={86} r={12} fill="none" stroke="#b8c4d8" strokeWidth="0.6" />
          <circle cx={213} cy={124} r={13} fill="none" stroke="#b8c4d8" strokeWidth="0.6" />
          <circle cx={196} cy={85} r={4.5} fill="#b8c4d8" opacity=".55" />
          <circle cx={230} cy={86} r={4.5} fill="#b8c4d8" opacity=".55" />
          <circle cx={213} cy={124} r={5} fill="#b8c4d8" opacity=".55" />
          <circle cx={252} cy={72} r={3} fill="#b8c4d8" opacity=".6" />
        </g>
      )
    case 'battery':
      return (
        <g className="sketch-detail">
          <text x={52} y={292} fontSize="7" fill="#8a98b0" fontFamily="monospace" letterSpacing="1.5">APPLE Li-ion</text>
          <text x={52} y={304} fontSize="5.5" fill="#6a7a94" fontFamily="monospace" letterSpacing="1">3561 mAh · 3.87V</text>
          <g stroke="#b8c4d8" strokeWidth="0.4" opacity=".5">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((i) => (
              <line key={i} x1={52 + i * 8} y1={316} x2={52 + i * 8} y2={388} />
            ))}
          </g>
          {/* контактная площадка */}
          <rect x={228} y={330} width={14} height={20} fill="none" stroke="#b8c4d8" strokeWidth="0.5" />
        </g>
      )
    case 'backcover':
      return (
        <g className="sketch-detail">
          <rect x={40} y={40} width={220} height={480} rx={30} fill="none" stroke="#b8c4d8" strokeWidth="0.35" opacity=".35" />
          <text x={150} y={300} fontSize="7" fill="#8a98b0" textAnchor="middle" fontFamily="monospace" letterSpacing="2" opacity=".7">REAR PANEL</text>
        </g>
      )
    default:
      return (
        <g className="sketch-detail">
          <rect x={168} y={436} width={40} height={54} rx={6} fill="none" stroke="#b8c4d8" strokeWidth="0.4" />
          <circle cx={188} cy={463} r={7} fill="none" stroke="#b8c4d8" strokeWidth="0.5" />
          <rect x={216} y={436} width={36} height={54} rx={6} fill="none" stroke="#b8c4d8" strokeWidth="0.4" />
          <circle cx={234} cy={463} r={10} fill="none" stroke="#b8c4d8" strokeWidth="0.5" />
          <path d="M 174 452 H 204 M 174 458 H 204" stroke="#b8c4d8" strokeWidth="0.4" opacity=".6" />
        </g>
      )
  }
}

// Мини-чертёж донора (карточка на главной / в Catalog.jsx)
function DonorBlueprintMini({ components = [], uId = 'db', hoverId = null, onHoverPart = () => {} }) {
  const comps = components.slice(0, 6) // держим чертёж читаемым
  const n = comps.length
  const pencil = `pencil-${uId}`
  const hatch = `hatch-${uId}`

  return (
    <svg className="db-mini" viewBox="0 0 300 560" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Донор · ${n} деталей`}>
      <defs>
        <filter id={pencil} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#6a7a94" strokeWidth="0.6" opacity=".55" />
        </pattern>
      </defs>

      {/* Штамп + размерная линия 71.6 mm сверху */}
      <text x="150" y="5" fontSize="6.5" fill="#4fa3ff" textAnchor="middle" fontFamily="monospace" letterSpacing="1">ДОНОР · {n} ДЕТАЛЕЙ</text>
      <line x1="15" y1="11" x2="285" y2="11" stroke="#4fa3ff" strokeWidth="0.5" opacity=".6" />
      <line x1="15" y1="8" x2="15" y2="14" stroke="#4fa3ff" strokeWidth="0.5" opacity=".6" />
      <line x1="285" y1="8" x2="285" y2="14" stroke="#4fa3ff" strokeWidth="0.5" opacity=".6" />
      <text x="150" y="9" fontSize="6" fill="#4fa3ff" textAnchor="middle" fontFamily="monospace">71.6 mm</text>

      {/* Внешний контур смартфона (карандашный фильтр, как в эталоне) */}
      <rect x="15" y="15" width="270" height="530" rx="42" fill="none" stroke="#b8c4d8" strokeWidth="1.3" filter={`url(#${pencil})`} opacity=".8" />
      {/* внутренний тонкий контур */}
      <rect x="22" y="22" width="256" height="516" rx="36" fill="none" stroke="#8a98b0" strokeWidth="0.5" opacity=".3" />

      {/* Кнопки по бокам (Power справа, громкость слева) */}
      <rect x="285" y="215" width="5" height="62" rx="1" fill="#b8c4d8" opacity=".45" />
      <rect x="10" y="200" width="5" height="72" rx="1" fill="#b8c4d8" opacity=".45" />

      {/* Размерная линия 147.6 mm (справа, вертикально) */}
      <line x1="294" y1="20" x2="294" y2="540" stroke="#4fa3ff" strokeWidth="0.5" opacity=".5" />
      <line x1="291" y1="20" x2="297" y2="20" stroke="#4fa3ff" strokeWidth="0.5" opacity=".5" />
      <line x1="291" y1="540" x2="297" y2="540" stroke="#4fa3ff" strokeWidth="0.5" opacity=".5" />
      <text x="297" y="280" fontSize="6" fill="#4fa3ff" fontFamily="monospace" textAnchor="start" transform="rotate(90 297 280)">147.6 mm</text>

      {/* Отрисовка только тех узлов, что есть у донора */}
      {comps.map((c, i) => {
        const slot = slotKey(c)
        const id = donorId(c)
        const tint = partTint(c.status)
        const geo = zoneGeometry(slot)
        const unav = statusCls(c.status) === 'sold' || statusCls(c.status) === 'grey'
        const active = hoverId != null && String(hoverId) === String(id)
        const bb = geo.bbox
        const icon = c.slot && fmtIcon[slot] ? fmtIcon[slot] : '🔧'

        return (
          <g
            key={`${id}-${i}`}
            className={`bp-part${active ? ' active' : ''}${unav ? ' unavailable' : ''}`}
            data-part={id}
            onMouseEnter={() => onHoverPart(id)}
            onMouseLeave={() => onHoverPart(null)}
          >
            {/* Узел: стенка-заливка + контур (status tint) */}
            <g className="bp-shape">
              <rect x={bb.x} y={bb.y} width={bb.w} height={bb.h} rx={bb.rx}
                fill={tint.fill} stroke={tint.stroke} strokeWidth="0.8" />
              {/* штриховка для недоступных/скрытых */}
              {unav && (
                <rect x={bb.x} y={bb.y} width={bb.w} height={bb.h} rx={bb.rx} fill={`url(#${hatch})`} opacity=".5" />
              )}
              {zoneDetails(slot, `${uId}-${i}`)}
            </g>
            {/* Зона-hover (подсветка при наведении и со строки) */}
            <rect className="part-hover" x={bb.x} y={bb.y} width={bb.w} height={bb.h} rx={bb.rx} />
            {/* Иконка категории в углу узла */}
            <text x={bb.x + 8} y={bb.y + bb.h - 6} fontSize="9" fill="#b8c4d8" opacity=".8" style={{ pointerEvents: 'none' }}>{icon}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default DonorBlueprintMini
