import { Redirect, Route, Router, Switch } from "wouter";
import { isPreview } from "@/api/bridge";
import { useDataChanged } from "@/api/events";
import { AppShell } from "@/components/app/app-shell";
import { useGuardedHashLocation } from "@/lib/guarded-location";
import { AppsScreen } from "@/screens/apps/apps-screen";
import { ConnectScreen } from "@/screens/connect/connect-screen";
import { DesignGallery } from "@/screens/design/design-gallery";
import { HomeScreen } from "@/screens/home/home-screen";
import { RunsScreen } from "@/screens/runs/runs-screen";
import { ScriptsScreen } from "@/screens/scripts/scripts-screen";
import { SettingsScreen } from "@/screens/settings/settings-screen";
import { VariablesScreen } from "@/screens/variables/variables-screen";

export default function App() {
  useDataChanged();
  return (
    <Router hook={useGuardedHashLocation}>
      <AppShell>
        <Switch>
          <Route path="/"><HomeScreen /></Route>
          <Route path="/runs"><RunsScreen /></Route>
          {/* wouter already decodes route params; decoding again breaks on ids containing "%25". */}
          <Route path="/runs/:runId">{(p) => <RunsScreen runId={p.runId} />}</Route>
          <Route path="/variables"><VariablesScreen /></Route>
          {/* wouter already decodes route params; decoding again breaks on names containing "%25". */}
          <Route path="/variables/:name">{(p) => <VariablesScreen name={p.name} />}</Route>
          <Route path="/scripts"><ScriptsScreen /></Route>
          {/* wouter already decodes route params; decoding again breaks on names containing "%25". */}
          <Route path="/scripts/:name">{(p) => <ScriptsScreen name={p.name} />}</Route>
          <Route path="/apps"><AppsScreen /></Route>
          {/* wouter already decodes route params; decoding again breaks on ids containing "%25". */}
          <Route path="/apps/:id">{(p) => <AppsScreen id={p.id} />}</Route>
          <Route path="/connect"><ConnectScreen /></Route>
          <Route path="/settings"><SettingsScreen /></Route>
          {isPreview && <Route path="/_design"><DesignGallery /></Route>}
          {/* An unknown path (a stale link, or `/_design` outside the preview) goes Home rather than to a blank screen. */}
          <Route><Redirect to="/" replace /></Route>
        </Switch>
      </AppShell>
    </Router>
  );
}
