import React, { useLayoutEffect, useRef, useState } from 'react'

// PERF-3: real DOM-node windowing (virtualization) for long, uniform-height
// lists. The scroll container keeps its full natural height via a spacer and
// only the slice inside the viewport (+ overscan) is mounted, so a list of
// thousands renders only ~visible+2*overscan nodes. Positioning is the same
// technique react-window uses (absolute window inside a relative spacer), so
// scroll range and anchor are preserved regardless of list length.
//
// Props:
//   items       Array of rows.
//   rowHeight   Uniform/estimated row height in px (used for the window math).
//   overscan    Extra rows mounted above/below the visible band (default 8).
//   renderItem  (item, index) => ReactNode. Use the index for stable keys.
//   className   Extra class on the inner scroll container.
//   outerStyle  Inline style merged onto the scroll container.
//   resetKey    When it changes the window is recomputed (pass items.length if
//               you want to re-window on every data/filter change).
//   initialScrollTop  Optional starting scroll position (px).
export default function WindowedList({
  items = [],
  rowHeight = 72,
  overscan = 8,
  className = '',
  renderItem,
  outerStyle,
  resetKey = '',
  initialScrollTop = 0,
}) {
  const outerRef = useRef(null)
  const firstRender = useRef(true)
  const [range, setRange] = useState({
    start: 0,
    end: Math.min(items.length, 30),
  })

  const n = items.length
  const total = n * rowHeight

  const update = () => {
    const el = outerRef.current
    if (!el) return
    const st = el.scrollTop
    const viewH = el.clientHeight || 0
    const start = Math.max(0, Math.floor(st / rowHeight) - overscan)
    const end = Math.min(n, Math.ceil((st + viewH) / rowHeight) + overscan)
    setRange((r) =>
      r.start === start && r.end === end ? r : { start, end: Math.max(end, start + 1) },
    )
  }

  useLayoutEffect(() => {
    if (firstRender.current && initialScrollTop && outerRef.current) {
      outerRef.current.scrollTop = initialScrollTop
    }
    firstRender.current = false
    update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, rowHeight, resetKey])

  const { start, end } = range
  const padTop = start * rowHeight
  const slice = items.slice(start, end)

  return (
    <div
      ref={outerRef}
      className={'pd-wlist' + (className ? ' ' + className : '')}
      onScroll={update}
      style={{ overflowY: 'auto', ...outerStyle }}
    >
      <div className="pd-wlist-spacer" style={{ position: 'relative', height: total, minHeight: '100%' }}>
        <div className="pd-wlist-window" style={{ position: 'absolute', top: padTop, left: 0, right: 0 }}>
          {slice.map((it, i) => (
            <React.Fragment key={it?.id != null ? String(it.id) : `w-${start + i}`}>
              {renderItem(it, start + i)}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
