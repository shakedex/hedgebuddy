# Changelog

All notable changes to HedgeBuddy will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
