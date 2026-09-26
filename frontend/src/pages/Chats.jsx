import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authFetch, readSession } from '../auth.jsx'

// Список диалогов текущего пользователя (GET /dialogs).
const KINDS = { text: 'сообщение', offer: 'оффер', attachment: 'файл' }

const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function preview(msg) {
  if (!msg) return 'Нет сообщений'
  if (msg.kind === 'offer') return `💰 Оффер ${msg.body ? '· ' + msg.body : ''}`
  if (msg.kind === 'attachment') return '📎 Вложение'
  return msg.body || ''
}

export default function Chats() {
  const navigate = useNavigate()
  const [dialogs, setDialogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [session, setSession] = useState(readSession())

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

  const open = (id) => {
    authFetch(`/api/dialogs/${id}/read`, { method: 'POST' }).catch(() => {})
    navigate(`/chat/${id}`)
  }

  if (loading) return <p className="pd-hint">Загрузка сообщений…</p>

  if (!session) {
    return (
      <div className="pd-cabinet pd-chat-list">
        <h2>Сообщения</h2>
        <p className="pd-hint-login">
          <Link to="/login">Войдите</Link>, чтобы видеть диалоги.
        </p>
      </div>
    )
  }

  return (
    <div className="pd-cabinet pd-chat-list">
      <div className="pd-chat-list-head">
        <h2>Сообщения</h2>
        <Link className="pd-back-link" to="/cabinet">← Назад</Link>
      </div>
      {err && <p className="pd-form-err">{err}</p>}
      {dialogs.length === 0 ? (
        <p className="pd-muted">Диалогов пока нет. Начните общение со встречной стороной по объявлению.</p>
      ) : (
        <ul className="pd-list pd-chat-dialogs">
          {dialogs.map((d) => (
            <li key={d.id}>
              <button type="button" className="pd-chat-row" onClick={() => open(d.id)}>
                <div className="pd-chat-row-main">
                  <strong>{d.other_participant_name || 'Участник'}</strong>
                  <span className="pd-chat-preview">{preview(d.last_message)}</span>
                </div>
                <div className="pd-chat-row-meta">
                  {d.unread_count > 0 && (
                    <span className="pd-badge pd-status-accepted pd-chat-unread">{d.unread_count}</span>
                  )}
                  <span className="pd-muted pd-chat-time">
                    {fmtTime(d.updated_at || d.created_at)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
