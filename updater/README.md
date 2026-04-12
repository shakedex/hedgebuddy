# HedgeBuddy Updater Agent

A small, standalone Go binary that handles in-place updates for HedgeBuddy and Quills. Installed alongside both apps by the [HedgeBuddy Suite installer](../scripts/installer/).

## How it works

1. **HedgeBuddy** or **Quills** detects a newer release on GitHub
2. The app spawns the updater with flags identifying what to update
3. The updater downloads the new binary from GitHub Releases
4. A native dialog asks the user to confirm ("Install Now" / "Cancel")
5. On confirm: the updater stops the running app, swaps the binary, and relaunches it

The updater itself is never the binary being replaced — it can always safely swap either app.

## CLI

```
updater --app <quills|hedgebuddy> --version <X.Y.Z> --install-dir <path> [--caller-pid <pid>]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--app` | Yes | Which app to update: `quills` or `hedgebuddy` |
| `--version` | Yes | Version string to display in the prompt |
| `--install-dir` | Yes | Directory where the app binary lives |
| `--caller-pid` | No | PID of the running app; updater kills it before replacing |

## Build

```bash
# Windows
cd updater && go build -o updater.exe .

# macOS (universal)
GOOS=darwin GOARCH=arm64 go build -o updater-arm64 .
GOOS=darwin GOARCH=amd64 go build -o updater-amd64 .
lipo -create -output updater updater-arm64 updater-amd64
```

No CGO required — cross-compiles cleanly from any platform.

## Native dialogs

| Platform | Confirm prompt | Error dialog |
|----------|---------------|-------------|
| Windows | `user32.dll` MessageBox | `user32.dll` MessageBox |
| macOS | `osascript` display dialog | `osascript` display dialog |
| Linux | stdin `y/N` prompt | stderr |

## File replacement strategy

1. Remove stale `.bak` from previous update
2. Kill `--caller-pid` (SIGTERM → wait → SIGKILL on Unix; TerminateProcess on Windows)
3. Rename `app.exe` → `app.exe.bak`
4. Rename `app.exe.new` → `app.exe`
5. Relaunch: `cmd /c start` (Windows) or detached `exec` (macOS/Linux)

If step 4 fails, step 3 is rolled back automatically.

## Project structure

```
updater/
├── main.go              CLI entry point
├── dialog_windows.go    Win32 MessageBox confirm/error
├── dialog_darwin.go     osascript confirm/error
├── dialog_other.go      stdin fallback
└── internal/
    ├── github/
    │   └── releases.go  GitHub Releases API (filtered by tag pattern)
    ├── download/
    │   └── download.go  HTTP download with progress
    └── install/
        ├── install.go          Shared swap logic
        ├── install_windows.go  Windows kill + relaunch
        └── install_unix.go     Unix kill + relaunch
```
