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
  if (summary.isPending) return <HomeSkeleton />;
  if (summary.isError) {
    return (
      <div className="p-4">
        <ErrorPanel error={summary.error} onRetry={() => void summary.refetch()} />
      </div>
    );
  }
  const s = summary.data;
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
          <AttentionPanel items={s.attention} activeProfile={s.active_profile} className="animate-rise [animation-delay:40ms]" />
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
    <div className="@container p-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-2 @min-[640px]:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[66px] rounded-lg bg-card" />
        ))}
      </div>
      <div className="mt-3 grid gap-3 @min-[640px]:grid-cols-[1.25fr_1fr]">
        <Skeleton className="h-48 rounded-lg bg-card" />
        <Skeleton className="h-48 rounded-lg bg-card" />
      </div>
    </div>
  );
}
