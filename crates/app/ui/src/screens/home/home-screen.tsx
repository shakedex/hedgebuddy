import { useEffect, useRef } from "react";
import { useHomeSummary } from "@/api/queries";
import { ErrorPanel } from "@/components/app/error-panel";
import { Stat } from "@/components/app/stat";
import { Skeleton } from "@/components/ui/skeleton";
import { AttentionPanel } from "./attention-panel";
import { ClaudeLatelyPanel } from "./claude-lately-panel";
import { FirstRun } from "./first-run";
import { RecentRunsPanel } from "./recent-runs-panel";

/** Spec §6.1. Everything on it links to the screen that fixes it. */
export function HomeScreen() {
  const summary = useHomeSummary();

  // A query that has never had data goes back to `status: "pending"` while a refetch is in flight (that's
  // how TanStack Query represents "no data yet" during Retry too), so `isPending`/`isError` alone can't
  // tell "loading for the first time" apart from "retrying after an error". This keeps the *last* error
  // across that flicker so the branches below can tell the two apart.
  const lastError = useRef<unknown>(null);
  if (summary.isError) lastError.current = summary.error;
  else if (summary.isSuccess) lastError.current = null;

  // Once there's an active profile, `FirstRun` (and its "Create profile" button) unmounts as this screen
  // swaps to the dashboard. Land focus on the dashboard's first heading instead of losing it to <body> —
  // but only for that actual first-run-finished transition, not for an ordinary mount that already has an
  // active profile (a fresh page load, or navigating to Home from another screen: the shell keys this
  // screen's subtree on its route, so `HomeScreen` fully remounts every time, and every `useRef` starts
  // over). `sawFirstRun` only ever becomes true once *this* mount has actually observed a successful load
  // with no active profile (i.e. it rendered `FirstRun`), so an ordinary mount — where the very first
  // successful read already has a profile — never sets it and so never steals focus.
  const attentionHeadingRef = useRef<HTMLHeadingElement>(null);
  const sawFirstRun = useRef(false);
  useEffect(() => {
    if (!summary.isSuccess) return;
    if (!summary.data.active_profile) {
      sawFirstRun.current = true;
    } else if (sawFirstRun.current) {
      attentionHeadingRef.current?.focus();
      sawFirstRun.current = false;
    }
  }, [summary.isSuccess, summary.data?.active_profile]);

  if (summary.isPending && lastError.current === null) return <HomeSkeleton />;

  if (lastError.current !== null && !summary.isSuccess) {
    return (
      <div className="@container h-full">
        <div className="p-4 @max-[640px]:p-3">
          <ErrorPanel
            error={summary.error ?? lastError.current}
            onRetry={() => void summary.refetch()}
            retrying={summary.isFetching}
          />
        </div>
      </div>
    );
  }

  const s = summary.data;
  // Unreachable given the branches above (they cover every state but "success"), but keeps this typed
  // without a non-null assertion.
  if (!s) return <HomeSkeleton />;
  if (!s.active_profile) return <FirstRun profiles={s.profiles} />;
  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-3 p-4 @max-[640px]:p-3">
        <div className="grid grid-cols-2 gap-2 @min-[640px]:grid-cols-4">
          <Stat label={s.since ? "Runs since last open" : "Runs, last 30 days"} value={s.counts.runs_since} />
          <Stat label="Failed" value={s.counts.failed_since} tone="destructive" />
          <Stat className="@max-[640px]:hidden" label="Scripts attached" value={s.counts.scripts_attached} />
          <Stat className="@max-[640px]:hidden" label="Variables" value={s.counts.variables} />
        </div>
        <div className="grid items-start gap-3 @min-[640px]:grid-cols-[1.25fr_1fr]">
          <AttentionPanel
            items={s.attention}
            activeProfile={s.active_profile}
            headingRef={attentionHeadingRef}
            className="animate-rise [animation-delay:40ms]"
          />
          <div className="flex min-w-0 flex-col gap-3">
            <RecentRunsPanel runs={s.recent_runs} activeProfile={s.active_profile} className="animate-rise [animation-delay:80ms]" />
            <ClaudeLatelyPanel records={s.recent_activity} className="animate-rise [animation-delay:120ms] @max-[640px]:hidden" />
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="@container h-full overflow-y-auto" aria-busy="true" aria-label="Loading">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-3 p-4 @max-[640px]:p-3">
        <div className="grid grid-cols-2 gap-2 @min-[640px]:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[66px] rounded-lg bg-card" />
          ))}
        </div>
        <div className="grid gap-3 @min-[640px]:grid-cols-[1.25fr_1fr]">
          <Skeleton className="h-48 rounded-lg bg-card" />
          <Skeleton className="h-48 rounded-lg bg-card" />
        </div>
      </div>
    </div>
  );
}
