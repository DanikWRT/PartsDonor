import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const DEMO_DEVICES = ['iPhone 13 Pro', 'Samsung Galaxy S21', 'Xiaomi Mi 11']

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
      <p className="pd-hint">Выбери модель — откроется развёртка с компонентами. (демо)</p>
      <div className="pd-catalog">
        {DEMO_DEVICES.map((d) => (
          <Link key={d} to={`/donor/${encodeURIComponent(d)}`} className="pd-card">
            <div className="pd-phone">📱</div>
            <strong>{d}</strong>
            <span className="pd-muted">от 12 400 ₽ · кнопка-клик по схеме</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
