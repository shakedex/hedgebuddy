#!/usr/bin/env python3
"""
FoolCat Report Mover - HedgeBuddy Integration Example
======================================================

Automatically move or copy FoolCat PDF reports to a destination folder.

This script is triggered by FoolCat's "Report Created" event and uses
HedgeBuddy to manage configuration without hardcoding paths.

PREREQUISITES:
1. Install HedgeBuddy: pip install --user hedgebuddy
2. Configure these variables in HedgeBuddy desktop app:
   - HB_FC_DESTINATION_PATH (required): Where to move/copy reports
   - HB_FC_OPERATION_TYPE (optional): "move" or "copy" (default: "move")

USAGE:
1. Add this script to FoolCat's "Report Created" event
2. FoolCat will pass event data as JSON when report completes
3. Script reads destination from HedgeBuddy and moves/copies the PDF

EVENT PAYLOAD EXAMPLE:
{
  "ReportCreated_status": "Success",
  "ReportCreated_error": "none",
  "ReportCreated_pdfPath": "/Volumes/Hedge/A001/Reports.pdf",
  "ReportCreated_htmlPath": "/Volumes/Hedge/A001/Reports.html"
}
"""

import sys
import json
import shutil
from pathlib import Path

try:
    import hedgebuddy
except ImportError:
    print("ERROR: HedgeBuddy not installed. Run: pip install --user hedgebuddy")
    sys.exit(1)


def main():
    # Check if event payload was provided
    if len(sys.argv) < 2:
        print("ERROR: No event payload provided")
        print("This script should be triggered by FoolCat's 'Report Created' event")
        sys.exit(1)

    # Parse the event payload from FoolCat
    try:
        payload = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse event payload: {e}")
        sys.exit(1)

    # Extract event data
    status = payload.get("ReportCreated_status")
    error = payload.get("ReportCreated_error")
    pdf_path = payload.get("ReportCreated_pdfPath")
    html_path = payload.get("ReportCreated_htmlPath")

    # Check if report creation was successful
    if status != "Success":
        print(f"ERROR: Report creation failed: {error}")
        sys.exit(1)

    if not pdf_path:
        print("ERROR: No PDF path in event payload")
        sys.exit(1)

    # Load configuration from HedgeBuddy
    try:
        destination_path = hedgebuddy.var("HB_FC_DESTINATION_PATH")
    except hedgebuddy.VariableNotFoundError:
        print("ERROR: HB_FC_DESTINATION_PATH not configured in HedgeBuddy")
        print("Please add this variable using the HedgeBuddy desktop app")
        sys.exit(1)

    # Get operation type (move or copy), default to move
    operation_type = hedgebuddy.var("HB_FC_OPERATION_TYPE", "move").lower()
    if operation_type not in ["move", "copy"]:
        print(f"WARNING: Invalid HB_FC_OPERATION_TYPE '{operation_type}', defaulting to 'move'")
        operation_type = "move"

    # Convert paths to Path objects
    source_pdf = Path(pdf_path)
    destination_dir = Path(destination_path)

    # Validate source file exists
    if not source_pdf.exists():
        print(f"ERROR: Source PDF not found: {source_pdf}")
        sys.exit(1)

    # Create destination directory if it doesn't exist
    try:
        destination_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        print(f"ERROR: Failed to create destination directory: {e}")
        sys.exit(1)

    # Determine destination file path (same filename)
    destination_pdf = destination_dir / source_pdf.name

    # Perform the operation
    try:
        if operation_type == "copy":
            shutil.copy2(source_pdf, destination_pdf)
            print(f"✓ Copied: {source_pdf}")
            print(f"  To: {destination_pdf}")
        else:  # move
            shutil.move(str(source_pdf), str(destination_pdf))
            print(f"✓ Moved: {source_pdf}")
            print(f"  To: {destination_pdf}")

        print(f"\nOperation: {operation_type}")
        print(f"Report: {source_pdf.name}")
        print(f"Destination: {destination_path}")
        print("\n✓ FoolCat report processed successfully!")

    except Exception as e:
        print(f"ERROR: Failed to {operation_type} file: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
