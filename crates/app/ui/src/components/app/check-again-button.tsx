import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One "Check again" look, everywhere it appears (final review ruling: Connect and Settings used to each roll
 * their own plain text-link button, different from Scripts'): a ghost `Button` with the `refresh-cw` icon,
 * spinning while `pending`. `aria-disabled`, not native `disabled` — a focused button that goes natively
 * `disabled` mid-click drops keyboard focus to `<body>` in some webviews, the same fix Install and Reveal
 * already have (their own `aria-disabled:pointer-events-none aria-disabled:opacity-45` classes, repeated
 * here).
 */
export function CheckAgainButton({ pending, onClick, className }: {
  pending: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "text-muted-foreground hover:text-foreground-strong aria-disabled:pointer-events-none aria-disabled:opacity-45",
        className,
      )}
      aria-disabled={pending}
      aria-busy={pending}
      onClick={onClick}
    >
      <RefreshCw aria-hidden strokeWidth={1.75} className={cn(pending && "animate-spin")} />
      {pending ? "Checking…" : "Check again"}
    </Button>
  );
}
