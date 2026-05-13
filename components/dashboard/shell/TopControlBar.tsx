'use client'
import { useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DatePreset { label: string; value: string }

export const DATE_PRESETS: DatePreset[] = [
  { label: '7D',   value: '7'      },
  { label: '14D',  value: '14'     },
  { label: '30D',  value: '30'     },
  { label: '90D',  value: '90'     },
  { label: 'MTD',  value: 'mtd'    },
  { label: 'LM',   value: 'last_mo'},
]

interface Client { id: string; name: string }

interface Props {
  clients:        Client[]
  clientId:       string
  onClientChange: (id: string) => void
  preset:         string
  onPresetChange: (preset: string) => void
  customStart:    string
  customEnd:      string
  onCustomChange: (start: string, end: string) => void
  compare:        boolean
  onCompareChange:(compare: boolean) => void
  rangeLabel?:    string
  loading?:       boolean
  onOpenCommandPalette?: () => void
}

// ─── Client picker (typeahead) ────────────────────────────────────────────────
function ClientPicker({ clients, clientId, onChange }: {
  clients: Client[]; clientId: string; onChange: (id: string) => void
}) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const wrap = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function out(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [open])

  useEffect(() => { if (open) input.current?.focus() }, [open])

  const current = clients.find(c => c.id === clientId)
  const q       = query.trim().toLowerCase()
  const filtered = q
    ? clients.filter(c => c.name.toLowerCase().includes(q) || c.id.includes(q))
    : clients
  const display = filtered.slice(0, 40)

  return (
    <div className="relative min-w-[220px]" ref={wrap}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 h-9 rounded-xl border text-sm transition-all"
        style={{
          background:  'var(--input-bg)',
          borderColor: open ? '#31C0FF' : 'var(--border)',
          color:       current ? 'var(--text-1)' : 'var(--text-3)',
          boxShadow:   open ? '0 0 0 3px rgba(49,192,255,0.18)' : 'none',
        }}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: current ? '#31C0FF' : 'var(--text-3)' }} />
          <span className="truncate font-medium">{current?.name ?? 'Select a client…'}</span>
        </span>
        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-3)' }}>▾</span>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden glass-hi"
          style={{ minWidth: 280 }}
        >
          <div className="px-2 pt-2 pb-1.5 border-b" style={{ borderColor: 'var(--border-lo)' }}>
            <input
              ref={input}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search clients…"
              className="field text-xs h-8"
            />
          </div>
          <div className="max-h-[320px] overflow-y-auto py-1">
            {display.length === 0 && (
              <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
                No clients match “{query}”
              </p>
            )}
            {display.map(c => {
              const active = c.id === clientId
              return (
                <button
                  key={c.id}
                  onClick={() => { onChange(c.id); setOpen(false); setQuery('') }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-cyan/10 transition-colors"
                  style={{ color: active ? '#31C0FF' : 'var(--text-1)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: active ? '#31C0FF' : 'transparent', border: active ? 'none' : '1px solid var(--border)' }} />
                  <span className="truncate flex-1">{c.name}</span>
                  <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: 'var(--text-3)' }}>{c.id}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Date preset segmented control ────────────────────────────────────────────
function PresetPills({ preset, onChange, onCustom }: {
  preset: string
  onChange: (v: string) => void
  onCustom: () => void
}) {
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-xl h-9" style={{ background: 'var(--surface-lo)', border: '1px solid var(--border-lo)' }}>
      {DATE_PRESETS.map(p => {
        const active = preset === p.value
        return (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className={`px-2.5 h-7 rounded-lg text-[11px] font-heading font-bold tabular-nums transition-all ${active ? 'shadow-sm' : 'hover:bg-cyan/5'}`}
            style={{
              background: active ? '#052E4B' : 'transparent',
              color:      active ? '#31C0FF' : 'var(--text-2)',
            }}
          >
            {p.label}
          </button>
        )
      })}
      <div className="w-px h-4 mx-0.5" style={{ background: 'var(--border-lo)' }} />
      <button
        onClick={onCustom}
        className={`px-2.5 h-7 rounded-lg text-[11px] font-heading font-bold transition-all ${preset === 'custom' ? 'shadow-sm' : 'hover:bg-cyan/5'}`}
        style={{
          background: preset === 'custom' ? '#052E4B' : 'transparent',
          color:      preset === 'custom' ? '#31C0FF' : 'var(--text-2)',
        }}
        title="Custom range"
      >
        ✎
      </button>
    </div>
  )
}

// ─── Compare toggle ───────────────────────────────────────────────────────────
function CompareToggle({ compare, onChange }: { compare: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!compare)}
      className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-xl text-[11px] font-heading font-bold transition-all"
      style={{
        background:  compare ? '#052E4B' : 'var(--input-bg)',
        color:       compare ? '#31C0FF' : 'var(--text-2)',
        border:      `1px solid ${compare ? '#052E4B' : 'var(--border)'}`,
      }}
      title="Compare to previous period"
    >
      <span className="text-[10px]">{compare ? '◆' : '◇'}</span>
      vs prev
    </button>
  )
}

// ─── Command palette hint ─────────────────────────────────────────────────────
function CommandHint({ onClick }: { onClick: () => void }) {
  const [mac, setMac] = useState(true)
  useEffect(() => { setMac(navigator.platform.toUpperCase().includes('MAC')) }, [])
  return (
    <button
      onClick={onClick}
      className="hidden md:inline-flex items-center gap-1.5 px-2.5 h-9 rounded-xl text-[11px] transition-all hover:border-cyan/40"
      style={{
        background:  'var(--input-bg)',
        border:      '1px solid var(--border)',
        color:       'var(--text-3)',
      }}
      title="Command palette"
    >
      <span style={{ color: 'var(--text-2)' }}>Search</span>
      <kbd className="px-1.5 py-0.5 rounded-md text-[9px] font-mono tabular-nums" style={{ background: 'var(--surface-lo)', border: '1px solid var(--border-lo)' }}>
        {mac ? '⌘' : 'Ctrl'}K
      </kbd>
    </button>
  )
}

// ─── Main top bar ─────────────────────────────────────────────────────────────
export function TopControlBar({
  clients, clientId, onClientChange,
  preset, onPresetChange,
  customStart, customEnd, onCustomChange,
  compare, onCompareChange,
  rangeLabel, loading, onOpenCommandPalette,
}: Props) {
  const [showCustom, setShowCustom] = useState(preset === 'custom')

  useEffect(() => { setShowCustom(preset === 'custom') }, [preset])

  return (
    <div
      className="sticky z-40 glass-hi border-b"
      style={{
        top:          'var(--nav-h, 56px)',
        borderColor:  'var(--border-lo)',
      }}
    >
      <div className="w-full px-5 py-2 flex flex-wrap items-center gap-2">

        {/* Client */}
        <ClientPicker clients={clients} clientId={clientId} onChange={onClientChange} />

        {/* Date presets */}
        <PresetPills
          preset={preset}
          onChange={onPresetChange}
          onCustom={() => onPresetChange('custom')}
        />

        {/* Compare */}
        <CompareToggle compare={compare} onChange={onCompareChange} />

        {/* Active range label */}
        {rangeLabel && (
          <span className="text-[11px] tabular-nums hidden lg:inline-block px-2" style={{ color: 'var(--text-3)' }}>
            {rangeLabel}
          </span>
        )}

        {/* Loading pulse */}
        {loading && (
          <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: '#31C0FF' }}>
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Loading
          </span>
        )}

        <div className="flex-1" />

        {/* Command palette */}
        {onOpenCommandPalette && <CommandHint onClick={onOpenCommandPalette} />}
      </div>

      {/* Custom date row */}
      {showCustom && (
        <div className="w-full px-5 pb-2 -mt-1 flex flex-wrap items-center gap-2">
          <input
            type="date" value={customStart}
            onChange={e => onCustomChange(e.target.value, customEnd)}
            className="field text-xs h-8 w-auto"
          />
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>→</span>
          <input
            type="date" value={customEnd}
            onChange={e => onCustomChange(customStart, e.target.value)}
            className="field text-xs h-8 w-auto"
          />
        </div>
      )}
    </div>
  )
}
