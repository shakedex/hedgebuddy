import { ActivityPanel } from "./activity-panel";
import { ClaudeDesktopPanel } from "./claude-desktop-panel";
import { ClientsPanel } from "./clients-panel";

/**
 * Connect (spec §6.6): whether HedgeBuddy is set up in Claude Desktop, the Claude Code and other-client
 * commands, and Claude's recent activity. A single scrolling page (Design direction 5C: "Simple pages"), not
 * list-and-detail — each section below is its own `surface` panel with its own loading, error and empty
 * states. Left-aligned, not centred (the avoid-list): the content column starts at the screen heading's own
 * x, it just stops growing past 720 px.
 */
export function ConnectScreen() {
  return (
    <div className="@container h-full overflow-y-auto">
      <div className="flex max-w-[720px] flex-col gap-3 p-4 @max-[640px]:p-3">
        <ClaudeDesktopPanel />
        <ClientsPanel />
        <ActivityPanel />
      </div>
    </div>
  );
}
