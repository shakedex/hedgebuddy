import { useRef } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { queryClient, queryKey, usePipInstall, useRecheckPython, useSettingsOverview } from "@/api/queries";
import type { BundleInfo, Os, PipInstallOutput, PythonStatus } from "@/api/tools.gen";
import { wrapPath } from "@/components/app/change-preview-dialog";
import { CommandWell } from "@/components/app/command-well";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { Readout } from "@/components/app/readout";
import { StatusIcon } from "@/components/app/status-icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatusKey } from "@/lib/status";
import { showError } from "@/lib/toast";

/** How the Hedge apps start Python on each OS (`python_env::launcher`): fixed per platform, independent of
 *  the interpreter actually found, so it needs no field of its own on `PythonStatus`. */
const LAUNCHER_LABEL: Record<Os, string> = { windows: "py -3", macos: "python3" };

/** The file name at the end of a path (`\` or `/`), for the bundled wheel's own readout — never the whole
 *  path (Connect's `claude-desktop-panel.tsx` has its own copy of this same one-liner). */
function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return idx === -1 ? path : path.slice(idx + 1);
}

/**
 * `python.problem`'s own `"; run: <command>"` suffix (`hedgebuddy-core`'s `package_problem`), split off so
 * the command can sit in its own `CommandWell` rather than run on inside the sentence.
 */
function splitProblem(problem: string): { sentence: string; command: string | null } {
  const at = problem.indexOf("; run: ");
  if (at === -1) return { sentence: problem, command: null };
  return { sentence: problem.slice(0, at), command: problem.slice(at + "; run: ".length) };
}

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

/** The HEDGEBUDDY PACKAGE readout's value (brief step 1): the installed version or "not installed", "needs
 *  <required>" in amber when there's a problem, and the icon plus word from `STATUS` — amber `package` for a
 *  problem, neutral `circle-check` "up to date" otherwise. */
function PackageValue({ python }: { python: PythonStatus }) {
  const hasProblem = python.problem !== null;
  const statusKey: StatusKey = hasProblem ? "package" : "packageOk";
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
        {hasProblem && (
          <span className="text-warning">
            , needs <Mono className="tabular-nums text-warning">{python.required}</Mono>
          </span>
        )}
      </span>
      <StatusIcon status={statusKey} label />
    </span>
  );
}

/**
 * The action row (brief step 1): "Install hedgebuddy <version>" when the package needs it, a wheel is
 * bundled and Python was found; a disabled button with a muted reason (and a `CommandWell` to copy from)
 * when it can't run; a quiet "Reinstall" once everything is already up to date. The three branches render
 * different elements, so which one is mounted can change out from under whatever had focus — the caller
 * (`PythonPanel`) handles that once `onInstall`'s own refetch has landed.
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

  if (hasProblem && bundle.wheel === null) {
    const { command } = splitProblem(python.problem!);
    return (
      <div className="flex w-full flex-col items-end gap-1.5">
        <Button size="sm" disabled aria-describedby="python-install-reason">
          Install
        </Button>
        <span id="python-install-reason" className="text-xs text-muted-foreground">
          This build has no bundled package.
        </span>
        {command && <CommandWell text={command} />}
      </div>
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
 *  own transcript in a scrolling well. `ref`/`tabIndex` let the caller land focus here once the control that
 *  started the install has disappeared from under it (brief: "Install disappears once the package is up to
 *  date"). */
function PipOutput({ result, outcomeRef }: {
  result: PipInstallOutput;
  outcomeRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={outcomeRef} tabIndex={-1} className="flex flex-col gap-1.5 outline-none">
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
      <pre className="well max-h-60 overflow-y-auto p-2 font-mono text-xs whitespace-pre-wrap text-foreground-strong">
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
  if (query.isError && !query.isSuccess) {
    return (
      <section className="surface flex flex-col gap-3 p-3">
        <h2 className="micro-label">Python the Hedge apps use</h2>
        <ErrorPanel error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      </section>
    );
  }

  const data = query.data;
  if (!data) return null;
  const { python, bundle } = data;

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
      // committed and painted the DOM it produces (the pip output block included) — one rAF is enough
      // margin for that commit to land before anything below reads the DOM.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
            "not found"
          )}
        </Readout>
        <Readout label="HEDGEBUDDY PACKAGE" mono={false}>
          <PackageValue python={python} />
        </Readout>
        <Readout label="BUNDLED PACKAGE" mono={bundle.wheel !== null}>
          {bundle.wheel ? basename(bundle.wheel) : "none in this build"}
        </Readout>
      </div>

      {install.data && <PipOutput result={install.data} outcomeRef={outcomeRef} />}

      <div className="flex flex-wrap items-start justify-end gap-3 border-t border-border pt-2">
        <button
          type="button"
          className="inline-flex min-h-7 shrink-0 items-center px-1 text-sm font-medium text-foreground hover:underline aria-disabled:pointer-events-none aria-disabled:opacity-60 aria-disabled:no-underline"
          aria-disabled={recheck.isPending}
          aria-busy={recheck.isPending}
          onClick={doRecheck}
        >
          {recheck.isPending ? "Checking…" : "Check again"}
        </button>
        <InstallAction python={python} bundle={bundle} onInstall={doInstall} installing={install.isPending} />
      </div>
    </section>
  );
}
