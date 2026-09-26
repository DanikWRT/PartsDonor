import React, { useEffect, useRef, useState } from 'react'
import { useCart } from '../cart.jsx'

/**
 * SCR-1 shared cart drawer (reference 03). Slide-in panel from the right +
 * overlay. Rendered once inside <App> so it works on every page. Local state
 * only — no backend checkout.
 */
export default function CartDrawer({ open, onClose }) {
  const { items, total, remove, clear } = useCart()
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    // Lock body scroll while the drawer is open
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const showToast = (m) => {
    setToast(m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2200)
  }

  const fmt = (n) => `${(Number(n) || 0).toLocaleString('ru-RU')} ₽`

  function checkout() {
    if (items.length === 0) {
      showToast('Корзина пуста')
      return
    }
    showToast('Заказ оформлен (демо)')
    clear()
    setTimeout(onClose, 700)
  }

  return (
    <>
      <div
        className={`cart-overlay ${open ? 'show' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`cart-panel ${open ? 'show' : ''}`} role="dialog" aria-label="Корзина">
        <div className="cart-head">
          <h2>Корзина</h2>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="cart-items">
          {items.length === 0 ? (
            <div className="cart-empty">Корзина пуста</div>
          ) : (
            items.map((it) => (
              <div className="cart-item" key={it.listing_id}>
                <div>
                  <div className="ci-name">{it.title}</div>
                  <div className="ci-price">{fmt(it.price_rub)}</div>
                </div>
                <button
                  type="button"
                  className="ci-remove"
                  onClick={() => remove(it.listing_id)}
                  aria-label="Удалить"
                >✕</button>
              </div>
            ))
          )}
        </div>
        <div className="cart-total"><span>Итого</span><span>{fmt(total)}</span></div>
        <button type="button" className="btn btn-primary" style={{ marginTop: '16px', padding: '14px' }} onClick={checkout}>
          Оформить заказ
        </button>
      </aside>
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </>
  )
}
