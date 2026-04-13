import { useQuery } from '@tanstack/react-query'
import { fetchWorkflowRuns } from '#/lib/api'
import type { WorkflowRun } from '#/lib/api'
import { Badge } from '#/components/ui/badge'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '#/components/ui/collapsible'
import { ChevronDown, CheckCircle, XCircle } from 'lucide-react'
import { StatusIcon } from '#/components/StatusIcon'
import { formatTime, formatDuration } from '#/lib/format'

export interface StepLogEntry {
  step: number
  quill: string
  status: string
  error?: string
  inputs?: Record<string, string>
  output?: unknown
}

export function WorkflowRunHistory({ workflowId }: { workflowId: string }) {
  const { data: runs } = useQuery({
    queryKey: ['workflow-runs', workflowId],
    queryFn: () => fetchWorkflowRuns(workflowId),
    refetchInterval: 3_000,
  })

  if (!runs || runs.length === 0) return null

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Recent Runs</h2>
      </div>
      <div className="divide-y divide-border">
        {runs.slice(0, 10).map((run) => (
          <ExpandableRunRow key={run.id} run={run} />
        ))}
      </div>
    </div>
  )
}

function ExpandableRunRow({ run }: { run: WorkflowRun }) {
  let stepsLog: StepLogEntry[] = []
  try {
    if (run.steps_log) stepsLog = JSON.parse(run.steps_log)
  } catch { /* ignore */ }

  const hasDetails = stepsLog.length > 0 || run.error

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-accent/30 transition-colors">
          <StatusIcon status={run.status} />
          <Badge
            variant={run.status === 'success' ? 'secondary' : run.status === 'error' ? 'destructive' : 'outline'}
            className="text-[10px] w-16 justify-center shrink-0"
          >
            {run.status}
          </Badge>
          <span className="text-xs text-muted-foreground flex-1 truncate">
            {formatTime(run.started_at)}
          </span>
          {run.error && (
            <span className="text-xs text-destructive truncate max-w-50">{run.error}</span>
          )}
          {run.finished_at && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatDuration(run.started_at, run.finished_at)}
            </span>
          )}
          {hasDetails && (
            <ChevronDown className="size-3.5 text-muted-foreground shrink-0 transition-transform in-data-[state=open]:rotate-180" />
          )}
        </button>
      </CollapsibleTrigger>
      {hasDetails && (
        <CollapsibleContent>
          <div className="px-4 pb-3 pt-1 space-y-3 border-t border-border/50 bg-muted/20">
            {/* Top-level error */}
            {run.error && (
              <div className="text-xs text-destructive bg-destructive/5 rounded p-2 font-mono whitespace-pre-wrap">
                {run.error}
              </div>
            )}
            {/* Step details */}
            {stepsLog.map((entry, i) => (
              <StepDetail key={i} entry={entry} />
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

export function StepDetail({ entry }: { entry: StepLogEntry }) {
  const hasInputs = entry.inputs && Object.keys(entry.inputs).length > 0
  const hasOutput = entry.output != null

  return (
    <div className="rounded border border-border/50 bg-background/50 overflow-hidden">
      {/* Step header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30">
        {entry.status === 'success'
          ? <CheckCircle className="size-3 text-green-500 shrink-0" />
          : <XCircle className="size-3 text-destructive shrink-0" />
        }
        <span className="font-mono text-[10px] text-muted-foreground">{entry.step + 1}.</span>
        <span className="text-xs font-medium">{entry.quill}</span>
        {entry.error && (
          <span className="text-[10px] text-destructive truncate ml-auto">{entry.error}</span>
        )}
      </div>

      {/* Inputs */}
      {hasInputs && (
        <div className="px-3 py-1.5 border-t border-border/30">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Inputs</p>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {Object.entries(entry.inputs!).map(([key, val]) => (
              <KeyValue key={key} k={key} v={val} />
            ))}
          </div>
        </div>
      )}

      {/* Output */}
      {hasOutput && (
        <div className="px-3 py-1.5 border-t border-border/30">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Output</p>
          <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-24 overflow-auto">
            {typeof entry.output === 'string' ? entry.output : JSON.stringify(entry.output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span className="text-[10px] font-mono text-muted-foreground truncate" title={k}>{k}</span>
      <span className="text-[10px] font-mono break-all" title={v}>{v || <em className="text-muted-foreground/50">(empty)</em>}</span>
    </>
  )
}
