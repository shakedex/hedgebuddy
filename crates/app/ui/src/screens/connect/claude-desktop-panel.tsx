import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { callApp } from "@/api/bridge";
import { queryClient, queryKey, useClaudeDesktopStatus } from "@/api/queries";
import type { ClaudeDesktopPlanOutput, ClaudeDesktopStatusOutput } from "@/api/tools.gen";
import { ChangePreviewDialog, type PreviewModel, wrapPath } from "@/components/app/change-preview-dialog";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChangeRow } from "@/lib/actions";
import { claudeStateKey, STATUS, TONE_TEXT, type StatusKey } from "@/lib/status";
import { cn } from "@/lib/utils";
import { ConnectReadout } from "./connect-screen";

/**
 * Whether Set up/Update just applied and the operator hasn't necessarily restarted Claude Desktop yet. Kept
 * outside the component (Task 5 ruling: "Keep it for the session" — leaving Connect and coming back must not
 * lose it, and the very next status refetch after a successful apply already reports `set_up`, so the note
 * can't be keyed on that state the way its own wording first suggests; Step 6's own check confirms both show
 * together: "Apply → set_up and the restart line"). Cleared only by a fresh page load (a new session).
 */
let restartPending = false;
const restartListeners = new Set<() => void>();
function markRestartPending() {
  restartPending = true;
  restartListeners.forEach((l) => l());
}
function useRestartPending(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      restartListeners.add(onChange);
      return () => restartListeners.delete(onChange);
    },
    () => restartPending,
  );
}

type SetupAction = "set_up" | "update";

/** Spec §6.6's status sentence, one per state (Task 5 brief step 2). */
function statusSentence(data: ClaudeDesktopStatusOutput): React.ReactNode {
  switch (data.state) {
    case "set_up":
      return "HedgeBuddy is set up in Claude Desktop.";
    case "not_set_up":
      return "Claude Desktop doesn't know about HedgeBuddy yet.";
    case "no_claude":
      return "Claude Desktop's settings folder wasn't found. Set up anyway, then open Claude Desktop.";
    case "outdated":
      // `current` is null for a malformed entry (progress ledger: "malformed entry → outdated with current
      // null") — there is then no command of its own worth quoting.
      return data.current ? (
        <>
          Claude Desktop runs a different hedgebuddy: <Mono>{wrapPath(data.current.command)}</Mono>.
        </>
      ) : (
        "Claude Desktop has a hedgebuddy entry that isn't set up right."
      );
    case "invalid":
      return `${data.problem}. Fix or remove the file, then check again.`;
  }
}

/** Icon and word from `STATUS`, then the plain sentence, on one (wrapping) line — Design direction 5C: "Status line". */
function StatusLine({ statusKey, children }: { statusKey: StatusKey; children: React.ReactNode }) {
  const { icon: Icon, word, tone } = STATUS[statusKey];
  const wordClass = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-muted-foreground";
  return (
    <p className="flex flex-wrap items-start gap-x-1.5 gap-y-1 text-sm">
      <span className="flex shrink-0 items-center gap-1.5">
        <Icon aria-hidden className={cn("size-3.5", TONE_TEXT[tone])} strokeWidth={1.75} />
        <span className={cn("font-medium", wordClass)}>{word}.</span>
      </span>
      <span className="min-w-0 flex-1 text-foreground">{children}</span>
    </p>
  );
}

/** The dialog's summary sentence (Task 5 notes: "Add vs. replace" — an `outdated` plan with `before` null is
 *  a malformed entry being replaced), plus a neutral mention of any other server kept as-is. */
function planSummary(action: SetupAction, plan: ClaudeDesktopPlanOutput): React.ReactNode {
  const main =
    action === "set_up"
      ? "Add HedgeBuddy to Claude Desktop."
      : plan.before === null
        ? "Replace the hedgebuddy entry."
        : "Point Claude Desktop at this HedgeBuddy.";
  if (plan.other_servers.length === 0) return main;
  return (
    <>
      {main} Keeps <Mono>{plan.other_servers.join(", ")}</Mono>.
    </>
  );
}

/** Turns a `claude_desktop_plan` result into the preview dialog's ledger (Task 5 brief step 2). */
function describePlan(action: SetupAction, plan: ClaudeDesktopPlanOutput): PreviewModel {
  const changes: ChangeRow[] = [{ kind: "file", target: plan.config_path, detail: { text: "set mcpServers.hedgebuddy" } }];
  if (plan.backup_path) {
    // Task 5 ruling: word the backup row as "a timestamped backup beside it", with the planned path in mono
    // (the row's own target, already rendered mono by `ChangePreviewDialog`).
    changes.push({ kind: "backup", target: plan.backup_path, detail: { text: "a timestamped backup beside it" } });
  }
  if (plan.creates_file) {
    changes.push({ kind: "new_file", target: plan.config_path, detail: { text: "doesn't exist yet, so it's created" } });
  }
  return {
    summary: planSummary(action, plan),
    changes,
    nothingToDo: plan.unchanged ? "Claude Desktop already points at this HedgeBuddy." : undefined,
  };
}

function PanelSkeleton() {
  return (
    <section className="surface flex flex-col gap-3 p-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-28 rounded-sm" />
      <Skeleton className="h-4 w-3/4 rounded-sm" />
      <Skeleton className="h-3 w-1/2 rounded-sm" />
      <Skeleton className="h-3 w-2/3 rounded-sm" />
    </section>
  );
}

/**
 * The Claude Desktop panel (spec §6.6): whether HedgeBuddy is set up, its readouts, and Set up/Update through
 * `ChangePreviewDialog` (spec §7). The config lives outside the data folder, so `useClaudeDesktopStatus`
 * already refetches on window focus (api/queries.ts).
 */
export function ClaudeDesktopPanel() {
  const query = useClaudeDesktopStatus();
  const restarting = useRestartPending();
  const [action, setAction] = useState<SetupAction | null>(null);

  if (query.isPending) return <PanelSkeleton />;
  if (query.isError && !query.isSuccess) {
    return (
      <section className="surface flex flex-col gap-3 p-3">
        <h2 className="micro-label">Claude Desktop</h2>
        <ErrorPanel error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      </section>
    );
  }

  const data = query.data;
  if (!data) return <PanelSkeleton />;

  const statusKey = claudeStateKey(data.state);
  const noBinary = data.binary === null;
  const offerAction = data.state === "not_set_up" || data.state === "no_claude" || data.state === "outdated";
  const actionLabel = data.state === "outdated" ? "Update…" : "Set up…";
  const checkAgain = () => void query.refetch();

  return (
    <section className="surface @container flex flex-col gap-3 p-3">
      <h2 className="micro-label">Claude Desktop</h2>

      <div className="flex flex-col gap-1">
        <StatusLine statusKey={statusKey}>{statusSentence(data)}</StatusLine>
        {data.state === "set_up" && noBinary && (
          <p className="pl-5 text-xs text-muted-foreground">Can't check this build's command: it has no bundled hedgebuddy.</p>
        )}
        {restarting && <p className="pl-5 text-xs text-muted-foreground">Restart Claude Desktop to pick up the change.</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <ConnectReadout label="CONFIG">{wrapPath(data.config_path)}</ConnectReadout>
        <ConnectReadout label="OTHER SERVERS" mono={data.other_servers.length > 0}>
          {data.other_servers.length > 0 ? data.other_servers.join(", ") : "none"}
        </ConnectReadout>
        <ConnectReadout label="COMMAND" mono={data.expected !== null}>
          {data.expected ? wrapPath(data.expected.command) : "—"}
        </ConnectReadout>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-2">
        {!offerAction ? (
          <button
            type="button"
            className="inline-flex min-h-7 items-center px-1 text-sm font-medium text-foreground hover:underline"
            onClick={checkAgain}
          >
            Check again
          </button>
        ) : noBinary ? (
          <div className="flex flex-col items-end gap-1">
            <Button size="sm" disabled aria-describedby="claude-desktop-no-binary">
              {actionLabel}
            </Button>
            <span id="claude-desktop-no-binary" className="text-xs text-muted-foreground">
              This build has no bundled hedgebuddy command.
            </span>
          </div>
        ) : (
          <Button size="sm" onClick={() => setAction(data.state === "outdated" ? "update" : "set_up")}>
            {actionLabel}
          </Button>
        )}
      </div>

      <ChangePreviewDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        title={action === "update" ? "Update Claude Desktop" : "Set up Claude Desktop"}
        applyLabel={action === "update" ? "Update" : "Set up"}
        returnFocus={() => document.getElementById("screen-heading")}
        plan={() => callApp("claude_desktop_plan", {})}
        describe={(p) => describePlan(action ?? "set_up", p)}
        apply={() => callApp("claude_desktop_apply", {})}
        onApplied={() => {
          void queryClient.invalidateQueries({ queryKey: queryKey.app("claude_desktop_status", {}) });
          markRestartPending();
          toast("Set up. Restart Claude Desktop to use it.");
        }}
      />
    </section>
  );
}
