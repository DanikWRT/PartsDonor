import React, { useEffect, useState } from 'react'

export default function Cabinet() {
  const [listings, setListings] = useState([])

  useEffect(() => {
    fetch('/api/listings')
      .then((r) => r.json())
      .then(setListings)
      .catch(() => setListings([]))
  }, [])

  return (
    <div>
      <h2>Кабинет: Склад мастера</h2>
      <div className="pd-widgets">
        <div className="pd-widget"><b>0 ₽</b><span>продажи за месяц</span></div>
        <div className="pd-widget"><b>{listings.length}</b><span>активные доноры</span></div>
      </div>
      <p className="pd-hint">Здесь появится инвентарь мастерской (из InvenTree) и объявления.</p>
      {listings.length === 0 ? (
        <p className="pd-muted">Пока нет объявлений. Создай через /api/listings (backend).</p>
      ) : (
        <ul className="pd-list">
          {listings.map((l) => (
            <li key={l.id}>
              {l.title} — {l.price_rub.toLocaleString('ru-RU')} ₽ · {l.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
