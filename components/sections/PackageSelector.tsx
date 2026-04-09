'use client'
import { PpcPackage, PPC_PACKAGE_CONFIG } from '@/types'

interface Props {
  selected: PpcPackage | null
  onSelect: (pkg: PpcPackage) => void
}

const PACKAGES: PpcPackage[] = ['ppc1', 'ppc2', 'ppc3']

export function PackageSelector({ selected, onSelect }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-navy/70">
        Select the package this client is on. Each product or service becomes its own ad group.
      </p>
      <div className="grid grid-cols-3 gap-4">
        {PACKAGES.map(pkg => {
          const config = PPC_PACKAGE_CONFIG[pkg]
          const isSelected = selected === pkg
          return (
            <button
              key={pkg}
              onClick={() => onSelect(pkg)}
              className={`rounded-xl border-2 py-5 px-4 text-center transition-all ${
                isSelected
                  ? 'border-navy bg-navy text-white'
                  : 'border-cloud bg-white text-navy hover:border-navy/40'
              }`}
            >
              <div className={`text-xl font-heading font-black mb-1 ${isSelected ? 'text-cyan' : 'text-navy'}`}>
                {config.label}
              </div>
              <div className={`text-xs font-heading font-bold mb-2 ${isSelected ? 'text-white/80' : 'text-teal'}`}>
                {config.description}
              </div>
              <div className={`text-[10px] uppercase tracking-wider ${isSelected ? 'text-white/60' : 'text-navy/50'}`}>
                {config.maxAdGroups} ad groups max
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
