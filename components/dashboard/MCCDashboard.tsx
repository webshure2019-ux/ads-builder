'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────
interface AccountSummary {
  id:                 string
  name:               string
  currency:           string
  clicks:             number
  cost:               number
  impressions:        number
  conversions:        number
  ctr:                number
  conversion_rate:    number
  activeCampaigns:    number
  totalCampaigns:     number
  avgImpressionShare: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toYMD(d: Date) { return d.toISOString().split('T')[0] }

function resolvePreset(preset: string): { start: string; end: string } {
  const end   = new Date()
  const start = new Date()
  if (preset === 'mtd') {
    return {
      start: toYMD(new Date(end.getFullYear(), end.getMonth(), 1)),
      end:   toYMD(end),
    }
  }
  start.setDate(end.getDate() - parseInt(preset))
  return { start: toYMD(start), end: toYMD(end) }
}

function curr(n: number, c = 'USD') {
  return n.toLocaleString(undefined, { style: 'currency', currency: c, maximumFractionDigits: 0 })
}

function pct(n: number) { return `${n.toFixed(2)}%` }

type SortKey = 'cost' | 'conversions' | 'ctr' | 'conversion_rate' | 'clicks' | 'name'

const IS_COLOR = (v: number | null) =>
  v === null ? 'text-navy/30'
  : v >= 60   ? 'text-emerald-600'
  : v >= 35   ? 'text-amber-600'
  : 'text-red-600'

// ─── Account card ─────────────────────────────────────────────────────────────
function AccountCard({ account, rank }: { account: AccountSummary; rank: number }) {
  const isColor = IS_COLOR(account.avgImpressionShare)
  return (
    <Link
      href={`/clients?client=${account.id}`}
      className="group block border border-cloud rounded-2xl p-4 bg-white hover:border-teal/40 hover:shadow-sm transition-all space-y-3 cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-navy/30 bg-cloud px-1.5 py-0.5 rounded-full">#{rank}</span>
            <p className="font-heading font-bold text-navy text-sm truncate" title={account.name}>
              {account.name}
            </p>
          </div>
          <p className="text-[10px] text-navy/40 mt-0.5">
            {account.activeCampaigns} active · {account.totalCampaigns} total campaigns
          </p>
        </div>
        <span className="text-[9px] text-navy/30 bg-cloud px-1.5 py-0.5 rounded-full flex-shrink-0">
          {account.currency}
        </span>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-cloud/40 rounded-xl px-3 py-2">
          <p className="text-[9px] text-navy/40 uppercase tracking-wide">Spend</p>
          <p className="font-bold text-navy">{curr(account.cost, account.currency)}</p>
        </div>
        <div className="bg-cloud/40 rounded-xl px-3 py-2">
          <p className="text-[9px] text-navy/40 uppercase tracking-wide">Conversions</p>
          <p className="font-bold text-navy">{account.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
        </div>
        <div className="bg-cloud/40 rounded-xl px-3 py-2">
          <p className="text-[9px] text-navy/40 uppercase tracking-wide">CTR</p>
          <p className={`font-bold ${account.ctr >= 5 ? 'text-emerald-600' : account.ctr >= 2 ? 'text-navy' : 'text-amber-600'}`}>
            {pct(account.ctr)}
          </p>
        </div>
        <div className="bg-cloud/40 rounded-xl px-3 py-2">
          <p className="text-[9px] text-navy/40 uppercase tracking-wide">Conv Rate</p>
          <p className={`font-bold ${account.conversion_rate >= 3 ? 'text-emerald-600' : account.conversion_rate >= 1 ? 'text-navy' : 'text-amber-600'}`}>
            {pct(account.conversion_rate)}
          </p>
        </div>
      </div>

      {/* IS + clicks bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-navy/40">Impression Share</span>
          <span className={`font-bold ${isColor}`}>
            {account.avgImpressionShare !== null ? `${account.avgImpressionShare}%` : '—'}
          </span>
        </div>
        <div className="h-1 bg-cloud rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              (account.avgImpressionShare ?? 0) >= 60 ? 'bg-emerald-400' :
              (account.avgImpressionShare ?? 0) >= 35 ? 'bg-amber-400' : 'bg-red-400'
            }`}
            style={{ width: `${account.avgImpressionShare ?? 0}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-navy/40 border-t border-cloud pt-2">
        <span>{account.clicks.toLocaleString()} clicks</span>
        <span>{account.impressions.toLocaleString()} impressions</span>
      </div>

      <div className="text-[9px] text-teal font-medium text-center pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        Open dashboard →
      </div>
    </Link>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function MCCDashboard() {
  const [preset,    setPreset]    = useState('30')
  const [accounts,  setAccounts]  = useState<AccountSummary[]>([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [sortKey,   setSortKey]   = useState<SortKey>('cost')
  const [sortAsc,   setSortAsc]   = useState(false)
  const [failed,    setFailed]    = useState(0)

  function load(p: string) {
    const { start, end } = resolvePreset(p)
    setLoading(true)
    setError(null)
    fetch(`/api/mcc-summary?start_date=${start}&end_date=${end}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setAccounts(d.accounts ?? [])
        setFailed(d.failed ?? 0)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(preset) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  function sort(k: SortKey) {
    if (sortKey === k) setSortAsc(a => !a)
    else { setSortKey(k); setSortAsc(false) }
  }

  const sorted = [...accounts].sort((a, b) => {
    let diff = 0
    if (sortKey === 'name') diff = a.name.localeCompare(b.name)
    else diff = (a[sortKey] as number) - (b[sortKey] as number)
    return sortAsc ? diff : -diff
  })

  // Aggregate totals
  const totals = accounts.reduce(
    (acc, a) => ({
      cost:        acc.cost        + a.cost,
      clicks:      acc.clicks      + a.clicks,
      impressions: acc.impressions + a.impressions,
      conversions: acc.conversions + a.conversions,
    }),
    { cost: 0, clicks: 0, impressions: 0, conversions: 0 }
  )

  const PRESETS = [
    { value: '7',   label: '7d'   },
    { value: '14',  label: '14d'  },
    { value: '30',  label: '30d'  },
    { value: 'mtd', label: 'MTD'  },
  ]

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k
    return (
      <button
        onClick={() => sort(k)}
        className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors flex items-center gap-0.5 ${
          active ? 'bg-teal text-white' : 'bg-cloud text-navy/50 hover:bg-cloud/70'
        }`}
      >
        {label}
        {active && <span className="text-[8px]">{sortAsc ? '↑' : '↓'}</span>}
      </button>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-heading font-bold text-navy text-xl">MCC Overview</h2>
          <p className="text-xs text-teal mt-0.5">All accounts · aggregate performance</p>
        </div>

        {/* Date presets */}
        <div className="flex items-center gap-2">
          {PRESETS.map(p => (
            <button
              key={p.value}
              onClick={() => { setPreset(p.value); load(p.value) }}
              className={`text-xs font-heading font-bold px-4 py-2 rounded-xl transition-colors ${
                preset === p.value
                  ? 'bg-teal text-white'
                  : 'bg-cloud text-navy hover:bg-cloud/70'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => load(preset)}
            disabled={loading}
            className="text-xs px-3 py-2 rounded-xl bg-cloud text-navy/60 hover:bg-cloud/70 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            ↺
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 rounded-2xl px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-52 bg-cloud rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && accounts.length > 0 && (
        <>
          {/* Aggregate summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Spend',       value: `$${totals.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
              { label: 'Total Clicks',      value: totals.clicks.toLocaleString() },
              { label: 'Total Conversions', value: totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
              { label: 'Accounts',          value: accounts.length.toString() },
            ].map(item => (
              <div key={item.label} className="border border-cloud rounded-2xl bg-white px-5 py-4 text-center">
                <p className="text-[9px] text-navy/40 uppercase tracking-wide mb-1">{item.label}</p>
                <p className="font-heading font-bold text-navy text-xl">{item.value}</p>
              </div>
            ))}
          </div>

          {failed > 0 && (
            <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              ⚠️ {failed} account{failed !== 1 ? 's' : ''} failed to load and are excluded from this view.
            </p>
          )}

          {/* Sort controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-navy/40">Sort by:</span>
            <SortBtn k="cost"            label="Spend" />
            <SortBtn k="conversions"     label="Conversions" />
            <SortBtn k="clicks"          label="Clicks" />
            <SortBtn k="ctr"             label="CTR" />
            <SortBtn k="conversion_rate" label="Conv Rate" />
            <SortBtn k="name"            label="Name" />
          </div>

          {/* Account cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((account, i) => (
              <AccountCard key={account.id} account={account} rank={i + 1} />
            ))}
          </div>

          {/* Leaderboard table for quick comparison */}
          <div className="border border-cloud rounded-2xl overflow-hidden bg-white">
            <div className="px-5 py-3 border-b border-cloud">
              <p className="font-heading font-bold text-navy text-sm">Leaderboard</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-cloud/50 text-navy/50 text-[10px] uppercase tracking-wide">
                    <th className="text-left px-4 py-2 font-medium">#</th>
                    <th className="text-left px-4 py-2 font-medium">Account</th>
                    <th className="text-right px-3 py-2 font-medium">Spend</th>
                    <th className="text-right px-3 py-2 font-medium">Clicks</th>
                    <th className="text-right px-3 py-2 font-medium">CTR</th>
                    <th className="text-right px-3 py-2 font-medium">Conv</th>
                    <th className="text-right px-3 py-2 font-medium">CVR</th>
                    <th className="text-right px-3 py-2 font-medium">IS</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((a, i) => (
                    <tr
                      key={a.id}
                      className={`cursor-pointer hover:bg-teal/5 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-cloud/20'}`}
                      onClick={() => window.location.href = `/clients?client=${a.id}`}
                      title={`Open ${a.name} dashboard`}
                    >
                      <td className="px-4 py-2 text-navy/30 text-[10px]">{i + 1}</td>
                      <td className="px-4 py-2 font-medium text-navy max-w-[160px] truncate">
                        <span className="text-teal hover:underline">{a.name}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-navy/70">{curr(a.cost, a.currency)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-navy/70">{a.clicks.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-navy/70">{pct(a.ctr)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-navy/70">{a.conversions.toFixed(0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-navy/70">{pct(a.conversion_rate)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-bold ${IS_COLOR(a.avgImpressionShare)}`}>
                        {a.avgImpressionShare !== null ? `${a.avgImpressionShare}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && accounts.length === 0 && !error && (
        <div className="border border-cloud rounded-2xl p-12 text-center bg-white">
          <p className="text-2xl mb-2">🏢</p>
          <p className="text-sm text-navy/40">No client accounts found in MCC.</p>
        </div>
      )}
    </div>
  )
}
