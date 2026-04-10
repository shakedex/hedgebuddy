<p align="center">
  <img src="branding/github.png" alt="HedgeBuddy" width="640" />
</p>

# HedgeBuddy

**Cross-platform environment variable management for Python scripts without system pollution.**

[![PyPI](https://img.shields.io/pypi/v/hedgebuddy)](https://pypi.org/project/hedgebuddy/)
[![Python](https://img.shields.io/pypi/pyversions/hedgebuddy)](https://pypi.org/project/hedgebuddy/)
[![License](https://img.shields.io/github/license/shakedex/hedgebuddy)](LICENSE)

---

## What is HedgeBuddy?

HedgeBuddy makes Python automation scripts easy to configure for **DIT/Data Wrangling workflows** using Hedge's software ecosystem (**OffShoot**, **FoolCat**, **EditReady**):

1. **Python Library** (`hedgebuddy`) - Simple API for reading variables in scripts
2. **Desktop GUI App** - Native app for managing variables (Windows & macOS)

<p align="center">
  <img src="docs/app-main-view.png" alt="HedgeBuddy App" width="800" />
</p>
---

## Quick Start

### Install

```bash
pip install --user hedgebuddy
```

Download the desktop app from [Releases](https://github.com/shakedex/hedgebuddy/releases).

### Use in Scripts

```python
import hedgebuddy

# Required variable (raises error if not configured)
api_key = hedgebuddy.var("API_KEY")

# Optional variable with fallback
api_url = hedgebuddy.var("API_URL", "https://api.example.com")

# Check if variable exists
if hedgebuddy.exists("PREMIUM_FEATURES"):
    enable_premium()
```

---

## Key Features

**Localized Enviroment** - Variables stored locally, never touch system environment  
**Cross-Platform** - Windows and macOS  
**Simple Usage in Scripts** - Just `hedgebuddy.var("NAME")`  

---

## How It Works

```text
┌─────────────────┐
│   Desktop App   │ ← User manages variables via GUI
└────────┬────────┘
         ↓ Writes to
┌───────────────────────────────┐
│ profiles.json + profiles/*    │ ← Local storage (AppData / Library)
└───────────────┬───────────────┘
         ↓ Reads from
┌─────────────────┐
│ Python Library  │ ← Scripts call hedgebuddy.var()
└─────────────────┘
```

**Storage:** `%APPDATA%\HedgeBuddy\profiles\<active>\vars.json` (Windows) · `~/Library/Application Support/HedgeBuddy/profiles/<active>/vars.json` (macOS)

---

## Documentation

**[Full Documentation](https://shakedex.github.io/hedgebuddy/)**

- [Python Library](python-lib/README.md)
- [Desktop App](app/README.md)
- [Examples](python-lib/examples/)

---

## Development

```bash
# Python library
cd python-lib && pip install -e . && pytest

# Desktop app
cd app && go run .
```

---

## Links

[PyPI](https://pypi.org/project/hedgebuddy/) · [GitHub](https://github.com/shakedex/hedgebuddy) · [Releases](https://github.com/shakedex/hedgebuddy/releases) · [Issues](https://github.com/shakedex/hedgebuddy/issues)

---

## Disclaimer

HedgeBuddy is an independent, open-source project. NOT affiliated with Hedge (hedge.co). MIT License.
