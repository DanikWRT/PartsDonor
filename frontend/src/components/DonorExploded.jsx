import React, { useState } from 'react'

// ===================== S1: Shared Donor Exploded View =====================
// Extracted from DonorView.jsx (F7/UX-4). Reusable for DonorLots/DonorLot pages.

const SLOT_META = {
  display:   { label: 'Дисплей',       accent: '#38bdf8' },
  board:     { label: 'Материнская плата', accent: '#a78bfa' },
  battery:   { label: 'Аккумулятор',   accent: '#34d399' },
  camera:    { label: 'Камера',        accent: '#fbbf24' },
  backcover: { label: 'Корпус',        accent: '#94a3b8' },
}

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

// --- Layer components (same as DonorView) ---
function ShadowDef({ id }) {
  return (
    <filter id={id} x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="11" stdDeviation="10" floodColor="#000000" floodOpacity="0.78" />
      <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#000000" floodOpacity="0.55" />
    </filter>
  )
}
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
        <rect x={-w / 2 + 6} y={-13 + 8} width={w} height={26} rx={9} fill={`url(#${p}-side)`} />
        <rect x={-w / 2} y={-13} width={w} height={26} rx={9} fill={`url(#${p}-frame)`} />
        <rect x={-w / 2 + 2.5} y={-10.5} width={w - 5} height={21} rx={7} fill={`url(#${p}-glass)`} />
        <rect x={-w / 2 + 5} y={-8} width={w - 10} height={16} rx={5} fill={`url(#${p}-screen)`} />
        <rect x={w / 2 - 32} y={-12} width={22} height={6} rx={3} fill="#05070b" />
        <circle cx={w / 2 - 20} cy={-9} r={1.7} fill="#0a1c30" stroke="#3a5f8c" strokeWidth="0.5" />
        <polygon points={`${-w / 2 + 8},-10 ${-w / 2 + 42},-10 ${-w / 2 + 20},10 ${-w / 2 - 10},10`} fill={`url(#${p}-glint)`} opacity="0.5" />
        <rect x={-8} y={4} width={16} height={1.6} rx={0.8} fill="rgba(255,255,255,0.35)" />
      </g>
    </g>
  )
}
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
        <rect x={-w / 2 + 6} y={-17 + 8} width={w} height={34} rx={4} fill={`url(#${p}-side)`} />
        <rect x={-w / 2} y={-17} width={w} height={34} rx={4} fill={`url(#${p}-pcb)`} stroke="#122b1d" strokeWidth="0.6" />
        <path d={`M ${-w / 2 + 8} -8 H ${-w / 2 + 30} V -2 H ${-w / 2 + 52}`} fill="none" stroke="#2f8f5f" strokeWidth="0.8" opacity="0.7" />
        <path d={`M ${-w / 2 + 8} 4 H ${-w / 2 + 28} V 10 H ${-w / 2 + 60}`} fill="none" stroke="#2f8f5f" strokeWidth="0.8" opacity="0.7" />
        <path d={`M ${-w / 2 + 70} -14 V 2 H ${-w / 2 + 40}`} fill="none" stroke="#2f8f5f" strokeWidth="0.7" opacity="0.5" />
        <g transform={`translate(${-w * 0.18} -2)`}>
          <rect x={-9} y={-9} width={18} height={18} rx={2} fill={`url(#${p}-chip)`} stroke="#3a3f47" strokeWidth="0.5" />
          <text x={0} y={3} textAnchor="middle" fontSize="5" fontWeight="700" fill="#c8cdd4" fontFamily="inherit">A15</text>
        </g>
        {[-w * 0.1, -w * 0.06, -w * 0.02, w * 0.02, w * 0.06, w * 0.1].map((dx) => (
          <rect key={dx} x={dx - 1.5} y={10} width={3} height={5} rx={0.5} fill={`url(#${p}-gold)`} />
        ))}
        <rect x={-w / 2 + 5} y={-13} width={6} height={11} rx={1} fill="#7cc4ea" />
        <rect x={-w / 2 + 5} y={-13} width={6} height={3} rx={1} fill="#a9dff7" opacity="0.7" />
      </g>
    </g>
  )
}
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
        <rect x={-w / 2 + 6} y={-15 + 10} width={w} height={30} rx={8} fill={`url(#${p}-side)`} />
        <rect x={-w / 2} y={-15} width={w} height={30} rx={8} fill={`url(#${p}-body)`} />
        <rect x={-w / 2} y={-15} width={w} height={30} rx={8} fill={`url(#${p}-wrap)`} />
        <rect x={w / 2 - 11} y={-7} width={7} height={14} rx={1} fill="#1a1c20" stroke="#3a3f47" strokeWidth="0.5" />
        <rect x={w / 2 - 10} y={-4} width={2} height={8} fill={`url(#${p}-gold)`} />
        <text x={-w / 2 + 10} y={-2} fontSize="7" fontWeight="700" fill="#aeb4bc" fontFamily="inherit">Li-Polymer</text>
        <text x={-w / 2 + 10} y={6} fontSize="6" fill="#7c828b" fontFamily="inherit">3.87V · 3095 mAh</text>
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
        <circle cx={w * 0.22} cy={-6} r={2.6} fill="#f0e1ba" />
        <circle cx={w * 0.22} cy={-6} r={1.3} fill="#fff8e8" />
      </g>
    </g>
  )
}
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
        <rect x={-w / 2 + 6} y={-15 + 8} width={w} height={30} rx={10} fill={`url(#${p}-side)`} />
        <rect x={-w / 2} y={-15} width={w} height={30} rx={10} fill={`url(#${p}-cover)`} />
        <rect x={w / 4 - 14} y={-12} width={52} height={18} rx={5} fill={`url(#${p}-bump)`} stroke="#454b55" strokeWidth="0.5" />
        {[-6, 2, 10].map((dx) => (
          <g key={dx} transform={`translate(${w / 4 + dx} -5)`}>
            <circle r={4.2} fill="#08090b" stroke="#3a3f47" strokeWidth="0.8" />
            <circle r={3} fill={`url(#${p}-lens)`} />
            <circle r={1} fill="rgba(255,255,255,0.5)" />
          </g>
        ))}
        <text x={-w / 2 + 10} y={8} fontSize="6" fontWeight="600" fill="#7c828b" fontFamily="inherit" letterSpacing="1.5">Apple</text>
        <rect x={-w / 2 + 6} y={-13} width={w * 0.3} height={26} rx={10} fill="rgba(255,255,255,0.05)" />
      </g>
    </g>
  )
}

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
  return skew ? <g transform={`skewX(${skew}) rotate(${skew * 0.4})`}>{inner}</g> : inner
}

// UX-4: Flat 2D drawing
function FlatDrawing({ slot, title }) {
  const accent = SLOT_META[slot]?.accent || '#94a3b8'
  const label = SLOT_META[slot]?.label || title || slot
  const W = 200, H = 26, RX = 7
  const size = slot === 'display' ? '6.1\u2033' : slot === 'backcover' ? '156\u00d778' : '60\u00d7100'
  return (
    <svg className="pd-flat-svg" viewBox={`-115 -30 230 60`} aria-hidden="true">
      <line x1={-112} y1={0} x2={112} y2={0} stroke={accent} strokeWidth="0.5" strokeDasharray="3 4" opacity="0.5" />
      <line x1={0} y1={-26} x2={0} y2={26} stroke={accent} strokeWidth="0.5" strokeDasharray="3 4" opacity="0.5" />
      <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={RX} fill="rgba(255,255,255,0.05)" stroke={accent} strokeWidth="1.4" />
      <rect x={-W / 2 + 4} y={-H / 2 + 4} width={W - 8} height={H - 8} rx={RX - 2} fill="none" stroke={accent} strokeWidth="0.7" strokeDasharray="4 3" opacity="0.55" />
      <line x1={-W / 2 - 4} y1={-18} x2={W / 2 + 4} y2={-18} stroke={accent} strokeWidth="0.7" />
      <line x1={-W / 2 - 4} y1={-14} x2={-W / 2 - 4} y2={-22} stroke={accent} strokeWidth="0.7" />
      <line x1={W / 2 + 4} y1={-14} x2={W / 2 + 4} y2={-22} stroke={accent} strokeWidth="0.7" />
      <text x={0} y={-21} textAnchor="middle" fontSize="7" fill={accent} fontFamily="inherit">{size}</text>
      <line x1={-W / 2 - 14} y1={-H / 2 - 2} x2={-W / 2 - 14} y2={H / 2 + 2} stroke={accent} strokeWidth="0.7" />
      <line x1={-W / 2 - 11} y1={-H / 2 - 2} x2={-W / 2 - 17} y2={-H / 2 - 2} stroke={accent} strokeWidth="0.7" />
      <line x1={-W / 2 - 11} y1={H / 2 + 2} x2={-W / 2 - 17} y2={H / 2 + 2} stroke={accent} strokeWidth="0.7" />
      <text x={-W / 2 - 17} y={2} textAnchor="middle" fontSize="6.5" fill={accent} fontFamily="inherit" transform={`rotate(-90 -${W / 2 + 17} 0)`}>{slot === 'display' ? 'H' : 'B'}</text>
      <g fill="none" stroke={accent} strokeWidth="0.7">
        {slot === 'display' ? (<>
          <circle cx={-38} cy={0} r={4} />
          <circle cx={-14} cy={12} r={2.5} />
          <circle cx={14} cy={-12} r={2.5} />
          <circle cx={38} cy={0} r={4} />
        </>) : (<>
          <circle cx={-40} cy={0} r={4} />
          <circle cx={-16} cy={-12} r={2.5} />
          <circle cx={16} cy={12} r={2.5} />
          <circle cx={40} cy={0} r={4} />
        </>)}
      </g>
    </svg>
  )
}

function normalizeSlot(raw) {
  const s = String(raw || '').toLowerCase()
  if (s.includes('дисплей')) return 'display'
  if (s.includes('материнск') || s.includes('плата')) return 'board'
  if (s.includes('аккумулятор')) return 'battery'
  if (s.includes('камера')) return 'camera'
  if (s.includes('корпус')) return 'backcover'
  return null
}

function isFlat(slotKey, rawName) {
  const s = `${slotKey || ''} ${rawName || ''}`.toLowerCase()
  if (s.includes('display') || s.includes('дисплей') || s.includes('экран') || s.includes('screen')) return true
  if (s.includes('backcover') || s.includes('корпус') || s.includes('стекл') || s.includes('glass')) return true
  if (s.includes('крышк') || s.includes('задн') || s.includes('панел') || s.includes('пластин') || s.includes('фронт')) return true
  return false
}

const VIEW_W = 300, VIEW_H = 460, PAD = 26, LYR_W = 210

// UX-fix #2: реалистичные фото-плейсхолдеры как fallback, когда InvenTree не
// вернул реальное изображение запчасти/донора. Публичные ассеты в frontend/public/photos/.
const PHOTO_FALLBACK = {
  display: '/photos/display.jpg',
  board: '/photos/board.jpg',
  battery: '/photos/battery.jpg',
  camera: '/photos/camera.jpg',
  backcover: '/photos/backcover.jpg',
}

export function componentPhoto(c) {
  if (c?.image && String(c.image).trim()) return c.image
  const key = normalizeSlot(c?.slot) || (Object.prototype.hasOwnProperty.call(SLOT_META, c?.slot) ? c.slot : null)
  return key && PHOTO_FALLBACK[key] ? PHOTO_FALLBACK[key] : null
}

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
      <line x1={cx - 7} y1={bottom} x2={cx + 7} y2={bottom} stroke="#5b6472" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      <line x1={cx - 4.5} y1={bottom - 5} x2={cx} y2={bottom} stroke="#5b6472" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      <line x1={cx + 4.5} y1={bottom - 5} x2={cx} y2={bottom} stroke="#5b6472" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
    </g>
  )
}

function ExplodedScheme({ components, onSelectedKey, selectedKey, onSelect, bgUrl }) {
  const sorted = [...(components || [])].sort((a, b) => {
    const ay = (a.hotspot?.y != null) ? a.hotspot.y : 0;
    const by = (b.hotspot?.y != null) ? b.hotspot.y : 0;
    return ay - by;
  })
  if (sorted.length === 0) {
    return (
      <div className="pd-blowup pd-blowup-empty" role="img" aria-label="Развёртка отсутствует">
        <p className="pd-muted">Развёртка недоступна</p>
      </div>
    )
  }
  const cx = VIEW_W / 2
  // FIX Bug1: spread layers evenly along Y axis regardless of hotspot quality.
  // If hotspots are present and distinct, honour them; but ALWAYS guarantee
  // minimum vertical separation so layers never fully overlap.
  const n = sorted.length
  const spreadTop = PAD
  const spreadBottom = VIEW_H - PAD
  const yPositions = sorted.map((_, i) => spreadTop + (i / (n - 1 || 1)) * (spreadBottom - spreadTop))
  const yOf = (c, i) => yPositions[i]
  const top = yOf(sorted[0], 0) - 40
  const bottom = yOf(sorted[n - 1], n - 1) + 40
  const dotCls = (c) => statusCls(c.status)
  const tilt = (i) => (i - (sorted.length - 1) / 2) * 7
  const pctX = (c, i) => (((c.hotspot?.x ?? 0.5) * VIEW_W + tilt(i)) / VIEW_W) * 100
  const pctY = (c, i) => (yOf(c, i) / VIEW_H) * 100

  return (
    <div className="pd-blowup" role="img" aria-label="Разнесённый вид телефона">
      <svg className="pd-bg-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <ExplosionAxis cx={cx} top={top} bottom={bottom} />
      </svg>
      {sorted.map((c, i) => {
        const isSel = c.slot === selectedKey
        const layerW = (LYR_W / VIEW_W) * 100
        const persp = (i - (sorted.length - 1) / 2) * 5
        const flat = isFlat(c.slot, c.title)
        return (
          <button
            key={`${c.slot}-${c.part_id ?? i}`}
            type="button"
            className={`${flat ? 'pd-flat-hotspot' : 'pd-layer-btn'} ${isSel ? 'selected' : ''}`}
            style={{ left: `${pctX(c, i)}%`, top: `${pctY(c, i)}%`, width: `${layerW}%` }}
            onClick={() => { onSelect(c); if (onSelectedKey) onSelectedKey(c) }}
            aria-pressed={isSel}
            title={c.title || SLOT_META[c.slot]?.label}
          >
            {flat ? (
              <FlatDrawing slot={c.slot} title={c.title} />
            ) : (
              <svg viewBox={`${-LYR_W / 2 - 12} ${-30} ${LYR_W + 24} 60`} className="pd-layer-svg" preserveAspectRatio="none">
                <SlotLayer slot={c.slot} w={LYR_W} skew={persp} />
              </svg>
            )}
            {componentPhoto(c) && !flat && (
              <img src={componentPhoto(c)} alt={c.title} className="pd-layer-img" loading="lazy" />
            )}
            {componentPhoto(c) && flat && (
              <img src={componentPhoto(c)} alt={c.title} className="pd-flat-img" loading="lazy" />
            )}
            <span className={`${flat ? 'pd-flat-tag' : 'pd-layer-tag'} ${dotCls(c)}`}>
              {SLOT_META[c.slot]?.label || c.title || c.slot}
            </span>
            <span className={`${flat ? 'pd-flat-dot' : 'pd-dot'} ${dotCls(c)}`} />
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

// --- Mini exploded view for card grids ---
function DonorExplodedMini({ components }) {
  const [selectedKey, setSelectedKey] = useState(null)
  const limited = components ? components.slice(0, 5) : []
  return (
    <div style={{ width: '100%', maxWidth: 260, margin: '0 auto' }}>
      <ExplodedScheme
        components={limited}
        selectedKey={selectedKey}
        onSelect={() => {}}
        onSelectedKey={setSelectedKey}
      />
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

export {
  ExplodedScheme,
  DonorExplodedMini,
  normalizeSlot,
  isFlat,
  SLOT_META,
  statusCls,
  statusText,
  STATUS_OPTIONS,
  DetailPanel,
  conditionText,
  SlotLayer,
  FlatDrawing,
  ExplosionAxis,
}
