import { useRef, useState } from "react";
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

/** The file's own name, without its extension, as the NAME field's starting point. */
function fileStem(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  const stem = base.endsWith(SUFFIX) ? base.slice(0, -SUFFIX.length) : base.replace(/\.[^.]*$/, "");
  return stem.toLowerCase();
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
  const [importing, setImporting] = useState(false);

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

  const requestClose = (next: boolean) => {
    if (!next && importing) return;
    onOpenChange(next);
  };

  const finish = (result: ImportProfileOutput) => {
    void invalidateFor(["index"]).then(() => {
      inFlightRef.current = false;
      if (!openRef.current) return; // Closed since this started: nothing left to update or tell.
      // Deliberately not `setImporting(false)`: invalidating `index` just made the new profile show up in
      // `existing`, which would re-run the NAME field's own collision check against itself while this dialog
      // is still animating shut. Leaving the fields disabled through that is unnoticeable; recomputing "a
      // profile with this name already exists" for a profile that only exists because this import just
      // created it is not.
      toast(
        `Imported ${result.profile}: ${result.variables} ${plural(result.variables, "variable")}, ${result.scripts} ${plural(result.scripts, "script")}.`,
        result.secrets_missing.length > 0
          ? {
              description: (
                <span className="flex items-center gap-1.5 text-warning">
                  <TriangleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
                  Set <Mono className="text-warning">{result.secrets_missing.join(", ")}</Mono> before its scripts run.
                </span>
              ),
            }
          : undefined,
      );
      onOpenChange(false);
    });
  };

  // The profile is already created by the time this runs; a failure here retries only the switch, never
  // `import_profile` again (which would now fail with "already exists").
  const activateThen = (result: ImportProfileOutput) => {
    callTool("set_active_profile", { name: result.profile }).then(
      () => finish(result),
      (e: unknown) => {
        inFlightRef.current = false;
        if (openRef.current) setImporting(false);
        showError(e, () => {
          inFlightRef.current = true;
          setImporting(true);
          activateThen(result);
        });
      },
    );
  };

  const doImport = () => {
    if (inFlightRef.current || !openRef.current) return;
    const cur = latestRef.current;
    if (!cur.canImport) return;
    inFlightRef.current = true;
    setImporting(true);
    callApp("import_profile", { path, name: cur.name }).then(
      (result) => {
        if (cur.switchToIt && !result.active) activateThen(result);
        else finish(result);
      },
      (e: unknown) => {
        inFlightRef.current = false;
        if (openRef.current) setImporting(false);
        showError(e, submit);
      },
    );
  };

  // Rule for this task: importing with "Switch to it" changes the active profile, so it asks first, exactly
  // like switching profiles does. Declining leaves the dialog open with nothing done.
  const submit = () => {
    const cur = latestRef.current;
    if (!cur.canImport || inFlightRef.current) return;
    if (cur.switchToIt) void confirmLeave().then((ok) => { if (ok) doImport(); });
    else doImport();
  };

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        className="sm:max-w-[420px]"
        showCloseButton={!importing}
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
              disabled={importing}
            />
            <p id="import-name-hint" className={cn("text-xs", invalid || collision ? "text-destructive" : "text-muted-foreground")}>
              {collision
                ? "A profile with this name already exists."
                : invalid
                  ? "Use lowercase letters, digits and dashes, starting with a letter or digit."
                  : "Lowercase letters, digits and dashes."}
            </p>
          </div>
          <Label className="w-fit">
            <Checkbox checked={switchToIt} onCheckedChange={(v) => setSwitchToIt(v === true)} disabled={importing} />
            Switch to it
          </Label>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={importing} onClick={() => requestClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canImport || importing} aria-busy={importing}>
              {importing && <LoaderCircle aria-hidden className="size-3.5 animate-spin" strokeWidth={1.75} />}
              {importing ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
