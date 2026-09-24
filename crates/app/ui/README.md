# HedgeBuddy desktop app UI

React frontend for the Tauri app in `crates/app`. Built with Bun.

## Run the app

```bash
cd crates/app
cargo tauri dev
```

This builds the UI and opens it in the Tauri webview, backed by the real Rust commands (`tool`, `home_summary`, `activity`, `preferences_get`, `preferences_set`) and a real data folder.

## Browser preview (no Tauri, no Rust)

```bash
cd crates/app/ui
bun run dev:mock
```

Serves the UI at `http://localhost:5199` with a mock bridge instead of Tauri, so screens can be checked in an ordinary browser. Pick a scenario with `?scenario=` before the hash, for example `http://localhost:5199/?scenario=empty#/`:

| Scenario | Shows |
|---|---|
| `problems` (default) | Attention items, a mix of run outcomes |
| `healthy` | Nothing needing attention |
| `empty` | A first launch: no profile, runs or Claude activity yet, so Home shows its first-run steps |
| `error` | Every read fails |
| `busy` | Reads work; writes fail with "another HedgeBuddy is busy; try again" |

In the browser console, `window.__hb.emit(["runs"])` fires a fake `data-changed` event for the given categories, to check that screens refetch without a reload. In `busy`, `window.__hb.busy(["set_active_profile"])` makes only the named writes report busy (for example, to fail only the second step of creating and activating a profile), and `window.__hb.busy(null)` restores every write.

## Regenerating types

`src/api/tools.gen.ts` is generated from the Rust tool and app-command schemas, not hand-written.

```bash
bun run gen         # regenerate it
bun run gen:check   # fail if the committed file is stale (what CI runs)
```

Run `gen` after changing a tool's parameter or result type, an app command, or anything else `hedgebuddy tools --schemas` reports.

## Tokens and design rules

Colours, radius, and font tokens live in `src/styles/globals.css`. The app is dark only; colour beyond the neutral palette is reserved for problems (errors and warnings), plus the primary accent on buttons and focus rings. Every status is a Lucide icon paired with a word, never colour or icon alone. Text is set in Inter; names, paths, and code are set in JetBrains Mono.
