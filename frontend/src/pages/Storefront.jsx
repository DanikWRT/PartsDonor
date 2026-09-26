import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

const STATUS_LABEL = {
  active: 'В наличии',
  negotiated: 'В переговорах',
  sold: 'Продано',
  hidden: 'Скрыто',
}
const COND_LABEL = {
  working: 'Рабочая',
  for_parts: 'На запчасти',
  untested: 'Не проверена',
  no_guarantee: 'Без гарантии',
}
const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'В наличии' },
  { key: 'negotiated', label: 'В переговорах' },
  { key: 'sold', label: 'Продано' },
  { key: 'hidden', label: 'Скрыто' },
]
const STATUS_CLASS = {
  active: 'sf-status-active',
  negotiated: 'sf-status-negotiated',
  sold: 'sf-status-sold',
  hidden: 'sf-status-hidden',
}
const STATUS_META = {
  active: 'в наличии',
  negotiated: 'в переговорах',
  sold: 'продано',
  hidden: 'скрыто',
}

function emojiFor(title = '') {
  const t = title.toLowerCase()
  if (/батар|аккум|battery|энерг/.test(t)) return '🔋'
  if (/плат|чип|схем|board/.test(t)) return '🔧'
  if (/камер|camera|линз/.test(t)) return '📷'
  if (/диспл|экран|screen|oled|lcd/.test(t)) return '📱'
  if (/шлейф|кабе|кабел|cable|разъем|разъём|заряд|charging|коннект/.test(t)) return '🔌'
  if (/корпус|housing|крышк|backglass/.test(t)) return '🏠'
  if (/гайк|ключ|wrench|инструмент|отверт|вальт/.test(t)) return '🔩'
  return '⚙️'
}

function fmtRub(n) {
  return Number(n || 0).toLocaleString('ru-RU') + ' ₽'
}

function Toast({ message }) {
  return <div className={`toast${message ? ' show' : ''}`}>{message}</div>
}

export default function Storefront() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState({})
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [channel, setChannel] = useState('tg')
  const [shareText, setShareText] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState('')
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState('')

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

  const items = useMemo(() => (data ? data.items : []), [data])

  const filtered = useMemo(() => {
    let list = items
    if (filter !== 'all') list = list.filter((i) => i.status === filter)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((i) => i.title.toLowerCase().includes(q))
    return list
  }, [items, filter, search])

  const countFor = (key) => {
    if (key === 'all') return items.length
    return items.filter((i) => i.status === key).length
  }

  const selectedItems = items.filter((i) => selected[i.id])
  const selectedCount = selectedItems.length
  const selectedSum = selectedItems.reduce((s, i) => s + Number(i.price_rub || 0), 0)

  function toggle(id) {
    setSelected((s) => ({ ...s, [id]: !s[id] }))
  }
  function clearAll() {
    setSelected({})
  }
  function selectAll() {
    const allSel = filtered.every((i) => selected[i.id])
    const next = { ...selected }
    filtered.forEach((i) => { next[i.id] = !allSel })
    setSelected(next)
  }

  function showToast(msg) {
    setToast(msg)
    window.clearTimeout(showToast._t)
    showToast._t = window.setTimeout(() => setToast(''), 2000)
  }

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
      showToast('Текст скопирован')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = shareText
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
      showToast('Текст скопирован')
    }
  }

  async function openShare(targets, ch) {
    const list = targets.filter((i) => i)
    setChannel(ch)
    setShareText('')
    setShareError('')
    setCopied(false)
    setModalOpen(true)
    if (list.length === 0) return
    setShareLoading(true)
    try {
      const r = await fetch('/api/share/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_ids: list.map((i) => i.id), include_links: true, channel: ch }),
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

  function shareSelected(ch) {
    openShare(selectedItems, ch)
  }
  function shareAll() {
    openShare(items.filter((i) => i.status !== 'sold'), channel)
  }

  function shareFromChannelTab(ch) {
    setChannel(ch)
    const targets = selectedItems.length ? selectedItems : items.filter((i) => i.status !== 'sold')
    setShareText('')
    setShareError('')
    setCopied(false)
    if (targets.length === 0) return
    setShareLoading(true)
    fetch('/api/share/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_ids: targets.map((i) => i.id), include_links: true, channel: ch }),
    })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.detail || 'HTTP ' + r.status)
        setShareText(j.text)
      })
      .catch((e) => setShareError('Не удалось сформировать пост: ' + e.message))
      .finally(() => setShareLoading(false))
  }

  async function copyAndOpen() {
    try { await navigator.clipboard.writeText(shareText) } catch { /* noop */ }
    const url = channel === 'tg'
      ? 'https://t.me/share/url?url=' + encodeURIComponent(window.location.href)
      : 'about:blank'
    window.open(url, '_blank')
    showToast('Текст скопирован — вставьте в чат')
  }

  async function copyPublic() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      showToast('Ссылка на витрину скопирована')
    } catch {
      showToast('Не удалось скопировать ссылку')
    }
  }

  if (!slug) {
    return (
      <div className="pd-card sf-container">
        <div className="pd-card-body">
          <div className="pd-card-title">Витрина</div>
          <div className="pd-card-meta">Укажите ссылку на витрину: /storefront/&#123;slug&#125;</div>
        </div>
      </div>
    )
  }

  if (loading) return <div className="sf-container sf-hint">Загрузка витрины…</div>
  if (error || !data) return <div className="sf-container sf-hint">{error || 'Витрина не найдена'}</div>

  const { company, metrics } = data

  return (
    <div className="sf-page">
      <div className="bg-blueprint" aria-hidden="true" />

      <div className="sf-container">
        <div className="sf-hero">
          <div className="sf-hero-left">
            <div className="sf-logo-big">{(company.name || '?').charAt(0).toUpperCase()}</div>
            <div className="sf-info">
              <h1 className="sf-name">
                {company.name}
                {company.verified && <span className="verified">✓ Проверен</span>}
              </h1>
              <div className="sf-meta">
                <span className="sf-meta-item"><span className="sf-star">★</span> <b>{Number(company.rating || 0).toFixed(1)}</b> · {metrics.review_count} отзывов</span>
                <span className="sf-meta-item">📦 <b>{metrics.total_listings}</b> товаров</span>
                <span className="sf-meta-item">🤝 <b>{metrics.total_deals}</b> сделки</span>
              </div>
            </div>
          </div>
          <div className="sf-actions">
            <button type="button" className="btn btn-sm" onClick={copyPublic}>🔗 Pub link</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => shareAll()}>📤 Share list</button>
          </div>
        </div>

        <div className="sf-stats-row">
          <div className="sf-stat-card"><div className="sf-stat-label">Всего товаров</div><div className="sf-stat-value">{metrics.total_listings}</div></div>
          <div className="sf-stat-card"><div className="sf-stat-label">В наличии</div><div className="sf-stat-value sf-green">{metrics.available}</div></div>
          <div className="sf-stat-card"><div className="sf-stat-label">Продано</div><div className="sf-stat-value sf-accent">{metrics.sold}</div></div>
          <div className="sf-stat-card"><div className="sf-stat-label">Сделок</div><div className="sf-stat-value sf-green">{metrics.total_deals}</div></div>
        </div>

        <div className="sf-toolbar">
          <div className="sf-search">
            <span>🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по товарам…"
              aria-label="Поиск по товарам"
            />
          </div>
          <div className="sf-filter-tabs">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`sf-ftab${filter === f.key ? ' active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label} <span className="cnt">{countFor(f.key)}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-sm sf-btn-select" onClick={selectAll}>
            Выбрать все
          </button>
        </div>

        <div className="sf-products-grid">
          {filtered.length === 0 && (
            <div className="sf-empty-state"><span className="emoji">📦</span>Ничего не найдено</div>
          )}
          {filtered.map((it) => (
            <div
              key={it.id}
              className={`sf-product-card${selected[it.id] ? ' selected' : ''}`}
              onClick={() => toggle(it.id)}
            >
              <div className={`sf-prod-select${selected[it.id] ? ' checked' : ''}`} />
              <div className="sf-prod-status sf-prod-status-chip">
                <span className={STATUS_CLASS[it.status] || ''}>{STATUS_LABEL[it.status] || it.status}</span>
              </div>
              <div className="sf-prod-preview">
                <span className="sf-prod-emoji">{emojiFor(it.title)}</span>
              </div>
              <div className="sf-prod-name">{it.title}</div>
              <div className="sf-prod-meta">
                <span>{fmtRub(it.price_rub)}</span>
                <span className="dot">·</span>
                <span>{COND_LABEL[it.condition] || it.condition}</span>
              </div>
              <div className="sf-prod-foot">
                <div className="sf-prod-price">{fmtRub(it.price_rub)}</div>
                <div className="sf-prod-stock">{STATUS_META[it.status] || it.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`sf-action-bar${selectedCount > 0 ? ' show' : ''}`}>
        <div className="sf-ab-info">
          Выбрано: <b>{selectedCount}</b> товаров · на сумму <b>{fmtRub(selectedSum)}</b>
        </div>
        <div className="sf-ab-actions">
          <button type="button" className="btn btn-sm" onClick={clearAll}>Снять</button>
          <button type="button" className="btn btn-sm sf-btn-tg" onClick={() => shareSelected('tg')}>✈️ Telegram</button>
          <button type="button" className="btn btn-sm sf-btn-max" onClick={() => shareSelected('max')}>💬 MAX</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={shareAll}>📋 Все товары</button>
        </div>
      </div>

      {modalOpen && (
        <div className="sf-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sf-modal-head">
              <h2><span className="ico">📤</span> Поделиться списком</h2>
              <button className="sf-close-btn" onClick={() => setModalOpen(false)}>×</button>
            </div>

            <div className="sf-channel-tabs">
              <button type="button" className={`sf-channel-tab${channel === 'tg' ? ' active' : ''}`} data-ch="tg" onClick={() => shareFromChannelTab('tg')}>✈️ Telegram</button>
              <button type="button" className={`sf-channel-tab${channel === 'max' ? ' active' : ''}`} data-ch="max" onClick={() => shareFromChannelTab('max')}>💬 MAX</button>
            </div>

            {shareError && <div className="sf-share-error">{shareError}</div>}

            {shareText ? (
              <div className="sf-post-preview">{shareText}</div>
            ) : shareLoading ? (
              <div className="sf-post-preview sf-loading">Формируем пост…</div>
            ) : (
              <div className="sf-empty-state"><span className="emoji">📦</span>Нет товаров для публикации</div>
            )}

            <div className="sf-modal-actions">
              <button type="button" className="btn" onClick={copyShare}>
                {copied ? '✓ Скопировано' : '📋 Копировать'}
              </button>
              <button type="button" className="btn btn-primary" onClick={copyAndOpen}>
                🚀 Открыть и вставить
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  )
}
