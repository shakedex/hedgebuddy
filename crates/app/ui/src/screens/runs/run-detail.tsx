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
import { showError } from "@/lib/toast";
import { cn } from "@/lib/utils";

const isFailedRun = (run: Run) => run.status === "failed" || run.status === "error";

function statusLine(run: Run): string {
  if (isFailedRun(run)) return `${run.script}: failed (exit ${run.exit_code})`;
  if (run.status === "ok") return `${run.script}: ok (exit 0)`;
  return `${run.script}: unfinished`;
}

/** The plain-text export for "Copy details" (spec §6.2). */
function copyDetails(run: Run): string {
  const lines = [
    statusLine(run),
    `App: ${appName(run.app)} · Event: ${run.event ?? "—"} · Profile: ${run.profile}`,
    `Started: ${dayLabel(dayKey(run.started_at))} ${clock(run.started_at, true)} · Ended: ${run.ended_at ? clock(run.ended_at, true) : "—"} · Duration: ${duration(run.started_at, run.ended_at) ?? "unfinished"}`,
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

function Fact({ label, mono, className, children }: { label: string; mono?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-foreground", mono && "font-mono", className)}>{children}</dd>
    </>
  );
}

function RunDetailSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
}

/** Run detail (spec §6.2): status, facts, log and traceback, with Copy details and Open script. */
export function RunDetail({ runId, activeProfile }: { runId: string; activeProfile: string | null }) {
  const query = useRun(runId);

  // See HomeScreen: keeps the *last* error across the "pending" flicker a retry causes.
  const lastError = useRef<unknown>(null);
  if (query.isError) lastError.current = query.error;
  else if (query.isSuccess) lastError.current = null;

  if (query.isPending && lastError.current === null) return <RunDetailSkeleton />;

  if (lastError.current !== null && !query.isSuccess) {
    const error = query.error ?? lastError.current;
    const notFound = error instanceof Error && error.message.includes("not found");
    if (notFound) {
      return (
        <div className="p-4">
          <EmptyState
            icon={CircleDashed}
            title="This run is gone"
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
      <div className="p-4">
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <Mono className="min-w-0 truncate text-base font-medium" title={run.script}>
          {run.script}
        </Mono>
        <StatusPill run={run} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid gap-x-8 gap-y-4 @min-[640px]:grid-cols-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <Fact label="App">{appName(run.app)}</Fact>
            <Fact label="Event" mono>
              {run.event ?? "—"}
            </Fact>
            <Fact label="Profile" mono>
              {run.profile}
              {run.profile !== activeProfile && <span className="pl-1.5 font-sans text-xs text-muted-foreground">· not active</span>}
            </Fact>
            <Fact label="Started" className="readout">
              {dayLabel(dayKey(run.started_at))} {clock(run.started_at, true)}
            </Fact>
          </dl>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <Fact label="Ended" className="readout">
              {run.ended_at ? clock(run.ended_at, true) : "—"}
            </Fact>
            <Fact label="Duration" className="readout">
              {duration(run.started_at, run.ended_at) ?? "—"}
            </Fact>
            <Fact label="Exit code" className="readout">
              {run.exit_code ?? "—"}
            </Fact>
            <Fact label="Run id" mono className="select-text text-xs">
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
