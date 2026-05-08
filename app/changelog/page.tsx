import { Nav } from '@/components/Nav'
import { ChangelogContent } from '@/components/dashboard/ChangelogContent'

export const dynamic = 'force-dynamic'

export default function ChangelogPage() {
  return (
    <main className="min-h-screen">
      <Nav page="changelog" />
      <div className="w-full px-6 py-8">
        <ChangelogContent />
      </div>
    </main>
  )
}
