import { cn } from "@/lib/utils";

/** A Home readout: micro label over a 22 px tabular number. Only a non-zero failure count is tinted. */
export function Stat({ label, value, tone, className }: { label: string; value: number; tone?: "destructive"; className?: string }) {
  const bad = tone === "destructive" && value > 0;
  return (
    <div className={cn(bad ? "rounded-lg border border-destructive-border bg-destructive-tint" : "surface", "p-3", className)}>
      <div className={cn("micro-label truncate", bad && "text-destructive/80")}>{label}</div>
      <div className={cn("readout mt-1 text-stat font-semibold tracking-tight", bad ? "text-destructive" : "text-foreground-strong")}>{value}</div>
    </div>
  );
}
