import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Every empty list says what to do next (spec §7). Left-aligned, quiet. */
export function EmptyState({ icon: Icon, title, children, action, className }: {
  icon: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-2 px-3 py-6", className)}>
      <div className="grid size-8 place-items-center rounded-md border border-border-strong bg-accent/40">
        <Icon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <p className="text-base font-medium text-foreground-strong">{title}</p>
      {children && <p className="max-w-[46ch] text-sm text-muted-foreground">{children}</p>}
      {action}
    </div>
  );
}
