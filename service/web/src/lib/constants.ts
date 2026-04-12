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

/** Default page size for paginated lists. */
export const PAGE_SIZE = 50

/** Default refetch intervals (ms). */
export const REFETCH_INTERVALS = {
  health: 10_000,
  events: 5_000,
  workflows: 30_000,
} as const
