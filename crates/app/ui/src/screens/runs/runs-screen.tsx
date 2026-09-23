import { useState } from "react";
import { useLocation } from "wouter";
import { useHomeSummary, useRuns } from "@/api/queries";
import { EmptyState } from "@/components/app/empty-state";
import { ListDetail } from "@/components/app/list-detail";
import { History } from "lucide-react";
import { RunDetail } from "./run-detail";
import { RunList } from "./run-list";

/** Spec §6.2: runs grouped by day, All or Failed, the active profile's with an All profiles switch. */
export function RunsScreen({ runId }: { runId?: string }) {
  const summary = useHomeSummary();
  const active = summary.data?.active_profile ?? null;
  const [allProfiles, setAllProfiles] = useState(false);
  const runs = useRuns(active && !allProfiles ? active : null);
  const [, navigate] = useLocation();
  return (
    <ListDetail
      selected={Boolean(runId)}
      onBack={() => navigate("/runs")}
      backLabel="Runs"
      list={
        <RunList
          query={runs}
          selectedId={runId ?? null}
          activeProfile={active}
          since={summary.data?.since ?? null}
          allProfiles={allProfiles}
          onAllProfilesChange={setAllProfiles}
          onSelect={(id) => navigate(`/runs/${encodeURIComponent(id)}`, { replace: Boolean(runId) })}
        />
      }
      detail={
        runId ? (
          <RunDetail runId={runId} activeProfile={active} />
        ) : (
          <EmptyState icon={History} title="Pick a run" className="m-auto">
            Choose a run on the left to see its log and traceback.
          </EmptyState>
        )
      }
    />
  );
}
