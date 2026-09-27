import type { UseQueryResult } from "@tanstack/react-query";
import { AppWindow, RotateCw } from "lucide-react";
import { Link } from "wouter";
import { invalidateHedgeState } from "@/api/queries";
import type { AppRow, AppsOverviewOutput, Os } from "@/api/tools.gen";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorPanel } from "@/components/app/error-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useListKeyboard } from "@/hooks/use-list-keyboard";
import { plural } from "@/lib/format";
import { STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";

/** A row's DOM id, under the `app-` prefix `useListKeyboard` expects. */
const rowId = (id: string) => `app-${id}`;

/** `"26.1 (1023)"` → `"26.1"`: the list row keeps only the version, not its build number (matches the mockup
 *  and the design direction's own `versionBefore`, kept local here since this is the only file it touches). */
function shortVersion(version: string): string {
  const i = version.indexOf(" (");
  return i === -1 ? version : version.slice(0, i);
}

/** The row's second line (spec §6.5 step 1: "omit zero parts"). `attached` is only a profile script; the
 *  operator's own file is its own part (review round 1: "N attached" must not count it). */
function subtitleFor(row: AppRow, os: Os): string {
  if (!row.available_here) return os === "windows" ? "macOS only" : "Windows only";
  if (!row.status.installed) return "not installed";
  const parts: string[] = [];
  if (row.status.version) parts.push(shortVersion(row.status.version));
  if (row.attached > 0) parts.push(`${row.attached} attached`);
  if (row.external > 0) parts.push(`${row.external} ${plural(row.external, "own file")}`);
  // "stale" is an adjective here ("3 stale"), not a count noun, so it never takes an -s.
  if (row.stale > 0) parts.push(`${row.stale} stale`);
  return parts.join(" · ");
}

/** Every reason the row's right-hand icon is amber, in the order they should read (review round 1: the icon
 *  needs a title naming them, not just a silent word). Empty when nothing needs a look. Scripting off is only
 *  worth a look when something would actually run if it were on — a profile script or the operator's own
 *  file (mirrors Home's own `scripting_off` attention item, `views.ts`'s `homeSummary`). */
function needsALookReasons(row: AppRow): string[] {
  const reasons: string[] = [];
  if (row.status.newer_than_tested) reasons.push("newer than tested");
  if (row.status.scripting_enabled === false && row.attached + row.external > 0) reasons.push("scripting off");
  return reasons;
}

/** The row's right-hand icon (spec §6.5 step 1): stale beats "needs a look" when both are true, since a
 *  missing file is the more specific, more actionable problem. */
function RowIcon({ row }: { row: AppRow }) {
  if (row.stale > 0) {
    const { icon: Icon } = STATUS.stale;
    const label = `${row.stale} stale`;
    return (
      <span title={label} className="inline-flex shrink-0">
        <Icon aria-hidden className="size-3.5 text-warning" strokeWidth={1.75} />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  const reasons = needsALookReasons(row);
  if (reasons.length > 0) {
    const { icon: Icon } = STATUS.alert;
    const label = reasons.join(", ");
    return (
      // `aria-label` on a plain `span` has no effect (review round 3, Minor C: it needs a role, which this
      // isn't); sr-only text beside the icon reaches the same screen readers the stale branch above does.
      <span title={label} className="inline-flex shrink-0">
        <Icon aria-hidden className="size-3.5 text-warning" strokeWidth={1.75} />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return null;
}

function AppRowView({ row, selected }: { row: AppRow & { subtitle: string }; selected: boolean }) {
  const muted = !row.status.installed || !row.available_here;
  return (
    <Link
      href={`/apps/${encodeURIComponent(row.status.id)}`}
      id={rowId(row.status.id)}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      className={cn(
        "flex flex-col gap-0.5 border-l-2 px-2.5 py-1 transition-colors duration-120",
        selected ? "border-l-primary bg-accent" : "border-l-transparent hover:bg-accent/50",
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", muted ? "text-muted-foreground" : "text-foreground-strong")}>
          {row.status.name}
        </span>
        <RowIcon row={row} />
      </span>
      <span className="truncate text-xs text-muted-foreground">{row.subtitle}</span>
    </Link>
  );
}

function AppListSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 p-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-10 shrink-0" />
      ))}
    </div>
  );
}

/**
 * The Hedge apps list (spec §6.5 step 1): every catalog app, its version and how it stands, plus a refresh
 * button — this state lives in the registry or the OffShoot Helper workspace, outside the data folder, so it
 * needs one (the screen also refetches on window focus). One flat listbox; there are only ever a handful of
 * apps, so unlike Scripts and Variables this list has no filter field.
 */
export function AppList({ overview, selectedId, onSelect }: {
  overview: UseQueryResult<AppsOverviewOutput>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const data = overview.data;
  const rows = data ? data.apps.map((row) => ({ ...row, subtitle: subtitleFor(row, data.os) })) : [];
  const rowIds = rows.map((r) => rowId(r.status.id));
  const selectedRowId = selectedId !== null && rows.some((r) => r.status.id === selectedId) ? rowId(selectedId) : null;
  const onRowSelect = (id: string) => onSelect(id.slice("app-".length));
  const onKeyDown = useListKeyboard(rowIds, selectedRowId, onRowSelect, (id) => id);

  const toolbar = (
    <div className="flex shrink-0 items-center justify-end border-b border-border px-2 py-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh"
            disabled={overview.isFetching}
            onClick={() => invalidateHedgeState()}
          >
            <RotateCw aria-hidden className={cn(overview.isFetching && "animate-spin")} strokeWidth={1.75} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Refresh</TooltipContent>
      </Tooltip>
    </div>
  );

  let body: React.ReactNode;
  if (overview.isPending) {
    body = <AppListSkeleton />;
  } else if (overview.isError && !overview.isSuccess) {
    body = (
      <div className="p-3">
        <ErrorPanel error={overview.error} onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState icon={AppWindow} title="No Hedge apps in the catalog" className="px-3 py-6">
        Check the catalog folder in Settings.
      </EmptyState>
    );
  } else {
    body = (
      <div
        role="listbox"
        aria-label="Hedge apps"
        tabIndex={0}
        aria-activedescendant={selectedRowId ?? undefined}
        onKeyDown={onKeyDown}
        className="flex flex-col p-2 focus-visible:outline-offset-[-2px]"
      >
        {rows.map((row) => (
          <AppRowView key={row.status.id} row={row} selected={selectedRowId === rowId(row.status.id)} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbar}
      <div className="relative min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );
}
