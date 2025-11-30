#!/usr/bin/env python3
"""
OffShoot Google Sheets Logger - HedgeBuddy Integration Example
===============================================================

Automatically log OffShoot transfer details to Google Sheets when transfers complete.

This script is triggered by OffShoot's "File Copy Completed" event and uses
HedgeBuddy to manage Google Sheets configuration without hardcoding credentials.

PREREQUISITES:
1. Install dependencies:
   pip install --user hedgebuddy google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client

2. Set up Google Service Account:
   - Go to Google Cloud Console: https://console.cloud.google.com
   - Create a new project (or use existing)
   - Enable Google Sheets API
   - Create Service Account credentials
   - Download JSON key file

3. Share Google Sheet with Service Account:
   - Open your Google Sheet
   - Click "Share" button
   - Add service account email (from JSON key file)
   - Give "Editor" permissions

4. Configure variables in HedgeBuddy desktop app:
   - HB_GS_SERVICE_ACCOUNT_JSON (required): Full path to service account JSON file
   - HB_GS_SPREADSHEET_ID (required): Google Sheets spreadsheet ID from URL
   - HB_GS_SHEET_NAME (optional): Name of sheet/tab to update (e.g., "Day 1", "Nov 17")
   - HB_GS_HEADER_ROW (optional): Row number where headers are (default: 6)

USAGE:
1. Add this script to OffShoot's "File Copy Completed" event
2. OffShoot will pass event data as JSON when transfer completes
3. Script reads transfer log JSON file and logs to Google Sheets

GOOGLE SHEETS COLUMNS (Row 6):
- cards: Source name (camera card/roll)
- serial: Manual entry (left blank by script)
- size: Total transfer size
- files: Number of files transferred
- notes: Auto-filled on failures or manual entry
- destination name: Destination name from OffShoot
- destination path: Full destination path

CROSS-PLATFORM:
Works on both Windows and macOS!
"""

import sys
import json
from pathlib import Path
from datetime import datetime

try:
    import hedgebuddy
except ImportError:
    print("ERROR: HedgeBuddy not installed. Run: pip install --user hedgebuddy")
    sys.exit(1)

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
except ImportError:
    print("ERROR: Google Sheets libraries not installed.")
    print("Run: pip install --user google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client")
    sys.exit(1)


def format_bytes_to_gb(bytes_value):
    """Convert bytes to GB (decimal number for spreadsheet calculations)."""
    try:
        bytes_value = int(bytes_value)
    except (ValueError, TypeError):
        return 0.0
    
    # Convert to GB
    gb_value = bytes_value / (1024 ** 3)
    return round(gb_value, 2)


def format_bytes(bytes_value):
    """Convert bytes to human-readable format."""
    try:
        bytes_value = int(bytes_value)
    except (ValueError, TypeError):
        return "0 B"
    
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_value < 1024.0:
            return f"{bytes_value:.2f} {unit}"
        bytes_value /= 1024.0
    return f"{bytes_value:.2f} PB"


def get_google_sheets_service():
    """Authenticate and return Google Sheets API service."""
    try:
        service_account_file = hedgebuddy.var("HB_GS_SERVICE_ACCOUNT_JSON")
    except hedgebuddy.VariableNotFoundError:
        print("ERROR: HB_GS_SERVICE_ACCOUNT_JSON not configured in HedgeBuddy")
        print("Please add the full path to your service account JSON file")
        sys.exit(1)
    
    # Validate service account file exists
    if not Path(service_account_file).exists():
        print(f"ERROR: Service account file not found: {service_account_file}")
        sys.exit(1)
    
    # Authenticate
    SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
    credentials = service_account.Credentials.from_service_account_file(
        service_account_file, scopes=SCOPES
    )
    
    service = build('sheets', 'v4', credentials=credentials)
    return service


def find_next_empty_row(service, spreadsheet_id, sheet_name, header_row):
    """Find the next empty row after headers."""
    try:
        # Build range with sheet name
        range_name = f'{sheet_name}!A{header_row}:Z1000' if sheet_name else f'A{header_row}:Z1000'
        
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=range_name
        ).execute()
        
        values = result.get('values', [])
        
        if not values:
            # No data, start right after header
            return header_row + 1
        
        # Find first completely empty row
        for i, row in enumerate(values):
            row_number = header_row + i
            # Skip header row itself
            if i == 0:
                continue
            # Check if row is empty (no values or all empty strings)
            if not row or all(cell.strip() == '' for cell in row):
                return row_number
        
        # If all rows have data, add to the end
        return header_row + len(values)
        
    except HttpError as e:
        print(f"ERROR: Failed to read spreadsheet: {e}")
        sys.exit(1)


def build_notes_field(transfer_log):
    """Build notes field based on transfer status and issues."""
    notes = []
    
    status = transfer_log.get('status', 'Unknown')
    
    # Add status if not success
    if status != 'Success':
        reason = transfer_log.get('reason', 'No reason provided')
        notes.append(f"Status: {status} - {reason}")
    
    # Check for files that couldn't be transferred
    failed_files = transfer_log.get('couldNotTransferFiles', [])
    if failed_files:
        notes.append(f"Failed to transfer {len(failed_files)} file(s)")
    
    # Check for verification failures
    failed_verification = transfer_log.get('failedVerificationFiles', [])
    if failed_verification:
        notes.append(f"Verification failed for {len(failed_verification)} file(s)")
    
    # Check for skipped files
    skipped_files = transfer_log.get('skippedFiles', [])
    if skipped_files:
        notes.append(f"Skipped {len(skipped_files)} file(s)")
    
    return " | ".join(notes) if notes else ""


def log_transfer_to_sheets(service, spreadsheet_id, sheet_name, transfer_log, header_row):
    """Log transfer data to Google Sheets."""
    
    # Extract data from transfer log
    source_name = transfer_log.get('sourceName', 'Unknown')
    total_size = transfer_log.get('totalSize', 0)
    total_files = transfer_log.get('totalFilesTransferred', 0)
    destination_name = transfer_log.get('destinationName', 'Unknown')
    destination_path = transfer_log.get('destination', 'Unknown')
    notes = build_notes_field(transfer_log)
    
    # Format size to GB (clean number)
    size_gb = format_bytes_to_gb(total_size)
    
    # Find next empty row
    next_row = find_next_empty_row(service, spreadsheet_id, sheet_name, header_row)
    
    # Build row data
    # Columns: cards, serial, size (GB), files, notes, destination name, destination path
    row_data = [
        source_name,           # cards
        "",                    # serial (manual entry)
        size_gb,               # size (GB) - clean number for calculations
        total_files,           # files (keep as number, not string)
        notes,                 # notes
        destination_name,      # destination name
        destination_path       # destination path
    ]
    
    # Write to sheet
    range_name = f'{sheet_name}!A{next_row}:G{next_row}' if sheet_name else f'A{next_row}:G{next_row}'
    body = {
        'values': [row_data]
    }
    
    try:
        result = service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=range_name,
            valueInputOption='RAW',
            body=body
        ).execute()
        
        print(f"✓ Transfer logged to Google Sheets")
        print(f"  Sheet: {sheet_name if sheet_name else '(first sheet)'}")
        print(f"  Row: {next_row}")
        print(f"  Source: {source_name}")
        print(f"  Files: {total_files}")
        print(f"  Size: {size_gb} GB")
        print(f"  Destination: {destination_name}")
        if notes:
            print(f"  Notes: {notes}")
        
        return True
        
    except HttpError as e:
        print(f"ERROR: Failed to write to spreadsheet: {e}")
        return False


def main():
    # Check if event payload was provided
    if len(sys.argv) < 2:
        print("ERROR: No event payload provided")
        print("This script should be triggered by OffShoot's 'File Copy Completed' event")
        sys.exit(1)

    # Parse the event payload from OffShoot
    try:
        payload = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse event payload: {e}")
        sys.exit(1)

    # Get transfer log JSON path from payload
    transfer_log_path = payload.get("FileCopyCompleted_transferLogJSONPath")
    
    if not transfer_log_path:
        print("ERROR: No transfer log path in event payload")
        sys.exit(1)
    
    # Read transfer log JSON file
    transfer_log_file = Path(transfer_log_path)
    
    if not transfer_log_file.exists():
        print(f"ERROR: Transfer log file not found: {transfer_log_path}")
        sys.exit(1)
    
    try:
        with open(transfer_log_file, 'r', encoding='utf-8') as f:
            transfer_log = json.load(f)
    except Exception as e:
        print(f"ERROR: Failed to read transfer log: {e}")
        sys.exit(1)
    
    # Load Google Sheets configuration from HedgeBuddy
    try:
        spreadsheet_id = hedgebuddy.var("HB_GS_SPREADSHEET_ID")
    except hedgebuddy.VariableNotFoundError:
        print("ERROR: HB_GS_SPREADSHEET_ID not configured in HedgeBuddy")
        print("Please add your Google Sheets spreadsheet ID")
        print("Find it in the URL: https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit")
        sys.exit(1)
    
    # Optional: Header row (default to 6)
    header_row = int(hedgebuddy.var("HB_GS_HEADER_ROW", "6"))
    
    # Optional: Sheet name (default to first sheet)
    sheet_name = hedgebuddy.var("HB_GS_SHEET_NAME", None)
    if sheet_name:
        sheet_name = sheet_name.strip()
        if not sheet_name:
            sheet_name = None
    
    # Get Google Sheets service
    print("Authenticating with Google Sheets...")
    service = get_google_sheets_service()
    
    # Log transfer to Google Sheets
    print("Logging transfer to Google Sheets...")
    success = log_transfer_to_sheets(service, spreadsheet_id, sheet_name, transfer_log, header_row)
    
    if success:
        print("\n✓ OffShoot transfer logged successfully!")
    else:
        print("\n❌ Failed to log transfer")
        sys.exit(1)


if __name__ == "__main__":
    main()
