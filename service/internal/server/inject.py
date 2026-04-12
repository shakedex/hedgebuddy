#!/usr/bin/env python3
"""
Quills inject.py — Universal Event Forwarder for Hedge Apps

Attach this script to any event in OffShoot, FoolCat, or EditReady.
It forwards the event payload to the Quills service via HTTP POST.

Usage (automatic — Hedge apps invoke this):
    python inject.py '{"FileCopyCompleted_state": "Success", ...}'

The Quills service auto-detects the source app and event type from
the payload field prefixes.
"""

import json
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

QUILLS_URL = "http://localhost:12345/api/events"
TIMEOUT_SECONDS = 5


def main():
    if len(sys.argv) < 2:
        print("inject.py: no event payload provided", file=sys.stderr)
        sys.exit(1)

    try:
        payload = json.loads(sys.argv[1])
    except (json.JSONDecodeError, ValueError) as e:
        print(f"inject.py: invalid JSON payload: {e}", file=sys.stderr)
        sys.exit(1)

    envelope = {
        "payload": payload,
        "received_at": datetime.now(timezone.utc).isoformat(),
    }

    data = json.dumps(envelope).encode("utf-8")
    req = urllib.request.Request(
        QUILLS_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            if resp.status == 200:
                sys.exit(0)
            else:
                body = resp.read().decode("utf-8", errors="replace")
                print(
                    f"inject.py: unexpected status {resp.status}: {body}",
                    file=sys.stderr,
                )
                sys.exit(1)
    except urllib.error.URLError as e:
        print(
            f"inject.py: could not reach Quills service at {QUILLS_URL}: {e.reason}",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as e:
        print(f"inject.py: unexpected error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
