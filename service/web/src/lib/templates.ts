/** Known template token labels. */
export const TEMPLATE_LABELS: Record<string, string> = {
  '{{app_id}}': 'App ID',
  '{{event_name}}': 'Event Name',
  '{{event_summary}}': 'Summary',
  '{{date}}': 'Date',
  '{{time}}': 'Time',
  '{{datetime}}': 'Datetime',
  '{{timestamp}}': 'Timestamp',
  '{{counter}}': 'Counter',
}

/** Regex matching any {{...}} token. */
export const TEMPLATE_RE = /\{\{[^}]+\}\}/g

export interface TemplateSegment {
  type: 'text' | 'template'
  value: string
}

/** Split a value string into plain text and template token segments. */
export function parseSegments(value: string): TemplateSegment[] {
  const parts: TemplateSegment[] = []
  let lastIndex = 0
  for (const match of value.matchAll(TEMPLATE_RE)) {
    const idx = match.index!
    if (idx > lastIndex) parts.push({ type: 'text', value: value.slice(lastIndex, idx) })
    parts.push({ type: 'template', value: match[0] })
    lastIndex = idx + match[0].length
  }
  if (lastIndex < value.length) parts.push({ type: 'text', value: value.slice(lastIndex) })
  return parts
}

/** Get a friendly display label for a template token. */
export function templateLabel(token: string): string {
  if (TEMPLATE_LABELS[token]) return TEMPLATE_LABELS[token]
  // {{event.X_fieldName}} → fieldName
  const eventMatch = token.match(/^\{\{event\.[^_]+_(.+)\}\}$/)
  if (eventMatch) return eventMatch[1]
  // {{date:FORMAT}} → FORMAT
  const dateMatch = token.match(/^\{\{date:(.+)\}\}$/)
  if (dateMatch) return dateMatch[1]
  return token.slice(2, -2)
}

/** Whether a string contains any template tokens. */
export function hasTemplates(value: string): boolean {
  return TEMPLATE_RE.test(value)
}
