interface Props { current: number; max: number }

export function CharacterCounter({ current, max }: Props) {
  const over = current > max
  const close = current >= max * 0.9
  return (
    <span className={`text-xs font-mono tabular-nums ${over ? 'text-red-500 font-bold' : close ? 'text-orange' : 'text-teal'}`}>
      {current}/{max}
    </span>
  )
}
