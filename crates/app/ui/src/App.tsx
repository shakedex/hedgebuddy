import { useSyncExternalStore } from "react";
import { useDataChanged } from "@/api/events";
import { useHomeSummary } from "@/api/queries";
import { DesignGallery } from "@/screens/design/design-gallery";

const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

/** Temporary until Task 13's router: `#/_design` shows the design gallery, anything else the smoke page. */
export default function App() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash);
  return hash === "#/_design" ? <DesignGallery /> : <Smoke />;
}

function Smoke() {
  useDataChanged();
  const summary = useHomeSummary();
  return (
    <main className="h-full overflow-auto p-4">
      <pre className="font-mono text-xs">
        {summary.isPending ? "loading…" : summary.isError ? `error: ${summary.error.message}` : JSON.stringify(summary.data, null, 2)}
      </pre>
    </main>
  );
}
