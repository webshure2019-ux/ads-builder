import { CampaignCanvas } from '@/components/CampaignCanvas'

export default function Home() {
  return (
    <main>
      {/* Top bar */}
      <nav className="bg-navy px-5 py-3 flex items-center justify-between">
        <span className="font-heading font-black text-lg text-cyan">
          web<span className="text-white">shure</span>
          <span className="text-white/40 font-normal text-sm ml-2">/ Ads Builder</span>
        </span>
        <div className="flex gap-3">
          <a href="/campaigns" className="text-white/70 text-sm hover:text-white transition-colors">Campaigns</a>
        </div>
      </nav>
      <CampaignCanvas />
    </main>
  )
}
