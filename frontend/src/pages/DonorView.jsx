import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { authFetch } from '../auth.jsx'

// Развёртка телефона (exploded view) + список запчастей.
// Данные: GET /api/donor/{brand}/{model} →
//   { brand, model, exploded_view_url, components:[{slot,title,price_rub,status,hotspot:{x,y}}] }
// Координаты слотов (hotspot.x / hotspot.y, 0..1) приходят из device_schema.
// Статус листинга: active / negotiated / sold / hidden.

// Мета слота: подпись + акцентный цвет слоя на схеме.
const SLOT_META = {
  display:   { label: 'Дисплей',       accent: '#38bdf8' },
  board:     { label: 'Материнская плата', accent: '#a78bfa' },
  battery:   { label: 'Аккумулятор',   accent: '#34d399' },
  camera:    { label: 'Камера',        accent: '#fbbf24' },
  backcover: { label: 'Корпус',        accent: '#94a3b8' },
}

// Статус → класс легенды (цвет точки).
//   зелёный  = в наличии (active)
//   красный  = продано (sold)
//   серый    = прочее: забронировано / скрыто / есть фото (negotiated, hidden, "")

function statusCls(status) {
  if (status === 'sold') return 'sold'
  if (status === 'active' || !status) return 'in'
  return 'grey'
}
function statusText(status) {
  if (status === 'sold') return 'Продано'
  if (status === 'negotiated') return 'Забронировано'
  if (status === 'hidden') return 'Скрыто'
  return 'В наличии'
}

// --- Детализированные слои развёртки (каждый со своей геометрией) ---
// Каждый компонент — реалистичная псевдо-3D запчасть: многослойные градиенты,
// блики, толщина кромки, отражения и мягкая drop-shadow под слоем.

// Общая тень под слоем (feDropShadow: blur + вертикальный сдвиг) — объём по глубине.
function ShadowDef({ id }) {
  return (
    <filter id={id} x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="11" stdDeviation="10" floodColor="#000000" floodOpacity="0.78" />
      <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#000000" floodOpacity="0.55" />
    </filter>
  )
}

// Слой «Дисплей» — стекло с бликом, чёлкой, фронталкой и рамкой.
function DisplayLayer({ w, accent, uid }) {
  const p = uid
  return (
    <g>
      <defs>
        <ShadowDef id={`${p}-sh`} />
        <linearGradient id={`${p}-frame`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#575d68" />
          <stop offset="0.5" stopColor="#23262d" />
          <stop offset="1" stopColor="#0b0c10" />
        </linearGradient>
        <linearGradient id={`${p}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#27496a" />
          <stop offset="0.45" stopColor="#0f1a2c" />
          <stop offset="1" stopColor="#04070c" />
        </linearGradient>
        <radialGradient id={`${p}-screen`} cx="0.5" cy="0.35" r="0.85">
          <stop offset="0" stopColor="#31608f" />
          <stop offset="1" stopColor="#0a1526" />
        </radialGradient>
        <linearGradient id={`${p}-glint`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.5)" />
          <stop offset="0.5" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id={`${p}-side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#171a20" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
      </defs>
      <g filter={`url(#${p}-sh)`}>
        {/* толщина (extrusion): тёмная боковая грань под рамкой */}
        <rect x={-w / 2 + 6} y={-13 + 8} width={w} height={26} rx={9} fill={`url(#${p}-side)`} />
        {/* рамка (bezel) */}
        <rect x={-w / 2} y={-13} width={w} height={26} rx={9} fill={`url(#${p}-frame)`} />
        {/* стекло */}
        <rect x={-w / 2 + 2.5} y={-10.5} width={w - 5} height={21} rx={7} fill={`url(#${p}-glass)`} />
        {/* экран */}
        <rect x={-w / 2 + 5} y={-8} width={w - 10} height={16} rx={5} fill={`url(#${p}-screen)`} />
        {/* чёлка */}
        <rect x={w / 2 - 32} y={-12} width={22} height={6} rx={3} fill="#05070b" />
        <circle cx={w / 2 - 20} cy={-9} r={1.7} fill="#0a1c30" stroke="#3a5f8c" strokeWidth="0.5" />
        {/* диагональный блик стекла */}
        <polygon
          points={`${-w / 2 + 8},-10 ${-w / 2 + 42},-10 ${-w / 2 + 20},10 ${-w / 2 - 10},10`}
          fill={`url(#${p}-glint)`} opacity="0.5"
        />
        {/* нижний индикатор */}
        <rect x={-8} y={4} width={16} height={1.6} rx={0.8} fill="rgba(255,255,255,0.35)" />
      </g>
    </g>
  )
}

// Слой «Плата» — зелёная PCB с золотыми контактами, чипом A15 и дорожками.
function BoardLayer({ w, accent, uid }) {
  const p = uid
  return (
    <g>
      <defs>
        <ShadowDef id={`${p}-sh`} />
        <linearGradient id={`${p}-pcb`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e422d" />
          <stop offset="0.5" stopColor="#0f2a1c" />
          <stop offset="1" stopColor="#06130c" />
        </linearGradient>
        <linearGradient id={`${p}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7d774" />
          <stop offset="1" stopColor="#b8860b" />
        </linearGradient>
        <linearGradient id={`${p}-chip`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2c313a" />
          <stop offset="1" stopColor="#0b0c0f" />
        </linearGradient>
        <linearGradient id={`${p}-side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d1a12" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
      </defs>
      <g filter={`url(#${p}-sh)`}>
        {/* толщина PCB: край-обрез со слоями */}
        <rect x={-w / 2 + 6} y={-17 + 8} width={w} height={34} rx={4} fill={`url(#${p}-side)`} />
        <rect x={-w / 2} y={-17} width={w} height={34} rx={4} fill={`url(#${p}-pcb)`} stroke="#122b1d" strokeWidth="0.6" />
        {/* дорожки */}
        <path d={`M ${-w / 2 + 8} -8 H ${-w / 2 + 30} V -2 H ${-w / 2 + 52}`} fill="none" stroke="#2f8f5f" strokeWidth="0.8" opacity="0.7" />
        <path d={`M ${-w / 2 + 8} 4 H ${-w / 2 + 28} V 10 H ${-w / 2 + 60}`} fill="none" stroke="#2f8f5f" strokeWidth="0.8" opacity="0.7" />
        <path d={`M ${-w / 2 + 70} -14 V 2 H ${-w / 2 + 40}`} fill="none" stroke="#2f8f5f" strokeWidth="0.7" opacity="0.5" />
        {/* чип A15 */}
        <g transform={`translate(${-w * 0.18} -2)`}>
          <rect x={-9} y={-9} width={18} height={18} rx={2} fill={`url(#${p}-chip)`} stroke="#3a3f47" strokeWidth="0.5" />
          <text x={0} y={3} textAnchor="middle" fontSize="5" fontWeight="700" fill="#c8cdd4" fontFamily="inherit">A15</text>
        </g>
        {/* золотые контакты */}
        {[-w * 0.1, -w * 0.06, -w * 0.02, w * 0.02, w * 0.06, w * 0.1].map((dx) => (
          <rect key={dx} x={dx - 1.5} y={10} width={3} height={5} rx={0.5} fill={`url(#${p}-gold)`} />
        ))}
        {/* разъём аккумулятора */}
        <rect x={-w / 2 + 5} y={-13} width={6} height={11} rx={1} fill="#7cc4ea" />
        <rect x={-w / 2 + 5} y={-13} width={6} height={3} rx={1} fill="#a9dff7" opacity="0.7" />
      </g>
    </g>
  )
}

// Слой «Аккумулятор» — литий-полимерная плашка с маркировкой, контактом и штрих-кодом.
function BatteryLayer({ w, accent, uid }) {
  const p = uid
  return (
    <g>
      <defs>
        <ShadowDef id={`${p}-sh`} />
        <linearGradient id={`${p}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b414b" />
          <stop offset="0.45" stopColor="#181b20" />
          <stop offset="1" stopColor="#08090b" />
        </linearGradient>
        <linearGradient id={`${p}-wrap`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.2)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id={`${p}-side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1d23" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
        <linearGradient id={`${p}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7d774" />
          <stop offset="1" stopColor="#b8860b" />
        </linearGradient>
      </defs>
      <g filter={`url(#${p}-sh)`}>
        {/* плотная толщина АКБ: чёрный брусок со скруглённой кромкой */}
        <rect x={-w / 2 + 6} y={-15 + 10} width={w} height={30} rx={8} fill={`url(#${p}-side)`} />
        <rect x={-w / 2} y={-15} width={w} height={30} rx={8} fill={`url(#${p}-body)`} />
        <rect x={-w / 2} y={-15} width={w} height={30} rx={8} fill={`url(#${p}-wrap)`} />
        {/* терминал */}
        <rect x={w / 2 - 11} y={-7} width={7} height={14} rx={1} fill="#1a1c20" stroke="#3a3f47" strokeWidth="0.5" />
        <rect x={w / 2 - 10} y={-4} width={2} height={8} fill={`url(#${p}-gold)`} />
        {/* маркировка */}
        <text x={-w / 2 + 10} y={-2} fontSize="7" fontWeight="700" fill="#aeb4bc" fontFamily="inherit">Li-Polymer</text>
        <text x={-w / 2 + 10} y={6} fontSize="6" fill="#7c828b" fontFamily="inherit">3.87V · 3095 mAh</text>
        {/* штрих-код */}
        <g transform={`translate(${w / 2 - 26} -6)`} stroke="#555b63" strokeWidth="0.6" opacity="0.65">
          <line x1="0" y1="0" x2="0" y2="12" />
          <line x1="2.5" y1="0" x2="2.5" y2="12" />
          <line x1="5.5" y1="0" x2="5.5" y2="12" />
          <line x1="8" y1="0" x2="8" y2="12" />
          <line x1="10.5" y1="0" x2="10.5" y2="12" />
        </g>
      </g>
    </g>
  )
}

// Слой «Камера» — модуль с тремя стеклянными линзами и вспышкой.
function CameraLayer({ w, accent, uid }) {
  const p = uid
  const lensX = [-w * 0.16, 0, w * 0.16]
  return (
    <g>
      <defs>
        <ShadowDef id={`${p}-sh`} />
        <linearGradient id={`${p}-base`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2e34" />
          <stop offset="1" stopColor="#0b0c0e" />
        </linearGradient>
        <radialGradient id={`${p}-lens`} cx="0.4" cy="0.4" r="0.9">
          <stop offset="0" stopColor="#2b5f8c" />
          <stop offset="0.5" stopColor="#0d1c30" />
          <stop offset="1" stopColor="#05070a" />
        </radialGradient>
        <radialGradient id={`${p}-glint`} cx="0.35" cy="0.35" r="0.3">
          <stop offset="0" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <linearGradient id={`${p}-side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15171c" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
      </defs>
      <g filter={`url(#${p}-sh)`}>
        {/* толщина модуля камеры */}
        <rect x={-w * 0.38 + 6} y={-13 + 8} width={w * 0.76} height={26} rx={7} fill={`url(#${p}-side)`} />
        <rect x={-w * 0.38} y={-13} width={w * 0.76} height={26} rx={7} fill={`url(#${p}-base)`} stroke="#3a3f47" strokeWidth="0.5" />
        {lensX.map((dx, idx) => (
          <g key={idx} transform={`translate(${dx} -1)`}>
            <circle r={7} fill="#08090b" stroke="#3a3f47" strokeWidth="1" />
            <circle r={5.5} fill={`url(#${p}-lens)`} />
            <circle r={2.4} fill="#04060a" />
            <circle r={1.1} fill={`url(#${p}-glint)`} />
          </g>
        ))}
        {/* вспышка */}
        <circle cx={w * 0.22} cy={-6} r={2.6} fill="#f0e1ba" />
        <circle cx={w * 0.22} cy={-6} r={1.3} fill="#fff8e8" />
      </g>
    </g>
  )
}

// Слой «Корпус» — задник телефона с вырезом (бампом) камеры и текстом Apple.
function BackcoverLayer({ w, accent, uid }) {
  const p = uid
  return (
    <g>
      <defs>
        <ShadowDef id={`${p}-sh`} />
        <linearGradient id={`${p}-cover`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#404a58" />
          <stop offset="0.5" stopColor="#191d24" />
          <stop offset="1" stopColor="#0a0b0e" />
        </linearGradient>
        <linearGradient id={`${p}-bump`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2e323a" />
          <stop offset="1" stopColor="#0d0e12" />
        </linearGradient>
        <radialGradient id={`${p}-lens`} cx="0.4" cy="0.4" r="0.9">
          <stop offset="0" stopColor="#2b5f8c" />
          <stop offset="1" stopColor="#05070a" />
        </radialGradient>
        <linearGradient id={`${p}-side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16191f" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
      </defs>
      <g filter={`url(#${p}-sh)`}>
        {/* толщина корпуса: заметная боковая рамка */}
        <rect x={-w / 2 + 6} y={-15 + 8} width={w} height={30} rx={10} fill={`url(#${p}-side)`} />
        <rect x={-w / 2} y={-15} width={w} height={30} rx={10} fill={`url(#${p}-cover)`} />
        {/* бамп камеры */}
        <rect x={w / 4 - 14} y={-12} width={52} height={18} rx={5} fill={`url(#${p}-bump)`} stroke="#454b55" strokeWidth="0.5" />
        {[-6, 2, 10].map((dx) => (
          <g key={dx} transform={`translate(${w / 4 + dx} -5)`}>
            <circle r={4.2} fill="#08090b" stroke="#3a3f47" strokeWidth="0.8" />
            <circle r={3} fill={`url(#${p}-lens)`} />
            <circle r={1} fill="rgba(255,255,255,0.5)" />
          </g>
        ))}
        {/* текст Apple */}
        <text x={-w / 2 + 10} y={8} fontSize="6" fontWeight="600" fill="#7c828b" fontFamily="inherit" letterSpacing="1.5">Apple</text>
        {/* блик корпуса */}
        <rect x={-w / 2 + 6} y={-13} width={w * 0.3} height={26} rx={10} fill="rgba(255,255,255,0.05)" />
      </g>
    </g>
  )
}

// Рисунок слоя по типу слота.
function SlotLayer({ slot, w, skew }) {
  const uid = `lyr-${slot}`
  const a = SLOT_META[slot]?.accent || '#94a3b8'
  const inner = (() => {
    switch (slot) {
      case 'display': return <DisplayLayer w={w} accent={a} uid={uid} />
      case 'board': return <BoardLayer w={w} accent={a} uid={uid} />
      case 'battery': return <BatteryLayer w={w} accent={a} uid={uid} />
      case 'camera': return <CameraLayer w={w} accent={a} uid={uid} />
      case 'backcover': return <BackcoverLayer w={w} accent={a} uid={uid} />
      default: return <rect x={-w / 2} y={-10} width={w} height={20} rx="6" fill="#2c2c2e" />
    }
  })()
  // Ощутимая перспектива: наклон внутреннего <g> детали (skewX ±10 + rotate ±4) — объём в 3/4.
  // Координаты/клики кнопки не затрагиваются: трансформируется только деталь.
  return skew ? <g transform={`skewX(${skew}) rotate(${skew * 0.4})`}>{inner}</g> : inner
}
// Разделённая по слоям схема (exploded view).
const VIEW_W = 300, VIEW_H = 460, PAD = 26, LYR_W = 210

// F7: нормализация длинного слота/названия в короткий ключ геометрии слоя.
function normalizeSlot(raw) {
  const s = String(raw || '')
  if (s.includes('Дисплей')) return 'display'
  if (s.includes('Материнск') || s.includes('Плата')) return 'board'
  if (s.includes('Аккумулятор')) return 'battery'
  if (s.includes('Камера')) return 'camera'
  if (s.includes('Корпус')) return 'backcover'
  return null // fallback: generic rect (SlotLayer default)
}

function ExplodedScheme({ components, onSelectedKey, selectedKey, onSelect, bgUrl }) {
  // (exploded_view_url оставлен в API/коде, но визуально мы используем чистую
  // изометрическую развёртку на студийном фоне — она читается как объём, а не
  // как случайное фото под слоями.)

  // F7: компоненты приходят уже с нормализованным slot (short key) из DonorView.
  const sorted = [...components].sort((a, b) => (a.hotspot?.y ?? 0.5) - (b.hotspot?.y ?? 0.5))
  const cx = VIEW_W / 2
  const yOf = (c) => PAD + (c.hotspot?.y ?? 0.5) * (VIEW_H - 2 * PAD)
  const top = yOf(sorted[0]) - 40
  const bottom = yOf(sorted[sorted.length - 1]) + 40
  const dotCls = (c) => statusCls(c.status)

  const tilt = (i) => (i - (sorted.length - 1) / 2) * 7
  const pctX = (c, i) => (((c.hotspot?.x ?? 0.5) * VIEW_W + tilt(i)) / VIEW_W) * 100
  const pctY = (c) => (yOf(c) / VIEW_H) * 100

  return (
    <div className="pd-blowup" role="img" aria-label="Разнесённый вид телефона">
      <svg
        className="pd-bg-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <ExplosionAxis cx={cx} top={top} bottom={bottom} />
      </svg>

      {sorted.map((c, i) => {
        const isSel = c.slot === selectedKey
        const layerW = (LYR_W / VIEW_W) * 100
        const persp = (i - (sorted.length - 1) / 2) * 5
        return (
          <button
            key={`${c.slot}-${c.part_id ?? i}`}
            type="button"
            className={`pd-layer-btn ${isSel ? 'selected' : ''}`}
            style={{ left: `${pctX(c, i)}%`, top: `${pctY(c)}%`, width: `${layerW}%` }}
            onClick={() => onSelect(c)}
            aria-pressed={isSel}
            title={c.title || SLOT_META[c.slot]?.label}
          >
            <svg viewBox={`${-LYR_W / 2 - 12} ${-30} ${LYR_W + 24} 60`} className="pd-layer-svg" preserveAspectRatio="none">
              <SlotLayer slot={c.slot} w={LYR_W} skew={persp} />
            </svg>
            <span className={`pd-layer-tag ${dotCls(c)}`}>
              {SLOT_META[c.slot]?.label || c.title || c.slot}
            </span>
            <span className={`pd-dot ${dotCls(c)}`} />
          </button>
        )
      })}

      <div className="pd-legend">
        <span><i className="dot in" /> в наличии</span>
        <span><i className="dot sold" /> продано</span>
        <span><i className="dot grey" /> фото/статус</span>
      </div>
    </div>
  )
}

// F7: панель детали (деталь) — right side panel (desktop) / bottom sheet (mobile).
const STATUS_OPTIONS = [
  { value: 'active', label: 'В наличии' },
  { value: 'negotiated', label: 'Забронировано' },
  { value: 'sold', label: 'Продано' },
]

function DetailPanel({ comp, onClose, onSetStatus, saving, notice, hasToken }) {
  if (!comp) return null
  const fmt = (n) => (n || 0).toLocaleString('ru-RU')
  return (
    <>
      <div className="pd-f7-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="pd-f7-panel" role="dialog" aria-label={`Деталь: ${comp.title}`}>
        <button type="button" className="pd-f7-close" onClick={onClose} aria-label="Закрыть">✕</button>
        <h3 className="pd-f7-title">{comp.title}</h3>
        <div className="pd-f7-badges">
          <span className={`pd-f7-badge ${statusCls(comp.status)}`}>{statusText(comp.status)}</span>
          {comp.listing?.part_category && <span className="pd-f7-badge cat">{comp.listing.part_category}</span>}
        </div>
        <dl className="pd-f7-props">
          <div><dt>Цена</dt><dd>{fmt(comp.price_rub)} ₽</dd></div>
          <div><dt>Состояние</dt><dd>{comp.listing?.condition ? conditionText(comp.listing.condition) : '—'}</dd></div>
          <div><dt>Происхождение</dt><dd>{comp.listing?.provenance || '—'}</dd></div>
        </dl>
        <div className="pd-f7-status">
          <h4>Статус детали</h4>
          {comp.listing ? (
            hasToken ? (
            <div className="pd-f7-status-btns">
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`pd-f7-status-btn ${comp.status === o.value ? 'active' : ''}`}
                  disabled={saving || comp.status === o.value}
                  onClick={() => onSetStatus(comp, o.value)}
                >{o.label}</button>
              ))}
            </div>
            ) : (
              <p className="pd-f7-note pd-f7-noauth">Необходим вход (JWT отсутствует)</p>
            )
          ) : (
            <p className="pd-f7-note">Нет листинга для этой детали.</p>
          )}
          {notice && <p className={`pd-f7-notice ${notice.kind}`}>{notice.text}</p>}
        </div>
      </aside>
    </>
  )
}

function conditionText(c) {
  if (c === 'new') return 'Новое'
  if (c === 'tested') return 'Проверено'
  if (c === 'untested') return 'Не проверено'
  return c
}

export default function DonorView() {
  const params = useParams()
  const brand = params.brand || 'Apple'
  const model = params.model || 'iPhone 13 Pro'
  const [data, setData] = useState(null)
  const [view, setView] = useState('blowup') // 'blowup' | 'list'
  // F7: выбранная деталь + статус листингов (по listing_id) + notice.
  const [selected, setSelected] = useState(null) // { slotKey, comp }
  const [listings, setListings] = useState([])
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [hasToken, setHasToken] = useState(false)

  const loadListings = () =>
    fetch('/api/listings')
      .then((r) => (r.ok ? r.json() : []))
      .then((ls) => { setListings(Array.isArray(ls) ? ls : []) })
      .catch((e) => console.error('load listings err', e))

  useEffect(() => {
    // F7: /donor/:brand/:model → находим schema по brand/model, берём
    // inventree_donor_part_id и грузим GET /api/donor/{donor_part_id}.
    fetch('/api/device-schemas')
      .then((r) => (r.ok ? r.json() : []))
      .then((schemas) => {
        const arr = Array.isArray(schemas) ? schemas : []
        const norm = (s) => String(s || '').toLowerCase().trim()
        const schema = arr.find(
          (s) => norm(s.brand) === norm(brand) && norm(s.model) === norm(model),
        )
        const donorId = schema?.inventree_donor_part_id
        if (!donorId) return {}
        return fetch(`/api/donor/${donorId}`).then((r) => (r.ok ? r.json() : {}))
      })
      .then((d) => setData(d))
      .catch((e) => console.error('load donor err', e))
    loadListings()
    const sync = () => setHasToken(!!localStorage.getItem('pd-token'))
    sync()
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [brand, model])

  if (!data || !data.components) return <p className="pd-hint">Загрузка развёртки...</p>

  // F7: нормализуем слоты в короткие ключи + JOIN листингов по inventree_part_id.
  const components = data.components.map((c) => {
    const slotKey = normalizeSlot(c.slot) || normalizeSlot(c.title) || c.slot
    const schema = (data.hotspots || {})[slotKey] || c.hotspot
    const listing = listings.find((l) => l.inventree_part_id === c.part_id) || null
    return {
      ...c,
      slot: slotKey,
      hotspot: (schema && (schema.x != null || schema.y != null)) ? schema : (c.hotspot || {}),
      listing,
      // статус детали: приоритет — актуальный статус листинга (после PATCH), иначе статус из donor API
      status: listing ? listing.status : (c.status || 'active'),
    }
  })

  const selectedComp = selected
    ? components.find((c) => c.slot === selected.slotKey && (c.part_id ?? -1) === (selected.partId ?? -1)) || null
    : null

  const setStatus = async (comp, status) => {
    if (!comp.listing) return
    if (!localStorage.getItem('pd-token')) {
      setNotice({ kind: 'err', text: 'Необходим вход (JWT отсутствует)' })
      return
    }
    setSaving(true)
    setNotice(null)
    const prev = listings
    // optimistic update
    setListings((ls) => ls.map((l) => (l.id === comp.listing.id ? { ...l, status } : l)))
    try {
      const r = await authFetch(`/api/listings/${comp.listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await loadListings()
      setNotice({ kind: 'ok', text: 'Статус обновлён' })
    } catch (e) {
      setListings(prev)
      setNotice({ kind: 'err', text: 'Ошибка сохранения статуса' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pd-f7-page">
      <h2>Развёртка: {data.model}</h2>

      <div className="pd-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={view === 'blowup'}
          className={`pd-tab ${view === 'blowup' ? 'active' : ''}`}
          onClick={() => setView('blowup')}
        >Разнесённый вид</button>
        <button
          role="tab"
          aria-selected={view === 'list'}
          className={`pd-tab ${view === 'list' ? 'active' : ''}`}
          onClick={() => setView('list')}
        >Список</button>
      </div>

      <div className="pd-donor">
        {view === 'blowup' ? (
          <div className={`pd-f7-layout ${selectedComp ? 'with-panel' : ''}`}>
            <div className="pd-scheme">
              <ExplodedScheme
                components={components}
                selectedKey={selected?.slotKey}
                onSelect={(c) => setSelected({ slotKey: c.slot, partId: c.part_id })}
                bgUrl={data.exploded_view_url}
              />
              <p className="pd-note">Клик по слою — открыть деталь и управлять статусом.</p>
            </div>
            <DetailPanel
              comp={selectedComp}
              onClose={() => setSelected(null)}
              onSetStatus={setStatus}
              saving={saving}
              notice={notice}
              hasToken={hasToken}
            />
          </div>
        ) : (
          <div className="pd-parts">
            {components.map((c) => (
              <button
                key={`${c.slot}-${c.part_id ?? c.slot}`}
                type="button"
                className="pd-part"
                onClick={() => { setView('blowup'); setSelected({ slotKey: c.slot, partId: c.part_id }) }}
              >
                <span className={`dot ${statusCls(c.status)}`} />
                <span>
                  <strong>{c.title || SLOT_META[c.slot]?.label}</strong>
                  <span className="pd-part-price"> — {(c.price_rub || 0).toLocaleString('ru-RU')} ₽ · {statusText(c.status)}</span>
                </span>
                <span className="pd-part-mark">Открыть деталь</span>
              </button>
            ))}
            <p className="pd-note">Клик по детали открывает панель управления статусом.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Вспомогательные фигуры фонового SVG ---

// Ось «взрыва» — единая аккуратная вертикальная направляющая с мягким градиентом,
// по которой разведены слои. Без пунктирных рамок: читается как студийная направляющая.
function ExplosionAxis({ cx, top, bottom }) {
  return (
    <g opacity="0.5">
      <defs>
        <linearGradient id="axis-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b6472" stopOpacity="0" />
          <stop offset="0.5" stopColor="#5b6472" stopOpacity="0.55" />
          <stop offset="1" stopColor="#5b6472" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={cx} y1={top} x2={cx} y2={bottom} stroke="url(#axis-fade)" strokeWidth="1.4" />
      <line
        x1={cx - 7} y1={bottom} x2={cx + 7} y2={bottom}
        stroke="#5b6472" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"
      />
      <line
        x1={cx - 4.5} y1={bottom - 5} x2={cx} y2={bottom}
        stroke="#5b6472" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"
      />
      <line
        x1={cx + 4.5} y1={bottom - 5} x2={cx} y2={bottom}
        stroke="#5b6472" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"
      />
    </g>
  )
}
