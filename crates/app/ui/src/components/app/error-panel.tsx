import { CircleX, Hourglass, RotateCw } from "lucide-react";
import { BridgeError } from "@/api/bridge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A failed load, inline, with Retry (spec §7). "Another HedgeBuddy is busy" is not a failure, so it sits on
 * a neutral surface with a muted hourglass; the red tint is kept for real errors.
 */
export function ErrorPanel({ error, onRetry, title = "Couldn't load this" }: { error: unknown; onRetry: () => void; title?: string }) {
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
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RotateCw aria-hidden className="size-3.5" /> {busy ? "Try again" : "Retry"}
      </Button>
    </div>
  );
}
