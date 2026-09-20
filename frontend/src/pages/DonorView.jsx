import React, { useState } from 'react'
import { useParams } from 'react-router-dom'

// Заглушка «развёртки»: простой контур телефона (SVG) + hotspots от клика.
// Координаты в % — соответствуют JSON-схеме device_schema.device_schemas.
const PHONE_SVG = (w, h) => (
  <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }}>
    {/* корпус */}
    <rect x={w * 0.2} y={h * 0.05} width={w * 0.6} height={h * 0.9} rx={20} fill="#1c1c1e" />
    {/* экран */}
    <rect x={w * 0.27} y={h * 0.12} width={w * 0.46} height={h * 0.5} rx={10} fill="#2c2c2e" />
    {/* плата (нижняя зона) */}
    <rect x={w * 0.27} y={h * 0.68} width={w * 0.46} height={h * 0.18} rx={6} fill="#3a3a3c" />
  </svg>
)

// Слоты компонентов с координатами (%) на схеме
const SLOTS = {
  display: { x: 50, y: 35, label: 'Дисплей' },
  board: { x: 50, y: 78, label: 'Материнская плата' },
  battery: { x: 22, y: 78, label: 'Аккумулятор' },
  camera: { x: 72, y: 78, label: 'Камера' },
  backcover: { x: 50, y: 95, label: 'Корпус' },
}

export default function DonorView() {
  const { device } = useParams()
  const [parts, setParts] = useState({
    display: { price: 4200, status: 'in' }, board: { price: 5800, status: 'in' },
    battery: { price: 1100, status: 'in' }, camera: { price: 2900, status: 'sold' },
    backcover: { price: 1500, status: 'in' },
  })

  const toggleSold = (key) =>
    setParts((prev) => ({
      ...prev,
      [key]: { ...prev[key], status: prev[key].status === 'sold' ? 'in' : 'sold' },
    }))

  const W = 300, H = 400

  return (
    <div>
      <h2>Развёртка: {decodeURIComponent(device)}</h2>
      <div className="pd-donor">
        {/* интерактивная схема */}
        <div className="pd-scheme">
          {PHONE_SVG(W, H)}
          {Object.entries(SLOTS).map(([key, slot]) => {
            const p = parts[key]
            return (
              <button
                key={key}
                className={`pd-hotspot ${p.status === 'sold' ? 'sold' : ''}`}
                style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                title={slot.label}
                onClick={() => toggleSold(key)}
              >
                <span className="pd-dot" />
                <span className="pd-tooltip">
                  {slot.label}
                  <br />{p.price.toLocaleString('ru-RU')} ₽ · {p.status === 'sold' ? 'Продано' : 'В наличии'}
                </span>
              </button>
            )
          })}
          <div className="pd-legend">
            <span className="dot in" /> в наличии
            <span className="dot sold" /> продано
          </div>
        </div>

        {/* список компонентов + чекбоксы */}
        <div className="pd-parts">
          {Object.entries(SLOTS).map(([key, slot]) => {
            const p = parts[key]
            return (
              <label key={key} className={`pd-part ${p.status === 'sold' ? 'sold' : ''}`}>
                <input type="checkbox" checked={p.status === 'sold'} onChange={() => toggleSold(key)} />
                <span>
                  <strong>{slot.label}</strong> — {p.price.toLocaleString('ru-RU')} ₽
                  · {p.status === 'sold' ? 'продано' : 'в наличии'}
                </span>
              </label>
            )
          })}
          <p className="pd-note">Пометка «продано» в кабинете автоматически обновится на схеме.</p>
        </div>
      </div>
    </div>
  )
}
