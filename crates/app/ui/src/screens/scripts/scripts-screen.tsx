import { useState } from "react";
import { FileCode } from "lucide-react";
import { useLocation } from "wouter";
import { useAppsOverview, useProfiles, useScriptsOverview } from "@/api/queries";
import { EmptyState } from "@/components/app/empty-state";
import { ListDetail } from "@/components/app/list-detail";
import { ScriptDetail } from "./script-detail";
import { filterScripts, ScriptList } from "./script-list";

/**
 * The Scripts screen (spec §6.4): list and detail, the same idiom as Variables. `name` is the route param:
 * absent for the bare list, or an existing script's name.
 */
export function ScriptsScreen({ name }: { name?: string }) {
  const profiles = useProfiles();
  const overview = useScriptsOverview();
  const appsOverview = useAppsOverview();
  const [filterText, setFilterText] = useState("");
  const [, navigate] = useLocation();

  // `list_profiles` (not `scripts_overview`, which only ever errors with no active profile) is what tells
  // the list to show "No profile yet" instead of a load failure, and is also the source of the profile name
  // the detail pane pins itself to — matching `VariablesScreen`.
  const activeProfile = profiles.data?.active ?? null;
  const noProfile = profiles.isSuccess && activeProfile === null;
  const { filtered } = filterScripts(overview.data, filterText);
  const hasRows = filtered.length > 0;
  const selected = Boolean(name) && activeProfile !== null;

  return (
    <ListDetail
      selected={selected}
      // Replaces the history entry so Back returns to the bare list once, not into the detail it just closed.
      onBack={() => navigate("/scripts", { replace: true })}
      backLabel="Scripts"
      list={
        <ScriptList
          overview={overview}
          appsOverview={appsOverview}
          selectedName={name ?? null}
          filterText={filterText}
          onFilterTextChange={setFilterText}
          onSelect={(n) => navigate(`/scripts/${encodeURIComponent(n)}`, { replace: Boolean(name) })}
          noProfile={noProfile}
          allProfiles={profiles.data?.profiles ?? []}
          activeProfile={activeProfile}
        />
      }
      detail={
        // With no active profile (or it isn't known yet), the detail pane shows nothing rather than the raw
        // "no active profile" error `scripts_overview` would otherwise surface — the list's own empty state
        // already says what to do.
        name && activeProfile ? (
          // Keyed on profile *and* name: switching profiles remounts this rather than risking a stale read
          // (or a Detach/Attach/Delete) landing against the wrong profile's script of the same name.
          <ScriptDetail key={`${activeProfile}:${name}`} name={name} profile={activeProfile} overview={overview} appsOverview={appsOverview} />
        ) : hasRows ? (
          <EmptyState icon={FileCode} title="Pick a script" className="m-auto">
            Choose a script on the left to see and edit it.
          </EmptyState>
        ) : null
      }
    />
  );
}
