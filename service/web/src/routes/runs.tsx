import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { fetchRunsPage, clearRuns } from '#/lib/api'
import type { WorkflowRun } from '#/lib/api'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, History, Trash2 } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '#/components/ui/collapsible'
import { StatusIcon } from '#/components/StatusIcon'
import { StepDetail } from '#/components/WorkflowRunHistory'
import type { StepLogEntry } from '#/components/WorkflowRunHistory'
import { formatTime, formatDuration } from '#/lib/format'
import { STATUS_STYLES, PAGE_SIZE } from '#/lib/constants'

export function RunsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['runs', page],
    queryFn: () => fetchRunsPage({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    refetchInterval: 3_000,
  })

  const clearMut = useMutation({
    mutationFn: clearRuns,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      setPage(0)
    },
  })

  const runs = data?.runs ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-6 space-y-4 animate-page-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Execution History</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{total} run(s)</span>
          {total > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { if (confirm('Clear all run history? This cannot be undone.')) clearMut.mutate() }}
              disabled={clearMut.isPending}
            >
              <Trash2 className="size-3.5" />
              {clearMut.isPending ? 'Clearing...' : 'Clear History'}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : runs.length === 0 ? (
          <div className="p-10 text-center">
            <History className="mx-auto size-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">No workflow runs yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Trigger an event or use the Test Run button in a workflow.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {runs.map((run, i) => (
              <RunRow key={run.id} run={run} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => setPage(0)} disabled={page === 0} aria-label="First page">
              <ChevronsLeft />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="px-3 text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <Button variant="outline" size="icon-sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1} aria-label="Next page">
              <ChevronRight />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} aria-label="Last page">
              <ChevronsRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function RunRow({ run, index }: { run: WorkflowRun; index: number }) {
  let stepsLog: StepLogEntry[] = []
  try {
    if (run.steps_log) stepsLog = JSON.parse(run.steps_log)
  } catch { /* ignore */ }

  const hasDetails = stepsLog.length > 0 || run.error
  const statusStyle = STATUS_STYLES[run.status] ?? STATUS_STYLES.pending

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <button
          className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-accent/30 transition-all duration-150 accent-stripe-left animate-stagger-item"
          style={{
            '--stripe-color': statusStyle.border,
            '--index': index,
          } as React.CSSProperties}
        >
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
                variant="secondary"
                className={`text-[10px] border-0 ${statusStyle.badge}`}
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
          <div
            className="px-4 pb-3 pt-1 space-y-3 border-t border-border/50"
            style={{
              background: `linear-gradient(180deg, color-mix(in oklab, ${statusStyle.border} 5%, transparent) 0%, transparent 100%)`,
            }}
          >
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
