import { Nav } from '@/components/Nav'
import { CampaignCanvas } from '@/components/CampaignCanvas'

export default function Home() {
  return (
    <main className="min-h-screen">
      <Nav page="builder" />
      <CampaignCanvas />
    </main>
  )
}
