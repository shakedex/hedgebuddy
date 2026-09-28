import { cn } from "@/lib/utils";
import { ActivityPanel } from "./activity-panel";
import { ClaudeDesktopPanel } from "./claude-desktop-panel";
import { ClientsPanel } from "./clients-panel";

/**
 * A panel's key fact as a label/value pair (Design direction 5C: "Readouts"): a 120 px micro-label column and
 * the value on the right, stacking (label above value) once the panel itself is under 480 px wide.
 */
export function ConnectReadout({ label, mono = true, children }: {
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

/**
 * Connect (spec §6.6): whether HedgeBuddy is set up in Claude Desktop, the Claude Code and other-client
 * commands, and Claude's recent activity. A single scrolling page (Design direction 5C: "Simple pages"), not
 * list-and-detail — each section below is its own `surface` panel with its own loading, error and empty
 * states.
 */
export function ConnectScreen() {
  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[720px] flex-col gap-3 p-4 @max-[640px]:p-3">
        <ClaudeDesktopPanel />
        <ClientsPanel />
        <ActivityPanel />
      </div>
    </div>
  );
}
