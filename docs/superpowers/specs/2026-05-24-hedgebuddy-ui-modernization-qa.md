# Phase 1 Manual QA Checklist

Run through this list on Windows (Segoe UI) and macOS (SF Pro) before tagging Phase 1.

## Visual

- [ ] Sidebar renders with PROFILES + FILTERS sections and Settings/About footer.
- [ ] Active profile/filter row has Accent left stripe and Surface3 background.
- [ ] Variable cards have 8 px rounded corners, 1 px BorderSubtle, hover lifts to Surface3.
- [ ] Action icons appear ONLY on row hover. Delete icon is muted at rest, danger on hover.
- [ ] Type stripe is visible only for path/url/secret (string gets none).
- [ ] Search input shows a leading icon inside (if the Fyne version supports `Entry.SetIcon`; falls back to no leading icon otherwise).
- [ ] All buttons use 6 px corner radius (visible on Save / New / Import / Export).
- [ ] App-icon mascot appears in empty-state, not Lucide icons.
- [ ] Drawer covers the right ~480 px with a dim scrim over the list.
- [ ] Modal dialogs (Delete, Profile, Settings, About) are centered.

## List view

- [ ] Cards render every variable in current profile.
- [ ] Search filters live as the user types.
- [ ] Filter chips in sidebar update list and counts (`All`, `String`, `Path`, `URL`, `Secret`).
- [ ] Empty state shows "No variables yet. Click '+ New'..." when profile is empty.
- [ ] Empty state shows context-appropriate text for active filter / search.

## Edit drawer

- [ ] `+ New` opens drawer with "New variable" title and empty fields.
- [ ] Click pencil icon on a row opens drawer with prefilled fields.
- [ ] Save button cycles through "Save" → "Save…" → "✓ Saved" → "Save" then closes the drawer.
- [ ] Save failure (e.g., empty name) shows error dialog and button morphs to "✕ Save failed".
- [ ] Cancel closes drawer without saving.
- [ ] Esc closes drawer without saving.
- [ ] Type switch shows Path / Folder browse button.
- [ ] Type switch to Secret swaps to password entry.

## Import drawer

- [ ] Choose file → Zenity dialog → cards render with checkboxes.
- [ ] Toggling checkboxes updates "Import N selected" button label.
- [ ] Drop a .json file onto the window with drawer open → loads.
- [ ] Drop a .json file with drawer closed → nothing happens.
- [ ] Drop a non-.json file → "Invalid file" info dialog.
- [ ] Import button cycles busy → done; list reflects imports; drawer closes.

## Export drawer

- [ ] Lists every variable with a default-checked checkbox.
- [ ] If any variable is a secret, yellow warning strip shows above the buttons.
- [ ] Export as JSON → Zenity save → button cycles done.
- [ ] Export as .env → same.
- [ ] Drawer stays open after each export so the other format can be exported.

## Profile management

- [ ] `+` in PROFILES header → New profile modal → creates.
- [ ] `⋯` (ellipsis icon) on a profile row → popup menu Rename / Duplicate / Delete.
- [ ] Rename a profile → sidebar row updates, window title updates if active.
- [ ] Duplicate a profile → new row appears with `-copy` suffix.
- [ ] Delete a non-active, non-default profile → redesigned confirm modal → confirms.
- [ ] Delete default → "Cannot delete" info dialog.
- [ ] Delete active → "Cannot delete" info dialog.

## Settings + About

- [ ] Settings modal shows the storage path, Reveal-in-Finder button, and Reset Python prompt button.
- [ ] Reveal-in-Finder opens the system explorer.
- [ ] Reset Python prompt + restart → Python dialog reappears.
- [ ] About modal shows the mascot, version, author, two link buttons, and softened disclaimer ("Independent project. Not affiliated...").

## Python check + update dialogs

- [ ] Python-not-found dialog has exactly two buttons (Not now + Download Python) and an inline "Don't remind me again" checkbox.
- [ ] Library-not-installed dialog has Not now + Install now + checkbox.
- [ ] Library-update dialog has Not now + Update now.
- [ ] App-update dialog has Not now + Install Update. Clicking Install Update shows "Launching updater…" inline for ~600 ms before quit.

## Feedback principles

- [ ] No transient toast/banner appears anywhere.
- [ ] Save / Import / Export feedback lives on the button itself.
- [ ] Copy icon glyph swaps to a check briefly when clicked.
- [ ] Reveal-secret icon toggles eye / eye-off.

## Theme

- [ ] On Windows: text renders in Segoe UI.
- [ ] On macOS: text renders in SF Pro.
- [ ] Falling back: if both system fonts are unreadable, the app still renders with Fyne's default.
- [ ] All cards/buttons/inputs use the Surface palette (no stray white/light backgrounds).

## Stability

- [ ] App launches, sidebar populates, drawer never panics on open/close cycles.
- [ ] Switching profile re-renders the list and decrements counts.
- [ ] Quitting the app preserves storage (vars.json updated on disk).

---

## Plan-vs-implementation deltas

For the record (captured during execution, harmless):

1. **Lucide tag**: plan said `v0.453.0`; actual is `0.453.0` (Lucide uses unprefixed semver tags).
2. **Three icon renames** in the bundled.go exports — Lucide 0.453.0 had renamed them:
   - `MoreHorizontal` → `Ellipsis`
   - `AlertTriangle` → `TriangleAlert`
   - `DownloadCloud` → `CloudDownload`
3. **Drawer slide animation**: explicitly out-of-scope (Phase 1 ships instant in/out). Future task.
4. **macOS bold font**: plan declared the same SFNS.ttf path for both regular and bold weights. The font loader falls back to Fyne's default for bold rendering on macOS; cosmetic and acceptable. Future task can refine the bold-weight path.
5. **JSON-export secret warning**: Phase 1 ships the `.env` warning only. Phase 2 covers JSON export.
6. **Inline validation**: Phase 1 still uses modal `dialog.ShowError` for save failures; Phase 2 wires up `widget.Form` + `Entry.Validator`.
