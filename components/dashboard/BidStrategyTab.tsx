'use client'
import { useState, useRef } from 'react'
import type { BidStrategyData } from '@/lib/google-ads'

// ─── Constants ─────────────────────────────────────────────────────────────────

const STRATEGY_LABELS: Record<string, string> = {
  MANUAL_CPC:               'Manual CPC',
  MAXIMIZE_CLICKS:          'Maximize Clicks',
  MAXIMIZE_CONVERSIONS:     'Maximize Conversions',
  MAXIMIZE_CONVERSION_VALUE:'Maximize Conv. Value',
  TARGET_CPA:               'Target CPA',
  TARGET_ROAS:              'Target ROAS',
  ENHANCED_CPC:             'Enhanced CPC',
  TARGET_SPEND:             'Target Spend',
  TARGET_IMPRESSION_SHARE:  'Target Impression Share',
  // numeric fallbacks
  '3': 'Manual CPC',
  '4': 'Enhanced CPC',
  '6': 'Target CPA',
  '7': 'Maximize Clicks',
  '8': 'Target Spend',
  '9': 'Maximize Conversions',
  '10': 'Maximize Conv. Value',
  '16': 'Target Impression Share',
  '18': 'Target ROAS',
}

const STRATEGY_COLORS: Record<string, string> = {
  TARGET_CPA:               'bg-emerald-100 text-emerald-800 border-emerald-300',
  '6':                      'bg-emerald-100 text-emerald-800 border-emerald-300',
  TARGET_ROAS:              'bg-cyan/10 text-cyan-900 border-cyan/30',
  '18':                     'bg-cyan/10 text-cyan-900 border-cyan/30',
  MAXIMIZE_CONVERSIONS:     'bg-violet-100 text-violet-800 border-violet-300',
  '9':                      'bg-violet-100 text-violet-800 border-violet-300',
  MAXIMIZE_CONVERSION_VALUE:'bg-purple-100 text-purple-800 border-purple-300',
  '10':                     'bg-purple-100 text-purple-800 border-purple-300',
  MAXIMIZE_CLICKS:          'bg-blue-100 text-blue-800 border-blue-200',
  '7':                      'bg-blue-100 text-blue-800 border-blue-200',
  MANUAL_CPC:               'bg-cloud text-navy/70 border-cloud',
  '3':                      'bg-cloud text-navy/70 border-cloud',
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  LEARNING:                  { label: '🎓 Learning',             color: 'text-amber-600' },
  LEARNING_LIMITED:          { label: '⚠️ Learning limited',     color: 'text-amber-600' },
  ELIGIBLE:                  { label: '✅ Eligible',              color: 'text-emerald-600' },
  LIMITED_BY_BUDGET:         { label: '💸 Budget limited',        color: 'text-red-500' },
  MISALIGNED_CAMPAIGN_STRATEGY:{ label: '⚡ Strategy mismatch', color: 'text-red-500' },
  PAUSED:                    { label: '⏸ Paused',                color: 'text-navy/40' },
  UNAVAILABLE:               { label: '— N/A',                   color: 'text-navy/30' },
  UNSPECIFIED:               { label: '— Unspecified',           color: 'text-navy/30' },
}

const EDITABLE_STRATEGIES = [
  { value: 'MANUAL_CPC',               label: 'Manual CPC' },
  { value: 'MAXIMIZE_CLICKS',          label: 'Maximize Clicks' },
  { value: 'MAXIMIZE_CONVERSIONS',     label: 'Maximize Conversions' },
  { value: 'MAXIMIZE_CONVERSION_VALUE',label: 'Maximize Conv. Value' },
  { value: 'TARGET_CPA',               label: 'Target CPA' },
  { value: 'TARGET_ROAS',              label: 'Target ROAS' },
]

// Maps Google Ads API numeric bidding strategy codes → canonical string names
const NUMERIC_TO_STRATEGY: Record<string, string> = {
  '3': 'MANUAL_CPC',
  '4': 'ENHANCED_CPC',
  '6': 'TARGET_CPA',
  '7': 'MAXIMIZE_CLICKS',
  '8': 'TARGET_SPEND',
  '9': 'MAXIMIZE_CONVERSIONS',
  '10': 'MAXIMIZE_CONVERSION_VALUE',
  '16': 'TARGET_IMPRESSION_SHARE',
  '18': 'TARGET_ROAS',
}

// ─── Edit panel ────────────────────────────────────────────────────────────────
function EditPanel({ strategy, clientId, campaignId, currency, onSaved, onCancel }: {
  strategy:   BidStrategyData
  clientId:   string
  campaignId: string
  currency:   string
  onSaved:    (next: BidStrategyData) => void
  onCancel:   () => void
}) {
  // Normalise numeric type codes (e.g. '9') to canonical string names (e.g. 'MAXIMIZE_CONVERSIONS')
  const normalise = (t: string) => NUMERIC_TO_STRATEGY[t] ?? t
  const [type,     setType]     = useState(normalise(strategy.type))
  const [cpaInput, setCpaInput] = useState(
    strategy.targetCpaMicros ? (strategy.targetCpaMicros / 1_000_000).toFixed(2) : ''
  )
  const [roasInput, setRoasInput] = useState(
    strategy.targetRoas ? (strategy.targetRoas * 100).toFixed(1) : ''
  )
  const [eCpc,    setECpc]    = useState(strategy.eCpcEnabled)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const needsCpa  = type === 'TARGET_CPA'
  const needsRoas = type === 'TARGET_ROAS'
  const canCpa    = type === 'MAXIMIZE_CONVERSIONS'
  const canRoas   = type === 'MAXIMIZE_CONVERSION_VALUE'

  async function save() {
    setSaving(true); setError('')
    let targetCpaMicros: number | undefined
    let targetRoas:      number | undefined

    if (needsCpa || canCpa) {
      const v = parseFloat(cpaInput)
      if (needsCpa && (!Number.isFinite(v) || v <= 0)) { setError('Enter a valid Target CPA'); setSaving(false); return }
      if (Number.isFinite(v) && v > 0) targetCpaMicros = Math.round(v * 1_000_000)
    }
    if (needsRoas || canRoas) {
      const v = parseFloat(roasInput)
      if (needsRoas && (!Number.isFinite(v) || v <= 0)) { setError('Enter a valid Target ROAS'); setSaving(false); return }
      if (Number.isFinite(v) && v > 0) targetRoas = v / 100
    }

    try {
      const res = await fetch('/api/bid-strategy', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_account_id: clientId, campaign_id: campaignId,
          strategy_type: type, target_cpa_micros: targetCpaMicros,
          target_roas: targetRoas, ecpc_enabled: eCpc,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      onSaved({
        type, systemStatus: strategy.systemStatus,
        targetCpaMicros: targetCpaMicros ?? null,
        targetRoas:      targetRoas      ?? null,
        eCpcEnabled:     eCpc,
      })
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-cyan/5 border border-cyan/20 rounded-2xl px-5 py-4 space-y-4">
      <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Edit Bid Strategy</p>

      {/* Strategy selector */}
      <div>
        <label className="text-[10px] text-navy/50 block mb-1.5">Bidding Strategy</label>
        <div className="flex flex-wrap gap-2">
          {EDITABLE_STRATEGIES.map(s => (
            <button
              key={s.value}
              onClick={() => setType(s.value)}
              className={`text-xs px-3 py-1.5 rounded-xl border transition-all ${
                type === s.value
                  ? 'bg-cyan text-navy border-cyan font-bold'
                  : 'bg-white border-cloud text-navy/60 hover:border-cyan/40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target CPA input */}
      {(needsCpa || canCpa) && (
        <div>
          <label className="text-[10px] text-navy/50 block mb-1">
            Target CPA ({currency}){canCpa ? ' (optional)' : ''}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-teal">{currency}</span>
            <input
              type="number" min="0.01" step="0.01" value={cpaInput}
              onChange={e => setCpaInput(e.target.value)}
              placeholder={canCpa ? 'Leave blank for auto' : 'e.g. 25.00'}
              className="w-36 border border-cloud rounded-lg px-3 py-1.5 text-xs text-navy focus:outline-none focus:border-cyan bg-white"
            />
          </div>
        </div>
      )}

      {/* Target ROAS input */}
      {(needsRoas || canRoas) && (
        <div>
          <label className="text-[10px] text-navy/50 block mb-1">
            Target ROAS (%){canRoas ? ' (optional)' : ''}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number" min="1" step="1" value={roasInput}
              onChange={e => setRoasInput(e.target.value)}
              placeholder={canRoas ? 'Leave blank for auto' : 'e.g. 300'}
              className="w-28 border border-cloud rounded-lg px-3 py-1.5 text-xs text-navy focus:outline-none focus:border-cyan bg-white"
            />
            <span className="text-xs text-teal">%</span>
            {roasInput && (
              <span className="text-[10px] text-navy/40">
                = {(parseFloat(roasInput) / 100).toFixed(2)}× return
              </span>
            )}
          </div>
        </div>
      )}

      {/* eCPC toggle for manual CPC */}
      {type === 'MANUAL_CPC' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={eCpc} onChange={e => setECpc(e.target.checked)}
            className="w-3.5 h-3.5 accent-cyan" />
          <span className="text-xs text-navy/70">Enable Enhanced CPC (eCPC)</span>
        </label>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="bg-cyan text-navy text-xs font-bold px-5 py-2 rounded-xl hover:bg-cyan/80 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save Strategy'}
        </button>
        <button onClick={onCancel} className="text-xs text-navy/40 hover:text-navy px-3 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function BidStrategyTab({ clientId, campaignId, currency }: {
  clientId:   string
  campaignId: string
  currency:   string
}) {
  const [strategy, setStrategy] = useState<BidStrategyData | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [editing,  setEditing]  = useState(false)
  const fetched = useRef('')

  function load() {
    const key = `${clientId}|${campaignId}`
    if (fetched.current === key || loading) return
    fetched.current = key
    setLoading(true); setError('')
    fetch(`/api/bid-strategy?client_account_id=${encodeURIComponent(clientId)}&campaign_id=${encodeURIComponent(campaignId)}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        setStrategy(d.strategy)
      })
      .catch(e => { setError(e.message); fetched.current = '' })
      .finally(() => setLoading(false))
  }

  if (!fetched.current && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-4xl">💡</div>
        <p className="text-sm text-navy/60 text-center max-w-xs">
          View and update this campaign&apos;s bidding strategy, target CPA, and target ROAS.
        </p>
        <button onClick={load}
          className="bg-cyan text-navy font-heading font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-cyan/80 transition-colors">
          💡 Load Bid Strategy
        </button>
      </div>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center gap-3 py-16 text-teal text-sm">
      <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
      Loading bid strategy…
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 mt-4">
      {error}
      <button onClick={() => { setError(''); fetched.current = ''; load() }} className="ml-3 underline">Retry</button>
    </div>
  )

  if (!strategy) return null

  const typeLabel  = STRATEGY_LABELS[strategy.type] ?? strategy.type
  const typeColor  = STRATEGY_COLORS[strategy.type] ?? 'bg-cloud text-navy/70 border-cloud'
  const statusInfo = STATUS_LABELS[strategy.systemStatus] ?? { label: strategy.systemStatus, color: 'text-navy/50' }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-heading font-bold text-navy">💡 Bid Strategy</p>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] font-bold text-navy/50 hover:text-cyan border border-dashed border-cloud hover:border-cyan/40 px-3 py-1.5 rounded-xl transition-all"
          >
            ✏️ Change Strategy
          </button>
        )}
      </div>

      {/* Current strategy card */}
      {!editing && (
        <div className="bg-white border border-cloud rounded-2xl overflow-hidden">
          <div className="px-5 py-4 space-y-4">

            {/* Strategy badge + status */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`inline-flex text-sm font-heading font-bold px-4 py-1.5 rounded-full border ${typeColor}`}>
                {typeLabel}
              </span>
              {strategy.systemStatus && strategy.systemStatus !== 'UNSPECIFIED' && (
                <span className={`text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
              )}
            </div>

            {/* Target values */}
            {strategy.targetCpaMicros !== null && (
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal w-24">Target CPA</span>
                <span className="text-lg font-heading font-bold text-navy tabular-nums">
                  {currency} {(strategy.targetCpaMicros / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {strategy.targetRoas !== null && (
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal w-24">Target ROAS</span>
                <span className="text-lg font-heading font-bold text-navy tabular-nums">
                  {(strategy.targetRoas * 100).toFixed(0)}%
                  <span className="text-sm font-normal text-navy/50 ml-1.5">({strategy.targetRoas.toFixed(2)}× return)</span>
                </span>
              </div>
            )}
            {(strategy.type === 'MANUAL_CPC' || strategy.type === '3') && (
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal w-24">eCPC</span>
                <span className={`text-xs font-bold ${strategy.eCpcEnabled ? 'text-emerald-600' : 'text-navy/40'}`}>
                  {strategy.eCpcEnabled ? '✅ Enabled' : '— Disabled'}
                </span>
              </div>
            )}

            {/* No target set */}
            {strategy.targetCpaMicros === null && strategy.targetRoas === null
              && strategy.type !== 'MANUAL_CPC' && strategy.type !== '3'
              && strategy.type !== 'MAXIMIZE_CLICKS' && strategy.type !== '7' && (
              <p className="text-xs text-navy/40 italic">No target value set — strategy is fully automated.</p>
            )}
          </div>

          {/* Info footer */}
          <div className="px-5 py-3 bg-mist border-t border-cloud/60">
            <p className="text-[10px] text-navy/50 leading-relaxed">
              {strategy.type === 'TARGET_CPA' || strategy.type === '6'
                ? 'Google Ads sets bids to help you get as many conversions as possible at the target cost-per-action.'
                : strategy.type === 'TARGET_ROAS' || strategy.type === '18'
                ? 'Google Ads sets bids to maximise conversion value while hitting the target return on ad spend.'
                : strategy.type === 'MAXIMIZE_CONVERSIONS' || strategy.type === '9'
                ? 'Google Ads automatically sets bids to get the most conversions within your budget.'
                : strategy.type === 'MAXIMIZE_CONVERSION_VALUE' || strategy.type === '10'
                ? 'Google Ads sets bids to maximise total conversion value within your budget.'
                : strategy.type === 'MAXIMIZE_CLICKS' || strategy.type === '7'
                ? 'Google Ads automatically sets bids to get as many clicks as possible within your budget.'
                : 'You set bids manually for each keyword and ad group.'}
            </p>
          </div>
        </div>
      )}

      {/* Edit panel */}
      {editing && (
        <EditPanel
          strategy={strategy}
          clientId={clientId}
          campaignId={campaignId}
          currency={currency}
          onSaved={next => { setStrategy(next); setEditing(false) }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  )
}
