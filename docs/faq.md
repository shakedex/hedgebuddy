# FAQ & Troubleshooting

---

## General

### What is HedgeBuddy?

A tool for configuring Python scripts without hardcoding values or polluting system environment variables:

1. **Python Library** - Simple API for reading variables
2. **Desktop App** - GUI for managing variables

### Why not just use environment variables?

- ❌ Require system-level changes
- ❌ Hard to clean up
- ❌ Not user-friendly

HedgeBuddy: ✅ Local storage, ✅ Beautiful GUI, ✅ Easy to manage

### Is it secure?

Current version stores all variables as **plaintext** in `vars.json`. Future version will use OS keychain for `Secure` type.

### Linux support?

Python library works on Linux. Desktop app is Windows/macOS only (for now).

---

## Installation Issues

### pip install fails

```bash
# Try pip3
pip3 install --user hedgebuddy

# Or use python -m
python -m pip install --user hedgebuddy

# Check Python version (need 3.9+)
python --version
```

### Desktop app won't start (Windows)

1. Extract the entire folder, not just the `.exe`
2. Check if Windows Defender is blocking it
3. Try "Run as Administrator"

### Desktop app won't start (macOS)

For unsigned apps, run this in Terminal:

```bash
xattr -cr /Applications/HedgeBuddy.app
```

Then open normally from Applications.

### StorageNotFoundError

Install desktop app and add at least one variable.

---

## Python Library Issues

### ModuleNotFoundError

```bash
pip install --user hedgebuddy
python -c "import hedgebuddy; print('OK')"
```

### VariableNotFoundError

Variable not configured. Open desktop app → Add Variable → Use exact name (case-sensitive).

### StorageCorruptedError

JSON file has errors. Open desktop app, make any edit, save (rewrites file with valid JSON).

---

## Desktop App Issues

### Path validation warning

Path doesn't exist yet. Create the directory first, or ignore the warning (app still saves).

### URL validation error

URL must start with `http://` or `https://`:

```text
❌ api.example.com
✅ https://api.example.com
```

---

## Usage

### How to rename a variable?

Edit → Change name → Save. Update your scripts to use new name.

### How to backup variables?

Export from app, or copy `vars.json`:

- Windows: `%APPDATA%\hedgebuddy\vars.json`
- macOS: `~/Library/Application Support/hedgebuddy/vars.json`

### Different variables per project?

Not yet. Use prefixes: `PROJECT1_API_KEY`, `PROJECT2_API_KEY`

---

## Variable Types

| Type | Use For | Validation |
|------|---------|------------|
| **String** | API keys, text | Non-empty |
| **Path** | File/folder paths | Exists on disk |
| **URL** | Web addresses | http/https format |

---

## Still Need Help?

- [GitHub Issues](https://github.com/shakedex/hedgebuddy/issues)
- [Discussions](https://github.com/shakedex/hedgebuddy/discussions)
