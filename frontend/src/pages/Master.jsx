import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

function Stars({ rating }) {
  const r = Math.round(rating)
  return (
    <span className="pd-stars" title={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`pd-star ${i <= r ? 'on' : ''}`}>★</span>
      ))}
    </span>
  )
}

function contactLabel(type) {
  const map = { phone: '📞 Телефон', telegram: '✈️ Telegram', email: '✉️ Email', whatsapp: '💬 WhatsApp', site: '🌐 Сайт' }
  return map[type] || type
}

export default function Master() {
  const { id } = useParams()
  const [p, setP] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/master/profiles/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setP)
      .catch(() => setP(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="pd-master"><p className="pd-hint">Загрузка…</p></div>
  }
  if (!p) {
    return <div className="pd-master"><p className="pd-muted">Профиль мастера не найден.</p></div>
  }

  const company = p.company || {}
  const dist = p.rating_distribution || {}
  const maxBucket = Math.max(1, ...Object.values(dist).map(Number))
  const distRows = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: Number(dist[star]) || 0,
  }))

  return (
    <div className="pd-master">
      {/* HERO */}
      <section className="pd-master-hero">
        <div className="pd-master-avatar">🛠️</div>
        <div className="pd-master-hero-body">
          <div className="pd-master-title-row">
            <h2>{company.name || 'Мастер'}</h2>
            <span className="pd-badge pd-master-role">Профиль мастера</span>
            {company.verified ? <span className="pd-verified">✓ проверен</span> : <span className="pd-badge pd-badge.out">не проверен</span>}
          </div>
          {p.tagline && <p className="pd-master-tagline">“{p.tagline}”</p>}
          <div className="pd-master-meta">
            {p.city && <span className="pd-chip">📍 {p.city}</span>}
            {p.since > 0 && <span className="pd-chip">🗓 с {p.since} года</span>}
            <span className="pd-chip pd-master-rating"><Stars rating={p.avg_rating} /> {p.avg_rating.toFixed(1)} · {p.review_count} отзывов</span>
          </div>
        </div>
      </section>

      {/* RATING DISTRIBUTION */}
      <section className="pd-master-section">
        <h3 className="pd-master-sec-title">Рейтинг</h3>
        {p.review_count > 0 ? (
          <div className="pd-master-ratings">
            {distRows.map(({ star, count }) => (
              <div className="pd-master-rating-row" key={star}>
                <span className="pd-master-rating-star">{star} ★</span>
                <div className="pd-master-bar">
                  <div className="pd-master-bar-fill" style={{ width: `${(count / maxBucket) * 100}%` }} />
                </div>
                <span className="pd-master-rating-count">{count}</span>
              </div>
            ))}
            <div className="pd-master-avg">
              <span className="pd-master-avg-num">{p.avg_rating.toFixed(1)}</span>
              <span className="pd-master-avg-info">средняя оценка · {p.review_count} отзыв(ов)</span>
            </div>
          </div>
        ) : (
          <p className="pd-muted">Отзывов пока нет. Станьте первым, кто оценит мастера!</p>
        )}
      </section>

      {/* SERVICES */}
      {Array.isArray(p.services) && p.services.length > 0 && (
        <section className="pd-master-section">
          <h3 className="pd-master-sec-title">Услуги и навыки</h3>
          <div className="pd-master-chips">
            {p.services.map((s, i) => <span key={i} className="pd-chip">{s}</span>)}
          </div>
        </section>
      )}

      {/* ARSENAL */}
      {Array.isArray(p.arsenal) && p.arsenal.length > 0 && (
        <section className="pd-master-section">
          <h3 className="pd-master-sec-title">Оборудование и оснастка</h3>
          <ul className="pd-master-list">
            {p.arsenal.map((a, i) => (
              <li key={i}>
                <strong>{a.name}</strong>
                {a.note && <span className="pd-muted"> — {a.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* EXPERIENCE TIMELINE */}
      {Array.isArray(p.experience) && p.experience.length > 0 && (
        <section className="pd-master-section">
          <h3 className="pd-master-sec-title">Опыт</h3>
          <div className="pd-master-timeline">
            {p.experience.map((e, i) => (
              <div className="pd-master-tl-item" key={i}>
                <span className="pd-master-tl-year">{e.year}</span>
                <div>
                  <strong>{e.title}</strong>
                  {e.desc && <p className="pd-muted">{e.desc}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* PORTFOLIO */}
      {Array.isArray(p.portfolio) && p.portfolio.length > 0 && (
        <section className="pd-master-section">
          <h3 className="pd-master-sec-title">Портфолио</h3>
          <div className="pd-master-grid">
            {p.portfolio.map((w, i) => (
              <div className="pd-master-portfolio-card" key={i}>
                <strong>{w.title}</strong>
                {w.desc && <p className="pd-muted">{w.desc}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* B2B */}
      {Array.isArray(p.b2b) && p.b2b.length > 0 && (
        <section className="pd-master-section pd-master-b2b">
          <h3 className="pd-master-sec-title">Опт и поставки (B2B)</h3>
          <div className="pd-master-chips">
            {p.b2b.map((b, i) => <span key={i} className="pd-chip">{b}</span>)}
          </div>
        </section>
      )}

      {/* CONTACTS */}
      {Array.isArray(p.contacts) && p.contacts.length > 0 && (
        <section className="pd-master-section">
          <h3 className="pd-master-sec-title">Контакты</h3>
          <div className="pd-master-contacts">
            {p.contacts.map((c, i) => (
              <div className="pd-master-contact" key={i}>
                <span className="pd-master-contact-label">{contactLabel(c.type)}</span>
                <a href={`mailto:${c.value}`} className="pd-master-contact-value">{c.value}</a>
              </div>
            ))}
          </div>
          <Link to={`/deal`} className="pd-btn pd-btn-primary pd-master-write">Написать мастеру</Link>
        </section>
      )}
    </div>
  )
}
