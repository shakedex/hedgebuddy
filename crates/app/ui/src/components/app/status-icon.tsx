import { STATUS, TONE_TEXT, type StatusKey } from "@/lib/status";
import { cn } from "@/lib/utils";

/** A state as icon plus word (spec §5.2). Without `label` the word is for screen readers only. */
export function StatusIcon({ status, label = false, className }: { status: StatusKey; label?: boolean; className?: string }) {
  const { icon: Icon, word, tone } = STATUS[status];
  const wordClass = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-muted-foreground";
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5", className)}>
      <Icon aria-hidden className={cn("size-3.5", TONE_TEXT[tone])} strokeWidth={1.75} />
      {label ? <span className={cn("text-sm", wordClass)}>{word}</span> : <span className="sr-only">{word}</span>}
    </span>
  );
}
