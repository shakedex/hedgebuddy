# Changelog

All notable changes to HedgeBuddy will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
