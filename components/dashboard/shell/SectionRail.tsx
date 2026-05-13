'use client'
import { useEffect, useState } from 'react'

// ─── Section definitions ──────────────────────────────────────────────────────
// One canonical list shared by the rail AND the command palette.
export type SectionId =
  | 'health'      | 'pacing'    | 'wasted'    | 'shared_budgets'
  | 'movers'     | 'qs'        | 'rsa'       | 'is'
  | 'devices'    | 'landing'   | 'anomalies' | 'changes'
  | 'ai'         | 'recs'      | 'report'    | 'search_terms'

export interface SectionDef {
  id:      SectionId
  icon:    string
  label:   string
  group?:  'overview' | 'health' | 'spend' | 'movers' | 'ai'
  shortcut?: string
}

export const SECTIONS: SectionDef[] = [
  // Overview / health
  { id: 'health',         icon: '🩺', label: 'Account Health',     group: 'overview', shortcut: 'h' },
  { id: 'anomalies',      icon: '⚠️', label: 'Anomalies',           group: 'overview', shortcut: 'a' },
  { id: 'recs',           icon: '⚡', label: 'Recommendations',     group: 'overview', shortcut: 'r' },
  { id: 'ai',             icon: '🤖', label: 'AI Analyst',          group: 'ai' },

  // Spend & budget
  { id: 'pacing',         icon: '💰', label: 'Budget Pacing',       group: 'spend',    shortcut: 'b' },
  { id: 'shared_budgets', icon: '🏦', label: 'Shared Budgets',      group: 'spend' },
  { id: 'wasted',         icon: '🗑',  label: 'Wasted Spend',        group: 'spend',    shortcut: 'w' },

  // Quality
  { id: 'qs',             icon: '📊', label: 'Quality Score',       group: 'health',   shortcut: 'q' },
  { id: 'rsa',            icon: '✍️', label: 'RSA Health',          group: 'health' },
  { id: 'is',             icon: '👁️', label: 'Impression Share',    group: 'health' },
  { id: 'devices',        icon: '📱', label: 'Devices',             group: 'health' },
  { id: 'landing',        icon: '📄', label: 'Landing Pages',       group: 'health' },

  // Movers & changes
  { id: 'movers',         icon: '📈', label: 'Top Movers',          group: 'movers',   shortcut: 'm' },
  { id: 'changes',        icon: '📋', label: 'Change History',      group: 'movers' },

  // Search Terms (a heavyweight section)
  { id: 'search_terms',   icon: '🔍', label: 'Search Terms',        group: 'movers',   shortcut: 's' },

  // Report
  { id: 'report',         icon: '📑', label: 'Client Report',       group: 'overview' },
]

const COLLAPSED_W = '56px'
const EXPANDED_W  = '208px'
const LS_KEY      = 'ws_rail_expanded'

const GROUP_LABELS: Record<NonNullable<SectionDef['group']>, string> = {
  overview: 'Overview',
  ai:       'AI',
  spend:    'Spend',
  health:   'Health',
  movers:   'Movers & Search',
}

// ─── Rail ─────────────────────────────────────────────────────────────────────
export function SectionRail({
  activeId, onSelect, badges,
}: {
  activeId: SectionId | null
  onSelect: (id: SectionId | null) => void
  badges?:  Partial<Record<SectionId, { count?: number; tone?: 'alert' | 'warn' | 'info' }>>
}) {
  // Expanded mode shows icon + label; collapsed is icon-only. Persisted across reloads.
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY) === 'true'
      setExpanded(stored)
      document.documentElement.style.setProperty('--rail-w', stored ? EXPANDED_W : COLLAPSED_W)
    } catch {}
  }, [])

  function toggle() {
    setExpanded(prev => {
      const next = !prev
      try {
        localStorage.setItem(LS_KEY, String(next))
        document.documentElement.style.setProperty('--rail-w', next ? EXPANDED_W : COLLAPSED_W)
      } catch {}
      return next
    })
  }

  const groups: Array<{ key: NonNullable<SectionDef['group']>; items: SectionDef[] }> = [
    { key: 'overview', items: SECTIONS.filter(s => s.group === 'overview') },
    { key: 'ai',       items: SECTIONS.filter(s => s.group === 'ai') },
    { key: 'spend',    items: SECTIONS.filter(s => s.group === 'spend') },
    { key: 'health',   items: SECTIONS.filter(s => s.group === 'health') },
    { key: 'movers',   items: SECTIONS.filter(s => s.group === 'movers') },
  ]

  return (
    <aside
      className="hidden md:flex flex-col sticky overflow-y-auto transition-[width] duration-200 ease-out"
      style={{
        top:        'calc(var(--nav-h, 56px) + var(--controls-h, 52px))',
        height:     'calc(100vh - var(--nav-h, 56px) - var(--controls-h, 52px))',
        width:      'var(--rail-w, 56px)',
        background: 'var(--surface-lo)',
        borderRight:'1px solid var(--border-lo)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Rail header — expand/collapse toggle */}
      <div
        className="flex-shrink-0 flex items-center h-9 px-2 mb-1 border-b"
        style={{ borderColor: 'var(--border-lo)' }}
      >
        {expanded && (
          <span
            className="flex-1 text-[10px] font-heading font-bold uppercase tracking-wider truncate px-1.5"
            style={{ color: 'var(--text-3)' }}
          >
            Sections
          </span>
        )}
        <button
          onClick={toggle}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          className={`flex items-center justify-center rounded-lg transition-all hover:bg-cyan/10 ${expanded ? 'w-7 h-7' : 'w-8 h-8 mx-auto'}`}
          style={{ color: 'var(--text-2)' }}
        >
          {/* Chevron rotates */}
          <span
            className="inline-block text-[11px] leading-none transition-transform"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ›
          </span>
        </button>
      </div>

      <div className="flex-1 py-1">
        {groups.map((g, gi) => (
          <div key={g.key}>
            {/* Group label (expanded) or divider line (collapsed) */}
            {gi > 0 && !expanded && (
              <div className="my-1.5 mx-3 border-t" style={{ borderColor: 'var(--border-lo)' }} />
            )}
            {expanded && (
              <p
                className={`text-[9px] font-heading font-bold uppercase tracking-wider px-3 truncate ${gi > 0 ? 'mt-3 mb-1' : 'mb-1'}`}
                style={{ color: 'var(--text-3)' }}
              >
                {GROUP_LABELS[g.key]}
              </p>
            )}

            {g.items.map(s => {
              const active = activeId === s.id
              const badge  = badges?.[s.id]
              return (
                <button
                  key={s.id}
                  onClick={() => onSelect(active ? null : s.id)}
                  aria-label={s.label}
                  title={expanded ? undefined : `${s.label}${s.shortcut ? ` (${s.shortcut})` : ''}`}
                  className={`group relative w-full flex items-center h-9 transition-all ${expanded ? 'justify-start gap-2.5 pl-2 pr-3' : 'justify-center'}`}
                  style={{
                    color: active ? '#31C0FF' : 'var(--text-2)',
                  }}
                >
                  {/* Active rail indicator */}
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r-full transition-all"
                    style={{
                      height:     active ? '20px' : '0',
                      background: '#31C0FF',
                    }}
                  />
                  <span
                    className="text-[15px] flex items-center justify-center w-8 h-8 rounded-lg transition-all flex-shrink-0 group-hover:bg-cyan/10"
                    style={{
                      background: active ? 'rgba(49,192,255,0.12)' : 'transparent',
                    }}
                  >
                    {s.icon}
                  </span>

                  {/* Inline label (only when expanded) */}
                  {expanded && (
                    <span className="text-xs font-medium flex-1 truncate text-left">
                      {s.label}
                    </span>
                  )}

                  {/* Shortcut hint (only when expanded + has shortcut) */}
                  {expanded && s.shortcut && !badge && (
                    <kbd
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        background: 'var(--surface-lo)',
                        border:     '1px solid var(--border-lo)',
                        color:      'var(--text-3)',
                      }}
                    >
                      {s.shortcut}
                    </kbd>
                  )}

                  {/* Badge dot */}
                  {badge && (
                    <span
                      className={
                        expanded
                          ? 'min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center tabular-nums flex-shrink-0'
                          : 'absolute top-1 right-1 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center tabular-nums'
                      }
                      style={{
                        background:
                          badge.tone === 'alert' ? '#ef4444' :
                          badge.tone === 'warn'  ? '#FF8A30' :
                                                   '#31C0FF',
                        color: '#fff',
                      }}
                    >
                      {badge.count != null ? badge.count : ''}
                    </span>
                  )}

                  {/* Floating tooltip — only when collapsed */}
                  {!expanded && (
                    <span
                      className="absolute left-full top-1/2 -translate-y-1/2 ml-1 px-2 py-1 rounded-md text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50"
                      style={{
                        background: 'var(--surface-hi)',
                        border:     '1px solid var(--border)',
                        color:      'var(--text-1)',
                        boxShadow:  'var(--shadow-sm)',
                      }}
                    >
                      {s.label}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </aside>
  )
}
