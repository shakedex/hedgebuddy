#!/usr/bin/env python3
"""Per-event inject script: OffShoot / TransfersAdded"""
import json, re, sys, urllib.request, urllib.error
from datetime import datetime, timezone

APP_ID = "offshoot"
EVENT_NAME = "TransfersAdded"
QUILLS_URL = "http://localhost:12345/api/events"


def _parse_payload():
    """Try multiple strategies to recover JSON from argv.

    Windows command processing may strip outer quotes, split on spaces
    inside nested objects, or mangle backslash-heavy paths.  We attempt
    several reconstruction strategies before giving up gracefully.
    """
    if len(sys.argv) < 2:
        return {}

    # Strategy 1: first argument is the complete JSON (works on macOS / well-quoted Windows).
    try:
        return json.loads(sys.argv[1])
    except (json.JSONDecodeError, ValueError):
        pass

    # Strategy 2: shell split the JSON across multiple argv — rejoin.
    raw = " ".join(sys.argv[1:])
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        pass

    # Strategy 3: Windows sometimes doubles or strips quotes around
    # the whole argument.  Try stripping stray leading/trailing quotes.
    stripped = raw.strip().strip("'\"")
    try:
        return json.loads(stripped)
    except (json.JSONDecodeError, ValueError):
        pass

    # Strategy 4: Hedge on Windows produces paths like F:\ whose trailing
    # backslash merges with the closing quote to form \" (an escaped quote
    # in JSON).  Detect \" followed by a JSON structural char and double
    # the backslash so the parser sees \\" (literal backslash + end quote).
    fixed = re.sub(r'(?<!\\)\\"(?=[,}\]])', r'\\\\"', raw)
    try:
        return json.loads(fixed)
    except (json.JSONDecodeError, ValueError):
        pass

    # All strategies failed — log the raw input for debugging.
    print(f"inject [{APP_ID}/{EVENT_NAME}]: could not parse payload, "
          f"len(argv)={len(sys.argv)}, raw({len(raw)} chars)={raw[:200]}",
          file=sys.stderr)
    return {}


def main():
    payload = _parse_payload()

    envelope = {
        "app": APP_ID,
        "event": EVENT_NAME,
        "payload": payload,
        "received_at": datetime.now(timezone.utc).isoformat(),
    }

    data = json.dumps(envelope).encode("utf-8")
    req = urllib.request.Request(
        QUILLS_URL, data=data,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            sys.exit(0 if resp.status == 200 else 1)
    except Exception as e:
        print(f"inject [{APP_ID}/{EVENT_NAME}]: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()