import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../cart.jsx'

// Часть → силуэт-иконка (разные очертания по типу категории).
// Ключ — подстрока категории/названия; регистронезависимый матч.
const ICONS = [
  { key: 'донор', cls: 'icon-phone' },        // телефон
  { key: 'дисплей', cls: 'icon-screen' },     // экран
  { key: 'плат', cls: 'icon-board' },         // материнская плата
  { key: 'аккумулятор', cls: 'icon-battery' },// АКБ
  { key: 'камер', cls: 'icon-camera' },       // камера
  { key: 'корпус', cls: 'icon-case' },        // корпус
]
function iconCls(text) {
  const t = (text || '').toLowerCase()
  for (const it of ICONS) if (t.includes(it.key)) return it.cls
  return 'icon-part'
}

const CONDITION_LABEL = {
  working: 'Рабочая',
  for_parts: 'На запчасти',
  untested: 'Не проверена',
  no_guarantee: 'Без гарантии',
}

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('ru-RU') : '')

export default function Catalog() {
  const { add, has } = useCart()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  // поиск + фильтры
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [category, setCategory] = useState('')   // '' = все
  const [onlyStock, setOnlyStock] = useState(false)
  const [sort, setSort] = useState('recommended')

  // категории — из данных
  const categories = useMemo(() => {
    const seen = {}
    items.forEach((i) => { if (i.category) seen[i.category] = true })
    return Object.keys(seen).sort()
  }, [items])

  // дебаунс поиска — не дёргаем API на каждый ввод символа
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (debouncedQ) params.set('q', debouncedQ)
    if (onlyStock) params.set('only_stock', 'true')
    if (sort === 'price_asc') params.set('sort', 'price_asc')
    else if (sort === 'price_desc') params.set('sort', 'price_desc')
    else if (sort === 'name') params.set('sort', 'name')
    fetch(`/api/catalog?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [debouncedQ, onlyStock, sort])

  // фильтр по категории — на клиенте (категорий в InvenTree мало, id-маппинг не нужен)
  const visible = category ? items.filter((i) => i.category === category) : items

  return (
    <div>
      <h2>Каталог деталей</h2>

      {/* Поиск и фильтры — над сеткой */}
      <div className="pd-filters">
        <input
          className="pd-search"
          type="search"
          placeholder="Поиск: бренд, модель, тип детали…"
          aria-label="Поиск по каталогу"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="pd-filter-row">
          <select
            aria-label="Категория"
            className="pd-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Все категории</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label className="pd-check">
            <input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} />
            В наличии
          </label>
          <select
            aria-label="Сортировка"
            className="pd-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recommended">По рейтингу</option>
            <option value="price_asc">Цена ↑</option>
            <option value="price_desc">Цена ↓</option>
            <option value="name">Названию</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="pd-hint">Загрузка каталога…</p>
      ) : visible.length === 0 ? (
        <p className="pd-muted">Ничего не найдено. Попробуй изменить поиск или фильтры.</p>
      ) : (
        <div className="pd-catalog">
          {visible.map((i) => (
            <Link key={i.id} to={`/part/${i.id}`} className="pd-card">
              <div className={`pd-card-icon ${iconCls(`${i.category} ${i.name}`)}`} aria-hidden="true" />
              <div className="pd-card-body">
                <strong>{i.name}</strong>
                <span className="pd-card-cat">{i.category}</span>
                <span className="pd-card-price">
                  {i.listing_price != null ? `${fmt(i.listing_price)} ₽` : 'Цена по запросу'}
                </span>
                <span className="pd-card-meta">
                  {i.listing_condition ? CONDITION_LABEL[i.listing_condition] || i.listing_condition : '—'}
                  {i.in_stock ? ' · на складе' : ' · под заказ'}
                </span>
                {i.listing_id != null && i.listing_price != null && (
                  <button
                    type="button"
                    className="pd-btn pd-btn-sm pd-btn-cart"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      add({
                        listing_id: i.listing_id,
                        title: i.name,
                        price_rub: i.listing_price,
                        condition: i.listing_condition,
                        seller_name: i.seller_name,
                      })
                    }}
                  >
                    {has(i.listing_id) ? '✓ В корзине' : 'В корзину'}
                  </button>
                )}
              </div>
              <span className="pd-card-arrow">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
