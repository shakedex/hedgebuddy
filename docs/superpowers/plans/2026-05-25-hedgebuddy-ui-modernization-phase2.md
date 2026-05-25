# HedgeBuddy UI Modernization — Phase 2 Implementation Plan

> Continues `feature/ui-modernization-phase1` (we are NOT branching). Plan executes via `superpowers:subagent-driven-development`. Patterns from Phase 1 carry over.

**Goal:** Land the spec's §9.2 behaviors-and-correctness milestone, plus two carry-over UX items the user flagged during Phase 1 QA.

**Architecture:** Each task is a focused fix or feature touching 1-3 files. No new components needed — Phase 1's primitives (CardRow, Drawer, IconButton, InlineStateButton, FieldRow, etc.) get reused.

**Tech stack:** Same as Phase 1. Plus `fsnotify` (already a transitive Fyne dep — confirm it's available without a new `require` line).

---

## Scope (10 tasks)

### From spec §9.2

1. Browse file-or-folder split in path-type FieldRow (audit A5)
2. JSON export secret warning (audit A1)
3. Python + Update check sequenced on startup (audit A7)
4. Inline validation via `widget.Form` + `Entry.Validator` (replaces modal `dialog.ShowError` for name/value validation)
5. fsnotify auto-reload of active `vars.json`
6. Case-normalize storage dir to `hedgebuddy` lowercase, with one-shot migration on both Go and Python sides (audit A10)
7. Drop Linux branch from Python lib's `_get_base_dir()` (audit A11)

### Carry-overs from Phase 1 QA

8. Copy icon glyph swap: copy → check for ~1 s on click, then back
9. Auto-scroll to flashed row on duplicate (and on save, when the saved row is offscreen)

### Wrap

10. Final verification: build/vet/test/QA-checklist update, full-branch code review

---

## Phase 1 → Phase 2 starting point

- Branch: `feature/ui-modernization-phase1`
- Tip: `50d479d`
- Working dir: `E:/Coding/hedgebuddy/.worktrees/ui-modernization-phase1/`
- Build env: PowerShell with `$env:PATH = 'C:\msys64\ucrt64\bin;' + $env:PATH; $env:CGO_ENABLED = '1'; cd <worktree>/app`
- Existing tests pass; existing build clean.

## Task 1 — Browse file-or-folder split

**Files:** `app/internal/ui/editdrawer.go`

The current Path-type field shows one "Folder…" button that opens `zenity.SelectFile(zenity.Directory())`. Per audit A5, users want both a file picker and a folder picker.

Replace `browseBtn` (one button) with two:

```go
browseFileBtn := widget.NewButtonWithIcon("File…", icons.File, func() {
    path, err := zenity.SelectFile(zenity.Title("Select file"))
    if err == nil {
        valueEntry.SetText(path)
    }
})
browseFolderBtn := widget.NewButtonWithIcon("Folder…", icons.FolderOpen, func() {
    path, err := zenity.SelectFile(zenity.Title("Select folder"), zenity.Directory())
    if err == nil {
        valueEntry.SetText(path)
    }
})
```

`browseContainer` becomes `container.NewHBox(browseFileBtn, browseFolderBtn)`. Logic that toggles its visibility (path → Show, others → Hide) stays unchanged.

Commit: `feat(ui): split path browse into File / Folder buttons`

## Task 2 — JSON export secret warning

**Files:** `app/internal/ui/exportdrawer.go`

Today the secret warning strip (`"⚠ Some variables are secrets — .env export will include their plain text values."`) is shown unconditionally when any secret is selected, but the wording specifies only `.env`. Per audit A1, JSON export ALSO writes secrets in plain text. Update the warning copy to cover both:

```go
w := canvas.NewText("⚠ Some variables are secrets — both .env and JSON exports include their plain text values.", tokens.Warning)
```

That's the only code change. The warning was always visible when secrets exist; we just clarify it now covers both export targets.

Commit: `fix(ui): export warning covers JSON as well as .env`

## Task 3 — Python + Update check sequencing

**Files:** `app/main.go`

Currently:
```go
go ctrl.RunPythonCheck()
go ctrl.RunUpdateCheck()
```

Two independent goroutines. Modal dialogs from each can stack visually. Per audit A7, sequence them: only kick off the update check after Python check finishes (whether it dismissed or completed).

Change to:
```go
go func() {
    ctrl.RunPythonCheck()
    ctrl.RunUpdateCheck()
}()
```

But `RunPythonCheck` returns immediately even when it has dialogs open (dialogs are shown via `dialog.NewCustomWithoutButtons` which doesn't block). So sequencing the function calls doesn't sequence the dialogs.

Better fix: introduce a `chan struct{}` that the Python check closes when its dialog is dismissed or no dialog was needed. Update check waits on it.

In `pythoncheckdialog.go`, refactor `RunPythonCheck` to:

```go
func (c *AppController) RunPythonCheck(done func()) {
    p, _ := prefs.Load()
    if p.PythonCheckDismissed {
        if done != nil { done() }
        return
    }

    status := pythoncheck.Detect()
    if status.PythonFound && status.LibraryInstalled {
        if done != nil { done() }
        return
    }

    // Each dialog calls `done` from its dismiss/install handlers.
    if !status.PythonFound {
        showPythonNotFoundDialog(c.Window, done)
    } else {
        showLibraryMissingDialog(c.Window, status.Executable, done)
    }
}
```

Add a `done func()` parameter to `showPythonNotFoundDialog` / `showLibraryMissingDialog`; they invoke it once when the dialog is dismissed (either through the "Not now" button OR after the install completes). Wire it from the close paths.

In `main.go`:
```go
go func() {
    ctrl.RunPythonCheck(func() {
        ctrl.RunUpdateCheck()
    })
}()
```

If Python check has no UI to show, the callback fires immediately and update check runs without delay. If it does show a dialog, update check waits.

Commit: `fix(ui): sequence Python check before update check`

## Task 4 — Inline validation

**Files:** `app/internal/ui/components/fieldrow.go`, `app/internal/ui/editdrawer.go`

Phase 1 added `FieldRow.SetError(msg)` but it's never called — save failures go to `dialog.ShowError`. Phase 2 wires Entry.Validator so errors appear inline as the user types.

In `editdrawer.go`:

1. Define validators for each field:
   ```go
   nameEntry.Validator = func(s string) error {
       return validator.ValidateVariableName(s)
   }
   valueEntry.Validator = func(s string) error {
       if typeRadio.Selected == "" {
           return nil
       }
       return validator.ValidateByType(labelToType(typeRadio.Selected), s)
   }
   secretEntry.Validator = func(s string) error {
       return validator.ValidateByType("secret", s)
   }
   ```

2. Hook into validation changes via `entry.SetOnValidationChanged(func(err error))`. On change, call `nameField.SetError(msgFromErr(err))` / `valueField.SetError(...)`. Helper:
   ```go
   func msgFromErr(err error) string {
       if err == nil { return "" }
       return err.Error()
   }
   ```

3. The Save button stays enabled (since the InlineStateButton manages its own state via SetState). On save, if any validator returns non-nil, set the button to StateError and DON'T call `c.SaveVariable`. Otherwise proceed as today.

   In the Save handler, before `c.SaveVariable`:
   ```go
   if err := nameEntry.Validate(); err != nil {
       saveBtn.SetState(components.StateError)
       return
   }
   activeValueEntry := valueEntry
   if labelToType(typeRadio.Selected) == "secret" {
       activeValueEntry = secretEntry
   }
   if err := activeValueEntry.Validate(); err != nil {
       saveBtn.SetState(components.StateError)
       return
   }
   ```

4. Remove the `dialog.ShowError(err, c.Window)` line in the Save handler's error path — the inline caption now carries the error message. Keep `saveBtn.SetState(components.StateError)`.

5. In `fieldrow.go`, ensure `SetError` is wired to refresh the visible error text correctly (it should already work since the canvas.Text Show/Hide pattern is fine — but verify by trying it).

The same treatment applies to the inline profile name composer / editor in `app.go` (`buildProfileComposer`, `buildProfileEditor`). They currently rely on the `profile.CreateProfile` / `RenameProfile` errors surfacing through `dialog.ShowError`. For Phase 2, attach a `Validator` to the entry and surface the error inline below it. Keep this scope-managed: if the profile case is too invasive, do edit drawer first and defer profile-composer inline validation to a follow-up.

Commit: `feat(ui): inline validation on the edit drawer; remove modal error popups`

## Task 5 — fsnotify auto-reload

**Files:** `app/main.go`, `app/internal/ui/app.go` (likely new method), `app/go.mod` (add `github.com/fsnotify/fsnotify` if not present as a direct require)

Verify fsnotify is already available:

```powershell
cd <worktree>/app
go list -m github.com/fsnotify/fsnotify
```

If it's in `go.sum` (transitively from Fyne) but not in `go.mod` as a direct require, add:
```powershell
go get github.com/fsnotify/fsnotify
```

Implementation in `app/internal/ui/app.go`:

```go
import "github.com/fsnotify/fsnotify"

// StartFileWatch begins watching the active profile's vars.json for external changes.
// When a change is detected, the storage is reloaded and the list re-rendered.
// The watcher is replaced when the active profile changes.
func (c *AppController) StartFileWatch() {
    if c.watcher != nil {
        c.watcher.Close()
    }
    w, err := fsnotify.NewWatcher()
    if err != nil {
        return
    }
    c.watcher = w
    path, err := storage.GetStoragePath()
    if err != nil {
        return
    }
    if err := w.Add(filepath.Dir(path)); err != nil {
        return
    }
    go func() {
        for {
            select {
            case event, ok := <-w.Events:
                if !ok { return }
                if event.Name == path && (event.Op&fsnotify.Write != 0 || event.Op&fsnotify.Create != 0) {
                    fyne.Do(func() {
                        if err := c.Reload(); err == nil {
                            c.rebuildSidebar()
                            c.renderList()
                        }
                    })
                }
            case _, ok := <-w.Errors:
                if !ok { return }
            }
        }
    }()
}
```

Add `watcher *fsnotify.Watcher` field to AppController. Call `StartFileWatch()` after the initial load in `NewAppController`. Re-call after `SwitchProfile` (since the active profile changed, the watched path changed).

Edge: when the app itself saves (Save / Delete / Duplicate / Import), the watcher will fire too. That's fine — it just triggers a redundant reload of data we just wrote. If we want to suppress it: introduce a `c.suppressNextReload` flag, set it before save, clear it in the watcher loop. Skip this optimization unless it causes visible flicker.

Commit: `feat(ui): fsnotify auto-reload of active vars.json`

## Task 6 — Case-normalize storage dir

**Files:** `app/internal/profile/profile.go`, `python-lib/hedgebuddy/core.py`

Today Go uses `HedgeBuddy/` (capital H) and Python uses `hedgebuddy/` (lowercase). On case-insensitive filesystems (Windows NTFS, macOS HFS+) this works coincidentally. On case-sensitive volumes (macOS APFS-CS, Linux) it breaks.

Standardize on **lowercase** `hedgebuddy/` everywhere.

### Go side migration

In `app/internal/profile/profile.go`, `GetBaseDir()`:

```go
case "windows":
    appData := os.Getenv("APPDATA")
    if appData == "" {
        return "", fmt.Errorf("APPDATA environment variable not found")
    }
    return filepath.Join(appData, "hedgebuddy"), nil  // was "HedgeBuddy"
case "darwin":
    homeDir, err := os.UserHomeDir()
    if err != nil {
        return "", err
    }
    return filepath.Join(homeDir, "Library", "Application Support", "hedgebuddy"), nil  // was "HedgeBuddy"
```

Add a migration step. In `Migrate()`, before the existing migration logic:

```go
// One-shot rename from old capitalized dir to new lowercase one, if present.
if err := migrateCapitalizedDir(); err != nil {
    fmt.Println("Warning: migrating HedgeBuddy → hedgebuddy:", err.Error())
}
```

And the helper:

```go
func migrateCapitalizedDir() error {
    var oldDir string
    switch runtime.GOOS {
    case "windows":
        oldDir = filepath.Join(os.Getenv("APPDATA"), "HedgeBuddy")
    case "darwin":
        homeDir, _ := os.UserHomeDir()
        oldDir = filepath.Join(homeDir, "Library", "Application Support", "HedgeBuddy")
    default:
        return nil
    }

    newDir, err := GetBaseDir()
    if err != nil {
        return err
    }

    // No-op if old doesn't exist OR new already exists OR they resolve to the same path (case-insensitive fs).
    oldInfo, err := os.Stat(oldDir)
    if os.IsNotExist(err) || err != nil {
        return nil
    }
    if !oldInfo.IsDir() {
        return nil
    }
    if oldDir == newDir {
        return nil
    }
    if _, err := os.Stat(newDir); err == nil {
        return nil // newDir already exists, leave old alone
    }
    return os.Rename(oldDir, newDir)
}
```

### Python side

In `python-lib/hedgebuddy/core.py`, `_get_base_dir()`:

```python
def _get_base_dir() -> Path:
    if sys.platform == "win32":
        app_data = os.environ.get("APPDATA")
        if not app_data:
            raise StorageNotFoundError("APPDATA environment variable not found")
        return Path(app_data) / "hedgebuddy"
    elif sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "hedgebuddy"
    else:
        raise StorageNotFoundError(f"Unsupported platform: {sys.platform}")
```

(Both Windows and macOS were lowercase already on the Python side — no rename needed. But see Task 7 for the Linux drop.)

### Verify

Run the test suite. Manually verify that an existing installation (e.g., user's machine) still finds vars.json after the migration runs once. The user's data is at `%APPDATA%/HedgeBuddy/` (capital H). After running Phase 2, on first launch the migration should rename it to `%APPDATA%/hedgebuddy/`.

Commit: `fix: case-normalize storage dir to hedgebuddy lowercase with migration`

## Task 7 — Drop Linux branch from Python lib

**Files:** `python-lib/hedgebuddy/core.py`

Combined with Task 6 above — the Linux branch (`~/.local/share/hedgebuddy`) is removed. Python lib now matches the README's "Windows + macOS only" scope.

If you split this into a separate commit (cleaner history): the Task 6 commit just touches Go + the dict in `_get_base_dir()`; the Task 7 commit ONLY drops the `else: return Path.home() / ".local" / "share" / "hedgebuddy"` branch and replaces it with the `StorageNotFoundError` raise.

Commit: `chore(python): drop Linux branch; matches README scope`

## Task 8 — Copy icon glyph swap

**Files:** `app/internal/ui/components/cardrow.go`, `app/internal/ui/listview.go`

User feedback: copying a value provides no visual feedback. Phase 1's QA checklist already documented "no glyph swap; Phase 2 polish."

Approach: add a `copied bool` field to CardRow, set true on copy, swap the copy icon to `icons.Check` for 1 s.

1. Add field to `CardRow`:
   ```go
   copied bool
   ```

2. Add method:
   ```go
   // ConfirmCopy briefly swaps the copy icon to a check to confirm a copy action.
   func (c *CardRow) ConfirmCopy() {
       c.copied = true
       c.Refresh()
       go func() {
           time.Sleep(1000 * time.Millisecond)
           fyne.Do(func() {
               c.copied = false
               c.Refresh()
           })
       }()
   }
   ```

3. In the renderer, hold a reference to the `copyBtn` (already does as part of the actionRow construction). Update `Refresh()` to swap its icon:
   ```go
   if r.card.copied {
       r.copyBtn.SetIcon(icons.Check)
       r.copyBtn.SetToolTip("Copied!")
   } else {
       r.copyBtn.SetIcon(icons.Copy)
       r.copyBtn.SetToolTip("Copy value")
   }
   ```
   
   (`copyBtn` is currently a local variable in CreateRenderer — promote it to a renderer field like the existing `revealBtn`.)

4. In `listview.go`, the `OnCopy` callback already exists. Wire it to also call `card.ConfirmCopy()`:
   ```go
   OnCopy: func() {
       c.Window.Clipboard().SetContent(v.Value)
       card.ConfirmCopy()
   },
   ```

   (Note: the `card` variable is in scope because `card := components.NewCardRow(...)` is built before actions are wired. If Go's variable-declaration order doesn't allow this, use a closure-captured pointer.)

Commit: `feat(ui): copy icon swaps to check briefly when clicked`

## Task 9 — Auto-scroll to flashed row

**Files:** `app/internal/ui/listview.go`

After save/import/duplicate, the flashed row may be offscreen (especially for duplicate, which appends to the end). Auto-scroll the list to bring it into view.

The list view's scroll container is built as:
```go
scroll := container.NewVScroll(container.NewPadded(listContainer))
```

`*container.Scroll` exposes `ScrollToBottom()`, `ScrollToTop()`, and `ScrollToOffset()`. To scroll to a specific child, we'd need its position.

Practical approach: track the index of each card by name during render. After render, if any flashed names were processed, find the highest index and scroll there:

```go
render := func() {
    // ... existing code ...
    
    matched := c.filteredKeys(query)
    flashSet := c.consumeFlash()
    
    // ... build cards ...
    
    // Auto-scroll to the first flashed row, if any.
    if len(flashSet) > 0 {
        for i, name := range matched {
            if _, ok := flashSet[name]; ok {
                // Scroll roughly to its position. CardMinHeight + padding ≈ 80 px.
                offset := float32(i) * (tokens.CardMinHeight + tokens.SpaceSM)
                scroll.Offset = fyne.NewPos(0, offset)
                scroll.Refresh()
                break
            }
        }
    }
    listContainer.Refresh()
}
```

The `scroll` variable lives outside the `render` closure currently. Restructure if needed — move `scroll` declaration before `render`.

Commit: `feat(ui): auto-scroll list to first flashed row after save/import/duplicate`

## Task 10 — Final verification + QA pass

**Files:** none (verification only); update `docs/superpowers/specs/2026-05-24-hedgebuddy-ui-modernization-qa.md` with Phase 2 additions.

### Verify

```powershell
$env:PATH = 'C:\msys64\ucrt64\bin;' + $env:PATH
$env:CGO_ENABLED = '1'
cd <worktree>/app
go build ./...
go vet ./...
go test ./...
```

All three must exit 0.

### Update QA doc

Add a "Phase 2 additions" section to the QA doc listing the new behaviors to manually verify:

- Edit drawer: invalid name triggers inline error caption under the Name field.
- Edit drawer: path type shows both File… and Folder… buttons.
- Export drawer: secret warning copy mentions both .env and JSON.
- Startup: if Python check needs to show a dialog, update check waits until it's dismissed.
- External edit to vars.json (e.g., from another tool) → list auto-refreshes within ~1 s.
- Storage dir on Windows: `%APPDATA%\hedgebuddy\` (lowercase). Existing `HedgeBuddy\` (capital) gets renamed on first launch.
- Python lib raises StorageNotFoundError on Linux instead of silently using `~/.local/share/...`.
- Copy icon: click → icon swaps to check for 1 s → swaps back. Tooltip says "Copied!" during that window.
- Auto-scroll: duplicate a variable far up the list → the list scrolls down to show the flashed copy.

### Final whole-branch code review

Dispatch a `superpowers:code-reviewer` agent across the whole branch (Phase 1 + 1.1 + 1.2 + 1.3 + Phase 2). Address any Critical / Important issues. Defer Minor items if time-boxed.

Commit: `docs: Phase 2 QA additions + tag-ready`

---

## Out-of-scope (deferred to Phase 3 or future)

- Settings as right-side drawer (consistency with edit/import/export). User chose to defer.
- Drawer slide animation (always Phase 3+ per spec).
- macOS bold font path refinement (Phase 3+).
- Window-size persistence across launches (audit B20, not in any current phase).
- Update dialog release notes (audit B13, not scoped).
- OS-keychain secret encryption (TODO.md).
