import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const DEMO_DEVICES = [
  { brand: 'Apple', model: 'iPhone 13 Pro' },
  { brand: 'Samsung', model: 'Galaxy S21' },
  { brand: 'Xiaomi', model: 'Mi 11' },
]

export default function Catalog() {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => console.error('health err', e))
  }, [])

  return (
    <div>
      <h2>Донорские устройства</h2>
      {health && (
        <p className="pd-health">
          backend: <b>{health.partsdonor_backend}</b> · InvenTree: {health.inventree ? '✅' : '❌'}
        </p>
      )}
      <p className="pd-hint">Выбери модель — откроется развёртка с компонентами.</p>
      <div className="pd-catalog">
        {DEMO_DEVICES.map((d) => (
          <Link
            key={`${d.brand}-${d.model}`}
            to={`/donor/${encodeURIComponent(d.brand)}/${encodeURIComponent(d.model)}`}
            className="pd-card"
          >
            <div className="pd-phone">📱</div>
            <strong>{d.brand} {d.model}</strong>
            <span className="pd-muted">от 12 400 ₽ · клик по схеме</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
