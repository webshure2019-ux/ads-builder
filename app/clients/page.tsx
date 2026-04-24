import { Nav } from '@/components/Nav'
import { ClientDashboard } from '@/components/dashboard/ClientDashboard'

export const dynamic = 'force-dynamic'

export default function ClientsPage() {
  return (
    <main className="min-h-screen">
      <Nav page="clients" />
      <ClientDashboard />
    </main>
  )
}
