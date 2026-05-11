'use client'
import { useState, useEffect, useRef } from 'react'
import type { AssetRow, PMaxAssetRow, AssetType, AssetLevel } from '@/lib/google-ads'

// ─── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  clientId:     string
  campaignId:   string
  channelType:  string   // 'PERFORMANCE_MAX' | '10' | 'SEARCH' | etc.
  startDate:    string
  endDate:      string
  currency:     string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function curr(n: number, currency: string) {
  return `${currency} ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtCtr(n: number) { return `${(n * 100).toFixed(2)}%` }
function fmtNum(n: number) { return n.toLocaleString('en-ZA') }

// ─── Sub-components ───────────────────────────────────────────────────────────
function LevelBadge({ level }: { level: AssetLevel }) {
  return level === 'ACCOUNT'
    ? <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Account</span>
    : <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-teal/15 text-teal">Campaign</span>
}

function StatusBadge({ status }: { status: string }) {
  const on = status === 'ENABLED' || status === '2'
  return <span className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${on ? 'bg-teal/15 text-teal' : 'bg-cloud text-navy/40'}`}>{on ? 'Enabled' : 'Paused'}</span>
}

function PerfDot({ label }: { label: string }) {
  const map: Record<string, { dot: string; label: string }> = {
    BEST:        { dot: 'bg-green-500',  label: 'Best'    },
    GOOD:        { dot: 'bg-blue-500',   label: 'Good'    },
    LOW:         { dot: 'bg-red-500',    label: 'Low'     },
    PENDING:     { dot: 'bg-gray-400',   label: 'Pending' },
    UNSPECIFIED: { dot: 'bg-gray-300',   label: '—'       },
  }
  const m = map[label] ?? map.UNSPECIFIED
  return <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${m.dot}`} /><span className="text-xs text-[var(--text-2)]">{m.label}</span></span>
}

function MetricCells({ row, currency }: { row: AssetRow; currency: string }) {
  if (row.level === 'ACCOUNT') {
    return <><td className="px-3 py-2 text-xs text-[var(--text-2)] text-right" colSpan={4}>—</td></>
  }
  return <>
    <td className="px-3 py-2 text-xs text-right">{fmtNum(row.clicks)}</td>
    <td className="px-3 py-2 text-xs text-right">{fmtNum(row.impressions)}</td>
    <td className="px-3 py-2 text-xs text-right">{fmtCtr(row.ctr)}</td>
    <td className="px-3 py-2 text-xs text-right">{curr(row.cost, currency)}</td>
  </>
}

// ─── Shared table header ───────────────────────────────────────────────────────
function MetricTh() {
  return <>
    <th className="px-3 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-[var(--text-2)]">Clicks</th>
    <th className="px-3 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-[var(--text-2)]">Impr.</th>
    <th className="px-3 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-[var(--text-2)]">CTR</th>
    <th className="px-3 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-[var(--text-2)]">Cost</th>
  </>
}

// ─── Undo toast ───────────────────────────────────────────────────────────────
function UndoToast({ message, onUndo, onDismiss }: { message: string; onUndo: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-navy text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
      <span>{message}</span>
      <button onClick={onUndo} className="font-bold text-cyan underline">Undo</button>
      <button onClick={onDismiss} className="text-white/50 hover:text-white">✕</button>
    </div>
  )
}

// ─── Structured snippet headers ───────────────────────────────────────────────
const SNIPPET_HEADERS = [
  'Amenities','Brands','Courses','Degree Programs','Destinations',
  'Featured Hotels','Insurance Coverage','Models','Neighbourhoods',
  'Service Catalog','Shows','Styles','Types',
]

// ─── Standard assets tab ──────────────────────────────────────────────────────
type StdTab = AssetType

function StandardAssetsView({ rows, loading, error, clientId, campaignId, currency, onRefresh }: {
  rows: AssetRow[]
  loading: boolean
  error: string
  clientId: string
  campaignId: string
  currency: string
  onRefresh: () => void
}) {
  const tabs: { id: StdTab; label: string }[] = [
    { id: 'SITELINK',           label: '🔗 Sitelinks'          },
    { id: 'CALLOUT',            label: '💬 Callouts'            },
    { id: 'CALL',               label: '📞 Call'                },
    { id: 'STRUCTURED_SNIPPET', label: '📋 Structured Snippets' },
    { id: 'IMAGE',              label: '🖼 Images'              },
    { id: 'PROMOTION',          label: '🏷 Promotions'          },
    { id: 'PRICE',              label: '💰 Prices'              },
    { id: 'LEAD_FORM',          label: '📝 Lead Forms'          },
  ]
  const [activeTab, setActiveTab] = useState<StdTab>('SITELINK')
  const [showAdd,   setShowAdd]   = useState(false)
  const [toast, setToast] = useState<{ row: AssetRow; timer: ReturnType<typeof setTimeout> } | null>(null)
  const [localRows, setLocalRows] = useState<AssetRow[]>(rows)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => { setLocalRows(rows) }, [rows])
  useEffect(() => { setShowAdd(false); setEditingId(null); setFormError('') }, [activeTab])

  const filtered = localRows.filter(r => r.assetType === activeTab)

  async function handleRemove(row: AssetRow) {
    setLocalRows(prev => prev.filter(r => !(r.assetId === row.assetId && r.level === row.level)))
    const timer = setTimeout(async () => {
      try {
        await fetch('/api/assets', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_account_id: clientId,
            campaign_id:       campaignId,
            asset_id:          row.assetId,
            field_type:        row.fieldType,
            level:             row.level,
          }),
        })
      } catch { /* ignore — already removed from UI */ }
      setToast(null)
    }, 3000)
    setToast({ row, timer })
  }

  function handleUndo() {
    if (!toast) return
    clearTimeout(toast.timer)
    setLocalRows(prev => [toast.row, ...prev])
    setToast(null)
  }

  async function handleAdd(fields: Record<string, unknown>, level: AssetLevel) {
    setSubmitting(true); setFormError('')
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, campaign_id: campaignId, level, asset_type: activeTab, fields }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to add')
      setShowAdd(false)
      onRefresh()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEdit(assetId: string, fields: Record<string, unknown>) {
    setSubmitting(true); setFormError('')
    try {
      const res = await fetch('/api/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, asset_id: assetId, asset_type: activeTab, fields }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to update')
      setEditingId(null)
      onRefresh()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-2)]"><div className="w-4 h-4 border-2 border-cyan border-t-transparent rounded-full animate-spin" />Loading assets…</div>
  if (error)   return <div className="flex items-center gap-3 py-4"><span className="text-xs text-red-500">{error}</span><button onClick={onRefresh} className="text-xs text-cyan underline">Retry</button></div>

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="flex flex-wrap gap-1 mb-4">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${activeTab === t.id ? 'bg-cyan text-navy' : 'bg-[var(--surface-lo)] text-[var(--text-2)] hover:text-[var(--text-1)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Add button */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[var(--text-2)]">{filtered.length} {filtered.length === 1 ? 'asset' : 'assets'}</span>
        {activeTab !== 'IMAGE' && activeTab !== 'LEAD_FORM' && (
          <button onClick={() => setShowAdd(v => !v)}
            className="text-xs font-medium text-cyan hover:text-cyan/80 transition-colors">
            {showAdd ? '✕ Cancel' : `+ Add ${tabs.find(t => t.id === activeTab)?.label.replace(/^[^\s]+ /, '') ?? ''}`}
          </button>
        )}
        {(activeTab === 'IMAGE' || activeTab === 'LEAD_FORM') && (
          <button onClick={() => setShowAdd(v => !v)}
            className="text-xs font-medium text-cyan hover:text-cyan/80 transition-colors">
            {showAdd ? '✕ Cancel' : `+ Add ${activeTab === 'IMAGE' ? 'Image' : 'Lead Form'}`}
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <AddForm
          assetType={activeTab}
          submitting={submitting}
          error={formError}
          onSubmit={handleAdd}
        />
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-2)] py-4">
          No {tabs.find(t => t.id === activeTab)?.label.replace(/^[^\s]+ /, '').toLowerCase()} attached — use the button above to add one.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-lo)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-lo)]">
              <tr>
                <AssetTableHeader type={activeTab} />
                <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-2)]">Level</th>
                <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-2)]">Status</th>
                <MetricTh />
                <th className="px-3 py-2 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-lo)]">
              {filtered.map(row => (
                <>
                  <tr key={`${row.assetId}-${row.level}`} className="hover:bg-[var(--surface-lo)]/50">
                    <AssetTableRow row={row} />
                    <td className="px-3 py-2"><LevelBadge level={row.level} /></td>
                    <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                    <MetricCells row={row} currency={currency} />
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 justify-end">
                        {canEdit(activeTab) && (
                          <button
                            onClick={() => setEditingId(editingId === row.assetId ? null : row.assetId)}
                            className="text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors" title="Edit">✏️</button>
                        )}
                        <button
                          onClick={() => handleRemove(row)}
                          className="text-[var(--text-2)] hover:text-red-500 transition-colors" title="Remove">🗑</button>
                      </div>
                    </td>
                  </tr>
                  {editingId === row.assetId && (
                    <tr key={`${row.assetId}-edit`}>
                      <td colSpan={100} className="px-4 py-3 bg-[var(--surface-lo)]/60">
                        <EditForm
                          row={row}
                          submitting={submitting}
                          error={formError}
                          onSubmit={(fields) => handleEdit(row.assetId, fields)}
                          onCancel={() => { setEditingId(null); setFormError('') }}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <UndoToast message="Asset removed" onUndo={handleUndo} onDismiss={() => { clearTimeout(toast.timer); setToast(null) }} />}
    </div>
  )
}

function canEdit(type: AssetType) {
  return type === 'SITELINK' || type === 'CALLOUT' || type === 'STRUCTURED_SNIPPET' || type === 'PROMOTION' || type === 'PRICE'
}

// ─── Table header cells per type ──────────────────────────────────────────────
function AssetTableHeader({ type }: { type: AssetType }) {
  const th = (label: string) => <th className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-2)]">{label}</th>
  switch (type) {
    case 'SITELINK':           return <>{th('Link Text')}{th('Desc 1')}{th('Desc 2')}{th('Final URL')}</>
    case 'CALLOUT':            return <>{th('Text')}</>
    case 'CALL':               return <>{th('Phone')}{th('Country')}</>
    case 'STRUCTURED_SNIPPET': return <>{th('Header')}{th('Values')}</>
    case 'IMAGE':              return <>{th('Preview')}{th('Type')}</>
    case 'PROMOTION':          return <>{th('Target')}{th('Discount')}{th('Code')}</>
    case 'PRICE':              return <>{th('Type')}{th('Qualifier')}{th('Items')}</>
    case 'LEAD_FORM':          return <>{th('Headline')}{th('Business')}</>
  }
}

// ─── Table body cells per type ────────────────────────────────────────────────
function AssetTableRow({ row }: { row: AssetRow }) {
  const td = (content: React.ReactNode, cls = '') =>
    <td className={`px-3 py-2 text-sm text-[var(--text-1)] ${cls}`}>{content}</td>
  switch (row.assetType) {
    case 'SITELINK': return <>
      {td(<span className="font-medium">{row.sitelink?.linkText}</span>)}
      {td(<span className="text-xs text-[var(--text-2)]">{row.sitelink?.description1 || '—'}</span>)}
      {td(<span className="text-xs text-[var(--text-2)]">{row.sitelink?.description2 || '—'}</span>)}
      {td(<a href={row.sitelink?.finalUrls[0]} target="_blank" rel="noreferrer" className="text-xs text-cyan truncate max-w-[180px] block">{row.sitelink?.finalUrls[0] || '—'}</a>)}
    </>
    case 'CALLOUT': return <>{td(row.callout?.text)}</>
    case 'CALL': return <>
      {td(row.call?.phoneNumber)}
      {td(<span className="text-xs text-[var(--text-2)]">{row.call?.countryCode}</span>)}
    </>
    case 'STRUCTURED_SNIPPET': return <>
      {td(<span className="font-medium">{row.structuredSnippet?.header}</span>)}
      {td(<span className="text-xs text-[var(--text-2)]">{row.structuredSnippet?.values.join(', ')}</span>)}
    </>
    case 'IMAGE': return <>
      {td(row.image?.url ? <img src={row.image.url} alt="Asset" className="w-12 h-8 object-cover rounded" /> : '—')}
      {td(<span className="text-xs text-[var(--text-2)]">{row.image?.mimeType || '—'}</span>)}
    </>
    case 'PROMOTION': return <>
      {td(row.promotion?.target)}
      {td(<span className="text-xs">{row.promotion?.percentOff ? `${row.promotion.percentOff}% off` : '—'}</span>)}
      {td(<span className="text-xs text-[var(--text-2)]">{row.promotion?.promotionCode || '—'}</span>)}
    </>
    case 'PRICE': return <>
      {td(<span className="text-xs">{row.price?.type || '—'}</span>)}
      {td(<span className="text-xs text-[var(--text-2)]">{row.price?.qualifier || '—'}</span>)}
      {td(<span className="text-xs">{row.price?.items.length ?? 0} items</span>)}
    </>
    case 'LEAD_FORM': return <>
      {td(row.leadForm?.headline)}
      {td(<span className="text-xs text-[var(--text-2)]">{row.leadForm?.businessName}</span>)}
    </>
  }
}

// ─── Add form ─────────────────────────────────────────────────────────────────
function AddForm({ assetType, submitting, error, onSubmit }: {
  assetType: AssetType
  submitting: boolean
  error: string
  onSubmit: (fields: Record<string, unknown>, level: AssetLevel) => void
}) {
  const [level, setLevel] = useState<AssetLevel>('CAMPAIGN')
  const inp = 'w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-lo)] bg-[var(--surface-lo)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-cyan/30'

  // Sitelink
  const [slText, setSlText]   = useState('')
  const [slDesc1, setSlDesc1] = useState('')
  const [slDesc2, setSlDesc2] = useState('')
  const [slUrl, setSlUrl]     = useState('')

  // Callout
  const [coText, setCoText] = useState('')

  // Call
  const [callPhone, setCallPhone]     = useState('')
  const [callCountry, setCallCountry] = useState('ZA')

  // Snippet
  const [snHeader, setSnHeader] = useState(SNIPPET_HEADERS[0])
  const [snValues, setSnValues] = useState('')

  // Image
  const [imgUrl, setImgUrl] = useState('')

  // Promotion
  const [promoTarget, setPromoTarget]   = useState('')
  const [promoPct, setPromoPct]         = useState('')
  const [promoCode, setPromoCode]       = useState('')
  const [promoStart, setPromoStart]     = useState('')
  const [promoEnd, setPromoEnd]         = useState('')
  const [promoUrl, setPromoUrl]         = useState('')

  // Lead form
  const [lfHeadline, setLfHeadline]     = useState('')
  const [lfDesc, setLfDesc]             = useState('')
  const [lfBusiness, setLfBusiness]     = useState('')
  const [lfPrivacy, setLfPrivacy]       = useState('')

  function submit() {
    let fields: Record<string, unknown> = {}
    switch (assetType) {
      case 'SITELINK':           fields = { linkText: slText, description1: slDesc1, description2: slDesc2, finalUrls: [slUrl] }; break
      case 'CALLOUT':            fields = { text: coText }; break
      case 'CALL':               fields = { phoneNumber: callPhone, countryCode: callCountry.toUpperCase() }; break
      case 'STRUCTURED_SNIPPET': fields = { header: snHeader, values: snValues.split('\n').map(s => s.trim()).filter(Boolean) }; break
      case 'IMAGE':              fields = { url: imgUrl }; break
      case 'PROMOTION':          fields = { target: promoTarget, percentOff: promoPct ? parseFloat(promoPct) : undefined, promotionCode: promoCode, startDate: promoStart, endDate: promoEnd, finalUrls: [promoUrl] }; break
      case 'LEAD_FORM':          fields = { headline: lfHeadline, description: lfDesc, businessName: lfBusiness, privacyPolicyUrl: lfPrivacy }; break
    }
    onSubmit(fields, level)
  }

  const levelRow = (
    <div className="flex items-center gap-4">
      <span className="text-xs text-[var(--text-2)]">Attach to:</span>
      {(['CAMPAIGN', 'ACCOUNT'] as AssetLevel[]).map(l => (
        <label key={l} className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input type="radio" checked={level === l} onChange={() => setLevel(l)} />
          {l === 'CAMPAIGN' ? 'This campaign' : 'All campaigns (account level)'}
        </label>
      ))}
    </div>
  )

  const submitBtn = (
    <div className="flex items-center gap-3">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button onClick={submit} disabled={submitting}
        className="px-4 py-2 text-sm font-medium rounded-lg bg-cyan text-navy disabled:opacity-50 hover:bg-cyan/90 transition-colors">
        {submitting ? 'Adding…' : 'Add Asset'}
      </button>
    </div>
  )

  const box = 'p-4 rounded-xl border border-cyan/20 bg-cyan/5 mb-4 space-y-3'

  switch (assetType) {
    case 'SITELINK': return (
      <div className={box}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Link Text *</label><input className={inp} value={slText} onChange={e => setSlText(e.target.value)} placeholder="Shop Now" /></div>
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Final URL *</label><input className={inp} value={slUrl} onChange={e => setSlUrl(e.target.value)} placeholder="https://…" /></div>
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Description 1</label><input className={inp} value={slDesc1} onChange={e => setSlDesc1(e.target.value)} /></div>
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Description 2</label><input className={inp} value={slDesc2} onChange={e => setSlDesc2(e.target.value)} /></div>
        </div>
        {levelRow}{submitBtn}
      </div>
    )
    case 'CALLOUT': return (
      <div className={box}>
        <div>
          <label className="text-xs text-[var(--text-2)] mb-1 block">Callout Text * <span className="text-[var(--text-2)]">({coText.length}/25)</span></label>
          <input className={inp} value={coText} onChange={e => setCoText(e.target.value.slice(0, 25))} placeholder="Free delivery" />
        </div>
        {levelRow}{submitBtn}
      </div>
    )
    case 'CALL': return (
      <div className={box}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Phone Number *</label><input className={inp} value={callPhone} onChange={e => setCallPhone(e.target.value)} placeholder="+27 11 123 4567" /></div>
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Country Code *</label><input className={inp} value={callCountry} onChange={e => setCallCountry(e.target.value.toUpperCase().slice(0, 2))} placeholder="ZA" maxLength={2} /></div>
        </div>
        {levelRow}{submitBtn}
      </div>
    )
    case 'STRUCTURED_SNIPPET': return (
      <div className={box}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--text-2)] mb-1 block">Header *</label>
            <select className={inp} value={snHeader} onChange={e => setSnHeader(e.target.value)}>
              {SNIPPET_HEADERS.map(h => <option key={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--text-2)] mb-1 block">Values * (one per line, min 3)</label>
            <textarea className={`${inp} resize-none`} rows={4} value={snValues} onChange={e => setSnValues(e.target.value)} placeholder="Value 1&#10;Value 2&#10;Value 3" />
          </div>
        </div>
        {levelRow}{submitBtn}
      </div>
    )
    case 'IMAGE': return (
      <div className={box}>
        <div><label className="text-xs text-[var(--text-2)] mb-1 block">Image URL *</label><input className={inp} value={imgUrl} onChange={e => setImgUrl(e.target.value)} placeholder="https://example.com/image.jpg" /></div>
        {levelRow}{submitBtn}
      </div>
    )
    case 'PROMOTION': return (
      <div className={box}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Promotion Target *</label><input className={inp} value={promoTarget} onChange={e => setPromoTarget(e.target.value)} placeholder="e.g. Summer sale" /></div>
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">% Off</label><input className={inp} type="number" value={promoPct} onChange={e => setPromoPct(e.target.value)} placeholder="20" /></div>
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Promo Code</label><input className={inp} value={promoCode} onChange={e => setPromoCode(e.target.value)} /></div>
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Final URL *</label><input className={inp} value={promoUrl} onChange={e => setPromoUrl(e.target.value)} placeholder="https://…" /></div>
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Start Date</label><input className={inp} type="date" value={promoStart} onChange={e => setPromoStart(e.target.value)} /></div>
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">End Date</label><input className={inp} type="date" value={promoEnd} onChange={e => setPromoEnd(e.target.value)} /></div>
        </div>
        {levelRow}{submitBtn}
      </div>
    )
    case 'PRICE': return (
      <div className={box}>
        <p className="text-xs text-[var(--text-2)]">Price assets require at least 3 items. Use Google Ads directly to add price extensions.</p>
        {submitBtn}
      </div>
    )
    case 'LEAD_FORM': return (
      <div className={box}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Headline *</label><input className={inp} value={lfHeadline} onChange={e => setLfHeadline(e.target.value)} /></div>
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Business Name *</label><input className={inp} value={lfBusiness} onChange={e => setLfBusiness(e.target.value)} /></div>
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Description *</label><input className={inp} value={lfDesc} onChange={e => setLfDesc(e.target.value)} /></div>
          <div><label className="text-xs text-[var(--text-2)] mb-1 block">Privacy Policy URL *</label><input className={inp} value={lfPrivacy} onChange={e => setLfPrivacy(e.target.value)} placeholder="https://…" /></div>
        </div>
        {levelRow}{submitBtn}
      </div>
    )
  }
}

// ─── Edit form ────────────────────────────────────────────────────────────────
function EditForm({ row, submitting, error, onSubmit, onCancel }: {
  row: AssetRow
  submitting: boolean
  error: string
  onSubmit: (fields: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const inp = 'px-3 py-1.5 text-sm rounded-lg border border-[var(--border-lo)] bg-[var(--surface-lo)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-cyan/30'

  const [slText, setSlText]   = useState(row.sitelink?.linkText ?? '')
  const [slDesc1, setSlDesc1] = useState(row.sitelink?.description1 ?? '')
  const [slDesc2, setSlDesc2] = useState(row.sitelink?.description2 ?? '')
  const [slUrl, setSlUrl]     = useState(row.sitelink?.finalUrls[0] ?? '')
  const [coText, setCoText]   = useState(row.callout?.text ?? '')
  const [snHeader, setSnHeader] = useState(row.structuredSnippet?.header ?? SNIPPET_HEADERS[0])
  const [snValues, setSnValues] = useState(row.structuredSnippet?.values.join('\n') ?? '')
  const [promoTarget, setPromoTarget] = useState(row.promotion?.target ?? '')
  const [promoPct, setPromoPct]       = useState(String(row.promotion?.percentOff ?? ''))
  const [promoCode, setPromoCode]     = useState(row.promotion?.promotionCode ?? '')
  const [promoUrl, setPromoUrl]       = useState(row.promotion?.finalUrls[0] ?? '')
  const [promoStart, setPromoStart]   = useState(row.promotion?.startDate ?? '')
  const [promoEnd, setPromoEnd]       = useState(row.promotion?.endDate ?? '')

  function submit() {
    let fields: Record<string, unknown> = {}
    switch (row.assetType) {
      case 'SITELINK':           fields = { linkText: slText, description1: slDesc1, description2: slDesc2, finalUrls: [slUrl] }; break
      case 'CALLOUT':            fields = { text: coText }; break
      case 'STRUCTURED_SNIPPET': fields = { header: snHeader, values: snValues.split('\n').map(s => s.trim()).filter(Boolean) }; break
      case 'PROMOTION':          fields = { target: promoTarget, percentOff: promoPct ? parseFloat(promoPct) : undefined, promotionCode: promoCode, startDate: promoStart, endDate: promoEnd, finalUrls: [promoUrl] }; break
    }
    onSubmit(fields)
  }

  const btns = (
    <div className="flex items-center gap-2">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button onClick={submit} disabled={submitting} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan text-navy disabled:opacity-50 hover:bg-cyan/90 transition-colors">{submitting ? 'Saving…' : 'Save'}</button>
      <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border-lo)] hover:bg-[var(--surface-lo)] transition-colors">Cancel</button>
    </div>
  )

  switch (row.assetType) {
    case 'SITELINK': return (
      <div className="flex flex-wrap gap-2 items-end">
        <div><label className="text-[10px] text-[var(--text-2)] block mb-1">Link Text</label><input className={inp} value={slText} onChange={e => setSlText(e.target.value)} /></div>
        <div><label className="text-[10px] text-[var(--text-2)] block mb-1">Desc 1</label><input className={inp} value={slDesc1} onChange={e => setSlDesc1(e.target.value)} /></div>
        <div><label className="text-[10px] text-[var(--text-2)] block mb-1">Desc 2</label><input className={inp} value={slDesc2} onChange={e => setSlDesc2(e.target.value)} /></div>
        <div className="flex-1 min-w-[200px]"><label className="text-[10px] text-[var(--text-2)] block mb-1">Final URL</label><input className={`${inp} w-full`} value={slUrl} onChange={e => setSlUrl(e.target.value)} /></div>
        {btns}
      </div>
    )
    case 'CALLOUT': return (
      <div className="flex items-end gap-2">
        <div><label className="text-[10px] text-[var(--text-2)] block mb-1">Text ({coText.length}/25)</label><input className={inp} value={coText} onChange={e => setCoText(e.target.value.slice(0, 25))} /></div>
        {btns}
      </div>
    )
    case 'STRUCTURED_SNIPPET': return (
      <div className="flex items-start gap-2">
        <div>
          <label className="text-[10px] text-[var(--text-2)] block mb-1">Header</label>
          <select className={inp} value={snHeader} onChange={e => setSnHeader(e.target.value)}>
            {SNIPPET_HEADERS.map(h => <option key={h}>{h}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-[var(--text-2)] block mb-1">Values (one per line)</label>
          <textarea className={`${inp} w-full resize-none`} rows={3} value={snValues} onChange={e => setSnValues(e.target.value)} />
        </div>
        {btns}
      </div>
    )
    case 'PROMOTION': return (
      <div className="flex flex-wrap gap-2 items-end">
        <div><label className="text-[10px] text-[var(--text-2)] block mb-1">Target</label><input className={inp} value={promoTarget} onChange={e => setPromoTarget(e.target.value)} /></div>
        <div><label className="text-[10px] text-[var(--text-2)] block mb-1">% Off</label><input className={`${inp} w-20`} type="number" value={promoPct} onChange={e => setPromoPct(e.target.value)} /></div>
        <div><label className="text-[10px] text-[var(--text-2)] block mb-1">Code</label><input className={inp} value={promoCode} onChange={e => setPromoCode(e.target.value)} /></div>
        <div className="flex-1 min-w-[200px]"><label className="text-[10px] text-[var(--text-2)] block mb-1">Final URL</label><input className={`${inp} w-full`} value={promoUrl} onChange={e => setPromoUrl(e.target.value)} /></div>
        {btns}
      </div>
    )
    default: return null
  }
}

// ─── PMax assets view ─────────────────────────────────────────────────────────
function PMaxAssetsView({ rows, loading, error, clientId, onRefresh }: {
  rows: PMaxAssetRow[]
  loading: boolean
  error: string
  clientId: string
  onRefresh: () => void
}) {
  type PMaxTab = 'HEADLINE' | 'LONG_HEADLINE' | 'DESCRIPTION' | 'BUSINESS_NAME' | 'MARKETING_IMAGE' | 'LOGO' | 'YOUTUBE_VIDEO'
  const tabs: { id: PMaxTab; label: string }[] = [
    { id: 'HEADLINE',        label: '📝 Headlines'    },
    { id: 'LONG_HEADLINE',   label: '📝 Long Headline' },
    { id: 'DESCRIPTION',     label: '💬 Descriptions' },
    { id: 'BUSINESS_NAME',   label: '🏢 Business Name' },
    { id: 'MARKETING_IMAGE', label: '🖼 Images'        },
    { id: 'LOGO',            label: '🎨 Logos'         },
    { id: 'YOUTUBE_VIDEO',   label: '▶️ Videos'        },
  ]
  const [activeTab, setActiveTab] = useState<PMaxTab>('HEADLINE')
  const [showAdd, setShowAdd]     = useState(false)
  const [addText, setAddText]     = useState('')
  const [addVideoId, setAddVideoId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError]   = useState('')
  const [toast, setToast] = useState<{ row: PMaxAssetRow; timer: ReturnType<typeof setTimeout> } | null>(null)
  const [localRows, setLocalRows]   = useState<PMaxAssetRow[]>(rows)

  useEffect(() => { setLocalRows(rows) }, [rows])
  useEffect(() => { setShowAdd(false); setFormError('') }, [activeTab])

  const filtered = localRows.filter(r => r.fieldType === activeTab || String(r.fieldType) === String(activeTab))

  const isText  = ['HEADLINE','LONG_HEADLINE','DESCRIPTION','BUSINESS_NAME'].includes(activeTab)
  const isVideo = activeTab === 'YOUTUBE_VIDEO'
  const isImage = activeTab === 'MARKETING_IMAGE' || activeTab === 'LOGO'

  const inp = 'w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-lo)] bg-[var(--surface-lo)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-cyan/30'

  async function handleAdd() {
    if (!filtered[0]?.assetGroupId) { setFormError('No asset group found'); return }
    setSubmitting(true); setFormError('')
    try {
      const fields = isText ? { text: addText } : isVideo ? { videoId: addVideoId } : {}
      const res = await fetch('/api/assets/pmax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_account_id: clientId,
          asset_group_id:    filtered[0].assetGroupId,
          field_type:        activeTab,
          fields,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to add')
      setShowAdd(false); setAddText(''); setAddVideoId('')
      onRefresh()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(row: PMaxAssetRow) {
    setLocalRows(prev => prev.filter(r => r.assetId !== row.assetId))
    const timer = setTimeout(async () => {
      try {
        await fetch('/api/assets/pmax', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_account_id: clientId, asset_group_id: row.assetGroupId, asset_id: row.assetId, field_type: row.fieldType }),
        })
      } catch { /* ignore */ }
      setToast(null)
    }, 3000)
    setToast({ row, timer })
  }

  if (loading) return <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-2)]"><div className="w-4 h-4 border-2 border-cyan border-t-transparent rounded-full animate-spin" />Loading assets…</div>
  if (error)   return <div className="flex items-center gap-3 py-4"><span className="text-xs text-red-500">{error}</span><button onClick={onRefresh} className="text-xs text-cyan underline">Retry</button></div>

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-4">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${activeTab === t.id ? 'bg-cyan text-navy' : 'bg-[var(--surface-lo)] text-[var(--text-2)] hover:text-[var(--text-1)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[var(--text-2)]">{filtered.length} {filtered.length === 1 ? 'asset' : 'assets'}</span>
        {!isImage && (
          <button onClick={() => setShowAdd(v => !v)} className="text-xs font-medium text-cyan hover:text-cyan/80 transition-colors">
            {showAdd ? '✕ Cancel' : `+ Add`}
          </button>
        )}
        {isImage && <p className="text-xs text-[var(--text-2)]">Upload images via Google Ads directly</p>}
      </div>

      {showAdd && !isImage && (
        <div className="p-4 rounded-xl border border-cyan/20 bg-cyan/5 mb-4 space-y-3">
          {isText  && <><label className="text-xs text-[var(--text-2)] mb-1 block">Text *</label><input className={inp} value={addText} onChange={e => setAddText(e.target.value)} /></>}
          {isVideo && <><label className="text-xs text-[var(--text-2)] mb-1 block">YouTube Video ID *</label><input className={inp} value={addVideoId} onChange={e => setAddVideoId(e.target.value)} placeholder="dQw4w9WgXcQ" /></>}
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <button onClick={handleAdd} disabled={submitting} className="px-4 py-2 text-sm font-medium rounded-lg bg-cyan text-navy disabled:opacity-50 hover:bg-cyan/90 transition-colors">
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-2)] py-4">No {tabs.find(t => t.id === activeTab)?.label.replace(/^[^\s]+ /, '').toLowerCase()} — add one above.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-lo)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-lo)]">
              <tr>
                <th className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-2)]">Content</th>
                <th className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-2)]">Performance</th>
                <th className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-2)]">Status</th>
                <th className="px-3 py-2 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-lo)]">
              {filtered.map(row => (
                <tr key={row.assetId} className="hover:bg-[var(--surface-lo)]/50">
                  <td className="px-3 py-2 text-sm text-[var(--text-1)]">
                    {row.text     && <span>{row.text}</span>}
                    {row.imageUrl && <img src={row.imageUrl} alt="Asset" className="w-16 h-10 object-cover rounded" />}
                    {row.videoId  && <a href={`https://youtube.com/watch?v=${row.videoId}`} target="_blank" rel="noreferrer" className="text-cyan text-xs">{row.videoId}</a>}
                    {!row.text && !row.imageUrl && !row.videoId && <span className="text-[var(--text-2)]">—</span>}
                  </td>
                  <td className="px-3 py-2"><PerfDot label={row.performanceLabel} /></td>
                  <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => handleRemove(row)} className="text-[var(--text-2)] hover:text-red-500 transition-colors" title="Remove">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <UndoToast message="Asset removed" onUndo={() => { clearTimeout(toast.timer); setLocalRows(prev => [toast.row, ...prev]); setToast(null) }} onDismiss={() => { clearTimeout(toast.timer); setToast(null) }} />}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AssetsTab({ clientId, campaignId, channelType, startDate, endDate, currency }: Props) {
  const isPMax = channelType === 'PERFORMANCE_MAX' || channelType === '10'

  const [rows,     setRows]     = useState<AssetRow[]>([])
  const [pmaxRows, setPmaxRows] = useState<PMaxAssetRow[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const fetchedKey = useRef('')

  function load() {
    const key = `${campaignId}-${startDate}-${endDate}`
    fetchedKey.current = key
    setLoading(true); setError('')

    if (isPMax) {
      fetch(`/api/assets/pmax?client_account_id=${clientId}&campaign_id=${campaignId}`)
        .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setPmaxRows(d.rows ?? []) })
        .catch(e => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false))
    } else {
      fetch(`/api/assets?client_account_id=${clientId}&campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`)
        .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setRows(d.rows ?? []) })
        .catch(e => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false))
    }
  }

  useEffect(() => {
    const key = `${campaignId}-${startDate}-${endDate}`
    if (fetchedKey.current === key) return
    load()
  }, [campaignId, startDate, endDate])

  return isPMax
    ? <PMaxAssetsView rows={pmaxRows} loading={loading} error={error} clientId={clientId} onRefresh={load} />
    : <StandardAssetsView rows={rows} loading={loading} error={error} clientId={clientId} campaignId={campaignId} currency={currency} onRefresh={load} />
}
