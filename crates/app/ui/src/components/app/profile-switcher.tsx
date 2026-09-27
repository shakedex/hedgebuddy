import { useRef, useState } from "react";
import { ChevronDown, Download, Layers, Plus, Trash2, Upload } from "lucide-react";
import { useActivateProfile, useProfiles } from "@/api/queries";
import { CreateProfileDialog } from "@/components/app/create-profile-dialog";
import { DeleteProfileDialog } from "@/components/app/delete-profile-dialog";
import { ExportProfileDialog } from "@/components/app/export-profile-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useImportProfile } from "@/hooks/use-import-profile";
import { showError } from "@/lib/toast";
import { confirmLeave } from "@/lib/unsaved";

type PendingAction = "create" | "export" | "import" | "delete" | null;

/**
 * Spec §6.1: sits in the toolbar. With no active profile, Home shows its first-run steps instead (the
 * trigger and its menu render nothing then — spec §6.1/§6.2's own first-run steps are where Import lives in
 * that case; see `useImportProfile`. The dialogs below still do render, so one closing mid-animation from a
 * delete that just cleared the active profile is never yanked out from under itself).
 *
 * Reads `list_profiles`, not the home summary: the summary reads nearly everything, so one bad file can fail
 * it, and the operator must still be able to switch away from a broken profile.
 */
export function ProfileSwitcher() {
  const profilesQuery = useProfiles();
  const activate = useActivateProfile();
  const [createOpen, setCreateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const importProfile = useImportProfile();
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Set by a menu item's `onSelect`, consumed by the dropdown's `onCloseAutoFocus` once it has actually
   *  closed — see that handler's own comment for why this can't happen straight from `onSelect`. */
  const pendingActionRef = useRef<PendingAction>(null);
  /** The profile `DeleteProfileDialog` is deleting, captured once when it opens rather than read live from
   *  `active`: deleting it is exactly what makes `active` go to `null`, and reading it live would rewrite
   *  the dialog's own title and summary out from under itself while it's still animating closed. */
  const deletingNameRef = useRef("");

  if (profilesQuery.isPending) return <Skeleton className="h-7 w-28 rounded-full" />;

  const active = profilesQuery.data?.active ?? null;
  const profiles = profilesQuery.data?.profiles ?? [];

  // Switching profiles changes the selection under an open editor without navigating anywhere (Task 6's
  // rule for that), so it asks first, same as a guarded navigate would.
  const switchTo = (name: string) => {
    if (name === active || activate.isPending) return;
    void confirmLeave().then((ok) => {
      if (!ok) return;
      const retry = () => activate.mutate(name, { onError: (e) => showError(e, retry) });
      retry();
    });
  };

  return (
    <>
      {active && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              ref={triggerRef}
              type="button"
              aria-label={`Profile ${active}. Change profile`}
              className="flex h-7 items-center gap-1.5 rounded-full border border-border-strong bg-card px-3 transition-colors duration-120 hover:bg-accent"
            >
              <Layers aria-hidden className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
              <span className="max-w-[200px] truncate font-mono text-xs text-foreground-strong">{active}</span>
              <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56"
            onCloseAutoFocus={(e) => {
              const action = pendingActionRef.current;
              if (!action) return; // A plain Escape, outside click or radio pick: let Radix restore focus itself.
              pendingActionRef.current = null;

              // New profile and Export open a dialog synchronously, so preventing Radix's own restore and
              // opening straight away never leaves a moment with nothing focused.
              if (action === "create" || action === "export") {
                e.preventDefault();
                if (action === "create") setCreateOpen(true);
                else setExportOpen(true);
                return;
              }

              // Delete and Import both need to do something asynchronous first (ask about unsaved edits, or
              // ask for a file) before either knows whether a second dialog even opens. Doing that straight
              // from onSelect (while the menu is still tearing down its own focus scope) is what left a
              // ghost DropdownMenuContent behind and broke focus restoration before — running it from here,
              // once the menu has genuinely closed, avoids that. Focus goes to the trigger up front so
              // there's never a gap with nothing focused, and so a `ChangePreviewDialog` (or `start()`'s own
              // opener capture) opened a beat later still captures the right element.
              e.preventDefault();
              triggerRef.current?.focus();

              if (action === "delete") {
                // Rule for this task: deleting the active profile changes it, so it asks first, same as
                // switching profiles. Declining leaves the menu closed and nothing else happens.
                const target = active;
                void confirmLeave().then((ok) => {
                  if (!ok || !target) return;
                  deletingNameRef.current = target;
                  setDeleteOpen(true);
                });
                return;
              }

              // action === "import"
              importProfile.start();
            }}
          >
            <DropdownMenuLabel>Profiles</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={active} onValueChange={switchTo}>
              {profiles.map((name) => (
                <DropdownMenuRadioItem key={name} value={name} className="font-mono">
                  {name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            {/*
              Opening a dialog straight from onSelect (while the menu is still tearing down its own focus
              scope) is what left a ghost DropdownMenuContent behind and broke focus restoration on Cancel.
              Instead this only flags the intent; onCloseAutoFocus above does the actual work once the menu
              is really gone.
            */}
            <DropdownMenuItem onSelect={() => { pendingActionRef.current = "create"; }}>
              <Plus aria-hidden strokeWidth={1.75} /> New profile…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { pendingActionRef.current = "export"; }}>
              <Download aria-hidden strokeWidth={1.75} /> Export profile…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { pendingActionRef.current = "import"; }}>
              <Upload aria-hidden strokeWidth={1.75} /> Import profile…
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => { pendingActionRef.current = "delete"; }}>
              <Trash2 aria-hidden strokeWidth={1.75} /> Delete profile…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <CreateProfileDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCloseFocus={() => triggerRef.current?.focus()}
        activate
      />
      <ExportProfileDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        name={active ?? ""}
        onCloseFocus={() => triggerRef.current?.focus()}
      />
      <DeleteProfileDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        name={deletingNameRef.current}
        // Deleting the active profile is exactly what unmounts this pill; fall back to the screen's own
        // heading rather than a trigger that's no longer there (or leaving focus on `<body>`).
        returnFocus={() => document.getElementById("screen-heading")}
      />
      {importProfile.dialog}
    </>
  );
}
