'use client'
import { AdGroup, PpcPackage, PPC_PACKAGE_CONFIG } from '@/types'

interface Props {
  adGroups: AdGroup[]
  ppcPackage: PpcPackage
  onChange: (adGroups: AdGroup[]) => void
}

export function AdGroupManager({ adGroups, ppcPackage, onChange }: Props) {
  const config = PPC_PACKAGE_CONFIG[ppcPackage]
  const maxGroups = config.maxAdGroups
  const filledCount = adGroups.filter(ag => ag.name.trim()).length

  function addGroup() {
    if (adGroups.length >= maxGroups) return
    onChange([...adGroups, { id: crypto.randomUUID(), name: '', usps: [], keywords: [], negative_keywords: [] }])
  }

  function removeGroup(id: string) {
    if (adGroups.length <= 1) return
    onChange(adGroups.filter(ag => ag.id !== id))
  }

  function updateName(id: string, name: string) {
    onChange(adGroups.map(ag => ag.id === id ? { ...ag, name } : ag))
  }

  const input = 'flex-1 bg-mist border border-cloud rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:border-cyan'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-navy/70">
          Each row is one ad group (product or service). Enter the exact name to advertise.
        </p>
        <span className="text-xs font-heading font-bold text-teal bg-cloud px-2 py-1 rounded-full whitespace-nowrap">
          {filledCount} / {maxGroups} used
        </span>
      </div>

      <div className="space-y-2">
        {adGroups.map((ag, i) => (
          <div key={ag.id} className="flex items-center gap-2">
            <span className="text-[10px] font-heading font-bold uppercase text-teal w-6 text-right flex-shrink-0">
              {i + 1}
            </span>
            <input
              className={input}
              placeholder={`e.g. ${getPlaceholder(i)}`}
              value={ag.name}
              onChange={e => updateName(ag.id, e.target.value)}
            />
            {ag.assets && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full whitespace-nowrap">
                Generated
              </span>
            )}
            {adGroups.length > 1 && (
              <button
                onClick={() => removeGroup(ag.id)}
                className="text-navy/30 hover:text-red-400 transition-colors text-sm font-bold flex-shrink-0 w-5"
                title="Remove ad group"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {adGroups.length < maxGroups && (
        <button
          onClick={addGroup}
          className="w-full border-2 border-dashed border-cloud hover:border-cyan/50 rounded-xl py-2.5 text-xs font-heading font-bold text-navy/40 hover:text-teal transition-all"
        >
          + Add Product / Service ({adGroups.length}/{maxGroups})
        </button>
      )}
    </div>
  )
}

function getPlaceholder(index: number): string {
  const examples = [
    'PPC Management', 'SEO Services', 'Web Design',
    'Social Media Management', 'Email Marketing',
    'Content Writing', 'Graphic Design', 'Video Production',
  ]
  return examples[index % examples.length]
}
