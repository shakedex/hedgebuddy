# Changelog

All notable changes to this project are documented here. Versioning follows [ZeroVer](https://0ver.org/).

## Unreleased

### Changed
- Fresh start. The Go/Fyne desktop app, the Go updater, and the 0.10 Python library are archived under the git tag `legacy/0.10.0`. Nothing in this line is compatible with them.
- Default branch is now `main`. The old `master` branch was deleted; its last commit is tag `legacy/0.10.0`.

### Added
- Cargo workspace with `hedgebuddy-core`, `hedgebuddy-cli`, and `hedgebuddy-app` (Tauri 2).
- Python package skeleton at `python/`.
- Shared JSON Schemas and conformance fixtures at `schema/`.
- CI on Windows and macOS.
- Desktop app declares macOS 12.0 as its minimum system version.
- Core storage: profiles, typed variables, secrets, scripts with manifests and requirement checks, run-record reading and pruning, and a data-directory watcher.
- `hedgebuddy.json` may have `active_profile: null` (fresh install); fixtures gained an `empty` case and `expected.json` parse summaries.
