# HedgeBuddy UI Modernization — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Phase 1 of the UI modernization — the visual + chrome refresh defined in §9.1 of [2026-05-24-hedgebuddy-ui-modernization-design.md](../specs/2026-05-24-hedgebuddy-ui-modernization-design.md). At end of plan: sidebar-based shell, right-side drawers for edit/import/export, redesigned cards with Lucide icons, OS-native fonts, semantic theme tokens. Phase 2 (fsnotify, inline validation, secret-export-fix, case-normalization, drop Linux) gets its own plan.

**Architecture:** View-first build (Approach B). Foundation first (tokens, theme, fonts, icons), then build the app shell, then rebuild each view in turn — extracting shared components (`Sidebar`, `CardRow`, `Drawer`, `IconButton`, `InlineStateButton`, `Modal`) as they're needed.

**Tech Stack:** Go 1.25, Fyne v2.7.3, `dweymouth/fyne-tooltip` v0.4.0, `ncruces/zenity` v0.10.14, Lucide SVGs (vendored via `//go:embed`), OS-native fonts (Segoe UI on Windows, SF Pro on macOS) with Fyne default fallback.

**Phase 1 NOT in scope (deferred to Phase 2 plan):** fsnotify auto-reload, file-or-folder Browse split, secret-warning fix for JSON export, case-mismatch fix, Linux drop, `widget.Form`-based inline validation, drawer slide animation, row-collapse animation.

---

## File structure (target end-of-Phase-1)

```
app/
├── main.go                                  modified (no behavior change, just controller init)
└── internal/ui/
    ├── app.go                               rewritten (drawer API)
    ├── bundled.go                           unchanged (hedgehog mascot)
    ├── constants.go                         modified (window size constants unchanged; remove SecretMask if unused)
    ├── pythoncheckdialog.go                 modified (two-button + checkbox layout, microcopy)
    ├── updatecheckdialog.go                 modified (600ms inline state before quit)
    ├── theme.go                             rewritten (semantic tokens + OS-native font loader)
    ├── editdrawer.go                        renamed from formview.go, rewritten
    ├── importdrawer.go                      renamed from importview.go, rewritten
    ├── exportdrawer.go                      renamed from exportview.go, rewritten
    ├── aboutmodal.go                        renamed from aboutview.go, rewritten
    ├── settingsmodal.go                     NEW
    ├── profilemodal.go                      NEW (replaces profileview.go's 5 dialogs)
    ├── deleteconfirm.go                     NEW (used for variable + profile delete)
    ├── listview.go                          rewritten (uses sidebar+cards)
    ├── helpers.go                           trimmed (most helpers move to components)
    ├── tokens/
    │   ├── colors.go                        NEW
    │   ├── spacing.go                       NEW
    │   └── radii.go                         NEW
    ├── components/
    │   ├── sidebar.go                       NEW
    │   ├── cardrow.go                       NEW
    │   ├── drawer.go                        NEW
    │   ├── iconbutton.go                    NEW
    │   ├── inlinestate.go                   NEW
    │   ├── modal.go                         NEW
    │   ├── fieldrow.go                      NEW
    │   ├── sidebar_test.go                  NEW
    │   ├── cardrow_test.go                  NEW
    │   ├── drawer_test.go                   NEW
    │   ├── inlinestate_test.go              NEW
    │   └── modal_test.go                    NEW
    ├── icons/
    │   ├── bundled.go                       NEW (//go:embed of SVGs)
    │   └── svg/
    │       └── *.svg                        NEW (~25 Lucide files)
    └── resources/                           unchanged

tools/
└── icons/
    └── main.go                              NEW (one-shot SVG fetcher)

docs/superpowers/specs/
└── 2026-05-24-hedgebuddy-ui-modernization-qa.md   NEW (manual QA checklist)
```

The old `aboutview.go`, `formview.go`, `importview.go`, `exportview.go`, `profileview.go` are deleted at the end. They're kept on disk during the rebuild so the app keeps compiling between tasks.

---

## Task 0: Setup — feature branch and baseline build

**Files:**
- No code changes.

- [ ] **Step 1: Create a feature branch**

```bash
git checkout -b feature/ui-modernization-phase1
```

- [ ] **Step 2: Confirm the current app builds clean**

Run: `cd app && go build ./...`
Expected: exit 0, no output.

- [ ] **Step 3: Confirm `go vet` is clean**

Run: `cd app && go vet ./...`
Expected: exit 0, no output.

- [ ] **Step 4: Commit branch marker**

```bash
git commit --allow-empty -m "chore: start Phase 1 UI modernization branch"
```

---

## Task 1: Design tokens — colors

**Files:**
- Create: `app/internal/ui/tokens/colors.go`

- [ ] **Step 1: Create the tokens directory and colors file**

Create `app/internal/ui/tokens/colors.go`:

```go
// Package tokens holds the single source of truth for design-system values.
// Theme.go and components reference these tokens; no hex literals elsewhere.
package tokens

import "image/color"

// Surfaces — backgrounds with progressive elevation.
var (
	SurfaceBase = color.NRGBA{R: 0x0E, G: 0x0E, B: 0x11, A: 0xFF}
	Surface1    = color.NRGBA{R: 0x15, G: 0x15, B: 0x1A, A: 0xFF}
	Surface2    = color.NRGBA{R: 0x1D, G: 0x1D, B: 0x24, A: 0xFF}
	Surface3    = color.NRGBA{R: 0x25, G: 0x25, B: 0x2F, A: 0xFF}
	Surface4    = color.NRGBA{R: 0x1A, G: 0x1A, B: 0x20, A: 0xFF}
)

// Borders.
var (
	BorderSubtle = color.NRGBA{R: 0x2A, G: 0x2A, B: 0x33, A: 0xFF}
	BorderFocus  = color.NRGBA{R: 0x4F, G: 0x7F, B: 0xF8, A: 0x59} // Accent @ ~35% alpha
)

// Text.
var (
	TextPrimary   = color.NRGBA{R: 0xE8, G: 0xE8, B: 0xEE, A: 0xFF}
	TextSecondary = color.NRGBA{R: 0xA4, G: 0xA4, B: 0xB3, A: 0xFF}
	TextMuted     = color.NRGBA{R: 0x6E, G: 0x6E, B: 0x80, A: 0xFF}
)

// Brand / state.
var (
	Accent      = color.NRGBA{R: 0x4F, G: 0x7F, B: 0xF8, A: 0xFF}
	AccentHover = color.NRGBA{R: 0x6B, G: 0x95, B: 0xFA, A: 0xFF}
	Danger      = color.NRGBA{R: 0xEF, G: 0x44, B: 0x44, A: 0xFF}
	Warning     = color.NRGBA{R: 0xF5, G: 0x9E, B: 0x0B, A: 0xFF}
	Success     = color.NRGBA{R: 0x22, G: 0xC5, B: 0x5E, A: 0xFF}
)

// DimOverlay — black at 50% alpha for drawer/modal scrims.
var DimOverlay = color.NRGBA{R: 0x00, G: 0x00, B: 0x00, A: 0x80}

// TypeColor returns the accent stripe color for a given variable type.
// Strings get TextMuted so the stripe is barely visible (string is the default).
func TypeColor(varType string) color.NRGBA {
	switch varType {
	case "path":
		return Success
	case "url":
		return Accent
	case "secret":
		return Danger
	default:
		return TextMuted
	}
}
```

- [ ] **Step 2: Build to confirm it compiles**

Run: `cd app && go build ./...`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/internal/ui/tokens/colors.go
git commit -m "feat(ui): add semantic color tokens"
```

---

## Task 2: Design tokens — spacing & radii

**Files:**
- Create: `app/internal/ui/tokens/spacing.go`
- Create: `app/internal/ui/tokens/radii.go`

- [ ] **Step 1: Create the spacing tokens**

Create `app/internal/ui/tokens/spacing.go`:

```go
package tokens

// Spacing scale (8-pt grid).
const (
	SpaceXS  float32 = 4
	SpaceSM  float32 = 8
	SpaceMD  float32 = 12
	SpaceLG  float32 = 16
	SpaceXL  float32 = 24
	SpaceXXL float32 = 32
)

// SidebarWidth is the fixed width of the left sidebar in the main shell.
const SidebarWidth float32 = 200

// DrawerWidth is the fixed width of the right-side drawer panel.
const DrawerWidth float32 = 480

// CardMinHeight ensures the list grid feels rhythmic.
const CardMinHeight float32 = 64

// SearchInputHeight is the fixed height of the main search input.
const SearchInputHeight float32 = 36
```

- [ ] **Step 2: Create the radii tokens**

Create `app/internal/ui/tokens/radii.go`:

```go
package tokens

// Corner radii for canvas.Rectangle.CornerRadius (Fyne 2.4+).
const (
	RadiusCard         float32 = 8
	RadiusButton       float32 = 6
	RadiusInput        float32 = 6
	RadiusSidebarItem  float32 = 6
	RadiusAccentStripe float32 = 0 // square stripe on cards
)
```

- [ ] **Step 3: Build and commit**

```bash
cd app && go build ./...
```

Expected: exit 0.

```bash
git add app/internal/ui/tokens/spacing.go app/internal/ui/tokens/radii.go
git commit -m "feat(ui): add spacing and radii tokens"
```

---

## Task 3: Rewrite theme.go to consume tokens

**Files:**
- Modify: `app/internal/ui/theme.go` (full rewrite)

- [ ] **Step 1: Replace theme.go with the token-backed version**

Replace the contents of `app/internal/ui/theme.go` with:

```go
package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"

	"app/internal/ui/tokens"
)

// HedgeBuddyTheme implements a custom dark-only theme backed by tokens.
type HedgeBuddyTheme struct {
	font     fyne.Resource // optional OS-native regular font; nil falls back to default
	fontBold fyne.Resource // optional OS-native semibold; nil falls back to default
}

var _ fyne.Theme = (*HedgeBuddyTheme)(nil)

// NewHedgeBuddyTheme returns a theme with optional OS-native font resources.
// Pass nils to fall back to Fyne's default font.
func NewHedgeBuddyTheme(regular, bold fyne.Resource) *HedgeBuddyTheme {
	return &HedgeBuddyTheme{font: regular, fontBold: bold}
}

func (t *HedgeBuddyTheme) Color(name fyne.ThemeColorName, _ fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNameBackground:
		return tokens.SurfaceBase
	case theme.ColorNameButton:
		return tokens.Surface3
	case theme.ColorNameDisabledButton:
		return tokens.Surface2
	case theme.ColorNameDisabled:
		return tokens.TextMuted
	case theme.ColorNameError:
		return tokens.Danger
	case theme.ColorNameForeground:
		return tokens.TextPrimary
	case theme.ColorNameHover:
		return color.NRGBA{R: 0xFF, G: 0xFF, B: 0xFF, A: 0x14}
	case theme.ColorNameInputBackground:
		return tokens.Surface3
	case theme.ColorNameInputBorder:
		return tokens.BorderSubtle
	case theme.ColorNamePlaceHolder:
		return tokens.TextMuted
	case theme.ColorNamePrimary:
		return tokens.Accent
	case theme.ColorNameScrollBar:
		return tokens.TextMuted
	case theme.ColorNameSeparator:
		return tokens.BorderSubtle
	case theme.ColorNameShadow:
		return color.NRGBA{R: 0x00, G: 0x00, B: 0x00, A: 0x88}
	case theme.ColorNameHeaderBackground:
		return tokens.Surface1
	case theme.ColorNameMenuBackground:
		return tokens.Surface1
	case theme.ColorNameOverlayBackground:
		return tokens.Surface1
	case theme.ColorNameSelection:
		return color.NRGBA{R: 0x4F, G: 0x7F, B: 0xF8, A: 0x30}
	case theme.ColorNameFocus:
		return tokens.BorderFocus
	case theme.ColorNameSuccess:
		return tokens.Success
	case theme.ColorNameWarning:
		return tokens.Warning
	}
	return theme.DefaultTheme().Color(name, theme.VariantDark)
}

func (t *HedgeBuddyTheme) Font(style fyne.TextStyle) fyne.Resource {
	if style.Bold && t.fontBold != nil {
		return t.fontBold
	}
	if !style.Bold && t.font != nil {
		return t.font
	}
	return theme.DefaultTheme().Font(style)
}

func (t *HedgeBuddyTheme) Icon(name fyne.ThemeIconName) fyne.Resource {
	return theme.DefaultTheme().Icon(name)
}

func (t *HedgeBuddyTheme) Size(name fyne.ThemeSizeName) float32 {
	switch name {
	case theme.SizeNamePadding:
		return tokens.SpaceSM
	case theme.SizeNameInnerPadding:
		return tokens.SpaceSM
	case theme.SizeNameText:
		return 13
	case theme.SizeNameHeadingText:
		return 22
	case theme.SizeNameSubHeadingText:
		return 16
	case theme.SizeNameCaptionText:
		return 11
	case theme.SizeNameSeparatorThickness:
		return 1
	case theme.SizeNameScrollBarSmall:
		return 6
	case theme.SizeNameScrollBar:
		return 10
	case theme.SizeNameLineSpacing:
		return 4
	case theme.SizeNameInputBorder:
		return 1
	}
	return theme.DefaultTheme().Size(name)
}

// AppIcon returns the bundled app icon resource (mascot, defined in bundled.go).
func AppIcon() fyne.Resource {
	return resourceIconPng
}

// TypeColor proxies to tokens.TypeColor for callers in this package.
func TypeColor(varType string) color.NRGBA {
	return tokens.TypeColor(varType)
}
```

- [ ] **Step 2: Remove the legacy `Color*` exported vars from any other files that reference them**

Run: `cd app && go build ./...` — this will fail with references to `ColorBgPrimary`, `ColorTextMuted`, etc. from other files. **Stop here. Don't fix the references yet — Task 4 handles the next slice.**

To resume the build, temporarily restore the old palette as deprecated aliases at the bottom of `theme.go`:

```go
// --- DEPRECATED legacy color vars (referenced by views that haven't migrated yet) ---
// Remove after all views are rebuilt.
var (
	ColorBgPrimary   = tokens.SurfaceBase
	ColorBgSecondary = tokens.Surface1
	ColorBgCard      = tokens.Surface2
	ColorBgButton    = tokens.Surface3
	ColorBgInput     = tokens.Surface3
	ColorBorder      = tokens.BorderSubtle
	ColorHover       = color.NRGBA{R: 0xFF, G: 0xFF, B: 0xFF, A: 0x14}
	ColorSeparator   = tokens.BorderSubtle
	ColorTextPrimary = tokens.TextPrimary
	ColorTextSecond  = tokens.TextSecondary
	ColorTextMuted   = tokens.TextMuted
	ColorAccentBlue  = tokens.Accent
	ColorAccentRed   = tokens.Danger
	ColorSuccess     = tokens.Success
	ColorWarning     = tokens.Warning
)
```

Append those to the bottom of the new `theme.go`.

- [ ] **Step 3: Build clean**

Run: `cd app && go build ./...`
Expected: exit 0.

- [ ] **Step 4: Run the smoke binary briefly to make sure the app still launches**

Run on Windows: `cd app && go run .`
Expected: app window opens with the same look as before (because views still reference legacy aliases). Close it.

- [ ] **Step 5: Commit**

```bash
git add app/internal/ui/theme.go
git commit -m "refactor(ui): point theme.go at tokens, keep legacy aliases for views"
```

---

## Task 4: Update main.go to construct the theme via the new constructor

**Files:**
- Modify: `app/main.go`

- [ ] **Step 1: Replace `&ui.HedgeBuddyTheme{}` with the constructor**

Edit `app/main.go`. Find:

```go
	a.Settings().SetTheme(&ui.HedgeBuddyTheme{})
```

Replace with:

```go
	a.Settings().SetTheme(ui.NewHedgeBuddyTheme(nil, nil))
```

The OS-native font loader (Task 5) plugs into this call.

- [ ] **Step 2: Build and run**

```bash
cd app && go build ./... && go run .
```

Expected: window opens, looks identical to baseline. Close it.

- [ ] **Step 3: Commit**

```bash
git add app/main.go
git commit -m "refactor: use NewHedgeBuddyTheme constructor"
```

---

## Task 5: OS-native font loader

**Files:**
- Create: `app/internal/ui/fonts.go`
- Create: `app/internal/ui/fonts_test.go`
- Modify: `app/main.go`

- [ ] **Step 1: Write the failing test**

Create `app/internal/ui/fonts_test.go`:

```go
package ui

import (
	"testing"
)

// TestLoadOSFontsReturnsNilOnMissingFile verifies that a non-existent path
// produces a nil resource — the caller falls back to Fyne's default font.
func TestLoadOSFontsReturnsNilOnMissingFile(t *testing.T) {
	regular, bold := loadFontsFromPaths("/no/such/file.ttf", "/no/such/file-bold.ttf")
	if regular != nil {
		t.Errorf("regular: expected nil, got %v", regular)
	}
	if bold != nil {
		t.Errorf("bold: expected nil, got %v", bold)
	}
}

// TestLoadOSFontsLoadsExistingFile verifies a real file is wrapped in a StaticResource.
func TestLoadOSFontsLoadsExistingFile(t *testing.T) {
	// resources/icon.png exists in this package — we treat it as opaque bytes for the test.
	regular, _ := loadFontsFromPaths("resources/icon.png", "/no/such/bold.ttf")
	if regular == nil {
		t.Fatal("expected regular resource, got nil")
	}
	if len(regular.Content()) == 0 {
		t.Error("expected non-empty resource content")
	}
}
```

- [ ] **Step 2: Run test, confirm it fails to compile (function doesn't exist yet)**

Run: `cd app && go test ./internal/ui/ -run TestLoadOSFonts`
Expected: build error — `undefined: loadFontsFromPaths`.

- [ ] **Step 3: Implement fonts.go**

Create `app/internal/ui/fonts.go`:

```go
package ui

import (
	"fmt"
	"os"
	"runtime"

	"fyne.io/fyne/v2"
)

// LoadOSFonts attempts to load OS-native fonts.
// Returns (regular, bold). Either or both may be nil if loading fails.
// The HedgeBuddyTheme falls back to Fyne's default font for any nil result.
func LoadOSFonts() (fyne.Resource, fyne.Resource) {
	regularPath, boldPath := osFontPaths()
	return loadFontsFromPaths(regularPath, boldPath)
}

// osFontPaths returns the platform-specific font file paths.
func osFontPaths() (regular, bold string) {
	switch runtime.GOOS {
	case "windows":
		return `C:\Windows\Fonts\segoeui.ttf`, `C:\Windows\Fonts\segoeuisb.ttf`
	case "darwin":
		// macOS — SF NS Display is the system font on modern macOS.
		// The path has shifted over OS versions; we try the most-common one.
		return "/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/SFNS.ttf"
	default:
		return "", ""
	}
}

// loadFontsFromPaths reads each path and wraps it as a Fyne resource.
// Missing files return nil; the caller is expected to fall back.
func loadFontsFromPaths(regularPath, boldPath string) (fyne.Resource, fyne.Resource) {
	return readFontResource("system-regular", regularPath), readFontResource("system-bold", boldPath)
}

func readFontResource(name, path string) fyne.Resource {
	if path == "" {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "hedgebuddy: failed to load font %q: %v (falling back to Fyne default)\n", path, err)
		return nil
	}
	return fyne.NewStaticResource(name, data)
}
```

- [ ] **Step 4: Run tests**

Run: `cd app && go test ./internal/ui/ -run TestLoadOSFonts -v`
Expected: both tests PASS.

- [ ] **Step 5: Wire fonts into main.go**

Edit `app/main.go`. Find:

```go
	a.Settings().SetTheme(ui.NewHedgeBuddyTheme(nil, nil))
```

Replace with:

```go
	regular, bold := ui.LoadOSFonts()
	a.Settings().SetTheme(ui.NewHedgeBuddyTheme(regular, bold))
```

- [ ] **Step 6: Build and run; visually verify the font changed**

```bash
cd app && go build ./... && go run .
```

Expected on Windows: text in the app renders in Segoe UI. On macOS: SF Pro. If the OS font isn't found, no crash — Fyne's default font renders.

- [ ] **Step 7: Commit**

```bash
git add app/internal/ui/fonts.go app/internal/ui/fonts_test.go app/main.go
git commit -m "feat(ui): load OS-native fonts with Fyne default fallback"
```

---

## Task 6: Lucide icon fetcher tool

**Files:**
- Create: `tools/icons/main.go`
- Create: `tools/icons/sources.txt`

- [ ] **Step 1: Write the source list**

Create `tools/icons/sources.txt`:

```text
plus
download
upload
search
x
pencil
copy
copy-plus
trash-2
eye
eye-off
file
folder-open
more-horizontal
settings
info
check
arrow-left
database-zap
external-link
refresh-cw
chevron-right
chevron-down
alert-triangle
download-cloud
```

- [ ] **Step 2: Write the fetcher**

Create `tools/icons/main.go`:

```go
// tools/icons/main.go — one-shot downloader for Lucide SVGs.
//
// Reads tools/icons/sources.txt (one icon name per line), fetches the SVG
// from the pinned Lucide commit, normalizes stroke colors, and writes them
// to app/internal/ui/icons/svg/.
//
// Run from the repo root:    go run ./tools/icons
package main

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Pinned to a specific Lucide release for reproducibility. Bump as needed.
const lucideTag = "v0.453.0"

const baseURL = "https://raw.githubusercontent.com/lucide-icons/lucide/" + lucideTag + "/icons/"

const outDir = "app/internal/ui/icons/svg"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "ERROR:", err)
		os.Exit(1)
	}
}

func run() error {
	names, err := readSourceList("tools/icons/sources.txt")
	if err != nil {
		return fmt.Errorf("read sources: %w", err)
	}

	if err := os.MkdirAll(outDir, 0755); err != nil {
		return fmt.Errorf("mkdir %s: %w", outDir, err)
	}

	for _, name := range names {
		if err := fetch(name); err != nil {
			return fmt.Errorf("fetch %q: %w", name, err)
		}
		fmt.Printf("  ✓ %s\n", name)
	}
	fmt.Printf("\nFetched %d icons into %s\n", len(names), outDir)
	return nil
}

func readSourceList(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var names []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		names = append(names, line)
	}
	return names, scanner.Err()
}

func fetch(name string) error {
	resp, err := http.Get(baseURL + name + ".svg")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	// Normalize: Fyne's renderer treats stroke="currentColor" inconsistently.
	// Replace with explicit white; the IconButton wrapper handles tinting.
	body = []byte(strings.ReplaceAll(string(body), `stroke="currentColor"`, `stroke="#FFFFFF"`))

	outPath := filepath.Join(outDir, name+".svg")
	return os.WriteFile(outPath, body, 0644)
}
```

- [ ] **Step 3: Run the fetcher**

```bash
cd E:/Coding/hedgebuddy && go run ./tools/icons
```

Expected output: 25 lines of `✓ icon-name`, then `Fetched 25 icons into app/internal/ui/icons/svg`.

Verify the directory:

```bash
ls app/internal/ui/icons/svg/
```

Expected: 25 `.svg` files matching `sources.txt`.

- [ ] **Step 4: Commit the tool and the fetched SVGs**

```bash
git add tools/icons/ app/internal/ui/icons/svg/
git commit -m "tools: add Lucide icon fetcher; vendor Phase 1 icons"
```

---

## Task 7: Bundle the icons via go:embed

**Files:**
- Create: `app/internal/ui/icons/bundled.go`

- [ ] **Step 1: Write the bundle file**

Create `app/internal/ui/icons/bundled.go`:

```go
// Package icons exposes Lucide SVG resources for the UI.
// SVGs are vendored under svg/ and embedded at compile time.
package icons

import (
	_ "embed"

	"fyne.io/fyne/v2"
)

//go:embed svg/plus.svg
var plusData []byte
var Plus = &fyne.StaticResource{StaticName: "plus.svg", StaticContent: plusData}

//go:embed svg/download.svg
var downloadData []byte
var Download = &fyne.StaticResource{StaticName: "download.svg", StaticContent: downloadData}

//go:embed svg/upload.svg
var uploadData []byte
var Upload = &fyne.StaticResource{StaticName: "upload.svg", StaticContent: uploadData}

//go:embed svg/search.svg
var searchData []byte
var Search = &fyne.StaticResource{StaticName: "search.svg", StaticContent: searchData}

//go:embed svg/x.svg
var xData []byte
var X = &fyne.StaticResource{StaticName: "x.svg", StaticContent: xData}

//go:embed svg/pencil.svg
var pencilData []byte
var Pencil = &fyne.StaticResource{StaticName: "pencil.svg", StaticContent: pencilData}

//go:embed svg/copy.svg
var copyData []byte
var Copy = &fyne.StaticResource{StaticName: "copy.svg", StaticContent: copyData}

//go:embed svg/copy-plus.svg
var copyPlusData []byte
var CopyPlus = &fyne.StaticResource{StaticName: "copy-plus.svg", StaticContent: copyPlusData}

//go:embed svg/trash-2.svg
var trash2Data []byte
var Trash = &fyne.StaticResource{StaticName: "trash-2.svg", StaticContent: trash2Data}

//go:embed svg/eye.svg
var eyeData []byte
var Eye = &fyne.StaticResource{StaticName: "eye.svg", StaticContent: eyeData}

//go:embed svg/eye-off.svg
var eyeOffData []byte
var EyeOff = &fyne.StaticResource{StaticName: "eye-off.svg", StaticContent: eyeOffData}

//go:embed svg/file.svg
var fileData []byte
var File = &fyne.StaticResource{StaticName: "file.svg", StaticContent: fileData}

//go:embed svg/folder-open.svg
var folderOpenData []byte
var FolderOpen = &fyne.StaticResource{StaticName: "folder-open.svg", StaticContent: folderOpenData}

//go:embed svg/more-horizontal.svg
var moreHorizontalData []byte
var MoreHorizontal = &fyne.StaticResource{StaticName: "more-horizontal.svg", StaticContent: moreHorizontalData}

//go:embed svg/settings.svg
var settingsData []byte
var Settings = &fyne.StaticResource{StaticName: "settings.svg", StaticContent: settingsData}

//go:embed svg/info.svg
var infoData []byte
var Info = &fyne.StaticResource{StaticName: "info.svg", StaticContent: infoData}

//go:embed svg/check.svg
var checkData []byte
var Check = &fyne.StaticResource{StaticName: "check.svg", StaticContent: checkData}

//go:embed svg/arrow-left.svg
var arrowLeftData []byte
var ArrowLeft = &fyne.StaticResource{StaticName: "arrow-left.svg", StaticContent: arrowLeftData}

//go:embed svg/database-zap.svg
var databaseZapData []byte
var DatabaseZap = &fyne.StaticResource{StaticName: "database-zap.svg", StaticContent: databaseZapData}

//go:embed svg/external-link.svg
var externalLinkData []byte
var ExternalLink = &fyne.StaticResource{StaticName: "external-link.svg", StaticContent: externalLinkData}

//go:embed svg/refresh-cw.svg
var refreshCwData []byte
var RefreshCw = &fyne.StaticResource{StaticName: "refresh-cw.svg", StaticContent: refreshCwData}

//go:embed svg/chevron-right.svg
var chevronRightData []byte
var ChevronRight = &fyne.StaticResource{StaticName: "chevron-right.svg", StaticContent: chevronRightData}

//go:embed svg/chevron-down.svg
var chevronDownData []byte
var ChevronDown = &fyne.StaticResource{StaticName: "chevron-down.svg", StaticContent: chevronDownData}

//go:embed svg/alert-triangle.svg
var alertTriangleData []byte
var AlertTriangle = &fyne.StaticResource{StaticName: "alert-triangle.svg", StaticContent: alertTriangleData}

//go:embed svg/download-cloud.svg
var downloadCloudData []byte
var DownloadCloud = &fyne.StaticResource{StaticName: "download-cloud.svg", StaticContent: downloadCloudData}
```

- [ ] **Step 2: Build to verify embeds resolve**

Run: `cd app && go build ./...`
Expected: exit 0. If any `embed` directive fails, the missing SVG file's name will be in the error.

- [ ] **Step 3: Commit**

```bash
git add app/internal/ui/icons/bundled.go
git commit -m "feat(ui): embed Lucide icons via go:embed"
```

---

## Task 8: IconButton component

**Files:**
- Create: `app/internal/ui/components/iconbutton.go`

- [ ] **Step 1: Implement the IconButton wrapper**

Create `app/internal/ui/components/iconbutton.go`:

```go
// Package components hosts reusable widget primitives for the HedgeBuddy UI.
package components

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/widget"

	ttwidget "github.com/dweymouth/fyne-tooltip/widget"
)

// IconButtonVariant controls hover-color behavior.
type IconButtonVariant int

const (
	// IconVariantNeutral: muted at rest, primary on hover. Used for most actions.
	IconVariantNeutral IconButtonVariant = iota
	// IconVariantDanger: muted at rest, danger color on hover. Used for delete.
	IconVariantDanger
)

// IconButton is the canonical icon-only action affordance.
// At rest: muted tint. On hover: primary or danger tint.
// Tooltip via fyne-tooltip (kept as a third-party dep — Fyne core has no built-in tooltip API yet).
type IconButton struct {
	*ttwidget.Button
}

// NewIconButton creates a tooltip-equipped icon button. Variant controls hover color.
func NewIconButton(icon fyne.Resource, tooltip string, variant IconButtonVariant, tapped func()) *IconButton {
	btn := ttwidget.NewButtonWithIcon("", icon, tapped)
	btn.SetToolTip(tooltip)
	// Importance signals Fyne which theme color name to use for tinting.
	// We use LowImportance for neutral icons and DangerImportance for the trash variant.
	if variant == IconVariantDanger {
		btn.Importance = widget.DangerImportance
	} else {
		btn.Importance = widget.LowImportance
	}
	return &IconButton{Button: btn}
}
```

- [ ] **Step 2: Build to confirm component compiles**

Run: `cd app && go build ./...`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/internal/ui/components/iconbutton.go
git commit -m "feat(ui/components): add IconButton wrapper"
```

> **Note on tinting:** Phase 1 ships with importance-based color tints (`LowImportance` for neutral, `DangerImportance` for delete-style). This is the simplest Fyne-idiomatic path. If visual inspection shows the icons aren't tinting as expected (Fyne sometimes only tints `theme.IconName*` icons, not arbitrary `fyne.Resource` SVGs), the fallback is to render the icon via `canvas.NewImageFromResource` with a `canvas.Rectangle` color overlay, or to pre-generate color-variant SVG resources. Decide during Task 14 (CardRow) — that's where the visual test happens.

---

## Task 9: CardRow component

**Files:**
- Create: `app/internal/ui/components/cardrow.go`
- Create: `app/internal/ui/components/cardrow_test.go`

- [ ] **Step 1: Implement CardRow**

Create `app/internal/ui/components/cardrow.go`:

```go
package components

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/icons"
	"app/internal/ui/tokens"
)

// CardRowData is the data passed to the card.
type CardRowData struct {
	Name        string
	Value       string
	Type        string // "string" | "path" | "url" | "secret"
	Description string
}

// CardRowActions wires the row's per-action callbacks.
type CardRowActions struct {
	OnCopy      func()
	OnEdit      func()
	OnDuplicate func()
	OnDelete    func()
}

// CardRow renders a single variable as a rounded card.
// Mouse-in reveals the action icons and lifts the background to Surface3.
type CardRow struct {
	widget.BaseWidget
	data     CardRowData
	actions  CardRowActions
	revealed bool // for secret type: is the value revealed
	hover    bool
}

// NewCardRow builds a card. Call ExtendBaseWidget internally.
func NewCardRow(data CardRowData, actions CardRowActions) *CardRow {
	c := &CardRow{data: data, actions: actions}
	c.ExtendBaseWidget(c)
	return c
}

// SetData updates the card's data and refreshes.
func (c *CardRow) SetData(data CardRowData) {
	c.data = data
	c.Refresh()
}

func (c *CardRow) MouseIn(*fyne.PointEvent)  { c.hover = true; c.Refresh() }
func (c *CardRow) MouseOut()                  { c.hover = false; c.Refresh() }
func (c *CardRow) MouseMoved(*fyne.PointEvent) {}

func (c *CardRow) CreateRenderer() fyne.WidgetRenderer {
	bg := canvas.NewRectangle(tokens.Surface2)
	bg.CornerRadius = tokens.RadiusCard
	bg.StrokeColor = tokens.BorderSubtle
	bg.StrokeWidth = 1

	stripe := canvas.NewRectangle(tokens.TypeColor(c.data.Type))
	stripe.SetMinSize(fyne.NewSize(3, 0))

	nameText := canvas.NewText(c.data.Name, tokens.TextPrimary)
	nameText.TextSize = 13
	nameText.TextStyle = fyne.TextStyle{Bold: true}

	typeDot := canvas.NewCircle(tokens.TypeColor(c.data.Type))
	typeDot.Resize(fyne.NewSize(6, 6))

	typeLabel := canvas.NewText(c.data.Type, tokens.TypeColor(c.data.Type))
	typeLabel.TextSize = 11

	valueText := widget.NewLabel(c.displayValue())
	valueText.Truncation = fyne.TextTruncateEllipsis
	valueText.TextStyle = fyne.TextStyle{Monospace: true}

	descText := widget.NewLabel(c.data.Description)
	descText.Truncation = fyne.TextTruncateEllipsis
	descText.Importance = widget.LowImportance

	revealBtn := NewIconButton(icons.Eye, "Reveal secret value", IconVariantNeutral, func() {
		c.revealed = !c.revealed
		c.Refresh()
	})
	if c.data.Type != "secret" {
		revealBtn.Hide()
	} else if c.revealed {
		revealBtn.SetIcon(icons.EyeOff)
		revealBtn.SetToolTip("Hide secret value")
	}

	copyBtn := NewIconButton(icons.Copy, "Copy value", IconVariantNeutral, c.actions.OnCopy)
	editBtn := NewIconButton(icons.Pencil, "Edit variable", IconVariantNeutral, c.actions.OnEdit)
	dupBtn := NewIconButton(icons.CopyPlus, "Duplicate variable", IconVariantNeutral, c.actions.OnDuplicate)
	delBtn := NewIconButton(icons.Trash, "Delete variable", IconVariantDanger, c.actions.OnDelete)

	actionRow := container.NewHBox(revealBtn, copyBtn, editBtn, dupBtn, delBtn)
	if !c.hover {
		actionRow.Hide()
	}

	header := container.NewHBox(nameText, container.NewPadded(typeDot), typeLabel, layout.NewSpacer(), actionRow)
	body := container.NewVBox(header, valueText, descText)

	inner := container.NewBorder(nil, nil, stripe, nil, container.NewPadded(body))
	root := container.NewStack(bg, inner)
	root.Resize(fyne.NewSize(0, tokens.CardMinHeight))

	if c.hover {
		bg.FillColor = tokens.Surface3
	}

	return widget.NewSimpleRenderer(root)
}

// Refresh resyncs the renderer to the latest data; for now, force re-create.
func (c *CardRow) Refresh() {
	c.BaseWidget.Refresh()
}

const secretMask = "••••••••"

func (c *CardRow) displayValue() string {
	if c.data.Type == "secret" && !c.revealed {
		return secretMask
	}
	return middleEllipsize(c.data.Value, 80)
}

// middleEllipsize keeps the start and end of long strings, useful for paths.
func middleEllipsize(s string, max int) string {
	if len(s) <= max {
		return s
	}
	if max < 5 {
		return s[:max]
	}
	keep := (max - 1) / 2
	return fmt.Sprintf("%s…%s", s[:keep], s[len(s)-(max-1-keep):])
}
```

- [ ] **Step 2: Write a smoke test**

Create `app/internal/ui/components/cardrow_test.go`:

```go
package components

import (
	"testing"

	"fyne.io/fyne/v2/test"
)

func TestCardRow_RendersWithoutPanic(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	c := NewCardRow(CardRowData{
		Name:        "API_KEY",
		Value:       "sk-abc123",
		Type:        "secret",
		Description: "for the billing service",
	}, CardRowActions{})

	w := test.NewWindow(c)
	defer w.Close()
	// If CreateRenderer panics, this fails.
}

func TestCardRow_SecretValueIsMasked(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	c := NewCardRow(CardRowData{
		Name:  "API_KEY",
		Value: "sk-abc123",
		Type:  "secret",
	}, CardRowActions{})

	if c.displayValue() != secretMask {
		t.Errorf("secret should be masked at rest; got %q", c.displayValue())
	}

	c.revealed = true
	if c.displayValue() != "sk-abc123" {
		t.Errorf("revealed secret should show value; got %q", c.displayValue())
	}
}

func TestMiddleEllipsize(t *testing.T) {
	cases := []struct {
		in, want string
		max      int
	}{
		{"short", "short", 20},
		{"C:\\Users\\shake\\AppData\\Roaming\\hedgebuddy\\google-key.json", "C:\\Users\\shake\\AppData\\Ro…hedgebuddy\\google-key.json", 60},
	}
	for _, c := range cases {
		got := middleEllipsize(c.in, c.max)
		if got != c.want {
			t.Errorf("middleEllipsize(%q, %d) = %q; want %q", c.in, c.max, got, c.want)
		}
	}
}
```

- [ ] **Step 3: Run tests**

Run: `cd app && go test ./internal/ui/components/ -run TestCardRow -v`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add app/internal/ui/components/cardrow.go app/internal/ui/components/cardrow_test.go
git commit -m "feat(ui/components): CardRow with type stripe, hover actions, middle-ellipsis"
```

---

## Task 10: Sidebar and SidebarItem components

**Files:**
- Create: `app/internal/ui/components/sidebar.go`
- Create: `app/internal/ui/components/sidebar_test.go`

- [ ] **Step 1: Implement Sidebar**

Create `app/internal/ui/components/sidebar.go`:

```go
package components

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/tokens"
)

// SidebarItem is a single tappable row in the sidebar.
type SidebarItem struct {
	widget.BaseWidget
	label   string
	count   *int // nil = no count shown
	active  bool
	hover   bool
	onTap   func()
}

func NewSidebarItem(label string, count *int, active bool, onTap func()) *SidebarItem {
	i := &SidebarItem{label: label, count: count, active: active, onTap: onTap}
	i.ExtendBaseWidget(i)
	return i
}

func (i *SidebarItem) SetActive(active bool) { i.active = active; i.Refresh() }
func (i *SidebarItem) SetCount(c int)        { i.count = &c; i.Refresh() }
func (i *SidebarItem) Tapped(*fyne.PointEvent) {
	if i.onTap != nil {
		i.onTap()
	}
}
func (i *SidebarItem) MouseIn(*fyne.PointEvent)  { i.hover = true; i.Refresh() }
func (i *SidebarItem) MouseOut()                  { i.hover = false; i.Refresh() }
func (i *SidebarItem) MouseMoved(*fyne.PointEvent) {}

func (i *SidebarItem) CreateRenderer() fyne.WidgetRenderer {
	bg := canvas.NewRectangle(tokens.Surface1)
	bg.CornerRadius = tokens.RadiusSidebarItem
	switch {
	case i.active:
		bg.FillColor = tokens.Surface3
	case i.hover:
		bg.FillColor = tokens.Surface2
	}

	stripe := canvas.NewRectangle(tokens.Accent)
	stripe.SetMinSize(fyne.NewSize(2, 0))
	if !i.active {
		stripe.FillColor = tokens.Surface1 // invisible
	}

	labelText := canvas.NewText(i.label, tokens.TextPrimary)
	labelText.TextSize = 13
	if i.active {
		labelText.TextStyle = fyne.TextStyle{Bold: true}
	}

	row := container.NewHBox(labelText)
	if i.count != nil {
		countText := canvas.NewText(fmt.Sprintf("%d", *i.count), tokens.TextMuted)
		countText.TextSize = 11
		countText.Alignment = fyne.TextAlignTrailing
		row = container.NewHBox(labelText, layout.NewSpacer(), countText)
	}

	inner := container.NewBorder(nil, nil, stripe, nil, container.NewPadded(row))
	stack := container.NewStack(bg, inner)
	stack.Resize(fyne.NewSize(tokens.SidebarWidth-tokens.SpaceSM*2, 32))
	return widget.NewSimpleRenderer(stack)
}

// Sidebar renders a vertical column with sections of items and a footer.
type Sidebar struct {
	widget.BaseWidget
	sections []SidebarSection
	footer   []fyne.CanvasObject
}

// SidebarSection is a labeled group of items (with optional trailing add button).
type SidebarSection struct {
	Title   string
	Items   []fyne.CanvasObject
	OnAdd   func() // if non-nil, renders a `+` button in the section header
}

func NewSidebar(sections []SidebarSection, footer []fyne.CanvasObject) *Sidebar {
	s := &Sidebar{sections: sections, footer: footer}
	s.ExtendBaseWidget(s)
	return s
}

// Rebuild swaps the sections (e.g. after profile or filter changes).
func (s *Sidebar) Rebuild(sections []SidebarSection) {
	s.sections = sections
	s.Refresh()
}

func (s *Sidebar) CreateRenderer() fyne.WidgetRenderer {
	bg := canvas.NewRectangle(tokens.Surface1)
	bg.SetMinSize(fyne.NewSize(tokens.SidebarWidth, 0))

	var sectionBoxes []fyne.CanvasObject
	for _, sec := range s.sections {
		title := canvas.NewText(sec.Title, tokens.TextMuted)
		title.TextSize = 11
		title.TextStyle = fyne.TextStyle{Bold: true}

		var header fyne.CanvasObject
		if sec.OnAdd != nil {
			addBtn := widget.NewButton("+", sec.OnAdd)
			addBtn.Importance = widget.LowImportance
			header = container.NewBorder(nil, nil, title, addBtn)
		} else {
			header = container.NewHBox(title)
		}

		items := container.NewVBox(sec.Items...)
		sectionBoxes = append(sectionBoxes, container.NewVBox(header, items))
	}

	body := container.NewVBox(sectionBoxes...)

	var footerBox fyne.CanvasObject
	if len(s.footer) > 0 {
		footerBox = container.NewVBox(s.footer...)
	}

	root := container.NewBorder(
		nil, footerBox, nil, nil,
		container.NewVScroll(container.NewPadded(body)),
	)

	return widget.NewSimpleRenderer(container.NewStack(bg, root))
}
```

- [ ] **Step 2: Write smoke tests**

Create `app/internal/ui/components/sidebar_test.go`:

```go
package components

import (
	"testing"

	"fyne.io/fyne/v2/test"
)

func TestSidebarItem_RendersAndTaps(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	tapped := 0
	item := NewSidebarItem("default", nil, true, func() { tapped++ })
	w := test.NewWindow(item)
	defer w.Close()

	test.Tap(item)
	if tapped != 1 {
		t.Errorf("expected onTap called once, got %d", tapped)
	}
}

func TestSidebar_RendersSections(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	count := 3
	item := NewSidebarItem("path", &count, false, nil)
	sb := NewSidebar(
		[]SidebarSection{{Title: "FILTERS", Items: []fyne.CanvasObject{item}}},
		nil,
	)
	w := test.NewWindow(sb)
	defer w.Close()
}
```

- [ ] **Step 3: Run tests**

Run: `cd app && go test ./internal/ui/components/ -run TestSidebar -v`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add app/internal/ui/components/sidebar.go app/internal/ui/components/sidebar_test.go
git commit -m "feat(ui/components): Sidebar + SidebarItem"
```

---

## Task 11: Drawer component

**Files:**
- Create: `app/internal/ui/components/drawer.go`
- Create: `app/internal/ui/components/drawer_test.go`

- [ ] **Step 1: Implement Drawer**

Create `app/internal/ui/components/drawer.go`:

```go
package components

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/icons"
	"app/internal/ui/tokens"
)

// Drawer is a right-anchored overlay panel with a dimmed scrim.
// The owning shell places this inside a top-level Stack and toggles visibility.
type Drawer struct {
	widget.BaseWidget
	title    string
	content  fyne.CanvasObject
	onClose  func()
	visible  bool
}

func NewDrawer() *Drawer {
	d := &Drawer{}
	d.ExtendBaseWidget(d)
	d.Hide()
	return d
}

// Open shows the drawer with the given title and body.
func (d *Drawer) Open(title string, content fyne.CanvasObject, onClose func()) {
	d.title = title
	d.content = content
	d.onClose = onClose
	d.visible = true
	d.Show()
	d.Refresh()
}

// Close hides the drawer and invokes the close callback.
func (d *Drawer) Close() {
	if !d.visible {
		return
	}
	d.visible = false
	if d.onClose != nil {
		d.onClose()
	}
	d.Hide()
}

// IsOpen returns true if the drawer is currently shown.
func (d *Drawer) IsOpen() bool { return d.visible }

func (d *Drawer) CreateRenderer() fyne.WidgetRenderer {
	scrim := canvas.NewRectangle(tokens.DimOverlay)

	panel := canvas.NewRectangle(tokens.Surface4)

	closeBtn := NewIconButton(icons.X, "Close", IconVariantNeutral, d.Close)

	titleText := canvas.NewText(d.title, tokens.TextPrimary)
	titleText.TextSize = 22
	titleText.TextStyle = fyne.TextStyle{Bold: true}

	header := container.NewBorder(nil, nil, titleText, closeBtn)

	body := container.NewPadded(d.content)
	if d.content == nil {
		body = container.NewPadded(widget.NewLabel(""))
	}

	panelInner := container.NewBorder(
		container.NewPadded(header),
		nil, nil, nil,
		container.NewVScroll(body),
	)

	panelStack := container.NewStack(panel, panelInner)

	// The scrim covers the full window; the panel is anchored right at fixed width.
	// We use a Border layout: right=panelStack, center=scrim (so the scrim takes the remaining space).
	scrimTappable := newTappableArea(d.Close)
	scrimWithDim := container.NewStack(scrim, scrimTappable)

	rightAnchored := container.NewBorder(nil, nil, nil, panelStack, scrimWithDim)
	// We need to enforce panel width via a min-size wrapper.
	panel.SetMinSize(fyne.NewSize(tokens.DrawerWidth, 0))

	return widget.NewSimpleRenderer(rightAnchored)
}

// tappableArea is a click target painted with the dim overlay color.
// It overlays the scrim rectangle so taps anywhere outside the panel close the drawer.
type tappableArea struct {
	widget.BaseWidget
	onTap func()
}

func newTappableArea(onTap func()) *tappableArea {
	t := &tappableArea{onTap: onTap}
	t.ExtendBaseWidget(t)
	return t
}

func (t *tappableArea) Tapped(*fyne.PointEvent) {
	if t.onTap != nil {
		t.onTap()
	}
}

func (t *tappableArea) CreateRenderer() fyne.WidgetRenderer {
	r := canvas.NewRectangle(tokens.DimOverlay)
	return widget.NewSimpleRenderer(r)
}
```

> **Note:** the `tappableArea` overlaps the scrim visually because Fyne lacks a "transparent but tappable" primitive. We accept the doubled color render because both pixels are the same dim overlay. If visual review shows a noticeable shift, replace `tappableArea.CreateRenderer` with a fully transparent rectangle (`color.NRGBA{0,0,0,0}`) wrapped in a `container.NewStack` where the lower rectangle is the visible scrim.

- [ ] **Step 2: Write smoke tests**

Create `app/internal/ui/components/drawer_test.go`:

```go
package components

import (
	"testing"

	"fyne.io/fyne/v2/test"
	"fyne.io/fyne/v2/widget"
)

func TestDrawer_OpenCloseTogglesVisibility(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	d := NewDrawer()
	w := test.NewWindow(d)
	defer w.Close()

	if d.IsOpen() {
		t.Fatal("drawer should start closed")
	}

	d.Open("Test", widget.NewLabel("body"), nil)
	if !d.IsOpen() {
		t.Error("drawer should be open after Open()")
	}

	closed := false
	d.Open("Test2", widget.NewLabel("body"), func() { closed = true })
	d.Close()
	if d.IsOpen() {
		t.Error("drawer should be closed after Close()")
	}
	if !closed {
		t.Error("onClose callback should fire")
	}
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd app && go test ./internal/ui/components/ -run TestDrawer -v
```

Expected: all PASS.

```bash
git add app/internal/ui/components/drawer.go app/internal/ui/components/drawer_test.go
git commit -m "feat(ui/components): Drawer with scrim and tap-to-close"
```

---

## Task 12: InlineStateButton component

**Files:**
- Create: `app/internal/ui/components/inlinestate.go`
- Create: `app/internal/ui/components/inlinestate_test.go`

- [ ] **Step 1: Implement InlineStateButton**

Create `app/internal/ui/components/inlinestate.go`:

```go
package components

import (
	"sync"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/icons"
)

// ButtonState enumerates the lifecycle of an InlineStateButton.
type ButtonState int

const (
	StateIdle ButtonState = iota
	StateBusy
	StateDone
	StateError
)

const (
	doneHoldMs  = 1000
	errorHoldMs = 3000
)

// InlineStateButton is a primary button that morphs through idle → busy → done.
// Replaces transient toast notifications for save / import / export / install actions.
type InlineStateButton struct {
	*widget.Button
	mu          sync.Mutex
	state       ButtonState
	idleLabel   string
	idleIcon    fyne.Resource
	doneLabel   string
	errorLabel  string
	onTap       func()
	clock       func(time.Duration, func()) // override for tests
}

// NewInlineStateButton creates a button that begins in idle state.
// `idleLabel` is the resting label (e.g. "Save").
// `doneLabel` is shown after busy completes (e.g. "Saved").
// `errorLabel` is shown on error from busy (e.g. "Save failed").
// `onTap` is the user-supplied click handler; the button itself manages state transitions.
func NewInlineStateButton(idleLabel, doneLabel, errorLabel string, onTap func()) *InlineStateButton {
	b := &InlineStateButton{
		idleLabel:  idleLabel,
		idleIcon:   nil,
		doneLabel:  doneLabel,
		errorLabel: errorLabel,
		onTap:      onTap,
		clock:      func(d time.Duration, f func()) { time.AfterFunc(d, f) },
	}
	btn := widget.NewButton(idleLabel, b.handleTap)
	btn.Importance = widget.HighImportance
	b.Button = btn
	return b
}

// SetState transitions the button to a new state. Safe to call from any goroutine.
func (b *InlineStateButton) SetState(s ButtonState) {
	b.mu.Lock()
	b.state = s
	b.mu.Unlock()

	switch s {
	case StateIdle:
		fyne.Do(func() {
			b.Button.SetText(b.idleLabel)
			b.Button.SetIcon(b.idleIcon)
			b.Button.Enable()
			b.Button.Importance = widget.HighImportance
			b.Button.Refresh()
		})
	case StateBusy:
		fyne.Do(func() {
			b.Button.SetText(b.idleLabel + "…")
			b.Button.SetIcon(nil)
			b.Button.Disable()
			b.Button.Refresh()
		})
	case StateDone:
		fyne.Do(func() {
			b.Button.SetText(b.doneLabel)
			b.Button.SetIcon(icons.Check)
			b.Button.Importance = widget.SuccessImportance
			b.Button.Refresh()
		})
		b.clock(time.Duration(doneHoldMs)*time.Millisecond, func() {
			if b.currentState() == StateDone {
				b.SetState(StateIdle)
			}
		})
	case StateError:
		fyne.Do(func() {
			b.Button.SetText(b.errorLabel)
			b.Button.SetIcon(icons.X)
			b.Button.Importance = widget.DangerImportance
			b.Button.Enable()
			b.Button.Refresh()
		})
		b.clock(time.Duration(errorHoldMs)*time.Millisecond, func() {
			if b.currentState() == StateError {
				b.SetState(StateIdle)
			}
		})
	}
}

// State returns the current state. Thread-safe.
func (b *InlineStateButton) State() ButtonState { return b.currentState() }

func (b *InlineStateButton) currentState() ButtonState {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.state
}

func (b *InlineStateButton) handleTap() {
	if b.currentState() == StateBusy {
		return
	}
	if b.onTap != nil {
		b.onTap()
	}
}
```

- [ ] **Step 2: Write tests**

Create `app/internal/ui/components/inlinestate_test.go`:

```go
package components

import (
	"testing"
	"time"

	"fyne.io/fyne/v2/test"
)

func TestInlineStateButton_DefaultState(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	b := NewInlineStateButton("Save", "Saved", "Save failed", func() {})
	if b.State() != StateIdle {
		t.Errorf("expected StateIdle, got %v", b.State())
	}
}

func TestInlineStateButton_StateTransitions(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	// Replace the clock with a no-op so SetState(StateDone) doesn't auto-revert during the test.
	b := NewInlineStateButton("Save", "Saved", "Save failed", func() {})
	b.clock = func(time.Duration, func()) {}

	b.SetState(StateBusy)
	if b.State() != StateBusy {
		t.Errorf("expected StateBusy, got %v", b.State())
	}

	b.SetState(StateDone)
	if b.State() != StateDone {
		t.Errorf("expected StateDone, got %v", b.State())
	}

	b.SetState(StateError)
	if b.State() != StateError {
		t.Errorf("expected StateError, got %v", b.State())
	}

	b.SetState(StateIdle)
	if b.State() != StateIdle {
		t.Errorf("expected StateIdle, got %v", b.State())
	}
}

func TestInlineStateButton_TapWhileBusyIsIgnored(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	count := 0
	b := NewInlineStateButton("Save", "Saved", "Save failed", func() { count++ })
	b.clock = func(time.Duration, func()) {}

	b.SetState(StateBusy)
	b.handleTap()
	if count != 0 {
		t.Errorf("expected onTap suppressed during busy, got count=%d", count)
	}

	b.SetState(StateIdle)
	b.handleTap()
	if count != 1 {
		t.Errorf("expected onTap fired in idle, got count=%d", count)
	}
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd app && go test ./internal/ui/components/ -run TestInlineStateButton -v
```

Expected: all PASS.

```bash
git add app/internal/ui/components/inlinestate.go app/internal/ui/components/inlinestate_test.go
git commit -m "feat(ui/components): InlineStateButton state machine"
```

---

## Task 13: Modal wrapper + DeleteConfirm

**Files:**
- Create: `app/internal/ui/components/modal.go`
- Create: `app/internal/ui/components/modal_test.go`

- [ ] **Step 1: Implement Modal helpers**

Create `app/internal/ui/components/modal.go`:

```go
package components

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"
)

// DeleteConfirmOptions configures a redesigned delete confirmation modal.
type DeleteConfirmOptions struct {
	TargetName string // shown in the title and the confirm button
	BodyText   string // wrapping label describing the consequence
	OnConfirm  func()
	Parent     fyne.Window
}

// ShowDeleteConfirm renders a centered confirmation modal with:
//   Title: "Delete <Name>?"
//   Body: <BodyText> (wraps via widget.Label)
//   Buttons: Cancel (ghost) · Delete <Name> (Danger)
func ShowDeleteConfirm(opts DeleteConfirmOptions) {
	body := widget.NewLabel(opts.BodyText)
	body.Wrapping = fyne.TextWrapWord

	d := dialog.NewCustomWithoutButtons(
		"Delete "+opts.TargetName+"?",
		container.NewPadded(body),
		opts.Parent,
	)

	cancelBtn := widget.NewButton("Cancel", func() { d.Hide() })

	confirmBtn := widget.NewButton("Delete "+opts.TargetName, func() {
		d.Hide()
		if opts.OnConfirm != nil {
			opts.OnConfirm()
		}
	})
	confirmBtn.Importance = widget.DangerImportance

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), cancelBtn, confirmBtn})
	d.Show()
}

// ShowCustomModal renders a centered modal with a custom button row.
// Used by ProfileFormModal and Settings/About modals where the buttons vary.
func ShowCustomModal(parent fyne.Window, title string, body fyne.CanvasObject, buttons []fyne.CanvasObject) dialog.Dialog {
	d := dialog.NewCustomWithoutButtons(title, container.NewPadded(body), parent)
	d.SetButtons(buttons)
	d.Show()
	return d
}
```

- [ ] **Step 2: Write a smoke test**

Create `app/internal/ui/components/modal_test.go`:

```go
package components

import (
	"testing"

	"fyne.io/fyne/v2/test"
)

func TestShowDeleteConfirm_DoesNotPanic(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	w := test.NewWindow(nil)
	defer w.Close()

	ShowDeleteConfirm(DeleteConfirmOptions{
		TargetName: "API_KEY",
		BodyText:   "Long body text that should wrap when the modal is narrow.",
		OnConfirm:  func() {},
		Parent:     w,
	})
}
```

- [ ] **Step 3: Run and commit**

```bash
cd app && go test ./internal/ui/components/ -run TestShowDeleteConfirm -v
```

Expected: PASS.

```bash
git add app/internal/ui/components/modal.go app/internal/ui/components/modal_test.go
git commit -m "feat(ui/components): Modal + ShowDeleteConfirm with wrapping body"
```

---

## Task 14: FieldRow component

**Files:**
- Create: `app/internal/ui/components/fieldrow.go`

- [ ] **Step 1: Implement FieldRow**

Create `app/internal/ui/components/fieldrow.go`:

```go
package components

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/tokens"
)

// FieldRow is a labeled form field that renders as label / entry / inline error.
// Phase 1 ships the visual structure; Phase 2 wires Entry.Validator for live errors.
type FieldRow struct {
	label    *canvas.Text
	entry    *widget.Entry
	errText  *canvas.Text
	root     fyne.CanvasObject
	trailing fyne.CanvasObject // optional, e.g. Browse buttons for path
}

// NewFieldRow builds a FieldRow with a plain Entry. Use NewPasswordFieldRow for secrets.
func NewFieldRow(label string, entry *widget.Entry, trailing fyne.CanvasObject) *FieldRow {
	labelText := canvas.NewText(label, tokens.TextPrimary)
	labelText.TextSize = 16
	labelText.TextStyle = fyne.TextStyle{Bold: true}

	errText := canvas.NewText("", tokens.Danger)
	errText.TextSize = 11
	errText.Hide()

	f := &FieldRow{label: labelText, entry: entry, errText: errText, trailing: trailing}

	var entryBox fyne.CanvasObject = entry
	if trailing != nil {
		entryBox = container.NewBorder(nil, nil, nil, trailing, entry)
	}

	f.root = container.NewVBox(labelText, entryBox, errText)
	return f
}

// Object exposes the renderable.
func (f *FieldRow) Object() fyne.CanvasObject { return f.root }

// Entry exposes the underlying entry for value/placeholder updates.
func (f *FieldRow) Entry() *widget.Entry { return f.entry }

// SetError shows or hides the inline error caption.
func (f *FieldRow) SetError(msg string) {
	if msg == "" {
		f.errText.Hide()
		return
	}
	f.errText.Text = msg
	f.errText.Show()
	f.errText.Refresh()
}
```

- [ ] **Step 2: Build and commit (no unit test — exercised by drawer integration in Task 18)**

```bash
cd app && go build ./...
```

Expected: exit 0.

```bash
git add app/internal/ui/components/fieldrow.go
git commit -m "feat(ui/components): FieldRow with inline error slot"
```

---

## Task 15: Build the new app shell — sidebar + main + drawer overlay

**Files:**
- Modify: `app/internal/ui/app.go` (substantial refactor)

The shell now persists across "views". `OpenDrawer`/`CloseDrawer` mediate secondary surfaces. List view becomes the main pane content.

- [ ] **Step 1: Rewrite app.go**

Replace the contents of `app/internal/ui/app.go` with:

```go
package ui

import (
	"fmt"
	"os/exec"
	"runtime"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	fynetooltip "github.com/dweymouth/fyne-tooltip"

	"app/internal/profile"
	"app/internal/storage"
	"app/internal/ui/components"
	"app/internal/ui/tokens"
	"app/internal/validator"
)

// AppController is the central controller managing shell state, navigation, and storage.
type AppController struct {
	App          fyne.App
	Window       fyne.Window
	Storage      *storage.Storage
	ProfileIndex *profile.ProfileIndex

	// Shell components
	sidebar  *components.Sidebar
	mainPane *fyne.Container
	drawer   *components.Drawer

	// Filter state
	activeFilter string // "" | "string" | "path" | "url" | "secret"
}

// NewAppController initializes storage, profile index, and the shell layout.
func NewAppController(fyneApp fyne.App, window fyne.Window) *AppController {
	ctrl := &AppController{
		App:    fyneApp,
		Window: window,
	}

	if err := profile.Migrate(); err != nil {
		fmt.Println("Warning: profile migration failed:", err.Error())
	}

	idx, err := profile.LoadIndex()
	if err != nil || idx == nil {
		idx = &profile.ProfileIndex{
			Active:   "default",
			Profiles: map[string]profile.ProfileMeta{"default": {Description: "Default profile"}},
		}
	}
	ctrl.ProfileIndex = idx

	if _, err := storage.InitStorage(); err != nil {
		fmt.Println("Warning: failed to initialize storage:", err.Error())
	}

	store, err := storage.Load()
	if err != nil {
		store = &storage.Storage{Variables: make(map[string]storage.Variable)}
	}
	ctrl.Storage = store

	ctrl.updateWindowTitle()
	ctrl.buildShell()

	return ctrl
}

func (c *AppController) buildShell() {
	c.mainPane = container.NewStack()
	c.drawer = components.NewDrawer()

	c.rebuildSidebar()
	c.renderList()

	shellBody := container.NewBorder(
		nil, nil,
		c.sidebar, nil,
		c.mainPane,
	)

	overlay := container.NewStack(shellBody, c.drawer)
	c.Window.SetContent(fynetooltip.AddWindowToolTipLayer(overlay, c.Window.Canvas()))

	// Esc closes drawer.
	c.Window.Canvas().SetOnTypedKey(func(e *fyne.KeyEvent) {
		if e.Name == fyne.KeyEscape && c.drawer.IsOpen() {
			c.drawer.Close()
		}
	})
}

// --- Drawer control ---

// OpenDrawer shows a right-side drawer with the given title and body.
func (c *AppController) OpenDrawer(title string, body fyne.CanvasObject, onClose func()) {
	c.drawer.Open(title, body, onClose)
}

// CloseDrawer hides the drawer.
func (c *AppController) CloseDrawer() {
	c.drawer.Close()
}

// --- Filter control ---

// SetFilter sets the active type filter (or "" for all) and re-renders the list.
func (c *AppController) SetFilter(typeName string) {
	c.activeFilter = typeName
	c.rebuildSidebar()
	c.renderList()
}

// --- Storage / profile ops (unchanged from before) ---

func (c *AppController) Reload() error {
	store, err := storage.Load()
	if err != nil {
		return err
	}
	c.Storage = store
	return nil
}

func (c *AppController) SwitchProfile(name string) error {
	if err := c.Storage.Save(); err != nil {
		return err
	}
	if err := profile.SetActiveProfile(c.ProfileIndex, name); err != nil {
		return err
	}
	store, err := storage.Load()
	if err != nil {
		return err
	}
	c.Storage = store
	c.updateWindowTitle()
	c.rebuildSidebar()
	c.renderList()
	return nil
}

func (c *AppController) updateWindowTitle() {
	if c.ProfileIndex.Active == "default" {
		c.Window.SetTitle(WindowTitle)
	} else {
		c.Window.SetTitle(fmt.Sprintf("%s — %s", WindowTitle, c.ProfileIndex.Active))
	}
}

func (c *AppController) SaveVariable(oldName, name, value, varType, description string) error {
	isUpdate := oldName != ""
	if isUpdate && oldName != name {
		c.Storage.DeleteVariable(oldName)
	}
	if err := validator.ValidateVariableName(name); err != nil {
		return err
	}
	if err := validator.ValidateByType(varType, value); err != nil {
		return err
	}
	overwrite := isUpdate
	if err := c.Storage.AddVariable(name, storage.Variable{
		Value:       value,
		Type:        varType,
		Description: description,
	}, overwrite); err != nil {
		return err
	}
	return c.Storage.Save()
}

func (c *AppController) DeleteVariable(name string) error {
	c.Storage.DeleteVariable(name)
	return c.Storage.Save()
}

func (c *AppController) DuplicateVariable(name string) {
	v, ok := c.Storage.GetVariable(name)
	if !ok {
		return
	}
	copyName := name + "_COPY"
	for counter := 2; ; counter++ {
		if _, exists := c.Storage.GetVariable(copyName); !exists {
			break
		}
		copyName = fmt.Sprintf("%s_COPY%d", name, counter)
	}
	if err := c.Storage.AddVariable(copyName, storage.Variable{
		Value:       v.Value,
		Type:        v.Type,
		Description: v.Description,
	}, false); err != nil {
		dialog.ShowError(err, c.Window)
		return
	}
	_ = c.Storage.Save()
	c.renderList()
}

func (c *AppController) OpenStorageFolder() {
	path, err := storage.GetStoragePath()
	if err != nil {
		dialog.ShowError(err, c.Window)
		return
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", "/select,", path)
	case "darwin":
		cmd = exec.Command("open", "-R", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	if err := cmd.Start(); err != nil {
		dialog.ShowError(err, c.Window)
	}
}

// silence unused import in this slice
var _ = tokens.SpaceSM
```

- [ ] **Step 2: Stub `rebuildSidebar`, `renderList`, `ShowListView`**

Add to `app/internal/ui/app.go`:

```go
// rebuildSidebar will be implemented in Task 16. Stub for now.
func (c *AppController) rebuildSidebar() {
	c.sidebar = components.NewSidebar(nil, nil)
}

// renderList will be implemented in Task 17. Stub renders an empty message for now.
func (c *AppController) renderList() {
	// Phase 1 in progress — list rebuild lands in Task 17.
	placeholder := widget.NewLabel("List view under reconstruction")
	c.mainPane.Objects = []fyne.CanvasObject{placeholder}
	c.mainPane.Refresh()
}

// ShowListView is kept for legacy callers (Task 0 main.go invokes it).
func (c *AppController) ShowListView() {
	c.renderList()
}
```

Top-of-file imports need `widget`:

```go
	"fyne.io/fyne/v2/widget"
```

- [ ] **Step 3: Comment out legacy `Show*View` callers temporarily**

The old views (`formview.go`, `importview.go`, `exportview.go`, `aboutview.go`, `profileview.go`) reference `ctrl.ShowFormView`, `ctrl.ShowAboutView`, etc. We're about to delete those views, but to keep the build green, comment out the bodies of the old `Show*View` methods in `app.go` if they remain — easier: just remove them.

Remove from `app.go`:
- `ShowFormView`
- `ShowImportView`
- `ShowExportView`
- `ShowAboutView`
- `ShowProfileView`
- `ConfirmDelete` (will be reimplemented inline once cards are wired)
- `ShowStatus` (toast — gone for good)
- `wrapView`, `setMainContent` (replaced by mainPane.Objects)

After removing, the build will fail because the old view files reference these. Continue to Step 4.

- [ ] **Step 4: Temporarily neuter the old view files**

For each of `formview.go`, `importview.go`, `exportview.go`, `aboutview.go`, `profileview.go`, `listview.go`, `helpers.go`:

Replace the file contents with a build-tag guard so it compiles to nothing:

For `formview.go`:

```go
//go:build legacy_disabled

package ui
```

Repeat for the other five (replacing the file body entirely with the same two-line content).

This keeps the files in git history but excludes them from compilation. They'll be deleted in Task 27 once their replacements ship.

- [ ] **Step 5: Build**

```bash
cd app && go build ./...
```

Expected: exit 0. There may be unused-import warnings — fix any that block compilation. If unused-import errors come from `app.go`, audit the imports list and remove what's no longer referenced (storage, validator are still needed; many of the old layout/dialog/canvas imports are not).

- [ ] **Step 6: Run; window shows the shell with placeholder**

```bash
cd app && go run .
```

Expected: window opens with the empty sidebar on the left and "List view under reconstruction" centered. The drawer is hidden. Close window.

- [ ] **Step 7: Commit**

```bash
git add app/internal/ui/app.go app/internal/ui/formview.go app/internal/ui/importview.go app/internal/ui/exportview.go app/internal/ui/aboutview.go app/internal/ui/profileview.go app/internal/ui/listview.go app/internal/ui/helpers.go
git commit -m "refactor(ui): new app shell with sidebar + drawer overlay; legacy views disabled"
```

---

## Task 16: Sidebar — profiles section + filters section + footer

**Files:**
- Modify: `app/internal/ui/app.go` (`rebuildSidebar` body)
- Create: `app/internal/ui/profilemenu.go`

- [ ] **Step 1: Implement profile-row popup helper**

Create `app/internal/ui/profilemenu.go`:

```go
package ui

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/widget"
)

// showProfileRowMenu opens a context menu at the given position with Rename / Duplicate / Delete actions.
// Anchor is the canvas object the menu attaches to.
func showProfileRowMenu(c *AppController, profileName string, anchor fyne.CanvasObject) {
	menu := fyne.NewMenu("",
		fyne.NewMenuItem("Rename", func() {
			ShowProfileFormModal(c, ProfileModalModeEdit, profileName)
		}),
		fyne.NewMenuItem("Duplicate", func() {
			ShowProfileFormModal(c, ProfileModalModeDuplicate, profileName)
		}),
		fyne.NewMenuItem("Delete", func() {
			confirmDeleteProfile(c, profileName)
		}),
	)
	popup := widget.NewPopUpMenu(menu, c.Window.Canvas())
	popup.ShowAtRelativePosition(fyne.NewPos(0, 24), anchor)
}
```

> `ShowProfileFormModal` and `confirmDeleteProfile` land in Task 21. For now the import works because Go resolves symbols at link time and they're in the same package.

- [ ] **Step 2: Implement `rebuildSidebar`**

Edit `app/internal/ui/app.go`. Replace the stub `rebuildSidebar` with:

```go
func (c *AppController) rebuildSidebar() {
	// Profiles section.
	profileNames := profile.ListProfiles(c.ProfileIndex)
	var profileItems []fyne.CanvasObject
	for _, name := range profileNames {
		pName := name
		count := profile.CountVariables(pName)
		active := pName == c.ProfileIndex.Active

		item := components.NewSidebarItem(pName, &count, active, func() {
			if pName == c.ProfileIndex.Active {
				return
			}
			if err := c.SwitchProfile(pName); err != nil {
				dialog.ShowError(err, c.Window)
				return
			}
		})

		// Hover row reveals a "..." popup. Phase 1 uses a permanent ⋯ button on the right for simplicity.
		menuBtn := components.NewIconButton(icons.MoreHorizontal, "Profile actions", components.IconVariantNeutral, nil)
		menuBtn.OnTapped = func() {
			showProfileRowMenu(c, pName, menuBtn)
		}
		row := container.NewBorder(nil, nil, nil, menuBtn, item)
		profileItems = append(profileItems, row)
	}

	profilesSection := components.SidebarSection{
		Title: "PROFILES",
		Items: profileItems,
		OnAdd: func() {
			ShowProfileFormModal(c, ProfileModalModeNew, "")
		},
	}

	// Filters section.
	all := len(c.Storage.Variables)
	counts := map[string]int{"string": 0, "path": 0, "url": 0, "secret": 0}
	for _, v := range c.Storage.Variables {
		counts[v.Type]++
	}

	filtersData := []struct {
		Label string
		Key   string
		Count int
	}{
		{"All", "", all},
		{"String", "string", counts["string"]},
		{"Path", "path", counts["path"]},
		{"URL", "url", counts["url"]},
		{"Secret", "secret", counts["secret"]},
	}

	var filterItems []fyne.CanvasObject
	for _, f := range filtersData {
		fKey := f.Key
		fCount := f.Count
		active := c.activeFilter == fKey
		filterItems = append(filterItems,
			components.NewSidebarItem(f.Label, &fCount, active, func() {
				c.SetFilter(fKey)
			}),
		)
	}

	filtersSection := components.SidebarSection{
		Title: "FILTERS",
		Items: filterItems,
	}

	// Footer.
	settingsBtn := widget.NewButtonWithIcon("Settings", icons.Settings, func() {
		ShowSettingsModal(c)
	})
	settingsBtn.Alignment = widget.ButtonAlignLeading
	settingsBtn.Importance = widget.LowImportance

	aboutBtn := widget.NewButtonWithIcon("About", icons.Info, func() {
		ShowAboutModal(c)
	})
	aboutBtn.Alignment = widget.ButtonAlignLeading
	aboutBtn.Importance = widget.LowImportance

	footer := []fyne.CanvasObject{settingsBtn, aboutBtn}

	c.sidebar = components.NewSidebar(
		[]components.SidebarSection{profilesSection, filtersSection},
		footer,
	)
}
```

Top of `app.go`, ensure imports include `app/internal/ui/icons`.

> Forward references to `ShowProfileFormModal`, `confirmDeleteProfile`, `ShowSettingsModal`, `ShowAboutModal`, `ProfileModalModeNew/Edit/Duplicate`: stub them all with empty bodies in `app.go` so the build is green until their real implementations land:

Add to bottom of `app.go`:

```go
// --- Forward stubs (real implementations land in later tasks) ---

type ProfileModalMode int

const (
	ProfileModalModeNew ProfileModalMode = iota
	ProfileModalModeEdit
	ProfileModalModeDuplicate
	ProfileModalModeImport
)

func ShowProfileFormModal(*AppController, ProfileModalMode, string) {}
func confirmDeleteProfile(*AppController, string)                    {}
func ShowSettingsModal(*AppController)                               {}
func ShowAboutModal(*AppController)                                  {}
```

- [ ] **Step 3: Build and run; verify sidebar shows profiles + filters + footer**

```bash
cd app && go build ./... && go run .
```

Expected: sidebar shows the default profile with count 0 (or whatever's stored), filter chips with counts, Settings and About buttons in the footer. Filter clicks update activeFilter but the main pane is still the placeholder.

- [ ] **Step 4: Commit**

```bash
git add app/internal/ui/app.go app/internal/ui/profilemenu.go
git commit -m "feat(ui): sidebar with profiles, filters, footer"
```

---

## Task 17: List view rebuild — search input, cards, filter integration

**Files:**
- Create: `app/internal/ui/listview.go` (replaces the stubbed legacy file)
- Modify: `app/internal/ui/app.go` (`renderList` body, replace stub)

- [ ] **Step 1: Replace the stubbed `listview.go`**

Replace the contents of `app/internal/ui/listview.go` with:

```go
package ui

import (
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"app/internal/storage"
	"app/internal/ui/components"
	"app/internal/ui/icons"
)

// buildListView builds the main pane content: search header + variable cards.
// Returns the root canvas object that should be placed in c.mainPane.
func (c *AppController) buildListView() fyne.CanvasObject {
	searchEntry := widget.NewEntry()
	searchEntry.SetPlaceHolder("Search variables")
	searchEntry.SetIcon(icons.Search)

	newBtn := widget.NewButtonWithIcon("New", icons.Plus, func() {
		ShowEditDrawer(c, "")
	})
	newBtn.Importance = widget.HighImportance

	header := container.NewBorder(nil, nil, nil, newBtn, searchEntry)

	listContainer := container.NewVBox()

	render := func() {
		listContainer.Objects = nil
		query := strings.ToLower(searchEntry.Text)
		matched := c.filteredKeys(query)

		if len(matched) == 0 {
			emptyLabel := widget.NewLabel(c.emptyStateMessage(query))
			emptyLabel.Alignment = fyne.TextAlignCenter
			emptyLabel.Importance = widget.LowImportance
			listContainer.Add(layout.NewSpacer())
			listContainer.Add(emptyLabel)
			listContainer.Add(layout.NewSpacer())
			listContainer.Refresh()
			return
		}

		for _, name := range matched {
			n := name
			v, _ := c.Storage.GetVariable(n)
			card := components.NewCardRow(
				components.CardRowData{
					Name:        n,
					Value:       v.Value,
					Type:        v.Type,
					Description: v.Description,
				},
				components.CardRowActions{
					OnCopy:      func() { c.Window.Clipboard().SetContent(v.Value) },
					OnEdit:      func() { ShowEditDrawer(c, n) },
					OnDuplicate: func() { c.DuplicateVariable(n) },
					OnDelete:    func() { c.confirmDeleteVariable(n) },
				},
			)
			listContainer.Add(card)
		}
		listContainer.Refresh()
	}

	searchEntry.OnChanged = func(string) { render() }

	render()

	scroll := container.NewVScroll(container.NewPadded(listContainer))

	return container.NewBorder(container.NewPadded(header), nil, nil, nil, scroll)
}

// filteredKeys returns sorted variable names matching the search query and active filter.
func (c *AppController) filteredKeys(query string) []string {
	keys := c.Storage.GetSortedKeys()
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		v, _ := c.Storage.GetVariable(k)
		if c.activeFilter != "" && v.Type != c.activeFilter {
			continue
		}
		if query != "" {
			hay := strings.ToLower(k + " " + v.Value + " " + v.Description + " " + v.Type)
			if !strings.Contains(hay, query) {
				continue
			}
		}
		out = append(out, k)
	}
	return out
}

func (c *AppController) emptyStateMessage(query string) string {
	switch {
	case query != "" && c.activeFilter != "":
		return "No " + c.activeFilter + " variables match '" + query + "'."
	case query != "":
		return "No variables match '" + query + "'."
	case c.activeFilter != "":
		return "No " + c.activeFilter + " variables yet."
	case len(c.Storage.Variables) == 0:
		return "No variables yet. Click '+ New' to add your first variable."
	default:
		return "No variables to show."
	}
}

// confirmDeleteVariable opens the redesigned delete confirmation modal.
func (c *AppController) confirmDeleteVariable(name string) {
	components.ShowDeleteConfirm(components.DeleteConfirmOptions{
		TargetName: name,
		BodyText:   "This variable will be removed from the " + c.ProfileIndex.Active + " profile. Scripts that reference it will fail until it's recreated.",
		OnConfirm: func() {
			if err := c.DeleteVariable(name); err != nil {
				c.Window.Canvas().Refresh(widget.NewLabel("delete failed: " + err.Error()))
				return
			}
			c.rebuildSidebar()
			c.renderList()
		},
		Parent: c.Window,
	})
}

// _ silences unused import; storage is referenced via c.Storage type.
var _ = storage.Variable{}
```

> The `widget.Entry.SetIcon` call is a Fyne 2.5+ API for the leading icon inside an entry. If the API isn't present (older Fyne minor than expected), drop the line — the entry renders without the icon. The placeholder text alone communicates the field's purpose.

- [ ] **Step 2: Replace the `renderList` stub**

In `app/internal/ui/app.go`, replace the `renderList` stub with:

```go
func (c *AppController) renderList() {
	c.mainPane.Objects = []fyne.CanvasObject{c.buildListView()}
	c.mainPane.Refresh()
}
```

Add a forward stub for `ShowEditDrawer` (real implementation in Task 18):

```go
func ShowEditDrawer(*AppController, string) {}
```

- [ ] **Step 3: Build and run; verify the list renders**

```bash
cd app && go build ./... && go run .
```

Expected: sidebar on left, search box + New button at top of main pane, variable cards below in your existing dataset. Hovering a card reveals action icons (icons may render with default tint until Task 14's note resolves). Filtering by type from the sidebar updates which cards show. Search filters too.

If `SetIcon` isn't available, remove the line and reuild.

- [ ] **Step 4: Commit**

```bash
git add app/internal/ui/listview.go app/internal/ui/app.go
git commit -m "feat(ui): list view rebuild with cards, search, and type filter"
```

---

## Task 18: Edit / New variable drawer

**Files:**
- Create: `app/internal/ui/editdrawer.go`
- Modify: `app/internal/ui/app.go` (replace the `ShowEditDrawer` stub)

- [ ] **Step 1: Implement the edit drawer**

Create `app/internal/ui/editdrawer.go`:

```go
package ui

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
	"github.com/ncruces/zenity"

	"app/internal/storage"
	"app/internal/ui/components"
	"app/internal/ui/icons"
)

// ShowEditDrawer opens the edit drawer. If editingName is empty, treats as New Variable.
func ShowEditDrawer(c *AppController, editingName string) {
	isEditing := editingName != ""
	title := "New variable"
	if isEditing {
		title = "Edit variable"
	}

	var prefill storage.Variable
	if isEditing {
		prefill, _ = c.Storage.GetVariable(editingName)
	} else {
		prefill = storage.Variable{Type: "string"}
	}

	nameEntry := widget.NewEntry()
	nameEntry.SetPlaceHolder("VARIABLE_NAME")
	nameEntry.SetText(editingName)

	typeRadio := widget.NewRadioGroup([]string{"String", "Path", "URL", "Secret"}, nil)
	typeRadio.Horizontal = true
	typeRadio.SetSelected(typeToLabel(prefill.Type))

	valueEntry := widget.NewEntry()
	valueEntry.SetPlaceHolder("Variable value")
	valueEntry.SetText(prefill.Value)

	secretEntry := widget.NewPasswordEntry()
	secretEntry.SetPlaceHolder("Secret value")
	secretEntry.SetText(prefill.Value)

	browseBtn := widget.NewButtonWithIcon("Folder…", icons.FolderOpen, func() {
		path, err := zenity.SelectFile(zenity.Title("Select folder"), zenity.Directory())
		if err == nil {
			valueEntry.SetText(path)
		}
	})

	valueContainer := container.NewStack(valueEntry)
	browseContainer := container.NewHBox(browseBtn)
	browseContainer.Hide()

	descEntry := widget.NewEntry()
	descEntry.SetPlaceHolder("Optional description")
	descEntry.SetText(prefill.Description)

	nameField := components.NewFieldRow("Name", nameEntry, nil)
	valueField := components.NewFieldRow("Value", valueEntry, nil)
	descField := components.NewFieldRow("Description", descEntry, nil)

	applyType := func(label string) {
		t := labelToType(label)
		switch t {
		case "path":
			valueContainer.Objects = []fyne.CanvasObject{valueEntry}
			browseContainer.Show()
		case "secret":
			valueContainer.Objects = []fyne.CanvasObject{secretEntry}
			browseContainer.Hide()
		default:
			valueContainer.Objects = []fyne.CanvasObject{valueEntry}
			browseContainer.Hide()
		}
		valueContainer.Refresh()
	}

	typeRadio.OnChanged = func(label string) { applyType(label) }
	applyType(typeRadio.Selected)

	form := container.NewVBox(
		nameField.Object(),
		widget.NewSeparator(),
		fieldLabel("Type"),
		typeRadio,
		widget.NewSeparator(),
		fieldLabel("Value"),
		valueContainer,
		browseContainer,
		widget.NewSeparator(),
		descField.Object(),
	)

	cancelBtn := widget.NewButton("Cancel", func() { c.CloseDrawer() })

	saveBtn := components.NewInlineStateButton("Save", "Saved", "Save failed", nil)
	saveBtn.Button.OnTapped = func() {
		saveBtn.SetState(components.StateBusy)

		name := nameEntry.Text
		varType := labelToType(typeRadio.Selected)
		var value string
		if varType == "secret" {
			value = secretEntry.Text
		} else {
			value = valueEntry.Text
		}

		oldName := ""
		if isEditing {
			oldName = editingName
		}

		if err := c.SaveVariable(oldName, name, value, varType, descEntry.Text); err != nil {
			saveBtn.SetState(components.StateError)
			dialog.ShowError(err, c.Window) // Phase 2 replaces this with inline validation
			return
		}

		saveBtn.SetState(components.StateDone)
		c.rebuildSidebar()
		c.renderList()
		// Brief delay so the user sees the "Saved" state before drawer closes.
		// Phase 2 cleans this up via the InlineStateButton's done-hold callback.
		c.CloseDrawer()
	}

	footer := container.NewBorder(nil, nil, cancelBtn, saveBtn.Button)

	body := container.NewBorder(nil, footer, nil, nil, container.NewVScroll(container.NewPadded(form)))

	c.OpenDrawer(title, body, nil)
}

func fieldLabel(text string) fyne.CanvasObject {
	l := widget.NewLabel(text)
	l.TextStyle = fyne.TextStyle{Bold: true}
	return l
}

func typeToLabel(t string) string {
	switch t {
	case "path":
		return "Path"
	case "url":
		return "URL"
	case "secret":
		return "Secret"
	default:
		return "String"
	}
}

func labelToType(l string) string {
	switch l {
	case "Path":
		return "path"
	case "URL":
		return "url"
	case "Secret":
		return "secret"
	default:
		return "string"
	}
}
```

- [ ] **Step 2: Delete the stub `ShowEditDrawer` from app.go**

In `app/internal/ui/app.go`, remove:

```go
func ShowEditDrawer(*AppController, string) {}
```

The real one in `editdrawer.go` takes over.

- [ ] **Step 3: Build, run, and exercise the edit drawer**

```bash
cd app && go build ./... && go run .
```

Manual checks:
1. Click `+ New` → drawer opens with "New variable" title and empty fields.
2. Type a name and value, click Save → drawer closes, list shows the new row, sidebar count increments.
3. Click a card's pencil icon → drawer opens with prefilled fields.
4. Edit and save → list reflects the change.
5. Click Cancel or press Esc → drawer closes without saving.
6. Switch type to Path → Browse button appears.
7. Switch to Secret → password entry shows.

- [ ] **Step 4: Commit**

```bash
git add app/internal/ui/editdrawer.go app/internal/ui/app.go
git commit -m "feat(ui): edit/new variable drawer using FieldRow + InlineStateButton"
```

---

## Task 19: Import drawer

**Files:**
- Create: `app/internal/ui/importdrawer.go`
- Modify: `app/internal/ui/listview.go` (wire the Import button)

- [ ] **Step 1: Implement the import drawer**

Create `app/internal/ui/importdrawer.go`:

```go
package ui

import (
	"fmt"
	"path/filepath"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
	"github.com/ncruces/zenity"

	appStorage "app/internal/storage"
	"app/internal/ui/components"
	"app/internal/ui/icons"
	"app/internal/ui/tokens"
)

// ShowImportDrawer opens the import drawer. Drop handler is wired on open and cleared on close.
func ShowImportDrawer(c *AppController) {
	fileLabel := canvas.NewText("No file selected", tokens.TextMuted)
	fileLabel.TextSize = 13

	var loaded map[string]appStorage.Variable
	checkboxes := make(map[string]*widget.Check)
	valueEntries := make(map[string]*widget.Entry)

	listBox := container.NewVBox()
	scrollableList := container.NewVScroll(listBox)

	emptyHint := widget.NewLabel("Select a JSON template to preview its contents.")
	emptyHint.Alignment = fyne.TextAlignCenter
	emptyHint.Importance = widget.LowImportance

	contentArea := container.NewStack(emptyHint)

	importBtn := components.NewInlineStateButton("Import 0 selected", "Imported", "Import failed", nil)
	importBtn.Button.Disable()

	updateImportLabel := func() {
		n := 0
		for _, cb := range checkboxes {
			if cb.Checked {
				n++
			}
		}
		importBtn.Button.SetText(fmt.Sprintf("Import %d selected", n))
		if n == 0 {
			importBtn.Button.Disable()
		} else {
			importBtn.Button.Enable()
		}
		importBtn.Button.Refresh()
	}

	buildList := func() {
		listBox.Objects = nil
		checkboxes = make(map[string]*widget.Check)
		valueEntries = make(map[string]*widget.Entry)

		for name, v := range loaded {
			n := name
			vv := v
			cb := widget.NewCheck(n, func(bool) { updateImportLabel() })
			cb.SetChecked(true)
			checkboxes[n] = cb

			ve := widget.NewEntry()
			ve.SetText(vv.Value)
			valueEntries[n] = ve

			warn := ""
			if _, exists := c.Storage.GetVariable(n); exists {
				warn = "exists — will overwrite"
			}

			row := container.NewVBox(
				container.NewHBox(cb, widget.NewLabel("["+vv.Type+"]"), warningText(warn)),
				ve,
				lowLabel(vv.Description),
			)
			listBox.Add(row)
		}
		listBox.Refresh()
		updateImportLabel()
		contentArea.Objects = []fyne.CanvasObject{scrollableList}
		contentArea.Refresh()
	}

	loadFile := func(path string) {
		vars, err := appStorage.LoadExternalFile(path)
		if err != nil {
			dialog.ShowError(err, c.Window)
			return
		}
		if len(vars) == 0 {
			dialog.ShowInformation("Empty file", "No variables found in the selected file.", c.Window)
			return
		}
		loaded = vars
		fileLabel.Text = fmt.Sprintf("%s — %d variables", filepath.Base(path), len(vars))
		fileLabel.Color = tokens.TextPrimary
		fileLabel.Refresh()
		buildList()
	}

	browseBtn := widget.NewButtonWithIcon("Choose file…", icons.FolderOpen, func() {
		path, err := zenity.SelectFile(
			zenity.Title("Select JSON template"),
			zenity.FileFilters{{Name: "JSON files", Patterns: []string{"*.json"}}},
		)
		if err == nil {
			loadFile(path)
		}
	})

	selectAllBtn := widget.NewButton("Select all", func() {
		for _, cb := range checkboxes {
			cb.SetChecked(true)
		}
	})
	deselectAllBtn := widget.NewButton("Deselect all", func() {
		for _, cb := range checkboxes {
			cb.SetChecked(false)
		}
	})

	cancelBtn := widget.NewButton("Cancel", func() { c.CloseDrawer() })

	importBtn.Button.OnTapped = func() {
		selected := make(map[string]appStorage.Variable)
		for name, cb := range checkboxes {
			if !cb.Checked {
				continue
			}
			v := loaded[name]
			if entry, ok := valueEntries[name]; ok {
				v.Value = entry.Text
			}
			selected[name] = v
		}
		importBtn.SetState(components.StateBusy)
		_, err := c.Storage.ImportSelectedVariables(selected)
		if err != nil {
			importBtn.SetState(components.StateError)
			dialog.ShowError(err, c.Window)
			return
		}
		importBtn.SetState(components.StateDone)
		c.rebuildSidebar()
		c.renderList()
		c.CloseDrawer()
	}

	header := container.NewVBox(
		container.NewBorder(nil, nil, browseBtn, nil, fileLabel),
		container.NewHBox(selectAllBtn, deselectAllBtn),
	)

	footer := container.NewBorder(nil, nil, cancelBtn, importBtn.Button)

	body := container.NewBorder(header, footer, nil, nil, contentArea)

	// Wire the drop handler ONLY while this drawer is open.
	// On drawer close (see the OpenDrawer onClose callback below), we clear it.
	c.Window.SetOnDropped(func(_ fyne.Position, uris []fyne.URI) {
		for _, u := range uris {
			if strings.HasSuffix(strings.ToLower(u.Path()), ".json") {
				loadFile(u.Path())
				return
			}
		}
		dialog.ShowInformation("Invalid file", "Please drop a .json file.", c.Window)
	})

	c.OpenDrawer("Import variables", body, func() {
		c.Window.SetOnDropped(nil)
	})
}

func warningText(s string) fyne.CanvasObject {
	if s == "" {
		return widget.NewLabel("")
	}
	t := canvas.NewText("⚠ "+s, tokens.Warning)
	t.TextSize = 11
	return t
}

func lowLabel(s string) fyne.CanvasObject {
	l := widget.NewLabel(s)
	l.Wrapping = fyne.TextWrapWord
	l.Importance = widget.LowImportance
	return l
}
```

- [ ] **Step 2: Wire the Import button in the list view**

Edit `app/internal/ui/listview.go`. Find the `header := container.NewBorder(...)` line and replace it with:

```go
	importBtn := widget.NewButtonWithIcon("Import", icons.Download, func() {
		ShowImportDrawer(c)
	})
	exportBtn := widget.NewButtonWithIcon("Export", icons.Upload, func() {
		ShowExportDrawer(c)
	})

	rightSide := container.NewHBox(importBtn, exportBtn, newBtn)
	header := container.NewBorder(nil, nil, nil, rightSide, searchEntry)
```

Add a stub for `ShowExportDrawer` in `app.go` for now:

```go
func ShowExportDrawer(*AppController) {}
```

- [ ] **Step 3: Build and exercise**

```bash
cd app && go build ./... && go run .
```

Manual checks:
1. Click Import → drawer opens with placeholder.
2. Click `Choose file…` → Zenity dialog → pick a JSON template → cards render.
3. Toggle checkboxes; the Import button label updates to "Import N selected."
4. Click Import → cards merge into the list; sidebar count updates.
5. Drag a .json file onto the window while drawer is open → loads.
6. Close drawer → drag a file in → nothing happens (drop handler cleared).

- [ ] **Step 4: Commit**

```bash
git add app/internal/ui/importdrawer.go app/internal/ui/listview.go app/internal/ui/app.go
git commit -m "feat(ui): import drawer with scoped drop handler"
```

---

## Task 20: Export drawer

**Files:**
- Create: `app/internal/ui/exportdrawer.go`
- Modify: `app/internal/ui/app.go` (remove the `ShowExportDrawer` stub)

- [ ] **Step 1: Implement the export drawer**

Create `app/internal/ui/exportdrawer.go`:

```go
package ui

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
	"github.com/ncruces/zenity"

	appStorage "app/internal/storage"
	"app/internal/ui/components"
	"app/internal/ui/tokens"
)

// ShowExportDrawer opens the export drawer.
// Note: secret-warning is shown for .env only in Phase 1.
// Phase 2 extends the warning to JSON export.
func ShowExportDrawer(c *AppController) {
	keys := c.Storage.GetSortedKeys()
	if len(keys) == 0 {
		dialog.ShowInformation("Nothing to export", "Add some variables first.", c.Window)
		return
	}

	checks := make(map[string]*widget.Check)
	listBox := container.NewVBox()

	hasSecrets := false
	for _, name := range keys {
		n := name
		v, _ := c.Storage.GetVariable(n)
		if v.Type == "secret" {
			hasSecrets = true
		}
		cb := widget.NewCheck(fmt.Sprintf("%s  [%s]", n, v.Type), nil)
		cb.SetChecked(true)
		checks[n] = cb
		listBox.Add(cb)
	}

	getSelected := func() map[string]appStorage.Variable {
		out := make(map[string]appStorage.Variable)
		for name, cb := range checks {
			if !cb.Checked {
				continue
			}
			if v, ok := c.Storage.GetVariable(name); ok {
				out[name] = v
			}
		}
		return out
	}

	selectAll := widget.NewButton("Select all", func() {
		for _, cb := range checks {
			cb.SetChecked(true)
		}
	})
	deselectAll := widget.NewButton("Deselect all", func() {
		for _, cb := range checks {
			cb.SetChecked(false)
		}
	})

	var secretWarn fyne.CanvasObject = widget.NewLabel("")
	if hasSecrets {
		w := canvas.NewText("⚠ Some variables are secrets — .env export will include their plain text values.", tokens.Warning)
		w.TextSize = 12
		secretWarn = w
	}

	doExport := func(format string, btn *components.InlineStateButton, saver func(map[string]appStorage.Variable, string) error, fileName, ext string) {
		selected := getSelected()
		if len(selected) == 0 {
			dialog.ShowInformation("Nothing selected", "Select at least one variable to export.", c.Window)
			return
		}
		btn.SetState(components.StateBusy)
		path, err := zenity.SelectFileSave(
			zenity.Title("Export as "+format),
			zenity.ConfirmOverwrite(),
			zenity.Filename(fileName),
			zenity.FileFilters{{Name: format + " files", Patterns: []string{"*." + ext}}},
		)
		if err != nil {
			btn.SetState(components.StateIdle)
			return
		}
		if err := saver(selected, path); err != nil {
			btn.SetState(components.StateError)
			dialog.ShowError(err, c.Window)
			return
		}
		btn.SetState(components.StateDone)
	}

	jsonBtn := components.NewInlineStateButton("Export as JSON", "Exported", "Export failed", nil)
	jsonBtn.Button.OnTapped = func() {
		doExport("JSON", jsonBtn, appStorage.ExportToJSON, "hedgebuddy-export.json", "json")
	}

	envBtn := components.NewInlineStateButton("Export as .env", "Exported", "Export failed", nil)
	envBtn.Button.OnTapped = func() {
		doExport(".env", envBtn, appStorage.ExportToEnv, ".env", "env")
	}

	cancelBtn := widget.NewButton("Cancel", func() { c.CloseDrawer() })

	header := container.NewVBox(
		widget.NewLabel("Select variables to export:"),
		container.NewHBox(selectAll, deselectAll),
		secretWarn,
	)

	footer := container.NewBorder(nil, nil, cancelBtn, container.NewHBox(envBtn.Button, jsonBtn.Button))

	body := container.NewBorder(header, footer, nil, nil, container.NewVScroll(listBox))

	c.OpenDrawer("Export variables", body, nil)
}
```

- [ ] **Step 2: Remove the stub in app.go**

In `app/internal/ui/app.go`, delete:

```go
func ShowExportDrawer(*AppController) {}
```

- [ ] **Step 3: Build and exercise**

```bash
cd app && go build ./... && go run .
```

Manual:
1. Click Export → drawer opens with checkboxes for every variable.
2. If any variable is a secret, the yellow warning strip shows.
3. Click Export as JSON → Zenity save dialog → save path → button morphs done.
4. Click Export as .env → same flow.
5. Cancel returns to list.

- [ ] **Step 4: Commit**

```bash
git add app/internal/ui/exportdrawer.go app/internal/ui/app.go
git commit -m "feat(ui): export drawer with JSON + .env, .env secret warning"
```

---

## Task 21: Profile management modal (unified)

**Files:**
- Create: `app/internal/ui/profilemodal.go`
- Modify: `app/internal/ui/app.go` (remove forward stubs)

- [ ] **Step 1: Implement the unified profile modal**

Create `app/internal/ui/profilemodal.go`:

```go
package ui

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"
	"github.com/ncruces/zenity"

	"app/internal/profile"
	"app/internal/ui/components"
)

// ShowProfileFormModal opens the unified profile create/edit/duplicate/import modal.
// `target` is empty for New, or the profile name for other modes.
func ShowProfileFormModal(c *AppController, mode ProfileModalMode, target string) {
	switch mode {
	case ProfileModalModeNew:
		showNewOrDuplicate(c, "", false)
	case ProfileModalModeEdit:
		showEdit(c, target)
	case ProfileModalModeDuplicate:
		showNewOrDuplicate(c, target, true)
	case ProfileModalModeImport:
		showImportAsProfile(c)
	}
}

func showNewOrDuplicate(c *AppController, source string, isDuplicate bool) {
	title := "New profile"
	confirmLabel := "Create"
	if isDuplicate {
		title = "Duplicate profile"
		confirmLabel = "Duplicate"
	}

	nameEntry := widget.NewEntry()
	nameEntry.SetPlaceHolder("Profile name (e.g. client-alpha)")
	if isDuplicate {
		nameEntry.SetText(source + "-copy")
	}

	descEntry := widget.NewEntry()
	descEntry.SetPlaceHolder("Description (optional)")

	form := container.NewVBox(
		widget.NewLabel("Name"),
		nameEntry,
		widget.NewLabel("Description"),
		descEntry,
	)

	cancelBtn := widget.NewButton("Cancel", nil)
	confirmBtn := widget.NewButton(confirmLabel, nil)
	confirmBtn.Importance = widget.HighImportance

	d := components.ShowCustomModal(c.Window, title, form, []fyne.CanvasObject{
		layout.NewSpacer(), cancelBtn, confirmBtn,
	})

	cancelBtn.OnTapped = func() { d.Hide() }

	confirmBtn.OnTapped = func() {
		name := nameEntry.Text
		if name == "" {
			dialog.ShowError(fmt.Errorf("profile name is required"), c.Window)
			return
		}
		var err error
		if isDuplicate {
			err = profile.DuplicateProfile(c.ProfileIndex, source, name)
		} else {
			err = profile.CreateProfile(c.ProfileIndex, name, descEntry.Text)
		}
		if err != nil {
			dialog.ShowError(err, c.Window)
			return
		}
		d.Hide()
		c.rebuildSidebar()
		c.renderList()
	}

	c.Window.Canvas().Focus(nameEntry)
}

func showEdit(c *AppController, name string) {
	meta := c.ProfileIndex.Profiles[name]

	descEntry := widget.NewEntry()
	descEntry.SetText(meta.Description)

	var nameEntry *widget.Entry
	var formItems []fyne.CanvasObject
	if name != "default" {
		nameEntry = widget.NewEntry()
		nameEntry.SetText(name)
		formItems = []fyne.CanvasObject{
			widget.NewLabel("Name"),
			nameEntry,
			widget.NewLabel("Description"),
			descEntry,
		}
	} else {
		hint := widget.NewLabel("The default profile cannot be renamed.")
		hint.Importance = widget.LowImportance
		formItems = []fyne.CanvasObject{
			hint,
			widget.NewLabel("Description"),
			descEntry,
		}
	}
	form := container.NewVBox(formItems...)

	cancelBtn := widget.NewButton("Cancel", nil)
	saveBtn := widget.NewButton("Save", nil)
	saveBtn.Importance = widget.HighImportance

	d := components.ShowCustomModal(c.Window, "Edit profile", form, []fyne.CanvasObject{
		layout.NewSpacer(), cancelBtn, saveBtn,
	})

	cancelBtn.OnTapped = func() { d.Hide() }
	saveBtn.OnTapped = func() {
		if err := profile.UpdateDescription(c.ProfileIndex, name, descEntry.Text); err != nil {
			dialog.ShowError(err, c.Window)
			return
		}
		if nameEntry != nil && nameEntry.Text != name {
			if err := profile.RenameProfile(c.ProfileIndex, name, nameEntry.Text); err != nil {
				dialog.ShowError(err, c.Window)
				return
			}
			c.updateWindowTitle()
		}
		d.Hide()
		c.rebuildSidebar()
		c.renderList()
	}
}

func showImportAsProfile(c *AppController) {
	path, err := zenity.SelectFile(
		zenity.Title("Select JSON template for new profile"),
		zenity.FileFilters{{Name: "JSON files", Patterns: []string{"*.json"}}},
	)
	if err != nil {
		return
	}

	nameEntry := widget.NewEntry()
	nameEntry.SetPlaceHolder("Profile name (e.g. client-beta)")
	descEntry := widget.NewEntry()
	descEntry.SetPlaceHolder("Description (optional)")

	pathLabel := widget.NewLabel("Importing from: " + path)
	pathLabel.Importance = widget.LowImportance

	form := container.NewVBox(
		pathLabel,
		widget.NewLabel("Profile name"),
		nameEntry,
		widget.NewLabel("Description"),
		descEntry,
	)

	cancelBtn := widget.NewButton("Cancel", nil)
	importBtn := widget.NewButton("Import", nil)
	importBtn.Importance = widget.HighImportance

	d := components.ShowCustomModal(c.Window, "Import as profile", form, []fyne.CanvasObject{
		layout.NewSpacer(), cancelBtn, importBtn,
	})

	cancelBtn.OnTapped = func() { d.Hide() }
	importBtn.OnTapped = func() {
		name := nameEntry.Text
		if name == "" {
			dialog.ShowError(fmt.Errorf("profile name is required"), c.Window)
			return
		}
		if err := profile.ImportAsProfile(c.ProfileIndex, name, descEntry.Text, path); err != nil {
			dialog.ShowError(err, c.Window)
			return
		}
		d.Hide()
		c.rebuildSidebar()
		c.renderList()
	}
}

// confirmDeleteProfile shows the redesigned delete-confirm modal for a profile.
func confirmDeleteProfile(c *AppController, name string) {
	if name == "default" {
		dialog.ShowInformation("Cannot delete", "The default profile cannot be deleted.", c.Window)
		return
	}
	if name == c.ProfileIndex.Active {
		dialog.ShowInformation("Cannot delete", "Switch to another profile before deleting this one.", c.Window)
		return
	}
	components.ShowDeleteConfirm(components.DeleteConfirmOptions{
		TargetName: name,
		BodyText:   "This will permanently delete the profile and all variables it contains.",
		OnConfirm: func() {
			if err := profile.DeleteProfile(c.ProfileIndex, name); err != nil {
				dialog.ShowError(err, c.Window)
				return
			}
			c.rebuildSidebar()
			c.renderList()
		},
		Parent: c.Window,
	})
}
```

- [ ] **Step 2: Remove the forward stubs from app.go**

In `app/internal/ui/app.go`, remove the two empty stub bodies:

```go
func ShowProfileFormModal(*AppController, ProfileModalMode, string) {}
func confirmDeleteProfile(*AppController, string)                    {}
```

Keep the `ProfileModalMode` type definition — it's now used by the real implementations.

- [ ] **Step 3: Build and exercise**

```bash
cd app && go build ./... && go run .
```

Manual:
1. Click the `+` in PROFILES section → New profile modal → create → row appears in sidebar.
2. Click a profile's `⋯` → Rename → edits the name.
3. `⋯` → Duplicate → creates a copy.
4. `⋯` → Delete on a non-default, non-active profile → redesigned confirm modal → confirms.
5. Try Delete on `default` → "Cannot delete" info dialog.

- [ ] **Step 4: Commit**

```bash
git add app/internal/ui/profilemodal.go app/internal/ui/app.go
git commit -m "feat(ui): unified profile modal (new/edit/duplicate/import/delete)"
```

---

## Task 22: Settings modal

**Files:**
- Create: `app/internal/ui/settingsmodal.go`
- Modify: `app/internal/ui/app.go` (remove the `ShowSettingsModal` stub)

- [ ] **Step 1: Implement Settings modal**

Create `app/internal/ui/settingsmodal.go`:

```go
package ui

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"app/internal/prefs"
	"app/internal/storage"
	"app/internal/ui/components"
	"app/internal/ui/icons"
)

// ShowSettingsModal opens the Settings centered modal.
func ShowSettingsModal(c *AppController) {
	pathStr := ""
	if p, err := storage.GetStoragePath(); err == nil {
		pathStr = p
	}
	pathLabel := widget.NewLabel(pathStr)
	pathLabel.Wrapping = fyne.TextWrapWord

	revealBtn := widget.NewButtonWithIcon("Reveal in Finder/Explorer", icons.ExternalLink, func() {
		c.OpenStorageFolder()
	})

	resetPyBtn := widget.NewButton("Reset 'Don't ask again' for Python prompt", func() {
		p, _ := prefs.Load()
		p.PythonCheckDismissed = false
		_ = prefs.Save(p)
		dialog.ShowInformation("Reset", "The Python prompt will reappear on next startup.", c.Window)
	})

	storageSection := container.NewVBox(
		boldLabel("Storage"),
		pathLabel,
		revealBtn,
	)

	pythonSection := container.NewVBox(
		boldLabel("Python prompt"),
		resetPyBtn,
	)

	body := container.NewVBox(
		storageSection,
		widget.NewSeparator(),
		pythonSection,
	)

	closeBtn := widget.NewButton("Close", nil)
	d := components.ShowCustomModal(c.Window, "Settings", body, []fyne.CanvasObject{
		layout.NewSpacer(), closeBtn,
	})
	closeBtn.OnTapped = func() { d.Hide() }
}

func boldLabel(text string) fyne.CanvasObject {
	l := widget.NewLabel(text)
	l.TextStyle = fyne.TextStyle{Bold: true}
	return l
}
```

- [ ] **Step 2: Remove stub in app.go**

Delete:

```go
func ShowSettingsModal(*AppController) {}
```

- [ ] **Step 3: Build and verify**

```bash
cd app && go build ./... && go run .
```

Click Settings in the sidebar footer → modal appears with the storage path and the two buttons. Close.

- [ ] **Step 4: Commit**

```bash
git add app/internal/ui/settingsmodal.go app/internal/ui/app.go
git commit -m "feat(ui): Settings modal (storage path + Python prompt reset)"
```

---

## Task 23: About modal

**Files:**
- Create: `app/internal/ui/aboutmodal.go`
- Modify: `app/internal/ui/app.go` (remove the `ShowAboutModal` stub)

- [ ] **Step 1: Implement About modal**

Create `app/internal/ui/aboutmodal.go`:

```go
package ui

import (
	"net/url"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/components"
	"app/internal/ui/icons"
	"app/internal/ui/tokens"
)

// ShowAboutModal opens the About centered modal.
func ShowAboutModal(c *AppController) {
	logo := canvas.NewImageFromResource(AppIcon())
	logo.FillMode = canvas.ImageFillContain
	logo.SetMinSize(fyne.NewSize(80, 80))

	title := canvas.NewText(AppName, tokens.Accent)
	title.TextSize = 24
	title.TextStyle = fyne.TextStyle{Bold: true}
	title.Alignment = fyne.TextAlignCenter

	version := canvas.NewText("v"+AppVersion, tokens.TextMuted)
	version.TextSize = 12
	version.Alignment = fyne.TextAlignCenter

	author := widget.NewLabel("Created by Shaked Lipszyc")
	author.Alignment = fyne.TextAlignCenter

	websiteBtn := widget.NewButtonWithIcon("shaked.co", icons.ExternalLink, func() {
		u, _ := url.Parse(WebsiteURL)
		_ = fyne.CurrentApp().OpenURL(u)
	})
	githubBtn := widget.NewButtonWithIcon("GitHub", icons.ExternalLink, func() {
		u, _ := url.Parse(GithubURL)
		_ = fyne.CurrentApp().OpenURL(u)
	})

	disclaimer := widget.NewLabel("Independent project. Not affiliated with Hedge (hedge.co). MIT licensed.")
	disclaimer.Wrapping = fyne.TextWrapWord
	disclaimer.Alignment = fyne.TextAlignCenter
	disclaimer.Importance = widget.LowImportance

	body := container.NewVBox(
		container.NewCenter(logo),
		title,
		version,
		widget.NewSeparator(),
		author,
		container.NewCenter(container.NewHBox(websiteBtn, githubBtn)),
		widget.NewSeparator(),
		disclaimer,
	)

	closeBtn := widget.NewButton("Close", nil)
	d := components.ShowCustomModal(c.Window, "About", body, []fyne.CanvasObject{
		layout.NewSpacer(), closeBtn,
	})
	closeBtn.OnTapped = func() { d.Hide() }
}
```

- [ ] **Step 2: Remove stub in app.go**

Delete:

```go
func ShowAboutModal(*AppController) {}
```

- [ ] **Step 3: Build and verify**

```bash
cd app && go build ./... && go run .
```

Click About → softer disclaimer, two icon links. Close.

- [ ] **Step 4: Commit**

```bash
git add app/internal/ui/aboutmodal.go app/internal/ui/app.go
git commit -m "feat(ui): About modal with softened disclaimer"
```

---

## Task 24: Microcopy & dialog cleanup — Python check + update check

**Files:**
- Modify: `app/internal/ui/pythoncheckdialog.go`
- Modify: `app/internal/ui/updatecheckdialog.go`

- [ ] **Step 1: Rewrite the Python "not found" dialog with two buttons + checkbox**

In `app/internal/ui/pythoncheckdialog.go`, replace the body of `showPythonNotFoundDialog` with:

```go
func showPythonNotFoundDialog(w fyne.Window) {
	title := canvas.NewText("Python is not installed", tokens.Danger)
	title.TextSize = 16
	title.TextStyle = fyne.TextStyle{Bold: true}

	msg := widget.NewLabel(
		"HedgeBuddy uses Python to run your scripts. We couldn't find a Python installation on this computer. " +
			"Install Python and relaunch HedgeBuddy — we'll finish setup automatically.")
	msg.Wrapping = fyne.TextWrapWord

	dontAsk := widget.NewCheck("Don't remind me again", nil)

	content := container.NewVBox(title, msg, dontAsk)

	d := dialog.NewCustomWithoutButtons("Python not found", content, w)

	notNow := widget.NewButton("Not now", func() {
		if dontAsk.Checked {
			dismissPythonCheck()
		}
		d.Hide()
	})

	downloadBtn := widget.NewButton("Download Python", func() {
		u, _ := url.Parse(pythonDownloadURL)
		_ = fyne.CurrentApp().OpenURL(u)
	})
	downloadBtn.Importance = widget.HighImportance

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), notNow, downloadBtn})
	d.Show()
}
```

Top-of-file imports: replace `"app/internal/prefs"` if unused (it's still used by `dismissPythonCheck`), and add `"app/internal/ui/tokens"`. Remove the unused `ColorAccentRed`/`ColorWarning` color references — switch to `tokens.Danger`/`tokens.Warning`.

- [ ] **Step 2: Same treatment for the library-missing dialog**

Replace `showLibraryMissingDialog` body with:

```go
func showLibraryMissingDialog(w fyne.Window, executable string) {
	title := canvas.NewText("hedgebuddy Python library not installed", tokens.Warning)
	title.TextSize = 16
	title.TextStyle = fyne.TextStyle{Bold: true}

	msg := widget.NewLabel(
		"Python is installed — great. The hedgebuddy library is required for your Python scripts to read variables " +
			"managed by this app. We can install it for you right now (no admin rights needed).")
	msg.Wrapping = fyne.TextWrapWord

	dontAsk := widget.NewCheck("Don't remind me again", nil)

	content := container.NewVBox(title, msg, dontAsk)

	d := dialog.NewCustomWithoutButtons("Library not installed", content, w)

	notNow := widget.NewButton("Not now", func() {
		if dontAsk.Checked {
			dismissPythonCheck()
		}
		d.Hide()
	})

	installBtn := widget.NewButton("Install now", func() {
		d.Hide()
		showInstallingDialog(w, executable)
	})
	installBtn.Importance = widget.HighImportance

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), notNow, installBtn})
	d.Show()
}
```

- [ ] **Step 3: Update-check dialog: two buttons + 600ms inline state before quit**

In `app/internal/ui/updatecheckdialog.go`, replace `showAppUpdateDialog` body with:

```go
func showAppUpdateDialog(w fyne.Window, latestVersion string) {
	title := canvas.NewText(
		fmt.Sprintf("HedgeBuddy v%s available", latestVersion),
		tokens.Accent,
	)
	title.TextSize = 16
	title.TextStyle = fyne.TextStyle{Bold: true}

	currentLabel := widget.NewLabel("Current: v" + AppVersion)
	currentLabel.Importance = widget.LowImportance

	msg := widget.NewLabel(
		"A new version is available. Click Install Update to download and apply.")
	msg.Wrapping = fyne.TextWrapWord

	statusLabel := canvas.NewText("", tokens.TextMuted)
	statusLabel.TextSize = 11

	content := container.NewVBox(title, currentLabel, msg, statusLabel)

	d := dialog.NewCustomWithoutButtons("Update available", content, w)

	notNow := widget.NewButton("Not now", func() { d.Hide() })

	installBtn := widget.NewButton("Install Update", nil)
	installBtn.Importance = widget.HighImportance
	installBtn.OnTapped = func() {
		statusLabel.Text = "Launching updater…"
		statusLabel.Refresh()
		installBtn.Disable()
		go func() {
			time.Sleep(600 * time.Millisecond)
			fyne.Do(func() {
				if launched := tryLaunchUpdater(latestVersion); !launched {
					_ = fyne.CurrentApp().OpenURL(urlParse(releasesURL))
					d.Hide()
				}
			})
		}()
	}

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), notNow, installBtn})
	d.Show()
}
```

Top-of-file imports need `"time"` and `"app/internal/ui/tokens"`. Remove `ColorAccentBlue`, `ColorWarning`, `ColorSuccess` references — replace with token references.

- [ ] **Step 4: Same two-button + checkbox pattern for library-update dialog**

Replace `showLibraryUpdateDialog` body with:

```go
func showLibraryUpdateDialog(w fyne.Window, executable, installed, latest string) {
	title := canvas.NewText(
		fmt.Sprintf("hedgebuddy library v%s available", latest),
		tokens.Success,
	)
	title.TextSize = 16
	title.TextStyle = fyne.TextStyle{Bold: true}

	currentLabel := widget.NewLabel("Installed: v" + installed)
	currentLabel.Importance = widget.LowImportance

	msg := widget.NewLabel("We can upgrade the Python library for you (no admin rights needed).")
	msg.Wrapping = fyne.TextWrapWord

	content := container.NewVBox(title, currentLabel, msg)

	d := dialog.NewCustomWithoutButtons("Library update", content, w)

	notNow := widget.NewButton("Not now", func() { d.Hide() })
	updateBtn := widget.NewButton("Update now", func() {
		d.Hide()
		showUpgradingDialog(w, executable)
	})
	updateBtn.Importance = widget.HighImportance

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), notNow, updateBtn})
	d.Show()
}
```

- [ ] **Step 5: Build, run, and verify**

```bash
cd app && go build ./... && go run .
```

Manual: trigger update / python dialogs (you can temporarily flip the network logic to force them, or just inspect them via grep). Each dialog now has exactly two buttons plus an inline checkbox where relevant.

- [ ] **Step 6: Commit**

```bash
git add app/internal/ui/pythoncheckdialog.go app/internal/ui/updatecheckdialog.go
git commit -m "feat(ui): redesigned Python + update dialogs with two-button + checkbox layout"
```

---

## Task 25: Microcopy — validation error messages

**Files:**
- Modify: `app/internal/validator/validator.go`

- [ ] **Step 1: Soften error messages**

Edit `app/internal/validator/validator.go`. Replace:

```go
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("URL must use http or https scheme, got: %s", u.Scheme)
	}
```

with:

```go
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("URLs must start with http:// or https://")
	}
```

Replace:

```go
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-') {
			return fmt.Errorf("variable name contains invalid character: %c (use only letters, numbers, _, -)", c)
		}
```

with:

```go
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-') {
			return fmt.Errorf("use only letters, digits, underscores, or hyphens (found %q in %q)", string(c), name)
		}
```

Replace:

```go
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return fmt.Errorf("path does not exist: %s", path)
	}
```

with:

```go
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return fmt.Errorf("can't find this path on this machine: %s", path)
	}
```

- [ ] **Step 2: Build and commit**

```bash
cd app && go build ./...
git add app/internal/validator/validator.go
git commit -m "ux: soften validator error messages"
```

---

## Task 26: Delete legacy view files

**Files:**
- Delete: `app/internal/ui/aboutview.go` (legacy stub)
- Delete: `app/internal/ui/formview.go` (legacy stub)
- Delete: `app/internal/ui/importview.go` (legacy stub)
- Delete: `app/internal/ui/exportview.go` (legacy stub)
- Delete: `app/internal/ui/profileview.go` (legacy stub)
- Delete: `app/internal/ui/helpers.go` (legacy stub)
- Modify: `app/internal/ui/theme.go` (drop the deprecated `Color*` aliases at the bottom)

- [ ] **Step 1: Delete the legacy stubs**

```bash
rm app/internal/ui/aboutview.go
rm app/internal/ui/formview.go
rm app/internal/ui/importview.go
rm app/internal/ui/exportview.go
rm app/internal/ui/profileview.go
rm app/internal/ui/helpers.go
```

- [ ] **Step 2: Drop the deprecated color aliases from theme.go**

Edit `app/internal/ui/theme.go`. Remove the trailing block:

```go
// --- DEPRECATED legacy color vars (referenced by views that haven't migrated yet) ---
// Remove after all views are rebuilt.
var (
	ColorBgPrimary   = tokens.SurfaceBase
	// ... etc.
)
```

- [ ] **Step 3: Build; fix any remaining references**

```bash
cd app && go build ./...
```

Expected: exit 0. If any file still references `ColorBgPrimary` or similar, the build will fail with the file location. Grep:

```bash
grep -rn "ColorBgPrimary\|ColorBgSecondary\|ColorBgCard\|ColorBgButton\|ColorBgInput\|ColorBorder\|ColorHover\|ColorSeparator\|ColorTextPrimary\|ColorTextSecond\|ColorTextMuted\|ColorAccentBlue\|ColorAccentRed\|ColorSuccess\|ColorWarning" app/internal/ui/
```

Expected: empty output. Fix any references by switching to the equivalent `tokens.*` value.

- [ ] **Step 4: Commit**

```bash
git add app/internal/ui/ app/internal/ui/theme.go
git commit -m "chore: remove legacy view files and deprecated color aliases"
```

---

## Task 27: Replace any remaining container.NewMax usages

**Files:**
- Search the whole `app/internal/ui/` tree.

- [ ] **Step 1: Find any remaining `container.NewMax`**

Run:

```bash
grep -rn "container.NewMax" app/
```

Expected at this point: empty. If anything turns up, replace it with `container.NewStack`.

- [ ] **Step 2: Find any remaining manual string truncation (look for the pattern from the original listview.go)**

Run:

```bash
grep -rn "ValueTruncateLen\|len(.*) > .* + \"...\"" app/internal/ui/
```

Expected: empty. The constant `ValueTruncateLen` lived in the old `constants.go`. If it's still referenced, replace with `widget.Label.Truncation = fyne.TextTruncateEllipsis` or with the `middleEllipsize` helper in `cardrow.go`.

- [ ] **Step 3: Remove unused constants from `constants.go`**

Edit `app/internal/ui/constants.go`. Remove `SecretMask` (now `secretMask` lives in `cardrow.go`) and `ValueTruncateLen` (no longer needed). Resulting file:

```go
package ui

// App metadata
const (
	AppName    = "HedgeBuddy"
	AppVersion = "0.9.1"

	WindowTitle  = "HedgeBuddy"
	WindowWidth  = 1024
	WindowHeight = 768

	GithubURL  = "https://github.com/shakedex/hedgebuddy"
	WebsiteURL = "https://shaked.co"
)

// Variable types — single source of truth used by UI, validators, and storage
const (
	TypeString = "string"
	TypePath   = "path"
	TypeURL    = "url"
	TypeSecret = "secret"
)

// AllTypes returns the ordered list of variable types for UI selectors
func AllTypes() []string {
	return []string{TypeString, TypePath, TypeURL, TypeSecret}
}
```

- [ ] **Step 4: Build and commit**

```bash
cd app && go build ./...
git add app/internal/ui/constants.go
git commit -m "chore: prune unused constants; verify no NewMax or manual truncation remains"
```

---

## Task 28: Manual QA checklist

**Files:**
- Create: `docs/superpowers/specs/2026-05-24-hedgebuddy-ui-modernization-qa.md`

- [ ] **Step 1: Write the checklist**

Create `docs/superpowers/specs/2026-05-24-hedgebuddy-ui-modernization-qa.md`:

```markdown
# Phase 1 Manual QA Checklist

Run through this list on Windows (Segoe UI) and macOS (SF Pro) before tagging Phase 1.

## Visual

- [ ] Sidebar renders with PROFILES + FILTERS sections and Settings/About footer.
- [ ] Active profile/filter row has Accent left stripe and Surface3 background.
- [ ] Variable cards have 8 px rounded corners, 1 px BorderSubtle, hover lifts to Surface3.
- [ ] Action icons appear ONLY on row hover. Delete icon is muted at rest, danger on hover.
- [ ] Type stripe is visible only for path/url/secret (string gets none).
- [ ] Search input shows a leading icon inside.
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
- [ ] `⋯` on a profile row → popup menu Rename / Duplicate / Delete.
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-24-hedgebuddy-ui-modernization-qa.md
git commit -m "docs: Phase 1 manual QA checklist"
```

---

## Task 29: Final verification — full build, vet, and tests

- [ ] **Step 1: Run full build**

```bash
cd app && go build ./...
```

Expected: exit 0.

- [ ] **Step 2: Run go vet**

```bash
cd app && go vet ./...
```

Expected: exit 0, no warnings.

- [ ] **Step 3: Run all tests**

```bash
cd app && go test ./...
```

Expected: all PASS.

- [ ] **Step 4: Run the smoke binary and walk the QA checklist**

```bash
cd app && go run .
```

Walk through every box in `docs/superpowers/specs/2026-05-24-hedgebuddy-ui-modernization-qa.md`. Note any failures. Either fix inline (then commit) or open a follow-up issue.

- [ ] **Step 5: Update the README screenshot**

Replace `docs/app-main-view.png` with a fresh screenshot of the redesigned list view (showing sidebar, search, cards). Use the same dimensions (1024×768).

```bash
git add docs/app-main-view.png
git commit -m "docs: update screenshot for Phase 1 redesign"
```

- [ ] **Step 6: Final commit message**

If everything passes:

```bash
git commit --allow-empty -m "chore: Phase 1 UI modernization complete"
```

Then merge the branch (or open a PR):

```bash
git checkout master
git merge --no-ff feature/ui-modernization-phase1
```

---

## Spec coverage map

| Spec requirement | Task(s) |
|---|---|
| Semantic color tokens (§4.1) | Task 1 |
| Spacing & radii tokens (§4.3–4.4) | Task 2 |
| Theme rewrite using tokens (§4) | Task 3, 27 |
| OS-native font loader (§4.2) | Task 5 |
| Lucide icon bundling (§5) | Tasks 6, 7 |
| IconButton (§6.5) | Task 8 |
| CardRow (§6.2) | Task 9 |
| Sidebar + SidebarItem (§6.1) | Task 10 |
| Drawer (§6.3) | Task 11 |
| InlineStateButton (§6.4) | Task 12 |
| Modal + DeleteConfirm (§6.8) | Task 13 |
| FieldRow (§6.6) | Task 14 |
| App shell with drawer overlay (§3) | Task 15 |
| Sidebar profiles + filters + footer (§7.1, §7.5) | Task 16 |
| List view rebuild (§7.1) | Task 17 |
| Edit drawer (§7.2) | Task 18 |
| Import drawer + scoped drop handler (§7.3, audit A2) | Task 19 |
| Export drawer (§7.4) — Phase 1 keeps .env-only secret warning | Task 20 |
| ProfileFormModal (§7.5, audit B16) | Task 21 |
| Settings modal (§7.6) | Task 22 |
| About modal (§7.7) | Task 23 |
| Python + update dialogs redesigned (§7.8, audit B14, C5) | Task 24 |
| Microcopy on validator messages (audit C-series) | Task 25 |
| Confirm-delete modal text wraps (audit A9) | Task 13 (ShowDeleteConfirm uses widget.Label) |
| Remove dead `_ = card` in import view (audit observation) | Task 19 (importdrawer.go is rewritten from scratch, dead code gone) |
| Replace `container.NewMax` (audit A8) | Task 27 |
| Replace manual truncation with TextTruncateEllipsis (audit A12) | Tasks 9, 27 |
| Manual QA checklist | Task 28 |
| Final verification | Task 29 |

All Phase 1 requirements from the design spec are covered. Phase 2 items (fsnotify, file/folder Browse split, inline validation via `widget.Form`, secret-warning fix for JSON export, case-normalization migration, drop Linux from Python lib, Python+Update check ordering, tooltip-set-before-mount fix) are NOT in this plan — they'll get their own Phase 2 plan after Phase 1 is verified.
