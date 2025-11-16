# FAQ & Troubleshooting

Common questions and solutions for HedgeBuddy.

---

## General Questions

### What is HedgeBuddy?

HedgeBuddy is a tool that makes Python scripts easy to configure without hardcoding values or polluting system environment variables. It consists of:

1. **Python Library** - Simple API for reading variables in scripts
2. **Desktop App** - GUI for managing those variables

### Why not just use environment variables?

Traditional environment variables have several problems:

- ❌ Require system-level changes (HKCU registry on Windows, launchctl on macOS)
- ❌ Persist across sessions (hard to clean up)
- ❌ Not user-friendly for non-technical users
- ❌ Can conflict with other applications

HedgeBuddy solves these by:

- ✅ Storing variables locally (no system pollution)
- ✅ Providing a beautiful GUI (non-technical friendly)
- ✅ Easy to reset/modify/backup

### Why not use a `.env` file?

`.env` files are great for developers, but:

- Users need to manually edit text files (error-prone)
- No validation (typos, wrong paths, invalid URLs)
- No type information
- Harder to backup/restore

HedgeBuddy provides a GUI with validation, making it much more user-friendly.

### Is HedgeBuddy secure?

**Current version (Phase 1):**

- All variables (including `Secure` type) are stored as **plaintext** in `vars.json`
- The file is only accessible by your user account (OS-level permissions)
- Suitable for most use cases, but **not** for highly sensitive data

**Future version (Phase 2):**

- `Secure` type variables will use OS keychain:
  - Windows: Credential Manager
  - macOS: Keychain
- Much more secure for passwords and tokens

### Does it work on Linux?

Not officially supported yet. The Python library has Linux support (uses `~/.local/share/hedgebuddy/vars.json`), but the desktop app is only built for Windows and macOS.

Linux support is planned for a future release.

---

## Installation Issues

### "pip install hedgebuddy" fails

#### Solution 1: Try pip3

```bash
pip3 install --user hedgebuddy
```

#### Solution 2: Use python -m pip

```bash
python -m pip install --user hedgebuddy
```

#### Solution 3: Check Python version

```bash
python --version  # Must be 3.13+
```

If you have an older Python version, download Python 3.13+ from [python.org](https://www.python.org/downloads/).

### Desktop app won't start on Windows

**Problem:** Double-clicking `hedgebuddy.exe` does nothing.

**Solution:**

1. Make sure you **extracted the entire folder**, not just the `.exe`
2. Check if Windows Defender is blocking it:
   - Open Windows Security → Virus & threat protection → Protection history
   - If blocked, allow the app
3. Try running as Administrator (right-click → "Run as administrator")

### Desktop app won't start on macOS

**Problem:** "App can't be opened because it is from an unidentified developer"

**Solution:**

1. Right-click the app → Select "Open"
2. Click "Open" in the security dialog
3. Or: System Preferences → Security & Privacy → Click "Open Anyway"

### Storage file not found

**Error:** `StorageNotFoundError: HedgeBuddy storage file not found`

**Cause:** Desktop app not installed or no variables configured yet.

**Solution:**

1. Install the desktop app
2. Launch it and add at least one variable
3. Verify storage file exists:

```bash
# Windows (PowerShell)
Test-Path $env:APPDATA\hedgebuddy\vars.json

# macOS (Terminal)
ls ~/Library/Application\ Support/hedgebuddy/vars.json
```

---

## Python Library Issues

### "ModuleNotFoundError: No module named 'hedgebuddy'"

**Cause:** HedgeBuddy not installed or installed in wrong Python environment.

#### Solution 1: Install globally

```bash
pip install --user hedgebuddy
```

#### Solution 2: Check which Python

```bash
# Which python are you using?
python --version
which python  # macOS/Linux
where python  # Windows

# Install for that specific Python
python -m pip install --user hedgebuddy
```

#### Solution 3: Verify installation

```bash
python -c "import hedgebuddy; print('Installed!')"
```

### "VariableNotFoundError: Variable 'X' not found"

**Cause:** Variable `X` is not configured in the desktop app.

**Solution:**

1. Open HedgeBuddy desktop app
2. Click "Add Variable"
3. Add the variable with the exact name (case-sensitive!)
4. Run your script again

### "StorageCorruptedError: Invalid JSON"

**Cause:** The `vars.json` file has syntax errors.

**Solution 1: Use desktop app to fix**

1. Open the desktop app (it's more forgiving with invalid JSON)
2. Make any small edit and save (this rewrites the file with valid JSON)

**Solution 2: Manually fix JSON**

1. Open the file in a text editor:
   - Windows: `%APPDATA%\hedgebuddy\vars.json`
   - macOS: `~/Library/Application Support/hedgebuddy/vars.json`
2. Fix JSON syntax errors
3. Validate using [jsonlint.com](https://jsonlint.com/)

**Solution 3: Start fresh**

1. Backup the corrupted file (rename it)
2. Open desktop app
3. Re-create your variables

### Variables work in app but not in Python

**Cause:** Python is reading from a different location.

**Solution:** Check storage path:

```python
import hedgebuddy
from hedgebuddy.core import get_storage_path

print(f"Storage path: {get_storage_path()}")
```

Make sure this matches where the desktop app saves files.

---

## Desktop App Issues

### Variables disappear after closing app

**Cause:** App is not saving properly.

**Solution:**

1. Check file permissions on the storage directory
2. Make sure you're clicking "Save", not just "Cancel"
3. Verify the file exists after saving:

```bash
# Windows
cat $env:APPDATA\hedgebuddy\vars.json

# macOS
cat ~/Library/Application\ Support/hedgebuddy/vars.json
```

### Import/Export not working

**Problem:** Export button does nothing or import fails.

**Solution:**

1. Check you have write permissions in the export directory
2. For import, make sure the JSON file is valid HedgeBuddy format:

```json
{
  "variables": {
    "VAR_NAME": {
      "value": "var_value",
      "type": "string",
      "description": "optional"
    }
  }
}
```

### Path validation shows warning

**Problem:** "Path does not exist" warning for a valid path.

**Cause:** The path doesn't exist yet or there's a typo.

**Solution:**

1. Create the directory first (e.g., `mkdir C:\Reports`)
2. Or ignore the warning if you plan to create it later (app still allows saving)
3. Double-check for typos in the path

### URL validation won't let me save

**Problem:** "Invalid URL format" error.

**Cause:** URL must start with `http://` or `https://`.

**Solution:**

```
❌ Bad:  api.example.com
✅ Good: https://api.example.com

❌ Bad:  localhost:8000
✅ Good: http://localhost:8000

❌ Bad:  ftp://files.example.com
✅ Good: https://files.example.com  (use http/https)
```

---

## Usage Questions

### How do I rename a variable?

1. Edit the variable in the desktop app
2. Change the "Name" field
3. Click "Save"

⚠️ **Important:** Update your Python scripts to use the new name!

### How do I backup my variables?

**Option 1: Export from app**

1. Click "Export" in the desktop app
2. Save the JSON file somewhere safe

**Option 2: Copy storage file**

- Windows: Copy `%APPDATA%\hedgebuddy\vars.json`
- macOS: Copy `~/Library/Application Support/hedgebuddy/vars.json`

### How do I share variables with a team?

1. Export variables from desktop app
2. Share the JSON file
3. Team members import it into their HedgeBuddy app

⚠️ **Security:** Be careful sharing files with sensitive data (API keys, passwords)!

### Can I use HedgeBuddy in virtual environments?

Yes! Install HedgeBuddy in your virtual environment:

```bash
# Activate your venv
source venv/bin/activate  # macOS/Linux
venv\Scripts\activate     # Windows

# Install HedgeBuddy
pip install hedgebuddy
```

The library will still read from the same storage location (`vars.json`), so your variables are consistent across all environments.

### Can I have different variables for different projects?

Not currently. All scripts read from the same `vars.json` file.

**Workaround:** Use prefixes to organize variables:

```
PROJECT1_API_KEY
PROJECT1_OUTPUT_PATH

PROJECT2_API_KEY
PROJECT2_OUTPUT_PATH
```

Multi-profile support is planned for a future release.

---

## Best Practices

### Variable naming conventions

**Good:**

```
API_KEY
DATABASE_URL
REPORT_OUTPUT_PATH
SMTP_SERVER_HOST
```

**Bad:**

```
key        # Too generic
path       # Too generic
my-var     # Use underscores, not dashes
apiKey     # Use UPPER_CASE, not camelCase
```

### When to use each variable type

| Type       | Use For                                      |
| ---------- | -------------------------------------------- |
| **String** | API keys, usernames, general text            |
| **Path**   | File/folder locations (validates existence)  |
| **URL**    | Web addresses (validates format)             |
| **Secure** | Passwords, tokens (planned keychain support) |

### Documentation for script users

Include this in your script's README:

````markdown
## Configuration

This script uses HedgeBuddy for configuration.

### Setup

1. Install HedgeBuddy:

   ```bash
   pip install --user hedgebuddy
   ```

2. Download the desktop app from [Releases](https://github.com/shakedex/hedgebuddy/releases)

3. Configure these variables:

| Variable      | Type   | Required | Description                                            |
| ------------- | ------ | -------- | ------------------------------------------------------ |
| `API_KEY`     | Secure | Yes      | Your API key from the dashboard                        |
| `REPORT_PATH` | Path   | Yes      | Where to save reports (e.g., `C:\Reports`)             |
| `API_URL`     | URL    | No       | Custom API endpoint (default: https://api.example.com) |

4. Run the script:
   ```bash
   python your_script.py
   ```
````

---

## Error Messages Explained

### VariableNotFoundError

```
Variable 'API_KEY' not found in HedgeBuddy storage.
Please add it using the HedgeBuddy app.
```

**Meaning:** The variable doesn't exist.

**Fix:** Add it using the desktop app.

### StorageNotFoundError

```
HedgeBuddy storage file not found at: C:\Users\...\vars.json
Please install and run the HedgeBuddy app to create your first variable.
```

**Meaning:** The storage file doesn't exist yet.

**Fix:** Install desktop app and create at least one variable.

### StorageCorruptedError

```
HedgeBuddy storage file is corrupted: C:\Users\...\vars.json
Reason: Invalid JSON: Expecting ',' delimiter: line 5 column 3
```

**Meaning:** The JSON file has syntax errors.

**Fix:** Use desktop app to fix, or manually edit the JSON file.

---

## Performance

### Does HedgeBuddy slow down my scripts?

No. Reading from `vars.json` is very fast (typically <1ms). The file is only read once when you call `var()`, `exists()`, or `all_vars()`.

### Can I cache variable values?

Yes! If you need the same variable multiple times:

```python
import hedgebuddy

# Read once
api_key = hedgebuddy.var("API_KEY")

# Use many times
request1(api_key)
request2(api_key)
request3(api_key)
```

Each call to `var()` re-reads the file, so caching the value is more efficient.

---

## Still Need Help?

- **GitHub Issues**: [Report a bug or request a feature](https://github.com/shakedex/hedgebuddy/issues)
- **Discussions**: [Ask questions or share ideas](https://github.com/shakedex/hedgebuddy/discussions)
- **Email**: Contact the maintainer via GitHub profile

---

## Next Steps

- [Python Library Guide](python-library.md) - Complete API reference
- [Desktop App Guide](desktop-app.md) - Using the GUI
- [Examples](examples.md) - Real-world usage patterns
