'use client'
import { useEffect, useRef } from 'react'
import { SECTIONS, type SectionId } from './SectionRail'

interface Props {
  activeId: SectionId | null
  onClose:  () => void
  children: React.ReactNode
}

// Width persistence
const LS_KEY = 'ws_insight_panel_w'
const DEFAULT_W = 720
const MIN_W = 480
const MAX_W = 1100

export function InsightPanel({ activeId, onClose, children }: Props) {
  const wrap     = useRef<HTMLElement>(null)
  const dragRef  = useRef<{ startX: number; startW: number } | null>(null)
  const widthRef = useRef<number>(DEFAULT_W)

  // Hydrate persisted width
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY)
      if (stored) {
        const w = parseInt(stored, 10)
        if (w >= MIN_W && w <= MAX_W) {
          widthRef.current = w
          if (wrap.current) wrap.current.style.setProperty('--panel-w', `${w}px`)
        }
      }
    } catch {}
  }, [])

  // ESC to close
  useEffect(() => {
    if (!activeId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, onClose])

  function onDragStart(e: React.PointerEvent) {
    if (!wrap.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startW: widthRef.current,
    }
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragRef.current || !wrap.current) return
    const dx       = dragRef.current.startX - e.clientX  // moving left = wider
    const nextW    = Math.max(MIN_W, Math.min(MAX_W, dragRef.current.startW + dx))
    widthRef.current = nextW
    wrap.current.style.setProperty('--panel-w', `${nextW}px`)
  }

  function onDragEnd(e: React.PointerEvent) {
    if (!dragRef.current) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    try { localStorage.setItem(LS_KEY, String(widthRef.current)) } catch {}
  }

  const section = activeId ? SECTIONS.find(s => s.id === activeId) : null

  return (
    <aside
      ref={wrap}
      className="fixed right-0 z-30 flex transition-transform duration-200 ease-out"
      style={{
        top:    'calc(var(--nav-h, 56px) + 52px)',
        bottom: 0,
        width:  'var(--panel-w, 720px)',
        transform:      activeId ? 'translateX(0)' : 'translateX(calc(100% + 4px))',
        pointerEvents:  activeId ? 'auto' : 'none',
        background:     'var(--surface-hi)',
        borderLeft:     '1px solid var(--border)',
        backdropFilter: 'blur(28px) saturate(180%)',
        boxShadow:      activeId ? '-12px 0 48px rgba(5, 46, 75, 0.18)' : 'none',
      }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className="group flex-shrink-0 w-1.5 cursor-ew-resize relative"
        style={{ background: 'transparent' }}
        title="Drag to resize"
      >
        <span
          className="absolute inset-y-0 left-0 w-px group-hover:w-0.5 transition-all"
          style={{ background: 'var(--border-lo)' }}
        />
        <span
          className="absolute top-1/2 -translate-y-1/2 left-0 w-1 h-12 rounded-r opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: '#31C0FF' }}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Panel header */}
        <header
          className="flex-shrink-0 flex items-center gap-3 px-5 h-12 border-b"
          style={{ borderColor: 'var(--border-lo)' }}
        >
          <span className="text-base flex-shrink-0">{section?.icon ?? '🔭'}</span>
          <h2
            className="font-heading font-bold text-sm flex-1 truncate"
            style={{ color: 'var(--text-1)' }}
          >
            {section?.label ?? 'Insights'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-cyan/10 transition-colors"
            style={{ color: 'var(--text-2)' }}
            title="Close (Esc)"
          >
            ✕
          </button>
        </header>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </aside>
  )
}
