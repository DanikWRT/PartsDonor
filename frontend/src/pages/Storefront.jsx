import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const STATUS_LABEL = {
  active: 'на продаже',
  negotiated: 'в переговорах',
  sold: 'продано',
  hidden: 'скрыто',
}
const COND_LABEL = {
  working: 'рабочая',
  for_parts: 'на запчасти',
  untested: 'не проверена',
  no_guarantee: 'без гарантии',
}

function Storefront() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState({})
  const [note, setNote] = useState('')
  const [shareText, setShareText] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!slug) {
      setLoading(false)
      setError('')
      return
    }
    setLoading(true)
    fetch(`/api/storefront/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json()
      })
      .then((d) => { setData(d); setError('') })
      .catch((e) => { setError('Не удалось загрузить витрину: ' + e.message); setData(null) })
      .finally(() => setLoading(false))
  }, [slug])

  function toggle(id) {
    setSelected((s) => ({ ...s, [id]: !s[id] }))
  }
  const ids = data ? data.items.filter((i) => selected[i.id]).map((i) => i.id) : []

  async function doShare() {
    if (!ids.length) return
    setShareLoading(true)
    setShareError('')
    setCopied(false)
    try {
      const r = await fetch('/api/share/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_ids: ids, note, include_links: true }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.detail || 'HTTP ' + r.status)
      setShareText(j.text)
    } catch (e) {
      setShareError('Не удалось сформировать пост: ' + e.message)
    } finally {
      setShareLoading(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  if (!slug) {
    return (
      <div className="pd-card">
        <div className="pd-card-body">
          <div className="pd-card-title">Витрина</div>
          <div className="pd-card-meta">Укажите ссылку на витрину: /storefront/&#123;slug&#125;</div>
        </div>
      </div>
    )
  }

  if (loading) return <div className="pd-hint">Загрузка витрины…</div>
  if (error || !data) return <div className="pd-hint">{error || 'Витрина не найдена'}</div>

  const { company, metrics, rating_distribution: dist, items } = data
  const maxDist = Math.max(1, ...Object.values(dist))
  const verified = company.verified ? ' ✓ верифицирован' : ''

  return (
    <div className="pd-storefront">
      {/* hero */}
      <div className="pd-st-hero pd-panel">
        <h2 className="pd-st-name">🏪 {company.name}{verified}</h2>
        <div className="pd-st-rating">★ {Number(company.rating || 0).toFixed(2)} · {metrics.review_count} отзывов</div>
        <div className="pd-st-dist">
          {[5, 4, 3, 2, 1].map((n) => (
            <div className="pd-st-dist-row" key={n}>
              <span className="pd-st-dist-label">{n}★</span>
              <div className="pd-st-dist-bar"><div className="pd-st-dist-fill" style={{ width: `${(dist[n] || 0) / maxDist * 100}%` }} /></div>
              <span className="pd-st-dist-count">{dist[n] || 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* metrics */}
      <div className="pd-st-metrics">
        <div className="pd-st-metric"><b>{metrics.total_listings}</b><span>Всего</span></div>
        <div className="pd-st-metric"><b>{metrics.available}</b><span>На продаже</span></div>
        <div className="pd-st-metric"><b>{metrics.sold}</b><span>Продано</span></div>
        <div className="pd-st-metric"><b>{metrics.total_deals}</b><span>Сделок</span></div>
      </div>

      {/* share bar */}
      <div className="pd-st-sharebar pd-panel">
        <input
          className="pd-search"
          placeholder="Комментарий к посту (необязательно)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="button"
          className="pd-btn pd-btn-primary"
          disabled={!ids.length || shareLoading}
          onClick={doShare}
        >
          {shareLoading ? 'Готовим…' : `Поделиться (${ids.length})`}
        </button>
        {shareError && <div className="pd-hint" style={{ color: '#b91c1c' }}>{shareError}</div>}
      </div>

      {/* items */}
      <div className="pd-listings">
        {items.length === 0 && <div className="pd-hint">Пока нет объявлений</div>}
        {items.map((it) => (
          <label className="pd-listing pd-st-item" key={it.id}>
            <div className="pd-listing-main">
              <div className="pd-listing-title">{it.title}</div>
              <div className="pd-card-price">{Number(it.price_rub).toLocaleString('ru-RU')} ₽</div>
              <div className="pd-st-pills">
                <span className={`pd-badge pd-badge-cond-${it.condition}`}>{COND_LABEL[it.condition] || it.condition}</span>
                <span className={`pd-badge pd-badge-status-${it.status}`}>{STATUS_LABEL[it.status] || it.status}</span>
              </div>
            </div>
            <div className="pd-st-check">
              <input type="checkbox" checked={!!selected[it.id]} onChange={() => toggle(it.id)} />
            </div>
          </label>
        ))}
      </div>

      {/* share modal */}
      {shareText && (
        <div className="pd-modal-overlay" onClick={() => setShareText('')}>
          <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="pd-modal-title">Готовый пост</h3>
            <textarea className="pd-modal-text" readOnly value={shareText} rows={12} />
            <div className="pd-modal-actions">
              <button type="button" className="pd-btn" onClick={copy}>
                {copied ? 'Скопировано ✓' : 'Копировать'}
              </button>
              <button type="button" className="pd-btn pd-btn-primary" onClick={() => setShareText('')}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Storefront
