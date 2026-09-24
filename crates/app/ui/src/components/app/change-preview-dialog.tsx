import { useEffect, useRef, useState } from "react";
import {
  Ban, FileCog, FilePen, KeyRound, KeySquare, Link, LoaderCircle, Trash2, TriangleAlert, Unlink, type LucideIcon,
} from "lucide-react";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChangeKind, ChangeRow, Words } from "@/lib/actions";
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

/** The sr-only word read before each row's target and detail: colour and the icon alone don't reach a
 *  screen reader. */
const KIND_WORD: Record<ChangeKind, string> = {
  registry: "Registry change",
  registry_delete: "Registry removal",
  workspace: "OffShoot Helper workspace",
  file: "File",
  delete: "Delete",
  attach: "Attach",
  detach: "Detach",
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
 * Re-plans every time it opens, since the machine may have changed since the last look (spec §7). Guards
 * against two ways a real write could otherwise run twice: an in-flight ref so a busy toast's "Try again"
 * can never overlap a click on the freshly re-enabled Apply button, and a live `open` ref so that toast does
 * nothing at all once the dialog it belongs to has closed (there has been no fresh dry run since).
 */
export function ChangePreviewDialog<P, R>({
  open, onOpenChange, title, applyLabel, destructive = false, plan, describe, apply, onApplied, returnFocus,
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
  /** Where to return focus if whatever opened this dialog is gone by the time it closes (its row was just
   *  deleted, say). There is no `DialogTrigger` here, so Radix has nothing of its own to fall back to. */
  returnFocus?: () => HTMLElement | null;
}) {
  const [phase, setPhase] = useState<Phase>("planning");
  const [model, setModel] = useState<PreviewModel | null>(null);
  const [planError, setPlanError] = useState<unknown>(null);
  const [retrying, setRetrying] = useState(false);

  // Guards a plan()/apply() in flight against a dialog that has since closed, reopened or been re-planned.
  const requestId = useRef(0);
  // True while a real apply() is in flight, so a busy toast's "Try again" can never overlap the button.
  const applyInFlightRef = useRef(false);
  // The latest `open`, read from a toast's "Try again" callback: it must do nothing once this dialog has
  // closed, since no fresh dry run has happened since.
  const openRef = useRef(open);
  openRef.current = open;
  // Whatever had focus just before this dialog opened, captured synchronously during render (before Radix's
  // own mount-focus effect can run) so it can be restored on close.
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(open);
  if (open && !wasOpenRef.current) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpenRef.current = open;

  const cancelRef = useRef<HTMLButtonElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);

  /** Resolves `plan()` and, on success, `describe()`; shared by the first plan on open and every Retry. */
  const settle = (id: number) =>
    plan().then(
      (p) => {
        if (requestId.current !== id) return;
        let m: PreviewModel;
        try {
          m = describe(p);
        } catch (e) {
          setPlanError(e);
          setPhase("plan-error");
          setRetrying(false);
          return;
        }
        setModel(m);
        setPhase(phaseOf(m));
        setRetrying(false);
      },
      (e: unknown) => {
        if (requestId.current !== id) return;
        setPlanError(e);
        setPhase("plan-error");
        setRetrying(false);
      },
    );

  const runPlan = () => {
    const id = ++requestId.current;
    applyInFlightRef.current = false;
    setPhase("planning");
    setPlanError(null);
    setRetrying(false);
    void settle(id);
  };

  /** Retry keeps showing the same `ErrorPanel` (with `retrying`, a busy button) instead of swapping to the
   *  planning skeletons, so focus never has to leave Retry and the last error stays visible while it runs. */
  const retry = () => {
    const id = ++requestId.current;
    setRetrying(true);
    void settle(id);
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
    if (applyInFlightRef.current) return; // Already running: a busy toast's Try again raced the button.
    if (!openRef.current) return; // Closed since the failure that offered Try again: no fresh dry run.
    applyInFlightRef.current = true;
    const id = ++requestId.current;
    setPhase("applying");
    apply().then(
      (result) => {
        applyInFlightRef.current = false;
        if (requestId.current !== id) return;
        onOpenChange(false);
        try {
          onApplied?.(result);
        } catch (e) {
          console.error("onApplied threw", e);
        }
      },
      (e: unknown) => {
        applyInFlightRef.current = false;
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

  const closeOnly = phase === "nothing-to-do" || phase === "blocked";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-w-[calc(100%-24px)] sm:max-w-[520px]"
        showCloseButton={!applying}
        onCloseAutoFocus={(e) => {
          // No DialogTrigger to fall back to: restore focus to whatever opened this, or the caller's
          // fallback when that element is gone (a deleted row's own trigger, say).
          e.preventDefault();
          const opener = openerRef.current;
          if (opener && opener.isConnected) {
            opener.focus();
            return;
          }
          const fallback = returnFocus?.() ?? null;
          if (fallback && fallback.isConnected) fallback.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={descriptionClass(phase)}>{descriptionText(phase, model)}</DialogDescription>
        </DialogHeader>

        {phase === "planning" && <PlanningSkeleton />}

        {phase === "plan-error" && (
          <ErrorPanel error={planError} onRetry={retry} retrying={retrying} title="Couldn't plan this change" />
        )}

        {phase === "blocked" && model?.blocked && <BlockedPanel reason={model.blocked} />}

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
            <ul aria-label="Changes" className="well flex max-h-[45vh] flex-col divide-y divide-border overflow-y-auto">
              {model.changes.map((row, i) => (
                <LedgerRow key={i} row={row} />
              ))}
            </ul>
          </>
        )}

        <DialogFooter>
          <Button ref={cancelRef} type="button" variant="outline" disabled={applying} onClick={() => close(false)}>
            {closeOnly ? "Close" : "Cancel"}
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
 *  since their visible content (a skeleton, an `ErrorPanel` with its own `alert`/`status`) already says as
 *  much. Blocked's reason lives in the visible `BlockedPanel` instead of here (a full-width panel, not a
 *  header line), so its description is sr-only too. */
function descriptionClass(phase: Phase): string {
  switch (phase) {
    case "ready":
    case "applying":
      return "text-base text-foreground";
    case "nothing-to-do":
      return "text-sm text-muted-foreground";
    case "planning":
    case "plan-error":
    case "blocked":
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
      return model?.blocked ?? "This change can't run.";
    case "nothing-to-do":
      return model?.nothingToDo;
    case "ready":
    case "applying":
      return model?.summary;
  }
}

/** The reason an action can't run at all: a full-width neutral panel with a muted icon, styled like
 *  `ErrorPanel`'s neutral busy variant — this isn't a failure or a thing to double-check, so it gets neither
 *  red nor amber (spec §2.7: colour marks only problems). */
function BlockedPanel({ reason }: { reason: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-border-strong bg-card p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.03)]"
    >
      <span className="flex h-lh shrink-0 items-center text-sm">
        <Ban aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <p className="min-w-0 flex-1 text-sm text-foreground">{reason}</p>
    </div>
  );
}

function PlanningSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <Skeleton className="h-4 w-3/4 rounded-sm" />
      <ul className="well flex flex-col divide-y divide-border">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-2 px-3 py-1.5">
            <Skeleton className="size-3.5 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
              <Skeleton className="h-3 w-2/3 rounded-sm" />
              <Skeleton className="h-2.5 w-1/3 rounded-sm" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LedgerRow({ row }: { row: ChangeRow }) {
  const Icon = KIND_ICON[row.kind];
  return (
    <li className="flex items-start gap-2 px-3 py-1.5">
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <span className="sr-only">{KIND_WORD[row.kind]}</span>
      <div className="min-w-0 flex-1">
        <Mono className="block text-xs break-words">{wrapPath(row.target)}</Mono>
        {row.detail && <p className="text-xs text-muted-foreground">{renderWords(row.detail)}</p>}
      </div>
    </li>
  );
}

/** Inserts a break opportunity after each path separator, so a long path wraps at its natural joints
 *  instead of splitting mid-word; `break-words` on the caller's element is only the fallback for a run with
 *  no separator at all. */
export function wrapPath(path: string): React.ReactNode {
  const parts = path.split(/(?<=[\\/])/);
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    nodes.push(part);
    if (i < parts.length - 1) nodes.push(<wbr key={i} />);
  });
  return nodes;
}

/** Renders `Words` for a warning or a ledger detail: the path portion, if any, in mono with wrap-friendly
 *  breaks; everything else stays plain text, inheriting whatever colour the row already has. */
export function renderWords(words: Words): React.ReactNode {
  if (!words.path) return words.text;
  return (
    <>
      {words.text}
      <span className="font-mono">{wrapPath(words.path)}</span>
    </>
  );
}
