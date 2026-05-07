'use client'
import { useState } from 'react'

// ─── Quick-question presets ────────────────────────────────────────────────────
const QUICK_QUESTIONS = [
  'What are my top 3 optimisation opportunities right now?',
  'Which campaigns have the most wasted spend from irrelevant search terms?',
  'Which keywords have a low Quality Score and what should I do about them?',
  'How is mobile performance compared to desktop, and should I adjust bids?',
  'Why might my impression share be low and what can I do to improve it?',
]

// ─── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  clientAccountId: string
  startDate:       string
  endDate:         string
}

// ─── Inline bold renderer — converts **text** to <strong> without innerHTML ───
function InlineBold({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

// ─── Markdown-ish answer renderer ─────────────────────────────────────────────
function AnswerBody({ text }: { text: string }) {
  const lines = text.split('\n')

  return (
    <div className="text-sm text-navy leading-relaxed space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="h-2" />

        // Section headings: **Heading** or **Heading**: alone on a line
        if (/^\*\*[^*]+\*\*:?\s*$/.test(trimmed)) {
          return (
            <p key={i} className="font-heading font-bold text-teal text-[11px] uppercase tracking-wider mt-4 mb-0.5">
              {trimmed.replace(/\*\*/g, '').replace(/:$/, '')}
            </p>
          )
        }

        // Bullet points (-, •, *)
        if (/^[-•*]\s/.test(trimmed)) {
          const content = trimmed.replace(/^[-•*]\s/, '')
          return (
            <div key={i} className="flex gap-2">
              <span className="text-teal flex-shrink-0 mt-0.5 text-xs">•</span>
              <span><InlineBold text={content} /></span>
            </div>
          )
        }

        // Numbered list
        if (/^\d+\.\s/.test(trimmed)) {
          const match   = trimmed.match(/^(\d+)\.\s(.*)/)
          const num     = match?.[1] ?? ''
          const content = match?.[2] ?? trimmed
          return (
            <div key={i} className="flex gap-2">
              <span className="text-teal font-bold flex-shrink-0 tabular-nums w-4 text-xs">{num}.</span>
              <span><InlineBold text={content} /></span>
            </div>
          )
        }

        // Regular paragraph
        return (
          <p key={i}><InlineBold text={trimmed} /></p>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AIAnalystSection({ clientAccountId, startDate, endDate }: Props) {
  const [question,    setQuestion]    = useState('')
  const [answer,      setAnswer]      = useState('')
  const [iterations,  setIterations]  = useState(0)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [activeQuick, setActiveQuick] = useState<string | null>(null)

  async function ask(q: string) {
    const query = q.trim()
    if (!query || !clientAccountId || !startDate || !endDate) return
    setLoading(true)
    setError('')
    setAnswer('')
    setIterations(0)
    setActiveQuick(q)

    try {
      const res = await fetch('/api/ai-analyse', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          question:          query,
          client_account_id: clientAccountId,
          start_date:        startDate,
          end_date:          endDate,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setAnswer(data.answer ?? '')
      setIterations(data.iterations ?? 0)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleCustomAsk() {
    setActiveQuick(null)
    ask(question)
  }

  return (
    <div className="border border-cloud rounded-3xl overflow-hidden bg-white">
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-cloud flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan/20 to-teal/20 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🤖</span>
          </div>
          <div>
            <p className="font-heading font-bold text-navy text-sm">AI Analyst</p>
            <p className="text-[10px] text-navy/50 mt-0.5">
              Ask Claude to analyse this account using live data
            </p>
          </div>
        </div>
        {!loading && answer && (
          <span className="text-[10px] text-navy/30 bg-cloud px-2 py-0.5 rounded-full">
            {iterations} data call{iterations !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* ── Quick questions ── */}
        <div>
          <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-navy/40 mb-2">
            Quick analysis
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => ask(q)}
                disabled={loading}
                className={`text-[11px] px-3 py-1.5 rounded-full border transition-all disabled:opacity-40 ${
                  activeQuick === q && (loading || answer)
                    ? 'border-teal bg-teal/5 text-teal font-medium'
                    : 'border-cloud text-navy/60 hover:border-cyan/40 hover:text-teal hover:bg-cyan/5'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* ── Custom question ── */}
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleCustomAsk()
              }
            }}
            disabled={loading}
            placeholder="Ask a custom question… e.g. 'Why is my CPA higher than last month?'"
            className="flex-1 text-sm border border-cloud rounded-xl px-4 py-2.5 text-navy placeholder-navy/30 focus:outline-none focus:border-cyan bg-white disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleCustomAsk}
            disabled={loading || !question.trim()}
            className="bg-teal text-white font-heading font-bold text-sm px-5 py-2.5 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all flex-shrink-0"
          >
            Ask
          </button>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center gap-3 bg-cyan/5 border border-cyan/20 rounded-2xl px-5 py-4">
            <div className="w-4 h-4 border-2 border-teal border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-teal">Analysing your account…</p>
              <p className="text-[10px] text-navy/40 mt-0.5">
                Claude is fetching live data and reasoning through the numbers
              </p>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && !loading && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
            <p className="font-medium mb-0.5">Analysis failed</p>
            <p className="text-[12px] text-red-500">{error}</p>
          </div>
        )}

        {/* ── Answer ── */}
        {answer && !loading && (
          <div className="bg-mist border border-cloud/80 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal">
                Claude's Analysis
              </p>
              <button
                onClick={() => { setAnswer(''); setActiveQuick(null) }}
                className="text-[10px] text-navy/30 hover:text-navy/60 transition-colors"
              >
                Clear ×
              </button>
            </div>
            {activeQuick && (
              <p className="text-[11px] text-navy/40 italic border-b border-cloud/60 pb-2">
                "{activeQuick}"
              </p>
            )}
            <AnswerBody text={answer} />
          </div>
        )}
      </div>
    </div>
  )
}
