import { useEffect, useRef, useState } from "react";
import { Braces } from "lucide-react";
import { useLocation } from "wouter";
import { useProfiles, useVariablesOverview } from "@/api/queries";
import { EmptyState } from "@/components/app/empty-state";
import { ListDetail } from "@/components/app/list-detail";
import { VariableDetail } from "./variable-detail";
import { filterOverview, VariableList } from "./variable-list";

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
  // the list to show "No profile yet" instead of a load failure, and is also the source of the profile name
  // the detail pane pins itself to (see `VariableDetail`'s own doc comment).
  const activeProfile = profiles.data?.active ?? null;
  const noProfile = profiles.isSuccess && activeProfile === null;
  // What the list actually renders, filter included — not every requirement (an already-`set` or `defaulted`
  // one never gets its own row), so the "nothing selected" filler doesn't appear when the list has nothing.
  const { filteredNeeds, filteredVars } = filterOverview(overview.data, filterText);
  // Gated on the overview genuinely belonging to the active profile (Task 12 ruling): between a profile
  // switch and its own overview refetch landing, `overview.data` can still read the *previous* profile's
  // rows, which would otherwise flash as "nothing selected" fillers for a beat.
  const hasRows = !noProfile && overview.data?.profile === activeProfile && filteredNeeds.length + filteredVars.length > 0;
  // A detail URL alone isn't enough to switch the narrow layout over to the detail pane: with no active
  // profile yet (still loading, none active, or `list_profiles` failed), there's no detail to show, and the
  // list pane's own empty state or `ErrorPanel` needs the full width instead of hiding behind "← Variables".
  const selected = Boolean(name) && activeProfile !== null;

  // Ruling: when the active profile changes and the open name isn't in the *new* profile's overview (neither
  // an existing variable nor a pending requirement), the screen returns to the bare list — a same-named item
  // that does exist there just stays open instead (`VariableDetail`'s own `key` already re-keys it to the new
  // profile's data). Only acts once that new overview has actually loaded, and only on a genuine switch: a
  // fresh navigation straight to a requirement link (Home's "CLIENT_EMAIL is needed") must still open a ready
  // Add form on the very first load, which is why this tracks the *last profile it already checked* rather
  // than firing on every render where the name happens to be missing.
  const checkedProfileRef = useRef<string | null>(activeProfile);
  useEffect(() => {
    if (!name || name === "new" || !activeProfile) {
      checkedProfileRef.current = activeProfile;
      return;
    }
    if (!overview.data || overview.data.profile !== activeProfile) return; // Still the old profile's data.
    if (checkedProfileRef.current === activeProfile) return; // Already checked this profile.
    checkedProfileRef.current = activeProfile;
    const exists = overview.data.variables.some((v) => v.name === name) || overview.data.requirements.some((r) => r.name === name);
    if (!exists) navigate("/variables", { replace: true });
  }, [activeProfile, overview.data, name, navigate]);

  return (
    <ListDetail
      selected={selected}
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
          allProfiles={profiles.data?.profiles ?? []}
        />
      }
      detail={
        // With no active profile (or it isn't known yet), the detail pane shows nothing rather than the raw
        // "no active profile" error `variables_overview` would otherwise surface — the list's own empty state
        // already says what to do.
        name && activeProfile ? (
          // Keyed on profile *and* name: switching profiles remounts the form even when the name in the URL
          // happens to still exist there, so an in-flight edit never ends up writing into a different
          // profile's variable of the same name (the profile switcher itself asks first via `confirmLeave`).
          <VariableDetail key={`${activeProfile}:${name}`} name={name} profile={activeProfile} overview={overview} />
        ) : hasRows ? (
          <EmptyState icon={Braces} title="Pick a variable" className="m-auto">
            Choose a variable on the left to see and edit it.
          </EmptyState>
        ) : null
      }
    />
  );
}
