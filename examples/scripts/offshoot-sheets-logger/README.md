# OffShoot Google Sheets Logger

Automatically log OffShoot transfer details to Google Sheets when transfers complete. Perfect for production tracking, DIT reports, and backup verification.

---

## Overview

This script integrates with OffShoot's "File Copy Completed" event to automatically log transfer metadata to a Google Sheets spreadsheet. Ideal for maintaining production logs, tracking daily transfers, or creating automated backup reports.

**Key Features:**

- ✅ Automatic Google Sheets logging on transfer completion
- ✅ Captures source name, size, file count, destination
- ✅ Auto-generates notes for failed transfers or verification issues
- ✅ Finds next empty row automatically
- ✅ Service account authentication (no OAuth prompts)
- ✅ Configurable via HedgeBuddy (no hardcoded credentials)
- ✅ Cross-platform (Windows & macOS)

---

## Trigger Event

**OffShoot "File Copy Completed"**

Fires when OffShoot completes any transfer. The script reads the detailed transfer log JSON file and extracts metadata for logging.

---

## Google Sheets Setup

### Spreadsheet Structure

Your Google Sheet should have these column headers (default: Row 6):

| cards | serial | size (GB) | files | notes | destination name | destination path |
| ----- | ------ | --------- | ----- | ----- | ---------------- | ---------------- |

**Column Descriptions:**

- **cards**: Source name (camera card/roll) - Auto-filled from `sourceName`
- **serial**: Manual entry field (left blank by script)
- **size (GB)**: Total transfer size in GB - Auto-filled as clean number (e.g., `520.45`)
- **files**: Number of files transferred - Auto-filled from `totalFilesTransferred`
- **notes**: Auto-filled on failures OR manual entry
- **destination name**: Destination name - Auto-filled from `destinationName`
- **destination path**: Full destination path - Auto-filled from `destination`

### Notes Field Auto-Population

The script automatically fills the `notes` column when:

- ✅ Transfer status is not "Success" (includes reason)
- ✅ Files failed to transfer
- ✅ Verification failed for files
- ✅ Files were skipped

Example: `Status: Failed - Disk full | Failed to transfer 3 file(s)`

---

## Required HedgeBuddy Variables

- **`HB_GS_SERVICE_ACCOUNT_JSON`** (Type: Path)

  - Full path to Google service account JSON key file
  - Example Windows: `D:\Keys\service-account.json`
  - Example macOS: `/Users/john/Keys/service-account.json`

- **`HB_GS_SPREADSHEET_ID`** (Type: String)
  - Google Sheets spreadsheet ID from URL
  - Example: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`
  - Find in URL: `https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit`

---

## Optional HedgeBuddy Variables

- **`HB_GS_SHEET_NAME`** (Type: String)

  - Name of the specific sheet/tab to update
  - Example: `Day 1`, `Nov 17 2025`, `Shoot Day 3`
  - Leave empty to use the first sheet in the spreadsheet
  - **Perfect for daily production logs!**

- **`HB_GS_HEADER_ROW`** (Type: String)
  - Row number where column headers are located
  - Default: `6`
  - Change if your headers are on a different row

---

## Setup Instructions

### 1. Install Dependencies

```bash
pip install --user hedgebuddy google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client
```

### 2. Create Google Service Account

1. **Go to Google Cloud Console**: https://console.cloud.google.com
2. **Create Project** (or use existing):

   - Click "Select a project" → "New Project"
   - Name it (e.g., "OffShoot Logger")
   - Click "Create"

3. **Enable Google Sheets API**:

   - In your project, go to "APIs & Services" → "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

4. **Create Service Account**:

   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "Service Account"
   - Name: `offshoot-logger` (or anything you like)
   - Click "Create and Continue"
   - Skip role assignment (click "Continue")
   - Click "Done"

5. **Download JSON Key**:

   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Select "JSON" format
   - Click "Create"
   - Save file securely (e.g., `D:\Keys\offshoot-service-account.json`)
   - ⚠️ **Keep this file secret!** It contains authentication credentials

6. **Copy Service Account Email**:
   - In the service account details, copy the email address
   - Format: `offshoot-logger@project-name.iam.gserviceaccount.com`

### 3. Share Google Sheet with Service Account

1. Open your Google Sheet
2. Click "Share" button (top right)
3. Paste the service account email
4. Set permission to **"Editor"**
5. **Uncheck** "Notify people" (it's not a real person)
6. Click "Share"

### 4. Configure HedgeBuddy Variables

**Option A - Import Template (Recommended):**

1. Open HedgeBuddy desktop app
2. Click "Import" button
3. Select `offshoot-sheets-logger-template.json`
4. Update values:
   - `HB_GS_SERVICE_ACCOUNT_JSON`: Full path to your JSON key file
   - `HB_GS_SPREADSHEET_ID`: Your spreadsheet ID from URL
   - `HB_GS_HEADER_ROW`: Row number with headers (default: 6)
5. Save

**Option B - Manual Setup:**

1. Open HedgeBuddy desktop app
2. Add variables:

```
Name: HB_GS_SERVICE_ACCOUNT_JSON
Type: Path
Value: D:\Keys\offshoot-service-account.json
Description: Google service account JSON key file

Name: HB_GS_SPREADSHEET_ID
Type: String
Value: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
Description: Google Sheets spreadsheet ID

Name: HB_GS_SHEET_NAME
Type: String
Value: Day 1
Description: Name of sheet/tab to update (optional)

Name: HB_GS_HEADER_ROW
Type: String
Value: 6
Description: Row number where headers are located
```

3. Save

### 5. Add Script to OffShoot

1. Open OffShoot → Settings → Automation → Scripts
2. Add script to "File Copy Completed" event
3. Point to: `offshoot-sheets-logger.py`
4. Save

### 6. Test

1. Run a transfer in OffShoot
2. Check your Google Sheet
3. Verify new row was added with transfer details

---

## Example Configuration

**Google Sheet:**

```
Row 6 (Headers):
cards | serial | size (GB) | files | notes | destination name | destination path

Row 7 (Auto-filled by script):
A001 |  | 520.45 | 42 |  | CAM_A | D:\Production\CAM_A\A001

Row 8 (Failed transfer example):
B002 |  | 0 | 0 | Status: Failed - Disk full | CAM_B | D:\Production\CAM_B\B002
```

**HedgeBuddy Variables:**

```
HB_GS_SERVICE_ACCOUNT_JSON: D:\Keys\offshoot-service-account.json
HB_GS_SPREADSHEET_ID: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
HB_GS_SHEET_NAME: Day 1
HB_GS_HEADER_ROW: 6
```

---

## What It Does

1. **Receives OffShoot event** with transfer completion data
2. **Reads transfer log JSON** file for detailed metadata
3. **Authenticates with Google** using service account
4. **Finds next empty row** after headers (on specified sheet/tab)
5. **Formats transfer data**:
   - Clean GB numbers for easy calculations
   - Auto-generates notes for failures
   - Preserves manual entry columns (serial)
6. **Writes to Google Sheets** in next available row
7. **Logs success** with transfer details

---

## Daily Production Workflow

**Common Setup for Multi-Day Productions:**

1. **Create one master spreadsheet** with multiple sheets/tabs:

   - Sheet 1: "Day 1"
   - Sheet 2: "Day 2"
   - Sheet 3: "Day 3"
   - etc.

2. **Each sheet has identical structure** (same headers on Row 6)

3. **Update `HB_GS_SHEET_NAME` daily**:

   - Day 1: Set to `Day 1`
   - Day 2: Change to `Day 2`
   - Day 3: Change to `Day 3`

4. **Or use date-based sheet names**:

   - `Nov 17 2025`
   - `Nov 18 2025`
   - Script automatically logs to correct date

5. **Total Calculations** (in summary rows 2-4):

```
Total Unique Cards: =COUNTA(UNIQUE(FILTER(A7:A1000, A7:A1000<>"")))
Total Files: =SUMIF(A7:A1000, UNIQUE(FILTER(A7:A1000, A7:A1000<>"")), D7:D1000)
Total Size: =SUMIF(A7:A1000, UNIQUE(FILTER(A7:A1000, A7:A1000<>"")), C7:C1000) & " GB"
```

**Why these formulas handle duplicates:**

- Same card backed up to multiple destinations = multiple rows
- `UNIQUE()` ensures each card counted once
- `SUMIF()` sums only first occurrence of each card

---

## Use Cases

### Production DIT Logging

Track all daily transfers for production reports:

- Source card names and roll numbers
- Transfer sizes and file counts
- Destination paths for post-production
- Notes field for manual comments

### Backup Verification

Maintain audit log of all backups:

- Verify all cards were backed up
- Check total data transferred per day
- Track verification failures

### Multi-Destination Tracking

Log transfers to multiple destinations:

- Primary backup (RAID)
- Secondary backup (NAS)
- Cloud uploads (S3)
- Each logged separately with destination info

### Failure Alerting

Auto-populate notes on issues:

- Transfer failures with reasons
- Verification errors
- Skipped files
- Quick visual scan of problems

---

## Change Productions?

**Just update the spreadsheet ID in HedgeBuddy!**

Different show? New season? Simply:

1. Create new Google Sheet (or duplicate existing)
2. Share with same service account
3. Update `HB_GS_SPREADSHEET_ID` variable
4. Done! Same script, new production

Or use multiple HedgeBuddy profiles for different shows!

---

## Troubleshooting

**"HB_GS_SERVICE_ACCOUNT_JSON not configured"**

- Open HedgeBuddy app and add the variable
- Make sure the name matches exactly: `HB_GS_SERVICE_ACCOUNT_JSON`
- Provide full path to JSON key file (not just directory)

**"Service account file not found"**

- Verify the path in HedgeBuddy variable is correct
- Check file exists at that location
- Use absolute path (not relative)

**"Failed to write to spreadsheet: 403"**

- Service account doesn't have access to the sheet
- Share the Google Sheet with service account email
- Set permission to "Editor"

**"Failed to write to spreadsheet: 404"**

- Spreadsheet ID is incorrect
- Check the ID in your browser URL
- Make sure you copied the full ID

**"Google Sheets libraries not installed"**

- Run: `pip install --user google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client`
- Restart terminal/command prompt after installation

**"No transfer log path in event payload"**

- OffShoot might not be providing the log path
- Check OffShoot version (requires recent version)
- Verify script is added to correct event

**Headers not found / Wrong row**

- Update `HB_GS_HEADER_ROW` variable to correct row number
- Row numbers start at 1 (not 0)

**Script writes to wrong columns**

- Verify headers match exactly (case-sensitive):
  - `cards`, `serial`, `size`, `files`, `notes`, `destination name`, `destination path`
- Check for extra spaces in header names

---

## Security Best Practices

### Service Account JSON Key

⚠️ **Keep this file secret!** It contains authentication credentials.

**Do:**

- ✅ Store in secure location (not in project folder)
- ✅ Restrict file permissions (Windows: Properties → Security; macOS: `chmod 600`)
- ✅ Never commit to Git
- ✅ Use different service accounts per production (optional)

**Don't:**

- ❌ Share the JSON file publicly
- ❌ Commit to version control
- ❌ Email or send via messaging apps
- ❌ Store in cloud sync folders (Dropbox, OneDrive) unless encrypted

### Revoking Access

If the JSON key is compromised:

1. Go to Google Cloud Console
2. Navigate to service account
3. Go to "Keys" tab
4. Delete the compromised key
5. Create new key and update HedgeBuddy variable

---

## Advanced Usage

### Multiple Productions

Create separate service accounts and sheets per production:

```
Production A:
- Service Account: production-a-logger@project.iam.gserviceaccount.com
- Sheet ID: abc123...
- HedgeBuddy Profile: "Production A"

Production B:
- Service Account: production-b-logger@project.iam.gserviceaccount.com
- Sheet ID: xyz789...
- HedgeBuddy Profile: "Production B"
```

### Custom Notes Logic

Modify the `build_notes_field()` function to add custom rules:

```python
def build_notes_field(transfer_log):
    """Build notes field based on transfer status and issues."""
    notes = []

    # Your custom logic here
    total_size = transfer_log.get('totalSize', 0)
    if total_size > 1_000_000_000_000:  # 1TB
        notes.append("Large transfer (>1TB)")

    # ... existing logic ...

    return " | ".join(notes) if notes else ""
```

### Conditional Logging

Only log certain transfers (e.g., only failures):

```python
# In main(), after loading transfer_log:
status = transfer_log.get('status', 'Success')
if status == 'Success':
    print("Transfer successful, skipping log (success-only mode disabled)")
    sys.exit(0)

# Continue with logging...
```

---

## Files in This Example

- `offshoot-sheets-logger.py` - Main script
- `offshoot-sheets-logger-template.json` - HedgeBuddy import template
- `README.md` - This documentation

---

## Related Examples

- **OffShoot Slack Notifier** - Get instant Slack alerts for transfers
- **Hedge Payload Inspector** - Debug OffShoot event payloads
- **FoolCat Report Mover** - Auto-route camera reports

---

## Support

- **GitHub Issues**: https://github.com/shakedex/hedgebuddy/issues
- **Documentation**: https://github.com/shakedex/hedgebuddy
- **Python Library**: `pip install hedgebuddy`
