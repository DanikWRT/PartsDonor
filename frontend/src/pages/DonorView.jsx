import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { authFetch } from '../auth.jsx'
import {
  SLOT_META,
  statusCls,
  statusText,
  normalizeSlot,
  STATUS_OPTIONS,
} from '../components/DonorExploded.jsx'
import BlueprintExploded from '../components/BlueprintExploded.jsx'

const REVISIONS = { 'iPhone 13 Pro': 'A2638', 'iPhone 16': 'A2897', 'iPhone 16 Pro': 'A3083' }

// Экран развёртки донора /donor/:brand/:model — 3-колоночный blueprint
// (эталон ref-iphone16-blueprint-exploded.html). Данные: реальные компоненты
// из /api/donor/{id} + листинги JOIN по inventree_part_id.
export default function DonorView() {
  const params = useParams()
  const brand = params.brand || 'Apple'
  const model = params.model || 'iPhone 13 Pro'
  const [data, setData] = useState(null)
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
    fetch('/api/device-schemas')
      .then((r) => (r.ok ? r.json() : []))
      .then((schemas) => {
        const arr = Array.isArray(schemas) ? schemas : []
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
        const merged = { ...donor, schema }
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

  // Нормализуем слоты в короткие ключи + JOIN листингов по inventree_part_id.
  const components = data.components.map((c) => {
    const slotKey = normalizeSlot(c.slot) || normalizeSlot(c.title) || c.slot
    const schema = (data.hotspots || {})[slotKey] || c.hotspot
    const listing = listings.find((l) => l.inventree_part_id === c.part_id) || null
    return {
      ...c,
      slot: slotKey,
      slotKey,
      hotspot: (schema && (schema.x != null || schema.y != null)) ? schema : (c.hotspot || {}),
      listing,
      status: listing ? listing.status : (c.status || 'active'),
    }
  })

  const setStatus = async (comp, status) => {
    if (!comp.listing) return
    if (!localStorage.getItem('pd-token')) {
      setNotice({ kind: 'err', text: 'Необходим вход (JWT отсутствует)' })
      return
    }
    setSaving(true)
    setNotice(null)
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
      setNotice({ kind: 'err', text: 'Ошибка сохранения статуса' })
    } finally {
      setSaving(false)
    }
  }

  // Блок управления статусом — рендерится под карточкой детали (для владельца листинга).
  const detailExtra = (comp) => {
    if (!comp || !comp.listing) return null
    return (
      <div className="ex-status-mgmt">
        <h4>Статус детали</h4>
        {hasToken ? (
          <div className="ex-status-btns">
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`ex-status-btn${comp.status === o.value ? ' active' : ''}`}
                disabled={saving || comp.status === o.value}
                onClick={() => setStatus(comp, o.value)}
              >{o.label}</button>
            ))}
          </div>
        ) : (
          <p className="pd-muted">Необходим вход (JWT отсутствует)</p>
        )}
        {notice && <p className={`ex-notice ${notice.kind}`}>{notice.text}</p>}
      </div>
    )
  }

  return (
    <BlueprintExploded
      components={components}
      meta={{
        brand,
        model,
        revision: REVISIONS[model] || 'A2897',
        donorPartId: data.schema?.inventree_donor_part_id ?? data.donor_part_id,
        explodedUrl: data.exploded_view_url,
      }}
      detailExtra={detailExtra}
      back={<Link to="/donor-lots" className="ex-back">← Назад к донорам</Link>}
    />
  )
}
