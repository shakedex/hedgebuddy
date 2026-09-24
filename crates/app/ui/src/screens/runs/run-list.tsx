import { useEffect, useRef } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { CircleCheck, History, Search, SearchX } from "lucide-react";
import { Link } from "wouter";
import type { ListRunsOutput, Run } from "@/api/tools.gen";
import { CountBadge } from "@/components/app/count-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { StatusIcon } from "@/components/app/status-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useListKeyboard } from "@/hooks/use-list-keyboard";
import { clock, dayKey, dayLabel, duration } from "@/lib/format";
import { isFailedRun, runStatusKey } from "@/lib/status";
import { cn } from "@/lib/utils";

/** The list's All/Failed toggle. */
export type RunMode = "all" | "failed";

/** A run row's DOM id: what the listbox's `aria-activedescendant` names and keyboard moves scroll to. */
const rowId = (runId: string) => `run-${runId}`;

/** Case-insensitive match against the fields the toolbar's filter promises to search (spec: script, event, app, profile). */
function matchesFilter(run: Run, q: string): boolean {
  return (
    run.script.toLowerCase().includes(q) ||
    (run.event?.toLowerCase().includes(q) ?? false) ||
    (run.app?.toLowerCase().includes(q) ?? false) ||
    run.profile.toLowerCase().includes(q)
  );
}

/** The runs the list shows: `runs` narrowed by the All/Failed toggle, then by the filter text. */
export function visibleRuns(runs: Run[], mode: RunMode, filterText: string): Run[] {
  const modeRuns = mode === "failed" ? runs.filter(isFailedRun) : runs;
  const q = filterText.trim().toLowerCase();
  return q === "" ? modeRuns : modeRuns.filter((run) => matchesFilter(run, q));
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
      id={rowId(run.run_id)}
      role="option"
      aria-selected={selected}
      // The listbox itself owns keyboard focus (aria-activedescendant); rows are click targets only, so
      // they don't each become their own Tab stop (spec §7's "arrow keys move through lists" means the
      // listbox, not 14+ individual link stops).
      tabIndex={-1}
      className={cn(
        // scroll-mt-7 keeps a row clear of the 28 px sticky day header when scrollIntoView brings it into view.
        "flex scroll-mt-7 flex-col gap-0.5 border-l-2 px-2.5 py-1 transition-colors duration-120",
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
      <span className="truncate pl-5 text-xs text-muted-foreground">{metaLine(run, activeProfile)}</span>
    </Link>
  );
}

/** Caps the newer runs above it (a primary-tinted rule, label trailing) — deliberately unlike a day header, which introduces the runs below it. */
function SinceDivider() {
  return (
    <div role="separator" aria-label="since you last opened" className="flex h-6 items-center gap-2 px-2">
      <span aria-hidden className="h-px flex-1 bg-primary/50" />
      <span className="micro-label shrink-0">Since you last opened</span>
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

type GroupItem = { kind: "row"; run: Run } | { kind: "divider" };
type DayGroup = { key: string; label: string; count: number; items: GroupItem[] };

/**
 * `displayed` (already newest-first) grouped by local day, with a "since you last opened" divider spliced
 * in right after the last run newer than `since` — wherever that row landed, even mid-group.
 */
function buildGroups(displayed: Run[], since: string | null): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const run of displayed) {
    const key = dayKey(run.started_at);
    const current = groups[groups.length - 1];
    const group = current && current.key === key ? current : { key, label: dayLabel(key), count: 0, items: [] };
    if (group !== current) groups.push(group);
    group.items.push({ kind: "row", run });
    group.count++;
  }
  if (since) {
    const idx = displayed.findIndex((run) => !(run.started_at > since));
    if (idx > 0 && idx < displayed.length) {
      const dividerAfterId = displayed[idx - 1].run_id;
      for (const group of groups) {
        const pos = group.items.findIndex((item) => item.kind === "row" && item.run.run_id === dividerAfterId);
        if (pos === -1) continue;
        group.items.splice(pos + 1, 0, { kind: "divider" });
        break;
      }
    }
  }
  return groups;
}

/**
 * Runs list (spec §6.2): a toolbar (All/Failed, a filter, and an "All profiles" switch when there is an
 * active profile) over runs grouped by local day, newest first, with a "since you last opened" divider.
 * The screen owns the toggle and filter state and hands in `displayed`, so it can tell when the detail pane
 * has nothing to point at. Every empty state names its scope: the active profile's runs, or every profile's.
 */
export function RunList({
  query,
  displayed,
  mode,
  onModeChange,
  filterText,
  onFilterTextChange,
  selectedId,
  activeProfile,
  since,
  allProfiles,
  onAllProfilesChange,
  onSelect,
}: {
  query: UseQueryResult<ListRunsOutput>;
  /** `visibleRuns(query's runs, mode, filterText)`. */
  displayed: Run[];
  mode: RunMode;
  onModeChange: (mode: RunMode) => void;
  filterText: string;
  onFilterTextChange: (text: string) => void;
  selectedId: string | null;
  activeProfile: string | null;
  since: string | null;
  allProfiles: boolean;
  onAllProfilesChange: (allProfiles: boolean) => void;
  onSelect: (id: string) => void;
}) {
  const allProfilesSwitch = useRef<HTMLButtonElement>(null);

  // See HomeScreen: keeps the *last* error across the "pending" flicker a retry causes, so Retry-in-flight
  // doesn't get mistaken for a fresh first load.
  const lastError = useRef<unknown>(null);
  if (query.isError) lastError.current = query.error;
  else if (query.isSuccess) lastError.current = null;

  const allRuns = query.data?.runs ?? [];
  const failedCount = allRuns.filter(isFailedRun).length;
  const ids = displayed.map((run) => run.run_id);
  const onKeyDown = useListKeyboard(ids, selectedId, onSelect, rowId);
  // A selection that is not in the list (another profile's run with All profiles off, or one the filter
  // hides) is not announced: `aria-activedescendant` must name an element that exists.
  const listedSelection = selectedId !== null && ids.includes(selectedId) ? selectedId : null;

  // Bring a selection that arrives from outside the list (a link from Home, or the list widening to every
  // profile) into view once. Keyboard moves scroll for themselves.
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (listedSelection === null || scrolledTo.current === listedSelection) return;
    scrolledTo.current = listedSelection;
    document.getElementById(rowId(listedSelection))?.scrollIntoView({ block: "nearest" });
  }, [listedSelection]);

  if (lastError.current !== null && !query.isSuccess) {
    return (
      <div className="flex h-full flex-col">
        <div className="p-3">
          <ErrorPanel error={query.error ?? lastError.current} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        </div>
      </div>
    );
  }

  const groups = buildGroups(displayed, since);
  const scoped = activeProfile !== null && !allProfiles;
  const profileName = scoped ? <Mono>{activeProfile}</Mono> : null;
  const showAllProfiles = scoped ? (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        onAllProfilesChange(true);
        // This button goes away with the empty state; the switch it just flipped is where focus belongs.
        allProfilesSwitch.current?.focus();
      }}
    >
      Show all profiles
    </Button>
  ) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={mode}
          onValueChange={(v) => v && onModeChange(v as RunMode)}
          className="shrink-0"
        >
          <ToggleGroupItem value="all" aria-label="All runs">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="failed" aria-label={`Failed, ${failedCount} run${failedCount === 1 ? "" : "s"}`} className="gap-1.5">
            Failed
            <CountBadge count={failedCount} tone="destructive" />
          </ToggleGroupItem>
        </ToggleGroup>
        {activeProfile && (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Switch ref={allProfilesSwitch} size="sm" checked={allProfiles} onCheckedChange={onAllProfilesChange} />
            All profiles
          </label>
        )}
        {/* min-w-40 (160 px) + flex-1 + the row's flex-wrap: plain flexbox wraps this onto its own line
            whenever the toggle and switch don't leave it at least 160 px, with no hardcoded breakpoint. */}
        <div className="relative min-w-40 flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
          <Input
            value={filterText}
            onChange={(e) => onFilterTextChange(e.target.value)}
            placeholder="Filter runs"
            aria-label="Filter runs"
            className="h-7 pl-7"
          />
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {query.isPending && lastError.current === null ? (
          <RunListSkeleton />
        ) : allRuns.length === 0 ? (
          <EmptyState
            icon={History}
            title={scoped ? <>No runs in {profileName}</> : "No runs yet"}
            className="px-3 py-6"
            action={showAllProfiles}
          >
            Each time a Hedge app fires an event, its attached script records a run here.
          </EmptyState>
        ) : mode === "failed" && failedCount === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title={scoped ? <>No failed runs in {profileName}</> : activeProfile ? "No failed runs in any profile" : "No failed runs"}
            className="px-3 py-6"
            action={showAllProfiles}
          >
            {scoped ? "Everything this profile ran in the last 30 days succeeded." : "Everything that ran in the last 30 days succeeded."}
          </EmptyState>
        ) : displayed.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={`No ${mode === "failed" ? "failed runs match" : "runs match"} “${filterText.trim()}”`}
            className="px-3 py-6"
            action={showAllProfiles}
          >
            {scoped ? <>Only runs in {profileName} were searched.</> : activeProfile ? "Every profile's runs were searched." : undefined}
          </EmptyState>
        ) : (
          <div
            role="listbox"
            aria-label="Runs"
            tabIndex={0}
            aria-activedescendant={listedSelection !== null ? rowId(listedSelection) : undefined}
            onKeyDown={onKeyDown}
            className="focus-visible:outline-offset-[-2px]"
          >
            {groups.map((group) => (
              <div key={group.key} role="group" aria-labelledby={`day-${group.key}`}>
                <div className="sticky top-0 z-10 flex h-7 items-center justify-between bg-background/95 px-2 backdrop-blur-[2px]">
                  <span id={`day-${group.key}`} className="micro-label">
                    {group.label}
                  </span>
                  <span className="readout text-xs text-muted-foreground">{group.count}</span>
                </div>
                {group.items.map((item) =>
                  item.kind === "divider" ? (
                    <SinceDivider key="since-divider" />
                  ) : (
                    <RunRow key={item.run.run_id} run={item.run} selected={item.run.run_id === listedSelection} activeProfile={activeProfile} />
                  ),
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
