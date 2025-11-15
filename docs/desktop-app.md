# Desktop App Guide

Complete guide to using the HedgeBuddy desktop application.

---

## Overview

The HedgeBuddy desktop app provides a beautiful, user-friendly interface for managing environment variables without touching system settings.

<!-- Screenshot Placeholder -->

!> **Screenshot Coming Soon**: Main application window showing variable list

**Key Features:**

- ✅ Add, edit, and delete variables
- ✅ Variable types: String, Path, URL, Secure
- ✅ Built-in validation (path existence, URL format)
- ✅ Import/export variables
- ✅ Clean, modern UI

---

## Installation

### Windows

1. Download the latest `.zip` file from [GitHub Releases](https://github.com/shakedex/hedgebuddy/releases)
2. Extract to a location like `C:\Program Files\HedgeBuddy\`
3. Run `hedgebuddy.exe`
4. (Optional) Create a desktop shortcut

### macOS

1. Download the latest `.dmg` file from [GitHub Releases](https://github.com/shakedex/hedgebuddy/releases)
2. Open the `.dmg` file
3. Drag **HedgeBuddy.app** to your **Applications** folder
4. Launch from Applications

?> **First Launch on macOS**: Right-click → "Open" the first time to bypass security warnings.

---

## Getting Started

### First Launch

When you first launch HedgeBuddy, you'll see an empty variable list. Let's add your first variable!

<!-- Screenshot Placeholder -->

!> **Screenshot Coming Soon**: Empty state with "Add Variable" button

### Adding a Variable

1. Click the **"Add Variable"** button
2. Fill in the form:
   - **Name**: Variable name (e.g., `API_KEY`)
   - **Value**: Variable value
   - **Type**: Select from dropdown (String, Path, URL, Secure)
   - **Description**: Optional note about what this variable is for
3. Click **"Save"**

<!-- Screenshot Placeholder -->

!> **Screenshot Coming Soon**: Add variable form

---

## Variable Types

Choose the appropriate type for your variable:

### String

General text values. No validation.

**Use for:**

- API keys
- Usernames
- Configuration values
- Any general text

**Example:**

- Name: `API_KEY`
- Value: `sk_live_abc123xyz789`
- Type: `String`

### Path

File or folder paths. Validates that the path exists on your filesystem.

**Use for:**

- Output directories
- Configuration file locations
- Data folders

**Example:**

- Name: `REPORT_PATH`
- Value: `C:\Users\John\Documents\Reports` (Windows)
- Value: `/Users/john/Documents/Reports` (macOS)
- Type: `Path`

⚠️ **Validation**: The app will warn you if the path doesn't exist, but still allows saving.

### URL

Web addresses. Validates URL format (must start with `http://` or `https://`).

**Use for:**

- API endpoints
- Webhook URLs
- Web service addresses

**Example:**

- Name: `API_URL`
- Value: `https://api.hedge.co/v1`
- Type: `URL`

⚠️ **Validation**: Must be a valid HTTP/HTTPS URL.

### Secure

Sensitive data like passwords and tokens.

**Use for:**

- Passwords
- Secret tokens
- Sensitive credentials

**Example:**

- Name: `SECRET_TOKEN`
- Value: `my-super-secret-token`
- Type: `Secure`

!> **Security Note**: In the current version, `Secure` type variables are stored as **plaintext** in `vars.json`. Future versions will integrate with OS keychain (Windows Credential Manager / macOS Keychain).

---

## Managing Variables

### Viewing Variables

All your variables are displayed in a list/card view:

- **Name**: Variable name
- **Value**: Variable value (truncated for long values)
- **Type**: Variable type badge
- **Description**: Optional description

<!-- Screenshot Placeholder -->

!> **Screenshot Coming Soon**: Variable list showing multiple variables with different types

### Editing a Variable

1. Click on the variable card you want to edit
2. Modify any field (name, value, type, description)
3. Click **"Save"**

<!-- Screenshot Placeholder -->

!> **Screenshot Coming Soon**: Edit variable form

### Deleting a Variable

1. Click the **delete icon** (trash can) on the variable card
2. Confirm deletion in the popup

⚠️ **Warning**: This action cannot be undone. The variable will be permanently removed.

---

## Import & Export

### Exporting Variables

Export your variables to a JSON file for backup or sharing:

1. Click **"Export"** button
2. Choose a location to save the file
3. File saved as `hedgebuddy-export.json`

**Export format:**

```json
{
  "variables": {
    "API_KEY": {
      "value": "your-api-key",
      "type": "string",
      "description": "API authentication"
    },
    "REPORT_PATH": {
      "value": "C:\\Reports",
      "type": "path",
      "description": "Report output directory"
    }
  }
}
```

### Importing Variables

Import variables from a JSON file:

1. Click **"Import"** button
2. Select a previously exported JSON file
3. Choose import mode:
   - **Merge**: Add new variables, keep existing ones
   - **Replace**: Replace all existing variables (⚠️ destructive)
4. Click **"Import"**

!> **Warning**: "Replace" mode will delete all existing variables before importing.

---

## Validation & Error Messages

The app validates your input and shows helpful error messages:

### Path Type Validation

- ✅ **Valid**: Path exists on filesystem
- ⚠️ **Warning**: Path doesn't exist (still allows saving)

```
⚠️ Warning: Path does not exist
The path 'C:\NonExistent\Folder' was not found.
You can still save it if you plan to create it later.
```

### URL Type Validation

- ✅ **Valid**: Proper HTTP/HTTPS URL format
- ❌ **Error**: Invalid URL format (prevents saving)

```
❌ Invalid URL format
URLs must start with http:// or https://
Example: https://api.example.com
```

### Required Fields

- **Name**: Cannot be empty
- **Value**: Cannot be empty

```
❌ Name is required
Please enter a variable name.
```

---

## Storage Location

Your variables are stored locally at:

- **Windows**: `%APPDATA%\hedgebuddy\vars.json`
  - Full path: `C:\Users\YourName\AppData\Roaming\hedgebuddy\vars.json`
- **macOS**: `~/Library/Application Support/hedgebuddy/vars.json`
  - Full path: `/Users/yourname/Library/Application Support/hedgebuddy/vars.json`

### Manual Editing

You can manually edit `vars.json` with a text editor, but we recommend using the desktop app to avoid JSON syntax errors.

**File structure:**

```json
{
  "variables": {
    "VARIABLE_NAME": {
      "value": "variable value",
      "type": "string",
      "description": "optional description"
    }
  }
}
```

---

## Keyboard Shortcuts

| Action       | Windows  | macOS |
| ------------ | -------- | ----- |
| Add Variable | `Ctrl+N` | `⌘N`  |
| Save         | `Ctrl+S` | `⌘S`  |
| Cancel       | `Esc`    | `Esc` |
| Close App    | `Alt+F4` | `⌘Q`  |

---

## Tips & Tricks

### 1. Use Descriptions

Add descriptions to remember what each variable is for:

```
Name: API_KEY
Description: Production API key from Hedge.co dashboard
```

### 2. Organize with Prefixes

Use prefixes to group related variables:

```
REPORT_PATH
REPORT_EMAIL
REPORT_FORMAT

API_KEY
API_URL
API_TIMEOUT
```

### 3. Backup Regularly

Export your variables periodically as backup:

```
File → Export → Save as hedgebuddy-backup-2025-11-16.json
```

### 4. Test After Adding

After adding a critical variable, test it immediately:

```python
# test.py
import hedgebuddy
print(hedgebuddy.var("YOUR_NEW_VARIABLE"))
```

### 5. Path Separators

Windows uses backslashes (`\`) but you can also use forward slashes (`/`) - Python handles both:

```
✅ C:\Users\John\Reports
✅ C:/Users/John/Reports
```

---

## Troubleshooting

### App won't start

**Windows:**

- Make sure you extracted the **entire folder**, not just the `.exe`
- Check Windows Defender isn't blocking it
- Try running as Administrator

**macOS:**

- Right-click → "Open" to bypass security
- Check System Preferences → Security & Privacy → Allow app

### Variables not showing in Python

1. Verify variables are saved in the app
2. Check storage file exists:

   ```bash
   # Windows (PowerShell)
   cat $env:APPDATA\hedgebuddy\vars.json

   # macOS (Terminal)
   cat ~/Library/Application\ Support/hedgebuddy/vars.json
   ```

3. Validate JSON syntax (should be valid JSON)

### "Storage corrupted" error in Python

The `vars.json` file has invalid JSON syntax:

1. Open the desktop app
2. Your variables should still load (app is more forgiving)
3. Make a small edit and save (this will fix the JSON)

Or manually fix the JSON file in a text editor.

### Lost variables after reinstall

Variables are stored separately from the app, so they should survive reinstalls. Check the storage location (see above).

---

## Next Steps

- [Python Library Guide](python-library.md) - Using variables in your scripts
- [Examples](examples.md) - Real-world usage patterns
- [FAQ](faq.md) - Common questions
