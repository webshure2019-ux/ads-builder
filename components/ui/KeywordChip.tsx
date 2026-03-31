import { Keyword, MatchType } from '@/types'

interface Props {
  keyword: Keyword
  onToggleSelect: (text: string) => void
  onToggleMatchType: (text: string, matchType: MatchType) => void
}

const MATCH_STYLES: Record<MatchType, string> = {
  exact: 'bg-[#e0f7fa] border-teal text-teal',
  phrase: 'bg-[#fff3e0] border-orange text-orange',
  broad: 'bg-cloud border-navy/30 text-navy',
}

const NEXT_MATCH: Record<MatchType, MatchType> = {
  exact: 'phrase', phrase: 'broad', broad: 'exact',
}

export function KeywordChip({ keyword, onToggleSelect, onToggleMatchType }: Props) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs cursor-pointer select-none transition-opacity ${MATCH_STYLES[keyword.match_type]} ${keyword.selected ? 'opacity-100' : 'opacity-40'}`}
      onClick={() => onToggleSelect(keyword.text)}
    >
      <span className="font-semibold">{keyword.text}</span>
      {keyword.volume && (
        <span className="opacity-60">{keyword.volume.toLocaleString()}/mo</span>
      )}
      <button
        className="ml-1 font-bold opacity-70 hover:opacity-100 text-[10px] uppercase"
        onClick={e => { e.stopPropagation(); onToggleMatchType(keyword.text, NEXT_MATCH[keyword.match_type]) }}
        title="Toggle match type"
      >
        {keyword.match_type === 'exact' ? '[e]' : keyword.match_type === 'phrase' ? '"p"' : 'b'}
      </button>
    </div>
  )
}
