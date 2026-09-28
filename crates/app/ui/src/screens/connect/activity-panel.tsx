import { useRef } from "react";
import { MessageSquare } from "lucide-react";
import { useActivity } from "@/api/queries";
import type { ActivityRecord } from "@/api/tools.gen";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { StatusIcon } from "@/components/app/status-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { clock, dayKey, dayLabel } from "@/lib/format";
import { outcomeKey } from "@/lib/status";

type DayGroup = { key: string; label: string; records: ActivityRecord[] };

/** `records` (already newest-first) grouped by local day — the same day headers as Runs (`run-list.tsx`). */
function groupByDay(records: ActivityRecord[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const record of records) {
    const key = dayKey(record.ts);
    const current = groups[groups.length - 1];
    if (current && current.key === key) current.records.push(record);
    else groups.push({ key, label: dayLabel(key), records: [record] });
  }
  return groups;
}

function ActivityRow({ record }: { record: ActivityRecord }) {
  return (
    // Design direction 5C, "The activity list" + review round (final): the tool column caps at 10rem instead
    // of a fixed 13rem (`minmax(0,10rem)`) so it yields room to the target first at a narrow width, rather
    // than the target losing all its space to a tool name that no longer needs 13rem; the outcome
    // (`StatusIcon label`) never wraps ("waited for your OK" is two words).
    <div className="grid h-8 grid-cols-[44px_minmax(0,10rem)_1fr_auto] items-center gap-2 px-1 max-sm:grid-cols-[40px_minmax(0,7rem)_1fr_auto]">
      <span className="readout text-xs text-muted-foreground">{clock(record.ts)}</span>
      <Mono className="min-w-0 truncate text-xs" title={record.tool}>
        {record.tool}
      </Mono>
      <Mono className="min-w-0 truncate text-xs text-muted-foreground" title={record.target ?? undefined}>
        {record.target ?? "—"}
      </Mono>
      <StatusIcon status={outcomeKey(record.outcome)} label className="shrink-0 whitespace-nowrap" />
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="flex flex-col gap-1.5 p-1" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}

/**
 * The activity panel (spec §6.6): Claude's last 200 tool calls, newest first, grouped by day, with the
 * outcome icon and word from `STATUS`. Live-updates on the `activity` data-changed category, via
 * `useActivity`'s query key (`api/events.ts`'s `useDataChanged` invalidates it app-wide).
 */
export function ActivityPanel() {
  const query = useActivity();

  // Home's own `lastError` pattern (final review, Important): without it, Retry's refetch flips `isPending`
  // back true for a query that has never had data, swapping this `ErrorPanel` for `ActivitySkeleton` and
  // dropping focus to `<body>` the moment Retry is clicked.
  const lastError = useRef<unknown>(null);
  if (query.isError) lastError.current = query.error;
  else if (query.isSuccess) lastError.current = null;
  const failed = lastError.current !== null && !query.isSuccess;

  return (
    <section className="surface flex flex-col gap-3 p-3">
      <h2 className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className="micro-label">Recent Claude activity</span>
        <span className="text-xs text-muted-foreground">tool names only, never values</span>
      </h2>

      {failed ? (
        <ErrorPanel
          error={query.error ?? lastError.current}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          title="Couldn't load recent activity"
        />
      ) : query.isPending ? (
        <ActivitySkeleton />
      ) : query.data && query.data.records.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No Claude activity yet" className="px-1 py-4">
          Set up Claude Desktop or Claude Code above, then ask Claude to do something.
        </EmptyState>
      ) : query.data ? (
        <div className="flex flex-col divide-y divide-border">
          {groupByDay(query.data.records).map((group) => (
            <div key={group.key} className="flex flex-col">
              <div className="flex h-7 items-center px-1">
                <span className="micro-label">{group.label}</span>
              </div>
              <div className="flex flex-col divide-y divide-border">
                {group.records.map((record, i) => (
                  <ActivityRow key={i} record={record} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
