import { useEffect, useRef, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { callApp, callTool } from "@/api/bridge";
import { invalidateFor, useProfiles } from "@/api/queries";
import type { ImportProfileOutput } from "@/api/tools.gen";
import { Mono } from "@/components/app/mono";
import { wrapPath } from "@/components/app/change-preview-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { plural } from "@/lib/format";
import { showError } from "@/lib/toast";
import { confirmLeave } from "@/lib/unsaved";
import { cn } from "@/lib/utils";

/** Main spec §5: a profile name is a slug. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SUFFIX = ".hedgebuddy.json";

/** `editing`/`importing`: the NAME field, before and during `import_profile`. `switch-pending`/`switching`:
 *  the import itself succeeded but activating it hasn't (yet) — a distinct, read-only state so the NAME
 *  field never gets a second look at a profile that, by definition, already exists (it's the one this
 *  dialog just created). */
type Phase = "editing" | "importing" | "switch-pending" | "switching";

/** The file's own name, without its extension, as the NAME field's starting point. */
function fileStem(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  const stem = base.endsWith(SUFFIX) ? base.slice(0, -SUFFIX.length) : base.replace(/\.[^.]*$/, "");
  return stem.toLowerCase();
}

function toastImported(result: ImportProfileOutput) {
  toast(
    `Imported ${result.profile}: ${result.variables} ${plural(result.variables, "variable")}, ${result.scripts} ${plural(result.scripts, "script")}.`,
    result.secrets_missing.length > 0
      ? {
          // Inline flow, not a flex row: a long list of names needs to wrap like ordinary text, with the
          // icon just sitting at the front of it rather than pinning the whole line to one row.
          description: (
            <span className="text-warning">
              <TriangleAlert aria-hidden className="mr-1 inline-block size-3.5 align-text-bottom" strokeWidth={1.75} />
              Set <Mono className="text-warning">{result.secrets_missing.join(", ")}</Mono> before its scripts run.
            </span>
          ),
        }
      : undefined,
  );
}

/**
 * Spec §6.3 "Import and export": creates a new profile from an export file. Not a `ChangePreviewDialog` —
 * import isn't in the change-preview list (global constraints) — but the caller has already picked the file
 * with `pick_import_file` before this ever opens.
 */
export function ImportProfileDialog({ open, onOpenChange, path, onCloseFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The file `pick_import_file` returned. The caller remounts this (a fresh `key`) each time a file is
   *  picked, so this only ever needs to derive its starting NAME once, from this prop. */
  path: string;
  onCloseFocus?: () => void;
}) {
  const profilesQuery = useProfiles();
  const [name, setName] = useState(() => fileStem(path));
  const [switchToIt, setSwitchToIt] = useState(true);
  const [phase, setPhase] = useState<Phase>("editing");
  /** Set once `import_profile` itself has succeeded; `switch-pending`/`switching` render from this instead
   *  of the (by-then-stale) NAME field. */
  const [imported, setImported] = useState<ImportProfileOutput | null>(null);

  const existing = profilesQuery.data?.profiles ?? [];
  const invalid = name.length > 0 && !SLUG.test(name);
  const collision = SLUG.test(name) && existing.includes(name);
  const canImport = SLUG.test(name) && !collision;

  // A busy toast's "Try again" can outlive an edit to these fields, or the dialog itself closing; read at
  // call time (Task 8's rule: a leftover Try again does nothing once nothing is listening, and never applies
  // twice) rather than closing over values from whichever render first bound the callback.
  const latestRef = useRef({ name, switchToIt, canImport });
  latestRef.current = { name, switchToIt, canImport };
  const inFlightRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const submitRef = useRef<HTMLButtonElement>(null);
  const switchRef = useRef<HTMLButtonElement>(null);
  // A plain `ref.current?.focus()` right where a failure sets the phase back to something interactive is a
  // no-op: the button is still `disabled` in the DOM at that point (the state update hasn't been rendered
  // yet). Doing it from an effect instead runs after the re-render that actually enables the button, the
  // same way `ChangePreviewDialog` waits for its own phase change before focusing Cancel/Apply.
  const [refocusSubmit, setRefocusSubmit] = useState(false);
  const [refocusSwitch, setRefocusSwitch] = useState(false);
  useEffect(() => {
    if (refocusSubmit && phase === "editing") {
      submitRef.current?.focus();
      setRefocusSubmit(false);
    }
  }, [refocusSubmit, phase]);
  useEffect(() => {
    if (refocusSwitch && phase === "switch-pending") {
      switchRef.current?.focus();
      setRefocusSwitch(false);
    }
  }, [refocusSwitch, phase]);

  const busy = phase === "importing" || phase === "switching";

  const requestClose = (next: boolean) => {
    if (!next && busy) return;
    onOpenChange(next);
  };

  // The profile is already created by the time this can run; a failure here retries only the switch, never
  // `import_profile` again (which would now fail with "already exists").
  const trySwitch = (result: ImportProfileOutput) => {
    inFlightRef.current = true;
    setPhase("switching");
    callTool("set_active_profile", { name: result.profile }).then(
      () => {
        inFlightRef.current = false;
        void invalidateFor(["index"]).then(() => {
          if (openRef.current) onOpenChange(false);
        });
      },
      (e: unknown) => {
        inFlightRef.current = false;
        // The profile exists now even though the switch didn't go through; other screens (the profile
        // menu's own list) should see it.
        void invalidateFor(["index"]);
        if (openRef.current) {
          setPhase("switch-pending");
          setRefocusSwitch(true);
        }
        showError(e, () => {
          if (inFlightRef.current || !openRef.current) return; // Guarded: Close may have won the race.
          trySwitch(result);
        });
      },
    );
  };

  const doSwitch = () => {
    if (!imported || inFlightRef.current || !openRef.current) return;
    // Rule for this task: switching changes the active profile, so it asks first, same as switching
    // profiles from the pill does. Declining leaves this dialog exactly as it was.
    void confirmLeave().then((ok) => {
      if (ok) trySwitch(imported);
    });
  };

  const doImport = () => {
    if (inFlightRef.current || !openRef.current) return;
    const cur = latestRef.current;
    if (!cur.canImport) return;
    inFlightRef.current = true;
    setPhase("importing");
    callApp("import_profile", { path, name: cur.name }).then(
      (result) => {
        inFlightRef.current = false;
        // The import already happened regardless of what a switch does next — say so right away.
        toastImported(result);
        setImported(result);
        if (cur.switchToIt && !result.active) {
          trySwitch(result);
        } else {
          void invalidateFor(["index"]).then(() => {
            if (openRef.current) onOpenChange(false);
          });
        }
      },
      (e: unknown) => {
        inFlightRef.current = false;
        if (openRef.current) {
          setPhase("editing");
          setRefocusSubmit(true);
        }
        showError(e, submit);
      },
    );
  };

  // Rule for this task: importing with "Switch to it" changes the active profile, so it asks first, exactly
  // like switching profiles does. Declining leaves the dialog open with nothing done.
  const submit = () => {
    const cur = latestRef.current;
    if (!cur.canImport || inFlightRef.current || !openRef.current) return;
    if (cur.switchToIt) void confirmLeave().then((ok) => { if (ok) doImport(); });
    else doImport();
  };

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        className="sm:max-w-[420px]"
        showCloseButton={!busy}
        onCloseAutoFocus={(e) => {
          if (!onCloseFocus) return;
          e.preventDefault();
          onCloseFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Import a profile</DialogTitle>
          <DialogDescription>
            <Mono className="block text-foreground break-words">{wrapPath(path)}</Mono>
          </DialogDescription>
        </DialogHeader>

        {phase === "switch-pending" || phase === "switching" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="micro-label">Name</span>
              <Mono className="text-foreground-strong">{imported?.profile}</Mono>
            </div>
            <p className="text-sm text-muted-foreground">Imported. Switching to it didn't go through yet.</p>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={phase === "switching"} onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button ref={switchRef} type="button" autoFocus disabled={phase === "switching"} aria-busy={phase === "switching"} onClick={doSwitch}>
                {phase === "switching" && <LoaderCircle aria-hidden className="size-3.5 animate-spin" strokeWidth={1.75} />}
                {phase === "switching" ? "Switching…" : `Switch to ${imported?.profile}`}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-name">Name</Label>
              <Input
                id="import-name"
                autoFocus
                className="font-mono"
                spellCheck={false}
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                aria-invalid={invalid || collision}
                aria-describedby="import-name-hint"
                disabled={phase === "importing"}
              />
              <p id="import-name-hint" className={cn("text-xs", invalid || collision ? "text-destructive" : "text-muted-foreground")}>
                {collision
                  ? "A profile with this name already exists."
                  : invalid
                    ? "Use lowercase letters, digits and dashes, starting with a letter or digit."
                    : "Lowercase letters, digits and dashes."}
              </p>
            </div>
            <Label className="min-h-7 w-fit">
              <Checkbox checked={switchToIt} onCheckedChange={(v) => setSwitchToIt(v === true)} disabled={phase === "importing"} />
              Switch to it
            </Label>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={phase === "importing"} onClick={() => requestClose(false)}>
                Cancel
              </Button>
              <Button ref={submitRef} type="submit" disabled={!canImport || phase === "importing"} aria-busy={phase === "importing"}>
                {phase === "importing" && <LoaderCircle aria-hidden className="size-3.5 animate-spin" strokeWidth={1.75} />}
                {phase === "importing" ? "Importing…" : "Import"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
