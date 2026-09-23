import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const CART_KEY = 'pd-cart'

const CartContext = createContext(null)

function readInitial() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((i) => i && i.listing_id != null) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(readInitial)

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items))
    } catch {
      /* ignore */
    }
  }, [items])

  const api = useMemo(() => {
    const add = (item) => {
      setItems((prev) =>
        prev.some((i) => i.listing_id === item.listing_id)
          ? prev
          : [...prev, {
              listing_id: item.listing_id,
              title: item.title,
              price_rub: item.price_rub,
              condition: item.condition,
              seller_name: item.seller_name,
            }],
      )
    }
    const remove = (listingId) =>
      setItems((prev) => prev.filter((i) => i.listing_id !== listingId))
    const clear = () => setItems([])
    const has = (listingId) => items.some((i) => i.listing_id === listingId)
    const count = items.length
    const total = items.reduce((s, i) => s + (Number(i.price_rub) || 0), 0)
    return { items, count, total, add, remove, clear, has }
  }, [items])

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
