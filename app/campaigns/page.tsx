import Link from 'next/link'
import { Nav } from '@/components/Nav'

export const dynamic = 'force-dynamic'

async function getCampaigns() {
  const { createServerClient } = await import('@/lib/supabase')
  const supabase = createServerClient()
  const { data } = await supabase
    .from('campaigns')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })
  return data || []
}

const STATUS_STYLES: Record<string, string> = {
  draft:     'bg-[var(--surface-lo)] text-[var(--text-2)]',
  review:    'bg-orange/10 text-orange',
  approved:  'bg-emerald-500/10 text-emerald-500',
  published: 'bg-cyan/10 text-cyan',
  failed:    'bg-red-500/10 text-red-400',
}

const TYPE_ICONS: Record<string, string> = {
  search: '🔍', pmax: '⚡', demand_gen: '🎯',
  display: '🖼️', shopping: '🛒', video: '▶️',
}

const NewCampaignBtn = () => (
  <Link
    href="/"
    className="bg-cyan text-navy font-heading font-bold text-sm px-4 py-2 rounded-full hover:opacity-90 active:scale-95 transition-all"
  >
    + New Campaign
  </Link>
)

export default async function CampaignsPage() {
  const campaigns = await getCampaigns()

  return (
    <main className="min-h-screen">
      <Nav page="campaigns" action={<NewCampaignBtn />} />

      <div className="max-w-5xl mx-auto px-5 py-8 animate-slide-up">
        <h1 className="font-heading font-bold text-2xl mb-6" style={{ color: 'var(--text-1)' }}>
          Campaign Library
        </h1>

        {campaigns.length === 0 ? (
          <div className="card p-16 text-center">
            <p className="text-4xl mb-4">📋</p>
            <p className="font-heading font-bold text-lg mb-2" style={{ color: 'var(--text-1)' }}>No campaigns yet</p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-2)' }}>Build your first campaign to get started.</p>
            <Link href="/" className="bg-cyan text-navy font-heading font-bold text-sm px-6 py-3 rounded-full hover:opacity-90 transition-all">
              Build Your First Campaign
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c: any) => (
              <div key={c.id} className="card px-5 py-4 flex items-center gap-4 hover:scale-[1.005] transition-transform">
                <span className="text-2xl">{TYPE_ICONS[c.type] || '📊'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-bold truncate" style={{ color: 'var(--text-1)' }}>{c.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                    {(c.clients as any)?.name} · {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs font-heading font-bold px-3 py-1 rounded-full capitalize ${STATUS_STYLES[c.status] || ''}`}>
                  {c.status}
                </span>
                {c.google_campaign_id && (
                  <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
                    ID: {c.google_campaign_id}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
