import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useHomeSummary, useRun, useRuns } from "@/api/queries";
import { EmptyState } from "@/components/app/empty-state";
import { ListDetail } from "@/components/app/list-detail";
import { History } from "lucide-react";
import { RunDetail } from "./run-detail";
import { RunList, visibleRuns, type RunMode } from "./run-list";

/**
 * Spec §6.2: runs grouped by day, All or Failed, the active profile's with an All profiles switch.
 *
 * Home and the Runs badge count every profile, so a link from Home can name another profile's run. When the
 * routed run turns out to belong to a profile other than the active one, All profiles switches on so that
 * run is listed and selected. That happens once per run id: switching All profiles back off afterwards sticks.
 */
export function RunsScreen({ runId }: { runId?: string }) {
  const summary = useHomeSummary();
  const active = summary.data?.active_profile ?? null;
  const [allProfiles, setAllProfiles] = useState(false);
  const [mode, setMode] = useState<RunMode>("all");
  const [filterText, setFilterText] = useState("");
  // Held off until the summary settles (success or error): otherwise this would fetch every profile's runs
  // first (before `active_profile` is known), then immediately refetch scoped to the active one.
  const runs = useRuns(active && !allProfiles ? active : null, !summary.isPending);
  // The same query RunDetail reads, so this costs no second fetch.
  const routedProfile = useRun(runId ?? null).data?.profile;
  const [, navigate] = useLocation();

  const checkedRunId = useRef<string | null>(null);
  useEffect(() => {
    if (!runId || summary.isPending || routedProfile === undefined || checkedRunId.current === runId) return;
    checkedRunId.current = runId;
    if (active !== null && routedProfile !== active) setAllProfiles(true);
  }, [runId, routedProfile, active, summary.isPending]);

  const displayed = visibleRuns(runs.data?.runs ?? [], mode, filterText);
  return (
    <ListDetail
      selected={Boolean(runId)}
      // Replaces the history entry so the browser's Back button returns to the bare list once, not back
      // into the detail it just closed.
      onBack={() => navigate("/runs", { replace: true })}
      backLabel="Runs"
      list={
        <RunList
          query={runs}
          displayed={displayed}
          mode={mode}
          onModeChange={setMode}
          filterText={filterText}
          onFilterTextChange={setFilterText}
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
        ) : displayed.length > 0 ? (
          // Only when the list (after All/Failed and the filter) has a run to pick; beside an empty list
          // the detail pane stays empty rather than pointing at nothing.
          <EmptyState icon={History} title="Pick a run" className="m-auto">
            Choose a run on the left to see its log and traceback.
          </EmptyState>
        ) : null
      }
    />
  );
}
