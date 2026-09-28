import { useRef } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { queryClient, queryKey, usePipInstall, useRecheckPython, useSettingsOverview } from "@/api/queries";
import type { BundleInfo, Os, PipInstallOutput, PythonStatus } from "@/api/tools.gen";
import { wrapPath } from "@/components/app/change-preview-dialog";
import { CheckAgainButton } from "@/components/app/check-again-button";
import { CommandWell } from "@/components/app/command-well";
import { Mono } from "@/components/app/mono";
import { Readout } from "@/components/app/readout";
import { StatusIcon } from "@/components/app/status-icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { basename, splitProblem } from "@/lib/format";
import type { StatusKey } from "@/lib/status";
import { showError } from "@/lib/toast";

/** How the Hedge apps start Python on each OS (`python_env::launcher`): fixed per platform, independent of
 *  the interpreter actually found, so it needs no field of its own on `PythonStatus`. */
const LAUNCHER_LABEL: Record<Os, string> = { windows: "py -3", macos: "python3" };

function PanelSkeleton() {
  return (
    <section className="surface flex flex-col gap-3 p-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-48 rounded-sm" />
      <Skeleton className="h-4 w-3/4 rounded-sm" />
      <Skeleton className="h-4 w-1/2 rounded-sm" />
      <Skeleton className="h-4 w-2/3 rounded-sm" />
    </section>
  );
}

/** The PACKAGE readout's value (brief step 1): the installed version or "not installed", "needs <required>"
 *  when there's a problem — only the version itself is amber, not the comma or "needs" (review round 2,
 *  minor) — and the icon plus word from `STATUS`: amber `package` for a problem, neutral `circle-check` "up
 *  to date" otherwise. When Python itself wasn't found, this only ever reads "not installed", plain: the
 *  INTERPRETER readout above already reports the real problem, and repeating it here said nothing new
 *  (review round 2, minor). */
function PackageValue({ python }: { python: PythonStatus }) {
  const showProblem = python.found && python.problem !== null;
  const statusKey: StatusKey = showProblem ? "package" : "packageOk";
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
      <span>
        {python.installed !== null ? (
          <>
            <Mono className="tabular-nums">{python.installed}</Mono> installed
          </>
        ) : (
          "not installed"
        )}
        {showProblem && (
          <>
            , needs <Mono className="tabular-nums text-warning">{python.required}</Mono>
          </>
        )}
      </span>
      {python.found && <StatusIcon status={statusKey} label />}
    </span>
  );
}

/**
 * The action row (brief step 1): "Install hedgebuddy <version>" when the package needs it, a wheel is
 * bundled and Python was found; a disabled button when it can't run (the reason sits beside it — a muted
 * span here, or, for the no-wheel case, a shared block the caller renders full-width below the row: review
 * round 2, minor); a quiet "Reinstall" once everything is already up to date. Which branch renders can
 * change out from under whatever had focus — the caller (`PythonPanel`) handles that once `onInstall`'s own
 * refetch has landed.
 */
function InstallAction({ python, bundle, onInstall, installing }: {
  python: PythonStatus;
  bundle: BundleInfo;
  onInstall: () => void;
  installing: boolean;
}) {
  const hasProblem = python.problem !== null;
  const busyClass = "aria-disabled:pointer-events-none aria-disabled:opacity-45";

  if (!python.found) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" disabled aria-describedby="python-install-reason">
          Install
        </Button>
        <span id="python-install-reason" className="text-xs text-muted-foreground">
          Install Python 3 first
        </span>
      </div>
    );
  }

  // The reason and its CommandWell live in `PythonPanel`, full-width, below the action row — `#python-
  // install-reason` there is what this describes (review round 2, minor: this used to carry its own
  // right-aligned reason and well, which forced the whole action row to wrap).
  if (hasProblem && bundle.wheel === null) {
    return (
      <Button size="sm" disabled aria-describedby="python-install-reason">
        Install
      </Button>
    );
  }

  if (hasProblem) {
    return (
      <Button size="sm" className={busyClass} aria-disabled={installing} aria-busy={installing} onClick={onInstall}>
        {installing ? "Installing…" : `Install hedgebuddy ${bundle.wheel_version ?? python.required}`}
      </Button>
    );
  }

  if (bundle.wheel !== null) {
    return (
      <button
        type="button"
        className={`inline-flex min-h-7 items-center px-1 text-sm font-medium text-foreground hover:underline ${busyClass} aria-disabled:no-underline`}
        aria-disabled={installing}
        aria-busy={installing}
        onClick={onInstall}
      >
        {installing ? "Installing…" : "Reinstall"}
      </button>
    );
  }

  return null;
}

/** The pip output block (Design direction 5C: "pip output"): one outcome line, then the command and pip's
 *  own transcript in a scrolling well. `ref`/`tabIndex` on the wrapper let the caller land focus here once
 *  the control that started the install has disappeared from under it (brief: "Install disappears once the
 *  package is up to date") — `outline-none` was dropped from it (review round 2, minor) so that focus still
 *  shows the usual ring; the well itself is independently focusable and scrollable from the keyboard
 *  (`tabIndex=0`, `aria-label`). */
function PipOutput({ result, outcomeRef }: {
  result: PipInstallOutput;
  outcomeRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={outcomeRef} tabIndex={-1} className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 text-sm">
        {result.ok ? (
          <>
            <CircleCheck aria-hidden className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-foreground">Installed hedgebuddy {result.installed ?? ""}</span>
          </>
        ) : (
          <>
            <CircleX aria-hidden className="size-3.5 text-destructive" strokeWidth={1.75} />
            <span className="text-destructive">pip failed (exit {result.exit_code})</span>
          </>
        )}
      </p>
      <pre
        tabIndex={0}
        aria-label="pip output"
        className="well max-h-60 overflow-y-auto p-2 font-mono text-xs whitespace-pre-wrap text-foreground-strong"
      >
        {result.command}
        {"\n"}
        {result.output}
      </pre>
    </div>
  );
}

/**
 * The Python panel (spec §6.7): the interpreter the Hedge apps use, the installed `hedgebuddy` package
 * against the one required, the bundled wheel, and Install/Reinstall from it. "Check again" re-probes
 * Python right now (`useRecheckPython`) instead of waiting out the 10-minute miss cache.
 */
export function PythonPanel() {
  const query = useSettingsOverview();
  const recheck = useRecheckPython();
  const install = usePipInstall();
  const outcomeRef = useRef<HTMLDivElement>(null);
  // Guards a fast second click: `mutateAsync` alone leaves a gap before `isPending` re-renders true, and a
  // second click in that gap would start a second `pip install` racing the first one (the Rust side refuses
  // it too — a mutex, not the data lock — and the mock mirrors that with its own one-at-a-time guard).
  const installingRef = useRef(false);

  if (query.isPending) return <PanelSkeleton />;
  // The shared `settings_overview` failure is shown once, by `SettingsScreen` — this panel simply doesn't
  // render while that's the case (review round 2, minor: "one ErrorPanel per failed query").
  if (query.isError && !query.isSuccess) return null;

  const data = query.data;
  if (!data) return null;
  const { python, bundle } = data;
  const noWheelReason = python.found && python.problem !== null && bundle.wheel === null;
  const noWheelCommand = noWheelReason ? splitProblem(python.problem!).command : null;

  const doRecheck = () => {
    if (recheck.isPending) return;
    recheck.mutate(undefined, { onError: (e) => showError(e) });
  };

  const doInstall = async () => {
    if (installingRef.current) return;
    installingRef.current = true;
    try {
      await install.mutateAsync();
      // The mutation's own `onSettled` (api/queries.ts) already invalidates `settings_overview` and
      // `home_summary`; awaiting the same invalidation here just means this doesn't move focus until that
      // refetch has actually landed and re-rendered (Connect's `onApplied` does the same).
      await queryClient.invalidateQueries({ queryKey: queryKey.app("settings_overview", {}) });
      // The awaits above resolve once React Query has the fresh data, not once React has actually
      // committed and painted the DOM it produces (the pip output block included). A `setTimeout`, not
      // `requestAnimationFrame`, gives that commit room to land: rAF callbacks are suspended for as long as
      // the page stays hidden (a minimised or occluded window), which would leave this permanently pending
      // and the redirect below would never run — `setTimeout` still fires in that case.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      // If the Install button is gone now that the state flipped — up to date, so the primary button
      // became the quiet "Reinstall" text button instead — the browser drops focus to <body> when a
      // focused element unmounts. Checking the *current* active element (rather than snapshotting it
      // before the call) also covers a webview that never focused the button on click at all (WebKit):
      // either way, landing on the outcome line beats leaving focus on <body>.
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body || !active.isConnected) {
        outcomeRef.current?.focus();
      }
    } catch (e) {
      showError(e);
    } finally {
      installingRef.current = false;
    }
  };

  return (
    <section className="surface @container flex flex-col gap-3 p-3">
      <h2 className="micro-label">Python the Hedge apps use</h2>

      <div className="flex flex-col gap-1.5">
        <Readout label="INTERPRETER" mono={python.found}>
          {python.found ? (
            <>
              {wrapPath(python.executable!)}{" "}
              <span className="text-muted-foreground">
                ({LAUNCHER_LABEL[data.os]}, {python.version})
              </span>
            </>
          ) : (
            <span className="flex flex-wrap items-start gap-x-1.5 gap-y-1">
              <StatusIcon status="pythonNotFound" label className="shrink-0" />
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
              {/* The STATUS word already says "not found" — this doesn't repeat it (`python.problem` here is
                  always the fixed "Python 3 was not found…" sentence: `python_status` in `home.rs` sets it
                  only for the `found: false` case). */}
              <span className="min-w-0 flex-1 break-words">The Hedge apps need Python 3 to run scripts.</span>
            </span>
          )}
        </Readout>
        <Readout label="PACKAGE" mono={false}>
          <PackageValue python={python} />
        </Readout>
        <Readout label="BUNDLED" mono={bundle.wheel !== null}>
          {bundle.wheel ? basename(bundle.wheel) : "none in this build"}
        </Readout>
      </div>

      {install.data && <PipOutput result={install.data} outcomeRef={outcomeRef} />}

      {noWheelReason && (
        <div className="flex flex-col gap-1.5">
          <p id="python-install-reason" className="min-w-0 text-xs break-words text-muted-foreground">
            This build has no bundled package. Run:
          </p>
          {noWheelCommand && <CommandWell text={noWheelCommand} />}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-end gap-3 border-t border-border pt-2">
        <CheckAgainButton pending={recheck.isPending} onClick={doRecheck} className="shrink-0" />
        <InstallAction python={python} bundle={bundle} onInstall={doInstall} installing={install.isPending} />
      </div>

      {data.install_command && (
        <p className="text-xs text-muted-foreground">
          Runs <Mono className="text-muted-foreground break-words">{wrapPath(data.install_command)}</Mono>
        </p>
      )}
    </section>
  );
}
