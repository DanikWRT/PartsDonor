import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

const CONTACT_ICONS = {
  telegram: '✈️', phone: '📱', email: '✉️', whatsapp: '💬', site: '🌐', address: '📍',
}
const CONTACT_LABELS = {
  telegram: 'Telegram', phone: 'Телефон', email: 'Email', whatsapp: 'WhatsApp', site: 'Сайт', address: 'Адрес',
}
const ARSENAL_ICONS = ['🔬', '🔥', '💨', '🧪', '📡', '💻', '📲', '🧰', '⚙️', '🧲', '💡', '🖥', '🛠', '🔧', '⚡', '📐']
const SERVICE_CHECK = '✓'

function ratingStars(rating) {
  const r = Math.max(0, Math.min(5, Math.round(rating)))
  return '★'.repeat(r) + '☆'.repeat(5 - r)
}

function fmt(val) {
  return val == null ? '' : String(val)
}

function MasterCard({ m }) {
  const c = m.company || {}
  const hasProfile = m.tagline || m.since || m.avg_rating > 0 || (Array.isArray(m.services) && m.services.length)
  return (
    <Link to={`/master/${m.company_id}`} className="ms-card">
      <div className="ms-card-top">
        <span className="ms-avatar">{c.name ? c.name.charAt(0).toUpperCase() : 'М'}</span>
        <div className="ms-card-id">
          <div className="ms-card-name">{c.name || 'Мастер'}</div>
          <div className="ms-card-meta">
            {m.city && <span>📍 {m.city}</span>}
            {m.since > 0 && <span>с {m.since}</span>}
          </div>
        </div>
      </div>
      {m.tagline && <div className="ms-card-tag">{m.tagline}</div>}
      <div className="ms-card-foot">
        <span className="ms-stars">{ratingStars(m.avg_rating)} <b>{m.avg_rating.toFixed(1)}</b></span>
        <span className="ms-count">{m.review_count} отзывов</span>
        {hasProfile && <span className="ms-go">Открыть →</span>}
      </div>
    </Link>
  )
}

export default function Master() {
  const { companyId } = useParams()
  const [list, setList] = useState([])
  const [p, setP] = useState(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (companyId) {
      setLoading(true)
      setP(null)
      fetch(`/api/master/profiles/${companyId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setP(d))
        .catch(() => setP(null))
        .finally(() => setLoading(false))
    } else {
      setLoading(true)
      fetch('/api/master/profiles')
        .then((r) => (r.ok ? r.json() : []))
        .then(setList)
        .catch(() => setList([]))
        .finally(() => setLoading(false))
    }
  }, [companyId])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }

  // ===================== DETAIL (reference 08) =====================
  if (companyId) {
    if (loading) {
      return (
        <div className="ms-page">
          <div className="bg-blueprint" />
          <div className="ms-container"><p className="ms-hint">Загрузка профиля…</p></div>
        </div>
      )
    }
    if (!p) {
      return (
        <div className="ms-page">
          <div className="bg-blueprint" />
          <div className="ms-container">
            <p className="ms-hint">Профиль мастера не найден.</p>
            <Link to="/masters" className="btn">← К списку мастеров</Link>
          </div>
        </div>
      )
    }

    const c = p.company || {}
    const dist = p.rating_distribution || {}
    const distTotal = Math.max(1, [5, 4, 3, 2, 1].reduce((s, k) => s + (Number(dist[k]) || 0), 0))
    const years = p.since > 0 ? `${new Date().getFullYear() - p.since} лет` : '—'
    const services = Array.isArray(p.services) ? p.services : []
    const arsenal = Array.isArray(p.arsenal) ? p.arsenal : []
    const experience = Array.isArray(p.experience) ? p.experience : []
    const portfolio = Array.isArray(p.portfolio) ? p.portfolio : []
    const b2b = Array.isArray(p.b2b) ? p.b2b : []
    const contacts = Array.isArray(p.contacts) ? p.contacts : []

    return (
      <div className="ms-page">
        <div className="bg-blueprint" />
        <div className="ms-container">

          {/* MAIN COLUMN */}
          <div className="ms-main">

            {/* PROFILE HERO */}
            <div className="ms-hero">
              <div className="ms-avatar-lg">
                {c.name ? c.name.charAt(0).toUpperCase() : 'М'}
                <span className="ms-online" title="Сейчас на площадке" />
              </div>
              <div className="ms-hero-info">
                <div className="ms-hero-name">
                  {c.name || 'Мастер'}
                  {c.verified ? <span className="ms-badge ms-badge-verify">✓ Проверен</span> : <span className="ms-badge ms-badge-verify muted">не проверен</span>}
                  {b2b.length > 0 && <span className="ms-badge ms-badge-b2b">B2B</span>}
                </div>
                {p.tagline && <div className="ms-hero-tag">{p.tagline}</div>}
                <div className="ms-hero-meta">
                  <span className="ms-meta-item"><span className="ms-star">★</span> <b>{p.avg_rating.toFixed(1)}</b> · {p.review_count} отзывов</span>
                  {p.city && <span className="ms-meta-item">📍 {p.city}</span>}
                  {p.since > 0 && <span className="ms-meta-item">🕐 На площадке с {p.since}</span>}
                </div>
              </div>
              <div className="ms-hero-actions">
                <button type="button" className="btn btn-primary" onClick={() => showToast('Открываю чат с мастером…')}>💬 Связаться</button>
                <button type="button" className="btn" onClick={() => showToast('Запрос сметы отправлен')}>📋 Запросить смету</button>
                <button type="button" className={`btn ${saved ? 'btn-green' : ''}`} onClick={() => { setSaved(!saved); showToast(saved ? 'Убрано из избранного' : 'Мастер добавлен в избранное') }}>
                  {saved ? '✓ Сохранено' : '⭐ Сохранить'}
                </button>
              </div>
            </div>

            {/* STATS GRID */}
            <div className="ms-stats">
              <div className="ms-stat">
                <div className="ms-stat-lbl">Опыт работы</div>
                <div className="ms-stat-val accent">{p.since > 0 ? `${new Date().getFullYear() - p.since} лет` : '—'}</div>
                {p.since > 0 && <div className="ms-stat-sub">с {p.since} года</div>}
              </div>
              <div className="ms-stat">
                <div className="ms-stat-lbl">Ремонтов</div>
                <div className="ms-stat-val green">{p.review_count}</div>
                <div className="ms-stat-sub">за всё время</div>
              </div>
              <div className="ms-stat">
                <div className="ms-stat-lbl">Отзывов</div>
                <div className="ms-stat-val">{p.review_count}</div>
                <div className="ms-stat-sub">средняя {p.avg_rating.toFixed(1)}</div>
              </div>
              <div className="ms-stat">
                <div className="ms-stat-lbl">Услуг</div>
                <div className="ms-stat-val">{services.length}</div>
                <div className="ms-stat-sub">в каталоге</div>
              </div>
            </div>

            {/* ARSENAL */}
            <div className="panel">
              <div className="panel-title">
                <h2><span className="ico">🛠</span> Арсенал <b>оборудования</b></h2>
                <span className="count">{arsenal.length} ед.</span>
              </div>
              {arsenal.length === 0 ? (
                <p className="ms-empty">Оснастка пока не заполнена.</p>
              ) : (
                <div className="ms-arsenal">
                  {arsenal.map((a, i) => (
                    <div className="ms-arsenal-item" key={i}>
                      <div className="ms-arsenal-ic">{ARSENAL_ICONS[i % ARSENAL_ICONS.length]}</div>
                      <div className="ms-arsenal-info">
                        <div className="ms-arsenal-name">{a.name}</div>
                        {a.note && <div className="ms-arsenal-desc">{a.note}</div>}
                        <span className="ms-arsenal-tag">рабочий</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SERVICES */}
            <div className="panel">
              <div className="panel-title">
                <h2><span className="ico">⚙️</span> Услуги и <b>навыки</b></h2>
                <span className="count">{services.length} услуг</span>
              </div>
              {services.length === 0 ? (
                <p className="ms-empty">Услуги пока не заполнены.</p>
              ) : (
                <div className="ms-services">
                  {services.map((s, i) => (
                    <div className="ms-service" key={i}>
                      <div className="ms-service-check">{SERVICE_CHECK}</div>
                      <span className="ms-service-text">{s}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* EXPERIENCE */}
            <div className="panel">
              <div className="panel-title">
                <h2><span className="ico">📅</span> Опыт <b>работы</b></h2>
              </div>
              {experience.length === 0 ? (
                <p className="ms-empty">Опыт пока не заполнен.</p>
              ) : (
                <div className="ms-exp">
                  {experience.map((e, i) => (
                    <div className="ms-exp-item" key={i}>
                      <div className="ms-exp-years">{e.year}</div>
                      <div className="ms-exp-content">
                        <div className="ms-exp-title">{e.title}</div>
                        {e.desc && <div className="ms-exp-desc">{e.desc}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PORTFOLIO */}
            <div className="panel">
              <div className="panel-title">
                <h2><span className="ico">📸</span> Портфолио <b>работ</b></h2>
                <span className="count">{portfolio.length} работ</span>
              </div>
              {portfolio.length === 0 ? (
                <p className="ms-empty">Портфолио пока не заполнено.</p>
              ) : (
                <div className="ms-portfolio">
                  {portfolio.map((w, i) => (
                    <div className="ms-portfolio-item" key={i}>
                      <span className="ms-portfolio-ico">🛠</span>
                      <div className="ms-portfolio-title">{w.title}</div>
                      {w.desc && <div className="ms-portfolio-sub">{w.desc}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* B2B */}
            <div className="panel ms-b2b">
              <div className="panel-title">
                <h2><span className="ico">🤝</span> Работа с <b>B2B и аутсорсингом</b></h2>
              </div>
              {b2b.length === 0 ? (
                <p className="ms-empty">B2B-направление не указано.</p>
              ) : (
                <div className="ms-b2b-grid">
                  {b2b.map((b, i) => (
                    <div className="ms-b2b-item" key={i}>
                      <div className="ms-b2b-check">✓</div>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="ms-b2b-note">
                Готов работать с сервисными центрами, магазинами техники и маркетплейсами как подрядчик.
                Возможны регулярные объёмы и работа по договору.
              </div>
            </div>
          </div>

          {/* SIDE COLUMN */}
          <aside className="ms-side">

            <div className="side-card">
              <h3>📞 Контакты</h3>
              {contacts.length === 0 ? (
                <p className="ms-empty">Контакты не указаны.</p>
              ) : (
                <div className="ms-contacts">
                  {contacts.map((ct, i) => (
                    <div className="ms-contact" key={i}>
                      <div className="ms-contact-ic">{CONTACT_ICONS[ct.type] || '✉️'}</div>
                      <div className="ms-contact-txt">
                        <div className="ms-contact-label">{CONTACT_LABELS[ct.type] || ct.type}</div>
                        <div className="ms-contact-value">{ct.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="side-card">
              <h3>⭐ Рейтинг и отзывы</h3>
              <div className="ms-rating">
                <div className="ms-rating-big">{p.avg_rating.toFixed(1)}</div>
                <div className="ms-rating-stars">{ratingStars(p.avg_rating)}</div>
                <div className="ms-rating-count">{p.review_count} отзывов</div>
              </div>
              <div className="ms-rating-bars">
                {[5, 4, 3, 2, 1].map((star) => {
                  const cnt = Number(dist[star]) || 0
                  const pct = Math.round((cnt / distTotal) * 100)
                  return (
                    <div className="ms-rating-bar" key={star}>
                      <span>{star} ★</span>
                      <div className="ms-rating-track"><div className="ms-rating-fill" style={{ width: `${pct}%` }} /></div>
                      <span className="ms-rating-cnt">{cnt}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {c.slug && (
              <div className="side-card">
                <h3>🏬 Витрина мастера</h3>
                <Link to={`/storefront/${c.slug}`} className="btn">Открыть витрину</Link>
              </div>
            )}
          </aside>
        </div>

        {toast && <div className="toast show">{toast}</div>}
      </div>
    )
  }

  // ===================== LIST =====================
  const filtered = q.trim()
    ? list.filter((m) => {
      const c = (m.company && m.company.name) || ''
      const hay = `${c} ${m.city || ''} ${(m.services || []).join(' ')}`.toLowerCase()
      return hay.includes(q.trim().toLowerCase())
    })
    : list

  return (
    <div className="ms-page">
      <div className="bg-blueprint" />
      <div className="ms-container ms-container-list">
        <div className="ms-list-head">
          <div>
            <h2 className="ms-title">Мастера и мастерские</h2>
            <p className="ms-sub">Ремонтники, разборщики и профильные мастерские PartsHub.</p>
          </div>
          <div className="ms-search-wrap">
            <input className="ms-search" placeholder="Поиск по мастерам…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {loading ? (
          <p className="ms-hint">Загрузка…</p>
        ) : filtered.length === 0 ? (
          <p className="ms-hint">Мастера не найдены.</p>
        ) : (
          <div className="ms-grid">
            {filtered.map((m) => <MasterCard key={m.company_id} m={m} />)}
          </div>
        )}
      </div>
    </div>
  )
}
