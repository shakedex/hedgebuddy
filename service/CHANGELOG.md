# Quills Changelog

All notable changes to Quills will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.9.3] - 2026-04-13

### Added

- **Step output aliases** — workflow steps now carry an `output_alias` field; engine stores results under the alias so later steps can reference outputs via `{{steps.<alias>.<field>}}`; auto-derived from quill YAML `output:` declarations on step creation and mode change
- **`OutputMeta` on actions** — all actions declare their output fields via `OutputMeta` structs on `ActionMeta`; data-producing actions (`file.read`, `http.*`, `ftp.*`, etc.) expose typed output field names
- **FieldsSidebar step outputs** — sidebar in the workflow editor resolves each step's output fields through the quill→action chain and renders draggable `{{steps.<alias>.<field>}}` chips grouped by step
- **"Output as" editor in StepCard** — steps with data-producing actions show a visually distinct "Output as" section (dashed border, muted background) for naming the step output; only shown when the step produces outputs; auto-sanitised to valid identifier characters

### Fixed

- **`null` array serialisation crash** — Go nil slices serialise as `null` in JSON; all frontend code accessing `.outputs`, `.steps`, and `.modes` on action/quill types now guards against `null` with optional chaining and `?? []` fallbacks
- **Array values in templates** — `{{event.sourcePaths}}` and similar array-valued event fields were rendered with Go's `[value]` bracket notation; replaced `fmt.Sprintf("%v", val)` with `stringifyValue()` helper that unwraps single-element arrays and JSON-encodes multi-element arrays cleanly
- **`{{event_summary}}` array values** — `buildEventSummary` now uses `stringifyValue()` so path arrays in Slack messages no longer include brackets
- **Event summary truncation** — per-field truncation limit raised from 60 to 120 characters so long paths are not prematurely cut off in Slack/log output
- **Step alias vs engine key mismatch** — `deriveOutputAlias` was not mode-aware; for mode-only quills (e.g. `file-ops`) the default alias was derived from the quill ID (`file_ops`) while the engine stored under the YAML `output:` name (`file_content`); fixed by checking mode-specific steps first; engine now also stores under both the YAML name and the user alias so either reference works

### Changed

- **Quills list sort order** — `Library.List()` now returns quills sorted by category then name; eliminates random ordering on each page refresh
- **Version comparison for updates** — `CheckUpdates` replaced simple string `!=` with `isNewerVersion()` that does numeric semver segment comparison; local 1.1.x is no longer flagged as needing an "update" when the remote repo still carries 1.0.x
- **Installed quill badge** — `QuillCard` now renders a distinct green-tinted "Installed" badge for user-installed quills and a muted "Builtin" badge for built-ins; previous low-contrast outline badge was nearly invisible
- **Views full-width layout** — Runs, Quills, and Settings views had `max-w-4xl`/`max-w-3xl` constraints that left large dead zones at wide viewports; constraints removed so all views scale to available space consistently with the Events and Workflows views
- **Run history input display** — long input values (e.g. file paths) now use `break-all` word wrapping instead of `truncate` so the full value is always visible; keys and values both carry native `title` attributes for hover tooltips

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
