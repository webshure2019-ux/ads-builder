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
      ) : clients.length === 0 ? (
        <p className="text-xs text-teal">No client accounts found under this MCC.</p>
      ) : (
        <select
          value={selectedId || ''}
          onChange={e => e.target.value && onSelect(e.target.value)}
          className="w-full bg-mist border border-cloud rounded-lg px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-cyan appearance-none cursor-pointer"
        >
          <option value="">Select a client...</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}
