'use client'
import { useState } from 'react'
import {
  CanvasState, CampaignType, Brief, CampaignSettingsData,
  GeneratedAssets, PpcPackage, PPC_PACKAGE_CONFIG, AdGroup,
} from '@/types'
import { CampaignTypeSelector } from './sections/CampaignTypeSelector'
import { PackageSelector } from './sections/PackageSelector'
import { AdGroupManager } from './sections/AdGroupManager'
import { AdGroupDetails } from './sections/AdGroupDetails'
import { BriefForm } from './sections/BriefForm'
import { KeywordResearch } from './sections/KeywordResearch'
import { CampaignSettings } from './sections/CampaignSettings'
import { ReviewAssets } from './sections/ReviewAssets'
import { ClientSelector } from './sidebar/ClientSelector'
import { ProgressTracker } from './sidebar/ProgressTracker'
import { BestPracticesPanel } from './sidebar/BestPracticesPanel'

function freshAdGroup(): AdGroup {
  return { id: crypto.randomUUID(), name: '', usps: [], keywords: [], negative_keywords: [] }
}

const INITIAL_STATE: CanvasState = {
  client_id: null,
  campaign_type: null,
  ppc_package: null,
  ad_groups: [freshAdGroup()],
  brief: {},
  settings: { bidding_strategy: 'maximize_conversions', locations: ['South Africa'], language: 'English' },
  assets: null,
  campaign_id: null,
  is_generating: false,
  generating_index: -1,
  is_publishing: false,
  error: null,
  step: 'type',
}

function SectionCard({ num, title, status, children, defaultOpen = false }: {
  num: number; title: string; status: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="glass rounded-2xl overflow-hidden mb-4 transition-all">
      <button
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:opacity-90 transition-opacity"
        style={{ background: 'var(--surface-lo)', borderBottom: open ? '1px solid var(--border-lo)' : 'none' }}
        onClick={() => setOpen(!open)}
      >
        <div className="w-7 h-7 rounded-full bg-cyan text-navy flex items-center justify-center text-xs font-heading font-bold flex-shrink-0">
          {num}
        </div>
        <span className="font-heading font-bold flex-1" style={{ color: 'var(--text-1)' }}>{title}</span>
        <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>{status}</span>
        <span className="text-xs ml-1" style={{ color: 'var(--text-3)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-5 py-5">{children}</div>}
    </div>
  )
}

export function CampaignCanvas() {
  const [state, setState] = useState<CanvasState>(INITIAL_STATE)
  const [activeAdGroupId, setActiveAdGroupId] = useState<string | null>(null)

  const isSearch = state.campaign_type === 'search'

  function update(patch: Partial<CanvasState>) {
    setState(prev => ({ ...prev, ...patch }))
  }

  function handleSelectType(type: CampaignType) {
    update({
      campaign_type: type,
      ppc_package: null,
      ad_groups: [freshAdGroup()],
      assets: null,
      brief: {},
    })
  }

  function handleSelectPackage(pkg: PpcPackage) {
    const max = PPC_PACKAGE_CONFIG[pkg].maxAdGroups
    const kept = state.ad_groups.slice(0, max)
    update({
      ppc_package: pkg,
      ad_groups: kept.length ? kept : [freshAdGroup()],
      assets: null,
    })
  }

  // Generate for Search — uses per-ad-group brief, URL, USPs, keywords
  async function handleGenerateSearch() {
    const filledGroups = state.ad_groups.filter(ag => ag.name.trim())
    if (!filledGroups.length || !state.brief.brand_name) return

    update({ is_generating: true, error: null })
    const updatedGroups = state.ad_groups.map(ag => ({ ...ag, assets: undefined }))

    for (let i = 0; i < filledGroups.length; i++) {
      const ag = filledGroups[i]
      setState(prev => ({ ...prev, generating_index: i }))

      // Build per-ad-group brief: shared campaign fields + per-group overrides
      const adGroupBrief: Brief = {
        brand_name: state.brief.brand_name!,
        audience: state.brief.audience || '',
        tone: state.brief.tone || 'professional',
        goal: state.brief.goal || 'lead_gen',
        product: ag.name,
        url: ag.url || '',
        usps: ag.usps.length > 0 ? ag.usps : (state.brief.usps || []),
        keywords: ag.keywords,
      }

      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaign_type: 'search', brief: adGroupBrief }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        const idx = updatedGroups.findIndex(g => g.id === ag.id)
        updatedGroups[idx] = { ...updatedGroups[idx], assets: data.assets }
        setState(prev => ({ ...prev, ad_groups: [...updatedGroups] }))
      } catch (err) {
        update({ error: `Failed on "${ag.name}": ${String(err)}`, is_generating: false, generating_index: -1 })
        return
      }
    }

    setActiveAdGroupId(filledGroups[0].id)
    update({ is_generating: false, generating_index: -1 })
  }

  // Generate for non-Search
  async function handleGenerateSingle() {
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
    if (!state.client_id || !state.campaign_type) return
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
      const body = isSearch
        ? {
            campaign_id: campaignId,
            client_account_id: state.client_id,
            campaign_name: `${state.brief.brand_name} — Search`,
            campaign_type: 'search',
            settings: state.settings,
            ad_groups: state.ad_groups.filter(ag => ag.name.trim() && ag.assets),
            // keywords live per-ad-group; no shared keyword list needed
          }
        : {
            campaign_id: campaignId,
            client_account_id: state.client_id,
            campaign_name: `${state.brief.brand_name} — ${state.campaign_type}`,
            campaign_type: state.campaign_type,
            settings: state.settings,
            assets: state.assets,
            keywords: state.brief.keywords || [],
          }

      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      update({ is_publishing: false })
      alert(`Campaign published! Google Ads ID: ${data.google_campaign_id}`)
    } catch (err) {
      update({ error: String(err), is_publishing: false })
    }
  }

  const filledAdGroups = state.ad_groups.filter(ag => ag.name.trim())
  const allGenerated = filledAdGroups.length > 0 && filledAdGroups.every(ag => ag.assets)
  const activeAdGroup = state.ad_groups.find(ag => ag.id === activeAdGroupId) ?? filledAdGroups[0]

  // Total keywords across all ad groups
  const totalKwSelected = isSearch
    ? state.ad_groups.reduce((sum, ag) => sum + ag.keywords.filter(k => k.selected).length, 0)
    : (state.brief.keywords?.filter(k => k.selected).length ?? 0)

  const genStatus = isSearch
    ? allGenerated
      ? `${filledAdGroups.length} ad groups generated`
      : filledAdGroups.length ? 'Ready to generate' : 'Add products first'
    : state.assets ? 'Generated' : 'Ready to generate'

  // Dynamic section numbers
  const n = isSearch
    ? { pkg: 2, groups: 3, details: 4, brief: 5, settings: 6, gen: 7, review: 8 }
    : { pkg: 0, groups: 0, details: 0, brief: 2, settings: 3, gen: 4, review: 5 }

  return (
    <div className="grid grid-cols-[1fr_300px] gap-5 max-w-7xl mx-auto px-5 py-6 animate-fade-in">
      <div>

        {/* 1. Campaign Type */}
        <SectionCard num={1} title="Campaign Type" status={state.campaign_type || 'Not selected'} defaultOpen>
          <CampaignTypeSelector selected={state.campaign_type} onSelect={handleSelectType} />
        </SectionCard>

        {/* 2. PPC Package — Search only */}
        {isSearch && (
          <SectionCard
            num={n.pkg}
            title="PPC Package"
            status={state.ppc_package ? PPC_PACKAGE_CONFIG[state.ppc_package].label : 'Not selected'}
          >
            <PackageSelector selected={state.ppc_package} onSelect={handleSelectPackage} />
          </SectionCard>
        )}

        {/* 3. Products / Services — Search only */}
        {isSearch && state.ppc_package && (
          <SectionCard
            num={n.groups}
            title="Products / Services"
            status={`${filledAdGroups.length} / ${PPC_PACKAGE_CONFIG[state.ppc_package].maxAdGroups} added`}
          >
            <AdGroupManager
              adGroups={state.ad_groups}
              ppcPackage={state.ppc_package}
              onChange={adGroups => update({ ad_groups: adGroups })}
            />
          </SectionCard>
        )}

        {/* 4. Ad Group Details (URL, USPs, Keywords, Negatives) — Search only */}
        {isSearch && filledAdGroups.length > 0 && (
          <SectionCard
            num={n.details}
            title="Ad Group Details — Keywords & USPs"
            status={`${totalKwSelected} keywords · ${state.ad_groups.reduce((s, ag) => s + ag.negative_keywords.length, 0)} negatives`}
          >
            <AdGroupDetails
              adGroups={state.ad_groups}
              onChange={adGroups => update({ ad_groups: adGroups })}
            />
          </SectionCard>
        )}

        {/* Brief */}
        <SectionCard
          num={isSearch ? n.brief : 2}
          title={isSearch ? 'Campaign Brief (Shared)' : 'Brief & Landing Page'}
          status={state.brief.brand_name ? 'Complete' : 'In progress'}
        >
          <BriefForm
            brief={state.brief}
            onChange={updates => update({ brief: { ...state.brief, ...updates } })}
            searchMode={isSearch}
          />
        </SectionCard>

        {/* Settings */}
        {state.campaign_type && (
          <SectionCard
            num={isSearch ? n.settings : 3}
            title="Campaign Settings"
            status={state.settings.budget_daily ? `R${state.settings.budget_daily}/day` : 'Not set'}
          >
            <CampaignSettings
              campaignType={state.campaign_type}
              settings={state.settings}
              onChange={updates => update({ settings: { ...state.settings, ...updates } })}
            />
          </SectionCard>
        )}

        {/* Non-Search: Keyword Research (shared) */}
        {!isSearch && (
          <SectionCard num={4} title="Keyword Research" status={`${state.brief.keywords?.filter(k => k.selected).length || 0} selected`}>
            <KeywordResearch
              keywords={state.brief.keywords || []}
              onChange={keywords => update({ brief: { ...state.brief, keywords } })}
            />
          </SectionCard>
        )}

        {/* Generate */}
        <SectionCard num={isSearch ? n.gen : 5} title="AI Copy Generation" status={genStatus}>
          {isSearch ? (
            <div className="space-y-3">
              {state.is_generating && (
                <div className="bg-mist border border-cloud rounded-xl px-4 py-3">
                  <p className="text-sm text-navy font-medium">
                    Generating ad group {state.generating_index + 1} of {filledAdGroups.length}:
                    <span className="text-teal ml-1">{filledAdGroups[state.generating_index]?.name}</span>
                  </p>
                  <div className="mt-2 h-1.5 bg-cloud rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan transition-all duration-500 rounded-full"
                      style={{ width: `${((state.generating_index + 1) / filledAdGroups.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {allGenerated ? (
                <p className="text-sm text-emerald-600 font-medium">
                  All {filledAdGroups.length} ad groups generated — review below ↓
                </p>
              ) : (
                <button
                  onClick={handleGenerateSearch}
                  disabled={state.is_generating || filledAdGroups.length === 0 || !state.brief.brand_name}
                  className="w-full bg-gradient-to-r from-navy to-[#054991] text-white font-heading font-bold py-4 rounded-full text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {state.is_generating
                    ? `Generating ${state.generating_index + 1} / ${filledAdGroups.length}...`
                    : `Generate Assets for ${filledAdGroups.length} Ad Group${filledAdGroups.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          ) : (
            state.assets ? (
              <p className="text-sm text-emerald-600 font-medium">Assets generated — review below</p>
            ) : (
              <button
                onClick={handleGenerateSingle}
                disabled={state.is_generating || !state.brief.product || !state.campaign_type}
                className="w-full bg-gradient-to-r from-navy to-[#054991] text-white font-heading font-bold py-4 rounded-full text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {state.is_generating ? 'Generating with Claude AI...' : 'Generate Campaign Assets with Claude AI'}
              </button>
            )
          )}
          {state.error && <p className="text-red-500 text-sm mt-2">{state.error}</p>}
        </SectionCard>

        {/* Review — Search: tabbed per ad group */}
        {isSearch && allGenerated && (
          <SectionCard num={n.review} title="Review & Ad Strength" status="Review required" defaultOpen>
            <div className="flex flex-wrap gap-2 mb-5">
              {filledAdGroups.map(ag => (
                <button
                  key={ag.id}
                  onClick={() => setActiveAdGroupId(ag.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-heading font-bold transition-all ${
                    activeAdGroup?.id === ag.id ? 'bg-navy text-white' : 'bg-cloud text-navy hover:bg-navy/10'
                  }`}
                >
                  {ag.name}
                </button>
              ))}
            </div>
            {activeAdGroup?.assets && (
              <ReviewAssets
                key={activeAdGroup.id}
                assets={activeAdGroup.assets}
                brief={{ ...state.brief, product: activeAdGroup.name, keywords: activeAdGroup.keywords }}
                campaignType="search"
                onChange={assets => update({
                  ad_groups: state.ad_groups.map(ag =>
                    ag.id === activeAdGroup.id ? { ...ag, assets } : ag
                  ),
                })}
                onPublish={handlePublish}
                isPublishing={state.is_publishing}
                publishError={state.error}
              />
            )}
          </SectionCard>
        )}

        {/* Review — non-Search */}
        {!isSearch && state.assets && state.campaign_type && (
          <SectionCard num={n.review} title="Review & Ad Strength" status="Review required" defaultOpen>
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
      <div className="space-y-3 sticky top-16 self-start">
        <ClientSelector selectedId={state.client_id} onSelect={id => update({ client_id: id })} />
        <ProgressTracker currentStep={
          !state.campaign_type ? 0
          : isSearch && !state.ppc_package ? 1
          : isSearch && !filledAdGroups.length ? 2
          : !state.brief.brand_name ? 3
          : !state.settings.budget_daily ? 4
          : allGenerated ? 6
          : 5
        } />
        <BestPracticesPanel campaignType={state.campaign_type} />
      </div>
    </div>
  )
}
