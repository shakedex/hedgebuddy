import { useRef } from "react";
import { useClaudeDesktopStatus } from "@/api/queries";
import { ErrorPanel } from "@/components/app/error-panel";
import { ActivityPanel } from "./activity-panel";
import { ClaudeDesktopPanel } from "./claude-desktop-panel";
import { ClientsPanel } from "./clients-panel";

/**
 * Connect (spec §6.6): whether HedgeBuddy is set up in Claude Desktop, the Claude Code and other-client
 * commands, and Claude's recent activity. A single scrolling page (Design direction 5C: "Simple pages"), not
 * list-and-detail — each section below is its own `surface` panel with its own loading, error and empty
 * states. Left-aligned, not centred (the avoid-list): the content column starts at the screen heading's own
 * x, it just stops growing past 720 px.
 *
 * `ClaudeDesktopPanel` and `ClientsPanel` both read `claude_desktop_status`; a failed load shows one
 * `ErrorPanel` here for both (review round 2, minor) instead of the three that used to appear. `ActivityPanel`
 * reads its own `activity` query and keeps its own independent error handling.
 */
export function ConnectScreen() {
  const status = useClaudeDesktopStatus();

  // Home's own `lastError` pattern (final review, Important): a query that has never had data goes back to
  // `status: "pending"` while Retry's refetch is in flight, so `isError`/`isSuccess` alone flip false the
  // moment Retry is clicked — using them directly here would swap this `ErrorPanel` for `ClaudeDesktopPanel`/
  // `ClientsPanel`'s own loading skeletons mid-retry, dropping focus to `<body>` since neither panel has
  // anything focused yet. Keeping the *last* error across that flicker keeps rendering the same `ErrorPanel`
  // (with `retrying`, a busy Retry) until the refetch actually lands one way or the other.
  const lastError = useRef<unknown>(null);
  if (status.isError) lastError.current = status.error;
  else if (status.isSuccess) lastError.current = null;
  const failed = lastError.current !== null && !status.isSuccess;

  return (
    <div className="@container h-full overflow-y-auto">
      <div className="flex max-w-[720px] flex-col gap-3 p-4 @max-[640px]:p-3">
        {failed ? (
          <ErrorPanel
            error={status.error ?? lastError.current}
            onRetry={() => void status.refetch()}
            retrying={status.isFetching}
            title="Couldn't read Claude Desktop's setup"
          />
        ) : (
          <>
            <ClaudeDesktopPanel />
            <ClientsPanel />
          </>
        )}
        <ActivityPanel />
      </div>
    </div>
  );
}
