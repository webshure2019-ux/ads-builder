const STEPS = [
  'Campaign Type',
  'Brief & Landing Page',
  'Keyword Research',
  'Campaign Settings',
  'AI Generation',
  'Review & Ad Strength',
  'Publish',
]

interface Props { currentStep: number }

export function ProgressTracker({ currentStep }: Props) {
  return (
    <div className="card p-4">
      <h3 className="font-heading font-bold text-sm mb-3" style={{ color: 'var(--text-1)' }}>Campaign Progress</h3>
      <div className="space-y-0.5">
        {STEPS.map((step, i) => {
          const done   = i < currentStep
          const active = i === currentStep
          return (
            <div
              key={step}
              className={`flex items-center gap-2 py-1.5 text-xs border-b last:border-0 ${done ? 'font-medium' : active ? 'font-semibold' : ''}`}
              style={{
                color:       done ? '#10b981' : active ? '#FF8A30' : 'var(--text-3)',
                borderColor: 'var(--border-lo)',
              }}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${done ? 'bg-emerald-500' : active ? 'bg-orange' : ''}`}
                   style={!done && !active ? { background: 'var(--border)' } : {}} />
              {step}
            </div>
          )
        })}
      </div>
    </div>
  )
}
