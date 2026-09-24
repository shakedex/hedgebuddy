import { useRef } from "react";
import { CircleDashed, Copy, FileCode } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { useRun } from "@/api/queries";
import type { Run } from "@/api/tools.gen";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { appName, clock, dayKey, dayLabel, duration } from "@/lib/format";
import { isFailedRun } from "@/lib/status";
import { showError } from "@/lib/toast";
import { cn } from "@/lib/utils";

function statusLine(run: Run): string {
  if (isFailedRun(run)) return `${run.script}: failed (exit ${run.exit_code})`;
  if (run.status === "ok") return `${run.script}: ok (exit 0)`;
  return `${run.script}: unfinished`;
}

/** `Ended`'s clock, with its day label prefixed only when it differs from `Started`'s (a run that crosses midnight). */
function endedText(run: Run): string {
  if (!run.ended_at) return "—";
  const startDay = dayKey(run.started_at);
  const endDay = dayKey(run.ended_at);
  return startDay === endDay ? clock(run.ended_at, true) : `${dayLabel(endDay)} ${clock(run.ended_at, true)}`;
}

/** The plain-text export for "Copy details" (spec §6.2). */
function copyDetails(run: Run): string {
  const lines = [
    statusLine(run),
    `App: ${appName(run.app)} · Event: ${run.event ?? "—"} · Profile: ${run.profile}`,
    `Started: ${dayLabel(dayKey(run.started_at))} ${clock(run.started_at, true)} · Ended: ${endedText(run)} · Duration: ${duration(run.started_at, run.ended_at) ?? "unfinished"}`,
    `Run id: ${run.run_id}`,
    "",
    "Log",
    run.logs.length > 0 ? run.logs.map((line) => `${clock(line.ts, true)} ${line.message}`).join("\n") : "No log lines.",
  ];
  if (run.traceback) lines.push("", "Traceback", run.traceback);
  return lines.join("\n");
}

function StatusPill({ run }: { run: Run }) {
  if (isFailedRun(run)) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-destructive-tint px-2 py-0.5 text-xs text-destructive ring-1 ring-inset ring-destructive-border">
        failed · exit {run.exit_code}
      </span>
    );
  }
  if (run.status === "ok") {
    return <span className="inline-flex shrink-0 items-center rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">ok · exit 0</span>;
  }
  return <span className="inline-flex shrink-0 items-center rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">unfinished</span>;
}

/** A definition-list row. Both fact grids share a fixed label column (rather than `auto`) so their value
 * columns line up with each other when they stack into one column. `title` backs the value with the
 * untruncated text for anything that can still clip (a very long profile or run id). */
function Fact({ label, mono, className, title, children }: { label: string; mono?: boolean; className?: string; title?: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd title={title} className={cn("min-w-0 truncate text-foreground", mono && "font-mono", className)}>
        {children}
      </dd>
    </>
  );
}

function RunDetailSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4 @max-[640px]:px-3">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 @max-[640px]:p-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
}

/** Run detail (spec §6.2): status, facts, log and traceback, with Copy details and Open script. */
export function RunDetail({ runId, activeProfile }: { runId: string; activeProfile: string | null }) {
  const query = useRun(runId);

  // See HomeScreen: keeps the *last* error across the "pending" flicker a retry causes. Reset whenever
  // `runId` itself changes (this component doesn't remount between runs, since the shell keys the screen on
  // its path, not the full URL) — otherwise a stale error from the previous run (e.g. "not found") would
  // flash while the new run's query is still in flight.
  const lastError = useRef<unknown>(null);
  const lastRunId = useRef(runId);
  if (lastRunId.current !== runId) {
    lastRunId.current = runId;
    lastError.current = null;
  }
  if (query.isError) lastError.current = query.error;
  else if (query.isSuccess) lastError.current = null;

  if (query.isPending && lastError.current === null) return <RunDetailSkeleton />;

  if (lastError.current !== null && !query.isSuccess) {
    const error = query.error ?? lastError.current;
    // Matches `hedgebuddy-tools`' `get_run` exactly (crates/tools/src/system.rs): `format!("run '{}' not found", p.run_id)`.
    const notFound = error instanceof Error && error.message === `run '${runId}' not found`;
    if (notFound) {
      return (
        <div className="flex h-full p-4 @max-[640px]:p-3">
          <EmptyState
            icon={CircleDashed}
            title="This run is gone"
            className="m-auto"
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/runs">Back to runs</Link>
              </Button>
            }
          >
            Runs older than 30 days are removed.
          </EmptyState>
        </div>
      );
    }
    return (
      <div className="p-4 @max-[640px]:p-3">
        <ErrorPanel error={error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      </div>
    );
  }

  const run = query.data;
  if (!run) return <RunDetailSkeleton />;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyDetails(run));
      toast("Copied run details");
    } catch (e) {
      showError(e);
    }
  };

  const app = appName(run.app);
  const event = run.event ?? "—";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4 @max-[640px]:px-3">
        <Mono className="min-w-0 truncate text-base font-medium" title={run.script}>
          {run.script}
        </Mono>
        <StatusPill run={run} />
      </div>
      {/* The scroll area is its own named container, so the facts go two-column only when this pane (not the
          whole screen, which also holds the list) is at least 560 px wide: 528 px inside its padding. At the
          default 960 px window the pane is about 470 px, so they stack and Event and Profile read in full.
          The area's own padding still follows the screen's container (an element never queries itself). */}
      <div className="@container/detail min-h-0 flex-1 overflow-y-auto p-4 @max-[640px]:p-3">
        <div className="grid gap-x-8 gap-y-1.5 @min-[528px]/detail:grid-cols-2">
          <dl className="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-1.5 text-sm">
            <Fact label="App" title={app}>
              {app}
            </Fact>
            <Fact label="Event" mono title={event}>
              {event}
            </Fact>
            <Fact label="Profile" mono title={run.profile}>
              {run.profile}
              {run.profile !== activeProfile && <span className="pl-1.5 font-sans text-xs text-muted-foreground">· not active</span>}
            </Fact>
            <Fact label="Started" className="readout">
              {dayLabel(dayKey(run.started_at))} {clock(run.started_at, true)}
            </Fact>
          </dl>
          <dl className="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-1.5 text-sm">
            <Fact label="Ended" className="readout">
              {endedText(run)}
            </Fact>
            <Fact label="Duration" className="readout">
              {duration(run.started_at, run.ended_at) ?? "—"}
            </Fact>
            <Fact label="Exit code" className="readout">
              {run.exit_code ?? "—"}
            </Fact>
            <Fact label="Run id" mono className="select-text text-xs" title={run.run_id}>
              {run.run_id}
            </Fact>
          </dl>
        </div>

        <p className="micro-label mt-4 mb-1.5">Log</p>
        {run.logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No log lines.</p>
        ) : (
          <div className="well flex flex-col gap-1 p-2">
            {run.logs.map((line, i) => (
              <div key={i} className="flex gap-2">
                <span className="readout shrink-0 font-mono text-xs text-muted-foreground">{clock(line.ts, true)}</span>
                <span className="min-w-0 flex-1 font-mono text-xs whitespace-pre-wrap break-words text-foreground">{line.message}</span>
              </div>
            ))}
          </div>
        )}

        {run.traceback && (
          <>
            <p className="micro-label mt-4 mb-1.5">Traceback</p>
            <div className="rounded-md border border-destructive-border bg-destructive-tint/70 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-destructive/90">
              {run.traceback}
            </div>
          </>
        )}
      </div>
      <div className="flex h-11 shrink-0 items-center justify-end gap-2 border-t border-border px-3">
        <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
          <Copy aria-hidden strokeWidth={1.75} />
          Copy details
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/scripts/${encodeURIComponent(run.script)}`}>
            <FileCode aria-hidden strokeWidth={1.75} />
            Open script
          </Link>
        </Button>
      </div>
    </div>
  );
}
