import { cn } from "@/lib/utils";

/**
 * A panel's key fact as a label/value pair (Design direction 5C: "Readouts"): a 120 px micro-label column and
 * the value on the right, stacking (label above value) once the panel itself is under 480 px wide. Shared by
 * Connect (Task 5) and Settings (Task 6) — both are "simple pages" of readout-style panels.
 */
export function Readout({ label, mono = true, children }: {
  label: string;
  /** Paths, commands and names are mono (the typography rule); `false` for plain words such as "none". */
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 @min-[480px]:flex-row @min-[480px]:items-baseline @min-[480px]:gap-3">
      <span className="micro-label w-[120px] shrink-0">{label}</span>
      <span className={cn("min-w-0 flex-1 text-sm break-words text-foreground", mono && "font-mono text-xs text-foreground-strong")}>
        {children}
      </span>
    </div>
  );
}
