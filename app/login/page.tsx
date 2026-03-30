'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
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
    if (res.ok) {
      router.push('/')
    } else {
      setError('Incorrect password')
    }
  }

  return (
    <div className="min-h-screen bg-[#F4FAFD] flex items-center justify-center">
      <div className="bg-white border border-[#D5EEF7] rounded-2xl p-10 w-full max-w-sm shadow-sm">
        <div className="text-center mb-8">
          <span className="text-[#052E4B] font-black text-2xl font-['Montserrat',Arial,sans-serif]">
            web<span className="text-[#31C0FF]">shure</span>
          </span>
          <p className="text-[#007EA8] text-sm mt-1">Ads Builder</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-[#D5EEF7] rounded-lg px-4 py-3 text-[#052E4B] bg-[#F4FAFD] focus:outline-none focus:border-[#31C0FF]"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#052E4B] text-white rounded-full py-3 font-bold font-['Montserrat',Arial,sans-serif] hover:bg-[#054991] transition-colors disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
