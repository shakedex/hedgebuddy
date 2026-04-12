import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { fetchEventsPage, fetchWorkflows, fetchHealth } from '#/lib/api'
import type { EventRecord } from '#/lib/api'
import { Activity, GitBranch, ScrollText, CheckCircle, XCircle, ArrowRight } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { APP_COLORS } from '#/lib/constants'
import { formatTime } from '#/lib/format'

export function DashboardPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 10_000 })
  const eventsPage = useQuery({ queryKey: ['events-page'], queryFn: () => fetchEventsPage({ limit: 10 }), refetchInterval: 5_000 })
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: fetchWorkflows })

  const recentEvents = eventsPage.data?.events ?? []
  const totalEvents = eventsPage.data?.total ?? 0
  const activeWorkflows = (workflows.data ?? []).filter((w) => w.enabled)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2 text-sm">
          {health.data?.status === 'ok' ? (
            <>
              <CheckCircle className="size-4 text-green-500" />
              <span className="text-muted-foreground">Service running</span>
            </>
          ) : (
            <>
              <XCircle className="size-4 text-destructive" />
              <span className="text-muted-foreground">Service unavailable</span>
            </>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ScrollText className="size-4" />
            Recent Events
          </div>
          <p className="mt-1 text-2xl font-bold">{totalEvents}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="size-4" />
            Active Workflows
          </div>
          <p className="mt-1 text-2xl font-bold">{activeWorkflows.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="size-4" />
            Apps Connected
          </div>
          <p className="mt-1 text-2xl font-bold">
            {new Set(recentEvents.map((e: EventRecord) => e.app_id)).size}
          </p>
        </div>
      </div>

      {/* Recent events */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Recent Events</h2>
          <Link to="/events" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            View all <ArrowRight className="size-3" />
          </Link>
        </div>
        {recentEvents.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No events received yet. Set up inject.py in your Hedge apps to start receiving events.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentEvents.slice(0, 5).map((evt: EventRecord) => (
              <div key={evt.id} className="flex items-center gap-3 px-4 py-3">
                <Badge variant="secondary" className={APP_COLORS[evt.app_id] ?? ''}>
                  {evt.app_id}
                </Badge>
                <span className="text-sm font-medium">{evt.event_name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatTime(evt.received_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active workflows */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Active Workflows</h2>
          <Link to="/workflows" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Manage <ArrowRight className="size-3" />
          </Link>
        </div>
        {activeWorkflows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No active workflows.{' '}
            <Link to="/workflows" className="text-(--lagoon) hover:underline">
              Create one
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activeWorkflows.map((wf) => (
              <div key={wf.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm font-medium">{wf.name}</span>
                <span className="text-xs text-muted-foreground">
                  on {wf.trigger.event_type}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {(wf.steps ?? []).length} step(s)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
