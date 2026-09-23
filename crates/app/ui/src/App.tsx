import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { isPreview } from "@/api/bridge";
import { useDataChanged } from "@/api/events";
import { AppShell } from "@/components/app/app-shell";
import { DesignGallery } from "@/screens/design/design-gallery";
import { HomeScreen } from "@/screens/home/home-screen";
import { Placeholder } from "@/screens/placeholder";
import { RunsScreen } from "@/screens/runs/runs-screen";

export default function App() {
  useDataChanged();
  return (
    <Router hook={useHashLocation}>
      <AppShell>
        <Switch>
          <Route path="/"><HomeScreen /></Route>
          <Route path="/runs"><RunsScreen /></Route>
          {/* wouter already decodes route params; decoding again breaks on ids containing "%25". */}
          <Route path="/runs/:runId">{(p) => <RunsScreen runId={p.runId} />}</Route>
          <Route path="/variables">{() => <Placeholder screen="variables" />}</Route>
          <Route path="/variables/:name">{(p) => <Placeholder screen="variables" name={p.name} />}</Route>
          <Route path="/scripts">{() => <Placeholder screen="scripts" />}</Route>
          <Route path="/scripts/:name">{(p) => <Placeholder screen="scripts" name={p.name} />}</Route>
          <Route path="/apps">{() => <Placeholder screen="apps" />}</Route>
          <Route path="/apps/:id">{(p) => <Placeholder screen="apps" name={p.id} />}</Route>
          <Route path="/connect">{() => <Placeholder screen="connect" />}</Route>
          <Route path="/settings">{() => <Placeholder screen="settings" />}</Route>
          {isPreview && <Route path="/_design"><DesignGallery /></Route>}
          <Route><Placeholder screen="home" /></Route>
        </Switch>
      </AppShell>
    </Router>
  );
}
