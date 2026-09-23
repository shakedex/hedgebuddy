import { toast } from "sonner";
import { BridgeError } from "@/api/bridge";

/** A failed action as a toast (spec §7). "Busy" offers Try again. */
export function showError(error: unknown, retry?: () => void) {
  const busy = error instanceof BridgeError && error.kind === "busy";
  const message = error instanceof Error ? error.message : String(error);
  toast.error(busy ? "Another HedgeBuddy is busy" : message, {
    description: busy ? "It is saving something. Try again in a moment." : undefined,
    action: busy && retry ? { label: "Try again", onClick: retry } : undefined,
  });
}
