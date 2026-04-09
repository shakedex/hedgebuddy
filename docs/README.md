<p align="center">
  <img src="hedgebuddy_icon2.png" alt="HedgeBuddy" width="120" />
</p>

# HedgeBuddy

> Cross-platform environment variable management for Python scripts without system pollution.

[![PyPI](https://img.shields.io/pypi/v/hedgebuddy)](https://pypi.org/project/hedgebuddy/)
[![Python](https://img.shields.io/pypi/pyversions/hedgebuddy)](https://pypi.org/project/hedgebuddy/)
[![License](https://img.shields.io/github/license/shakedex/hedgebuddy)](https://github.com/shakedex/hedgebuddy/blob/master/LICENSE)
[![GitHub](https://img.shields.io/github/stars/shakedex/hedgebuddy?style=social)](https://github.com/shakedex/hedgebuddy)

---

## What is HedgeBuddy?

HedgeBuddy makes Python automation scripts easy to configure for **filmmaking DIT/Data Wrangling workflows** using Hedge's software ecosystem:

- **OffShoot** - Automate post-transfer workflows (Slack notifications, cloud uploads, metadata logging)
- **FoolCat** - Auto-move camera reports to production folders
- **EditReady** - Configure transcode destinations and settings

1. **Python Library** - Simple API: `hedgebuddy.var("SLACK_WEBHOOK")`
2. **Desktop App** - GUI for managing variables (Windows & macOS)

<!-- Screenshot Placeholder -->

---

## Why HedgeBuddy?

**Localized Enviroment** - Variables stored locally, never touch system environment  
**Cross-Platform** - Windows and macOS  
**Simple Usage in Scripts** - Just `hedgebuddy.var("NAME")`

---

## Quick Start

### For Script Users (Non-Technical)

Just want to run existing scripts? Follow these steps:

1. **Install Python 3.9+** ([Download](https://www.python.org/downloads/))
2. **Download & install the desktop app** ([Releases](https://github.com/shakedex/hedgebuddy/releases))
3. **On first launch, the app detects whether the `hedgebuddy` Python library is installed** and offers to install it for you automatically.
4. **Configure your variables** using the GUI, then run your scripts!

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
```

---

## How It Works

```
┌─────────────────┐
│   Desktop App   │ ← User manages variables via GUI
│   (Go + Fyne)   │
└────────┬────────┘
         │
         ↓ Writes to
┌───────────────────────────────┐
│ profiles.json + profiles/*    │ ← Local storage (no system pollution)
│  (AppData/Library)            │
└───────────────┬───────────────┘
         │
         ↓ Reads from
┌─────────────────┐
│ Python Library  │ ← Scripts call hedgebuddy.var()
│  (hedgebuddy)   │
└─────────────────┘
```

**Storage Locations:**

- **Windows**: `%APPDATA%\HedgeBuddy\profiles\<active>\vars.json`
- **macOS**: `~/Library/Application Support/HedgeBuddy/profiles/<active>/vars.json`

---

## Next Steps

- [Installation Guide](installation.md) - Detailed setup instructions
- [Python Library Guide](python-library.md) - Complete API reference
- [Desktop App Guide](desktop-app.md) - How to use the GUI
- [Examples](examples.md) - Real-world usage patterns
- [FAQ & Troubleshooting](faq.md) - Common questions

---

## Links

- [GitHub Repository](https://github.com/shakedex/hedgebuddy)
- [PyPI Package](https://pypi.org/project/hedgebuddy/)
- [Report Issues](https://github.com/shakedex/hedgebuddy/issues)
- [Desktop App Releases](https://github.com/shakedex/hedgebuddy/releases)

---

## Disclaimer

?> **Independent Project**: HedgeBuddy is an independent, open-source project and is **NOT affiliated with, endorsed by, or officially associated with Hedge (hedge.co)** or its parent company. This software is created for the filmmaking community and users of Hedge.co applications, but is a third-party tool provided "as is" without warranty. Use at your own risk.

---
