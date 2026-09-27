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

  // `list_profiles` is the active-profile signal — not `scripts_overview` itself, whose own `profile` field
  // can still be one refetch behind right after a profile switch (see `ScriptDetail`'s own guard).
  const activeProfile = profiles.data?.active ?? null;
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
        />
      }
      detail={
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
