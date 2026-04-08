# HedgeBuddy Desktop App (Fyne)

Native cross-platform desktop application for managing HedgeBuddy environment variables, built with [Fyne](https://fyne.io/) — a pure Go GUI framework.

## Prerequisites

### Windows

Fyne requires **CGO** and a **C compiler** (GCC via MinGW-w64).

1. **Install MSYS2** (provides MinGW-w64 GCC):
   ```powershell
   winget install -e --id MSYS2.MSYS2
   ```

2. **Install GCC inside MSYS2**:
   ```powershell
   C:\msys64\usr\bin\bash.exe -lc "pacman -S --noconfirm mingw-w64-ucrt-x86_64-gcc"
   ```

3. **Set environment before building** (every terminal session):
   ```powershell
   $env:PATH = "C:\msys64\ucrt64\bin;" + $env:PATH
   $env:CGO_ENABLED = "1"
   ```

### macOS

Xcode Command Line Tools provide the C compiler:
```bash
xcode-select --install
```

CGO is enabled by default on macOS.

## Build

```powershell
# Windows (with env vars set as above)
cd app
go build -o hedgebuddy.exe .

# macOS
cd app
go build -o hedgebuddy .
```

> **Note:** The first build takes several minutes because it compiles the OpenGL C bindings (`go-gl/gl`). Subsequent builds are fast (cached).

## Run

```powershell
# Windows
.\hedgebuddy.exe

# macOS
./hedgebuddy
```

## Features

- **CRUD**: Add, edit, delete environment variables
- **Variable Types**: String, Path, URL, Secret
- **Secret Masking**: Secret values shown as `••••••••` with click-to-reveal
- **Search & Filter**: Real-time filtering by name, value, description, or type
- **Copy to Clipboard**: One-click copy of any variable value
- **Duplicate**: Clone a variable with `_COPY` suffix for quick creation
- **Import**: Load variables from JSON template files (file dialog + drag-and-drop)
- **Export**: Save variables as JSON template or `.env` file format
- **Open Folder**: Quick access to `vars.json` in system file explorer
- **Keyboard Shortcuts**: Ctrl+N (new), Ctrl+F (search), Delete (remove)
- **Custom Dark Theme**: Consistent with HedgeBuddy brand colors
- **Backward Compatible**: Reads existing `vars.json` with legacy `"secure"` type (migrates to `"secret"`)

## Architecture

```
app/
├── main.go                         # Entry point
├── go.mod                          # Go module
├── internal/
│   ├── storage/
│   │   └── storage.go              # JSON storage layer (CRUD, import, export, atomic writes)
│   ├── validator/
│   │   └── validator.go            # Input validation (name, path, URL, string, secret)
│   └── ui/
│       ├── app.go                  # Central controller & navigation
│       ├── theme.go                # Custom Fyne dark theme
│       ├── listview.go             # Main variable list with search
│       ├── formview.go             # Add/edit variable form
│       ├── importview.go           # Bulk import with drag-and-drop
│       ├── exportview.go           # Export to JSON / .env
│       └── aboutview.go            # About page
```

Each UI view is a standalone module returning a `fyne.CanvasObject`. Only `app.go` manages navigation. Views have no cross-dependencies.

## Storage

Variables are stored in a platform-specific JSON file:

- **Windows**: `%APPDATA%\HedgeBuddy\vars.json`
- **macOS**: `~/Library/Application Support/HedgeBuddy/vars.json`

The Python library (`hedgebuddy`) reads from the same file.
