import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function App() {
  const [dataDir, setDataDir] = useState<string>("…");

  useEffect(() => {
    invoke<string>("data_dir")
      .then(setDataDir)
      .catch((e: unknown) => setDataDir(`error: ${String(e)}`));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>HedgeBuddy</h1>
      <p>Scaffold build. Data directory:</p>
      <code>{dataDir}</code>
    </main>
  );
}
