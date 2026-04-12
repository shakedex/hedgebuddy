import { CheckCircle, XCircle, Loader2, Clock } from 'lucide-react'

/** Render a status icon for workflow run status. */
export function StatusIcon({ status, className }: { status: string; className?: string }) {
  const size = className ?? 'size-4'
  switch (status) {
    case 'success':
      return <CheckCircle className={`${size} text-green-500 shrink-0`} />
    case 'error':
      return <XCircle className={`${size} text-destructive shrink-0`} />
    case 'running':
      return <Loader2 className={`${size} text-blue-400 animate-spin shrink-0`} />
    default:
      return <Clock className={`${size} text-muted-foreground shrink-0`} />
  }
}
