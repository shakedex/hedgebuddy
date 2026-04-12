/** Category labels for quills and actions. */
export const CATEGORY_LABELS: Record<string, string> = {
  file: 'File Operations',
  http: 'HTTP',
  logging: 'Logging',
  logic: 'Logic',
  offshoot: 'OffShoot',
  foolcat: 'FoolCat',
  editready: 'EditReady',
  delay: 'Delay',
  integration: 'Integration',
  messaging: 'Messaging',
}

/** App-specific badge color classes. */
export const APP_COLORS: Record<string, string> = {
  offshoot: 'bg-blue-500/10 text-blue-400',
  foolcat: 'bg-amber-500/10 text-amber-400',
  editready: 'bg-purple-500/10 text-purple-400',
}

/** App-specific left-border accent color (CSS var value). */
export const APP_BORDER_COLORS: Record<string, string> = {
  offshoot: 'var(--app-offshoot)',
  foolcat: 'var(--app-foolcat)',
  editready: 'var(--app-editready)',
}

/** Status-specific left-border color and badge classes. */
export const STATUS_STYLES: Record<string, { border: string; badge: string }> = {
  success: { border: 'var(--status-success)', badge: 'bg-emerald-500/15 text-emerald-400' },
  error: { border: 'var(--status-error)', badge: 'bg-red-500/12 text-red-400' },
  running: { border: 'var(--status-running)', badge: 'bg-blue-500/12 text-blue-400' },
  pending: { border: 'var(--status-pending)', badge: 'bg-gray-500/12 text-gray-400' },
}

/** Dashboard stat card visual config. */
export const STAT_CARD_CONFIG = [
  { key: 'events', color: 'var(--stat-events)', bg: 'var(--stat-events-bg)' },
  { key: 'workflows', color: 'var(--stat-workflows)', bg: 'var(--stat-workflows-bg)' },
  { key: 'apps', color: 'var(--stat-apps)', bg: 'var(--stat-apps-bg)' },
] as const

/** Default page size for paginated lists. */
export const PAGE_SIZE = 50

/** Default refetch intervals (ms). */
export const REFETCH_INTERVALS = {
  health: 10_000,
  events: 5_000,
  workflows: 30_000,
} as const
