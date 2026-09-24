import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLeavePrompt } from "@/lib/unsaved";

/**
 * Spec §7: leaving an editor with unsaved changes asks first. `confirmLeave()` (guarded navigation, or a
 * screen that changes selection without navigating) opens this; Escape and the overlay both mean Keep
 * editing, the same as the button. Mount once, in AppShell.
 */
export function UnsavedDialog() {
  const pending = useLeavePrompt();

  return (
    <Dialog open={pending !== null} onOpenChange={(next) => { if (!next) pending?.decide(false); }}>
      <DialogContent className="sm:max-w-[400px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
          <DialogDescription>Your edits have not been saved.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" autoFocus onClick={() => pending?.decide(false)}>
            Keep editing
          </Button>
          <Button type="button" onClick={() => pending?.decide(true)}>
            Discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
