'use client'
import { GeneratedAssets, Brief, CampaignType } from '@/types'
import { calculateAdStrength } from '@/lib/ad-strength'
import { AdStrengthMeter } from '@/components/ui/AdStrengthMeter'
import { CharacterCounter } from '@/components/ui/CharacterCounter'

interface Props {
  assets: GeneratedAssets
  brief: Partial<Brief>
  campaignType: CampaignType
  onChange: (assets: GeneratedAssets) => void
  onPublish: () => void
  isPublishing: boolean
  publishError: string | null
}

export function ReviewAssets({ assets, brief, campaignType, onChange, onPublish, isPublishing, publishError }: Props) {
  const primaryKeyword = brief.keywords?.find(k => k.selected)?.text
  const strengthResult = calculateAdStrength(
    assets.headlines || [],
    assets.descriptions || [],
    primaryKeyword
  )

  function updateHeadline(index: number, value: string) {
    const updated = [...(assets.headlines || [])]
    updated[index] = value
    onChange({ ...assets, headlines: updated })
  }

  function updateDescription(index: number, value: string) {
    const updated = [...(assets.descriptions || [])]
    updated[index] = value
    onChange({ ...assets, descriptions: updated })
  }

  const assetInput = 'w-full bg-mist border border-cloud rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:border-cyan font-mono'
  const sectionLabel = 'text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-2'

  return (
    <div className="space-y-6">

      <AdStrengthMeter result={strengthResult} />

      {/* Headlines */}
      <div>
        <div className={sectionLabel}>Headlines ({(assets.headlines || []).length}/15 · max 30 chars)</div>
        <div className="space-y-2">
          {(assets.headlines || []).map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={assetInput}
                maxLength={30}
                value={h}
                onChange={e => updateHeadline(i, e.target.value)}
              />
              <CharacterCounter current={h.length} max={30} />
            </div>
          ))}
        </div>
      </div>

      {/* Long headlines (PMax, Demand Gen) */}
      {assets.long_headlines && assets.long_headlines.length > 0 && (
        <div>
          <div className={sectionLabel}>Long Headlines ({assets.long_headlines.length} · max 90 chars)</div>
          <div className="space-y-2">
            {assets.long_headlines.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={assetInput}
                  maxLength={90}
                  value={h}
                  onChange={e => {
                    const updated = [...assets.long_headlines!]
                    updated[i] = e.target.value
                    onChange({ ...assets, long_headlines: updated })
                  }}
                />
                <CharacterCounter current={h.length} max={90} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Descriptions */}
      <div>
        <div className={sectionLabel}>Descriptions ({(assets.descriptions || []).length}/4 · max 90 chars)</div>
        <div className="space-y-2">
          {(assets.descriptions || []).map((d, i) => (
            <div key={i} className="flex items-start gap-2">
              <textarea
                className={`${assetInput} resize-none`}
                rows={2}
                maxLength={90}
                value={d}
                onChange={e => updateDescription(i, e.target.value)}
              />
              <CharacterCounter current={d.length} max={90} />
            </div>
          ))}
        </div>
      </div>

      {/* Sitelinks */}
      {assets.sitelinks && assets.sitelinks.length > 0 && (
        <div>
          <div className={sectionLabel}>Sitelinks</div>
          <div className="space-y-3">
            {assets.sitelinks.map((sl, i) => (
              <div key={i} className="bg-mist border border-cloud rounded-xl p-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-[10px] text-teal uppercase font-bold">Text</span>
                  <p className="text-navy font-medium">{sl.text}</p>
                </div>
                <div>
                  <span className="text-[10px] text-teal uppercase font-bold">URL</span>
                  <p className="text-teal text-xs truncate">{sl.url}</p>
                </div>
                <div className="col-span-2 text-xs text-navy/70">{sl.description1} · {sl.description2}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Callouts */}
      {assets.callouts && assets.callouts.length > 0 && (
        <div>
          <div className={sectionLabel}>Callouts</div>
          <div className="flex flex-wrap gap-2">
            {assets.callouts.map((c, i) => (
              <span key={i} className="bg-cloud text-navy text-xs rounded-full px-3 py-1 font-medium">{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Image/Video briefs */}
      {assets.image_briefs && assets.image_briefs.length > 0 && (
        <div>
          <div className={sectionLabel}>Image Creative Briefs (hand off to design team)</div>
          <div className="space-y-2">
            {assets.image_briefs.map((brief, i) => (
              <div key={i} className="bg-mist border border-cloud rounded-lg px-3 py-2 text-sm text-navy">{brief}</div>
            ))}
          </div>
        </div>
      )}

      {/* Publish button */}
      <div className="pt-2">
        {publishError && (
          <p className="text-red-500 text-sm mb-3">Publish failed: {publishError}</p>
        )}
        <button
          onClick={onPublish}
          disabled={isPublishing}
          className="w-full bg-gradient-to-r from-orange to-[#e07020] text-white font-heading font-bold py-4 rounded-full text-base hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPublishing ? 'Publishing to Google Ads...' : 'Approve & Publish to Google Ads'}
        </button>
      </div>
    </div>
  )
}
