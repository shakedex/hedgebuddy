import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLeavePrompt } from "@/lib/unsaved";

/**
 * Spec §7: leaving an editor with unsaved changes asks first. `confirmLeave()` (guarded navigation, or a
 * screen that changes selection without navigating) opens this; Escape and the overlay both mean Keep
 * editing, the same as the button. Mount once, in AppShell.
 *
 * There is no `DialogTrigger` — whatever was focused when the question came up (a list row, a menu's own
 * trigger, a Save button) is captured here at open time and restored on close, the same way
 * `ChangePreviewDialog` does it, so "Keep editing" doesn't drop focus to `<body>`.
 */
export function UnsavedDialog() {
  const pending = useLeavePrompt();
  const open = pending !== null;

  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(open);
  if (open && !wasOpenRef.current) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpenRef.current = open;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) pending?.decide(false); }}>
      <DialogContent
        className="sm:max-w-[400px]"
        showCloseButton={false}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const opener = openerRef.current;
          if (opener && opener.isConnected) opener.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
          <DialogDescription>Your edits have not been saved.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" autoFocus onClick={() => pending?.decide(false)}>
            Keep editing
          </Button>
          <Button type="button" variant="destructive" onClick={() => pending?.decide(true)}>
            Discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
