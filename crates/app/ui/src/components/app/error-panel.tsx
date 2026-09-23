import { CircleX, RotateCw } from "lucide-react";
import { BridgeError } from "@/api/bridge";
import { Button } from "@/components/ui/button";

/** A failed load, inline, with Retry (spec §7). */
export function ErrorPanel({ error, onRetry, title = "Couldn't load this" }: { error: unknown; onRetry: () => void; title?: string }) {
  const busy = error instanceof BridgeError && error.kind === "busy";
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive-border bg-destructive-tint/60 p-3">
      <CircleX aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground-strong">{busy ? "Another HedgeBuddy is busy" : title}</p>
        <p className="mt-0.5 text-sm break-words text-muted-foreground">{busy ? "It is saving something. Try again in a moment." : message}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RotateCw aria-hidden className="size-3.5" /> {busy ? "Try again" : "Retry"}
      </Button>
    </div>
  );
}
