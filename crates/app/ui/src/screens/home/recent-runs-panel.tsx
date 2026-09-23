import { History } from "lucide-react";
import { Link } from "wouter";
import type { Run } from "@/api/tools.gen";
import { EmptyState } from "@/components/app/empty-state";
import { Mono } from "@/components/app/mono";
import { Panel } from "@/components/app/panel";
import { StatusIcon } from "@/components/app/status-icon";
import { when } from "@/lib/format";
import { runStatusKey } from "@/lib/status";

/** Spec §6.1 "Recent runs": the last 5 runs across every profile. */
export function RecentRunsPanel({ runs, activeProfile, className }: { runs: Run[]; activeProfile: string; className?: string }) {
  return (
    <Panel
      title="Recent runs"
      action={
        <Link href="/runs" className="text-xs text-link hover:underline">
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
        runs.slice(0, 5).map((run) => (
          <Link
            key={run.run_id}
            href={`/runs/${encodeURIComponent(run.run_id)}`}
            className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors duration-120 hover:bg-accent/60"
          >
            <StatusIcon status={runStatusKey(run.status)} />
            <Mono className="min-w-0 flex-1 truncate text-sm">{run.script}</Mono>
            {run.profile !== activeProfile && <span className="shrink-0 truncate text-xs text-muted-foreground">{run.profile}</span>}
            <span className="readout shrink-0 text-xs text-muted-foreground">{when(run.started_at)}</span>
          </Link>
        ))
      )}
    </Panel>
  );
}
