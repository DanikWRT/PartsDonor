import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { authFetch, readSession } from '../auth.jsx'

const RUBRICS = ['схемы', 'разборка', 'совместимость', 'лайфхаки', 'ремонт']

export default function Kb() {
  const { id } = useParams()
  const session = readSession()

  const [cats, setCats] = useState([])
  const [articles, setArticles] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('newest')

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ cat: '', title: '', excerpt: '', body: '', model: '', tags: '', priority: 0 })

  useEffect(() => {
    fetch('/api/kb/categories')
      .then((r) => (r.ok ? r.json() : []))
      .then(setCats)
      .catch(() => setCats([]))
  }, [])

  useEffect(() => {
    if (id) {
      fetch(`/api/kb/articles/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setSelected)
        .catch(() => setSelected(null))
    }
  }, [id])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (cat) params.set('cat', cat)
    if (sort) params.set('sort', sort)
    if (q.trim()) params.set('q', q.trim())
    fetch(`/api/kb/articles?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setArticles)
      .catch(() => setArticles([]))
      .finally(() => setLoading(false))
  }, [cat, sort, q])

  function openModal() {
    setForm({ cat: cats[0]?.slug || '', title: '', excerpt: '', body: '', model: '', tags: '', priority: 0 })
    setShowModal(true)
  }

  async function publish(e) {
    e.preventDefault()
    const body = {
      cat: form.cat || cats[0]?.slug || '',
      title: form.title,
      excerpt: form.excerpt,
      body: form.body,
      model: form.model,
      tags: form.tags,
      priority: Number(form.priority) || 0,
    }
    const r = await authFetch('/api/kb/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) {
      setShowModal(false)
      setQ('')
      // refresh both list and categories' counts
      setCat('')
      setSort((s) => s)
      fetch('/api/kb/categories').then((x) => x.ok && x.json()).then(setCats).catch(() => {})
    } else {
      alert('Не удалось опубликовать статью')
    }
  }

  // detail view
  if (selected) {
    return (
      <div className="pd-kb">
        <button type="button" className="pd-btn" onClick={() => setSelected(null)}>← К списку</button>
        <div className="pd-kb-detail">
          <div className="pd-kb-detail-top">
            <span className="pd-chip">{selected.cat}</span>
            {selected.model && <span className="pd-badge">Модель: {selected.model}</span>}
            {selected.priority > 0 && <span className="pd-badge pd-badge-prime">Приоритет {selected.priority}</span>}
          </div>
          <h2>{selected.title}</h2>
          {selected.excerpt && <p className="pd-kb-excerpt">{selected.excerpt}</p>}
          <div className="pd-kb-meta">
            <span>👤 {selected.author_name || 'Аноним'}</span>
            <span>⭐ {selected.rating.toFixed(1)} ({selected.votes})</span>
            <span>👁 {selected.views}</span>
          </div>
          {selected.tags && <div className="pd-kb-tags">{(selected.tags + '').split(',').filter(Boolean).map((t) => <span key={t} className="pd-chip">#{t}</span>)}</div>}
          <div className="pd-kb-body">{selected.body.split('\n').map((p, i) => <p key={i}>{p}</p>)}</div>
          <button type="button" className="pd-btn pd-btn-primary" onClick={async () => {
            const r = await fetch(`/api/kb/articles/${selected.id}/vote`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rating: 5, delta: 1 }),
            })
            if (r.ok) { const up = await r.json(); setSelected(up) }
          }}>👍 Полезно (голос 5)</button>
        </div>
      </div>
    )
  }

  return (
    <div className="pd-kb">
      <div className="pd-kb-head">
        <div>
          <h2>База знаний</h2>
          <p className="pd-muted">Схемы, разборки, совместимость и ремонт телефонов.</p>
        </div>
        {session && <button type="button" className="pd-btn pd-btn-primary" onClick={openModal}>Написать статью</button>}
      </div>

      <div className="pd-filters">
        <input className="pd-search" placeholder="Поиск по базе знаний…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="pd-kb-tabs">
          <button type="button" className={`pd-kb-tab ${cat === '' ? 'active' : ''}`} onClick={() => setCat('')}>Все</button>
          {cats.map((c) => (
            <button key={c.slug} type="button" className={`pd-kb-tab ${cat === c.slug ? 'active' : ''}`} onClick={() => setCat(c.slug)}>
              {c.name} <span className="pd-kb-count">{c.article_count}</span>
            </button>
          ))}
        </div>
        <div className="pd-filter-row">
          <label className="pd-muted">Сортировка:</label>
          <select className="pd-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Сначала новые</option>
            <option value="popular">Популярные</option>
            <option value="rating">По рейтингу</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="pd-hint">Загрузка…</p>
      ) : articles.length === 0 ? (
        <p className="pd-muted">Статьи не найдены.</p>
      ) : (
        <div className="pd-kb-list">
          {articles.map((a) => (
            <Link key={a.id} to={`/kb/${a.id}`} className="pd-kb-card" onClick={() => setSelected(a)}>
              <div className="pd-kb-card-top">
                <span className="pd-chip">{a.cat}</span>
                {a.model && <span className="pd-badge">{a.model}</span>}
                {a.priority > 0 && <span className="pd-badge pd-badge-prime">Приоритет {a.priority}</span>}
              </div>
              <strong className="pd-kb-card-title">{a.title}</strong>
              {a.excerpt && <p className="pd-kb-excerpt">{a.excerpt}</p>}
              <div className="pd-kb-meta">
                <span>👤 {a.author_name || 'Аноним'}</span>
                <span>⭐ {a.rating.toFixed(1)} ({a.votes})</span>
                <span>👁 {a.views}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showModal && (
        <div className="pd-modal">
          <div className="pd-modal-box">
            <h3>Написать статью</h3>
            <form onSubmit={publish} className="pd-kb-form">
              <label>Рубрика
                <select className="pd-select" value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })}>
                  {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </label>
              <label>Заголовок
                <input className="pd-search" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </label>
              <label>Модель телефона (необязательно)
                <input className="pd-search" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </label>
              <label>Теги через запятую
                <input className="pd-search" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </label>
              <label>Аннотация (кратко)
                <textarea className="pd-search" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
              </label>
              <label>Текст статьи
                <textarea className="pd-search pd-kb-textarea" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
              </label>
              <label>Приоритет (0-10)
                <input className="pd-search" type="number" min="0" max="10" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
              </label>
              <div className="pd-kb-form-actions">
                <button type="button" className="pd-btn" onClick={() => setShowModal(false)}>Отмена</button>
                <button type="submit" className="pd-btn pd-btn-primary">Опубликовать</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
