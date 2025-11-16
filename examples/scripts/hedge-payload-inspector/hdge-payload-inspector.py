#!/usr/bin/env python3
"""
OffShoot Payload Inspector - Debug Tool
========================================

Saves OffShoot event payloads to a JSON file for inspection.

PREREQUISITES:
1. Install HedgeBuddy: pip install --user hedgebuddy
2. Configure in HedgeBuddy desktop app:
   - HB_PAYLOAD_OUTPUT_PATH (required): Full path to output JSON file
     Example: D:\\OffShoot\\payloads.json or /Users/john/offshoot-payloads.json

USAGE:
1. Add this script to any OffShoot event
2. Trigger the event (run a transfer, add disk, etc.)
3. Open the JSON file to see all captured payloads

Each event appends to the JSON array with timestamp and complete payload data.
"""

import sys
import json
from datetime import datetime
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
        print("This script should be triggered by an OffShoot event")
        sys.exit(1)

    # Get output path from HedgeBuddy
    try:
        output_path_str = hedgebuddy.var("HB_PAYLOAD_OUTPUT_PATH")
    except hedgebuddy.VariableNotFoundError:
        print("ERROR: HB_PAYLOAD_OUTPUT_PATH not configured in HedgeBuddy")
        print("Please add this variable with the full path to your output JSON file")
        print("Example: D:\\OffShoot\\payloads.json")
        sys.exit(1)

    output_file = Path(output_path_str)

    # Get raw payload
    raw_payload = sys.argv[1]

    # Parse the event payload
    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse payload as JSON: {e}")
        sys.exit(1)

    # Create parent directory if it doesn't exist
    try:
        output_file.parent.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        print(f"ERROR: Failed to create output directory: {e}")
        sys.exit(1)

    # Load existing payloads or create new array
    existing_payloads = []
    if output_file.exists():
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                existing_payloads = json.load(f)
                if not isinstance(existing_payloads, list):
                    existing_payloads = []
        except (json.JSONDecodeError, Exception):
            # If file is corrupted or invalid, start fresh
            existing_payloads = []

    # Add new payload with timestamp
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    payload_entry = {
        "timestamp": timestamp,
        "payload": payload
    }
    existing_payloads.append(payload_entry)

    # Save back to file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(existing_payloads, f, indent=2, sort_keys=True)
        
        print(f"✓ Payload saved to: {output_file}")
        print(f"  Timestamp: {timestamp}")
        print(f"  Total payloads in file: {len(existing_payloads)}")
        print(f"  Fields captured: {len(payload) if isinstance(payload, dict) else 'N/A'}")
        
    except Exception as e:
        print(f"ERROR: Failed to write to file: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
