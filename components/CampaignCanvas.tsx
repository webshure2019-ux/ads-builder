'use client'
import { useState } from 'react'
import { CanvasState, CampaignType, Brief, CampaignSettingsData, GeneratedAssets } from '@/types'
import { CampaignTypeSelector } from './sections/CampaignTypeSelector'
import { BriefForm } from './sections/BriefForm'
import { KeywordResearch } from './sections/KeywordResearch'
import { CampaignSettings } from './sections/CampaignSettings'
import { ReviewAssets } from './sections/ReviewAssets'
import { ClientSelector } from './sidebar/ClientSelector'
import { ProgressTracker } from './sidebar/ProgressTracker'
import { BestPracticesPanel } from './sidebar/BestPracticesPanel'

const INITIAL_STATE: CanvasState = {
  client_id: null,
  campaign_type: null,
  brief: { keywords: [] },
  settings: { bidding_strategy: 'maximize_conversions', locations: ['South Africa'], language: 'English' },
  assets: null,
  campaign_id: null,
  is_generating: false,
  is_publishing: false,
  error: null,
  step: 'type',
}

function SectionCard({ num, title, status, children, defaultOpen = false }: {
  num: number; title: string; status: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white border border-cloud rounded-2xl overflow-hidden mb-4">
      <button
        className="w-full flex items-center gap-3 px-5 py-4 bg-mist border-b border-cloud text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="w-7 h-7 rounded-full bg-navy text-white flex items-center justify-center text-xs font-heading font-bold flex-shrink-0">{num}</div>
        <span className="font-heading font-bold text-navy flex-1">{title}</span>
        <span className="text-xs text-teal">{status}</span>
        <span className="text-teal text-xs">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && <div className="px-5 py-5">{children}</div>}
    </div>
  )
}

export function CampaignCanvas() {
  const [state, setState] = useState<CanvasState>(INITIAL_STATE)

  function update(patch: Partial<CanvasState>) {
    setState(prev => ({ ...prev, ...patch }))
  }

  function getStep(): number {
    if (!state.campaign_type) return 0
    if (!state.brief.product) return 1
    if (!state.brief.keywords?.some(k => k.selected)) return 2
    if (!state.settings.budget_daily) return 3
    if (!state.assets) return 4
    return 5
  }

  async function handleGenerate() {
    if (!state.campaign_type || !state.brief.product) return
    update({ is_generating: true, error: null })
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_type: state.campaign_type, brief: state.brief }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      update({ assets: data.assets, is_generating: false })
    } catch (err) {
      update({ error: String(err), is_generating: false })
    }
  }

  async function handlePublish() {
    if (!state.assets || !state.client_id || !state.campaign_type) return
    update({ is_publishing: true, error: null })

    let campaignId = state.campaign_id
    if (!campaignId) {
      const saveRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: state.client_id,
          name: `${state.brief.brand_name} — ${state.campaign_type} — ${new Date().toLocaleDateString()}`,
          type: state.campaign_type,
          settings: state.settings,
          brief: state.brief,
        }),
      })
      const saveData = await saveRes.json()
      campaignId = saveData.id
      update({ campaign_id: campaignId })
    }

    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          client_account_id: state.client_id,
          campaign_name: `${state.brief.brand_name} — ${state.campaign_type}`,
          campaign_type: state.campaign_type,
          settings: state.settings,
          assets: state.assets,
          keywords: state.brief.keywords || [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      update({ is_publishing: false })
      alert(`Campaign published! Google Ads ID: ${data.google_campaign_id}`)
    } catch (err) {
      update({ error: String(err), is_publishing: false })
    }
  }

  const currentStep = getStep()

  return (
    <div className="grid grid-cols-[1fr_300px] gap-5 max-w-7xl mx-auto px-5 py-5">
      {/* Main canvas */}
      <div>
        <SectionCard num={1} title="Campaign Type" status={state.campaign_type || 'Not selected'} defaultOpen>
          <CampaignTypeSelector
            selected={state.campaign_type}
            onSelect={type => update({ campaign_type: type, assets: null })}
          />
        </SectionCard>

        <SectionCard num={2} title="Brief & Landing Page" status={state.brief.product ? 'Complete' : 'In progress'}>
          <BriefForm
            brief={state.brief}
            onChange={updates => update({ brief: { ...state.brief, ...updates } })}
          />
        </SectionCard>

        <SectionCard num={3} title="Keyword Research" status={`${state.brief.keywords?.filter(k => k.selected).length || 0} keywords selected`}>
          <KeywordResearch
            keywords={state.brief.keywords || []}
            onChange={keywords => update({ brief: { ...state.brief, keywords } })}
          />
        </SectionCard>

        {state.campaign_type && (
          <SectionCard num={4} title="Campaign Settings" status={state.settings.budget_daily ? `R${state.settings.budget_daily}/day` : 'Not set'}>
            <CampaignSettings
              campaignType={state.campaign_type}
              settings={state.settings}
              onChange={updates => update({ settings: { ...state.settings, ...updates } })}
            />
          </SectionCard>
        )}

        <SectionCard num={5} title="AI Copy Generation" status={state.assets ? 'Generated' : 'Ready to generate'}>
          {state.assets ? (
            <p className="text-sm text-emerald-600 font-medium">Assets generated — review below</p>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={state.is_generating || !state.brief.product || !state.campaign_type}
              className="w-full bg-gradient-to-r from-navy to-[#054991] text-white font-heading font-bold py-4 rounded-full text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {state.is_generating ? 'Generating with Claude AI...' : 'Generate Campaign Assets with Claude AI'}
            </button>
          )}
          {state.error && <p className="text-red-500 text-sm mt-2">{state.error}</p>}
        </SectionCard>

        {state.assets && state.campaign_type && (
          <SectionCard num={6} title="Review & Ad Strength" status="Review required" defaultOpen>
            <ReviewAssets
              assets={state.assets}
              brief={state.brief}
              campaignType={state.campaign_type}
              onChange={assets => update({ assets })}
              onPublish={handlePublish}
              isPublishing={state.is_publishing}
              publishError={state.error}
            />
          </SectionCard>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <ClientSelector
          selectedId={state.client_id}
          onSelect={id => update({ client_id: id })}
        />
        <ProgressTracker currentStep={currentStep} />
        <BestPracticesPanel campaignType={state.campaign_type} />
      </div>
    </div>
  )
}
