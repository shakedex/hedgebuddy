import { useRef, useState } from "react";
import { ChevronDown, Layers, Plus } from "lucide-react";
import { useActivateProfile, useProfiles } from "@/api/queries";
import { CreateProfileDialog } from "@/components/app/create-profile-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { showError } from "@/lib/toast";
import { confirmLeave } from "@/lib/unsaved";

/**
 * Spec §6.1: sits in the toolbar. With no active profile, Home shows its first-run steps instead (renders
 * nothing here). Reads `list_profiles`, not the home summary: the summary reads nearly everything, so one bad
 * file can fail it, and the operator must still be able to switch away from a broken profile.
 */
export function ProfileSwitcher() {
  const profilesQuery = useProfiles();
  const activate = useActivateProfile();
  const [createOpen, setCreateOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Set by "New profile…"'s `onSelect`, consumed by the dropdown's `onCloseAutoFocus` once it has actually
   *  closed (a ref, not state: it's read once inside an event handler, never rendered). */
  const openCreateOnClose = useRef(false);

  if (profilesQuery.isPending) return <Skeleton className="h-7 w-28 rounded-full" />;

  const active = profilesQuery.data?.active ?? null;
  if (!active) return null;
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
            // "New profile…" doesn't open the dialog itself (see below); it only gets to here once the
            // menu has actually finished closing. Skip the menu's own restore-focus-to-the-pill default so
            // it doesn't fight the dialog's autofocus, and open the dialog instead.
            if (!openCreateOnClose.current) return;
            openCreateOnClose.current = false;
            e.preventDefault();
            setCreateOpen(true);
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
            Opening the dialog straight from onSelect (while the menu is still tearing down its own focus
            scope) is what left a ghost DropdownMenuContent behind and broke focus restoration on Cancel.
            Instead this only flags the intent; onCloseAutoFocus above does the actual opening once the
            menu is really gone.
          */}
          <DropdownMenuItem onSelect={() => { openCreateOnClose.current = true; }}>
            <Plus aria-hidden strokeWidth={1.75} /> New profile…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateProfileDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCloseFocus={() => triggerRef.current?.focus()}
        activate
      />
    </>
  );
}
