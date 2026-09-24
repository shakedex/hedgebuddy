import { useState } from "react";
import { Braces } from "lucide-react";
import { useLocation } from "wouter";
import { useProfiles, useVariablesOverview } from "@/api/queries";
import { EmptyState } from "@/components/app/empty-state";
import { ListDetail } from "@/components/app/list-detail";
import { VariableDetail } from "./variable-detail";
import { VariableList } from "./variable-list";

/**
 * The Variables screen (spec §6.3, option B "list and detail" from `variables.html`). `name` is the route
 * param: absent for the bare list, `"new"` for a blank new variable, or an existing variable's name — which,
 * if the profile doesn't have it yet, opens the new-variable form prefilled from a same-named requirement
 * (so Home's "CLIENT_EMAIL is needed" link lands on a ready Add form).
 */
export function VariablesScreen({ name }: { name?: string }) {
  const profiles = useProfiles();
  const overview = useVariablesOverview();
  const [filterText, setFilterText] = useState("");
  const [, navigate] = useLocation();

  // `list_profiles` (not `variables_overview`, which only ever errors with no active profile) is what tells
  // the list to show "No profile yet" instead of a load failure.
  const noProfile = profiles.isSuccess && profiles.data.active === null;
  const hasRows = (overview.data?.requirements.length ?? 0) + (overview.data?.variables.length ?? 0) > 0;

  return (
    <ListDetail
      selected={Boolean(name)}
      // Replaces the history entry so Back returns to the bare list once, not into the detail it just closed.
      onBack={() => navigate("/variables", { replace: true })}
      backLabel="Variables"
      list={
        <VariableList
          overview={overview}
          selectedName={name ?? null}
          filterText={filterText}
          onFilterTextChange={setFilterText}
          onSelect={(n) => navigate(`/variables/${encodeURIComponent(n)}`, { replace: Boolean(name) })}
          noProfile={noProfile}
        />
      }
      detail={
        name ? (
          // Keyed on the route name: a fresh mount per variable keeps one form's edits from leaking into the
          // next (by the time a *different* name arrives, the unsaved guard has already asked).
          <VariableDetail key={name} name={name} overview={overview} />
        ) : hasRows ? (
          <EmptyState icon={Braces} title="Pick a variable" className="m-auto">
            Choose a variable on the left to see and edit it.
          </EmptyState>
        ) : null
      }
    />
  );
}
