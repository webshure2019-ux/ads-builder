import { CampaignType } from '@/types'

const TYPES: { id: CampaignType; icon: string; label: string }[] = [
  { id: 'search',     icon: '🔍', label: 'Search' },
  { id: 'pmax',       icon: '⚡', label: 'Perf. Max' },
  { id: 'demand_gen', icon: '🎯', label: 'Demand Gen' },
  { id: 'display',    icon: '🖼️', label: 'Display' },
  { id: 'shopping',   icon: '🛒', label: 'Shopping' },
  { id: 'video',      icon: '▶️', label: 'YouTube' },
]

interface Props {
  selected: CampaignType | null
  onSelect: (type: CampaignType) => void
}

export function CampaignTypeSelector({ selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {TYPES.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`rounded-xl border-2 py-3 px-2 text-center transition-all ${
            selected === t.id
              ? 'border-navy bg-navy text-white'
              : 'border-cloud bg-white text-navy hover:border-navy/40'
          }`}
        >
          <div className="text-2xl mb-1">{t.icon}</div>
          <div className={`text-xs font-heading font-bold ${selected === t.id ? 'text-cyan' : 'text-navy'}`}>
            {t.label}
          </div>
        </button>
      ))}
    </div>
  )
}
