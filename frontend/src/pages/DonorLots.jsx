import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { authFetch } from '../auth.jsx'
import { ExplodedScheme } from '../components/DonorExploded.jsx'

export default function DonorLots() {
  const [lots, setLots] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/donor-lots')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setLots(Array.isArray(data) ? data : []))
      .catch(() => setLots([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="pd-hint">Загрузка доноров…</p>

  return (
    <div>
      <h2>Доноры целиком</h2>
      {lots.length === 0 ? (
        <p className="pd-muted">Нет донор-комплектов в каталоге.</p>
      ) : (
        <div className="pd-donor-card-grid">
          {lots.map((lot) => (
            <Link key={lot.id} to={`/donor-lot/${lot.id}`} className="pd-donor-card">
              <div className="pd-donor-card-thumb">
                <img src={lot.donor_image || '/photos/device-donor.jpg'} alt={`${lot.brand} ${lot.model}`} className="pd-donor-card-img" loading="lazy" />
                <ExplodedScheme
                  components={lot.components || []}
                  selectedKey={null}
                  onSelect={() => {}}
                  onSelectedKey={() => {}}
                />
              </div>
              <div className="pd-donor-card-body">
                <strong>{lot.brand} {lot.model}</strong>
                <span className="pd-donor-card-title">{lot.title}</span>
                <span className="pd-donor-card-price">
                  {lot.price_rub.toLocaleString('ru-RU')} ₽
                </span>
                <span className="pd-donor-card-meta">
                  {lot.component_count} деталей · {lot.seller_name}
                  {lot.seller_verified && ' ✓'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
