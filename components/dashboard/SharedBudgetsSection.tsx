'use client'
import { useState, useRef, useEffect } from 'react'
import type { SharedBudget } from '@/lib/google-ads'

// ─── Inline budget amount editor ──────────────────────────────────────────────
function BudgetAmountCell({ budget, clientId, currency, onUpdated }: {
  budget: SharedBudget; clientId: string; currency: string; onUpdated: (micros: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState((budget.amountMicros / 1_000_000).toFixed(2))
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const display = (budget.amountMicros / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  async function save() {
    const amount = parseFloat(value)
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/shared-budgets', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_account_id: clientId,
          resource_name:     budget.resourceName,
          amount_micros:     Math.round(amount * 1_000_000),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      onUpdated(Math.round(amount * 1_000_000)); setEditing(false)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (!editing) return (
    <button
      onClick={() => { setValue((budget.amountMicros / 1_000_000).toFixed(2)); setEditing(true) }}
      className="group flex items-center gap-1 text-right whitespace-nowrap"
      title="Click to edit budget"
    >
      <span className="tabular-nums text-navy font-bold text-sm">{currency} {display}</span>
      <span className="text-[10px] text-navy/25 group-hover:text-cyan transition-colors">✏️</span>
    </button>
  )

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-teal flex-shrink-0">{currency}</span>
        <input
          type="number" min="1" step="0.01" value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="w-28 border border-cyan rounded-lg px-2 py-1 text-xs text-navy focus:outline-none bg-white tabular-nums"
          autoFocus
        />
        <button onClick={save} disabled={saving}
          className="text-[11px] font-bold bg-cyan text-navy px-2 py-1 rounded-lg hover:bg-cyan/80 disabled:opacity-50 transition-colors">
          {saving ? '…' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)} className="text-[11px] text-navy/40 hover:text-navy px-1">✕</button>
      </div>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function SharedBudgetsSection({ clientId, currency }: {
  clientId: string; currency: string
}) {
  const [open,    setOpen]    = useState(false)
  const [budgets, setBudgets] = useState<SharedBudget[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const fetched = useRef('')

  // When the selected client changes while the section is already open, re-fetch
  useEffect(() => {
    if (open && fetched.current !== clientId) {
      fetched.current = clientId
      setLoading(true); setError(''); setBudgets([])
      fetch(`/api/shared-budgets?client_account_id=${encodeURIComponent(clientId)}`)
        .then(async r => {
          const d = await r.json()
          if (!r.ok) throw new Error(d.error)
          setBudgets(d.budgets ?? [])
        })
        .catch(e => { setError(e.message); fetched.current = '' })
        .finally(() => setLoading(false))
    }
  }, [clientId, open])

  function toggle() {
    setOpen(o => !o)
    if (!open && fetched.current !== clientId) {
      fetched.current = clientId
      setLoading(true); setError('')
      fetch(`/api/shared-budgets?client_account_id=${encodeURIComponent(clientId)}`)
        .then(async r => {
          const d = await r.json()
          if (!r.ok) throw new Error(d.error)
          setBudgets(d.budgets ?? [])
        })
        .catch(e => { setError(e.message); fetched.current = '' })
        .finally(() => setLoading(false))
    }
  }

  function handleAmountUpdate(budgetId: string, micros: number) {
    setBudgets(prev => prev.map(b => b.budgetId === budgetId ? { ...b, amountMicros: micros } : b))
  }

  return (
    <div className="bg-white border border-cloud rounded-2xl overflow-hidden">
      {/* Header / toggle */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-mist/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm">💰</span>
          <div>
            <p className="text-[11px] font-heading font-bold uppercase tracking-wider text-teal">Shared Budgets</p>
            {!open && budgets.length > 0 && (
              <p className="text-[10px] text-navy/40 mt-0.5">{budgets.length} shared budget{budgets.length !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
        <span className="text-navy/40 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-cloud px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-teal">
              <div className="w-4 h-4 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
              Loading shared budgets…
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
              {error}
              <button onClick={() => { fetched.current = ''; toggle() }} className="ml-2 underline">Retry</button>
            </div>
          ) : budgets.length === 0 ? (
            <p className="text-sm text-teal py-4 text-center">
              No shared budgets found in this account.
            </p>
          ) : (
            <div className="space-y-4">
              {budgets.map(b => (
                <div key={b.budgetId} className="border border-cloud rounded-2xl overflow-hidden">
                  {/* Budget header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-mist/60 gap-4 flex-wrap">
                    <div>
                      <p className="text-sm font-heading font-bold text-navy">{b.name}</p>
                      <p className="text-[10px] text-teal mt-0.5">
                        {b.referenceCount} campaign{b.referenceCount !== 1 ? 's' : ''} · {b.period.toLowerCase().replace('_', ' ')}
                      </p>
                    </div>
                    <BudgetAmountCell
                      budget={b}
                      clientId={clientId}
                      currency={currency}
                      onUpdated={micros => handleAmountUpdate(b.budgetId, micros)}
                    />
                  </div>

                  {/* Campaign list */}
                  {b.campaigns.length > 0 && (
                    <div className="divide-y divide-cloud/60">
                      {b.campaigns.map(c => {
                        const active = c.status === 'ENABLED' || c.status === '2'
                        return (
                          <div key={c.id} className="flex items-center gap-3 px-4 py-2">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                            <span className="text-xs text-navy truncate">{c.name}</span>
                            <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {active ? 'Active' : 'Paused'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
