import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const TIME_OPTIONS: { value: string; label: string }[] = []
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    const hh = String(h).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    const period = h >= 12 ? 'PM' : 'AM'
    const hour12 = h % 12 || 12
    TIME_OPTIONS.push({ value: `${hh}:${mm}`, label: `${hour12}:${mm} ${period}` })
  }
}

export function TimeSelect({
  value, onChange, disabled, className,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className ?? 'h-9'}>
        <SelectValue placeholder="--:-- --" />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {TIME_OPTIONS.map(o => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
