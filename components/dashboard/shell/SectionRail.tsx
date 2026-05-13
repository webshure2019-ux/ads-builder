'use client'

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

// ─── Rail ─────────────────────────────────────────────────────────────────────
export function SectionRail({
  activeId, onSelect, badges,
}: {
  activeId: SectionId | null
  onSelect: (id: SectionId | null) => void
  badges?:  Partial<Record<SectionId, { count?: number; tone?: 'alert' | 'warn' | 'info' }>>
}) {
  const groups: Array<{ label: string; items: SectionDef[] }> = [
    { label: 'Overview', items: SECTIONS.filter(s => s.group === 'overview') },
    { label: 'AI',       items: SECTIONS.filter(s => s.group === 'ai') },
    { label: 'Spend',    items: SECTIONS.filter(s => s.group === 'spend') },
    { label: 'Health',   items: SECTIONS.filter(s => s.group === 'health') },
    { label: 'Movers',   items: SECTIONS.filter(s => s.group === 'movers') },
  ]

  return (
    <aside
      className="hidden md:flex flex-col py-2 sticky overflow-y-auto"
      style={{
        top:        'calc(var(--nav-h, 56px) + var(--controls-h, 52px))',
        height:     'calc(100vh - var(--nav-h, 56px) - var(--controls-h, 52px))',
        width:      'var(--rail-w, 56px)',
        background: 'var(--surface-lo)',
        borderRight:'1px solid var(--border-lo)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {groups.map((g, gi) => (
        <div key={g.label}>
          {gi > 0 && <div className="my-1.5 mx-3 border-t" style={{ borderColor: 'var(--border-lo)' }} />}
          {g.items.map(s => {
            const active = activeId === s.id
            const badge  = badges?.[s.id]
            return (
              <button
                key={s.id}
                onClick={() => onSelect(active ? null : s.id)}
                aria-label={s.label}
                title={`${s.label}${s.shortcut ? ` (${s.shortcut})` : ''}`}
                className="group relative w-full flex items-center justify-center h-10 transition-all"
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
                  className="text-[15px] flex items-center justify-center w-8 h-8 rounded-lg transition-all group-hover:bg-cyan/10"
                  style={{
                    background: active ? 'rgba(49,192,255,0.12)' : 'transparent',
                  }}
                >
                  {s.icon}
                </span>

                {/* Badge dot */}
                {badge && (
                  <span
                    className="absolute top-1 right-1 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center tabular-nums"
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

                {/* Tooltip on hover */}
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
              </button>
            )
          })}
        </div>
      ))}
    </aside>
  )
}
