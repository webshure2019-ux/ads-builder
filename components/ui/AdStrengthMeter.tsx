import { AdStrengthResult } from '@/types'

interface Props { result: AdStrengthResult }

const GRADE_COLOR: Record<string, string> = {
  poor: '#ef4444',
  average: '#f59e0b',
  good: '#31C0FF',
  excellent: '#10b981',
}

const GRADE_SEGMENTS = ['poor', 'average', 'good', 'excellent']

export function AdStrengthMeter({ result }: Props) {
  const color = GRADE_COLOR[result.score]
  const filledCount = GRADE_SEGMENTS.indexOf(result.score) + 1

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-heading font-bold uppercase tracking-wider text-teal">Ad Strength</span>
        <span className="font-heading font-bold text-sm capitalize" style={{ color }}>{result.score}</span>
      </div>
      <div className="flex gap-1">
        {GRADE_SEGMENTS.map((grade, i) => (
          <div
            key={grade}
            className="h-2 flex-1 rounded-sm"
            style={{ background: i < filledCount ? GRADE_COLOR[grade] : '#D5EEF7' }}
          />
        ))}
      </div>
      <ul className="space-y-1">
        {result.tips.map((tip, i) => (
          <li key={i} className="text-xs text-teal flex gap-1.5">
            <span>→</span><span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
