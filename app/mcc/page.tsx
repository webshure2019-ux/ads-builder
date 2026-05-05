import { Nav } from '@/components/Nav'
import { MCCDashboard } from '@/components/dashboard/MCCDashboard'

export const dynamic = 'force-dynamic'

export default function MCCPage() {
  return (
    <main className="min-h-screen">
      <Nav page="mcc" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <MCCDashboard />
      </div>
    </main>
  )
}
