import { Fragment } from "react";
import { toast } from "sonner";
import { callTool } from "@/api/bridge";
import { invalidateFor } from "@/api/queries";
import { ChangePreviewDialog } from "@/components/app/change-preview-dialog";
import { Mono } from "@/components/app/mono";
import { appName, plural } from "@/lib/format";

/**
 * Spec §6.3 "Profile menu": delete previews which attached scripts would be left pointing at deleted files.
 * Always the active profile — this menu has no per-profile picker, so there is nothing else to delete.
 * `confirmLeave` (spec §7: leaving with unsaved changes asks first) is the caller's job: deleting the active
 * profile changes it, same as switching away from it, so the caller asks before ever opening this.
 */
export function DeleteProfileDialog({ open, onOpenChange, name, returnFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The profile to delete. */
  name: string;
  /** Where to return focus if the trigger that opened this is gone by the time it closes. */
  returnFocus?: () => HTMLElement | null;
}) {
  return (
    <ChangePreviewDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${name}?`}
      applyLabel="Delete"
      destructive
      returnFocus={returnFocus}
      plan={() => callTool("delete_profile", { name, dry_run: true })}
      describe={(p) => {
        if (!("would_delete" in p)) throw new Error("delete_profile: unexpected dry-run result");
        const { variables, scripts } = p.would_delete;
        return {
          summary: (
            <>
              Delete profile <Mono className="text-foreground">{name}</Mono> with its {variables} {plural(variables, "variable")} and{" "}
              {scripts.length} {plural(scripts.length, "script")}.
            </>
          ),
          changes: [{ kind: "delete", target: `profiles/${name}`, detail: { text: "removed" } }],
          warnings:
            p.attached_to.length > 0
              ? p.attached_to.map((a, i) => (
                  <Fragment key={i}>
                    {appName(a.app)} · {a.event} runs <Mono className="text-warning">{a.script}</Mono> from this profile. After deleting,
                    it points at a missing file. Sync another profile or detach it first.
                  </Fragment>
                ))
              : undefined,
        };
      }}
      apply={() => callTool("delete_profile", { name })}
      onApplied={async () => {
        // The active profile is now gone (spec: "When the active profile is deleted the app has none; Home
        // shows its choose-a-profile step"). Every screen reacts to that on its own — Variables already shows
        // "No profile yet" — so this doesn't force a navigation of its own.
        await invalidateFor(["index"]);
        toast(`Deleted ${name}`);
      }}
    />
  );
}
