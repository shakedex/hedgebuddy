# Changelog

All notable changes to HedgeBuddy will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

## [0.10.0] - 2026-05-25

Major UI modernization. Old top-toolbar layout replaced with a sidebar shell + right-side drawers. The 5 legacy views (`*view.go`) have been removed and rebuilt as drawers and modals composed from a shared component library.

### Added

- **Sidebar shell** — left-aligned 200px sidebar with PROFILES section (active profile highlighted, inline `+` composer and inline rename), FILTERS section (`All / String / Path / URL / Secret` with live counts and Lucide icons), and Settings/About footer links.
- **Right-side drawer overlay** — replaces the previous full-pane navigation for Edit/New/Import/Export. Esc and scrim-tap both close. Drawer content swaps without re-mounting the shell.
- **Design token packages** — `app/internal/ui/tokens/` defines colors, spacing, and radii as the single source of truth. The theme proxies to tokens.
- **OS-native font loader** — Segoe UI on Windows (`segoeui.ttf` + `segoeuib.ttf`), SF Pro on macOS, with safe fallback to Fyne's default when files are missing. Path uses `%SystemRoot%` for portability.
- **Lucide icon set** — 28 outlined SVGs vendored via `tools/icons` fetcher tool and embedded via `//go:embed`. Replaces all `theme.*Icon()` callsites in the new UI surfaces.
- **Reusable component primitives** (`app/internal/ui/components/`): `Sidebar`+`SidebarItem`, `CardRow`, `Drawer`, `IconButton` (with hover-tint and tooltip), `InlineStateButton` (idle→busy→done/error state machine), `Modal`+`ShowDeleteConfirm`, `FieldRow` with inline error caption.
- **No-toast feedback contract** — `InlineStateButton` morphs on save/import/export; `CardRow.Flash()` tints rows on save/import/duplicate/copy; `CardRow.ConfirmCopy()` swaps copy icon to a check for 1s. Replaces transient toast notifications.
- **Inline validation** — `Entry.Validator` + `FieldRow.SetError` surface variable name and value errors under the field as the user types. Modal `dialog.ShowError` reduced to disk-IO last resort.
- **Auto-reload via fsnotify** — `vars.json` is watched; external edits refresh the list automatically.
- **Variable name collision check** — `SaveVariable` refuses to rename or create a variable that would clobber an existing one. Surfaces inline under the Name field via `ErrVariableExists` sentinel.
- **Auto-scroll to flashed row** — duplicate/save/import scrolls the list to bring the affected row into view (uses real `Position().Y`, not estimated row height).
- **Inline profile composer** — new-profile and rename happen as inline editable rows in the sidebar. Modal forms remain only for Import-as-Profile.
- **Sidebar filter icons** — Lucide `type/folder/link/lock` icons next to filter labels.
- **Code-block styling for variable values** — recessed `Surface1` background distinguishes value from description.
- **Tooltip layer** — IconButtons embed `ttwidget.ToolTipWidget` for hover tooltips on all actionable icons.
- **Browse File / Browse Folder split** — path-type variables now offer both file and folder pickers.
- **Phase 2 manual QA checklist** — `docs/superpowers/specs/2026-05-24-hedgebuddy-ui-modernization-qa.md`.

### Changed

- **Storage directory case-normalized to lowercase `hedgebuddy/`** on Windows and macOS. Existing `HedgeBuddy/` directories migrate automatically on first launch. Aligns Go side with Python side; eliminates case-sensitive filesystem mismatches.
- **Python check + update check sequenced** — update dialog only fires after the Python check completes or dismisses, eliminating modal stacking.
- **Export warning** — now mentions both `.env` and JSON formats (both write secrets in plain text).
- **Delete confirm dialog** — action-specific button label (`Delete API_KEY`) and terse single-line body.
- **Python/update dialogs** — two-button layout with inline "Don't remind me again" checkbox (was 3-4 stacked buttons).
- **Install Update** — shows "Launching updater…" inline for 600ms before quit instead of disappearing instantly.
- **Validator messages** — human language ("URLs must start with http:// or https://"; "can't find this path on this machine").
- **About modal** — softened disclaimer; less shouty.
- **Default and active profile** — Rename and Delete options disabled in the ⋯ menu instead of throwing errors after the click.

### Removed

- **6 legacy view files** — `aboutview.go`, `formview.go`, `importview.go`, `exportview.go`, `profileview.go`, `helpers.go`. Replaced by `aboutmodal.go`, `editdrawer.go`, `importdrawer.go`, `exportdrawer.go`, `profilemodal.go`, `settingsmodal.go`, and the new components package.
- **Linux branch of Python lib's `_get_base_dir()`** — raises `StorageNotFoundError` on Linux. The Go GUI doesn't ship for Linux, so the silent fallback was creating drift.
- **Toast notifications and `ShowStatus`** — replaced by the inline feedback contract.
- **Manual "Refresh" toolbar button** — fsnotify replaces it.

### Fixed

- **CRITICAL: rename collision data loss** — renaming variable `A` to an existing variable `B`'s name no longer silently overwrites `B`. (Pre-Phase-2 behavior would merge into `B`, losing its value.)
- **Drop-handler leak across views** — drop handler scoped to drawer lifecycle.
- **Confirm-delete modal text wrapping** — uses `widget.Label` with `TextWrapWord`.
- **`container.NewMax`** deprecated calls replaced with `container.NewStack`.
- **Manual string truncation** replaced with `widget.Label.Truncation = TextTruncateEllipsis`.

## [0.9.1] - 2026-04-12

### Added

- **HedgeBuddy Suite installer** — unified NSIS (Windows) and `.pkg` (macOS) installer that bundles HedgeBuddy, Quills, and the new Updater agent together
- **Updater agent** (`updater/`) — standalone Go binary that downloads, confirms, and in-place replaces app binaries; native dialog prompts on Windows (MessageBox) and macOS (osascript)
- **In-app update flow** — "Download" button in the HedgeBuddy update dialog now launches the updater agent directly; falls back to browser for standalone installs without the suite
- **Quills version infrastructure** — `service/VERSION` as source of truth, `service/internal/version` Go package, `GET /api/version` endpoint, and `scripts/sync_quills_version.py` for syncing
- **Quills update checking** — `service/internal/updatecheck` package checks GitHub Releases for newer Quills and HedgeBuddy versions using filtered tag patterns
- **Dynamic tray "Check for Updates"** — Quills tray item auto-checks on startup (2 min delay) and every 24h; text changes to "Update Available — Quills vX.Y.Z" when outdated; click launches updater
- **"Launch HedgeBuddy" tray item** — Quills system tray can launch co-located HedgeBuddy binary (suite installs both to same directory)
- **`build:suite` task** — VS Code task that builds all three binaries (HedgeBuddy, Quills, Updater) into a local `build/` folder for testing
- **`release-bundle.yml` workflow** — manually triggered GitHub Actions workflow that downloads released binaries and packages them into platform installers; no rebuilding

### Changed

- **`release-quills.yml`** — simplified to binary-only releases (raw `.exe` + universal macOS binary); NSIS and `.pkg` packaging moved to the suite workflow

---

## [0.8.7] - 2026-04-10

### Patch

- Fixed Fyne `DoAndWait` issue with status text updates
- Bumped version to 0.8.7 across all relevant files

---

## [0.8.6] - 2026-04-10

### Patch

- Fixed formatting issues with `.json` files
- Bumped version to 0.8.6 across all relevant files

---

## [0.8.5] - 2026-04-09

### Profiles (Desktop App + Python Library)

- Added **profile-based storage** with active profile switching in the desktop app toolbar
- Added **Profile Manager** (gear button) with create, rename, duplicate, delete, and import-as-profile actions
- Added migration from legacy single `vars.json` layout to profile layout:
  - `%APPDATA%\HedgeBuddy\profiles.json` + `%APPDATA%\HedgeBuddy\profiles\<name>\vars.json` (Windows)
  - `~/Library/Application Support/HedgeBuddy/profiles.json` + `~/Library/Application Support/HedgeBuddy/profiles/<name>/vars.json` (macOS)
- Updated Python library storage discovery to load from the **active profile** via `profiles.json` (no public API changes)
- Updated documentation across root/docs/app/python-lib pages to reflect profile workflows and new storage paths

---

## [0.8.0] - 2026-04-09

### Desktop App — UI/UX Overhaul

- **Native OS file dialogs** — replaced Fyne's built-in file picker with [`zenity`](https://github.com/ncruces/zenity), giving users the real Windows/macOS file browser with favorites, network drives, and keyboard navigation everywhere (Browse path, Import, Export JSON, Export .env)
- **Consistent navigation** — all sub-views (New Variable, Edit Variable, Import, Export, About) now follow the same layout: page title in header, **Cancel** (bottom-left) + primary action (bottom-right); no duplicate Back buttons
- **Removed brand row from list header** — logo and app title dropped from the top of the variable list to reclaim vertical space; window title bar identifies the app
- **Compact single-row toolbar** — New / Import / Export action buttons on the left; Reload / Open Folder / About icon buttons on the right; status text inline
- **Search clear button** — ✕ button beside the search field clears the query instantly
- **Icon-action widget** (`iconAction`) — custom hover-aware icon button replacing `widget.Button` for card actions:
  - Hover highlight for all actions (semi-transparent white bg)
  - **Delete shows red background on hover only** — no persistent red tint at rest
  - Tooltips rendered as canvas overlays on hover ("Copy value", "Reveal value", "Edit", "Duplicate", "Delete", "Reload variables", "Open storage folder", "About HedgeBuddy")
- **Reveal (eye) button** — moved to left-most action slot; **only shown on secret-type variables**; hidden entirely for string/path/url
- **Distinct icons for Copy vs Duplicate** — Copy value uses `ContentCopyIcon`; Duplicate uses `ContentPasteIcon`
- **Muted text contrast improved** — `ColorTextMuted` brightened from `#5C5C68` to `#8888A0` (~WCAG AA) so descriptions and captions are readable
- **`[string]` type badge visible** — badge color changed from near-invisible muted to `ColorTextSecond` (`#A0A0AC`)
- **Scrollbar more visible** — width increased (4→6 small, 8→10 normal) and color changed to `ColorTextMuted`
- **Import empty state** — replaced hedgehog logo with upload icon; content is now true center-center (not top-biased); clearer instructional copy
- **About page** — removed redundant "About" header; content is clean scrollable centered layout with Cancel footer
- **`EmptyState` helper refactored** — accepts an optional `fyne.Resource` icon (pass `nil` for hedgehog); uses `container.NewCenter` for true vertical centering

---

## [0.7.0] - 2026-04-08

### Desktop App — Migrated from Wails to Fyne

- **Replaced Wails + TypeScript/Svelte frontend with pure-Go Fyne GUI** — eliminates Node.js dependency, CGO-only build pipeline
- **No more `hedgebuddy-wails/` directory** — desktop app now lives in `app/`
- **Custom dark theme** — full `fyne.Theme` implementation matching HedgeBuddy brand colors (dark background, blue accent, green success states)
- **All views rewritten in Go** — list, form, import, export, about — each a self-contained `fyne.CanvasObject`
- **Central `AppController`** — manages navigation and shared state; views have no cross-dependencies
- **Variable list** — real-time search/filter by name, value, description, or type; variable count display
- **Add/Edit form** — type selector (string, path, URL, secret), inline validation errors, cancel/back navigation
- **Secret masking** — secret values render as `••••••••` with click-to-reveal toggle
- **Copy to clipboard** on value, one-click per variable card
- **Duplicate variable** — clones with `_COPY` suffix for rapid creation
- **Import view** — file dialog to load JSON template files; select/deselect variables before importing
- **Export view** — export selected variables as JSON template or `.env` format
- **Keyboard shortcuts** — Ctrl+N (new variable), Ctrl+F (focus search), Delete (remove selected)
- **Header layout** — logo + app name left side; utility buttons (refresh, open folder, about) top-right; toast notifications bottom-right
- **Toast notifications** — status messages flash in the header on actions (reload, copy, save, import, export) then fade; no persistent "Variable Manager" subtitle
- **Empty state** — prompt with Add and Import buttons shown when no variables exist
- **`FyneApp.toml`** — Fyne package metadata (app ID `co.hedge.hedgebuddy`, version, icon) for `fyne package`
- **Bundled icon via `//go:embed`** — using `fyne.io/tools/cmd/fyne` (non-deprecated CLI) with embed directive
- **Updated icon** — switched to `hedgebuddy_icon2` across all platforms (PNG, ICO, ICNS)
- **`fyne package` replaces `wails build`** — produces native `.exe` (Windows) and `.app` bundle (macOS) with embedded icon and metadata
- **Release workflow rewritten** — GitHub Actions targets `app/` instead of `hedgebuddy-wails/`; no Node.js step; uses `fyne.io/tools/cmd/fyne@latest`
- **Renamed variable type `secure` → `secret`** — storage and UI use `"secret"`; backward-compatible reader for legacy `"secure"` values
- **Storage path casing fixed** — both app and docs now consistently use `HedgeBuddy` (PascalCase) not `hedgebuddy`

## [0.6.0] - 2025-11-30

- Desktop app with full CRUD for variables (add, edit, delete)
- Variable types: String, Path, URL
- Path validation (checks existence), URL validation (http/https)
- Import variables from JSON template files
- Browse button for path selection
- Refresh/Open folder buttons
- About screen, toast notifications
- Python library: `var()`, `exists()`, `all_vars()`, `inject_env()`
- Logging module for headless scripts
- Custom exceptions with helpful messages
- Example scripts for FoolCat, OffShoot integrations
- `secure` type planned for future (OS keychain)

## [0.5.1] - 2025-11-17

- Initial Python library release on PyPI
- Basic variable reading from vars.json

## [0.5.0] - 2025-11-15

- Initial project structure
- Wails app skeleton
- Python library skeleton
