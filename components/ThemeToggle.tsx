'use client'
import { useEffect, useState } from 'react'

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function AutoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 3 a 9 9 0 0 1 0 18 Z" fill="currentColor"/>
    </svg>
  )
}

type ThemeState = 'light' | 'dark' | 'auto'

function readState(): ThemeState {
  if (typeof window === 'undefined') return 'auto'
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return 'auto'
}

function systemIsDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(state: ThemeState) {
  const effective = state === 'auto' ? (systemIsDark() ? 'dark' : 'light') : state
  document.documentElement.classList.toggle('dark', effective === 'dark')
}

export function ThemeToggle() {
  const [state, setState] = useState<ThemeState | null>(null)

  useEffect(() => {
    setState(readState())

    // When in auto mode, follow live OS theme changes (e.g. macOS sunset switch)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (readState() === 'auto') applyTheme('auto')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function cycle() {
    // light → dark → auto → light
    const next: ThemeState = state === 'light' ? 'dark' : state === 'dark' ? 'auto' : 'light'
    try {
      if (next === 'auto') localStorage.removeItem('theme')
      else localStorage.setItem('theme', next)
    } catch {}
    applyTheme(next)
    setState(next)
  }

  if (state === null) {
    return <div className="w-9 h-9 rounded-full glass opacity-0" aria-hidden />
  }

  const label = state === 'light' ? 'Light mode' : state === 'dark' ? 'Dark mode' : 'Auto (system)'
  const icon  = state === 'light' ? <SunIcon /> : state === 'dark' ? <MoonIcon /> : <AutoIcon />

  return (
    <button
      onClick={cycle}
      aria-label={`Theme: ${label}. Click to cycle.`}
      title={`${label} — click to cycle`}
      className="w-9 h-9 flex items-center justify-center rounded-full glass hover:scale-105 active:scale-95 transition-all"
      style={{ color: 'var(--text-2)' }}
    >
      {icon}
    </button>
  )
}
