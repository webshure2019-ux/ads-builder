'use client'
import { useEffect, useState } from 'react'

interface GoogleClient { id: string; name: string }
interface Props { selectedId: string | null; onSelect: (id: string) => void }

export function ClientSelector({ selectedId, onSelect }: Props) {
  const [clients, setClients] = useState<GoogleClient[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(d => { setClients(d.clients || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="bg-white border border-cloud rounded-2xl p-4">
      <h3 className="font-heading font-bold text-sm text-navy mb-3">Client Account</h3>
      {loading ? (
        <p className="text-xs text-teal">Loading accounts...</p>
      ) : (
        <div className="space-y-1.5">
          {clients.map(c => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                selectedId === c.id
                  ? 'bg-cloud border border-cyan font-semibold text-navy'
                  : 'border border-cloud text-navy hover:bg-mist'
              }`}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedId === c.id ? 'bg-cyan' : 'bg-cloud'}`} />
              {c.name}
            </button>
          ))}
          {clients.length === 0 && (
            <p className="text-xs text-teal">No client accounts found under this MCC.</p>
          )}
        </div>
      )}
    </div>
  )
}
