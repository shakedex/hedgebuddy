import { useState } from "react";
import { toast } from "sonner";
import { useCreateProfile } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** Main spec §5: a profile name is a slug. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function CreateProfileDialog({ open, onOpenChange, activate, onCloseFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; activate: boolean;
  /** Called instead of Radix's own close-focus restore (which has nowhere reliable to return to, since this
   *  dialog isn't opened via a `DialogTrigger`). */
  onCloseFocus?: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateProfile();
  const invalid = name.length > 0 && !SLUG.test(name);

  /** Closing (Create, Cancel, Escape or an overlay click) always clears the fields for next time. */
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setName("");
      setDescription("");
    }
  };

  const submit = () =>
    create.mutate(
      { name, description, activate },
      {
        onSuccess: () => {
          toast(`Profile ${name} created`);
          close(false);
        },
        onError: (e) => showError(e, submit),
      },
    );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="sm:max-w-[420px]"
        onCloseAutoFocus={(e) => {
          if (!onCloseFocus) return;
          e.preventDefault();
          onCloseFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>New profile</DialogTitle>
          <DialogDescription>A profile holds the variables and scripts for one kind of job.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (SLUG.test(name)) submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              autoFocus
              className="font-mono"
              placeholder="commercial-one-day"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              aria-invalid={invalid}
              aria-describedby="profile-name-hint"
            />
            <p id="profile-name-hint" className={cn("text-xs", invalid ? "text-destructive" : "text-muted-foreground")}>
              {invalid ? "Use lowercase letters, digits and dashes, starting with a letter or digit." : "Lowercase letters, digits and dashes."}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-description">
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input id="profile-description" placeholder="Client X, single-day commercial" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>Cancel</Button>
            <Button type="submit" disabled={!SLUG.test(name) || create.isPending}>Create profile</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
