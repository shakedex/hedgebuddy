/** Format an ISO timestamp for display. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString()
}

/** Human-readable duration between two ISO timestamps. */
export function formatDuration(start: string, end?: string): string {
  if (!end) return '...'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Preview-resolve template placeholders with example values.
 * Used for live preview in the editor — no actual event data.
 */
export function previewTemplate(value: string): string | null {
  if (!value.includes('{{')) return null
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const previews: Record<string, string> = {
    '{{app_id}}': 'foolcat',
    '{{event_name}}': 'foolcat.create',
    '{{event_summary}}': 'mode=report preset=Default ...',
    '{{date}}': `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    '{{time}}': `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    '{{datetime}}': now.toISOString(),
    '{{timestamp}}': String(Math.floor(now.getTime() / 1000)),
    '{{counter}}': '1',
  }
  let result = value
  for (const [k, v] of Object.entries(previews)) {
    result = result.replaceAll(k, v)
  }
  // Replace any remaining {{date:FORMAT}} with an example
  result = result.replace(/\{\{date:([^}]+)\}\}/g, (_, fmt: string) => {
    return formatDateCustom(now, fmt)
  })
  // Replace event.* with placeholder
  result = result.replace(/\{\{event\.[^}]+\}\}/g, '<event_value>')
  // If nothing changed, no preview needed
  return result === value ? null : result
}

/** Format a date using a simple format string (used for preview). */
function formatDateCustom(d: Date, fmt: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return fmt
    .replace('YYYY', String(d.getFullYear()))
    .replace('YY', String(d.getFullYear()).slice(-2))
    .replace('MM', pad(d.getMonth() + 1))
    .replace('DD', pad(d.getDate()))
    .replace('HH', pad(d.getHours()))
    .replace('mm', pad(d.getMinutes()))
    .replace('ss', pad(d.getSeconds()))
}
