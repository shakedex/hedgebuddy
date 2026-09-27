import { useEffect, useMemo, useRef, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { callApp } from "@/api/bridge";
import { useCreateScript } from "@/api/queries";
import type { AppRow, AppsOverviewOutput } from "@/api/tools.gen";
import { ErrorPanel } from "@/components/app/error-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { showError } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** Script-name rule (Task 12 step 4): ends in `.py`, no path characters, and not already the name of a
 *  script in this profile — `write_script` is create-or-replace, so an unchecked collision would silently
 *  overwrite (and could detach) an existing, possibly-attached script. Windows and macOS file systems are
 *  both case-insensitive, so the collision check is too. The real check (`write_script`) stays the authority
 *  for everything else; this is only a quick, honest pre-flight. */
function nameError(name: string, existingNamesLower: ReadonlySet<string>): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Name the script.";
  if (!trimmed.endsWith(".py")) return "Must end in .py.";
  if (/[\\/]/.test(trimmed)) return "No path characters.";
  if (existingNamesLower.has(trimmed.toLowerCase())) return "A script with this name already exists.";
  return null;
}

/** Apps with at least one scripting event, installed ones first (their own catalog order preserved within
 *  each group — `Array.prototype.sort` is stable). */
function eligibleApps(data: AppsOverviewOutput | undefined): AppRow[] {
  const apps = (data?.apps ?? []).filter((a) => a.events.length > 0);
  return [...apps].sort((a, b) => Number(b.status.installed) - Number(a.status.installed));
}

/**
 * New script (spec §6.4 step 4): pick an app and event, `script_template` suggests starter source and a
 * free name, then Create runs `write_script` → `open_in_editor` and hands the new name to `onCreated` (the
 * caller navigates). This is a plain modal, not a route, and needs no `confirmLeave` — closing it just
 * discards an unstarted pick.
 */
export function NewScriptDialog({ open, onOpenChange, profile, appsOverview, existingNames, onCloseFocus, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: string;
  appsOverview: UseQueryResult<AppsOverviewOutput>;
  /** The profile's current script names (any case), so a new name that collides can be caught before
   *  `write_script` silently overwrites it. */
  existingNames: readonly string[];
  /** Where to send focus once this closes — there is no `DialogTrigger` here. */
  onCloseFocus?: () => void;
  /** Called with the new script's name once it exists; the caller navigates to it. */
  onCreated: (name: string) => void;
}) {
  const apps = eligibleApps(appsOverview.data);
  const existingNamesLower = useMemo(() => new Set(existingNames.map((n) => n.toLowerCase())), [existingNames]);

  const [appId, setAppId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [nameField, setNameField] = useState("");
  const nameTouchedRef = useRef(false);

  const [template, setTemplate] = useState<{ name: string; source: string } | null>(null);
  const [templateError, setTemplateError] = useState<unknown>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const templateRequestId = useRef(0);

  const create = useCreateScript();
  const inFlightRef = useRef(false);
  // Bumped on every open *and* every close (the effect below), so a closure from an earlier open/close cycle
  // — a busy toast's "Try again", bound to a `submit` from before the operator cancelled and reopened this
  // same (never-unmounted) dialog — can tell it no longer belongs to the current one and bail before it ever
  // calls `create.mutate` again, instead of silently re-running (and possibly re-writing) a stale attempt.
  // The cleanup also bumps it once more on a true unmount (not just an `open` toggle): an external profile
  // switch can remove this whole dialog from the tree while a create was in flight, and without this, a
  // stale "Try again" from that torn-down instance would still see its captured `session` match
  // `sessionRef.current` (nothing left to bump it) and go on to write into the profile just switched away
  // from.
  const sessionRef = useRef(0);
  useEffect(() => {
    sessionRef.current++;
    return () => {
      sessionRef.current++;
    };
  }, [open]);

  // Picks a default app (installed first) once the catalog loads, if nothing has been picked yet. Guarded
  // on `open`: this dialog stays mounted between opens (so its Cancel/close reset has something to reset),
  // and without the guard it would pre-fetch a template in the background before the operator ever opens it.
  useEffect(() => {
    if (!open || appId !== null || apps.length === 0) return;
    setAppId(apps[0].status.id);
    setEventId(apps[0].events[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appsOverview.data]);

  const selectedApp = apps.find((a) => a.status.id === appId) ?? null;

  const fetchTemplate = () => {
    if (!appId || !eventId) {
      setTemplate(null);
      return;
    }
    const id = ++templateRequestId.current;
    setTemplateLoading(true);
    setTemplateError(null);
    callApp("script_template", { app: appId, event: eventId, profile }).then(
      (result) => {
        if (templateRequestId.current !== id) return;
        setTemplate(result);
        setTemplateLoading(false);
        if (!nameTouchedRef.current) setNameField(result.name);
      },
      (e: unknown) => {
        if (templateRequestId.current !== id) return;
        setTemplateError(e);
        setTemplateLoading(false);
      },
    );
  };

  useEffect(() => {
    if (!open) return;
    fetchTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appId, eventId, profile]);

  const reset = () => {
    setAppId(null);
    setEventId(null);
    setNameField("");
    nameTouchedRef.current = false;
    setTemplate(null);
    setTemplateError(null);
    templateRequestId.current++;
    create.forgetRetry();
  };

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const trimmedName = nameField.trim();
  const nameErr = nameError(nameField, existingNamesLower);
  const canCreate = template !== null && nameErr === null && !templateLoading;

  // Captured once per render (a plain local, not read from the ref at call time), so a `submit` closure from
  // an earlier open/close cycle keeps *its own* session number even though `sessionRef.current` has since
  // moved on — that's exactly what lets the guard below tell old from current.
  const session = sessionRef.current;

  const submit = () => {
    if (inFlightRef.current) return;
    if (session !== sessionRef.current) return; // This dialog has closed and/or reopened since; not ours to run.
    if (!template || nameErr) return;
    inFlightRef.current = true;
    create.mutate(
      { name: trimmedName, source: template.source, profile },
      {
        onSuccess: (result) => {
          inFlightRef.current = false;
          if (session !== sessionRef.current) return;
          toast(`Created ${result.name}`);
          close(false);
          onCreated(result.name);
        },
        onError: (e) => {
          inFlightRef.current = false;
          if (session !== sessionRef.current) return;
          showError(e, submit);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="sm:max-w-[460px]"
        onCloseAutoFocus={(e) => {
          if (!onCloseFocus) return;
          e.preventDefault();
          onCloseFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>New script</DialogTitle>
          <DialogDescription>Pick what fires it, then it opens in your editor to write.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canCreate) submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-script-app">App</Label>
            {appsOverview.isPending ? (
              <Skeleton className="h-8 w-full" />
            ) : appsOverview.isError ? (
              <ErrorPanel error={appsOverview.error} onRetry={() => void appsOverview.refetch()} retrying={appsOverview.isFetching} />
            ) : (
              <Select
                value={appId ?? ""}
                onValueChange={(v) => {
                  setAppId(v);
                  const next = apps.find((a) => a.status.id === v);
                  setEventId(next?.events[0]?.id ?? null);
                }}
              >
                <SelectTrigger id="new-script-app">
                  <SelectValue placeholder="Choose an app" />
                </SelectTrigger>
                <SelectContent>
                  {apps.map((a) => (
                    <SelectItem key={a.status.id} value={a.status.id}>
                      {a.status.name}
                      {!a.status.installed && <span className="text-muted-foreground"> — not installed</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedApp && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-script-event">Event</Label>
              {/* Keyed on the app: Radix's Select trigger only reliably mirrors a *fresh* controlled value
                  (one already set when it mounts) — updating an already-mounted Select's `value` prop
                  programmatically (as the app switch's own default-event pick does) doesn't visibly update
                  the closed trigger until the operator opens it once. Remounting sidesteps that. */}
              <Select key={appId} value={eventId ?? ""} onValueChange={setEventId}>
                <SelectTrigger id="new-script-event">
                  {/* Overrides Radix's default mirroring of the selected item's rich (two-line) content, so
                      the closed trigger stays one line. */}
                  <SelectValue placeholder="Choose an event">
                    {eventId ? <span className="font-mono">{eventId}</span> : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {selectedApp.events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-mono text-foreground-strong">{e.id}</span>
                        <span className="text-xs text-muted-foreground">{e.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {templateError !== null && (
            <ErrorPanel error={templateError} onRetry={fetchTemplate} retrying={templateLoading} title="Couldn't load a starting point" />
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-script-name">Name</Label>
            <Input
              id="new-script-name"
              className="font-mono"
              spellCheck={false}
              value={nameField}
              disabled={templateLoading || !template}
              onChange={(e) => {
                nameTouchedRef.current = true;
                setNameField(e.target.value);
              }}
              aria-invalid={nameField !== "" && nameErr !== null}
              aria-describedby="new-script-name-hint"
            />
            <p id="new-script-name-hint" className={cn("text-xs", nameField !== "" && nameErr ? "text-destructive" : "text-muted-foreground")}>
              {nameField !== "" && nameErr ? nameErr : "Ends in .py, no path characters."}
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canCreate || create.isPending} aria-busy={create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
