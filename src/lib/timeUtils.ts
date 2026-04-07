/** Calculate hours between two HH:MM time strings. Returns null if either is empty. */
export function calcHours(start: string, end: string): number | null {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMins = sh * 60 + sm
  let endMins = eh * 60 + em
  if (endMins < startMins) endMins += 24 * 60 // overnight
  const diff = (endMins - startMins) / 60
  return Math.round(diff * 100) / 100
}

export function formatTime(t: string | null): string {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}
