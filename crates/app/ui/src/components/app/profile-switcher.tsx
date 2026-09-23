import { useRef, useState } from "react";
import { ChevronDown, Layers, Plus } from "lucide-react";
import { useActivateProfile, useHomeSummary } from "@/api/queries";
import { CreateProfileDialog } from "@/components/app/create-profile-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { showError } from "@/lib/toast";

/** Spec §6.1: sits in the toolbar. With no active profile, Home shows its first-run steps instead (renders nothing here). */
export function ProfileSwitcher() {
  const summary = useHomeSummary();
  const activate = useActivateProfile();
  const [createOpen, setCreateOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (summary.isPending) return <Skeleton className="h-7 w-28 rounded-full" />;

  const active = summary.data?.active_profile ?? null;
  if (!active) return null;
  const profiles = summary.data?.profiles ?? [];

  const switchTo = (name: string) => {
    if (name === active || activate.isPending) return;
    const retry = () => activate.mutate(name, { onError: (e) => showError(e, retry) });
    retry();
  };

  /** The dialog opens over the dropdown, not from a `DialogTrigger`, so Radix has nothing to return focus to
   *  on close; do it ourselves, after its own close effects have run. */
  const setCreateDialogOpen = (next: boolean) => {
    setCreateOpen(next);
    if (!next) requestAnimationFrame(() => triggerRef.current?.focus());
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
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Profiles</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={active} onValueChange={switchTo}>
            {profiles.map((name) => (
              <DropdownMenuRadioItem key={name} value={name} className="font-mono">
                {name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateDialogOpen(true)}>
            <Plus aria-hidden strokeWidth={1.75} /> New profile…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateProfileDialog open={createOpen} onOpenChange={setCreateDialogOpen} activate />
    </>
  );
}
