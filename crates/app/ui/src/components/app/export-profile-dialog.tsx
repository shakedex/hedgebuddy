import { useEffect, useRef, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { callApp } from "@/api/bridge";
import { useVariablesOverview } from "@/api/queries";
import { Mono } from "@/components/app/mono";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { showError } from "@/lib/toast";

/**
 * Spec §6.3 "Import and export": writes the active profile to JSON, secrets left out unless ticked. Not a
 * `ChangePreviewDialog` — export isn't in the change-preview list (global constraints), so this just runs
 * the two app commands directly.
 */
export function ExportProfileDialog({ open, onOpenChange, name, onCloseFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The profile to export: always the active one. */
  name: string;
  onCloseFocus?: () => void;
}) {
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Only fetched to name the secrets in the warning note below; gated on `open` so a dialog that's never
  // opened never costs a background fetch.
  const overview = useVariablesOverview(open);
  const secretNames = (overview.data?.variables ?? []).filter((v) => v.type === "secret").map((v) => v.name);

  // A busy toast's "Try again" can outlive an edit to the checkbox, or the dialog itself closing; read at
  // call time so it never resurrects a stale tick, and never fires once nothing is listening any more.
  const latestRef = useRef({ includeSecrets });
  latestRef.current = { includeSecrets };
  const inFlightRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  // The button the whole pick-then-export flow started from; a cancelled or failed pick disables it, which
  // blurs it, so it has to be refocused once the flow settles back to something interactive. Set only when
  // that refocus is actually wanted — not on the success path, where the dialog is closing anyway.
  const chooseRef = useRef<HTMLButtonElement>(null);
  const [refocusChoose, setRefocusChoose] = useState(false);
  // A plain `chooseRef.current?.focus()` right where `exporting` is set back to `false` is a no-op: the
  // button is still disabled in the DOM at that point (the state update hasn't been rendered yet). Doing it
  // from an effect instead runs after the re-render that actually enables the button, the same way
  // `ChangePreviewDialog` waits for its own phase change before focusing Cancel/Apply.
  useEffect(() => {
    if (refocusChoose && !exporting) {
      chooseRef.current?.focus();
      setRefocusChoose(false);
    }
  }, [refocusChoose, exporting]);

  /** Only guards a dismiss attempt (Escape, overlay, Cancel) while a write is in flight; the success path
   *  below closes directly instead, so it never reads this same (by-then-stale) `exporting` closure. */
  const requestClose = (next: boolean) => {
    if (!next && exporting) return;
    if (!next) setIncludeSecrets(false);
    onOpenChange(next);
  };

  const doExport = () => {
    if (inFlightRef.current || !openRef.current) return;
    inFlightRef.current = true;
    setExporting(true);
    const cur = latestRef.current;
    callApp("pick_export_path", { default_name: `${name}.hedgebuddy.json` }).then(
      (picked) => {
        if (!picked.path) {
          // Cancelled: leave the dialog open with nothing changed.
          inFlightRef.current = false;
          if (openRef.current) {
            setExporting(false);
            setRefocusChoose(true);
          }
          return;
        }
        callApp("export_profile", { name, include_secrets: cur.includeSecrets, dest: picked.path }).then(
          (result) => {
            inFlightRef.current = false;
            if (!openRef.current) return;
            setExporting(false);
            setIncludeSecrets(false);
            toast(`Exported ${name} to ${result.path}`);
            onOpenChange(false);
          },
          (e: unknown) => {
            inFlightRef.current = false;
            if (openRef.current) {
              setExporting(false);
              setRefocusChoose(true);
            }
            showError(e, doExport);
          },
        );
      },
      (e: unknown) => {
        inFlightRef.current = false;
        if (openRef.current) {
          setExporting(false);
          setRefocusChoose(true);
        }
        showError(e, doExport);
      },
    );
  };

  // Whether the secrets note has anything definite to say yet: while `overview` is still loading or has
  // failed, the actual names aren't known — say something generic rather than hiding the warning outright
  // (spec: colour marks a problem, and "this will hold secrets in plain text" is one either way).
  const secretsKnown = overview.isSuccess;

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        className="sm:max-w-[420px]"
        showCloseButton={!exporting}
        onCloseAutoFocus={(e) => {
          if (!onCloseFocus) return;
          e.preventDefault();
          onCloseFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Export {name}</DialogTitle>
          <DialogDescription>Saves this profile's variables and scripts to one file you can import on another computer.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Label className="min-h-7 w-fit">
            <Checkbox
              checked={includeSecrets}
              onCheckedChange={(v) => setIncludeSecrets(v === true)}
              disabled={exporting}
            />
            Include secret values
          </Label>
          {includeSecrets && (!secretsKnown || secretNames.length > 0) && (
            <div className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-tint px-3 py-2">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={1.75} />
              <p className="text-xs text-warning">
                {secretsKnown ? (
                  <>
                    The file will hold <Mono className="text-warning">{secretNames.join(", ")}</Mono> in plain text. Keep it somewhere
                    private.
                  </>
                ) : (
                  "The file will hold this profile's secret values in plain text. Keep it somewhere private."
                )}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={exporting} onClick={() => requestClose(false)}>
            Cancel
          </Button>
          <Button ref={chooseRef} type="button" disabled={exporting} aria-busy={exporting} onClick={doExport}>
            {exporting && <LoaderCircle aria-hidden className="size-3.5 animate-spin" strokeWidth={1.75} />}
            {exporting ? "Exporting…" : "Choose where to save…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
