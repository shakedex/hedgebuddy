import { useRef, useState } from "react";
import { Link } from "wouter";
import { useActivateProfile } from "@/api/queries";
import { CreateProfileDialog } from "@/components/app/create-profile-dialog";
import { Mono } from "@/components/app/mono";
import { Button } from "@/components/ui/button";
import { useImportProfile } from "@/hooks/use-import-profile";
import { showError } from "@/lib/toast";

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="readout grid size-6 shrink-0 place-items-center rounded-md border border-border-strong text-xs font-medium text-foreground-strong"
    >
      {n}
    </span>
  );
}

function ChooseProfile({ profiles }: { profiles: string[] }) {
  const activate = useActivateProfile();
  const [createOpen, setCreateOpen] = useState(false);
  const newProfileRef = useRef<HTMLButtonElement>(null);
  const importProfile = useImportProfile();
  const activateTo = (name: string) => {
    const retry = () => activate.mutate(name, { onError: (e) => showError(e, retry) });
    retry();
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {profiles.map((name) => (
          <Button key={name} variant="outline" size="sm" className="h-auto min-w-0 max-w-full whitespace-normal" disabled={activate.isPending} onClick={() => activateTo(name)}>
            <Mono className="break-all">{name}</Mono>
          </Button>
        ))}
      </div>
      {/* Secondary to the chooser above (spec: with profiles that already exist, picking one is the main
          action here) — quiet `ghost` buttons rather than the chooser's own `outline`, so the two don't
          read as the same kind of choice. */}
      <div className="flex flex-wrap gap-2">
        <Button ref={newProfileRef} variant="ghost" size="sm" className="w-fit" onClick={() => setCreateOpen(true)}>
          New profile…
        </Button>
        <Button variant="ghost" size="sm" className="w-fit" disabled={importProfile.picking} onClick={importProfile.start}>
          Import profile…
        </Button>
      </div>
      <CreateProfileDialog open={createOpen} onOpenChange={setCreateOpen} activate onCloseFocus={() => newProfileRef.current?.focus()} />
      {importProfile.dialog}
    </div>
  );
}

function CreateFirstProfile() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const importProfile = useImportProfile();
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button ref={triggerRef} size="sm" className="w-fit" onClick={() => setOpen(true)}>
          New profile…
        </Button>
        <Button variant="outline" size="sm" className="w-fit" disabled={importProfile.picking} onClick={importProfile.start}>
          Import profile…
        </Button>
      </div>
      <CreateProfileDialog open={open} onOpenChange={setOpen} activate onCloseFocus={() => triggerRef.current?.focus()} />
      {importProfile.dialog}
    </>
  );
}

/**
 * Spec §6.1: with no active profile, Home shows these two steps instead of the dashboard. `profiles` lets
 * step 1 tell "nobody has made one yet" (create) from "one exists but nothing is active" (choose).
 */
export function FirstRun({ profiles }: { profiles: string[] }) {
  const hasProfiles = profiles.length > 0;
  return (
    <div className="@container h-full overflow-y-auto">
      <div className="flex max-w-[560px] flex-col items-start gap-5 p-4 @max-[640px]:p-3">
        <div className="flex flex-col gap-1">
          <span className="micro-label">Welcome</span>
          {/* h2: the shell already renders the screen's h1 ("Home") in the toolbar above this. */}
          <h2 className="text-lg font-semibold text-foreground-strong">Two steps to get HedgeBuddy ready</h2>
        </div>
        <ol className="flex w-full flex-col gap-3">
          <li className="surface flex items-start gap-3 p-4">
            <StepNumber n={1} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-sm font-medium text-foreground-strong">{hasProfiles ? "Choose a profile" : "Create your first profile"}</p>
              <p className="text-sm text-muted-foreground">
                {hasProfiles
                  ? "Pick which profile to make active."
                  : "A profile holds the variables and scripts for one kind of job, like a one-day commercial."}
              </p>
              {hasProfiles ? <ChooseProfile profiles={profiles} /> : <CreateFirstProfile />}
            </div>
          </li>
          <li className="surface flex items-start gap-3 p-4">
            <StepNumber n={2} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-sm font-medium text-foreground-strong">Connect Claude</p>
              <p className="text-sm text-muted-foreground">Claude can then set up variables and scripts for you.</p>
              <Button variant="outline" size="sm" className="w-fit" asChild>
                <Link href="/connect">Connect Claude</Link>
              </Button>
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
}
