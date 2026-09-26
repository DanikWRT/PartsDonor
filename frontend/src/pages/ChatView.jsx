import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { authFetch, readSession } from '../auth.jsx'
import { ChatList, avGrad, initialLetter, ROLE_TAG } from './Chats.jsx'

const MONEY = (n) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('ru-RU') + ' ₽' : ''

const TIME = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// Quick replies — clicking fills the composer.
const QUICK = [
  'Здравствуйте! Деталь ещё в наличии?',
  'Какая цена?',
  'Можете отправить фото?',
  'Готов купить сегодня.',
  'Спасибо!',
]

// Day-divider label
const dayLabel = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const yest = new Date(); yest.setDate(yest.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yest.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Pinned item: best-effort fetch of listing / donor-lot for icon+title+sub+price.
function usePinned(dialog) {
  const [pinned, setPinned] = useState(null)
  const id = dialog?.id
  useEffect(() => {
    setPinned(null)
    if (!dialog) return
    const { listing_id, donor_lot_id } = dialog
    let cancelled = false
    const url = listing_id ? `/api/listings/${listing_id}` : donor_lot_id ? `/api/donor-lots/${donor_lot_id}` : null
    if (!url) return
    authFetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error()
        const data = await r.json()
        if (cancelled) return
        setPinned({
          title: data.title || data.part_name || 'Деталь',
          sub: data.brand ? `${data.brand} ${data.model || ''}` : data.part_category || '',
          price: MONEY(data.price_rub),
          kind: listing_id ? 'listing' : 'donor-lot',
        })
      })
      .catch(() => {
        if (cancelled) return
        // generic fallback — never crash
        setPinned({
          title: dialog.other_participant_name ? `Товар · ${dialog.other_participant_name}` : `Диалог ${String(id).slice(0, 8)}`,
          sub: '',
          price: '',
          kind: listing_id ? 'listing' : 'donor-lot',
        })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  return pinned
}

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
  const pinned = usePinned(dialog)

  const meId = readSession()?.user_id
  const myRole = readSession()?.role

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

  const otherRole = myRole === 'seller' ? 'buyer' : myRole === 'buyer' ? 'seller' : null

  // group messages with day dividers
  const grouped = useMemo(() => {
    const out = []
    for (const m of messages) {
      const label = dayLabel(m.created_at)
      if (out.length && out[out.length - 1].label === label) {
        out[out.length - 1].items.push(m)
      } else {
        out.push({ label, items: [m] })
      }
    }
    return out
  }, [messages])

  const otherName = dialog?.other_participant_name || 'Диалог'

  return (
    <div className="ch-page">
      <div className="bg-blueprint" aria-hidden="true" />
      <div className="ch-panel ch-panel-chat">
        <ChatList activeId={id} />

        <section className="ch-view">
          <header className="ch-view-head">
            <Link to="/chats" className="ch-back" aria-label="Назад">←</Link>
            <span className="ch-view-avatar" style={{ background: avGrad(otherName) }}>{initialLetter(otherName)}</span>
            <span className="ch-view-id">
              <strong className="ch-view-name">{otherName}</strong>
              <span className="ch-view-status">Онлайн</span>
            </span>
            <span className="ch-view-actions" aria-hidden="true">
              <button type="button">📞</button>
              <button type="button">⋮</button>
            </span>
          </header>

          {pinned && (
            <div className="ch-pinned">
              <span className="ch-pinned-ico">{pinned.kind === 'donor-lot' ? '🧩' : '🔧'}</span>
              <span className="ch-pinned-info">
                <strong className="ch-pinned-title">{pinned.title}</strong>
                {pinned.sub && <span className="ch-pinned-sub">{pinned.sub}</span>}
              </span>
              {pinned.price && <span className="ch-pinned-price">{pinned.price}</span>}
            </div>
          )}

          <div className="ch-thread">
            {loading ? (
              <p className="ch-hint">Загрузка…</p>
            ) : err ? (
              <p className="ch-err">{err}</p>
            ) : (
              <>
                {messages.length === 0 && (
                  <p className="ch-hint ch-empty">Сообщений пока нет. Напишите первым.</p>
                )}
                {grouped.map((g, gi) => (
                  <div key={gi} className="ch-day">
                    <div className="ch-day-divider"><span>{g.label}</span></div>
                    {g.items.map((m) => {
                      const mine = m.author_id === meId
                      return (
                        <div key={m.id} className={'ch-msg ' + (mine ? 'mine' : 'theirs')}>
                          {!mine && (
                            <span className="ch-msg-avatar" style={{ background: avGrad(otherName) }}>{initialLetter(otherName)}</span>
                          )}
                          <div className="ch-msg-col">
                            {m.kind === 'offer' ? (
                              <div className="ch-bubble ch-offer">
                                <span className="ch-offer-label">💰 Коммерческое предложение</span>
                                <span className="ch-offer-price">{MONEY(m.offer_price)}</span>
                                {m.body && <span className="ch-offer-body">{m.body}</span>}
                                {!mine && m.offer_status === 'pending' && (
                                  <span className="ch-offer-actions">
                                    <button type="button" className="ch-ok" onClick={() => resolveOffer(m, 'accept')}>Принять</button>
                                    <button type="button" className="ch-no" onClick={() => resolveOffer(m, 'reject')}>Отклонить</button>
                                  </span>
                                )}
                                {m.offer_status && m.offer_status !== 'pending' && (
                                  <span className={`ch-offer-status ${m.offer_status}`}>
                                    {m.offer_status === 'accepted' ? '✓ Принят' : m.offer_status === 'rejected' ? '✕ Отклонён' : m.offer_status}
                                  </span>
                                )}
                              </div>
                            ) : m.kind === 'attachment' ? (
                              <div className="ch-bubble ch-attachment">
                                <a href={m.attachment_url} target="_blank" rel="noreferrer">📎 {m.attachment_url || 'вложение'}</a>
                              </div>
                            ) : (
                              <div className="ch-bubble">{m.body}</div>
                            )}
                            <span className="ch-msg-meta">
                              {TIME(m.created_at)}
                              {mine && (m.read ? <span className="ch-read">✓✓</span> : <span className="ch-read ch-read-sent">✓</span>)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          <form className="ch-composer" onSubmit={send}>
            {kindMsg && (
              <p className={kindMsg.type === 'ok' ? 'ch-ok-txt' : 'ch-err'}>{kindMsg.text}</p>
            )}
            <div className="ch-quick">
              {QUICK.map((q) => (
                <button key={q} type="button" className="ch-qchip" onClick={() => { setBody(q); setOfferMode(false) }}>{q}</button>
              ))}
            </div>
            {offerMode && (
              <div className="ch-composer-offer">
                <input
                  className="ch-input"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Ваша цена, ₽"
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value)}
                />
                <button type="button" className="ch-cancel-offer" onClick={() => { setOfferMode(false); setOfferPrice('') }}>Отмена</button>
              </div>
            )}
            <div className="ch-composer-row">
              <button type="button" className="ch-composer-ico" title="Прикрепить файл" onClick={() => setKindMsg(null)}>📎</button>
              {offerMode ? (
                <span className="ch-bubble ch-bubble-offer-flag">Оффер</span>
              ) : (
                <textarea
                  className="ch-composer-input"
                  placeholder="Написать сообщение..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={1}
                />
              )}
              <button type="submit" className="ch-send" disabled={sending} aria-label="Отправить">
                {sending ? '…' : '➤'}
              </button>
            </div>
          </form>
        </section>

        <aside className="ch-right">
          <div className="ch-card">
            <div className="ch-card-title">👤 Собеседник</div>
            <div className="ch-big-avatar" style={{ background: avGrad(otherName) }}>{initialLetter(otherName)}</div>
            <div className="ch-other-name">{otherName}</div>
            {otherRole && <div className={'ch-role ch-role-' + otherRole}>{ROLE_TAG[otherRole]}</div>}
            <div className="ch-card-rating">★ —</div>
            <div className="ch-stats">
              <div className="ch-stat"><span className="ch-stat-k">Сделок</span><span className="ch-stat-v">—</span></div>
              <div className="ch-stat"><span className="ch-stat-k">Отзывов</span><span className="ch-stat-v">—</span></div>
              <div className="ch-stat"><span className="ch-stat-k">Город</span><span className="ch-stat-v">—</span></div>
              <div className="ch-stat"><span className="ch-stat-k">На сайте с</span><span className="ch-stat-v">—</span></div>
            </div>
          </div>

          <div className="ch-card">
            <div className="ch-card-title">⚡ Действия</div>
            <button type="button" className="ch-action" onClick={() => setOfferMode(true)}>💰 Предложить цену</button>
            <button type="button" className="ch-action" onClick={() => setKindMsg(null)}>✅ Оформить сделку</button>
            <button type="button" className="ch-action" onClick={() => setKindMsg(null)}>📎 Отправить файл</button>
            <button type="button" className="ch-action ch-action-danger" onClick={() => setKindMsg(null)}>🚫 Заблокировать</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
