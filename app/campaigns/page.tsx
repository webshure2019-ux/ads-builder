import Link from 'next/link'

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
  draft:     'bg-cloud text-navy',
  review:    'bg-[#fff3e0] text-orange',
  approved:  'bg-[#d1fae5] text-emerald-700',
  published: 'bg-navy text-cyan',
  failed:    'bg-red-50 text-red-600',
}

const TYPE_ICONS: Record<string, string> = {
  search: '🔍', pmax: '⚡', demand_gen: '🎯',
  display: '🖼️', shopping: '🛒', video: '▶️',
}

export default async function CampaignsPage() {
  const campaigns = await getCampaigns()

  return (
    <main>
      <nav className="bg-navy px-5 py-3 flex items-center justify-between">
        <span className="font-heading font-black text-lg text-cyan">
          web<span className="text-white">shure</span>
          <span className="text-white/40 font-normal text-sm ml-2">/ Campaigns</span>
        </span>
        <div className="flex items-center gap-4">
          <Link href="/clients" className="text-white/70 text-sm hover:text-white transition-colors">Clients</Link>
          <Link href="/" className="bg-orange text-white font-heading font-bold text-sm px-4 py-2 rounded-full hover:bg-orange/80 transition-colors">
            + New Campaign
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-5 py-8">
        <h1 className="font-heading font-bold text-2xl text-navy mb-6">Campaign Library</h1>

        {campaigns.length === 0 ? (
          <div className="bg-white border border-cloud rounded-2xl p-12 text-center">
            <p className="text-teal text-sm mb-4">No campaigns yet.</p>
            <Link href="/" className="bg-navy text-white font-heading font-bold text-sm px-6 py-3 rounded-full hover:bg-[#054991] transition-colors">
              Build Your First Campaign
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c: any) => (
              <div key={c.id} className="bg-white border border-cloud rounded-2xl px-5 py-4 flex items-center gap-4">
                <span className="text-2xl">{TYPE_ICONS[c.type] || '📊'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-bold text-navy truncate">{c.name}</p>
                  <p className="text-xs text-teal">{(c.clients as any)?.name} · {new Date(c.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs font-heading font-bold px-3 py-1 rounded-full capitalize ${STATUS_STYLES[c.status] || 'bg-cloud text-navy'}`}>
                  {c.status}
                </span>
                {c.google_campaign_id && (
                  <span className="text-xs text-teal font-mono">ID: {c.google_campaign_id}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
