# HedgeBuddy Desktop App

Cross-platform GUI for managing environment variables. Built with [Wails](https://wails.io) (Go + Svelte).

## Features

- Add, edit, delete variables
- Variable types: String, Path, URL
- Path/URL validation
- Import/Export JSON

## Development

### Prerequisites

- [Go 1.21+](https://go.dev/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### Run

```bash
wails dev
```

### Build

```bash
wails build
```

Output: `build/bin/HedgeBuddy.exe` (Windows) or `build/bin/HedgeBuddy.app` (macOS)

## Storage

- **Windows:** `%APPDATA%\HedgeBuddy\vars.json`
- **macOS:** `~/Library/Application Support/HedgeBuddy/vars.json`

## Structure

```text
hedgebuddy-wails/
├── frontend/        # Svelte + TypeScript UI
├── internal/        # Go backend (storage, validator)
├── app.go           # Main app logic
├── main.go          # Entry point
└── wails.json       # Wails config
```

## Links

[Main Project](../README.md) · [Python Library](../python-lib/README.md) · [Wails Docs](https://wails.io/docs/introduction)
