import { CampaignType } from '@/types'

const TIPS: Record<CampaignType, { title: string; tip: string }[]> = {
  search: [
    { title: 'Ad Strength', tip: 'Aim for "Excellent" — use all 15 headlines & 4 descriptions with varied messaging.' },
    { title: 'Smart Bidding', tip: 'Use Maximize Conversions until 50+ conv/month, then switch to Target CPA.' },
    { title: 'Keywords', tip: 'Pair Broad Match + Smart Bidding for 20% more conversions. Keep Exact Match for high-value terms.' },
    { title: 'RSAs', tip: 'Create 2–3 ads per ad group, each with a different messaging angle.' },
  ],
  pmax: [
    { title: 'Learning Period', tip: 'Avoid major changes for 2–6 weeks after launch. The algorithm needs time to optimise.' },
    { title: 'Audience Signals', tip: 'Add customer match lists or website visitors to shorten the learning curve.' },
    { title: 'Assets', tip: 'Replace Low-rated assets after 4–6 weeks. Never replace all assets at once.' },
    { title: 'Conversions', tip: 'PMax needs 30+ conversions/month to optimise effectively. Check your account history.' },
  ],
  demand_gen: [
    { title: 'Mixed Media', tip: 'Include both image and video assets — advertisers see 20% more conversions vs video-only.' },
    { title: 'New Customers', tip: 'Enable New Customer Acquisition goal to reach users who have never converted with you.' },
    { title: 'Channel Controls', tip: 'Use channel controls to choose placements: YouTube, Discover, Gmail, Display.' },
    { title: 'Audience', tip: '68% of Demand Gen conversions come from users who had not seen your Search ads. It reaches new audiences.' },
  ],
  display: [
    { title: 'Audiences', tip: 'Target in-market audiences and custom intent segments for best results.' },
    { title: 'Assets', tip: 'Upload multiple image sizes — Google will serve the best-performing combination.' },
    { title: 'Remarketing', tip: 'Add your website visitor lists to reach warm audiences at lower CPCs.' },
  ],
  shopping: [
    { title: 'Feed Quality', tip: 'Optimise product titles and descriptions in Merchant Center first — feed quality drives performance.' },
    { title: 'PMax vs Standard', tip: 'Performance Max is recommended over Standard Shopping for most accounts in 2026.' },
    { title: 'Product Groups', tip: 'Segment by category, brand, or custom labels to control bids per product group.' },
  ],
  video: [
    { title: 'Video Action', tip: 'Video Action Campaigns are now Demand Gen. Use Demand Gen for conversion-focused video campaigns.' },
    { title: 'Opening Hook', tip: 'Capture attention in the first 5 seconds — that is the skip threshold for in-stream ads.' },
    { title: 'Connected TV', tip: 'Include CTV placements — campaigns with TV screens drive 7% additional conversions on average.' },
  ],
}

interface Props { campaignType: CampaignType | null }

export function BestPracticesPanel({ campaignType }: Props) {
  const tips = campaignType ? TIPS[campaignType] : []

  return (
    <div className="bg-white border border-cloud rounded-2xl p-4">
      <h3 className="font-heading font-bold text-sm text-navy mb-3">
        Best Practices{campaignType ? ` · ${campaignType === 'pmax' ? 'Performance Max' : campaignType.replace('_', ' ')}` : ''}
      </h3>
      {tips.length === 0 ? (
        <p className="text-xs text-teal">Select a campaign type to see best practices.</p>
      ) : (
        <div className="space-y-2">
          {tips.map(({ title, tip }) => (
            <div key={title} className="bg-mist border-l-2 border-cyan rounded-r-lg px-3 py-2 text-xs text-navy leading-snug">
              <span className="font-semibold text-teal">{title}: </span>{tip}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
