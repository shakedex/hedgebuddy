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
| `problems` (default) | The mockups. Attention items and a mix of run outcomes. The active profile `commercial-one-day` has every variable type, a secret, a path on an unplugged drive (`X:/Reports`) and a missing `CLIENT_EMAIL` that `on_copy_complete.py` requires; its scripts target OffShoot, FoolCat and nothing (`helpers_notes.py` has no manifest). OffShoot's events run this profile's scripts, the operator's own `C:\Tools\notify_dit.py`, and three deleted files (stale). `doc-series` has nothing attached |
| `healthy` | The same with nothing needing attention: `CLIENT_EMAIL` set, `REPORT_DIR` on a mounted drive, no stale events |
| `empty` | A first launch: no profile, runs or Claude activity yet, so Home shows its first-run steps |
| `error` | Every read fails |
| `busy` | Reads work; writes (dry runs too) fail with "another HedgeBuddy is busy; try again" |
| `macos` | `problems` on a Mac: OffShoot's `FileCopyCompleted` is staged in the OffShoot Helper workspace, events with no macOS location are unsupported, FoolCat and EditReady are attached by hand, and Canister is available |

Every scenario runs on one in-memory model (`src/mock/model.ts`, with `store.ts` for the data folder and `hedge.ts` for the Hedge apps), which follows the real tools' rules: manifests, requirements, dry runs and the sync report come out as the Rust tools return them. Writes change the model and fire the `data-changed` categories the app's watcher would; attaching, detaching, syncing and clearing change the pretend registry or workspace and fire nothing, as in the app. For `path_status`, drive `X:` and `/Volumes/Offline` are unplugged. The pickers return fixed paths, importing reads a copy of `commercial-one-day` without its secret value (or a file exported in the same session), and `open_in_editor`, `reveal_path` and `open_app_docs` only log to the console.

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
