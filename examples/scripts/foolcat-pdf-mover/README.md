# FoolCat Report Mover

Automatically move or copy FoolCat PDF reports to a destination folder when they're created.

---

## Overview

This script integrates with FoolCat's "Report Created" event to automatically route PDF camera reports to a configured destination folder. Perfect for sending reports to production coordinators, editors, or archive locations without manual file management.

**Key Features:**

- ✅ Automatic PDF routing on report creation
- ✅ Configurable destination via HedgeBuddy (no hardcoded paths)
- ✅ Choice of move (delete original) or copy (keep original)
- ✅ Cross-platform (Windows & macOS)
- ✅ Auto-creates destination folders if needed

---

## Trigger Event

**FoolCat "Report Created"**

FoolCat fires this event immediately after generating a camera report, passing the PDF and HTML paths.

---

## Required HedgeBuddy Variables

- **`HB_FC_DESTINATION_PATH`** (Type: Path)
  - Where to move/copy reports
  - Example Windows: `D:\Production\Reports`
  - Example macOS: `/Volumes/Production/Reports`

---

## Optional HedgeBuddy Variables

- **`HB_FC_OPERATION_TYPE`** (Type: String)
  - Operation mode: `"move"` or `"copy"`
  - Default: `"move"` (deletes original after moving)
  - Set to `"copy"` to keep original in place

---

## Setup Instructions

### 1. Install Dependencies

```bash
pip install --user hedgebuddy
```

### 2. Configure Variables

**Option A - Import Template (Recommended):**

1. Open HedgeBuddy desktop app
2. Click "Import" button
3. Select `foolcat-report-mover-template.json`
4. Edit `HB_FC_DESTINATION_PATH` with your actual folder path
5. Save

**Option B - Manual Setup:**

1. Open HedgeBuddy desktop app
2. Click "Add Variable"
3. Add `HB_FC_DESTINATION_PATH`:
   - Name: `HB_FC_DESTINATION_PATH`
   - Type: Path
   - Value: Your reports folder (e.g., `D:\Production\Reports`)
   - Description: FoolCat report destination
4. (Optional) Add `HB_FC_OPERATION_TYPE`:
   - Name: `HB_FC_OPERATION_TYPE`
   - Type: String
   - Value: `move` or `copy`
   - Description: move (delete original) or copy (keep original)
5. Save

### 3. Add Script to FoolCat

1. Open FoolCat → Preferences → Automation
2. Add script to "Report Created" event
3. Point to: `foolcat-report-mover.py`
4. Save

### 4. Test

1. Generate a report in FoolCat
2. Check your configured destination folder
3. Verify the PDF was moved/copied successfully

---

## Example Configuration

```
Variable: HB_FC_DESTINATION_PATH
Type: Path
Value: D:\Production\DailyReports
Description: FoolCat report destination folder

Variable: HB_FC_OPERATION_TYPE
Type: String
Value: move
Description: move or copy (move deletes original)
```

---

## What It Does

1. **Receives FoolCat event** with PDF path
2. **Validates report creation** was successful
3. **Reads destination** from `HB_FC_DESTINATION_PATH` variable
4. **Reads operation mode** from `HB_FC_OPERATION_TYPE` (or defaults to "move")
5. **Creates destination folder** if it doesn't exist
6. **Moves or copies PDF** to destination
7. **Logs success/error** messages

---

## Use Cases

### Production Coordinator

Route all camera reports to production folder for daily review:

- `HB_FC_DESTINATION_PATH`: `D:\Production\DailyReports`
- `HB_FC_OPERATION_TYPE`: `move`

### Archive + Production

Keep original and send copy to production:

- `HB_FC_DESTINATION_PATH`: `D:\Production\Reports`
- `HB_FC_OPERATION_TYPE`: `copy`

### Network Share

Route to network location for multi-user access:

- `HB_FC_DESTINATION_PATH`: `\\server\Production\Reports`
- `HB_FC_OPERATION_TYPE`: `move`

---

## Change Productions?

**Just update `HB_FC_DESTINATION_PATH` in HedgeBuddy - no script editing needed!**

Different show? New location? Simply change the variable in the GUI and you're done. This is the power of HedgeBuddy - portable automation across productions.

---

## Troubleshooting

**"HB_FC_DESTINATION_PATH not configured"**

- Open HedgeBuddy app and add the variable
- Make sure the name matches exactly: `HB_FC_DESTINATION_PATH`

**"Source PDF not found"**

- Check FoolCat's report output settings
- Verify the event payload contains valid PDF path

**"Failed to create destination directory"**

- Check folder permissions
- Verify parent directories exist and are writable

**Script doesn't trigger**

- Verify script is added to FoolCat's "Report Created" event
- Check FoolCat's automation log for errors

---

## Files in This Example

- `foolcat-report-mover.py` - Main script
- `foolcat-report-mover-template.json` - HedgeBuddy import template
- `README.md` - This documentation
