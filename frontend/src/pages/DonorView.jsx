import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

// Развёртка телефона: контур (SVG) + hotspots из backend (/api/donor/{brand}/{model}).
// Координаты слотов приходят из device_schema (%). Статусы/цены — из listings.
const PHONE_SVG = (w, h) => (
  <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }}>
    <rect x={w * 0.2} y={h * 0.05} width={w * 0.6} height={h * 0.9} rx={20} fill="#1c1c1e" />
    <rect x={w * 0.27} y={h * 0.12} width={w * 0.46} height={h * 0.5} rx={10} fill="#2c2c2e" />
    <rect x={w * 0.27} y={h * 0.68} width={w * 0.46} height={h * 0.18} rx={6} fill="#3a3a3c" />
  </svg>
)

export default function DonorView() {
  const params = useParams()
  const brand = params.brand || 'Apple'
  const model = params.model || 'iPhone 13 Pro'
  const [data, setData] = useState(null)
  const [sold, setSold] = useState({})

  useEffect(() => {
    fetch(`/api/donor/${encodeURIComponent(brand)}/${encodeURIComponent(model)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        setData(d)
        const s = {}
        ;(d.components || []).forEach((c) => { s[c.slot] = c.status === 'sold' })
        setSold(s)
      })
      .catch((e) => console.error('load donor err', e))
  }, [brand, model])

  if (!data || !data.components) return <p className="pd-hint">Загрузка развёртки...</p>

  const W = 300, H = 400

  return (
    <div>
      <h2>Развёртка: {data.model}</h2>
      <div className="pd-donor">
        <div className="pd-scheme">
          {PHONE_SVG(W, H)}
          {data.components.map((c) => (
            <button
              key={c.slot}
              className={`pd-hotspot ${sold[c.slot] ? 'sold' : ''}`}
              style={{ left: `${(c.hotspot?.x ?? 0.5) * 100}%`, top: `${(c.hotspot?.y ?? 0.5) * 100}%` }}
              title={c.title}
              onClick={() => setSold((p) => ({ ...p, [c.slot]: !p[c.slot] }))}
            >
              <span className="pd-dot" />
              <span className="pd-tooltip">
                {c.title}
                <br />{(c.price_rub || 0).toLocaleString('ru-RU')} ₽ · {sold[c.slot] ? 'Продано' : 'В наличии'}
              </span>
            </button>
          ))}
          <div className="pd-legend">
            <span className="dot in" /> в наличии
            <span className="dot sold" /> продано
          </div>
        </div>

        <div className="pd-parts">
          {data.components.map((c) => (
            <label key={c.slot} className={`pd-part ${sold[c.slot] ? 'sold' : ''}`}>
              <input type="checkbox" checked={!!sold[c.slot]} onChange={() => setSold((p) => ({ ...p, [c.slot]: !p[c.slot] }))} />
              <span>
                <strong>{c.title}</strong> — {(c.price_rub || 0).toLocaleString('ru-RU')} ₽ · {sold[c.slot] ? 'продано' : 'в наличии'}
              </span>
            </label>
          ))}
          <p className="pd-note">Пометка «продано» в кабинете автоматически обновится на схеме.</p>
        </div>
      </div>
    </div>
  )
}
