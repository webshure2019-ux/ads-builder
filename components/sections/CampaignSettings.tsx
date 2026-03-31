import { CampaignType, CampaignSettingsData, BiddingStrategy } from '@/types'

interface Props {
  campaignType: CampaignType
  settings: Partial<CampaignSettingsData>
  onChange: (updates: Partial<CampaignSettingsData>) => void
}

const BIDDING_OPTIONS: { value: BiddingStrategy; label: string; threshold: string }[] = [
  { value: 'maximize_conversions', label: 'Maximize Conversions', threshold: 'Recommended for new campaigns' },
  { value: 'target_cpa', label: 'Target CPA', threshold: 'Requires 50+ conv/month' },
  { value: 'target_roas', label: 'Target ROAS', threshold: 'Requires 100+ conv/month' },
  { value: 'maximize_clicks', label: 'Maximize Clicks', threshold: 'For awareness / new accounts' },
  { value: 'manual_cpc', label: 'Manual CPC', threshold: 'Advanced users only' },
]

const SCHEDULE_OPTIONS = [
  { value: 'all', label: 'All days, all hours (recommended)' },
  { value: 'business', label: 'Business hours (Mon–Fri 8am–6pm)' },
  { value: 'custom', label: 'Custom schedule' },
]

export function CampaignSettings({ campaignType, settings, onChange }: Props) {
  const input = 'w-full bg-mist border border-cloud rounded-lg px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-cyan'
  const label = 'block text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-1'
  const showAudienceSignals = ['pmax', 'demand_gen', 'display', 'video'].includes(campaignType)
  const showChannelControls = ['demand_gen', 'video'].includes(campaignType)
  const showMerchantCenter = ['shopping', 'pmax'].includes(campaignType)
  const showSchedule = ['search', 'display', 'shopping'].includes(campaignType)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Daily Budget (ZAR)</label>
          <input
            type="number"
            className={input}
            placeholder="500"
            value={settings.budget_daily || ''}
            onChange={e => onChange({ budget_daily: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={label}>Bidding Strategy</label>
          <select
            className={input}
            value={settings.bidding_strategy || 'maximize_conversions'}
            onChange={e => onChange({ bidding_strategy: e.target.value as BiddingStrategy })}
          >
            {BIDDING_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label} — {opt.threshold}</option>
            ))}
          </select>
        </div>
      </div>

      {settings.bidding_strategy === 'target_cpa' && (
        <div>
          <label className={label}>Target CPA (ZAR)</label>
          <input type="number" className={input} placeholder="200" value={settings.target_cpa || ''} onChange={e => onChange({ target_cpa: Number(e.target.value) })} />
        </div>
      )}

      {settings.bidding_strategy === 'target_roas' && (
        <div>
          <label className={label}>Target ROAS (e.g. 4 = 400%)</label>
          <input type="number" className={input} placeholder="4" value={settings.target_roas || ''} onChange={e => onChange({ target_roas: Number(e.target.value) })} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Locations</label>
          <input className={input} placeholder="South Africa" value={(settings.locations || []).join(', ')} onChange={e => onChange({ locations: e.target.value.split(',').map(s => s.trim()) })} />
        </div>
        <div>
          <label className={label}>Language</label>
          <input className={input} placeholder="English" value={settings.language || ''} onChange={e => onChange({ language: e.target.value })} />
        </div>
      </div>

      {showSchedule && (
        <div>
          <label className={label}>Ad Schedule</label>
          <select className={input} value={settings.schedule || 'all'} onChange={e => onChange({ schedule: e.target.value })}>
            {SCHEDULE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      )}

      {showMerchantCenter && (
        <div>
          <label className={label}>Merchant Center ID (optional)</label>
          <input className={input} placeholder="123456789" value={settings.merchant_center_id || ''} onChange={e => onChange({ merchant_center_id: e.target.value })} />
        </div>
      )}

      {showChannelControls && (
        <div>
          <label className={label}>Channel Controls</label>
          <div className="flex gap-3 flex-wrap mt-1">
            {(['youtube', 'discover', 'gmail', 'display'] as const).map(ch => (
              <label key={ch} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.channel_controls?.[ch] ?? true}
                  onChange={e => onChange({
                    channel_controls: { youtube: true, discover: true, gmail: true, display: true, ...settings.channel_controls, [ch]: e.target.checked }
                  })}
                  className="accent-cyan"
                />
                <span className="capitalize text-navy">{ch}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
