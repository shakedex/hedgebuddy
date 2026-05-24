# HedgeBuddy UI Modernization — Design Spec

**Date:** 2026-05-24
**Status:** Awaiting user review
**Owner:** Shaked Lipszyc
**Implementation approach:** view-first (Approach B) — rebuild the list view end-to-end with the new design language, extract shared bits to components only when a second view needs them.

---

## 1. Background

The desktop GUI ([HedgeBuddy](../../README.md)) is a Fyne v2.7.3 Go app for managing local environment variables. A full audit ([conversation log, 2026-05-24]) identified the current UI as functional but visually dated — Material-circa-2018 chrome, modal-popup validation, screaming red delete affordances on every row, ambiguous icon choices (clipboard = duplicate), no rounded corners, low-contrast cards, and a top-toolbar that gets cramped fast.

This spec captures the modernization direction agreed during the brainstorm:

- **Structural refresh** — chrome is free to change, actions remain.
- **No toasts** — feedback lives inside the surface that triggered the action.
- **Left sidebar + main list + right-side drawers** for editing/import/export.
- **Dark theme only**, leaned-into.
- **Two milestones**: Phase 1 visual + chrome, Phase 2 behaviors + correctness.
- **Bundle Lucide outlined icons**, use **OS-native fonts** with Fyne default as fallback.
- **Mouse-first** — only Esc / Enter for form keyboard handling. No command palette, no per-action shortcuts.

The Python library and storage formats stay unchanged in Phase 1. Phase 2 includes a case-normalization migration to resolve the `HedgeBuddy` (Go) vs `hedgebuddy` (Python) directory mismatch.

---

## 2. Goals & non-goals

### Goals
- The app reads as 2026-modern at first glance: spacing, color contrast, typography, iconography, card surfaces.
- Every action communicates its result on the same surface that triggered it — no toasts, no banners.
- Editing/importing/exporting no longer replaces the list view; it overlays via a right-side drawer.
- The number of correctness bugs from the audit shipping unresolved drops to zero by the end of Phase 2.
- Codebase stays maintainable: a small set of reusable primitives (`Sidebar`, `CardRow`, `Drawer`, `InlineStateButton`, `IconButton`, `Modal`).

### Non-goals
- Light theme. Dark only.
- Toast/snackbar widget. Removed entirely from the project vocabulary.
- Command palette (Ctrl+K).
- Per-action keyboard shortcuts beyond Esc/Enter.
- Multi-select / bulk delete on the main list.
- Recently-deleted / soft-delete drawer. Confirm modal is the safety gate.
- Inline edit-in-place (double-click to edit a value in the list). All editing opens the drawer.
- Window-size persistence between launches.
- Update dialog rendering markdown release notes.
- OS-keychain secret encryption (tracked in [TODO.md](../../../TODO.md)).
- Drawer slide-in animation. Tracked as a separately-scoped future task; Phase 1 ships instant in/out.
- Row-collapse-on-delete animation. Row is removed immediately; list reflows instantly.

**Animations that ARE in Phase 1 scope** — these are part of the no-toast feedback contract, not chrome polish:

- `InlineStateButton` state transitions (text/color swap, no motion).
- Row flash on save/import (briefly-tinted background that fades back to resting via `fyne.NewAnimation` color tween). This is the signal that tells the user *which* row just changed; removing it would gut the no-toast contract.
- Icon glyph swap on Copy (`copy` → `check` for 1 s, no motion — purely a resource swap).

---

## 3. Architecture overview

Two-column shell, drawer-based secondary surfaces.

```
┌─────────────────────────────────────────────────────────────┐
│  HedgeBuddy                                                 │  native title bar
├─────────────┬───────────────────────────────────────────────┤
│             │ 🔍 Search                              [+ New]│
│  PROFILES + │ ┌─────────────────────────────────────────┐   │
│  ▸ default  │ │ API_KEY                                 │   │
│    staging  │ │ secret · masked                  ⋯ icons│   │
│    prod     │ │ API key for the live billing service    │   │
│             │ └─────────────────────────────────────────┘   │
│  FILTERS    │ ┌─────────────────────────────────────────┐   │
│  All     11 │ │ REPORT_PATH                             │   │
│  String   4 │ │ path · C:\…\reports\daily.csv     icons │   │
│  Path     3 │ │ Where the daily CSV is dropped          │   │
│  URL      2 │ └─────────────────────────────────────────┘   │
│  Secret   2 │                                               │
│             │  + New variable                               │
│ ─────────── │                                               │
│  Settings   │                                               │
│  About      │                                               │
└─────────────┴───────────────────────────────────────────────┘
```

- **Sidebar** (≈ 200 px fixed): profiles list, filter chips, settings/about footer links.
- **Main pane**: search input (with leading icon inside, trailing clear-X inside), variable cards, inline `+ New variable` anchor at the bottom of the list.
- **Drawer**: 480 px right-anchored panel for Edit / New / Import / Export. Dim overlay over the list. Esc and overlay-tap both close.
- **Modals**: centered, for Delete confirm, Profile create/edit/duplicate/import, Settings, About, Python check, Update check.

### Controller changes

`AppController` (today's [app.go](../../../app/internal/ui/app.go)) replaces most `setMainContent(...)` calls with `OpenDrawer(title, body)` / `CloseDrawer()`. The list view becomes the persistent main content; the controller's job is to manage drawer state and the active modal stack.

The current `ShowFormView`, `ShowImportView`, `ShowExportView`, `ShowProfileView`, `ShowAboutView` are replaced by:

- `OpenEditDrawer(editingName, prefill...)` / `OpenNewDrawer()` → drawer.
- `OpenImportDrawer()` → drawer.
- `OpenExportDrawer()` → drawer.
- `ShowProfileFormModal(mode, prefill...)` → centered modal.
- `ShowSettingsModal()` → centered modal.
- `ShowAboutModal()` → centered modal.

`ShowListView()` remains but only re-renders the list inside the persistent main pane — it does NOT swap out the shell.

---

## 4. Design language

Dark-only. Semantic tokens; behavioral changes don't require finding hex literals.

### 4.1 Color tokens

| Token | Hex | Purpose |
|---|---|---|
| `SurfaceBase` | `#0E0E11` | App background, sidebar background |
| `Surface1` | `#15151A` | Sidebar section header background |
| `Surface2` | `#1D1D24` | Card resting state |
| `Surface3` | `#25252F` | Card hover, input field background |
| `Surface4` | `#1A1A20` | Drawer panel background |
| `BorderSubtle` | `#2A2A33` | 1 px borders on cards / inputs |
| `BorderFocus` | `#4F7FF8` @ 35% α | Focus ring around inputs / buttons |
| `TextPrimary` | `#E8E8EE` | Variable names, headings |
| `TextSecondary` | `#A4A4B3` | Values, descriptions |
| `TextMuted` | `#6E6E80` | Captions, idle icons, placeholder |
| `Accent` | `#4F7FF8` | Primary CTA, active sidebar item, focused input border |
| `AccentHover` | `#6B95FA` | Hover/pressed state for accent |
| `Danger` | `#EF4444` | Only used in destructive modal's confirm button and on-hover delete icon |
| `Warning` | `#F59E0B` | Inline warning strips (e.g., secret-export warning) |
| `Success` | `#22C55E` | Inline-state Saved/Copied indicators |
| `TypePathColor` | `#22C55E` | Stripe on path cards |
| `TypeUrlColor` | `#4F7FF8` | Stripe on URL cards |
| `TypeSecretColor` | `#EF4444` | Stripe on secret cards |
| `TypeStringColor` | `#6E6E80` | Subtle (strings are the default — minimal stripe) |

Implementation: [`theme.go`](../../../app/internal/ui/theme.go) is rewritten with these semantic names. The existing `ColorBgPrimary` etc. are removed.

### 4.2 Typography

**OS-native fonts**, with Fyne's default font as fallback. The custom theme's `Font(style)` method loads the appropriate file at startup:

| Platform | File path | Fallback if missing |
|---|---|---|
| Windows | `C:\Windows\Fonts\segoeui.ttf` (regular), `segoeuisb.ttf` (semibold) | Fyne default |
| macOS | `/System/Library/Fonts/SFNS.ttf` (with weight axis via variable font) | `/Library/Fonts/Helvetica.ttc`, then Fyne default |

The loader runs once at startup, wraps the bytes in `fyne.NewStaticResource("system-regular", data)`, and caches the resource. If neither file is found, the custom theme silently falls back to `theme.DefaultTheme().Font(style)`.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Heading | 22 px | Semibold | View titles (drawer headers, modal titles) |
| Subheading | 16 px | Medium | Section labels |
| Body | 13 px | Regular | Variable values, descriptions |
| Body strong | 13 px | Medium | Variable names |
| Caption | 11 px | Regular | Type badges, counts, hints, inline errors |

Line-height ~1.4. Bold-everywhere is replaced with selective Medium emphasis.

### 4.3 Spacing (8-pt grid)

`xs=4 · sm=8 · md=12 · lg=16 · xl=24 · xxl=32` — exposed via constants in a new `app/internal/ui/tokens/spacing.go` file. The theme's `SizeNamePadding` returns `sm=8`.

### 4.4 Radii

Implemented via `canvas.Rectangle.CornerRadius` (Fyne 2.4+).

| Element | Radius |
|---|---|
| Card | 8 px |
| Button | 6 px |
| Input | 6 px |
| Sidebar item | 6 px |
| Drawer panel | 0 (flush with right edge of window) |

### 4.5 Elevation

Faked through surface lift + 1 px subtle border; no real drop shadows (Fyne does not render them cheaply).

- **Card at rest** = `Surface2` + 1 px `BorderSubtle`
- **Card hover** = `Surface3` + 1 px `BorderSubtle`
- **Drawer** = `Surface4`, with a black @ 50% α overlay covering the main pane behind it
- **Focused input** = 1 px `Accent` inner border + 2 px `BorderFocus` outer ring

### 4.6 Density

Each variable card has a minimum height of 64 px so the list grid feels rhythmic. Description text is single-line, ellipsized; long descriptions get a tooltip on hover instead of wrapping.

---

## 5. Iconography

### 5.1 Source

**[Lucide](https://lucide.dev/)** — MIT-licensed, ~1,500 outlined SVGs, 1.5 px stroke at 24×24. Bundled as Fyne resources.

### 5.2 Bundling pipeline

1. `tools/icons/sources.txt` lists the icon names we need (see inventory below).
2. `tools/icons/main.go` downloads each SVG from the Lucide GitHub repo (pinned commit hash) into `app/internal/ui/icons/svg/`. Any per-SVG normalization needed for Fyne's renderer (e.g., stripping `currentColor`, converting strokes to a known color the IconButton can re-tint) is done at this step.
3. The script then invokes `fyne bundle -package icons` against that directory, producing `app/internal/ui/icons/bundled.go` with exported `var IconCopy fyne.Resource`, `IconPencil`, etc.
4. The generated file is committed. No internet dependency at build time. Re-run the script only when adding/removing icons.

The exact tinting pathway used by `IconButton` is left to the implementation — candidates include Fyne's `theme`-aware resource wrappers, a thin SVG re-color helper, or per-state pre-rendered variants. The chosen approach must support: muted at rest, primary on hover, danger on hover for the delete variant.

### 5.3 IconButton helper

```go
// In app/internal/ui/components/iconbutton.go
type IconButton struct {
    widget.Button
    iconResource fyne.Resource
    danger       bool   // delete-style: muted at rest, danger on hover
}
```

- Renders the SVG at 18×18.
- At rest: tinted `TextMuted`.
- Hover: tinted `TextPrimary` (or `Danger` if `danger=true`).
- Tooltip via existing `dweymouth/fyne-tooltip`.

### 5.4 Inventory (Phase 1)

| Action / surface | Lucide name | Replaces |
|---|---|---|
| New | `plus` | `theme.ContentAddIcon()` |
| Import | `download` | `theme.FolderOpenIcon()` |
| Export | `upload` | `theme.DocumentSaveIcon()` |
| Search (leading) | `search` | n/a (new) |
| Clear search | `x` | `theme.CancelIcon()` |
| Edit row | `pencil` | `theme.DocumentCreateIcon()` |
| Copy row | `copy` | `theme.ContentCopyIcon()` |
| Duplicate row | `copy-plus` | `theme.ContentPasteIcon()` (fixes clipboard-as-duplicate confusion) |
| Delete row | `trash-2` | `theme.DeleteIcon()` |
| Reveal secret | `eye` / `eye-off` | `theme.VisibilityIcon()` / `VisibilityOffIcon()` |
| Browse file | `file` | n/a |
| Browse folder | `folder-open` | `theme.FolderOpenIcon()` |
| Sidebar: Profile add | `plus` | n/a |
| Sidebar: Profile row menu | `more-horizontal` | n/a |
| Sidebar: Settings | `settings` | `theme.SettingsIcon()` |
| Sidebar: About | `info` | `theme.InfoIcon()` |
| Drawer close | `x` | `theme.NavigateBackIcon()` |
| Inline-state Saved | `check` | n/a |
| Inline-state Error | `x` | n/a |

App icon stays — the hedgehog mascot in [bundled.go](../../../app/internal/ui/bundled.go) is unchanged.

### 5.5 Cost

Binary growth in Phase 1:
- Lucide SVGs: ~30 × < 1 KB = ~30 KB.
- No bundled font (OS-native).

Net Phase 1 binary delta: under 50 KB.

---

## 6. Component primitives

Built view-first (Approach B). Each promoted to a shared component only when a second view needs it.

### 6.1 `Sidebar` and `SidebarItem`

Located at `app/internal/ui/components/sidebar.go`.

- 200 px fixed-width container; `Surface1` background, no top padding.
- Sections: caption label (`PROFILES`, `FILTERS`) + stack of `SidebarItem`s.
- `SidebarItem(label string, count *int, active bool, onTap func())`:
  - 32 px tall, 6 px corner radius, 12 px horizontal padding.
  - Hover lifts background to `Surface3`.
  - Active state: `Surface3` background + 2 px `Accent` left bar.
  - Optional `count` displayed right-aligned in `TextMuted`.

### 6.2 `CardRow`

Located at `app/internal/ui/components/cardrow.go`. Replaces the inline `createVariableCardTemplate` / `updateVariableCard` pair in [listview.go](../../../app/internal/ui/listview.go).

- Outer: `canvas.Rectangle` with `CornerRadius=8`, fill `Surface2`, 1 px `BorderSubtle`.
- Left edge: 3 px tall stripe in `TypeColor(v.Type)`. Strings get no stripe (string is the default — minimal visual weight).
- Top row: name (medium 13 px `TextPrimary`) · type badge (caption 11 px in `TypeColor` — small dot + word, no brackets). Right side: action icons revealed on hover only.
- Body row: value (mono 12 px `TextSecondary`, middle-ellipsized for paths via a helper).
- Foot row: description (12 px `TextMuted`, end-ellipsized, hover-tooltip for full text).
- Min height 64 px, 12 px inner padding.
- Mouse-in / mouse-out handlers toggle icon visibility and background tint.

Reveal-secret state lives on the `CardRow` widget itself, not in an external map — this also fixes a subtle issue today where the external `revealed` map can fall out of sync after operations that rebuild the list.

### 6.3 `Drawer`

Located at `app/internal/ui/components/drawer.go`. A `container.NewStack` overlay added once to the app shell.

- Two layers:
  1. `canvas.Rectangle` dim overlay (black @ 50% α) covering the full window, capturing tap-to-close.
  2. Right-anchored `Surface4` panel sized 480 × full-height, with a header (heading 22 px on the left, `x` close icon top-right) and a scrollable content area below.
- Esc key closes via the shell's `Canvas().SetOnTypedKey`.
- API:
  ```go
  shell.OpenDrawer(title string, content fyne.CanvasObject, onClose func())
  shell.CloseDrawer()
  ```
- Drawer content is just a `fyne.CanvasObject` — the existing `NewFormView`, `NewImportView`, `NewExportView` are retargeted from "view-returning-CanvasObject" to "drawer-body-returning-CanvasObject."
- On open: previous canvas focus is saved; drawer body's first focusable element gains focus. On close: previous focus is restored.

### 6.4 `InlineStateButton`

Located at `app/internal/ui/components/inlinestate.go`. The toast replacement for primary actions.

States: `idle → busy → done → idle (after ~1 s hold)`, with an `error` branch from `busy`.

```
[ Save ]                  idle    (Accent fill, white text)
[ ⟳ Saving… ]            busy    (disabled, spinner glyph, dimmer fill)
[ ✓ Saved ]               done    (Success fill, check icon, held ~1000 ms)
[ Save ]                  idle    (back to start)

  on error from busy:
[ ✕ Save failed ]         error   (Danger fill, sticks until user clicks again or 3 s elapse)
```

- Custom widget extending `widget.Button`. `SetState(state)` triggers visual update + animation via `fyne.Do` from the action goroutine.
- Used for: Save (form), Import Selected, Export, Create Profile, Install Update, Install Python Library.

### 6.5 `IconButton`

Standardized. See §5.3. Every clickable icon goes through this.

### 6.6 `FieldRow`

Located at `app/internal/ui/components/fieldrow.go`. Used in the edit/new drawer.

- Vertical stack: label (subheading, 16 px medium) → entry → inline error caption (`Danger`) shown only when invalid.
- Wraps a `widget.Entry` and wires `entry.Validator` so errors appear inline as the user types. Phase 1 wires the structure; Phase 2 plugs in `widget.Form` validation across the board.
- For type "path": trailing `File…` and `Folder…` IconButtons (audit A5 — current single Browse opens directory picker only).
- For type "secret": entry swaps to `widget.PasswordEntry` with a leading `eye` toggle.
- Backing storage is a single `*string` shared across the type variants — no more dual-entry shadow state (audit A6).

### 6.7 `EmptyState`

The existing [helper](../../../app/internal/ui/helpers.go) stays. Restyled with the new tokens; uses `database-zap` Lucide icon (or the hedgehog mascot — chosen per-callsite).

### 6.8 `Modal`

Located at `app/internal/ui/components/modal.go`. Centered dialog wrapper using the new tokens.

- Delete-confirm copy:
  - Title: `Delete API_KEY?`
  - Body: `This variable will be removed from the default profile. Scripts that reference it will fail until it's recreated.` (wraps via `widget.Label`, not `canvas.NewText` — fixes audit A9).
  - Buttons: `Cancel` (ghost) · `Delete API_KEY` (`Danger` fill, action-specific text).
- Profile create/edit/duplicate/import unified into one `ProfileFormModal(mode, prefill)`:
  - Modes: `new`, `edit`, `duplicate`, `import-as-profile`.
  - Fields shown/hidden by mode.

### 6.9 NOT a component in Phase 1

- Type filter chips — live inside the sidebar; promote later only if filters reappear elsewhere.
- Search input — single instance, stays inline.
- Toast/snackbar — never built.

---

## 7. Per-view specifications

### 7.1 List view (main pane)

- **Sidebar** replaces today's top-right cluster entirely. The current profile dropdown, manage-profiles gear, refresh button, folder button, and About button all move to the sidebar or to Settings.
- **Top of main pane** is the search input (full width, 36 px, leading `search` icon inside, trailing clear-`x` inside when there's text) and a small `+ New` Accent button to its right.
- **Filter chips** live in the sidebar with live counts ("`All 11 · String 4 · Path 3 · URL 2 · Secret 2`"). The "11 variables" count line at the top of the pane is removed.
- **Cards** redesigned per §6.2.
- **Bottom inline anchor**: `+ New variable` button under the last card.
- When the active filter has zero matches, the empty state renders inline with text like "No path variables match 'foo'".

### 7.2 Edit / New variable drawer

Opens from the row's pencil icon or the `+ New` button. 480 px right drawer.

```
Edit variable                                ✕
─────────────────────────────────────────────

Name
[ API_KEY                              ]
↳ inline error if invalid (red caption)

Type
◯ String   ◯ Path   ◯ URL   ◉ Secret

Value
[ •••••••••••••• ]                 👁
↳ inline error if invalid

Description
[ API key for the live billing service  ]

─────────────────────────────────────────────
Cancel                              [ Save ]
```

- `FieldRow`s in order: Name, Type, Value, Description.
- Type radio displays Capitalized labels (`String / Path / URL / Secret`); stored value remains lowercase.
- For Path type: `File…` and `Folder…` icon buttons trailing the value field.
- For URL type: inline validator checks `http://` or `https://` prefix.
- For Secret type: password entry with leading `eye` toggle.
- `Save` is an `InlineStateButton`.
- Esc closes; clicking dim overlay closes; if dirty, a small "Unsaved changes" caption appears next to the close icon — a second close click confirms.

### 7.3 Import drawer

- Top: `Choose file…` (`folder-open` icon) + filename label, or a dashed-border drop zone with hint text "Drag a .json file here".
- The drop handler is wired only on drawer open and cleared on drawer close (audit A2 fix).
- Below: list of checkbox cards (one per variable in the file). Each card shows checkbox · name · type badge · current value (editable inline `widget.Entry`) · "exists" warning if overwriting.
- Drawer header right side: `Select all` ↔ `Deselect all` toggle.
- Bottom of drawer: `Cancel` + `Import N selected` `InlineStateButton`. N updates live as checkboxes toggle.

### 7.4 Export drawer

- Top: list of all current variables as read-only checkbox cards. Default: all checked.
- Below the list: two `InlineStateButton`s side by side — `Export as JSON…` and `Export as .env…`.
- **Secret warning shown identically for both formats** (audit A1 fix): if any selected variable is `secret`, a yellow `Warning` strip above the buttons reads "N secret values will be exported in plain text." The strip is informational — buttons stay enabled.
- After Zenity save dialog completes, the relevant button morphs done → idle. Drawer stays open until user dismisses, so the other format can be exported without reselecting.

### 7.5 Profile management

No separate "Profiles" view. Profiles live in the sidebar.

- Hover a profile row → reveals a `more-horizontal` IconButton. Clicking opens a `widget.PopUpMenu` (Fyne core, since 2.0) anchored to the icon with `Rename` / `Duplicate` / `Delete` items.
- `+` icon in the `PROFILES` section header opens `ProfileFormModal(mode=new)`.
- `ProfileFormModal` is one shared modal (audit B16) with modes: `new`, `edit`, `duplicate`, `import-as-profile`.
- Delete uses the redesigned confirm modal.
- After rename, the sidebar refreshes — audit A4 is no longer applicable (no dropdown to fall out of sync).

### 7.6 Settings (new, centered modal)

Footer link in the sidebar. Modal ~420 × 320.

- **Storage** — read-only path + `Reveal in Finder/Explorer` button (replaces today's top-bar folder icon).
- **Updates** — checkbox "Check for updates on launch" (currently always on).
- **Python check** — `Reset 'Don't ask again'` button (no current way to recover from a stuck dismissal).
- **About HedgeBuddy** link (opens About modal).

### 7.7 About (centered modal)

Modal ~440 × 480, restyled with new tokens. Same content as today: logo, version, author, GitHub + website links, built-with list, disclaimer. Disclaimer copy softened (audit C12): "Independent project. Not affiliated with Hedge (hedge.co)." instead of the current shouty "NOT affiliated."

Bullets in built-with become plain dashes (no LowImportance trio).

### 7.8 Python check & update dialogs

- Reduced to **two buttons each**: primary CTA + "Not now."
- "Don't ask again" moves to a small checkbox inside the dialog body, below the message — not a third button (audit C5).
- "Install Update" → button morphs busy → "Launching updater…" inside the dialog for ~600 ms before quit, so the user sees the action register (audit B14).
- Install/upgrade progress dialog keeps live console + progress bar; the bottom "Close" button morphs `Installing…` → `✓ Installed — Close`.

---

## 8. Feedback model (the no-toast contract)

Full table of action → reaction. No toasts. No banners. No transient overlays.

| Action | Visual reaction |
|---|---|
| Save (new or edit) | `InlineStateButton` cycles idle → busy → done → idle. Drawer closes. The saved row briefly flashes background to `Surface3` and fades back to `Surface2` over ~600 ms. |
| Cancel in drawer | Drawer closes instantly (no animation in Phase 1). List underneath is unchanged. Esc same. |
| Copy value (row icon) | Icon glyph swap: `copy` → `check` for 1 s → back. Tint briefly `Success`. |
| Reveal secret (row icon) | `eye` ↔ `eye-off` swap. Value masking toggles in place. State persists per `CardRow` instance for the session. |
| Duplicate (row icon) | New `_COPY` row appears with the flash highlight. Edit drawer does NOT open automatically (departure from current behavior — calmer). |
| Delete (row icon) | Confirm modal. On confirm: modal closes, row is removed immediately, list reflows, sidebar filter counts decrement. No animation, no undo. |
| Search typing | List filters live as user types. Sidebar `All` count updates. Clear-`x` icon inside the input appears when there's text. |
| Filter chip click | Active chip gains `Surface3` + accent stripe. Main list filters client-side. Search input clears (filtering by both was confusing). |
| Profile switch (sidebar) | Clicked row gets active styling immediately; background save + reload + re-render. Window title updates to `HedgeBuddy — staging`. |
| Profile create/rename/duplicate | Modal `InlineStateButton` morphs busy → done, modal closes. Sidebar refreshes. New row gets flash highlight. |
| Profile delete | Modal confirm → modal closes → sidebar row collapses out. If it was active, focus shifts to `default`. |
| Import N selected | Drawer's button cycles busy → done. Drawer closes. The N just-imported rows in the list flash highlight simultaneously. |
| Export as JSON / .env | Native Zenity save dialog opens. After write, button morphs done → idle. Drawer stays open. |
| Reveal in Explorer (Settings) | Native explorer opens. Settings modal stays open. |
| Install update | Button morphs busy → "Launching updater…" → app quits ~600 ms later. |
| Install Python library | Existing progress dialog with live console; bottom button morphs `Installing…` → `✓ Installed — Close`. |
| Validation error in form | Inline `Danger` caption under the failing field. `Save` button disabled while any field is invalid. No modal popup. |
| Save failure (disk error) | `InlineStateButton` `error` state. Caption appears below the button with the error message. Clicking the button again retries. |
| fsnotify auto-reload (Phase 2) | List refreshes silently. Sidebar counts update. If `vars.json` becomes corrupted, a persistent inline strip appears at the top of the list with the file path and a `Reload` button — strip is dismissible but reappears if the file is still corrupted on next change. |
| Network failure on update check | Silent. No notification — update dialog simply doesn't appear. |

### Underlying principles

1. **Surface = signal.** The thing the user touched is what tells them the result.
2. **State persistence over event flashes.** Where current state matters (validation errors, save failures, corrupted-file warnings), it persists inline. Where it doesn't (successful copy/save), the confirmation is brief and self-extinguishes on the same surface.

---

## 9. Phase split

### 9.1 Phase 1 — Visual & chrome

**Foundation**
- Implement OS-native font loader in [theme.go](../../../app/internal/ui/theme.go); Fyne default as fallback.
- Build `tools/icons/main.go` + Lucide SVG download script; bundle to `app/internal/ui/icons/bundled.go`.
- Rewrite [theme.go](../../../app/internal/ui/theme.go) with semantic tokens from §4.
- Create `app/internal/ui/tokens/` (colors.go, spacing.go, radii.go) — semantic constants.
- Replace deprecated `container.NewMax` with `container.NewStack` (audit A8).
- Replace manual string truncation with `widget.Label.Truncation = TextTruncateEllipsis` for descriptions; middle-ellipsis helper for paths (audit A12).

**App shell**
- Build the new shell: left sidebar + main pane + drawer overlay.
- `AppController` gains `OpenDrawer(title, body, onClose)` / `CloseDrawer()`; most `setMainContent` calls retired.
- Esc closes drawer; clicking dim overlay closes drawer.

**Sidebar**
- Profiles section: list of profile rows, hover reveals `more-horizontal` → `widget.PopUpMenu` with Rename/Duplicate/Delete.
- Filters section: All / String / Path / URL / Secret with live counts.
- Footer: Settings, About (both open as centered modals).

**Components built in Phase 1**
- `Sidebar`, `SidebarItem`
- `CardRow`
- `Drawer`
- `IconButton`
- `InlineStateButton`
- `Modal` wrapper (used by `DeleteConfirm` + `ProfileFormModal`)

**Views rebuilt in Phase 1**
- List view (new shell + cards).
- Edit/New variable drawer (uses `FieldRow` lite — Phase 2 plugs in `widget.Form` validation).
- Import drawer.
- Export drawer.
- Profile management (sidebar + `ProfileFormModal`).
- Settings modal.
- About modal.

**Cleanups landing with Phase 1**
- Remove dead `_ = card` in [importview.go](../../../app/internal/ui/importview.go).
- Fix `SetOnDropped` lifecycle: wired on drawer open, cleared on drawer close (audit A2).
- Confirm-delete modal text wraps via `widget.Label` (audit A9).
- Update-check "Install Update" → 600 ms inline state before quit (audit B14).
- Disclaimer copy softened, microcopy pass on Python prompts, validation error messages, button labels (audit C-series).
- About modal: drop LowImportance trio in favor of plain dashes.

**Out of Phase 1 (kept working but unchanged behavior)**
- fsnotify auto-reload.
- File-vs-folder Browse split.
- `widget.Form`-based inline validation.
- Secret-warning fix for JSON export.
- Case mismatch fix between Go `HedgeBuddy` and Python `hedgebuddy`.
- Python check / update check ordering.
- Drawer slide animation (separately scoped future task).

### 9.2 Phase 2 — Behaviors & correctness

**Behavioral upgrades**
- Add `fsnotify` watcher on the active `vars.json`; auto-refresh the list on external change. Remove the now-redundant manual reload code paths.
- File-or-folder `Browse…` in the path-type `FieldRow` (audit A5).
- Single-backing-value cleanup for secret↔string swap (audit A6).
- Inline validation via `widget.Form` + `Entry.Validator` everywhere validation runs (replaces `dialog.ShowError` for validation failures; storage/disk errors still surface via `InlineStateButton.error`).
- `InlineStateButton.error` state surfaces non-validation save failures inline (replaces the rest of the `dialog.ShowError` calls on the save path).

**Correctness / bugs**
- Secret-warning fired identically for JSON and .env export (audit A1).
- Python check + update check sequenced — update only fires after Python check completes/dismisses (audit A7).
- Case-normalize storage dir to `hedgebuddy` (lowercase) on both Go and Python sides with one-shot migration (audit A10).
- **Drop Linux branch from Python lib's `_get_base_dir()`** — confirmed during brainstorm; matches README's Windows + macOS scope (audit A11).
- Tooltip-set-before-mount on disabled profile buttons (audit A3).

**Microcopy + small polish leftover from Phase 1**
- Anything still flagged in the audit's C-series that didn't make Phase 1.

---

## 10. Risks & open questions

### 10.1 Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Fyne `widget.Button` with custom-painted background via `canvas.Rectangle` doesn't render hover states the way the theme expects, requiring fully custom button widget. | Medium | Prototype `InlineStateButton` first; fall back to extending `widget.Button` and overriding `CreateRenderer()` if simpler composition doesn't carry hover styling. |
| `widget.List` virtualization conflicts with per-row hover state for action icons (rows are recycled). | Medium | Move hover/reveal state onto the `CardRow` widget itself, driven by `MouseIn`/`MouseOut`. The current external `revealed` map (in `listview.go`) goes away. |
| Lucide SVGs render with stroke caps slightly off at small sizes in Fyne's renderer. | Low | Pre-test at 18 × 18; fall back to a flat-color icon variant per-glyph if necessary. |
| Drawer overlay can grab keyboard focus from underlying list widgets in subtle ways. | Low | Explicit `canvas.Focus(drawerContent)` on open; save and restore previous focus on close. |
| OS-native font load fails on an OS version that moved the file path. | Low | Fallback to `theme.DefaultTheme().Font(style)` — app still renders, just with Fyne's default. Logged to stderr for diagnosis. |
| Inter / SF Pro / Segoe metric differences cause subtle layout shifts between platforms. | Low (cosmetic) | Accepted. Documented here. |
| `canvas.Rectangle.CornerRadius` interacts poorly with `container.NewStack` if the background rect isn't the bottom layer. | Low | Convention enforced in `CardRow`, `Drawer`, `Modal`: every composed surface stacks as `Stack(bgRect, content, hoverRect)` — bg always at index 0. |

### 10.2 Open questions remaining for the writer-of-plans

None. All open questions from the brainstorm have been resolved:

- **Linux Python branch**: drop in Phase 2 (decision logged in §9.2).
- **Inter font bundling**: replaced with OS-native font loader (§4.2).
- **Profile row popup**: `widget.PopUpMenu` from Fyne core, since 2.0 (§7.5).
- **Drawer animation**: dropped from Phase 1, separately scoped (§2 non-goals).

---

## 11. Verification

Visual + manual, with thin Go tests where they add real value.

- **Go unit tests** focus on what they're already good for: storage, validator, profile (currently on the [TODO.md](../../../TODO.md) backlog). Phase 2 adds tests for fsnotify reload (with a temp-dir harness) and the case-normalization migration.
- **Component smoke tests** — for each new component, a `_test.go` builds the widget, exercises state transitions, and asserts `test.WidgetRenderer(w).Objects()` doesn't panic.
- **Manual visual QA checklist** — committed at `docs/superpowers/specs/2026-05-24-hedgebuddy-ui-modernization-qa.md` after the design doc lands. Walks the redesigned list, drawer flows, modals, settings, about, python check, update check. Per-action visual checks against the §8 feedback table.
- **Smoke binary** (`hedgebuddy-smoke.exe`) rebuilt and exercised on Windows per phase. macOS verification on the user's end — `make smoke-macos` target committed.
- **No automated UI/screenshot diffing.** Surface is small enough that manual QA against the checklist is faster than maintaining baselines.

### Phase 1 success criteria

1. List view, all drawers, both modals, sidebar, Settings modal, About modal are all using the new tokens, components, and icons.
2. Every action in §8 behaves as described (manual checklist).
3. No remaining `container.NewMax` or manual string truncation in `app/internal/ui/`.
4. `hedgebuddy-smoke.exe` builds clean; sidebar, drawer, and modals don't panic across the manual QA checklist.
5. README screenshot updated to reflect new design.
6. No third-party dependency additions (Lucide is bundled-on-disk, no Go module added; `fyne-x` not pulled in).

### Phase 2 success criteria

1. fsnotify auto-refresh works end-to-end on Windows + macOS.
2. JSON export warns about secrets identically to .env export.
3. Python lib's case-mismatch story resolved (case-normalize + migrate, Linux branch removed).
4. Inline validation replaces modal validation in the form drawer.
5. Python check sequenced before update check on startup.

---

## 12. References

- Brainstorm conversation, 2026-05-24.
- Audit findings, 2026-05-24 (in conversation log).
- Fyne v2 documentation (via context7) — confirmed APIs: `widget.Label.Truncation`/`TextTruncateEllipsis` (since 2.4), `widget.Entry.Validator` + `Validatable` interface, `widget.Form` validation, `desktop.CustomShortcut` + `Canvas().AddShortcut(...)`, `widget.Card` (since 1.4), `container.NewStack` (replaces deprecated `NewMax`), `widget.PopUpMenu`/`ShowAtRelativePosition` (since 2.4), `canvas.Rectangle.CornerRadius` (since 2.4), `widget.Label.Selectable` and `SizeName` (since 2.6), `widget.Entry.SetIcon`.
- [Lucide icon library](https://lucide.dev/) — MIT, ~1,500 outlined SVGs.
- `dweymouth/fyne-tooltip` — kept as the sole third-party UI dep.
