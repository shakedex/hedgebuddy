# Installation

This guide covers installing both components of HedgeBuddy.

---

## Prerequisites

**Python 3.13 or higher** is required.

Check if you have Python installed:

```bash
python --version
```

If not installed:

- **Windows**: Download from [python.org](https://www.python.org/downloads/)
- **macOS**: `brew install python` or download from [python.org](https://www.python.org/downloads/)

---

## Install Python Library

Install the `hedgebuddy` library globally so all your scripts can use it:

```bash
pip install --user hedgebuddy
```

### Verify Installation

```bash
python -c "import hedgebuddy; print('✓ HedgeBuddy ready!')"
```

If successful, you'll see: `✓ HedgeBuddy ready!`

---

## Install Desktop App

### Windows

1. **Download** the latest release from [GitHub Releases](https://github.com/shakedex/hedgebuddy/releases)
2. **Extract** the `.zip` file
3. **Run** `hedgebuddy.exe`
4. **(Optional)** Create a desktop shortcut or pin to taskbar

### macOS

1. **Download** the latest release from [GitHub Releases](https://github.com/shakedex/hedgebuddy/releases)
2. **Open** the `.dmg` file
3. **Drag** HedgeBuddy to Applications folder
4. **Launch** from Applications

?> **First Launch on macOS**: You may need to right-click → "Open" the first time due to macOS security settings.

---

## Verify Everything Works

1. **Launch the desktop app**
2. **Add a test variable**:
   - Name: `TEST_VAR`
   - Value: `hello world`
   - Type: String
3. **Create a test script** (`test.py`):

```python
import hedgebuddy
print(hedgebuddy.var("TEST_VAR"))
```

4. **Run the script**:

```bash
python test.py
```

You should see: `hello world`

---

## Storage Locations

Variables are stored locally at:

- **Windows**: `%APPDATA%\hedgebuddy\vars.json`
- **macOS**: `~/Library/Application Support/hedgebuddy/vars.json`

You can manually view or edit this file, but it's easier to use the desktop app.

---

## Troubleshooting

### Python library not found

If you get `ModuleNotFoundError: No module named 'hedgebuddy'`:

```bash
# Try installing with pip3 instead
pip3 install --user hedgebuddy

# Or use python -m pip
python -m pip install --user hedgebuddy
```

### Desktop app won't start

- **Windows**: Make sure you extracted the entire folder, not just the `.exe`
- **macOS**: Right-click the app → "Open" to bypass security warnings

### Variables not showing in Python

1. Make sure the desktop app is installed and you've created at least one variable
2. Check the storage location exists (see above)
3. Verify the JSON file is valid

See [FAQ & Troubleshooting](faq.md) for more help.

---

## Next Steps

- [Quick Start Guide](quick-start.md) - Get up and running in 5 minutes
- [Python Library Guide](python-library.md) - Complete API reference
- [Desktop App Guide](desktop-app.md) - How to use the GUI
