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
    <div className="bg-white border border-cloud rounded-2xl p-4">
      <h3 className="font-heading font-bold text-sm text-navy mb-3">Campaign Progress</h3>
      <div className="space-y-0.5">
        {STEPS.map((step, i) => {
          const done = i < currentStep
          const active = i === currentStep
          return (
            <div key={step} className={`flex items-center gap-2 py-1.5 text-sm border-b border-mist last:border-0 ${done ? 'text-emerald-600' : active ? 'text-orange font-semibold' : 'text-teal'}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${done ? 'bg-emerald-500' : active ? 'bg-orange' : 'bg-cloud'}`} />
              {step}
            </div>
          )
        })}
      </div>
    </div>
  )
}
