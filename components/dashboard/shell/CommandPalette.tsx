'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SECTIONS, type SectionId } from './SectionRail'
import { DATE_PRESETS } from './TopControlBar'

interface Client { id: string; name: string }
interface CampaignLite { id: string; name: string }

export interface Command {
  id:       string
  kind:     'client' | 'section' | 'preset' | 'campaign' | 'action'
  label:    string
  hint?:    string
  icon?:    string
  shortcut?:string
  run:      () => void
}

interface Props {
  open:     boolean
  onClose:  () => void
  clients:  Client[]
  campaigns?: CampaignLite[]
  onSelectClient:   (id: string) => void
  onSelectSection:  (id: SectionId) => void
  onSelectPreset:   (value: string) => void
  onSelectCampaign?:(id: string) => void
  actions?: Command[]   // extra one-off commands the host wants to expose
}

// ─── Tiny fuzzy scorer ────────────────────────────────────────────────────────
function fuzzyScore(needle: string, hay: string): number {
  if (!needle) return 1
  const n = needle.toLowerCase()
  const h = hay.toLowerCase()
  if (h === n)            return 1000
  if (h.startsWith(n))    return 800
  if (h.includes(n))      return 500
  // Subsequence match
  let hi = 0, matched = 0
  for (const ch of n) {
    const found = h.indexOf(ch, hi)
    if (found === -1) return 0
    matched++
    hi = found + 1
  }
  return 100 + matched
}

export function CommandPalette({
  open, onClose, clients, campaigns = [],
  onSelectClient, onSelectSection, onSelectPreset, onSelectCampaign, actions = [],
}: Props) {
  const [query, setQuery] = useState('')
  const [idx,   setIdx]   = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list  = useRef<HTMLDivElement>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setIdx(0)
      setTimeout(() => input.current?.focus(), 30)
    }
  }, [open])

  // Build command list
  const commands: Command[] = useMemo(() => {
    const out: Command[] = []
    for (const c of clients) {
      out.push({
        id:    `client:${c.id}`,
        kind:  'client',
        label: c.name,
        hint:  c.id,
        icon:  '🏢',
        run:   () => { onSelectClient(c.id); onClose() },
      })
    }
    for (const s of SECTIONS) {
      out.push({
        id:    `section:${s.id}`,
        kind:  'section',
        label: s.label,
        hint:  'Open section',
        icon:  s.icon,
        shortcut: s.shortcut,
        run:   () => { onSelectSection(s.id); onClose() },
      })
    }
    if (onSelectCampaign) {
      for (const c of campaigns) {
        out.push({
          id:    `campaign:${c.id}`,
          kind:  'campaign',
          label: c.name,
          hint:  'Open campaign',
          icon:  '🎯',
          run:   () => { onSelectCampaign(c.id); onClose() },
        })
      }
    }
    for (const p of DATE_PRESETS) {
      out.push({
        id:    `preset:${p.value}`,
        kind:  'preset',
        label: `Date: ${p.label}`,
        hint:  'Date preset',
        icon:  '📅',
        run:   () => { onSelectPreset(p.value); onClose() },
      })
    }
    out.push(...actions)
    return out
  }, [clients, campaigns, actions, onSelectClient, onSelectSection, onSelectPreset, onSelectCampaign, onClose])

  // Score + sort
  const ranked = useMemo(() => {
    if (!query.trim()) {
      // No query: show sections, presets, actions, top campaigns, top clients
      return [
        ...commands.filter(c => c.kind === 'section'),
        ...commands.filter(c => c.kind === 'preset'),
        ...commands.filter(c => c.kind === 'action'),
        ...commands.filter(c => c.kind === 'campaign').slice(0, 6),
        ...commands.filter(c => c.kind === 'client').slice(0, 6),
      ]
    }
    const q = query.trim()
    return commands
      .map(c => ({ c, score: Math.max(fuzzyScore(q, c.label), fuzzyScore(q, c.hint ?? '') * 0.6) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map(x => x.c)
  }, [commands, query])

  // Reset selection when results change
  useEffect(() => { setIdx(0) }, [query])

  // Keep selected row visible
  useEffect(() => {
    const el = list.current?.querySelector<HTMLButtonElement>(`[data-row="${idx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, ranked.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter')     { e.preventDefault(); ranked[idx]?.run() }
    else if (e.key === 'Escape')    { e.preventDefault(); onClose() }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] animate-fade-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(5, 22, 40, 0.45)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-[640px] mx-4 rounded-2xl overflow-hidden glass-hi animate-slide-up"
        style={{ boxShadow: '0 32px 96px rgba(5, 46, 75, 0.35)' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 h-12 border-b" style={{ borderColor: 'var(--border-lo)' }}>
          <span className="text-base" style={{ color: 'var(--text-3)' }}>⌕</span>
          <input
            ref={input}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to client, section, or action…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text-1)' }}
          />
          <kbd className="px-1.5 py-0.5 rounded-md text-[9px] font-mono"
               style={{ background: 'var(--surface-lo)', border: '1px solid var(--border-lo)', color: 'var(--text-3)' }}>
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={list} className="max-h-[50vh] overflow-y-auto py-1">
          {ranked.length === 0 && (
            <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-3)' }}>
              No matches for “{query}”
            </p>
          )}
          {ranked.map((c, i) => {
            const active = i === idx
            return (
              <button
                key={c.id}
                data-row={i}
                onMouseEnter={() => setIdx(i)}
                onClick={c.run}
                className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors"
                style={{
                  background: active ? 'rgba(49,192,255,0.10)' : 'transparent',
                  color:      'var(--text-1)',
                }}
              >
                <span className="text-base w-5 text-center flex-shrink-0">{c.icon ?? '·'}</span>
                <span className="flex-1 truncate">{c.label}</span>
                {c.hint && (
                  <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                    {c.hint}
                  </span>
                )}
                {c.shortcut && (
                  <kbd className="px-1.5 py-0.5 rounded text-[9px] font-mono flex-shrink-0"
                       style={{ background: 'var(--surface-lo)', border: '1px solid var(--border-lo)', color: 'var(--text-3)' }}>
                    {c.shortcut}
                  </kbd>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-3 px-4 h-8 border-t text-[10px]"
             style={{ borderColor: 'var(--border-lo)', color: 'var(--text-3)' }}>
          <span><kbd className="px-1 rounded" style={{ background: 'var(--surface-lo)' }}>↑↓</kbd> navigate</span>
          <span><kbd className="px-1 rounded" style={{ background: 'var(--surface-lo)' }}>↵</kbd> select</span>
          <span><kbd className="px-1 rounded" style={{ background: 'var(--surface-lo)' }}>esc</kbd> close</span>
          <span className="ml-auto">{ranked.length} result{ranked.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  )
}
