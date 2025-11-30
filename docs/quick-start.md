# Quick Start

Get up and running in 5 minutes.

---

## 1. Install Python Library

```bash
pip install --user hedgebuddy
```

Verify:

```bash
python -c "import hedgebuddy; print('Ready!')"
```

---

## 2. Install Desktop App

Download from [GitHub Releases](https://github.com/shakedex/hedgebuddy/releases).

- **Windows:** Extract folder, run `HedgeBuddy.exe`
- **macOS:** Open `.dmg`, drag to Applications, then run:
  ```bash
  xattr -cr /Applications/HedgeBuddy.app
  ```

---

## 3. Add Variables

1. Open HedgeBuddy app
2. Click **"+ New"**
3. Enter:
   - **Name:** `API_KEY`
   - **Value:** Your actual value
   - **Type:** String (or Path/URL)
4. Click **Save**

---

## 4. Use in Scripts

```python
import hedgebuddy

# Required variable
api_key = hedgebuddy.var("API_KEY")

# Optional with fallback
timeout = hedgebuddy.var("TIMEOUT", "30")

# Check if exists
if hedgebuddy.exists("S3_BUCKET"):
    bucket = hedgebuddy.var("S3_BUCKET")
```

---

## Variable Types

| Type | Use For | Example |
|------|---------|---------|
| **String** | Text values | `API_KEY`, `USERNAME` |
| **Path** | File/folder paths | `REPORT_PATH`, `CONFIG_DIR` |
| **URL** | Web addresses | `API_URL`, `WEBHOOK_URL` |

---

## Storage Location

- **Windows:** `%APPDATA%\hedgebuddy\vars.json`
- **macOS:** `~/Library/Application Support/hedgebuddy/vars.json`

---

## Next Steps

- [Python Library Guide](python-library.md) - Full API reference
- [Desktop App Guide](desktop-app.md) - Using the GUI
- [Examples](examples.md) - Real-world patterns
- [FAQ](faq.md) - Troubleshooting
