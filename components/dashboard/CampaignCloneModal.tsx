'use client'
import { useState, useEffect, useRef } from 'react'
import type { CampaignMetrics, CampaignTemplate } from '@/lib/google-ads'

// ─── Templates stored in localStorage ────────────────────────────────────────
const STORAGE_KEY = 'ads_builder_campaign_templates'

function loadTemplates(): CampaignTemplate[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch { return [] }
}

function saveTemplate(tpl: CampaignTemplate) {
  const existing = loadTemplates()
  existing.unshift(tpl)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.slice(0, 20)))
}

function deleteTemplate(id: string) {
  const existing = loadTemplates().filter(t => t.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
}

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ─── Clone modal ──────────────────────────────────────────────────────────────
interface CloneModalProps {
  campaign:       CampaignMetrics
  clientId:       string
  clientName:     string
  onClose:        () => void
  onCloned:       (newId: string, newName: string) => void
}

export function CampaignCloneModal({ campaign, clientId, clientName, onClose, onCloned }: CloneModalProps) {
  const [newName, setNewName]   = useState(`${campaign.name} (Copy)`)
  const [saving,  setSaving]    = useState(false)
  const [error,   setError]     = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleClone() {
    if (!newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res  = await fetch('/api/clone-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_account_id: clientId,
          campaign_id:       campaign.id,
          new_name:          newName.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Save as template in localStorage
      saveTemplate({
        id:         uuid(),
        name:       newName.trim(),
        campaignId: data.newCampaignId,
        accountId:  clientId,
        snapshot: {
          name:        campaign.name,
          channelType: campaign.channel_type,
          budget:      campaign.daily_budget,
          biddingType: campaign.bidding_strategy_type,
          startDate:   new Date().toISOString().split('T')[0],
        },
        createdAt: new Date().toISOString(),
      })

      setSuccess(`Campaign cloned as "${newName.trim()}" (paused). Refresh campaigns to see it.`)
      onCloned(data.newCampaignId, newName.trim())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveAsTemplate() {
    saveTemplate({
      id:         uuid(),
      name:       `Template: ${campaign.name}`,
      campaignId: campaign.id,
      accountId:  clientId,
      snapshot: {
        name:        campaign.name,
        channelType: campaign.channel_type,
        budget:      campaign.daily_budget,
        biddingType: campaign.bidding_strategy_type,
        startDate:   campaign.start_date,
      },
      createdAt: new Date().toISOString(),
    })
    setSuccess(`"${campaign.name}" saved as a template.`)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cloud">
          <div>
            <p className="font-heading font-bold text-navy text-sm">Clone Campaign</p>
            <p className="text-[10px] text-navy/50 mt-0.5 truncate max-w-[280px]">{campaign.name}</p>
          </div>
          <button onClick={onClose} className="text-navy/30 hover:text-navy text-xl transition-colors">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Campaign info */}
          <div className="bg-cloud/40 rounded-2xl px-4 py-3 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-navy/50">Budget</span>
              <span className="font-medium text-navy">${campaign.daily_budget}/day</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-navy/50">Type</span>
              <span className="font-medium text-navy">{campaign.channel_type}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-navy/50">Bidding</span>
              <span className="font-medium text-navy">{campaign.bidding_strategy_type || '—'}</span>
            </div>
          </div>

          {/* New name input */}
          <div>
            <label className="text-[10px] text-navy/50 uppercase tracking-wide font-medium block mb-1.5">
              New Campaign Name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              maxLength={255}
              placeholder="Campaign name…"
              className="w-full px-4 py-2.5 text-sm border border-cloud rounded-xl bg-white text-navy placeholder-navy/30 focus:outline-none focus:border-teal transition-colors"
              onKeyDown={e => { if (e.key === 'Enter' && !saving) handleClone() }}
            />
            <p className="text-[9px] text-navy/30 mt-1">
              Cloned campaign will be created as PAUSED with the same budget and settings.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs text-emerald-700">
              ✅ {success}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleClone}
              disabled={saving || !newName.trim() || !!success}
              className="flex-1 bg-teal text-white font-heading font-bold text-sm py-2.5 rounded-xl hover:bg-teal/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Cloning…' : '📋 Clone Campaign'}
            </button>
            <button
              onClick={saveAsTemplate}
              disabled={saving || !!success}
              className="flex-shrink-0 border border-cloud text-navy/60 text-xs font-medium px-3 py-2.5 rounded-xl hover:bg-cloud transition-colors disabled:opacity-40"
              title="Save as template (no campaign is created)"
            >
              💾 Save Template
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Template manager panel ───────────────────────────────────────────────────
export function CampaignTemplatesPanel({ onClose }: { onClose: () => void }) {
  const [templates, setTemplates] = useState<CampaignTemplate[]>([])

  useEffect(() => { setTemplates(loadTemplates()) }, [])

  function remove(id: string) {
    deleteTemplate(id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cloud flex-shrink-0">
          <p className="font-heading font-bold text-navy text-sm">💾 Campaign Templates</p>
          <button onClick={onClose} className="text-navy/30 hover:text-navy text-xl transition-colors">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {templates.length === 0 ? (
            <div className="text-center py-10 text-navy/40">
              <p className="text-2xl mb-2">📁</p>
              <p className="text-sm">No templates saved yet.</p>
              <p className="text-xs mt-1">Use "Save Template" on any campaign to store its settings here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map(tpl => (
                <div key={tpl.id} className="border border-cloud rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-navy text-sm truncate">{tpl.name}</p>
                      <p className="text-[10px] text-navy/50 mt-0.5">
                        Source: {tpl.snapshot.name} · ${tpl.snapshot.budget}/day · {tpl.snapshot.channelType}
                      </p>
                      <p className="text-[9px] text-navy/30 mt-0.5">
                        Saved {new Date(tpl.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => remove(tpl.id)}
                      className="flex-shrink-0 text-navy/20 hover:text-red-500 transition-colors text-sm"
                      title="Delete template"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
