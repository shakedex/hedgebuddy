import { useDataChanged } from "@/api/events";
import { useHomeSummary } from "@/api/queries";

export default function App() {
  useDataChanged();
  const summary = useHomeSummary();
  return (
    <main style={{ padding: 16, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
      <pre>{summary.isPending ? "loading…" : summary.isError ? `error: ${summary.error.message}` : JSON.stringify(summary.data, null, 2)}</pre>
    </main>
  );
}
