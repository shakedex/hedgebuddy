# Quills Changelog

All notable changes to Quills will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.9.2] - 2026-04-12

### Added

- **Version infrastructure** — `service/VERSION` as single source of truth, `internal/version` Go package exposes `Version` constant, `GET /api/version` endpoint returns `{"version": "X.Y.Z"}`
- **`sync_quills_version.py`** — dedicated version sync script (independent from HedgeBuddy's `sync_version.py`); supports `--set`, `--bump`, and `--check` for CI
- **Update checking** — `internal/updatecheck` package queries GitHub Releases with filtered tag patterns (`^quills-v\d`, `^v\d`) to detect newer versions of Quills and HedgeBuddy
- **Dynamic tray "Check for Updates"** — background check on startup (2 min delay) + every 24h; menu text changes to "Update Available — Quills vX.Y.Z" when outdated; click launches the updater agent
- **"Launch HedgeBuddy" tray item** — opens the co-located HedgeBuddy binary (installed by the HedgeBuddy Suite); silently skipped if not present (standalone installs)

### Changed

- **Release workflow** — `release-quills.yml` now produces raw binary releases only (`.exe` + universal macOS binary); NSIS and `.pkg` packaging moved to the unified `release-bundle.yml` suite workflow

---

## [0.9.1] - 2026-04-11

### Added

- **Quill repository** — remote quill index with install, uninstall, and update-available checking
- **Manual quill install** — `POST /api/quills/install-manual` for sideloading quill YAML + scripts
- **Workflow runs** — run history per workflow with status tracking (`GET /api/runs`, `GET /api/workflows/{id}/runs`)
- **Actions registry** — `GET /api/actions` returns available action types for workflow builder
- **Engine engage/disengage** — `GET /PUT /api/engaged` to pause and resume workflow execution; reflected in tray menu

---

## [0.9.0] - 2026-04-10

### Added

- **Quills service** — background automation engine for the Hedge ecosystem
- **System tray** — Windows tray icon / macOS menu bar with dashboard, pause/resume, logs, auto-start toggle, and quit
- **Web dashboard** — React + Vite SPA served by the Go binary on `localhost:12345`; workflows, events, quills, and run history views
- **Event-driven workflows** — POST events trigger matching workflows; configurable actions per workflow
- **Quill system** — installable automation plugins defined via `quill.yaml`; loaded from local `quills/` directory
- **Event log** — `POST /GET /DELETE /api/events` for ingesting and reviewing events
- **Workflow CRUD** — `POST /GET /PUT /DELETE /api/workflows` with schema validation
- **Auto-start** — Windows registry (`HKCU\...\Run`) and macOS LaunchAgent plist for start-at-login
- **NSIS installer** (Windows) and `.pkg` installer (macOS) for standalone distribution
- **Embedded web UI** — production SPA build embedded via `go:embed` for single-binary deployment
- **File browser API** — `GET /api/browse` for directory listing in the workflow builder
- **Download endpoints** — `GET /api/download/inject.py` and `/api/download/scripts/*` for distributing helper scripts
