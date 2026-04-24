import Link from 'next/link'
import { ClientDashboard } from '@/components/dashboard/ClientDashboard'

export const dynamic = 'force-dynamic'

export default function ClientsPage() {
  return (
    <main>
      <nav className="bg-navy px-5 py-3 flex items-center justify-between">
        <span className="font-heading font-black text-lg text-cyan">
          web<span className="text-white">shure</span>
          <span className="text-white/40 font-normal text-sm ml-2">/ Client Dashboard</span>
        </span>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-white/70 text-sm hover:text-white transition-colors">Builder</Link>
          <Link href="/campaigns" className="text-white/70 text-sm hover:text-white transition-colors">Campaigns</Link>
          <Link href="/" className="bg-orange text-white font-heading font-bold text-sm px-4 py-2 rounded-full hover:bg-orange/80 transition-colors">
            + New Campaign
          </Link>
        </div>
      </nav>
      <ClientDashboard />
    </main>
  )
}
