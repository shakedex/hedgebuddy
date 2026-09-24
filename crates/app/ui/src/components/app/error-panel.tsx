import { CircleX, Hourglass, RotateCw } from "lucide-react";
import { BridgeError } from "@/api/bridge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A failed load, inline, with Retry (spec §7). "Another HedgeBuddy is busy" is not a failure, so it sits on
 * a neutral surface with a muted hourglass; the red tint is kept for real errors.
 *
 * `retrying`: a refetch is in flight because Retry was just clicked. The caller keeps rendering this same
 * `ErrorPanel` (with the last-known error) while that happens instead of swapping to a loading skeleton —
 * a query that has never had data goes back to `pending` mid-refetch, and swapping would both flash the
 * wrong state and pull focus off the Retry button mid-interaction. This only changes the button.
 */
export function ErrorPanel({ error, onRetry, retrying = false, title = "Couldn't load this" }: {
  error: unknown; onRetry: () => void; retrying?: boolean; title?: string;
}) {
  const busy = error instanceof BridgeError && error.kind === "busy";
  const message = error instanceof Error ? error.message : String(error);
  const Icon = busy ? Hourglass : CircleX;
  return (
    <div
      role={busy ? "status" : "alert"}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3",
        busy ? "border-border-strong bg-card shadow-[inset_0_1px_0_rgb(255_255_255/0.03)]" : "border-destructive-border bg-destructive-tint/60",
      )}
    >
      <span className="flex h-lh shrink-0 items-center text-sm">
        <Icon aria-hidden className={cn("size-4", busy ? "text-muted-foreground" : "text-destructive")} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground-strong">{busy ? "Another HedgeBuddy is busy" : title}</p>
        <p className="text-sm break-words text-muted-foreground">{busy ? "It is saving something. Try again in a moment." : message}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying} aria-busy={retrying}>
        <RotateCw aria-hidden className={cn("size-3.5", retrying && "animate-spin")} />
        {retrying ? "Retrying…" : busy ? "Try again" : "Retry"}
      </Button>
    </div>
  );
}
