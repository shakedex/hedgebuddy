# Changelog

All notable changes to this project are documented here. Versioning follows [ZeroVer](https://0ver.org/).

## Unreleased

### Changed
- Fresh start. The Go/Fyne desktop app, the Go updater, and the 0.10 Python library are archived under the git tag `legacy/0.10.0`. Nothing in this line is compatible with them.
- Default branch is now `main`. The old `master` branch was deleted; its last commit is tag `legacy/0.10.0`.
- `check_requirements` counts a secret without a stored value as unmet.
- `list_runs` decodes run files lossily, so one bad byte skips a single line instead of the whole day.
- On Windows, atomic writes retry a rename that fails with `PermissionDenied` for up to one second.
- The desktop app now requires macOS 26.0 or newer.

### Added
- Cargo workspace with `hedgebuddy-core`, `hedgebuddy-cli`, and `hedgebuddy-app` (Tauri 2).
- Python package skeleton at `python/`.
- Shared JSON Schemas and conformance fixtures at `schema/`.
- CI on Windows and macOS.
- Desktop app declares macOS 12.0 as its minimum system version.
- Core storage: profiles, typed variables, secrets, scripts with manifests and requirement checks, run-record reading and pruning, and a data-directory watcher.
- `hedgebuddy.json` may have `active_profile: null` (fresh install); fixtures gained an `empty` case and `expected.json` parse summaries.
- Hedge app catalog (`catalog/*.toml`) for OffShoot, FoolCat, EditReady, and Canister, overridable from `<data>/catalog/`.
- Core Hedge integration: app detection with version warnings, script attachment state, attach/detach with dry runs, profile-wide attachment sync, URL-scheme commands with callback-log responses, OffShoot presets, and app log tails.
- Camera-card volume inspection and Python interpreter discovery.
- `hedgebuddy mcp`: an MCP server over stdio with 31 tools (profiles, variables, scripts, attachments, Hedge app commands and presets, runs, volumes, environment), catalog and schema resources, and an `author_script` prompt.
- `hedgebuddy tools` and `hedgebuddy call <tool> <json>` run the same tools from a shell.
- Manual smoke checklist for real Hedge apps (`docs/smoke-checklist.md`).
- Python package `hedgebuddy` 0.11.0: `@hb.script` (manifest, requirement checks, run records, exit codes), typed `vars`, the `event` payload, `hb.var`, `hb.exists`, `hb.all_vars`, `hb.inject_env`, `hb.log`, and `hb.event`.
- Python conformance tests assert the shared `expected.json` fixtures, like core.
- `check_script` reports a missing or mismatched `hedgebuddy` package; manifests may start with a UTF-8 BOM.
- Manual PyPI publish workflow with trusted publishing (`docs/releasing-python.md`).
- The desktop app's first screens: Home, Runs with run details, a sidebar that collapses to an icon rail in narrow windows, and profile switching and creation.
- Every tool has a typed result: `tools/list` advertises each tool's `outputSchema`, and a successful call returns `structuredContent` next to the same JSON text.
- `hedgebuddy tools --schemas` prints every tool's input and output schema; the app's TypeScript types are generated from it.
- The MCP server records each tool call in `activity.jsonl` (tool, target and outcome, never argument values) and trims the file to the last 200 calls once it passes 250.
- Writes from the MCP server, `hedgebuddy call` and the app take a cross-process lock on the data folder, waiting up to 10 seconds before failing with "another HedgeBuddy is busy; try again".
- The app keeps its preferences, such as when it was last opened, in `preferences.json`.
