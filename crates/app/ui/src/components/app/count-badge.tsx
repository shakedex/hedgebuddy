import { cn } from "@/lib/utils";

/** A count in a problem tint (spec §5.2: badges, never dots). `rail` is the small overlay on the collapsed sidebar. */
export function CountBadge({ count, tone, variant = "pill", className }: {
  count: number; tone: "destructive" | "warning"; variant?: "pill" | "rail"; className?: string;
}) {
  if (count <= 0) return null;
  const text = count > 99 ? "99+" : String(count);
  return (
    <span
      className={cn(
        "readout inline-flex items-center justify-center rounded-full font-medium ring-1 ring-inset",
        tone === "destructive" ? "bg-destructive-tint text-destructive ring-destructive-border" : "bg-warning-tint text-warning ring-warning-border",
        variant === "pill" ? "h-5 min-w-5 px-1 text-xs" : "h-4 min-w-4 px-1 text-[10.5px] leading-none",
        className,
      )}
    >
      {/* A generic span cannot carry an aria-label, so the spoken form is sr-only text. */}
      <span aria-hidden>{text}</span>
      <span className="sr-only">{`${count} ${tone === "destructive" ? "failed" : "need a look"}`}</span>
    </span>
  );
}
