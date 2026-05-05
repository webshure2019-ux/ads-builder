import { Nav } from '@/components/Nav'
import { MCCDashboard } from '@/components/dashboard/MCCDashboard'

export const dynamic = 'force-dynamic'

export default function MCCPage() {
  return (
    <main className="min-h-screen">
      <Nav page="mcc" />
      <div className="w-full px-6 py-8">
        <MCCDashboard />
      </div>
    </main>
  )
}
