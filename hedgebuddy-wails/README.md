# HedgeBuddy Desktop App

**Cross-platform GUI for managing environment variables used by Python scripts.**

Built with [Wails](https://wails.io) (Go + Svelte + TypeScript)

---

## Overview

The HedgeBuddy Desktop App provides a beautiful, user-friendly interface for managing environment variables without touching system settings. Variables are stored locally and accessed by Python scripts via the `hedgebuddy` library.

**Key Features:**

- ✅ Add, edit, and delete variables
- ✅ Variable types: String, Path, URL, Secure
- ✅ Built-in validation (path existence, URL format)
- ✅ Cross-platform (Windows & macOS)
- ✅ No system environment pollution
- ✅ Clean, modern UI

---

## Storage Location

Variables are stored in platform-specific locations:

- **Windows**: `%APPDATA%\hedgebuddy\vars.json`
- **macOS**: `~/Library/Application Support/hedgebuddy/vars.json`

**Storage Format:**

```json
{
  "variables": {
    "API_KEY": {
      "value": "your-api-key",
      "type": "secure",
      "description": "API authentication key"
    },
    "REPORT_PATH": {
      "value": "C:\\Reports",
      "type": "path",
      "description": "Where reports are saved"
    }
  }
}
```

---

## Development

### Prerequisites

- [Go 1.25+](https://go.dev/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

Install Wails:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### Live Development

Run with hot-reload:

```bash
wails dev
```

This starts:

- Vite dev server for frontend hot-reload
- Go backend with the app
- Dev server at http://localhost:34115 for browser testing

### Building

Build for production:

```bash
wails build
```

Build outputs are in `build/bin/`:

- **Windows**: `hedgebuddy.exe`
- **macOS**: `hedgebuddy.app`

### Project Structure

```
hedgebuddy-wails/
├── frontend/           # Svelte + TypeScript UI
│   ├── src/
│   │   ├── App.svelte # Main application component
│   │   ├── lib/       # Reusable components
│   │   └── assets/    # Images, styles
│   └── package.json
├── app.go             # Main Wails application setup
├── main.go            # Entry point
└── wails.json         # Wails configuration
```

---

## Features

### Variable Types

1. **String** - General text values
2. **Path** - File/folder paths (validates existence)
3. **URL** - Web URLs (validates format)
4. **Secure** - Sensitive data (plaintext in Phase 1, keychain in Phase 2)

### Validation

- **Path type**: Checks if path exists on filesystem
- **URL type**: Validates URL format (http/https)
- **All types**: Non-empty name and value required

### User Interface

- **Add Variable**: Click "Add Variable" button
- **Edit Variable**: Click on existing variable
- **Delete Variable**: Click delete icon
- **Import Variables**: Import from JSON file
- **Validation Feedback**: Real-time validation messages

---

## Building for Distribution

### Windows

```bash
wails build -platform windows/amd64
```

Output: `build/bin/hedgebuddy.exe`

### macOS

```bash
wails build -platform darwin/arm64
```

Output: `build/bin/hedgebuddy.app`

### Cross-Platform Build

```bash
wails build -platform windows/amd64,darwin/arm64
```

---

## Integration with Python Library

Variables managed in this app are automatically available to Python scripts:

```python
import hedgebuddy

# Read variable configured in the GUI
api_key = hedgebuddy.var("API_KEY")
report_path = hedgebuddy.var("REPORT_PATH")
```

See the [Python library documentation](../python-lib/README.md) for more details.

---

## Troubleshooting

### App won't start

- Check if port 34115 is already in use (dev mode)
- Ensure Go 1.25+ and Node.js 18+ are installed

### Variables not showing in Python

- Verify vars.json exists at the correct location
- Check file permissions
- Ensure variable names match exactly (case-sensitive)

### Build errors

- Run `wails doctor` to check dependencies
- Update Wails: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- Clear build cache: `wails clean`

---

## Links

- **Wails Documentation**: https://wails.io/docs/introduction
- **Main Project**: [hedgebuddy](../README.md)
- **Python Library**: [python-lib](../python-lib/README.md)
- **GitHub**: https://github.com/shakedex/hedgebuddy

---

**Built with Wails, Go, Svelte, and TypeScript**
