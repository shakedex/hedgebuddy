# HedgeBuddy desktop app UI

React frontend for the Tauri app in `crates/app`. Built with Bun.

## Run the app

```bash
cd crates/app
cargo tauri dev
```

This builds the UI and opens it in the Tauri webview, backed by the real Rust commands (`tool`, `home_summary`, `activity`, `preferences_get`, `preferences_set`) and a real data folder.

File pickers, opening a file in the editor, and revealing a path in the file manager (`pick_folder`, `pick_export_path`, `pick_import_file`, `open_in_editor`, `reveal_path`, `open_app_docs`) run in Rust, through `tauri-plugin-dialog` and `tauri-plugin-opener`. The webview itself has no permission for any of this — `crates/app/capabilities/default.json` grants only `core:event:default` — it just calls the app command and gets a result back.

## Browser preview (no Tauri, no Rust)

```bash
cd crates/app/ui
bun run dev:mock
```

Serves the UI at `http://localhost:5199` with a mock bridge instead of Tauri, so screens can be checked in an ordinary browser. Pick a scenario with `?scenario=` before the hash, for example `http://localhost:5199/?scenario=empty#/`:

| Scenario | Shows |
|---|---|
| `problems` (default) | The mockups. Attention items and a mix of run outcomes. The active profile `commercial-one-day` has every variable type, a secret, a path on an unplugged drive (`X:/Reports`) and a missing `CLIENT_EMAIL` that `on_copy_complete.py` requires; its scripts target OffShoot, FoolCat and nothing (`helpers_notes.py` has no manifest). OffShoot's events run this profile's scripts, the operator's own `C:\Tools\notify_dit.py`, and three deleted files (stale). FoolCat is newer than the version HedgeBuddy was tested with and has scripting turned off while `foolcat_report.py` is attached. `doc-series` has nothing attached. Claude Desktop is outdated (its `hedgebuddy` entry runs the unqualified command name, not the bundled binary), alongside a `filesystem` server; Python has `hedgebuddy` 0.10.0 installed, needing 0.11.0; the catalog override `offshoot` is in effect |
| `healthy` | The same with nothing needing attention: `CLIENT_EMAIL` set, `REPORT_DIR` on a mounted drive, no stale events, Claude Desktop already set up, Python has `hedgebuddy` 0.11.0 |
| `empty` | A first launch: no profile, runs or Claude activity yet, so Home shows its first-run steps; no Claude Desktop and no Python either, so Settings shows both not found |
| `error` | Every read fails |
| `busy` | Reads work; writes (dry runs too) fail with "another HedgeBuddy is busy; try again"; `claude_desktop_apply` is one such write, `claude_desktop_plan` and `pip_install` are not |
| `macos` | `problems` on a Mac: OffShoot's `FileCopyCompleted` is staged in the OffShoot Helper workspace, events with no macOS location are unsupported, FoolCat's events are attached by hand, EditReady is in the catalog but not installed here, and Canister is installed with no scripting events. Claude Desktop's folder exists but has no config file yet (not set up); the bundled wheel is missing (Update still works through PyPI) |
| `unactivated` | Otherwise like `healthy`, but no profile is active: Home shows "choose a profile" instead of the dashboard |
| `nopackage` | Otherwise like `healthy`, but Python is found with no `hedgebuddy` installed for it |

Every scenario runs on one in-memory model (`src/mock/model.ts`, with `store.ts` for the data folder, `hedge.ts` for the Hedge apps, `claudeDesktop.ts` for Claude Desktop's config and `settings.ts` for the pip command and its output), which follows the real tools' rules: manifests, requirements, dry runs and the sync report come out as the Rust tools return them. Writes change the model and fire the `data-changed` categories the app's watcher would; attaching, detaching, syncing and clearing change the pretend registry or workspace and fire nothing, as in the app; Claude Desktop's config and `pip_install`'s installed version change the model but fire nothing either (both live outside the data folder), so their screens reload through their own hooks instead. For `path_status`, drive `X:` and `/Volumes/Offline` are unplugged. The pickers return fixed paths, importing reads a copy of `commercial-one-day` without its secret value (or a file exported in the same session), and `open_in_editor`, `reveal_path` and `open_app_docs` only log to the console. Add `?pipfail=1` to any scenario's URL to make `pip_install` fail with a PEP 668 ("externally managed environment") message instead of succeeding; a second `pip_install` call while one is already running fails with "An install is already running", regardless of scenario. Six more query params force otherwise-unreachable states, in any scenario, so Connect and Settings can be checked against every one:

| Param | Forces |
|---|---|
| `?claude=invalid` | Claude Desktop's config is invalid: `claude_desktop_status` reports state `invalid` with `problem: "claude_desktop_config.json isn't valid: expected value at line 1 column 1"`; `claude_desktop_plan` and `claude_desktop_apply` both refuse |
| `?claude=seeded` | Windows only: an MSIX-packaged Claude Desktop with no config of its own yet, reading the scenario's own config from `%APPDATA%\Claude\claude_desktop_config.json` in its place — `claude_desktop_status` and `claude_desktop_plan` report `config_path` as the MSIX package's own file (under `AppData\Local\Packages\Claude_pzs8sxrjxfjjc\...`) and `seeded_from` as the `%APPDATA%` one; `claude_desktop_plan`'s `backup_path` is null and `creates_file` is true, since that file is only ever read, never written; Set up/Update then writes the package's own file once, after which `seeded_from` goes back to null |
| `?nobinary=1` | The build has no bundled `hedgebuddy` command: `claude_desktop_status`'s `binary` and `expected` are null, `claude_code_command` is `claude mcp add hedgebuddy -- hedgebuddy mcp`, `settings_overview`'s `bundle.binary` is null, and `claude_desktop_plan`/`claude_desktop_apply` refuse with "no bundled hedgebuddy command" |
| `?nowheel=1` | The build has no bundled wheel, in any scenario (`macos` already shows this by itself): `settings_overview`'s `bundle.wheel` is null. Update still installs from PyPI |
| `?prefserror=1` | `preferences.json` can't be read: `settings_overview` reports `preferences_error` (and a null `editor_command`) instead of the real value, and `preferences_set` refuses with the same message, in any scenario |
| `?catalogerror=1` | A catalog override is broken: `settings_overview` reports `catalog_error` (`offshoot.toml: TOML parse error at line 1, column 20`) and no `catalog_overrides` (a failed load falls back to the embedded catalog, which has none), in any scenario |

These combine with `?scenario=` and with each other (for example `?scenario=macos&claude=invalid`).

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
