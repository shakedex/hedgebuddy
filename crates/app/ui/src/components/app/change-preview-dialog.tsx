import { useEffect, useRef, useState } from "react";
import { FileCog, FilePen, KeyRound, KeySquare, Link, LoaderCircle, Trash2, TriangleAlert, Unlink, type LucideIcon } from "lucide-react";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChangeKind, ChangeRow } from "@/lib/actions";
import { showError } from "@/lib/toast";

/** One Lucide icon per ledger row kind (Design direction, 5B: "The change-preview dialog"). */
const KIND_ICON: Record<ChangeKind, LucideIcon> = {
  registry: KeyRound,
  registry_delete: KeySquare,
  workspace: FileCog,
  file: FilePen,
  delete: Trash2,
  attach: Link,
  detach: Unlink,
};

/** What `describe` turns a dry run's result into (spec §7). */
export interface PreviewModel {
  /** One sentence describing the whole change. */
  summary: React.ReactNode;
  /** The ledger: one row per thing that will change. */
  changes: ChangeRow[];
  /** Things that need a look, shown as amber rows above the ledger (what an attach replaces, an event left
   *  pointing at a deleted script, an unmet requirement). */
  warnings?: React.ReactNode[];
  /** Set when the action cannot run at all. Shown instead of the ledger; there is no Apply. */
  blocked?: string;
  /** Set when there is nothing to change. Shown instead of the ledger; the only button is Close. */
  nothingToDo?: string;
}

type Phase = "planning" | "plan-error" | "blocked" | "nothing-to-do" | "ready" | "applying";

function phaseOf(model: PreviewModel): Phase {
  return model.blocked ? "blocked" : model.nothingToDo ? "nothing-to-do" : "ready";
}

/**
 * The change-preview dialog (spec §7): "Any action that changes something outside the data folder, and any
 * deletion, opens a dialog. It runs the tool with `dry_run: true`, then shows the planned changes in plain
 * words. The words come from the dry-run result: registry values, workspace preferences, files, and what an
 * attach would replace. Apply runs the tool again without `dry_run`."
 *
 * `plan` is the dry run; `describe` turns its result into words (see `@/lib/actions` for the common cases);
 * `apply` re-runs the tool for real. The result `R` reaches the caller through `onApplied`, which is also
 * where the caller toasts a confirmation — its wording (a count, a file name, a profile) is caller-specific,
 * so this component never guesses it.
 *
 * Re-plans every time it opens, since the machine may have changed since the last look (spec §7).
 */
export function ChangePreviewDialog<P, R>({
  open, onOpenChange, title, applyLabel, destructive = false, plan, describe, apply, onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The Apply button's verb: "Attach", "Detach", "Clear 3", "Delete". */
  applyLabel: string;
  /** Deletions use the destructive button; colour otherwise marks only problems (spec §2.7). */
  destructive?: boolean;
  plan: () => Promise<P>;
  describe: (plan: P) => PreviewModel;
  apply: () => Promise<R>;
  onApplied?: (result: R) => void;
}) {
  const [phase, setPhase] = useState<Phase>("planning");
  const [model, setModel] = useState<PreviewModel | null>(null);
  const [planError, setPlanError] = useState<unknown>(null);
  // Guards a plan()/apply() in flight against a dialog that has since closed, reopened or been re-planned.
  const requestId = useRef(0);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);

  const runPlan = () => {
    const id = ++requestId.current;
    setPhase("planning");
    setPlanError(null);
    plan().then(
      (p) => {
        if (requestId.current !== id) return;
        const m = describe(p);
        setModel(m);
        setPhase(phaseOf(m));
      },
      (e: unknown) => {
        if (requestId.current !== id) return;
        setPlanError(e);
        setPhase("plan-error");
      },
    );
  };

  useEffect(() => {
    if (open) runPlan();
    else requestId.current++; // Abandon anything in flight; nothing to show while closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Apply once ready (Cancel for destructive dialogs), including after Apply fails and returns here.
  useEffect(() => {
    if (phase !== "ready") return;
    (destructive ? cancelRef : applyRef).current?.focus();
  }, [phase, destructive]);

  const applying = phase === "applying";

  const doApply = () => {
    const id = ++requestId.current;
    setPhase("applying");
    apply().then(
      (result) => {
        if (requestId.current !== id) return;
        onOpenChange(false);
        onApplied?.(result);
      },
      (e: unknown) => {
        if (requestId.current !== id) return;
        setPhase("ready");
        showError(e, doApply);
      },
    );
  };

  // Escape, the overlay and the close button all funnel through here: ignored mid-apply.
  const close = (next: boolean) => {
    if (!next && applying) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[520px]" showCloseButton={!applying}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={descriptionClass(phase)}>
            {descriptionText(phase, model)}
          </DialogDescription>
        </DialogHeader>

        {phase === "planning" && <PlanningSkeleton />}

        {phase === "plan-error" && <ErrorPanel error={planError} onRetry={runPlan} title="Couldn't plan this change" />}

        {(phase === "ready" || phase === "applying") && model && (
          <>
            {model.warnings && model.warnings.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {model.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-warning">
                    <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1">{w}</span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="well flex max-h-[45vh] flex-col divide-y divide-border overflow-y-auto">
              {model.changes.map((row, i) => (
                <LedgerRow key={i} row={row} />
              ))}
            </ul>
          </>
        )}

        <DialogFooter>
          <Button ref={cancelRef} type="button" variant="outline" disabled={applying} onClick={() => close(false)}>
            {phase === "nothing-to-do" ? "Close" : "Cancel"}
          </Button>
          {(phase === "ready" || phase === "applying") && (
            <Button
              ref={applyRef}
              type="button"
              variant={destructive ? "destructive" : "default"}
              disabled={applying}
              aria-busy={applying}
              onClick={doApply}
            >
              {applying && <LoaderCircle aria-hidden className="size-3.5 animate-spin" strokeWidth={1.75} />}
              {applying ? "Applying…" : applyLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Radix requires every dialog to have a description; the earlier phases keep it for screen readers only,
 *  since their visible content (a skeleton, an `ErrorPanel` with its own `alert`) already says as much. */
function descriptionClass(phase: Phase): string {
  switch (phase) {
    case "ready":
    case "applying":
      return "text-base text-foreground";
    case "blocked":
      return "well px-3 py-2 text-sm text-foreground";
    case "nothing-to-do":
      return "text-sm text-muted-foreground";
    case "planning":
    case "plan-error":
      return "sr-only";
  }
}

function descriptionText(phase: Phase, model: PreviewModel | null): React.ReactNode {
  switch (phase) {
    case "planning":
      return "Working out what this would change.";
    case "plan-error":
      return "This change could not be planned.";
    case "blocked":
      return model?.blocked;
    case "nothing-to-do":
      return model?.nothingToDo;
    case "ready":
    case "applying":
      return model?.summary;
  }
}

function PlanningSkeleton() {
  return (
    <ul aria-hidden className="well flex flex-col divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-2 px-3 py-2">
          <Skeleton className="size-3.5 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
            <Skeleton className="h-3 w-2/3 rounded-sm" />
            <Skeleton className="h-2.5 w-1/3 rounded-sm" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function LedgerRow({ row }: { row: ChangeRow }) {
  const Icon = KIND_ICON[row.kind];
  return (
    <li className="flex items-start gap-2 px-3 py-2">
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <Mono className="block text-xs break-all">{row.target}</Mono>
        {row.detail && <p className="text-xs text-muted-foreground">{row.detail}</p>}
      </div>
    </li>
  );
}
