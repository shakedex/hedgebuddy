import type { LucideIcon } from "lucide-react";
import { TONE_TEXT } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * Every empty list says what to do next (spec §7). Left-aligned, quiet. `tone="warning"` tints the icon for
 * the one case where the empty screen is itself reporting a problem (amber only for needs-a-look).
 */
export function EmptyState({ icon: Icon, title, children, action, tone, className }: {
  icon: LucideIcon; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; tone?: "warning"; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-2 px-3 py-6", className)}>
      <div className="grid size-8 place-items-center rounded-md border border-border-strong bg-accent/40">
        <Icon aria-hidden className={cn("size-4", tone ? TONE_TEXT[tone] : "text-muted-foreground")} strokeWidth={1.75} />
      </div>
      <p className="text-base font-medium text-foreground-strong">{title}</p>
      {children && <div className="max-w-[46ch] text-sm text-muted-foreground">{children}</div>}
      {action}
    </div>
  );
}
