import Link from 'next/link'
import Image from 'next/image'
import { ThemeToggle } from './ThemeToggle'

interface NavProps {
  page?: 'builder' | 'campaigns' | 'clients' | 'mcc'
  action?: React.ReactNode
}

export function Nav({ page, action }: NavProps) {
  const linkClass = (active: boolean) =>
    `text-sm font-medium transition-all px-3 py-1.5 rounded-full ${
      active
        ? 'bg-cyan/10 text-cyan font-bold'
        : 'hover:bg-[var(--surface-lo)] text-[var(--text-2)] hover:text-[var(--text-1)]'
    }`

  return (
    <nav className="sticky top-0 z-50 glass-hi border-b border-[var(--border-lo)]"
         style={{ borderBottom: '1px solid var(--border-lo)' }}>
      <div className="max-w-[1400px] mx-auto px-5 h-14 flex items-center gap-4">

        {/* Logo */}
        <Link href="/" className="flex-shrink-0 flex items-center h-9">
          <Image
            src="/logo.svg"
            alt="Webshure"
            width={140}
            height={45}
            priority
            className="h-8 w-auto object-contain"
          />
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1 ml-4">
          <Link href="/"         className={linkClass(page === 'builder')}>Builder</Link>
          <Link href="/clients"  className={linkClass(page === 'clients')}>Clients</Link>
          <Link href="/campaigns"className={linkClass(page === 'campaigns')}>Campaigns</Link>
          <Link href="/mcc"      className={linkClass(page === 'mcc')}>MCC</Link>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side */}
        <div className="flex items-center gap-2">
          {action}
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}
