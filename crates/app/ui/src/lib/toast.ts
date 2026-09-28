import { createElement } from "react";
import { Hourglass } from "lucide-react";
import { toast } from "sonner";
import { BridgeError } from "@/api/bridge";

/** The busy toast's fixed id (Task 12 / final review ruling): every busy failure, from whichever action hit
 *  it, is the same one toast. A second busy failure while the first is still up replaces it (and its Try
 *  again) in place, rather than stacking a duplicate — and any success elsewhere can clear it by this id
 *  alone, without having to have been the one that showed it (see `clearBusyToast`). */
const BUSY_TOAST_ID = "busy";

/**
 * A failed action as a toast (spec §7). Busy is not a failure (spec §2.7: colour marks only problems): it
 * keeps the neutral hourglass instead of `toast.error`'s red circle-x, and stays up long enough (8 s, versus
 * Sonner's 4 s default) that Try again is still reachable.
 *
 * Returns the toast's own id (Task 12 ruling: "a busy toast stays up after a successful retry"). A caller
 * that offers `retry` should keep this id and, once that retry actually succeeds, dismiss it explicitly
 * (`toast.dismiss(id)`) — Sonner has no way to know on its own that the thing the toast was about has since
 * been resolved. A busy toast's id is always `BUSY_TOAST_ID`, so `clearBusyToast()` works as a caller-agnostic
 * shorthand for that case.
 */
export function showError(error: unknown, retry?: () => void): string | number {
  const busy = error instanceof BridgeError && error.kind === "busy";
  if (busy) {
    return toast("Another HedgeBuddy is busy", {
      id: BUSY_TOAST_ID,
      icon: createElement(Hourglass, { className: "size-4 text-muted-foreground", strokeWidth: 1.75 }),
      description: "It is saving something. Try again in a moment.",
      duration: 8000,
      action: retry ? { label: "Try again", onClick: retry } : undefined,
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  return toast.error(message);
}

/** Dismisses the busy toast (any caller's), so a success that follows a busy failure doesn't leave a stale
 *  "Another HedgeBuddy is busy" with a now-pointless Try again on screen next to it. A no-op when there isn't
 *  one — Sonner's `dismiss` is safe to call for an id that isn't currently showing. */
export function clearBusyToast(): void {
  toast.dismiss(BUSY_TOAST_ID);
}
