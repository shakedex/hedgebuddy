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

**Two Simple Components:**

1. 🐍 **Python Library** - Dead-simple API: `hedgebuddy.var("SLACK_WEBHOOK")`
2. 🖥️ **Desktop App** - Beautiful GUI for managing variables (Windows & macOS)

<!-- Screenshot Placeholder -->

!> **Screenshot Coming Soon**: Desktop app interface showing variable management

---

## Why HedgeBuddy?

✅ **Zero System Pollution** - Variables stored locally, never touch system environment  
✅ **Cross-Platform** - Works seamlessly on Windows and macOS  
✅ **Simple API** - Just `hedgebuddy.var("NAME")` in your scripts  
✅ **Beautiful GUI** - Modern desktop app for variable management  
✅ **Type Support** - String, Path, URL, and Secure variable types  
✅ **Validation** - Built-in path and URL validation  
✅ **Zero Friction** - Scripts work immediately after variable configuration

---

## Quick Start

### For Script Users (Non-Technical)

Just want to run existing scripts? Follow these 4 steps:

1. **Install Python 3.9+** ([Download](https://www.python.org/downloads/))
2. **Install HedgeBuddy library**:

   ```bash
   pip install --user hedgebuddy
   ```

3. **Download & install the desktop app** ([Releases](https://github.com/shakedex/hedgebuddy/releases))
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

That's it! No system environment pollution, no complex setup.

---

## How It Works

```
┌─────────────────┐
│   Desktop App   │ ← User manages variables via GUI
│   (Go + Fyne)   │
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

## Next Steps

- 📚 [Installation Guide](installation.md) - Detailed setup instructions
- 🐍 [Python Library Guide](python-library.md) - Complete API reference
- 🖥️ [Desktop App Guide](desktop-app.md) - How to use the GUI
- 💡 [Examples](examples.md) - Real-world usage patterns
- ❓ [FAQ & Troubleshooting](faq.md) - Common questions

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
