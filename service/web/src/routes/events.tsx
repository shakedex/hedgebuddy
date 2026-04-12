import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchEventsPage, clearEvents } from '#/lib/api'
import type { EventRecord } from '#/lib/api'
import { Search, ChevronDown, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, ScrollText, Trash2 } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '#/components/ui/select'
import { ScrollArea } from '#/components/ui/scroll-area'
import { APP_COLORS, APP_BORDER_COLORS, PAGE_SIZE } from '#/lib/constants'
import { formatTime } from '#/lib/format'

function PayloadViewer({ payload }: { payload: Record<string, unknown> }) {
  return (
    <ScrollArea className="mt-2 max-h-64">
      <pre className="rounded-md bg-[#0d1117] text-emerald-300/90 p-3 text-xs font-mono border border-border/50">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </ScrollArea>
  )
}

function EventRow({ event, index }: { event: EventRecord; index: number }) {
  const [open, setOpen] = useState(false)
  const hasPayload = Object.keys(event.payload).length > 0

  return (
    <div
      className="border-b border-border last:border-0 accent-stripe-left animate-stagger-item"
      style={{
        '--stripe-color': APP_BORDER_COLORS[event.app_id] ?? 'var(--border)',
        '--index': index,
      } as React.CSSProperties}
    >
      <button
        onClick={() => hasPayload && setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-all duration-150"
        disabled={!hasPayload}
      >
        {hasPayload ? (
          open ? <ChevronDown className="size-3.5 text-muted-foreground transition-transform" /> : <ChevronRight className="size-3.5 text-muted-foreground transition-transform" />
        ) : (
          <span className="w-3.5" />
        )}
        <Badge variant="secondary" className={APP_COLORS[event.app_id] ?? ''}>
          {event.app_id}
        </Badge>
        <span className="text-sm font-medium">{event.event_name}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          #{event.id} &middot; {formatTime(event.received_at)}
        </span>
      </button>
      <div
        className="grid transition-all duration-200"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {open && (
            <div className="px-4 pb-3 pl-12">
              <PayloadViewer payload={event.payload} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function EventsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [nameFilter, setNameFilter] = useState('')
  const [appFilter, setAppFilter] = useState<string>('')

  const { data, isLoading } = useQuery({
    queryKey: ['events', page, appFilter],
    queryFn: () => fetchEventsPage({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      app: appFilter || undefined,
    }),
    refetchInterval: 5_000,
  })

  const clearMut = useMutation({
    mutationFn: clearEvents,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['events-page'] })
      setPage(0)
    },
  })

  const events = data?.events ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const filtered = nameFilter
    ? events.filter((evt) => evt.event_name.toLowerCase().includes(nameFilter.toLowerCase()))
    : events

  const knownApps = ['offshoot', 'foolcat', 'editready']

  return (
    <div className="p-6 space-y-4 animate-page-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Event Log</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{total} total event{total !== 1 ? 's' : ''}</span>
          {total > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { if (confirm('Clear all event history? This cannot be undone.')) clearMut.mutate() }}
              disabled={clearMut.isPending}
            >
              <Trash2 className="size-3.5" />
              {clearMut.isPending ? 'Clearing...' : 'Clear History'}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by event name..."
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={appFilter}
          onValueChange={(v) => { setAppFilter(v === 'all' ? '' : v); setPage(0) }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All apps" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All apps</SelectItem>
            {knownApps.map((app) => (
              <SelectItem key={app} value={app}>{app}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Event list */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading events...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <ScrollText className="mx-auto size-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">
              {total === 0
                ? 'No events received yet. Set up inject.py in your Hedge apps.'
                : 'No events match your filter.'}
            </p>
          </div>
        ) : (
          filtered.map((evt, i) => <EventRow key={evt.id} event={evt} index={i} />)
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
