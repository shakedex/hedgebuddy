# Hedge Payload Inspector

Debug tool for capturing and inspecting OffShoot/FoolCat event payloads.

---

## Overview

This utility script captures complete event payloads from Hedge apps (OffShoot, FoolCat, EditReady) and saves them to a JSON file for inspection. Essential for debugging automation scripts, discovering undocumented event fields, and verifying event data structure.

**Key Features:**

- ✅ Captures complete event payloads as JSON
- ✅ Appends to file with timestamps (keeps history)
- ✅ Configurable output location via HedgeBuddy
- ✅ Works with any Hedge app event
- ✅ Cross-platform (Windows & macOS)
- ✅ Human-readable JSON format

---

## Use Cases

### Script Development

Inspect actual event data to build automation scripts correctly:

- See all available fields
- Discover undocumented properties
- Verify data types and formats

### Debugging

Troubleshoot why your automation isn't working:

- Compare expected vs actual payloads
- Identify missing or changed fields
- Verify event triggers correctly

### Documentation

Document event structures for your team:

- Capture real-world examples
- Build reference for script developers
- Track event schema changes between versions

---

## Compatible Events

Works with all Hedge app events that pass JSON payloads:

**OffShoot:**

- File Copy Completed
- Disk Added
- Disk Removed
- Transfers Added
- And more...

**FoolCat:**

- Report Created
- Report Failed
- And more...

**EditReady:**

- File Conversion Completed
- And more...

---

## Required HedgeBuddy Variables

- **`HB_PAYLOAD_OUTPUT_PATH`** (Type: Path)
  - Full path to output JSON file
  - Example Windows: `D:\OffShoot\payloads.json`
  - Example macOS: `/Users/john/offshoot-payloads.json`
  - File will be created if it doesn't exist

---

## Setup Instructions

### 1. Install Dependencies

```bash
pip install --user hedgebuddy
```

### 2. Configure Output Path

**Option A - Import Template (Recommended):**

1. Open HedgeBuddy desktop app
2. Click "Import" button
3. Select `hedge-payload-inspector-template.json`
4. Edit `HB_PAYLOAD_OUTPUT_PATH` with your desired file path
5. Save

**Option B - Manual Setup:**

1. Open HedgeBuddy desktop app
2. Click "Add Variable"
3. Add `HB_PAYLOAD_OUTPUT_PATH`:
   - Name: `HB_PAYLOAD_OUTPUT_PATH`
   - Type: Path
   - Value: Full path to output file (e.g., `D:\Logs\payloads.json`)
   - Description: Output file for captured event payloads
4. Save

### 3. Add Script to Event

1. Open your Hedge app (OffShoot, FoolCat, etc.)
2. Go to Automation/Scripts settings
3. Add script to the event you want to inspect
4. Point to: `hedge-payload-inspector.py`
5. Save

### 4. Trigger Event

1. Perform action that triggers the event
   - OffShoot: Run a transfer
   - FoolCat: Generate a report
   - EditReady: Convert a file
2. Check your output JSON file
3. View captured payload with timestamp

---

## Example Configuration

```md
Variable: HB_PAYLOAD_OUTPUT_PATH
Type: Path
Value: D:\Logs\OffShoot\payloads.json
Description: Output file for OffShoot event payloads
```

---

## Output Format

The script creates a JSON array with timestamped payload entries:

```json
[
  {
    "timestamp": "2025-11-16 14:30:22",
    "payload": {
      "FileCopyCompleted_state": "Success",
      "FileCopyCompleted_bytesCopied": 52428800,
      "FileCopyCompleted_sourcePaths": "/Volumes/CARD_A001",
      "FileCopyCompleted_destinationPath": "D:\\Production\\CAM_A\\A001",
      "FileCopyCompleted_duration": "5.2"
    }
  },
  {
    "timestamp": "2025-11-16 14:35:18",
    "payload": {
      "FileCopyCompleted_state": "Failed",
      "FileCopyCompleted_error": "Disk full",
      "FileCopyCompleted_sourcePaths": "/Volumes/CARD_B002"
    }
  }
]
```

### File Structure

- **Array of objects**: Each event is a separate object
- **Timestamp**: ISO-style timestamp for each capture
- **Payload**: Complete event data as received
- **Append-only**: New events are added to the array
- **Sorted keys**: Easy to read and compare

---

## What It Does

1. **Receives event** from Hedge app (via `sys.argv[1]`)
2. **Parses JSON** payload
3. **Reads output path** from `HB_PAYLOAD_OUTPUT_PATH` variable
4. **Creates directory** if it doesn't exist
5. **Loads existing file** (if present) or starts new array
6. **Appends new payload** with timestamp
7. **Saves to file** with pretty formatting
8. **Logs success** with payload count

---

## Usage Examples

### Inspect OffShoot Transfer Events

```md
HB_PAYLOAD_OUTPUT_PATH: D:\Dev\offshoot-transfers.json
```

Add to: OffShoot → File Copy Completed event

Run transfers and inspect `offshoot-transfers.json` to see:

- All available transfer metadata
- Source info structure
- Preset names and verification modes

### Capture FoolCat Report Events

```md
HB_PAYLOAD_OUTPUT_PATH: D:\Dev\foolcat-reports.json
```

Add to: FoolCat → Report Created event

Generate reports and inspect `foolcat-reports.json` to see:

- PDF and HTML paths
- Report status and errors
- Available metadata fields

### Debug Multiple Events

Use the same output file for multiple event types:

```md
HB_PAYLOAD_OUTPUT_PATH: D:\Dev\all-events.json
```

Add inspector to multiple events to capture all payload types in one file.

---

## Workflow Tips

### Script Development Workflow

1. **Capture payloads** with inspector
2. **Review JSON file** to understand event structure
3. **Build automation script** using discovered fields
4. **Test script** with real events
5. **Keep inspector** for ongoing debugging

### Team Collaboration

1. **Capture production payloads** on set
2. **Share JSON file** with development team
3. **Reference actual data** when building scripts remotely
4. **Document event schemas** for team knowledge base

### Version Tracking

Use separate output files for different app versions:

- `offshoot-v24-payloads.json`
- `offshoot-v25-payloads.json`
- Compare files to track schema changes

---

## Change Productions?

**Just update `HB_PAYLOAD_OUTPUT_PATH` in HedgeBuddy!**

Different show? New logging location? Simply change the output path variable and continue capturing payloads without script changes.

---

## Troubleshooting

**"HB_PAYLOAD_OUTPUT_PATH not configured"**

- Open HedgeBuddy app and add the variable
- Make sure the name matches exactly: `HB_PAYLOAD_OUTPUT_PATH`
- Provide full path to output file (not just directory)

**"Failed to create output directory"**

- Check parent directory permissions
- Verify the path is valid for your OS
- Try a different location (e.g., user's home directory)

**"Failed to parse payload as JSON"**

- Event might not send JSON payload
- Check app's automation documentation
- Try a different event type

**File keeps growing too large**

- JSON file appends every event (intentional)
- Manually delete or archive old payloads
- Use different files for different debugging sessions
- Consider adding date to filename: `payloads-2025-11-16.json`

**No output file created**

- Verify script is added to event correctly
- Check event actually triggered
- Look for error messages in app's automation log
- Verify HedgeBuddy variable is configured

---

## Files in This Example

- `hedge-payload-inspector.py` - Main script
- `hedge-payload-inspector-template.json` - HedgeBuddy import template
- `README.md` - This documentation

---

## Advanced Usage

### Filter Specific Fields

After capturing payloads, use Python/jq to extract specific fields:

```python
import json

with open('payloads.json') as f:
    payloads = json.load(f)

# Extract only successful transfers
successful = [p for p in payloads
              if p['payload'].get('FileCopyCompleted_state') == 'Success']

# Get all source paths
sources = [p['payload'].get('FileCopyCompleted_sourcePaths')
           for p in payloads]
```

### Compare Event Types

Capture multiple events and compare structures:

```python
# Group by event type
from collections import defaultdict

by_type = defaultdict(list)
for entry in payloads:
    # Detect event type from keys
    keys = entry['payload'].keys()
    if 'FileCopyCompleted_state' in keys:
        by_type['transfer'].append(entry)
    elif 'ReportCreated_status' in keys:
        by_type['report'].append(entry)
```

### Generate Documentation

Use captured payloads to auto-generate event documentation for your team.
