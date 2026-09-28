import { useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { callApp } from "@/api/bridge";
import { queryClient, queryKey, useClaudeDesktopStatus } from "@/api/queries";
import type { ClaudeDesktopApplyOutput, ClaudeDesktopPlanOutput, ClaudeDesktopStatusOutput } from "@/api/tools.gen";
import { ChangePreviewDialog, type PreviewModel, wrapPath } from "@/components/app/change-preview-dialog";
import { Mono } from "@/components/app/mono";
import { Readout } from "@/components/app/readout";
import { StatusIcon } from "@/components/app/status-icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChangeRow } from "@/lib/actions";
import { focusMainHeading } from "@/lib/focus";
import { basename } from "@/lib/format";
import { claudeStateKey, type StatusKey } from "@/lib/status";

/**
 * Whether Set up/Update just applied and the operator hasn't necessarily restarted Claude Desktop yet. Kept
 * outside the component (Task 5 ruling: "Keep it for the session" — leaving Connect and coming back must not
 * lose it). Review round 1: shown only while the status still reads `set_up` — if it later changes away
 * (someone or something else touched the file), a fresh Set up/Update is what's needed, not a restart, so the
 * render below re-checks `data.state` every time rather than trusting this flag alone.
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

/** The folder a path sits in (everything before its last `\` or `/`), for "a backup goes beside it" without
 *  claiming the exact file name a later apply will actually pick (review round 1, Important 3). */
function dirname(path: string): string {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return idx === -1 ? path : path.slice(0, idx);
}

/** Spec §6.6's status sentence, one per state (Task 5 brief step 2; review round 1 folds in the no-binary
 *  wording so the status line stays one line instead of a second caveat underneath it). */
function statusSentence(data: ClaudeDesktopStatusOutput): React.ReactNode {
  const noBinary = data.binary === null;
  switch (data.state) {
    case "set_up":
      // The STATUS word already says "set up" (`StatusLine` renders it first); this doesn't repeat it.
      return noBinary
        ? "Claude Desktop has a hedgebuddy entry. This build has no bundled command to compare it with."
        : "HedgeBuddy is in Claude Desktop.";
    case "not_set_up":
      return "Claude Desktop doesn't know about HedgeBuddy yet.";
    case "no_claude":
      // Without a binary there is no "Set up anyway" action to point at (the button is disabled below).
      return noBinary
        ? "Its settings folder wasn't found."
        : "Its settings folder wasn't found. Set up anyway, then open Claude Desktop.";
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

/** Icon and word from `STATUS` (via `StatusIcon`, so the tone colours live in one place), a separator, then
 *  the plain sentence — Design direction 5C: "Status line". */
function StatusLine({ statusKey, children }: { statusKey: StatusKey; children: React.ReactNode }) {
  return (
    <p className="flex flex-wrap items-start gap-x-1.5 gap-y-1 text-sm">
      <StatusIcon status={statusKey} label className="shrink-0" />
      <span aria-hidden className="text-muted-foreground">
        ·
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

/**
 * Turns a `claude_desktop_plan` result into the preview dialog's ledger (Task 5 brief step 2). Review round
 * 1, Important 3: the backup row never claims the exact file name `apply` will actually write (its stamp is
 * struck fresh at apply time, seconds after the plan's own) — it names the folder instead. Review round 1,
 * Minor 8: a brand-new file gets its own detail on the same row rather than a second row repeating the same
 * config path.
 */
function describePlan(action: SetupAction, plan: ClaudeDesktopPlanOutput): PreviewModel {
  const changes: ChangeRow[] = [
    {
      kind: "file",
      target: plan.config_path,
      detail: { text: plan.creates_file ? "created, with mcpServers.hedgebuddy set" : "set mcpServers.hedgebuddy" },
    },
  ];
  if (plan.backup_path) {
    changes.push({ kind: "backup", target: dirname(plan.backup_path), detail: { text: "a timestamped backup of the config, in this folder" } });
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
  // Review round 1, Minor 1: `action` goes null the instant the dialog is asked to close, but Radix keeps it
  // mounted (and visible) through its close animation — reading `action` directly for the title/apply label
  // during that animation would flip "Update" to "Set up" a moment before the dialog actually disappears.
  // This keeps the last real action for exactly that window.
  const lastActionRef = useRef<SetupAction>("set_up");
  if (action !== null) lastActionRef.current = action;

  if (query.isPending) return <PanelSkeleton />;
  // The shared `claude_desktop_status` failure is shown once, by `ConnectScreen` — this panel simply
  // doesn't render while that's the case (review round 2, minor: "one ErrorPanel per failed query").
  if (query.isError && !query.isSuccess) return null;

  const data = query.data;
  if (!data) return <PanelSkeleton />;

  const statusKey = claudeStateKey(data.state);
  const noBinary = data.binary === null;
  const offerAction = data.state === "not_set_up" || data.state === "no_claude" || data.state === "outdated";
  const actionLabel = data.state === "outdated" ? "Update…" : "Set up…";
  const checkAgain = () => {
    if (query.isFetching) return;
    void query.refetch();
  };
  // Review round 1, Minor 6: without a bundled binary there is nothing to compare the config against
  // (`expected` is null), but the entry already there is still worth showing rather than a bare "—".
  const commandValue = data.expected ? data.expected.command : (data.current?.command ?? null);
  // Review round 1, Minor 5: an unreadable config's "no other servers" isn't known, so it isn't "none".
  const otherServersKnown = data.state !== "invalid";

  return (
    <section className="surface @container flex flex-col gap-3 p-3">
      <h2 className="micro-label">Claude Desktop</h2>

      <div className="flex flex-col gap-1">
        <StatusLine statusKey={statusKey}>{statusSentence(data)}</StatusLine>
        {restarting && data.state === "set_up" && (
          <p className="pl-5 text-xs text-muted-foreground">Restart Claude Desktop to pick up the change.</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Readout label="CONFIG">{wrapPath(data.config_path)}</Readout>
        <Readout label="OTHER SERVERS" mono={otherServersKnown && data.other_servers.length > 0}>
          {!otherServersKnown ? "—" : data.other_servers.length > 0 ? data.other_servers.join(", ") : "none"}
        </Readout>
        <Readout label="COMMAND" mono={commandValue !== null}>
          {commandValue ? wrapPath(commandValue) : "—"}
        </Readout>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-2">
        {!offerAction ? (
          <button
            type="button"
            aria-disabled={query.isFetching}
            aria-busy={query.isFetching}
            className="inline-flex min-h-7 items-center px-1 text-sm font-medium text-foreground hover:underline aria-disabled:pointer-events-none aria-disabled:opacity-60 aria-disabled:no-underline"
            onClick={checkAgain}
          >
            {query.isFetching ? "Checking…" : "Check again"}
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
        title={lastActionRef.current === "update" ? "Update Claude Desktop" : "Set up Claude Desktop"}
        applyLabel={lastActionRef.current === "update" ? "Update" : "Set up"}
        returnFocus={() => document.getElementById("screen-heading")}
        plan={() => callApp("claude_desktop_plan", {})}
        describe={(p) => describePlan(lastActionRef.current, p)}
        apply={() => callApp("claude_desktop_apply", {})}
        onApplied={async (applied: ClaudeDesktopApplyOutput) => {
          // Review round 1, Important 1: awaiting this before moving focus means the panel has already
          // re-rendered (and, once the status reads `set_up`, the Set up/Update button that opened this
          // dialog has already unmounted) by the time `focusMainHeading` runs — so it never races that
          // unmount the way returning focus to the (about-to-vanish) opener button does. `returnFocus` above
          // stays as the fallback for the ordinary case (Cancel, or a dry-run that never applied).
          await queryClient.invalidateQueries({ queryKey: queryKey.app("claude_desktop_status", {}) });
          markRestartPending();
          // Review round 1, Important 3: the toast names the backup `apply` actually wrote, not the plan's
          // (their stamps can differ) — and only when there was one (a brand-new file has none).
          toast(
            "Set up. Restart Claude Desktop to use it.",
            applied.backup_path ? { description: <Mono>{basename(applied.backup_path)}</Mono> } : undefined,
          );
          focusMainHeading();
        }}
      />
    </section>
  );
}
