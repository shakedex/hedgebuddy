# OffShoot Google Sheets Logger

Log OffShoot transfer details to Google Sheets on completion. Tracks source name, size, file count, destination, and auto-generates notes for failures.

**Trigger:** OffShoot "File Copy Completed"

---

## Variables

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `HB_GS_SERVICE_ACCOUNT_JSON` | Path | Yes | Path to Google service account JSON key file |
| `HB_GS_SPREADSHEET_ID` | String | Yes | Spreadsheet ID from the Google Sheets URL |
| `HB_GS_SHEET_NAME` | String | No | Sheet/tab name (default: first sheet). Useful for daily logs. |
| `HB_GS_HEADER_ROW` | String | No | Row number with column headers (default: `6`) |

## Spreadsheet Structure

Your sheet needs these column headers (on the header row):

| cards | serial | size (GB) | files | notes | destination name | destination path |
|-------|--------|-----------|-------|-------|------------------|------------------|

The script fills all columns except **serial** (left for manual entry). The **notes** column is auto-filled when transfers fail or have verification issues.

## Setup

### 1. Install dependencies

```bash
pip install --user hedgebuddy google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client
```

### 2. Create a Google service account

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create (or select) a project
2. Enable the **Google Sheets API** (APIs & Services > Library)
3. Create a **Service Account** (APIs & Services > Credentials > Create Credentials)
4. In the service account's **Keys** tab, create a JSON key and save it securely
5. Copy the service account email (e.g. `name@project.iam.gserviceaccount.com`)

### 3. Share the spreadsheet

Open your Google Sheet, click **Share**, paste the service account email, and give it **Editor** access.

### 4. Configure HedgeBuddy variables

Import `offshoot-sheets-logger-template.json` in the HedgeBuddy app, or add the variables manually. Set `HB_GS_SERVICE_ACCOUNT_JSON` and `HB_GS_SPREADSHEET_ID` at minimum.

### 5. Add to OffShoot

Add `offshoot-sheets-logger.py` to OffShoot's "File Copy Completed" event.

## Multi-Day Workflow

Create one spreadsheet with tabs per day (`Day 1`, `Day 2`, etc.) sharing the same header structure. Update `HB_GS_SHEET_NAME` each day — or use date-based names like `Nov 17 2025`.

## Security Note

The service account JSON key is a credential. Store it outside your project folder, restrict file permissions, and never commit it to version control.

## Troubleshooting

- **403 from Google** — The service account doesn't have Editor access to the sheet.
- **404 from Google** — Spreadsheet ID is wrong. Copy it from the URL: `docs.google.com/spreadsheets/d/[ID]/edit`.
- **"No transfer log path in event payload"** — Check OffShoot version and verify the script is on the right event.
- **Wrong columns** — Headers must match exactly (case-sensitive): `cards`, `serial`, `size (GB)`, `files`, `notes`, `destination name`, `destination path`.

## Files

- `offshoot-sheets-logger.py` — Main script
- `offshoot-sheets-logger-template.json` — HedgeBuddy import template
