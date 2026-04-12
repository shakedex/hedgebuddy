import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { fetchEventsPage, fetchWorkflows, fetchHealth, setEngaged } from '#/lib/api'
import type { EventRecord } from '#/lib/api'
import { GitBranch, ScrollText, ArrowRight, ShieldCheck, ShieldOff } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Switch } from '#/components/ui/switch'
import { APP_COLORS, APP_BORDER_COLORS, STAT_CARD_CONFIG } from '#/lib/constants'
import { formatTime } from '#/lib/format'

export function DashboardPage() {
  const queryClient = useQueryClient()
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 10_000 })
  const eventsPage = useQuery({ queryKey: ['events-page'], queryFn: () => fetchEventsPage({ limit: 10 }), refetchInterval: 5_000 })
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: fetchWorkflows })

  const engaged = health.data?.engaged ?? true

  const engagedMut = useMutation({
    mutationFn: (on: boolean) => setEngaged(on),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
    },
  })

  const recentEvents = eventsPage.data?.events ?? []
  const totalEvents = eventsPage.data?.total ?? 0
  const activeWorkflows = (workflows.data ?? []).filter((w) => w.enabled)

  const stats = [
    { icon: ScrollText, label: 'Recent Events', value: totalEvents, config: STAT_CARD_CONFIG[0] },
    { icon: GitBranch, label: 'Active Workflows', value: activeWorkflows.length, config: STAT_CARD_CONFIG[1] },
  ]

  return (
    <div className="p-6 space-y-6 animate-page-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      </div>

      {/* Engaged / Maintenance banner */}
      <div
        className={`rounded-lg border p-4 flex items-center gap-4 transition-all duration-300 accent-stripe-left ${
          engaged
            ? 'border-green-500/30 bg-green-500/5'
            : 'border-amber-500/30 bg-amber-500/5'
        }`}
        style={{ '--stripe-color': engaged ? 'var(--status-success)' : 'var(--status-warning, #f59e0b)' } as React.CSSProperties}
      >
        {engaged ? (
          <ShieldCheck className="size-8 text-green-500 shrink-0" />
        ) : (
          <ShieldOff className="size-8 text-amber-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {engaged ? 'Quills Engaged' : 'Maintenance Mode'}
          </p>
          <p className="text-xs text-muted-foreground">
            {engaged
              ? 'Workflows are actively executing when events arrive.'
              : 'Events are still recorded but no workflows will execute. Toggle back to resume.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{engaged ? 'Active' : 'Paused'}</span>
          <Switch
            checked={engaged}
            onCheckedChange={(on) => engagedMut.mutate(on)}
            disabled={engagedMut.isPending}
          />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {stats.map(({ icon: Icon, label, value, config }) => (
          <div
            key={config.key}
            className="accent-stripe-left rounded-lg border border-border bg-card p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
            style={{ '--stripe-color': config.color } as React.CSSProperties}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex size-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: config.bg }}
              >
                <Icon className="size-5" style={{ color: config.color }} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-3xl font-extrabold tracking-tight">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent events */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Recent Events</h2>
          <Link to="/events" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            View all <ArrowRight className="size-3" />
          </Link>
        </div>
        {recentEvents.length === 0 ? (
          <div className="p-10 text-center">
            <ScrollText className="mx-auto size-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">No events received yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Set up inject.py in your Hedge apps to start receiving events.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentEvents.slice(0, 5).map((evt: EventRecord, i: number) => (
              <div
                key={evt.id}
                className="flex items-center gap-3 px-4 py-3 transition-all duration-150 hover:bg-muted/30 accent-stripe-left animate-stagger-item"
                style={{
                  '--stripe-color': APP_BORDER_COLORS[evt.app_id] ?? 'var(--border)',
                  '--index': i,
                } as React.CSSProperties}
              >
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
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Active Workflows</h2>
          <Link to="/workflows" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Manage <ArrowRight className="size-3" />
          </Link>
        </div>
        {activeWorkflows.length === 0 ? (
          <div className="p-10 text-center">
            <GitBranch className="mx-auto size-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">No active workflows.</p>
            <Link to="/workflows" className="text-xs text-(--lagoon) hover:underline mt-1 inline-block">
              Create one
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activeWorkflows.map((wf, i) => (
              <div
                key={wf.id}
                className="flex items-center gap-3 px-4 py-3 transition-all duration-150 hover:bg-muted/30 accent-stripe-left animate-stagger-item"
                style={{
                  '--stripe-color': 'var(--status-success)',
                  '--index': i,
                } as React.CSSProperties}
              >
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
