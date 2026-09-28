import { cn } from "@/lib/utils";

/**
 * A panel's key fact as a label/value pair (Design direction 5C: "Readouts"): the label above the value,
 * stacking, under 480 px of panel width; a 120 px micro-label column beside the value from 480 px up (review
 * round 2, minor: the fixed column used to apply even while stacked, where it just wasted width and could
 * wrap a long label on its own). Shared by Connect (Task 5) and Settings (Task 6) — both are "simple pages"
 * of readout-style panels.
 */
export function Readout({ label, mono = true, children }: {
  label: string;
  /** Paths, commands and names are mono (the typography rule); `false` for plain words such as "none". */
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 @min-[480px]:flex-row @min-[480px]:items-baseline @min-[480px]:gap-3">
      <span className="micro-label shrink-0 @min-[480px]:w-[120px]">{label}</span>
      <span className={cn("min-w-0 flex-1 text-sm break-words text-foreground", mono && "font-mono text-xs text-foreground-strong")}>
        {children}
      </span>
    </div>
  );
}
