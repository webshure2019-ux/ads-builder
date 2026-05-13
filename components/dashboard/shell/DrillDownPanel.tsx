'use client'
import { useEffect, useRef } from 'react'
import type { CampaignMetrics } from '@/lib/google-ads'
import { CampaignDrillDown } from '@/components/dashboard/CampaignDrillDown'

interface Props {
  campaign:   CampaignMetrics | null
  clientId:   string
  currency:   string
  startDate:  string
  endDate:    string
  onClose:    () => void
  onPrev?:    () => void
  onNext?:    () => void
}

const LS_KEY = 'ws_drill_panel_w'
const DEFAULT_W = 820
const MIN_W = 520
const MAX_W = 1200

export function DrillDownPanel({ campaign, clientId, currency, startDate, endDate, onClose, onPrev, onNext }: Props) {
  const wrap     = useRef<HTMLElement>(null)
  const dragRef  = useRef<{ startX: number; startW: number } | null>(null)
  const widthRef = useRef<number>(DEFAULT_W)

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

  // ESC closes, j/k navigates between campaigns when prev/next provided
  useEffect(() => {
    if (!campaign) return
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (inField) return
      if (e.key === 'Escape') { onClose(); e.preventDefault() }
      else if (e.key === 'j' || e.key === 'ArrowDown') { if (onNext) { onNext(); e.preventDefault() } }
      else if (e.key === 'k' || e.key === 'ArrowUp')   { if (onPrev) { onPrev(); e.preventDefault() } }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [campaign, onClose, onPrev, onNext])

  function onDragStart(e: React.PointerEvent) {
    if (!wrap.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startW: widthRef.current }
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }
  function onDragMove(e: React.PointerEvent) {
    if (!dragRef.current || !wrap.current) return
    const dx    = dragRef.current.startX - e.clientX
    const nextW = Math.max(MIN_W, Math.min(MAX_W, dragRef.current.startW + dx))
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

  return (
    <aside
      ref={wrap}
      className="fixed right-0 z-30 flex transition-transform duration-200 ease-out"
      style={{
        top:    'calc(var(--nav-h, 56px) + 52px)',
        bottom: 0,
        width:  'var(--panel-w, 820px)',
        transform:      campaign ? 'translateX(0)' : 'translateX(calc(100% + 4px))',
        pointerEvents:  campaign ? 'auto' : 'none',
        background:     'var(--surface-hi)',
        borderLeft:     '1px solid var(--border)',
        backdropFilter: 'blur(28px) saturate(180%)',
        boxShadow:      campaign ? '-12px 0 48px rgba(5, 46, 75, 0.18)' : 'none',
      }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className="group flex-shrink-0 w-1.5 cursor-ew-resize relative"
        title="Drag to resize"
      >
        <span className="absolute inset-y-0 left-0 w-px group-hover:w-0.5 transition-all" style={{ background: 'var(--border-lo)' }} />
        <span className="absolute top-1/2 -translate-y-1/2 left-0 w-1 h-12 rounded-r opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: '#31C0FF' }} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Panel header */}
        <header className="flex-shrink-0 flex items-center gap-2 px-4 h-12 border-b" style={{ borderColor: 'var(--border-lo)' }}>
          <span className="text-base flex-shrink-0">🔍</span>
          <h2 className="font-heading font-bold text-sm flex-1 truncate" style={{ color: 'var(--text-1)' }} title={campaign?.name}>
            {campaign?.name ?? 'Campaign'}
          </h2>

          {/* j / k nav buttons */}
          {(onPrev || onNext) && (
            <div className="flex items-center gap-0.5 mr-1">
              <button
                onClick={() => onPrev?.()}
                disabled={!onPrev}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-cyan/10 disabled:opacity-30 transition-colors text-xs"
                style={{ color: 'var(--text-2)' }}
                title="Previous campaign (k or ↑)"
              >↑</button>
              <button
                onClick={() => onNext?.()}
                disabled={!onNext}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-cyan/10 disabled:opacity-30 transition-colors text-xs"
                style={{ color: 'var(--text-2)' }}
                title="Next campaign (j or ↓)"
              >↓</button>
            </div>
          )}

          <button
            onClick={onClose}
            aria-label="Close panel"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-cyan/10 transition-colors"
            style={{ color: 'var(--text-2)' }}
            title="Close (Esc)"
          >✕</button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {campaign && (
            <CampaignDrillDown
              campaignId={campaign.id}
              campaignName={campaign.name}
              clientId={clientId}
              currency={currency}
              startDate={startDate}
              endDate={endDate}
              channelType={campaign.channel_type}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </aside>
  )
}
