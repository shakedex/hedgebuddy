# HedgeBuddy

**Cross-platform environment variable management for Python scripts without system pollution.**

[![PyPI](https://img.shields.io/pypi/v/hedgebuddy)](https://pypi.org/project/hedgebuddy/)
[![Python](https://img.shields.io/pypi/pyversions/hedgebuddy)](https://pypi.org/project/hedgebuddy/)
[![License](https://img.shields.io/github/license/shakedex/hedgebuddy)](LICENSE)

---

## What is HedgeBuddy?

HedgeBuddy is a lightweight utility that makes Python scripts more accessible and configurable for Hedge's software suite without needing to hardcode important variables. It consists of two components:

1. **Python Library** (`hedgebuddy`) - Dead-simple API for reading variables in your scripts
2. **Desktop GUI App** - Beautiful interface for managing variables (Windows & macOS)

Perfect for script developers who want to make their tools user-friendly without requiring technical setup after script creation.

---

## Quick Start

### For Script Users

1. **Install Python 3.13+** (if not already installed)
   - Windows: Download from [python.org](https://www.python.org/downloads/)
   - macOS: `brew install python` or download from [python.org](https://www.python.org/downloads/)
2. **Install the desktop app** (download from [Releases](https://github.com/shakedex/hedgebuddy/releases))
3. **Install the Python library**:

   ```bash
   pip install --user hedgebuddy
   ```

4. **Add your variables** using the GUI, fill up the corresponding variables called in your scripts.
5. **Run your scripts** - they just work! ✨

### For Script Developers

```python
import hedgebuddy

# Required variable (raises error if not configured)
api_key = hedgebuddy.var("API_KEY")

# Optional variable with fallback
api_url = hedgebuddy.var("API_URL", "https://api.example.com")

# Check if variable exists
if hedgebuddy.exists("PREMIUM_FEATURES"):
    enable_premium()

# Get all variables as a dictionary
all_variables = hedgebuddy.all_vars()

# Inject into os.environ for legacy code (optional)
hedgebuddy.inject_env(overwrite=False)
```

That's it! No system environment pollution, no complex setup.

---

## Key Features

✅ **Zero System Pollution** - Variables stored locally, never touch system environment  
✅ **Cross-Platform** - Works seamlessly on Windows and macOS  
✅ **Simple API** - Just `hedgebuddy.var("NAME")` in your scripts  
✅ **Beautiful GUI** - Modern desktop app for variable management  
✅ **Type Support** - String, Path, URL, and Secure variable types  
✅ **Validation** - Built-in path and URL validation  
✅ **Zero Friction** - Scripts work immediately after variable configuration

---

## Architecture

```
┌─────────────────┐
│   Desktop App   │ ← User manages variables via GUI
│   (Go + Wails)  │
└────────┬────────┘
         │
         ↓ Writes to
┌─────────────────┐
│   vars.json     │ ← Local storage (no system pollution)
│  (AppData/      │
│   Library)      │
└────────┬────────┘
         │
         ↓ Reads from
┌─────────────────┐
│ Python Library  │ ← Scripts call hedgebuddy.var()
│  (hedgebuddy)   │
└─────────────────┘
```

**Storage Locations:**

- **Windows**: `%APPDATA%\hedgebuddy\vars.json`
- **macOS**: `~/Library/Application Support/hedgebuddy/vars.json`

---

## Project Structure

```
hedgebuddy/
├── python-lib/          # Python library (published to PyPI)
│   ├── hedgebuddy/      # Core library code
│   ├── tests/           # Unit tests (95% coverage)
│   └── examples/        # Example scripts
├── go-app/              # Desktop GUI application (Wails)
│   ├── frontend/        # Svelte + TypeScript UI
│   └── backend/         # Go backend logic
├── website/             # Documentation website
└── docs/                # Additional documentation
```

---

## Documentation

📖 **[Read the Full Documentation](https://shakedex.github.io/hedgebuddy/)**

**Quick Links:**

- [Installation Guide](https://shakedex.github.io/hedgebuddy/#/installation)
- [Python Library API](https://shakedex.github.io/hedgebuddy/#/python-library)
- [Desktop App Guide](https://shakedex.github.io/hedgebuddy/#/desktop-app)
- [Code Examples](https://shakedex.github.io/hedgebuddy/#/examples)
- [FAQ & Troubleshooting](https://shakedex.github.io/hedgebuddy/#/faq)

**Additional Resources:**

- **Python Library**: See [`python-lib/README.md`](python-lib/README.md)
- **Desktop App**: See [`hedgebuddy-wails/README.md`](hedgebuddy-wails/README.md)
- **Example Scripts**: See [`python-lib/examples/`](python-lib/examples/)
- **Download App**: [Releases](https://github.com/shakedex/hedgebuddy/releases)

---

## Installation

### Prerequisites

**Python 3.13 or higher** is required. Check if you have Python installed:

```bash
python --version
```

If not installed, download from [python.org](https://www.python.org/downloads/) or use your system's package manager.

### Python Library

```bash
pip install --user hedgebuddy
```

Verify:

```bash
python -c "import hedgebuddy; print('✓ HedgeBuddy ready!')"
```

### Desktop App

Download the latest release for your platform:

- [Windows (x64)](https://github.com/shakedex/hedgebuddy/releases)
- [macOS (Apple Silicon)](https://github.com/shakedex/hedgebuddy/releases)

---

## Development

### Python Library

```bash
cd python-lib
pip install --user -e .
pytest tests/ -v
```

### Desktop App

```bash
cd go-app
wails dev
```

Build:

```bash
wails build
```

---

## Status

### ✅ Python Library (v0.5.1)

- Published to PyPI
- 95% test coverage
- Production ready
- Feature complete

### ✅ Desktop GUI App

- Cross-platform (Windows & macOS)
- Variable CRUD operations
- Type validation (Path, URL)
- Modern UI with Svelte
- Production ready

### 🚧 Documentation Website

- Landing page (in progress)
- User guide
- API reference

---

## Design Philosophy

**For Script Developers:**

- No changes to existing code patterns
- Simple, predictable API
- Clear error messages

**For End Users:**

- No technical knowledge required
- Beautiful, intuitive GUI
- Variables just work

**For Everyone:**

- No system pollution
- Cross-platform consistency
- Zero-friction setup

---

## License

MIT License - see [LICENSE](LICENSE) file

---

## Links

- **PyPI Package**: <https://pypi.org/project/hedgebuddy/>
- **GitHub**: <https://github.com/shakedex/hedgebuddy>
- **Issues**: <https://github.com/shakedex/hedgebuddy/issues>
- **Releases**: <https://github.com/shakedex/hedgebuddy/releases>

---

---

## Disclaimer

**HedgeBuddy is an independent, open-source project.** It is NOT affiliated with, endorsed by, or officially associated with Hedge (hedge.co) or its parent company. This software is provided "as is" without warranty of any kind. Use at your own risk.

---
