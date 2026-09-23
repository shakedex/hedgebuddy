import { History } from "lucide-react";
import { Link } from "wouter";
import type { Run } from "@/api/tools.gen";
import { EmptyState } from "@/components/app/empty-state";
import { Mono } from "@/components/app/mono";
import { Panel } from "@/components/app/panel";
import { StatusIcon } from "@/components/app/status-icon";
import { useRovingList } from "@/hooks/use-roving-list";
import { when } from "@/lib/format";
import { runStatusKey } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Spec §6.1 "Recent runs": the last 5 runs across every profile. */
export function RecentRunsPanel({ runs, activeProfile, className }: { runs: Run[]; activeProfile: string; className?: string }) {
  const roving = useRovingList();
  return (
    <Panel
      title="Recent runs"
      action={
        // `relative` + the inset `::after` gives the link a >=28 px hit target without growing its text.
        <Link href="/runs" className="relative text-xs text-link after:absolute after:-inset-x-1 after:-inset-y-1.5 hover:underline">
          All runs
        </Link>
      }
      className={className}
    >
      {runs.length === 0 ? (
        <EmptyState icon={History} title="No runs yet" className="px-2 py-3">
          Each time a Hedge app fires an event, its attached script records a run here.
        </EmptyState>
      ) : (
        <ul onKeyDown={roving.onKeyDown}>
          {runs.slice(0, 5).map((run, i) => {
            const other = run.profile !== activeProfile;
            return (
              <li key={run.run_id}>
                <Link
                  href={`/runs/${encodeURIComponent(run.run_id)}`}
                  data-roving-row
                  tabIndex={roving.tabIndex(i)}
                  onFocus={roving.onRowFocus(i)}
                  className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors duration-120 hover:bg-accent/60"
                >
                  <StatusIcon status={runStatusKey(run.status)} />
                  {/* The script name gets priority; the profile suffix is what gives way (and truncates) first when
                      the row is tight. The script never shrinks, but is capped to leave the profile 40 px ("do…")
                      plus the 8 px gap, so the profile stays visible and only a very long script name truncates. */}
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <Mono
                      className={cn("truncate text-sm", other ? "max-w-[calc(100%-3rem)] shrink-0" : "min-w-0")}
                      title={run.script}
                    >
                      {run.script}
                    </Mono>
                    {other && (
                      <span className="min-w-0 truncate text-xs text-muted-foreground" title={run.profile}>
                        {run.profile}
                      </span>
                    )}
                  </span>
                  <span className="readout shrink-0 text-xs text-muted-foreground">{when(run.started_at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
