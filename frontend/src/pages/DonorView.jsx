import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { authFetch } from '../auth.jsx'
import {
  SLOT_META,
  statusCls,
  statusText,
  normalizeSlot,
  isFlat,
  ExplodedScheme,
  ExplosionAxis,
} from '../components/DonorExploded.jsx'

// F7: панель детали (деталь) — right side panel (desktop) / bottom sheet (mobile).
import { DetailPanel, conditionText, STATUS_OPTIONS } from '../components/DonorExploded.jsx'

export default function DonorView() {
  const params = useParams()
  const brand = params.brand || 'Apple'
  const model = params.model || 'iPhone 13 Pro'
  const [data, setData] = useState(null)
  const [view, setView] = useState('blowup') // 'blowup' | 'list'
  // F7: выбранная деталь + статус листингов (по listing_id) + notice.
  const [selected, setSelected] = useState(null) // { slotKey, comp }
  const [listings, setListings] = useState([])
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [hasToken, setHasToken] = useState(false)

  const loadListings = () =>
    fetch('/api/listings')
      .then((r) => (r.ok ? r.json() : []))
      .then((ls) => { setListings(Array.isArray(ls) ? ls : []) })
      .catch((e) => console.error('load listings err', e))

  useEffect(() => {
    // F7: /donor/:brand/:model → находим schema по brand/model, берём
    // inventree_donor_part_id и грузим GET /api/donor/{donor_part_id}.
    // UX-4: координаты слотов (hotspots) лежат в schema, а не в /api/donor —
    // подмешиваем их в данные донора, иначе все слои схлопываются в одну точку.
    fetch('/api/device-schemas')
      .then((r) => (r.ok ? r.json() : []))
      .then((schemas) => {
        const arr = Array.isArray(schemas) ? schemas : []
        // brand/model params come URL-encoded (hyphens for spaces), schema stores them
        // with spaces — normalize both to a key of letters+digits so 'iPhone-13-Pro'
        // matches 'iPhone 13 Pro'.
        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
        const schema = arr.find(
          (s) => norm(s.brand) === norm(brand) && norm(s.model) === norm(model),
        )
        const donorId = schema?.inventree_donor_part_id
        if (!donorId) return { schema }
        return fetch(`/api/donor/${donorId}`)
          .then((r) => (r.ok ? r.json() : {}))
          .then((donor) => ({ schema, donor }))
      })
      .then(({ schema, donor }) => {
        if (!donor || !donor.components) { setData(null); return }
        // Если у /api/donor нет hotspots — берём из schema (там точные координаты слотов).
        const merged = { ...donor }
        if (!merged.hotspots && schema?.hotspots) merged.hotspots = schema.hotspots
        setData(merged)
      })
      .catch((e) => console.error('load donor err', e))
    loadListings()
    const sync = () => setHasToken(!!localStorage.getItem('pd-token'))
    sync()
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [brand, model])

  if (!data || !data.components) return <p className="pd-hint">Загрузка развёртки...</p>

  // F7: нормализуем слоты в короткие ключи + JOIN листингов по inventree_part_id.
  const components = data.components.map((c) => {
    const slotKey = normalizeSlot(c.slot) || normalizeSlot(c.title) || c.slot
    const schema = (data.hotspots || {})[slotKey] || c.hotspot
    const listing = listings.find((l) => l.inventree_part_id === c.part_id) || null
    return {
      ...c,
      slot: slotKey,
      hotspot: (schema && (schema.x != null || schema.y != null)) ? schema : (c.hotspot || {}),
      listing,
      // статус детали: приоритет — актуальный статус листинга (после PATCH), иначе статус из donor API
      status: listing ? listing.status : (c.status || 'active'),
    }
  })

  const selectedComp = selected
    ? components.find((c) => c.slot === selected.slotKey && (c.part_id ?? -1) === (selected.partId ?? -1)) || null
    : null

  const setStatus = async (comp, status) => {
    if (!comp.listing) return
    if (!localStorage.getItem('pd-token')) {
      setNotice({ kind: 'err', text: 'Необходим вход (JWT отсутствует)' })
      return
    }
    setSaving(true)
    setNotice(null)
    const prev = listings
    // optimistic update
    setListings((ls) => ls.map((l) => (l.id === comp.listing.id ? { ...l, status } : l)))
    try {
      const r = await authFetch(`/api/listings/${comp.listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await loadListings()
      setNotice({ kind: 'ok', text: 'Статус обновлён' })
    } catch (e) {
      setListings(prev)
      setNotice({ kind: 'err', text: 'Ошибка сохранения статуса' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pd-f7-page">
      <h2>Развёртка: {data.model}</h2>

      <div className="pd-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={view === 'blowup'}
          className={`pd-tab ${view === 'blowup' ? 'active' : ''}`}
          onClick={() => setView('blowup')}
        >Разнесённый вид</button>
        <button
          role="tab"
          aria-selected={view === 'list'}
          className={`pd-tab ${view === 'list' ? 'active' : ''}`}
          onClick={() => setView('list')}
        >Список</button>
      </div>

      <div className="pd-donor">
        {view === 'blowup' ? (
          <div className={`pd-f7-layout ${selectedComp ? 'with-panel' : ''}`}>
            <div className="pd-scheme">
              <ExplodedScheme
                components={components}
                selectedKey={selected?.slotKey}
                onSelectedKey={(c) => setSelected({ slotKey: c.slot, partId: c.part_id })}
                bgUrl={data.exploded_view_url}
              />
              <p className="pd-note">Клик по слою — открыть деталь и управлять статусом.</p>
            </div>
            <DetailPanel
              comp={selectedComp}
              onClose={() => setSelected(null)}
              onSetStatus={setStatus}
              saving={saving}
              notice={notice}
              hasToken={hasToken}
            />
          </div>
        ) : (
          <div className="pd-parts">
            {components.map((c) => (
              <button
                key={`${c.slot}-${c.part_id ?? c.slot}`}
                type="button"
                className="pd-part"
                onClick={() => { setView('blowup'); setSelected({ slotKey: c.slot, partId: c.part_id }) }}
              >
                <span className={`dot ${statusCls(c.status)}`} />
                <span>
                  <strong>{c.title || SLOT_META[c.slot]?.label}</strong>
                  <span className="pd-part-price"> — {(c.price_rub || 0).toLocaleString('ru-RU')} ₽ · {statusText(c.status)}</span>
                </span>
                <span className="pd-part-mark">Открыть деталь</span>
              </button>
            ))}
            <p className="pd-note">Клик по детали открывает панель управления статусом.</p>
          </div>
        )}
      </div>
    </div>
  )
}
