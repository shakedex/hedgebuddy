import { AppWindow } from "lucide-react";
import { useLocation } from "wouter";
import { useAppsOverview, useProfiles } from "@/api/queries";
import { EmptyState } from "@/components/app/empty-state";
import { ListDetail } from "@/components/app/list-detail";
import { AppDetail } from "./app-detail";
import { AppList } from "./app-list";

/**
 * The Hedge apps screen (spec §6.5): list and detail, the same idiom as Scripts and Variables. `id` is the
 * route param: absent for the bare list, or a catalog app id. Unlike those screens, this one is not scoped to
 * a profile — every catalog app shows regardless of which one is active — but the events table still needs
 * the active profile to tell "this profile" apart from another one's script (Lesson 7).
 */
export function AppsScreen({ id }: { id?: string }) {
  const overview = useAppsOverview();
  const profiles = useProfiles();
  const [, navigate] = useLocation();

  const hasRows = overview.isSuccess && overview.data.apps.length > 0;
  const selected = Boolean(id);

  return (
    <ListDetail
      selected={selected}
      // Replaces the history entry so Back returns to the bare list once, not into the detail it just closed.
      onBack={() => navigate("/apps", { replace: true })}
      backLabel="Hedge apps"
      list={<AppList overview={overview} selectedId={id ?? null} onSelect={(appId) => navigate(`/apps/${appId}`, { replace: Boolean(id) })} />}
      detail={
        id ? (
          <AppDetail key={id} app={id} overview={overview} activeProfile={profiles.data?.active ?? null} />
        ) : hasRows ? (
          <EmptyState icon={AppWindow} title="Pick a Hedge app" className="m-auto">
            Choose an app on the left to see its events and clean up stale ones.
          </EmptyState>
        ) : null
      }
    />
  );
}
