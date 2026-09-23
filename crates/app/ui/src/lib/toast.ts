import { createElement } from "react";
import { Hourglass } from "lucide-react";
import { toast } from "sonner";
import { BridgeError } from "@/api/bridge";

/**
 * A failed action as a toast (spec §7). Busy is not a failure (spec §2.7: colour marks only problems): it
 * keeps the neutral hourglass instead of `toast.error`'s red circle-x, and stays up long enough (8 s, versus
 * Sonner's 4 s default) that Try again is still reachable.
 */
export function showError(error: unknown, retry?: () => void) {
  const busy = error instanceof BridgeError && error.kind === "busy";
  if (busy) {
    toast("Another HedgeBuddy is busy", {
      icon: createElement(Hourglass, { className: "size-4 text-muted-foreground", strokeWidth: 1.75 }),
      description: "It is saving something. Try again in a moment.",
      duration: 8000,
      action: retry ? { label: "Try again", onClick: retry } : undefined,
    });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  toast.error(message);
}
