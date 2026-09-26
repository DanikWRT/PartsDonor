import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { authFetch, readSession } from '../auth.jsx'

const MONEY = (n) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('ru-RU') + ' ₽' : ''
const TIME = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
const KINDS = { text: 'сообщение', offer: 'оффер', attachment: 'файл' }

// Диалог: лента + композер. Поллинг каждые ~5с, пометка прочитанным при открытии.
export default function ChatView() {
  const { id } = useParams()
  const bottomRef = useRef(null)
  const [dialog, setDialog] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [offerMode, setOfferMode] = useState(false)
  const [offerPrice, setOfferPrice] = useState('')
  const [err, setErr] = useState(null)
  const [sending, setSending] = useState(false)
  const [kindMsg, setKindMsg] = useState(null)

  const meId = readSession()?.user_id

  const load = () => {
    authFetch(`/api/dialogs/${id}`)
      .then(async (r) => (r.ok ? setDialog(await r.json()) : null))
      .catch(() => {})
    authFetch(`/api/dialogs/${id}/messages`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Нет доступа к диалогу')
        setMessages(await r.json())
        setErr(null)
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // Помечаем прочитанным при открытии
    authFetch(`/api/dialogs/${id}/read`, { method: 'POST' }).catch(() => {})
    const t = setInterval(() => {
      authFetch(`/api/dialogs/${id}/read`, { method: 'POST' }).catch(() => {})
      load()
    }, 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (e) => {
    e.preventDefault()
    if (sending) return
    const payload = { kind: 'text' }
    if (offerMode) {
      const price = Number(offerPrice)
      if (!price || price <= 0) {
        setKindMsg({ type: 'err', text: 'Введите цену оффера больше 0' })
        return
      }
      payload.kind = 'offer'
      payload.offer_price = price
    } else {
      if (!body.trim()) {
        setKindMsg({ type: 'err', text: 'Введите текст сообщения' })
        return
      }
      payload.body = body.trim()
    }
    setSending(true)
    setKindMsg(null)
    try {
      const r = await authFetch(`/api/dialogs/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await r.json().catch(() => null)
      if (!r.ok) {
        setKindMsg({ type: 'err', text: data?.detail || 'Не удалось отправить' })
        setSending(false)
        return
      }
      setBody('')
      setOfferPrice('')
      setOfferMode(false)
      load()
    } catch {
      setKindMsg({ type: 'err', text: 'Ошибка соединения с сервером' })
    } finally {
      setSending(false)
    }
  }

  const resolveOffer = async (msg, action) => {
    if (!msg.offer_id) return
    setKindMsg(null)
    try {
      const r = await authFetch(`/api/offers/${msg.offer_id}/${action}`, { method: 'POST' })
      if (!r.ok) {
        const data = await r.json().catch(() => null)
        setKindMsg({ type: 'err', text: data?.detail || 'Не удалось обновить оффер' })
        return
      }
      load()
    } catch {
      setKindMsg({ type: 'err', text: 'Ошибка соединения с сервером' })
    }
  }

  const fmt = (iso) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' + TIME(iso)
  }

  return (
    <div className="pd-chat-view">
      <div className="pd-chat-view-head">
        <Link className="pd-back-link" to="/chats">←</Link>
        <strong>{dialog?.other_participant_name || 'Диалог'}</strong>
      </div>

      {loading ? (
        <p className="pd-hint">Загрузка…</p>
      ) : err ? (
        <p className="pd-form-err">{err}</p>
      ) : (
        <>
          <div className="pd-chat-thread">
            {messages.length === 0 && (
              <p className="pd-muted pd-chat-empty">Сообщений пока нет. Напишите первым.</p>
            )}
            {messages.map((m) => {
              const mine = m.author_id === meId
              return (
                <div key={m.id} className={'pd-chat-msg ' + (mine ? 'mine' : 'theirs')}>
                  {m.kind === 'offer' ? (
                    <div className="pd-chat-bubble pd-chat-offer">
                      <span className="pd-chat-offer-price">💰 {MONEY(m.offer_price)}</span>
                      {m.body && <span className="pd-chat-offer-body">{m.body}</span>}
                      {!mine && m.offer_status === 'pending' && (
                        <span className="pd-chat-offer-actions">
                          <button type="button" className="pd-btn pd-btn-sm pd-btn-success" onClick={() => resolveOffer(m, 'accept')}>
                            Принять
                          </button>
                          <button type="button" className="pd-btn pd-btn-sm pd-btn-danger" onClick={() => resolveOffer(m, 'reject')}>
                            Отклонить
                          </button>
                        </span>
                      )}
                      {m.offer_status && m.offer_status !== 'pending' && (
                        <span className={'pd-badge pd-status-' + m.offer_status}>{m.offer_status === 'accepted' ? 'принят' : m.offer_status === 'rejected' ? 'отклонён' : m.offer_status}</span>
                      )}
                    </div>
                  ) : m.kind === 'attachment' ? (
                    <div className="pd-chat-bubble pd-chat-attachment">
                      <a href={m.attachment_url} target="_blank" rel="noreferrer">📎 {m.attachment_url || 'вложение'}</a>
                    </div>
                  ) : (
                    <div className="pd-chat-bubble">{m.body}</div>
                  )}
                  <span className="pd-chat-time">
                    {fmt(m.created_at)}
                    {m.read && mine ? ' · прочитано' : ''}
                  </span>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          <form className="pd-chat-composer" onSubmit={send}>
            {kindMsg && (
              <p className={kindMsg.type === 'ok' ? 'pd-form-ok' : 'pd-form-err'}>{kindMsg.text}</p>
            )}
            {offerMode ? (
              <div className="pd-chat-composer-offer">
                <input
                  className="pd-input pd-input-sm"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Цена, ₽"
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value)}
                />
                <button type="button" className="pd-btn pd-btn-sm pd-btn-ghost" onClick={() => { setOfferMode(false); setOfferPrice('') }}>
                  Отмена
                </button>
              </div>
            ) : null}
            <div className="pd-chat-composer-row">
              {!offerMode && (
                <button
                  type="button"
                  className="pd-btn pd-btn-sm pd-btn-ghost"
                  title="Отправить оффер"
                  onClick={() => setOfferMode(true)}
                >
                  💰 Оффер
                </button>
              )}
              {!offerMode && (
                <input
                  className="pd-input pd-chat-composer-input"
                  type="text"
                  placeholder="Напишите сообщение…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              )}
              <button type="submit" className="pd-btn pd-btn-primary" disabled={sending}>
                {sending ? '…' : '➤'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
