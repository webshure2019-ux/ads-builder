'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setLoading(false)
    if (res.ok) router.push('/')
    else setError('Incorrect password. Please try again.')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">

      {/* Theme toggle — top right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      {/* Glass login card */}
      <div className="glass rounded-3xl p-10 w-full max-w-sm animate-slide-up">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="/logo.svg"
            alt="Webshure"
            width={180}
            height={58}
            priority
            className="h-12 w-auto object-contain"
          />
        </div>

        {/* Subtitle */}
        <p className="text-center text-sm font-medium mb-8" style={{ color: 'var(--text-2)' }}>
          Ads Builder — Sign in to continue
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="field"
              autoFocus
            />
          </div>

          {error && (
            <div className="glass-lo rounded-xl px-4 py-3 flex items-center gap-2">
              <span className="text-red-400 text-sm">⚠</span>
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-cyan text-navy font-heading font-bold py-3 rounded-full hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm tracking-wide"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />
                Signing in...
              </span>
            ) : 'Sign In'}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-[10px] mt-8" style={{ color: 'var(--text-3)' }}>
          Webshure internal tool — authorised access only
        </p>
      </div>
    </div>
  )
}
