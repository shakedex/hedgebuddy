import { CheckCircle, XCircle, Loader2, Clock } from 'lucide-react'

/** Render a status icon for workflow run status. */
export function StatusIcon({ status, className }: { status: string; className?: string }) {
  const size = className ?? 'size-4'
  switch (status) {
    case 'success':
      return (
        <span className="inline-flex items-center justify-center size-6 rounded-full bg-(--status-success-bg) shrink-0">
          <CheckCircle className={`${size} text-green-500`} />
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center justify-center size-6 rounded-full bg-(--status-error-bg) shrink-0">
          <XCircle className={`${size} text-destructive`} />
        </span>
      )
    case 'running':
      return (
        <span className="inline-flex items-center justify-center size-6 rounded-full bg-(--status-running-bg) shrink-0">
          <Loader2 className={`${size} text-blue-400 animate-spin`} />
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center justify-center size-6 rounded-full bg-(--status-pending-bg) shrink-0">
          <Clock className={`${size} text-muted-foreground`} />
        </span>
      )
  }
}
