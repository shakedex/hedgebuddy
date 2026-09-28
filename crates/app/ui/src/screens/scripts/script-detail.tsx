import { useEffect, useRef, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { CircleCheck, CircleX, FileCode, FolderOpen, Package, SquarePen, TriangleAlert, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { callApp, callTool } from "@/api/bridge";
import { invalidateFor, invalidateHedgeState, useHomeSummary, useScriptCheck } from "@/api/queries";
import type {
  AppsOverviewOutput,
  AttachScriptOutput,
  DetachScriptOutput,
  Manifest,
  RequirementIssue,
  ScriptRow,
  ScriptsOverviewOutput,
  TargetAttachment,
} from "@/api/tools.gen";
import { ChangePreviewDialog, renderWords } from "@/components/app/change-preview-dialog";
import { CheckAgainButton } from "@/components/app/check-again-button";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describeActions, describeState } from "@/lib/actions";
import { appName, splitProblem } from "@/lib/format";
import { focusMainHeading } from "@/lib/focus";
import { STATUS, TONE_TEXT, type StatusKey, type Tone } from "@/lib/status";
import { clearBusyToast, showError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ScriptPreview } from "./script-preview";

function DetailSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 @max-[640px]:px-3">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 @max-[640px]:p-3">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="micro-label">{label}</span>
      {children}
    </div>
  );
}

/** The detail chip's STATUS key, from the attachment state alone (unlike the list row's icon, this is not
 *  weighted by manifest/catalog errors or unmet requirements — those already get their own dedicated amber
 *  panel and NEEDS rows, so folding them in here too would just repeat "needs a look" over the actual
 *  attachment word). STATUS has no entry of its own for `unknown` or `no_target`, so those borrow the
 *  closest fit: it needs a look (`alert`), or nothing can be attached at all (`detached`). `other_script`
 *  gets its own entry (`otherScript`) — this script itself is *not* attached, so reusing `attached` would say
 *  the opposite of what's true; the sentence below names the other script. */
function chipStatusKey(state: TargetAttachment["state"]): StatusKey {
  switch (state) {
    case "attached":
      return "attached";
    case "other_script":
      return "otherScript";
    case "staged":
      return "staged";
    case "external":
      return "external";
    case "stale":
      return "stale";
    case "manual":
      return "manual";
    case "unsupported":
      return "unsupported";
    case "unknown":
      return "alert";
    case "free":
    case "no_target":
      return "detached";
    default: {
      const exhaustive: never = state;
      throw new Error(`unknown attachment state: ${exhaustive}`);
    }
  }
}

function badgeVariant(tone: Tone): "default" | "warning" | "destructive" {
  if (tone === "warning") return "warning";
  if (tone === "destructive") return "destructive";
  return "default";
}

function StatusChip({ status }: { status: StatusKey }) {
  const { icon: Icon, word, tone } = STATUS[status];
  return (
    <Badge variant={badgeVariant(tone)}>
      <Icon aria-hidden strokeWidth={1.75} />
      {word}
    </Badge>
  );
}

/** The sentence explaining what the target event runs right now, in plain words (spec §7's `describeState`,
 *  adapted from `TargetAttachment` — a script's own view of "what's there" — to the `AttachState` shape
 *  `describeState` speaks). */
function targetSentence(row: ScriptRow): React.ReactNode {
  const a = row.attachment;
  const evt = row.target?.event;
  switch (a.state) {
    // Matches the list row's own words for `no_target` (script-list.tsx's `noTargetWord`): a manifest-less
    // script was never going to target anything, but one whose manifest simply doesn't name an app and
    // event is a step short of it, not a dead end.
    case "no_target":
      return row.manifest
        ? "Its manifest names no app event."
        : "No manifest, so HedgeBuddy doesn't know which event runs it.";
    case "attached":
      return `${evt} runs this script.`;
    case "staged":
      return `${evt}'s change to run this script is waiting in OffShoot Helper.`;
    case "other_script": {
      // `describeState`'s "attached" case never reads `path` (see `@/lib/actions`); the value only has to
      // satisfy the shape, not describe a real file.
      const words = describeState({ state: "attached", script: a.script, profile: a.profile, path: "" });
      return (
        <>
          {evt} runs {renderWords(words)}. Attaching replaces it.
        </>
      );
    }
    case "external": {
      const words = describeState({ state: "external", path: a.path });
      return (
        <>
          {evt} runs {renderWords(words)}. Attaching replaces it.
        </>
      );
    }
    case "stale": {
      const words = describeState({ state: "stale", path: a.path });
      return (
        <>
          {evt} points at {renderWords(words)}. Attaching replaces it.
        </>
      );
    }
    case "free":
      return `${evt} runs nothing yet.`;
    case "manual":
      return `${evt} is attached by hand: ${a.note}`;
    case "unsupported":
      return `${evt} doesn't support scripting here yet.`;
    case "unknown":
      return `${row.target?.app_name ?? appName(null)}'s settings couldn't be read: ${a.error}`;
    default: {
      const exhaustive: never = a;
      throw new Error(`unknown attachment state: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function CheckRow({ icon: Icon, tone, children }: { icon: LucideIcon; tone: Tone; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-sm">
      <Icon aria-hidden className={cn("mt-0.5 size-3.5 shrink-0", TONE_TEXT[tone])} strokeWidth={1.75} />
      <span
        className={cn(
          // `break-words`, not `break-all`: this row's text is ordinary prose (a package-problem sentence,
          // "Compiles", ...) that should only wrap at word boundaries. The Python-path fallback below keeps
          // its own `break-all` on the Mono around the raw path, which has no word boundaries to wrap at.
          "min-w-0 flex-1 break-words",
          tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : tone === "muted" ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {children}
      </span>
    </div>
  );
}

/** CHECK (spec §6.4 step 2): Python, compiles (or the compile error), and the `hedgebuddy` package, loaded
 *  when the detail opens, with its own "Check again". `check_script` itself carries no version numbers (only
 *  an executable path, and — when there's a problem — a sentence that already names the offending version);
 *  `home_summary.python` is where the actual Python and installed-package versions live, and the sidebar
 *  already fetches it, so this reads the same cached query rather than inventing another source of truth. */
function CheckSection({ name, profile }: { name: string; profile: string }) {
  const check = useScriptCheck(name, profile);
  const home = useHomeSummary();

  if (check.isPending) {
    return (
      <div className="flex flex-col gap-1.5" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-3.5 w-40" />
      </div>
    );
  }
  if (check.isError) {
    return <ErrorPanel error={check.error} onRetry={() => void check.refetch()} retrying={check.isFetching} title="Couldn't check this script" />;
  }
  if (!check.data) return null;
  const data = check.data;
  const python = home.data?.python;
  const installedVersion = python?.installed ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="micro-label">Check</span>
        <CheckAgainButton
          pending={check.isFetching}
          onClick={() => {
            if (!check.isFetching) void check.refetch();
          }}
        />
      </div>
      {data.python === null ? (
        <CheckRow icon={TriangleAlert} tone="warning">
          Python 3 not found
        </CheckRow>
      ) : (
        <>
          <CheckRow icon={CircleCheck} tone="neutral">
            {python?.version ? `Python ${python.version}` : <>Python <Mono className="text-foreground break-all">{data.python}</Mono></>}
          </CheckRow>
          {data.syntax_error ? (
            <CheckRow icon={CircleX} tone="destructive">
              Doesn't compile: <Mono className="text-foreground">{data.syntax_error}</Mono>
            </CheckRow>
          ) : (
            <CheckRow icon={CircleCheck} tone="neutral">
              Compiles
            </CheckRow>
          )}
          {data.package_problem ? (
            <CheckRow icon={Package} tone="warning">
              {/* Final review ruling: point to Settings' Install instead of the PyPI `pip install
                  hedgebuddy==X` command `package_problem`'s own text would otherwise show — PyPI isn't
                  published yet, so that command doesn't actually work. */}
              {splitProblem(data.package_problem).sentence}.{" "}
              <Link href="/settings" className="text-link hover:underline">
                Install in Settings
              </Link>
            </CheckRow>
          ) : installedVersion ? (
            <CheckRow icon={CircleCheck} tone="neutral">
              hedgebuddy {installedVersion}
            </CheckRow>
          ) : (
            <CheckRow icon={Package} tone="muted">
              hedgebuddy not installed
            </CheckRow>
          )}
        </>
      )}
    </div>
  );
}

/** NEEDS (spec §6.4 step 2): one row per `requires` entry — set, missing (links to add it), or the wrong
 *  type (links to fix it). */
function NeedsSection({ manifest, unmet }: { manifest: Manifest | null; unmet: RequirementIssue[] }) {
  const names = manifest ? Object.keys(manifest.requires).sort() : [];
  if (names.length === 0) return <p className="text-sm text-muted-foreground">Needs no variables.</p>;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
      {names.map((varName) => {
        const issue = unmet.find((u) => u.name === varName);
        return (
          <div key={varName} className="contents">
            <Mono className="min-w-0 truncate text-sm" title={varName}>
              {varName}
            </Mono>
            {!issue ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                <CircleCheck aria-hidden className="size-3.5" strokeWidth={1.75} /> set
              </span>
            ) : (
              <Link
                href={`/variables/${encodeURIComponent(varName)}`}
                className="inline-flex min-h-7 shrink-0 items-center gap-1.5 text-sm font-medium text-warning hover:underline"
              >
                {issue.kind === "missing" ? "missing · Add" : `should be ${issue.expected} · Fix`}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The Scripts detail (spec §6.4): app/event and attachment state, required variables, the Python check, a
 * read-only preview, and Open in editor / Show in folder / Detach or Attach / Delete.
 */
export function ScriptDetail({ name, profile, overview, appsOverview }: {
  name: string;
  profile: string;
  overview: UseQueryResult<ScriptsOverviewOutput>;
  appsOverview: UseQueryResult<AppsOverviewOutput>;
}) {
  const [, navigate] = useLocation();

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [openingEditor, setOpeningEditor] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [detachOpen, setDetachOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const attachDetachRef = useRef<HTMLButtonElement>(null);
  // Set right when Attach or Detach applies, before the async Hedge-state refetch that may flip this same
  // button between Attach and Detach — and, for Attach, between enabled and disabled — has landed. The
  // effect below re-checks once that refetch actually lands and this button's own disabled-ness is finally
  // known, since a disabled button silently refuses `.focus()` (and the browser blurs it outright if it
  // becomes disabled while it holds focus), rather than trying once, synchronously, against stale data.
  const pendingRefocusRef = useRef(false);

  // Hooks run unconditionally, above every early return below, so these have to tolerate data that isn't
  // there yet (or a script that no longer is) rather than reading off `overview.data` directly.
  const dataReady = Boolean(overview.data) && overview.data?.profile === profile;
  const scriptRow = dataReady ? overview.data!.scripts.find((s) => s.name === name) : undefined;
  const canDetach = scriptRow ? scriptRow.attachment.state === "attached" || scriptRow.attachment.state === "staged" : false;
  const canAttach = scriptRow ? ["free", "stale", "external", "other_script"].includes(scriptRow.attachment.state) : false;
  const attachDisabled = scriptRow ? scriptRow.unmet.length > 0 : false;

  useEffect(() => {
    if (!pendingRefocusRef.current) return;
    const el = attachDetachRef.current;
    if (el && !el.disabled) {
      el.focus();
      pendingRefocusRef.current = false;
    } else if (el && el.disabled) {
      focusMainHeading();
      pendingRefocusRef.current = false;
    }
    // No `el` at all (neither Attach nor Detach renders, e.g. the target went `manual`/`unsupported`) is
    // left pending rather than guessed at — Radix's own restore already tried the (now-gone) opener.
  }, [attachDisabled, canDetach, canAttach]);

  if (overview.isPending) return <DetailSkeleton />;
  if (overview.isError && !overview.isSuccess) {
    return (
      <div className="p-4 @max-[640px]:p-3">
        <ErrorPanel error={overview.error} onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
      </div>
    );
  }
  // Guards the same profile race `VariableDetail` guards against: until this overview genuinely belongs to
  // `profile`, treat it as still loading rather than reading (or acting on) another profile's script.
  if (!dataReady) return <DetailSkeleton />;
  if (!scriptRow) {
    return (
      <div className="flex h-full p-4 @max-[640px]:p-3">
        <EmptyState
          icon={FileCode}
          title={
            <>
              No <Mono className="text-foreground-strong">{name}</Mono> in <Mono className="text-foreground-strong">{profile}</Mono>.
            </>
          }
          className="m-auto"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/scripts">Back to scripts</Link>
            </Button>
          }
        >
          It may be in another profile, or deleted.
        </EmptyState>
      </div>
    );
  }

  const unmetNames = scriptRow.unmet.map((u) => u.name);

  const handleOpenEditor = () => {
    if (openingEditor) return;
    setOpeningEditor(true);
    callApp("open_in_editor", { profile, script: name }).then(
      (r) => {
        if (mountedRef.current) setOpeningEditor(false);
        clearBusyToast();
        toast(`Opened in ${r.with}`);
      },
      (e: unknown) => {
        if (mountedRef.current) setOpeningEditor(false);
        showError(e, handleOpenEditor);
      },
    );
  };

  const handleReveal = () => {
    if (revealing) return;
    setRevealing(true);
    callApp("reveal_path", { path: scriptRow.path }).then(
      () => {
        if (mountedRef.current) setRevealing(false);
        clearBusyToast();
      },
      (e: unknown) => {
        if (mountedRef.current) setRevealing(false);
        showError(e, handleReveal);
      },
    );
  };

  const errorText = scriptRow.manifest_error ?? scriptRow.catalog_error;
  const sentence = targetSentence(scriptRow);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-border px-4 @max-[640px]:px-3">
        {/* `break-all`, not `truncate`: script names can run long, and a cut-off name is worse here than a
            name that wraps to a second line (design direction rule 5). `flex-auto` (not `flex-1`, which gives
            a zero flex-basis): the name should claim its own natural width first, so on a short name the two
            buttons wrap to their own line below it, and a mid-word break only happens once the name itself is
            longer than the whole row. */}
        <Mono className="min-w-0 flex-auto break-all text-base font-medium" title={name}>
          {name}
        </Mono>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" disabled={openingEditor} onClick={handleOpenEditor}>
            <SquarePen aria-hidden strokeWidth={1.75} /> Open in editor
          </Button>
          {/* aria-disabled (not disabled): a focused button that goes natively `disabled` mid-click drops
              keyboard focus to <body> in some webviews (Task 6 review round 2, Important 2). `handleReveal`
              itself ignores a click while already revealing. */}
          <Button
            variant="ghost"
            size="sm"
            className="aria-disabled:pointer-events-none aria-disabled:opacity-45"
            aria-disabled={revealing}
            aria-busy={revealing}
            onClick={handleReveal}
          >
            <FolderOpen aria-hidden strokeWidth={1.75} /> Show in folder
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 @max-[640px]:p-3">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {scriptRow.target && (
                <Badge>
                  {scriptRow.target.app_name} · {scriptRow.target.event}
                </Badge>
              )}
              <StatusChip status={chipStatusKey(scriptRow.attachment.state)} />
            </div>
            {sentence && <p className="text-sm text-foreground">{sentence}</p>}
          </div>

          {errorText && (
            <div className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-tint px-3 py-2">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={1.75} />
              <p className="min-w-0 flex-1 text-xs text-warning">{errorText}</p>
            </div>
          )}

          <Field label="Needs">
            <NeedsSection manifest={scriptRow.manifest} unmet={scriptRow.unmet} />
          </Field>

          <CheckSection name={name} profile={profile} />

          <ScriptPreview name={name} profile={profile} />
        </div>
      </div>

      <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border px-4 py-2 @max-[640px]:px-3">
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          Delete
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* The reason a disabled Attach can't run stays neutral: the unmet requirement itself is already
              amber in NEEDS above, and it must wrap rather than clip, since it can name more than one
              variable (design direction rule 7b). */}
          {canAttach && attachDisabled && (
            <span id={`script-attach-reason-${name}`} className="max-w-[24rem] text-xs text-muted-foreground">
              Set <Mono className="text-muted-foreground">{unmetNames.join(", ")}</Mono> first
            </span>
          )}
          {canDetach && (
            <Button ref={attachDetachRef} variant="outline" size="sm" onClick={() => setDetachOpen(true)}>
              Detach
            </Button>
          )}
          {canAttach && (
            <Button
              ref={attachDetachRef}
              variant="outline"
              size="sm"
              disabled={attachDisabled}
              aria-describedby={attachDisabled ? `script-attach-reason-${name}` : undefined}
              onClick={() => setAttachOpen(true)}
            >
              Attach
            </Button>
          )}
        </div>
      </div>

      <ChangePreviewDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        title="Attach"
        applyLabel="Attach"
        plan={() => callTool("attach_script", { name, dry_run: true, profile })}
        describe={(p: AttachScriptOutput) => ({
          summary: (
            <>
              Attach <Mono className="text-foreground">{name}</Mono> to {appName(p.app)} · {p.event}.
            </>
          ),
          warnings: p.replaces
            ? [
                <>
                  It replaces {renderWords(describeState(p.replaces))}.
                </>,
              ]
            : undefined,
          changes: describeActions(p.actions),
        })}
        apply={() => callTool("attach_script", { name, profile })}
        onApplied={(result) => {
          invalidateHedgeState();
          toast(`Attached ${name}`);
          if (appsOverview.data?.os === "macos" && result.note) toast(result.note, { duration: 8000 });
          pendingRefocusRef.current = true;
        }}
      />

      <ChangePreviewDialog
        open={detachOpen}
        onOpenChange={setDetachOpen}
        title="Detach"
        applyLabel="Detach"
        plan={() => callTool("detach_script", { name, dry_run: true, profile })}
        describe={(p: DetachScriptOutput) => ({
          summary: (
            <>
              Detach <Mono className="text-foreground">{name}</Mono> from{" "}
              {scriptRow.target ? `${scriptRow.target.app_name} · ${scriptRow.target.event}` : "its app event"}.
            </>
          ),
          changes: describeActions(p.actions),
        })}
        apply={() => callTool("detach_script", { name, profile })}
        onApplied={(result) => {
          invalidateHedgeState();
          toast(`Detached ${name}`);
          // Ruling reversed on review: the real tool adds this note on detach too, so it belongs here exactly
          // as it does after Attach and Sync.
          if (appsOverview.data?.os === "macos" && result.note) toast(result.note, { duration: 8000 });
          pendingRefocusRef.current = true;
        }}
      />

      <ChangePreviewDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${name}?`}
        applyLabel="Delete"
        destructive
        // Ruling: after deleting a script, focus goes to the list (the listbox), not a heading. The listbox
        // is still there — at 480 the route swaps to the bare list, at 960 it's beside the (now-empty) detail
        // pane — so this is the fallback whenever the dialog's own opener (the Delete button, gone once the
        // route navigates away) is not; `screen-heading` only covers the case neither exists.
        returnFocus={() => document.getElementById("scripts-listbox") ?? document.getElementById("screen-heading")}
        plan={() => callTool("delete_script", { name, dry_run: true, profile })}
        describe={(p) => {
          if (!("would_delete" in p)) throw new Error("delete_script: unexpected dry-run result");
          return {
            summary: (
              <>
                Delete <Mono className="text-foreground">{name}</Mono> from <Mono className="text-foreground">{profile}</Mono>.
              </>
            ),
            changes: [{ kind: "delete", target: scriptRow.path, detail: { text: "removed" } }],
            warnings:
              p.attached_to.length > 0
                ? p.attached_to.map((a) => (
                    <>
                      {appName(a.app)} · {a.event} still runs it. Detach it first, or the event will point at a missing file.
                    </>
                  ))
                : undefined,
          };
        }}
        apply={() => callTool("delete_script", { name, profile })}
        onApplied={async () => {
          toast(`Deleted ${name}`);
          // Navigate *before* awaiting the invalidation, not after: awaiting first would let the refetch land
          // (removing this row from `overview.data`) while this route is still showing it, flashing "This
          // script is gone" for a frame before the navigate below finally ran.
          navigate("/scripts", { replace: true });
          invalidateHedgeState();
          await invalidateFor([`scripts:${profile}`]);
        }}
      />
    </div>
  );
}
