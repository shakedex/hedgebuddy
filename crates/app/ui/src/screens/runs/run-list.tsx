import { useRef, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { CircleCheck, History, Search, SearchX } from "lucide-react";
import { Link } from "wouter";
import type { ListRunsOutput, Run } from "@/api/tools.gen";
import { CountBadge } from "@/components/app/count-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { StatusIcon } from "@/components/app/status-icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useListKeyboard } from "@/hooks/use-list-keyboard";
import { clock, dayKey, dayLabel, duration } from "@/lib/format";
import { runStatusKey } from "@/lib/status";
import { cn } from "@/lib/utils";

type Mode = "all" | "failed";

const isFailedRun = (run: Run) => run.status === "failed" || run.status === "error";

/** Case-insensitive match against the fields the toolbar's filter promises to search (spec: script, event, app, profile). */
function matchesFilter(run: Run, q: string): boolean {
  return (
    run.script.toLowerCase().includes(q) ||
    (run.event?.toLowerCase().includes(q) ?? false) ||
    (run.app?.toLowerCase().includes(q) ?? false) ||
    run.profile.toLowerCase().includes(q)
  );
}

/** Line 2 of a row: event, then an outcome clause, then the profile when it isn't the active one. */
function metaLine(run: Run, activeProfile: string | null): string {
  const bits = [run.event ?? "no event"];
  if (isFailedRun(run)) bits.push(`exit ${run.exit_code}`);
  else if (run.status === "ok") bits.push(duration(run.started_at, run.ended_at) ?? "");
  else bits.push("unfinished");
  if (run.profile !== activeProfile) bits.push(run.profile);
  return bits.join(" · ");
}

function RunRow({ run, selected, activeProfile }: { run: Run; selected: boolean; activeProfile: string | null }) {
  return (
    <Link
      href={`/runs/${encodeURIComponent(run.run_id)}`}
      id={`run-${run.run_id}`}
      role="option"
      aria-selected={selected}
      className={cn(
        "flex flex-col gap-0.5 border-l-2 px-2.5 py-1.5 transition-colors duration-120",
        selected ? "border-l-primary bg-accent" : "border-l-transparent hover:bg-accent/50",
      )}
    >
      <span className="flex items-center gap-1.5">
        <StatusIcon status={runStatusKey(run.status)} />
        <Mono className="min-w-0 flex-1 truncate text-sm" title={run.script}>
          {run.script}
        </Mono>
        <span className="readout shrink-0 text-xs text-muted-foreground">{clock(run.started_at)}</span>
      </span>
      <span className="truncate pl-[21px] text-xs text-muted-foreground">{metaLine(run, activeProfile)}</span>
    </Link>
  );
}

function SinceDivider() {
  return (
    <div role="separator" aria-label="since you last opened" className="flex h-6 items-center gap-2 px-2">
      <span className="micro-label shrink-0">Since you last opened</span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}

function RunListSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 p-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-9 shrink-0" />
      ))}
    </div>
  );
}

/**
 * Runs list (spec §6.2): a toolbar (All/Failed, a filter, and an "All profiles" switch when there is an
 * active profile) over runs grouped by local day, newest first, with a "since you last opened" divider.
 */
export function RunList({
  query,
  selectedId,
  activeProfile,
  since,
  allProfiles,
  onAllProfilesChange,
  onSelect,
}: {
  query: UseQueryResult<ListRunsOutput>;
  selectedId: string | null;
  activeProfile: string | null;
  since: string | null;
  allProfiles: boolean;
  onAllProfilesChange: (allProfiles: boolean) => void;
  onSelect: (id: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("all");
  const [filterText, setFilterText] = useState("");

  // See HomeScreen: keeps the *last* error across the "pending" flicker a retry causes, so Retry-in-flight
  // doesn't get mistaken for a fresh first load.
  const lastError = useRef<unknown>(null);
  if (query.isError) lastError.current = query.error;
  else if (query.isSuccess) lastError.current = null;

  const allRuns = query.data?.runs ?? [];
  const failedCount = allRuns.filter(isFailedRun).length;
  const modeRuns = mode === "failed" ? allRuns.filter(isFailedRun) : allRuns;
  const q = filterText.trim().toLowerCase();
  const displayed = q === "" ? modeRuns : modeRuns.filter((run) => matchesFilter(run, q));
  const ids = displayed.map((run) => run.run_id);
  const onKeyDown = useListKeyboard(ids, selectedId, onSelect);

  if (lastError.current !== null && !query.isSuccess) {
    return (
      <div className="flex h-full flex-col">
        <div className="p-3">
          <ErrorPanel error={query.error ?? lastError.current} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        </div>
      </div>
    );
  }

  // Newest-first day boundaries: `since` splits the (already newest-first) `displayed` list into the runs
  // after it and the runs at or before it. The divider goes right before the first "at or before" run, but
  // only when the list actually holds one on each side of the cutoff.
  const dividerBeforeIndex = since ? displayed.findIndex((run) => !(run.started_at > since)) : -1;
  const showDivider = dividerBeforeIndex > 0 && dividerBeforeIndex < displayed.length;

  const rows: React.ReactNode[] = [];
  let lastDayKey = "";
  displayed.forEach((run, i) => {
    if (showDivider && i === dividerBeforeIndex) rows.push(<SinceDivider key="since-divider" />);
    const key = dayKey(run.started_at);
    if (key !== lastDayKey) {
      lastDayKey = key;
      let count = 0;
      for (let j = i; j < displayed.length && dayKey(displayed[j].started_at) === key; j++) count++;
      rows.push(
        <div key={`head-${key}`} className="sticky top-0 z-10 flex h-7 items-center justify-between bg-background/95 px-2 backdrop-blur-[2px]">
          <span className="micro-label">{dayLabel(key)}</span>
          <span className="readout text-xs text-muted-foreground">{count}</span>
        </div>,
      );
    }
    rows.push(<RunRow key={run.run_id} run={run} selected={run.run_id === selectedId} activeProfile={activeProfile} />);
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5 max-[479px]:flex-wrap">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={mode}
          onValueChange={(v) => v && setMode(v as Mode)}
          className="shrink-0"
        >
          <ToggleGroupItem value="all" aria-label="All runs">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="failed" aria-label="Failed runs" className="gap-1.5">
            Failed
            <CountBadge count={failedCount} tone="destructive" />
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="relative min-w-0 flex-1 max-[479px]:order-3 max-[479px]:basis-full max-[479px]:pt-1.5">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
          <Input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter runs"
            aria-label="Filter runs"
            className="h-7 pl-7"
          />
        </div>
        {activeProfile && (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground max-[479px]:order-2">
            <Switch size="sm" checked={allProfiles} onCheckedChange={onAllProfilesChange} />
            All profiles
          </label>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isPending && lastError.current === null ? (
          <RunListSkeleton />
        ) : allRuns.length === 0 ? (
          <EmptyState icon={History} title="No runs yet" className="px-3 py-6">
            Each time a Hedge app fires an event, its attached script records a run here.
          </EmptyState>
        ) : mode === "failed" && failedCount === 0 ? (
          <EmptyState icon={CircleCheck} title="No failed runs" className="px-3 py-6">
            Everything that ran in the last 30 days succeeded.
          </EmptyState>
        ) : displayed.length === 0 ? (
          <EmptyState icon={SearchX} title={`No runs match “${filterText}”`} className="px-3 py-6" />
        ) : (
          <div
            role="listbox"
            aria-label="Runs"
            tabIndex={0}
            aria-activedescendant={selectedId ? `run-${selectedId}` : undefined}
            onKeyDown={onKeyDown}
            className="focus-visible:outline-offset-[-2px]"
          >
            {rows}
          </div>
        )}
      </div>
    </div>
  );
}
