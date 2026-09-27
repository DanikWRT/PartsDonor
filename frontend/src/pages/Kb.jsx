import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { authFetch, readSession } from '../auth.jsx'

const RUBRIC_LABEL = {
  схемы: 'Схемы', разборка: 'Разборка', совместимость: 'Совместимость',
  лайфхаки: 'Лайфхаки', ремонт: 'Ремонт',
}
const RUBRIC_EMOJI = {
  схемы: '📐', разборка: '⚙️', совместимость: '🔗', лайфхаки: '💡', ремонт: '🔧',
}
// labels used in the publication modal (short forms per spec)
const MODAL_LABELS = [
  { slug: 'схемы', label: '📐 Схема' },
  { slug: 'разборка', label: '⚙️ Разборка' },
  { slug: 'совместимость', label: '🔗 Совместимость' },
  { slug: 'лайфхаки', label: '💡 Лайфхак' },
  { slug: 'ремонт', label: '🔧 Ремонт' },
]

const numberRu = (n) => (n == null ? '0' : Number(n).toLocaleString('ru-RU'))

// deterministic gradient avatar from a string hash
function avatarStyle(name) {
  let h = 0
  const s = String(name || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  const hue = h % 360
  return { background: `linear-gradient(135deg, hsl(${hue},72%,44%), hsl(${(hue + 55) % 360},72%,36%))` }
}
const initials = (name) => (String(name || '?').trim().charAt(0) || '?').toUpperCase()

function buildTags(list) {
  const freq = {}
  for (const a of list) {
    String(a.tags || '').split(',').map((t) => t.trim()).filter(Boolean)
      .forEach((t) => { freq[t] = (freq[t] || 0) + 1 })
  }
  return Object.entries(freq).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([t]) => t)
}

const HERO_CARDS = [
  { icon: '📚', label: 'Статей' },
  { icon: '👨‍🔧', label: 'Авторов' },
  { icon: '👁', label: 'Просмотров' },
  { icon: '⭐', label: 'Средний рейтинг' },
]

export default function Kb() {
  const { id } = useParams()
  const session = readSession()

  const [cats, setCats] = useState([])
  const [articles, setArticles] = useState([])   // filtered grid list
  const [all, setAll] = useState([])             // full list (<=100) -> hero/tags
  const [topAuthors, setTopAuthors] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('priority')

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ cat: '', title: '', excerpt: '', body: '', model: '', tags: '', link: '' })
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    fetch('/api/kb/categories').then((r) => (r.ok ? r.json() : [])).then(setCats).catch(() => setCats([]))
    fetch('/api/kb/articles?limit=100').then((r) => (r.ok ? r.json() : [])).then(setAll).catch(() => setAll([]))
    fetch('/api/kb/authors/top?limit=5').then((r) => (r.ok ? r.json() : [])).then(setTopAuthors).catch(() => setTopAuthors([]))
  }, [])

  useEffect(() => {
    if (!id) { setSelected(null); return }
    fetch(`/api/kb/articles/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setSelected)
      .catch(() => setSelected(null))
  }, [id])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (cat) params.set('cat', cat)
    if (q.trim()) params.set('q', q.trim())
    const backendSort = sort === 'priority' ? 'newest' : sort
    if (backendSort) params.set('sort', backendSort)
    fetch(`/api/kb/articles?${params.toString()}&limit=100`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        let out = list
        if (sort === 'priority') {
          out = [...list].sort((a, b) =>
            (b.priority || 0) - (a.priority || 0) ||
            new Date(b.created_at) - new Date(a.created_at)
          )
        }
        setArticles(out)
      })
      .catch(() => setArticles([]))
      .finally(() => setLoading(false))
  }, [cat, sort, q])

  const heroStats = useMemo(() => {
    const authors = new Set(all.map((a) => a.author_id || a.author_name || a.author)).size
    const views = all.reduce((s, a) => s + (a.views || 0), 0)
    const avg = all.length ? all.reduce((s, a) => s + (a.rating || 0), 0) / all.length : 0
    return [numberRu(all.length), numberRu(authors), numberRu(views), avg.toFixed(1)]
  }, [all])

  const tagList = useMemo(() => buildTags(all), [all])

  function openModal() {
    setForm({ cat: '', title: '', excerpt: '', body: '', model: '', tags: '', link: '' })
    setShowModal(true)
  }

  async function publish(e) {
    e.preventDefault()
    if (!form.cat) { alert('Выберите рубрику'); return }
    setPublishing(true)
    let body = form.body
    if (form.link.trim()) body = `${body}\n\nСсылка: ${form.link.trim()}`
    const payload = {
      cat: form.cat,
      title: form.title,
      excerpt: form.excerpt,
      body,
      model: form.model,
      tags: form.tags,
      priority: 0,
    }
    const r = await authFetch('/api/kb/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setPublishing(false)
    if (r.ok) {
      setShowModal(false)
      setQ('')
      setCat('')
      Promise.all([
        fetch('/api/kb/categories').then((x) => (x.ok ? x.json() : [])).then(setCats),
        fetch('/api/kb/articles?limit=100').then((x) => (x.ok ? x.json() : [])).then(setAll),
        fetch('/api/kb/authors/top?limit=5').then((x) => (x.ok ? x.json() : [])).then(setTopAuthors),
      ]).catch(() => {})
    } else {
      alert('Не удалось опубликовать статью')
    }
  }

  async function vote() {
    const r = await fetch(`/api/kb/articles/${selected.id}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 5, delta: 1 }),
    })
    if (r.ok) { const up = await r.json(); setSelected(up) }
  }

  // ---- detail view ----
  if (selected) {
    return (
      <div className="kb-page">
        <div className="bg-blueprint" aria-hidden="true" />
        <div className="kb-container kb-detail">
          <button type="button" className="kb-btn kb-btn-back" onClick={() => setSelected(null)}>← К списку</button>
          <article className="kb-art">
            <div className="kb-art-top">
              <span className="kb-chip">{RUBRIC_EMOJI[selected.cat] || ''} {RUBRIC_LABEL[selected.cat] || selected.cat}</span>
              {selected.model && <span className="kb-model-badge">📱 {selected.model}</span>}
              {selected.priority > 0 && <span className="kb-priority-badge">★ Приоритет {selected.priority}</span>}
            </div>
            <h1 className="kb-art-title">{selected.title}</h1>
            {selected.excerpt && <p className="kb-art-excerpt">{selected.excerpt}</p>}
            <div className="kb-meta-row">
              <span>👤 {selected.author_name || 'Аноним'}</span>
              <span>⭐ {Number(selected.rating || 0).toFixed(1)} ({selected.votes})</span>
              <span>👁 {numberRu(selected.views)}</span>
              <span className="kb-stamp">{new Date(selected.created_at).toLocaleDateString('ru-RU')}</span>
            </div>
            {selected.tags ? (
              <div className="kb-art-tags">
                {String(selected.tags).split(',').filter(Boolean).map((t) => (
                  <span key={t} className="kb-tag">#{t.trim()}</span>
                ))}
              </div>
            ) : null}
            <div className="kb-art-body">
              {String(selected.body || '').split('\n').filter((l, i, arr) => !(l.trim() === '' && (i === 0 || i === arr.length - 1))).map((p, i) => (
                p.trim() === '' ? <div key={i} className="kb-body-gap" /> : <p key={i}>{p}</p>
              ))}
            </div>
            <div className="kb-art-actions">
              <button type="button" className="kb-btn kb-btn-primary kb-btn-vote" onClick={vote}>👍 Полезно</button>
              <span className="kb-vote-note">Поможет автору получить рейтинг</span>
            </div>
          </article>
        </div>
      </div>
    )
  }

  // ---- landing / list ----
  return (
    <div className="kb-page">
      <div className="bg-blueprint" aria-hidden="true" />
      <div className="kb-container">
        {/* page head (btnCreate in header, only when logged in) */}
        <div className="kb-head">
          <span className="kb-head-brand">🧭 База знаний</span>
          {session && <button type="button" className="kb-btn kb-btn-primary kb-create-btn" onClick={openModal}>✍️ Новая статья</button>}
        </div>

        {/* HERO */}
        <section className="kb-hero">
          <div className="kb-hero-text">
            <h1 className="kb-hero-title">База знаний для мастеров</h1>
            <p className="kb-hero-sub">Схемы, лайфхаки, разборка, совместимость ревизий, проверенные способы ремонта. Публикуйте свой опыт — получайте рейтинг, который поднимает вас в приоритет в выдаче площадки.</p>
          </div>
          <div className="kb-hero-stats">
            {HERO_CARDS.map((c, i) => (
              <div className="kb-hero-stat" key={c.label}>
                <span className="kb-hero-stat-ico">{c.icon}</span>
                <span className="kb-hero-stat-val">{heroStats[i]}</span>
                <span className="kb-hero-stat-label">{c.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 3-column layout */}
        <div className="kb-layout">
          {/* LEFT COL */}
          <aside className="kb-left">
            <div className="kb-nav-card">
              <h3 className="kb-nav-title">Рубрики</h3>
              <div className="kb-cat-list">
                <button type="button" className={`kb-cat-item${cat === '' ? ' active' : ''}`} onClick={() => setCat('')}>
                  <span className="kb-cat-name">Все статьи</span>
                  <span className="kb-cat-count">{numberRu(all.length)}</span>
                </button>
                {cats.map((c) => (
                  <button key={c.slug} type="button" className={`kb-cat-item${cat === c.slug ? ' active' : ''}`} onClick={() => setCat(c.slug)}>
                    <span className="kb-cat-name">{RUBRIC_EMOJI[c.slug] ? `${RUBRIC_EMOJI[c.slug]} ${RUBRIC_LABEL[c.slug] || c.name}` : c.name}</span>
                    <span className="kb-cat-count">{numberRu(c.article_count)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="kb-nav-card">
              <h3 className="kb-nav-title">Популярные теги</h3>
              <div className="kb-art-tags">
                {tagList.length === 0 ? <span className="kb-muted-sm">Пока нет тегов</span> : tagList.map((t) => (
                  <button key={t} type="button" className="kb-tag kb-tag-btn" onClick={() => setQ(t)}>#{t}</button>
                ))}
              </div>
            </div>
          </aside>

          {/* MAIN */}
          <main className="kb-main">
            <div className="kb-toolbar">
              <div className="kb-search">
                <span className="kb-search-ico">🔍</span>
                <input
                  id="searchInput"
                  placeholder="Поиск по базе знаний…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {q && <button type="button" className="kb-search-clear" onClick={() => setQ('')}>✕</button>}
              </div>
              <select className="kb-sort-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Сортировка">
                <option value="priority">Сначала с приоритетом</option>
                <option value="rating">По рейтингу</option>
                <option value="popular">По просмотрам</option>
                <option value="newest">Сначала новые</option>
              </select>
            </div>

            {loading ? (
              <p className="kb-hint">Загрузка…</p>
            ) : articles.length === 0 ? (
              <p className="kb-empty">Статьи не найдены.{all.length === 0 ? ' Станьте первым автором!' : ' Попробуйте изменить фильтры.'}</p>
            ) : (
              <div className="kb-articles-grid">
                {articles.map((a) => (
                  <Link key={a.id} to={`/kb/${a.id}`} className="kb-card">
                    <div className="kb-card-top">
                      <span className="kb-chip">{RUBRIC_EMOJI[a.cat] || ''} {RUBRIC_LABEL[a.cat] || a.cat}</span>
                      {a.priority > 0 && <span className="kb-priority-badge">★ приоритет {a.priority}</span>}
                    </div>
                    <strong className="kb-card-title">{a.title}</strong>
                    {a.excerpt && <p className="kb-card-excerpt">{a.excerpt}</p>}
                    <div className="kb-meta-row">
                      <span>👤 {a.author_name || 'Аноним'}</span>
                      <span>⭐ {(a.rating || 0).toFixed(1)} ({a.votes})</span>
                      <span>👁 {numberRu(a.views)}</span>
                    </div>
                    {a.model && <span className="kb-model-badge kb-card-model">📱 {a.model}</span>}
                  </Link>
                ))}
              </div>
            )}
          </main>

          {/* RIGHT COL */}
          <aside className="kb-right">
            <div className="kb-side-card">
              <h3 className="kb-side-title">🏆 Топ авторов</h3>
              {topAuthors.length === 0 ? (
                <p className="kb-muted-sm">Пока нет авторов</p>
              ) : (
                <div className="kb-top-authors">
                  {topAuthors.map((a, i) => (
                    <div className="kb-author-row" key={a.author_id || i}>
                      <span className="kb-author-rank">{i + 1}</span>
                      <span className="kb-author-avatar" style={avatarStyle(a.author_name)}>{initials(a.author_name)}</span>
                      <div className="kb-author-info">
                        <span className="kb-author-name">{a.author_name}</span>
                        <span className="kb-author-stats">{a.article_count} ст. · {numberRu(a.total_views)} просм. · ⭐ {a.total_rating}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="kb-side-card">
              <h3 className="kb-side-title">⭐ Как работает рейтинг</h3>
              <p className="kb-priority-note">Авторы с высоким рейтингом получают приоритет в выдаче площадки: их товары показываются выше, а статьи — в топе базы знаний. Рейтинг формируется из оценок читателей, просмотров и отзывов мастеров.</p>
            </div>
          </aside>
        </div>
      </div>

      {/* PUBLICATION MODAL */}
      {showModal && (
        <div className="kb-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="kb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="kb-modal-head">
              <h2 className="kb-modal-title">✍️ Новая статья</h2>
              <button type="button" className="kb-close-btn" onClick={() => setShowModal(false)} aria-label="Закрыть">✕</button>
            </div>
            <form onSubmit={publish} className="kb-form-grid">
              <label className="kb-field kb-field-full">
                <span className="kb-field-label">Рубрика <span className="kb-req">*</span></span>
                <div className="kb-choice-group">
                  {MODAL_LABELS.map((m) => (
                    <button
                      key={m.slug}
                      type="button"
                      className={`kb-choice${form.cat === m.slug ? ' active' : ''}`}
                      onClick={() => setForm({ ...form, cat: m.slug })}
                    >{m.label}</button>
                  ))}
                </div>
              </label>
              <label className="kb-field kb-field-full">
                <span className="kb-field-label">Заголовок <span className="kb-req">*</span></span>
                <input className="kb-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Например: Замена аккумулятора iPhone X" />
              </label>
              <label className="kb-field kb-field-full">
                <span className="kb-field-label">Краткое описание <span className="kb-req">*</span></span>
                <textarea className="kb-input kb-textarea" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} required placeholder="2–3 предложения о статье" />
              </label>
              <div className="kb-field-row">
                <label className="kb-field">
                  <span className="kb-field-label">Модель / устройство</span>
                  <input className="kb-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="iPhone 11, Xiaomi…" />
                </label>
                <label className="kb-field">
                  <span className="kb-field-label">Теги (через запятую)</span>
                  <input className="kb-input" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="батарея, ремонт, iphone" />
                </label>
              </div>
              <label className="kb-field kb-field-full">
                <span className="kb-field-label">Текст статьи / инструкция <span className="kb-req">*</span></span>
                <textarea className="kb-input kb-textarea kb-textarea-lg" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required placeholder="Полный текст…" />
              </label>
              <label className="kb-field kb-field-full">
                <span className="kb-field-label">Ссылка на схему / фото (необязательно)</span>
                <input className="kb-input" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" />
              </label>
              <div className="kb-form-actions kb-field-full">
                <button type="button" className="kb-btn kb-btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
                <button type="submit" className="kb-btn kb-btn-primary" disabled={publishing}>{publishing ? 'Публикация…' : 'Опубликовать статью'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
