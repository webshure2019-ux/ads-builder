// types/index.ts
export type CampaignType = 'search' | 'pmax' | 'demand_gen' | 'display' | 'shopping' | 'video'
export type PpcPackage = 'ppc1' | 'ppc2' | 'ppc3'
export type CopywritingStyle = 'frank_kern' | 'billy_gene' | 'alex_hormozi' | 'tony_robbins' | 'other'

export interface CopywritingStyleConfig {
  label: string
  tagline: string
  emoji: string
  prompt: string
}

export const COPYWRITING_STYLES: Record<Exclude<CopywritingStyle, 'other'>, CopywritingStyleConfig> = {
  frank_kern: {
    label: 'Frank Kern',
    tagline: 'Casual & story-driven',
    emoji: '📖',
    prompt: "Write in Frank Kern's style: casual, conversational, and story-driven. Use plain everyday language as if talking to a friend. Focus on desire and transformation. Make it feel personal and relatable — never corporate or stiff.",
  },
  billy_gene: {
    label: 'Billy Gene',
    tagline: 'Bold & attention-grabbing',
    emoji: '⚡',
    prompt: "Write in Billy Gene's style: bold, energetic, and attention-grabbing. Use pattern interrupts and be irreverent and fun. Use very direct, punchy calls to action. Make it exciting and impossible to ignore.",
  },
  alex_hormozi: {
    label: 'Alex Hormozi',
    tagline: 'Direct & value-packed',
    emoji: '💰',
    prompt: "Write in Alex Hormozi's style: ultra-direct, value-focused, and no-nonsense. Quantify value with specific numbers wherever possible. Pre-empt objections before they arise. Be dense with proof and specifics. Make the offer irresistible by showing exactly what they get and why they'd be crazy to say no.",
  },
  tony_robbins: {
    label: 'Tony Robbins',
    tagline: 'Inspiring & transformational',
    emoji: '🔥',
    prompt: "Write in Tony Robbins's style: inspirational, empowering, and emotionally charged. Focus on transformation, unlocking potential, and breaking through limits. Use high-energy motivational language that makes people feel they can achieve anything. Lead with possibility.",
  },
}

export interface PpcPackageConfig {
  label: string
  maxAdGroups: number
  description: string
}

export const PPC_PACKAGE_CONFIG: Record<PpcPackage, PpcPackageConfig> = {
  ppc1: { label: 'PPC 1', maxAdGroups: 5,  description: 'Up to 5 products / services' },
  ppc2: { label: 'PPC 2', maxAdGroups: 12, description: 'Up to 12 products / services' },
  ppc3: { label: 'PPC 3', maxAdGroups: 20, description: 'Up to 20 products / services' },
}
export type CampaignStatus = 'draft' | 'review' | 'approved' | 'published' | 'failed'
export type AssetType =
  | 'headline' | 'long_headline' | 'description' | 'keyword'
  | 'sitelink' | 'callout' | 'structured_snippet'
  | 'image_brief' | 'video_brief' | 'audience_signal'
  | 'search_theme' | 'product_group'
export type MatchType = 'exact' | 'phrase' | 'broad'
export type BiddingStrategy =
  | 'maximize_conversions' | 'target_cpa' | 'target_roas'
  | 'maximize_clicks' | 'manual_cpc'
export type GoalType = 'lead_gen' | 'sales' | 'awareness'
export type ToneType = 'professional' | 'friendly' | 'urgent' | 'authoritative' | 'conversational'
export type AdStrength = 'poor' | 'average' | 'good' | 'excellent'
export type CompetitionLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED'
export type CanvasStep = 'type' | 'brief' | 'keywords' | 'settings' | 'generate' | 'review'

export interface Client {
  id: string
  name: string
  google_account_id: string
  industry?: string
  created_at: string
}

export interface CampaignSettingsData {
  budget_daily: number
  bidding_strategy: BiddingStrategy
  target_cpa?: number
  target_roas?: number
  locations: string[]
  language: string
  final_url?: string
  schedule?: string
  audience_signals?: string[]
  merchant_center_id?: string
  channel_controls?: {
    youtube: boolean
    discover: boolean
    gmail: boolean
    display: boolean
  }
}

export interface Campaign {
  id: string
  client_id: string
  name: string
  type: CampaignType
  status: CampaignStatus
  settings: CampaignSettingsData
  google_campaign_id?: string
  created_at: string
  published_at?: string
}

export interface Keyword {
  text: string
  match_type: MatchType
  volume?: number
  competition?: CompetitionLevel
  suggested_bid?: number
  selected: boolean
}

export interface Brief {
  id?: string
  campaign_id?: string
  url?: string
  scraped_content?: string
  product: string
  audience: string
  usps: string[]
  tone: ToneType
  goal: GoalType
  brand_name: string
  keywords: Keyword[]
  copywriting_style?: CopywritingStyle
  copywriting_style_custom?: string  // used when copywriting_style === 'other'
}

export interface Sitelink {
  text: string
  url: string
  description1: string
  description2: string
}

export interface StructuredSnippet {
  header: string
  values: string[]
}

export interface GeneratedAssets {
  headlines: string[]
  long_headlines?: string[]
  descriptions: string[]
  sitelinks?: Sitelink[]
  callouts?: string[]
  structured_snippets?: StructuredSnippet[]
  image_briefs?: string[]
  video_briefs?: string[]
  audience_signals?: string[]
  search_themes?: string[]
  product_groups?: string[]
}

export interface ScrapedContent {
  product: string
  audience: string
  usps: string[]
  tone: ToneType
  raw_text: string
}

export interface KeywordSuggestion {
  text: string
  volume: number
  competition: CompetitionLevel
  suggested_bid: number
}

export interface AdStrengthResult {
  score: AdStrength
  numeric: number
  tips: string[]
}

export interface NegativeKeyword {
  id: string
  text: string
  match_type: MatchType
}

export interface AdGroup {
  id: string
  name: string
  url?: string
  usps: string[]
  keywords: Keyword[]
  negative_keywords: NegativeKeyword[]
  assets?: GeneratedAssets
}

export interface CanvasState {
  client_id: string | null
  campaign_type: CampaignType | null
  ppc_package: PpcPackage | null
  ad_groups: AdGroup[]
  brief: Partial<Brief>
  settings: Partial<CampaignSettingsData>
  assets: GeneratedAssets | null  // used for non-Search campaigns
  campaign_id: string | null
  is_generating: boolean
  generating_index: number        // which ad group is currently being generated
  is_publishing: boolean
  error: string | null
  step: CanvasStep
}
