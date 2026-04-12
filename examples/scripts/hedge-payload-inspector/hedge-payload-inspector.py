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
import ast
import os
import time
from datetime import datetime
from pathlib import Path

try:
    import hedgebuddy
except ImportError:
    print("ERROR: HedgeBuddy not installed. Run: pip install --user hedgebuddy")
    sys.exit(1)


def _escape_invalid_backslashes_in_json_strings(value):
    """Escape lone backslashes inside JSON strings.

    Some event emitters include Windows paths like "W:\" in string values,
    which is invalid JSON because "\" escapes the closing quote.
    """
    out = []
    in_string = False
    i = 0
    n = len(value)
    valid_escapes = {'"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'}

    while i < n:
        ch = value[i]

        if not in_string:
            out.append(ch)
            if ch == '"':
                in_string = True
            i += 1
            continue

        # Inside a JSON string
        if ch == '\\':
            next_ch = value[i + 1] if i + 1 < n else ''

            # Special-case broken Windows root paths in JSON strings, e.g. "Z:\"
            # where the trailing backslash accidentally escapes the closing quote.
            if next_ch == '"':
                after_quote = value[i + 2] if i + 2 < n else ''
                if after_quote in {',', '}', ']'}:
                    out.append('\\\\')
                    out.append('"')
                    in_string = False
                    i += 2
                    continue

            if next_ch in valid_escapes:
                out.append(ch)
                if i + 1 < n:
                    out.append(next_ch)
                    i += 2
                else:
                    i += 1
            else:
                # Convert invalid escape (e.g., "\," or "\D") into "\\,", "\\D"
                out.append('\\\\')
                i += 1
            continue

        out.append(ch)
        if ch == '"':
            in_string = False
        i += 1

    return ''.join(out)


def _acquire_lock(lock_path, timeout_seconds=5.0, poll_seconds=0.05):
    """Acquire a simple cross-process lock via exclusive lock-file creation."""
    start = time.time()
    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode("ascii", errors="ignore"))
            os.close(fd)
            return True
        except FileExistsError:
            if (time.time() - start) >= timeout_seconds:
                return False
            time.sleep(poll_seconds)


def _release_lock(lock_path):
    try:
        os.remove(lock_path)
    except FileNotFoundError:
        pass


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
    lock_file = Path(f"{output_file}.lock")

    # Get raw payload (some launchers split JSON across multiple argv entries)
    raw_payload = " ".join(sys.argv[1:]).strip()

    # Parse the event payload with robust fallbacks.
    # This is a debug tool, so we prefer capturing *something* over exiting.
    payload = None
    parse_error = None

    def _try_json(value):
        try:
            return json.loads(value), None
        except json.JSONDecodeError as e:
            return None, e

    # 1) Direct JSON parse
    payload, parse_error = _try_json(raw_payload)

    # 2) Strip matching wrapper quotes around full payload and parse again
    if payload is None and len(raw_payload) >= 2 and raw_payload[0] == raw_payload[-1] and raw_payload[0] in ('"', "'"):
        payload, parse_error = _try_json(raw_payload[1:-1])

    # 3) URL-decoded JSON (some systems pass encoded payloads)
    if payload is None and "%" in raw_payload:
        try:
            from urllib.parse import unquote
            decoded = unquote(raw_payload)
            payload, parse_error = _try_json(decoded)
        except Exception:
            pass

    # 4) Repair invalid backslashes in JSON strings (common with Windows paths)
    if payload is None and "\\" in raw_payload:
        repaired = _escape_invalid_backslashes_in_json_strings(raw_payload)
        payload, parse_error = _try_json(repaired)

    # 5) Python literal fallback (single-quoted dict/list from some emitters)
    if payload is None:
        try:
            literal_value = ast.literal_eval(raw_payload)
            if isinstance(literal_value, str):
                payload, parse_error = _try_json(literal_value)
                if payload is None:
                    payload = literal_value
            else:
                payload = literal_value
        except (ValueError, SyntaxError):
            pass

    if payload is None:
        payload = {
            "_parse_error": str(parse_error) if parse_error else "Unknown payload parse error",
            "_raw_payload": raw_payload,
            "_payload_format": "unparsed"
        }
        print("WARNING: Payload could not be parsed as JSON; saved raw payload for inspection")

    # Create parent directory if it doesn't exist
    try:
        output_file.parent.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        print(f"ERROR: Failed to create output directory: {e}")
        sys.exit(1)

    # Add new payload with timestamp
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    payload_entry = {
        "timestamp": timestamp,
        "payload": payload
    }

    # Save back to file (with lock to avoid concurrent overwrite)
    try:
        if not _acquire_lock(str(lock_file)):
            print("ERROR: Timed out waiting for payload file lock")
            sys.exit(1)

        try:
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

            existing_payloads.append(payload_entry)

            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(existing_payloads, f, indent=2, sort_keys=True)
        finally:
            _release_lock(str(lock_file))
        
        print(f"Payload saved to: {output_file}")
        print(f"  Timestamp: {timestamp}")
        print(f"  Total payloads in file: {len(existing_payloads)}")
        print(f"  Fields captured: {len(payload) if isinstance(payload, dict) else 'N/A'}")
        
    except Exception as e:
        print(f"ERROR: Failed to write to file: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
