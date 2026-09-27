import { useEffect, useRef, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { AppWindow, ExternalLink, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { BridgeError, callApp, callTool } from "@/api/bridge";
import { invalidateHedgeState, useAttachments } from "@/api/queries";
import type { Action, AppsOverviewOutput, ClearStaleAttachmentOutput, EventAttachment } from "@/api/tools.gen";
import { ChangePreviewDialog, wrapPath } from "@/components/app/change-preview-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describeActions } from "@/lib/actions";
import { plural } from "@/lib/format";
import { showError } from "@/lib/toast";
import { EventsTable } from "./events-table";

type StaleEvent = Extract<EventAttachment, { state: "stale" }>;

function DetailSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 @max-[640px]:px-3">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 @max-[640px]:p-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

/**
 * The Hedge apps detail (spec §6.5 step 2): version and scripting chips, a stale bar with Clear all, and the
 * events table from `list_attachments`, with a Clear dialog per stale event. Not installed or not available
 * on this platform shows an `EmptyState` instead (Lesson 5: that is a normal state, not an error).
 */
export function AppDetail({ app, overview, activeProfile }: {
  app: string;
  overview: UseQueryResult<AppsOverviewOutput>;
  activeProfile: string | null;
}) {
  const attachments = useAttachments(app);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [openingDocs, setOpeningDocs] = useState(false);
  const [clearing, setClearing] = useState<{ event: string; path: string } | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  // How many events the *current* Clear all plan still has left, so the Apply button's own label stays
  // roughly accurate through a busy retry (review round 3 ruling: no remount for this — see the dialog below).
  const [clearAllRemaining, setClearAllRemaining] = useState(0);
  const eventsTableRef = useRef<HTMLDivElement>(null);
  const clearAllButtonRef = useRef<HTMLButtonElement>(null);
  // Tracks Clear all's own progress across a busy failure and its retry (design direction, Lesson 1). Reset
  // only when a fresh plan runs. Review round 3 ruling: a busy failure leaves this same dialog open (as
  // ChangePreviewDialog normally does) rather than remounting it — a retry, from Apply or the busy toast's own
  // Try again, continues with only the events not yet cleared, and this ref is what makes that safe. A real
  // (non-busy) failure instead closes the dialog; the operator runs Clear all again for a fresh plan.
  const clearedRef = useRef<Set<string>>(new Set());
  const plannedRef = useRef<string[]>([]);
  // Set right when a dialog is about to close on its own (a full success, or — for Clear all — a real failure
  // that closes it too; see below). Radix's own close-focus restore lands on the opener while it's still
  // connected — the refetch this triggers hasn't landed yet — then that same refetch removes it a moment
  // later once it's no longer stale, dropping focus to <body> with nothing to catch it, since
  // ChangePreviewDialog's own `returnFocus` fallback only runs at the moment it closes (Lesson 2). These
  // re-check once both queries have actually settled: `list_attachments` (`attachments`) removes a row's own
  // Clear button, but the stale bar's own opener is removed by `apps_overview` (`overview`) instead, and the
  // two do not necessarily land at the same moment (review round 1, item 4).
  const pendingRefocusRef = useRef(false);
  const pendingClearAllRefocusRef = useRef(false);
  useEffect(() => {
    if (attachments.isFetching || overview.isFetching) return; // Wait for both to settle before acting on either.
    const refocusIfLost = (el: HTMLElement | null) => {
      const active = document.activeElement;
      if (active === document.body || active === document.documentElement || active === null) el?.focus();
    };
    if (pendingRefocusRef.current) {
      pendingRefocusRef.current = false;
      refocusIfLost(eventsTableRef.current);
    }
    if (pendingClearAllRefocusRef.current) {
      pendingClearAllRefocusRef.current = false;
      // The stale bar's own "Clear all" if it's still there (more events are still stale), else the table.
      refocusIfLost(clearAllButtonRef.current ?? eventsTableRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments.data, attachments.isFetching, overview.data, overview.isFetching]);

  if (overview.isPending) return <DetailSkeleton />;
  if (overview.isError && !overview.isSuccess) {
    return (
      <div className="p-4 @max-[640px]:p-3">
        <ErrorPanel error={overview.error} onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
      </div>
    );
  }
  const appRow = overview.data?.apps.find((a) => a.status.id === app);
  if (!appRow) {
    return (
      <div className="flex h-full p-4 @max-[640px]:p-3">
        <EmptyState
          icon={AppWindow}
          title="This app isn't in the catalog"
          className="m-auto"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/apps">Back to Hedge apps</Link>
            </Button>
          }
        >
          It may have been removed from a catalog override.
        </EmptyState>
      </div>
    );
  }

  const { status } = appRow;
  const os = overview.data!.os;

  if (!appRow.available_here) {
    return (
      <div className="flex h-full p-4 @max-[640px]:p-3">
        <EmptyState icon={AppWindow} title={`${status.name} runs on ${os === "windows" ? "macOS" : "Windows"} only.`} className="m-auto" />
      </div>
    );
  }
  if (!status.installed) {
    return (
      <div className="flex h-full p-4 @max-[640px]:p-3">
        <EmptyState icon={AppWindow} title={`${status.name} is not installed on this computer.`} className="m-auto" />
      </div>
    );
  }

  const handleDocs = () => {
    if (openingDocs) return;
    setOpeningDocs(true);
    callApp("open_app_docs", { app }).then(
      (r) => {
        if (mountedRef.current) setOpeningDocs(false);
        toast(`Opened in ${r.with}`);
      },
      (e: unknown) => {
        if (mountedRef.current) setOpeningDocs(false);
        showError(e, handleDocs);
      },
    );
  };

  const descriptions = Object.fromEntries(appRow.events.map((e) => [e.id, e.description]));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-border px-4 py-2 @max-[640px]:px-3">
        <span className="flex min-w-0 flex-auto flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="break-words text-base font-medium text-foreground-strong">{status.name}</span>
          {status.version && <span className="text-sm text-muted-foreground">{status.version}</span>}
        </span>
        <Button variant="ghost" size="sm" disabled={openingDocs} onClick={handleDocs}>
          <ExternalLink aria-hidden strokeWidth={1.75} /> Docs
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 @max-[640px]:p-3">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {status.scripting_enabled === true && <Badge>scripting on</Badge>}
            {status.scripting_enabled === false &&
              (appRow.attached + appRow.external > 0 ? (
                <Badge variant="warning">
                  <TriangleAlert aria-hidden strokeWidth={1.75} /> scripting off
                </Badge>
              ) : (
                <Badge variant="outline">scripting off</Badge>
              ))}
            {status.requires_pro && <Badge>needs Pro</Badge>}
            <Badge>tested with {status.tested_against}</Badge>
            {status.newer_than_tested && (
              <Badge variant="warning">
                <TriangleAlert aria-hidden strokeWidth={1.75} /> newer than tested
              </Badge>
            )}
          </div>

          {appRow.stale > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning-border bg-warning-tint px-3 py-2">
              <span className="text-sm text-warning">
                {appRow.stale} {plural(appRow.stale, "event")} {plural(appRow.stale, "points", "point")} at scripts that no longer exist
              </span>
              <button
                ref={clearAllButtonRef}
                type="button"
                className="inline-flex min-h-7 shrink-0 items-center text-sm font-medium text-warning hover:underline"
                onClick={() => setClearAllOpen(true)}
              >
                Clear all {appRow.stale}
              </button>
            </div>
          )}

          {attachments.isPending ? (
            <div className="well flex flex-col gap-1.5 p-2" aria-busy="true" aria-label="Loading">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : attachments.isError && !attachments.isSuccess ? (
            <ErrorPanel error={attachments.error} onRetry={() => void attachments.refetch()} retrying={attachments.isFetching} />
          ) : (
            <EventsTable
              events={attachments.data?.events ?? []}
              descriptions={descriptions}
              activeProfile={activeProfile}
              onClear={(row) => setClearing({ event: row.event, path: row.path })}
              tableRef={eventsTableRef}
            />
          )}
        </div>
      </div>

      <p className="shrink-0 border-t border-border px-4 py-2 text-xs text-muted-foreground @max-[640px]:px-3">
        Attaching and detaching happen from Scripts. This screen shows the app's side and cleans up leftovers.
      </p>

      <ChangePreviewDialog
        open={clearing !== null}
        onOpenChange={(open) => {
          if (!open) setClearing(null);
        }}
        title="Clear"
        applyLabel="Clear"
        returnFocus={() => eventsTableRef.current}
        plan={() => callTool("clear_stale_attachment", { app, event: clearing!.event, dry_run: true })}
        describe={(p: ClearStaleAttachmentOutput) => ({
          summary: (
            <>
              Clear <Mono className="text-foreground">{clearing!.event}</Mono>: it points at{" "}
              <Mono className="text-foreground">{wrapPath(clearing!.path)}</Mono>, which no longer exists.
            </>
          ),
          changes: describeActions(p.actions),
        })}
        apply={() => callTool("clear_stale_attachment", { app, event: clearing!.event })}
        onApplied={(result) => {
          invalidateHedgeState();
          toast(`Cleared ${clearing!.event}`);
          if (overview.data?.os === "macos" && result.note) toast(result.note, { duration: 8000 });
          pendingRefocusRef.current = true;
        }}
      />

      <ChangePreviewDialog
        open={clearAllOpen}
        onOpenChange={setClearAllOpen}
        title="Clear all"
        applyLabel={`Clear ${clearAllRemaining}`}
        returnFocus={() => clearAllButtonRef.current ?? eventsTableRef.current}
        plan={async () => {
          clearedRef.current = new Set();
          // Fresh every time, not the cached `attachments.data` (review round 1, item 10): while that query is
          // still loading it would otherwise plan against nothing and say "Nothing to clear."
          const fresh = await callTool("list_attachments", { app });
          const stale = fresh.events.filter((e): e is StaleEvent => e.state === "stale");
          plannedRef.current = stale.map((e) => e.event);
          setClearAllRemaining(stale.length);
          const items: { event: string; path: string; actions: Action[] }[] = [];
          for (const e of stale) {
            const r = await callTool("clear_stale_attachment", { app, event: e.event, dry_run: true });
            items.push({ event: e.event, path: e.path, actions: r.actions });
          }
          return { items };
        }}
        describe={(p: { items: { event: string; path: string; actions: Action[] }[] }) => {
          const n = p.items.length;
          return {
            summary: `Clear ${n} ${plural(n, "event")} that ${plural(n, "points", "point")} at ${n === 1 ? "a missing file" : "missing files"}.`,
            changes: p.items.flatMap((i) => describeActions(i.actions)),
            nothingToDo: n === 0 ? "Nothing to clear." : undefined,
          };
        }}
        apply={async () => {
          // Sequential and in order (spec §6.5 step 3): a real failure must stop, not race, so the ones still
          // to come stay untouched and the caller can say exactly which one failed. A busy failure instead
          // rethrows, so ChangePreviewDialog's own generic handling takes over — its own toast, this same
          // dialog stays open — and `clearedRef` makes a retry (from that toast's Try again, or from Apply)
          // skip what already succeeded (review round 3 ruling: no remount, so this ref is the only thing
          // guarding against re-clearing — and re-failing "not stale" on — those events).
          let note: string | undefined;
          let clearedThisRun = 0;
          let stoppedEarly = false;
          try {
            for (const event of plannedRef.current) {
              if (clearedRef.current.has(event)) continue;
              try {
                const r = await callTool("clear_stale_attachment", { app, event });
                clearedRef.current.add(event);
                clearedThisRun++;
                note = r.note ?? note;
                setClearAllRemaining((n) => Math.max(0, n - 1));
              } catch (e) {
                if (e instanceof BridgeError && e.kind === "busy") throw e;
                // A real failure: stop, and say which one, with its message (spec §6.5 step 3). Resolving
                // (not throwing) here — rather than letting ChangePreviewDialog's own generic failure handling
                // run — is what closes the dialog: a fresh Clear all then plans only what's actually still
                // stale, instead of this same dialog staying open, disagreeing with its own frozen ledger
                // (review round 1, item 9; round 3 ruling: closing beats remounting to fix that).
                const message = e instanceof Error ? e.message : String(e);
                showError(new Error(`${event}: ${message}`));
                stoppedEarly = true;
                break;
              }
            }
          } finally {
            // The screen must refresh no matter how this ends — full success, a real failure that's about to
            // close the dialog, or a busy failure about to reopen it (still open, in Radix's own telling) for
            // a retry (review round 3, R2: this must not depend on the dialog still being around afterwards).
            invalidateHedgeState();
          }
          return { count: clearedThisRun, note, stoppedEarly };
        }}
        onApplied={(result) => {
          // The number actually cleared *in this run* (review round 1, item 9), not the plan's original size —
          // a retry after a busy failure only clears what was left, even though the plan may have started out
          // bigger. A real failure already got its own toast above; this only adds the success one when there
          // wasn't one.
          if (!result.stoppedEarly) toast(`Cleared ${result.count} ${plural(result.count, "event")}`);
          if (overview.data?.os === "macos" && result.note) toast(result.note, { duration: 8000 });
          pendingClearAllRefocusRef.current = true;
        }}
      />
    </div>
  );
}
