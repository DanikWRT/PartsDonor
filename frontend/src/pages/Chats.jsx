import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authFetch, readSession } from '../auth.jsx'
import WindowedList from '../components/WindowedList.jsx'

// -------- helpers (shared by list + view) --------

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#4fa3ff,#7cf7d0)',
  'linear-gradient(135deg,#8b5cf6,#60a5fa)',
  'linear-gradient(135deg,#f472b6,#a78bfa)',
  'linear-gradient(135deg,#34d399,#22d3ee)',
  'linear-gradient(135deg,#fbbf24,#f472b6)',
  'linear-gradient(135deg,#60a5fa,#34d399)',
]
const hashStr = (s = '') => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}
export const avGrad = (name) => AVATAR_GRADIENTS[hashStr(name || '') % AVATAR_GRADIENTS.length]
export const initialLetter = (name = '') => (name.trim()[0] || '?').toUpperCase()

export const ROLE_TAG = { buyer: 'Покупатель', seller: 'Продавец' }
const nowKey = () => new Date().toDateString()

export const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  if (d.toDateString() === nowKey()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function previewMsg(msg) {
  if (!msg) return 'Нет сообщений'
  if (msg.kind === 'offer') return `💰 Оффер${msg.body ? ' · ' + msg.body : ''}`
  if (msg.kind === 'attachment') return '📎 Вложение'
  return msg.body || ''
}

// other participant role is not provided by the backend; infer from my own role.
const otherRole = (myRole) => (myRole === 'seller' ? 'buyer' : myRole === 'buyer' ? 'seller' : null)

export const DialogRow = React.memo(function DialogRow({ d, active, onClick, myRole }) {
  const role = otherRole(myRole)
  return (
    <button type="button" className={'ch-row' + (active ? ' active' : '')} onClick={onClick}>
      <span className="ch-avatar" style={{ background: avGrad(d.other_participant_name) }}>
        {initialLetter(d.other_participant_name)}
      </span>
      <span className="ch-row-main">
        <span className="ch-row-top">
          <strong className="ch-row-name">{d.other_participant_name || 'Участник'}</strong>
          <span className="ch-row-time">{fmtTime(d.updated_at || d.created_at)}</span>
        </span>
        <span className="ch-row-sub">
          {role && (
            <span className={'ch-role ch-role-' + role}>{ROLE_TAG[role]}</span>
          )}
          <span className="ch-row-preview">{previewMsg(d.last_message)}</span>
        </span>
      </span>
      {d.unread_count > 0 && <span className="ch-unread">{d.unread_count}</span>}
    </button>
  )
})

// ChatList — shared dialog list used by both /chats (standalone) and the left
// column of the 3-column chat view.
export function ChatList({ activeId, onOpen }) {
  const navigate = useNavigate()
  const [dialogs, setDialogs] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'unread'
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const myRole = readSession()?.role

  const load = () => {
    authFetch('/api/dialogs')
      .then(async (r) => {
        if (!r.ok) throw new Error('Ошибка загрузки диалогов')
        setDialogs(await r.json())
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [])

  const totalUnread = useMemo(
    () => dialogs.reduce((s, d) => s + (d.unread_count || 0), 0),
    [dialogs]
  )

  const filtered = useMemo(() => {
    let list = dialogs
    if (filter === 'unread') list = list.filter((d) => (d.unread_count || 0) > 0)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((d) => {
        const name = (d.other_participant_name || '').toLowerCase()
        const body = ((d.last_message && d.last_message.body) || '').toLowerCase()
        return name.includes(q) || body.includes(q)
      })
    }
    return list
  }, [dialogs, filter, search])

  const open = (d) => {
    authFetch(`/api/dialogs/${d.id}/read`, { method: 'POST' }).catch(() => {})
    if (onOpen) onOpen(d.id)
    else navigate('/chat/' + d.id)
  }

  return (
    <aside className="ch-list">
      <div className="ch-list-head">
        <h2 className="ch-title">Диалоги</h2>
        <div className="ch-chips">
          <button
            type="button"
            className={'ch-chip' + (filter === 'all' ? ' active' : '')}
            onClick={() => setFilter('all')}
          >
            Все
          </button>
          <button
            type="button"
            className={'ch-chip' + (filter === 'unread' ? ' active' : '')}
            onClick={() => setFilter('unread')}
          >
            Непрочитанные
            {totalUnread > 0 && <span className="ch-chip-count">{totalUnread}</span>}
          </button>
        </div>
      </div>

      <div className="ch-search">
        <span className="ch-search-ico">🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по диалогам..."
          aria-label="Поиск по диалогам"
        />
        {search && (
          <button type="button" className="ch-search-clear" onClick={() => setSearch('')} aria-label="Очистить">
            ✕
          </button>
        )}
      </div>

      <div className="ch-list-body">
        {err && <p className="ch-err">{err}</p>}
        {!err && loading && <p className="ch-hint">Загрузка сообщений…</p>}
        {filtered.length === 0 ? (
          <p className="ch-hint">
            {search || filter === 'unread'
              ? 'Ничего не найдено'
              : 'Диалогов пока нет. Начните общение со встречной стороной по объявлению.'}
          </p>
        ) : (
          <WindowedList
            items={filtered}
            rowHeight={72}
            resetKey={filtered.length + ':' + filter + ':' + search}
            className="ch-list-inner"
            renderItem={(d, i) => (
              <DialogRow key={d.id} d={d} active={String(d.id) === String(activeId)} onClick={() => open(d)} myRole={myRole} />
            )}
          />
        )}
      </div>
    </aside>
  )
}

// -------- /chats standalone page (left column) --------
export default function Chats() {
  const session = readSession()

  if (!session) {
    return (
      <div className="ch-page">
        <div className="bg-blueprint" aria-hidden="true" />
        <div className="ch-panel ch-panel-solo">
          <p className="ch-hint ch-hint-login">
            <Link to="/login">Войдите</Link>, чтобы видеть диалоги.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="ch-page">
      <div className="bg-blueprint" aria-hidden="true" />
      <div className="ch-panel ch-panel-solo">
        <ChatList />
      </div>
    </div>
  )
}
