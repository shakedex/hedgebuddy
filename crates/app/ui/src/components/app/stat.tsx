import { cn } from "@/lib/utils";

/**
 * A Home readout: micro label over a 22 px tabular number. Only a non-zero failure count is tinted. The
 * label wraps (at most two lines) instead of truncating; the value is bottom-anchored (`mt-auto`) so it
 * stays on one baseline across a row even when a neighbour's label wraps and this one's doesn't — the grid
 * row itself already stretches every tile to the same height, this just anchors each tile's own content
 * to that shared bottom edge.
 */
export function Stat({ label, value, tone, className }: { label: string; value: number; tone?: "destructive"; className?: string }) {
  const bad = tone === "destructive" && value > 0;
  return (
    <div className={cn(bad ? "rounded-lg border border-destructive-border bg-destructive-tint" : "surface", "flex flex-col p-3", className)}>
      <div className={cn("micro-label line-clamp-2", bad && "text-destructive/80")}>{label}</div>
      <div className={cn("readout mt-auto pt-1 text-stat font-semibold tracking-tight", bad ? "text-destructive" : "text-foreground-strong")}>{value}</div>
    </div>
  );
}
