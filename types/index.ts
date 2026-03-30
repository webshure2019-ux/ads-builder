// types/index.ts
export type CampaignType = 'search' | 'pmax' | 'demand_gen' | 'display' | 'shopping' | 'video'
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

export interface CanvasState {
  client_id: string | null
  campaign_type: CampaignType | null
  brief: Partial<Brief>
  settings: Partial<CampaignSettingsData>
  assets: GeneratedAssets | null
  campaign_id: string | null
  is_generating: boolean
  is_publishing: boolean
  error: string | null
  step: CanvasStep
}
