# Desktop App Guide

---

## Installation

### Windows

1. Download from [Releases](https://github.com/shakedex/hedgebuddy/releases)
2. Extract the folder
3. Run `HedgeBuddy.exe`

### macOS

1. Download from [Releases](https://github.com/shakedex/hedgebuddy/releases)
2. Open `.dmg`, drag to Applications
3. **Important (unsigned app):** Run this command in Terminal before first launch:
   ```bash
   xattr -cr /Applications/HedgeBuddy.app
   ```
4. Open HedgeBuddy from Applications

---

## Variable Types

| Type | Use For | Validation |
|------|---------|------------|
| **String** | API keys, text | Non-empty |
| **Path** | File/folder paths | Checks if exists |
| **URL** | Web addresses | http/https format |

---

## Managing Variables

### Add

1. Click **"+ New"**
2. Fill in Name, Value, Type
3. Click **Save**

### Edit

Click the edit icon on any variable card.

### Delete

Click the trash icon → Confirm.

---

## Import/Export

### Export

Click folder icon → Save JSON file as backup.

### Import

Click import icon → Select JSON file → Variables are added.

## Profiles

- Use the **profile dropdown** in the main toolbar to switch active profile instantly.
- Click the **gear button** to open profile management.
- In profile management, you can create, rename, duplicate, delete, and import profiles.

### Import as Profile

Use **Profile Manager** (gear button in the top toolbar) → **Import as Profile** to create a brand-new profile from a JSON template.

**Format:**

```json
{
  "variables": {
    "API_KEY": {
      "value": "your-key",
      "type": "string",
      "description": "optional"
    }
  }
}
```

---

## Storage

**Location:**

- Windows: `%APPDATA%\HedgeBuddy\profiles.json` and `%APPDATA%\HedgeBuddy\profiles\<active>\vars.json`
- macOS: `~/Library/Application Support/HedgeBuddy/profiles.json` and `~/Library/Application Support/HedgeBuddy/profiles/<active>/vars.json`

---

## Python Library Setup

HedgeBuddy automatically checks for the `hedgebuddy` Python library on startup so your scripts can read variables without any manual setup.

### What happens on first launch

| Situation | What the app does |
|-----------|------------------|
| Python not found | Shows a dialog with a link to [python.org](https://www.python.org/downloads/) |
| Python found, library missing | Prompts to install `hedgebuddy` automatically |
| Everything OK | No dialog — fully ready |

### Automatic install

When the library is missing, click **Install Now** in the prompt. The app runs:

```
pip install --user hedgebuddy
```

### Skip or silence

Click **Don't Ask Again** in either dialog to permanently suppress the check. This preference is saved per machine. You can re-trigger a manual install at any time by running the pip command above in a terminal.

---

## Troubleshooting

### App won't start

- **Windows:** Extract entire folder, not just `.exe`. Check Windows Defender.
- **macOS:** Right-click → Open (first time).

### Variables not showing in Python

Check file exists:

```bash
# Windows
cat $env:APPDATA\HedgeBuddy\profiles.json
cat $env:APPDATA\HedgeBuddy\profiles\default\vars.json

# macOS
cat ~/Library/Application\ Support/HedgeBuddy/profiles.json
cat ~/Library/Application\ Support/HedgeBuddy/profiles/default/vars.json
```

---

## Next Steps

- [Python Library](python-library.md)
- [Examples](examples.md)
- [FAQ](faq.md)
