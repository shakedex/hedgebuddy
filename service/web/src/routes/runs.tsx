import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { fetchRuns } from '#/lib/api'
import type { WorkflowRun } from '#/lib/api'
import { ChevronDown } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '#/components/ui/collapsible'
import { StatusIcon } from '#/components/StatusIcon'
import { StepDetail } from '#/components/WorkflowRunHistory'
import type { StepLogEntry } from '#/components/WorkflowRunHistory'
import { formatTime, formatDuration } from '#/lib/format'

export function RunsPage() {
  const { data: runs, isLoading } = useQuery({
    queryKey: ['runs'],
    queryFn: () => fetchRuns(100),
    refetchInterval: 3_000,
  })

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Execution History</h1>
        <span className="text-sm text-muted-foreground">{runs?.length ?? 0} run(s)</span>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : !runs || runs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No workflow runs yet. Trigger an event or use the Test Run button in a workflow.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RunRow({ run }: { run: WorkflowRun }) {
  let stepsLog: StepLogEntry[] = []
  try {
    if (run.steps_log) stepsLog = JSON.parse(run.steps_log)
  } catch { /* ignore */ }

  const hasDetails = stepsLog.length > 0 || run.error

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-accent/30 transition-colors">
          <StatusIcon status={run.status} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Link
                to="/workflows/$id"
                params={{ id: run.workflow_id }}
                className="text-sm font-medium hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {run.workflow_name}
              </Link>
              <Badge
                variant={run.status === 'success' ? 'secondary' : run.status === 'error' ? 'destructive' : 'outline'}
                className="text-[10px]"
              >
                {run.status}
              </Badge>
              {stepsLog.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {stepsLog.filter((s) => s.status === 'success').length}/{stepsLog.length} steps
                </span>
              )}
            </div>
            {run.error && (
              <p className="text-xs text-destructive truncate mt-0.5">{run.error}</p>
            )}
          </div>
          <div className="text-right shrink-0 flex items-center gap-2">
            <div>
              <p className="text-xs text-muted-foreground">{formatTime(run.started_at)}</p>
              <p className="text-[10px] text-muted-foreground">{formatDuration(run.started_at, run.finished_at)}</p>
            </div>
            {hasDetails && <ChevronDown className="size-3.5 text-muted-foreground transition-transform in-data-[state=open]:rotate-180" />}
          </div>
        </button>
      </CollapsibleTrigger>
      {hasDetails && (
        <CollapsibleContent>
          <div className="px-4 pb-3 pt-1 space-y-3 border-t border-border/50 bg-muted/20">
            {run.error && (
              <div className="text-xs text-destructive bg-destructive/5 rounded p-2 font-mono whitespace-pre-wrap">
                {run.error}
              </div>
            )}
            {stepsLog.map((entry, i) => (
              <StepDetail key={i} entry={entry} />
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}
