# Hedge Payload Inspector

Capture and inspect event payloads from Hedge apps (OffShoot, FoolCat, EditReady). Useful for debugging automation scripts and discovering available event fields.

**Trigger:** Any Hedge app event that passes a JSON payload.

---

## Variables

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `HB_PAYLOAD_OUTPUT_PATH` | Path | Yes | Full path to output JSON file (created if missing) |

## Setup

1. `pip install --user hedgebuddy`
2. Import `hedge-payload-inspector-template.json` in the HedgeBuddy app (or add variables manually)
3. Set `HB_PAYLOAD_OUTPUT_PATH` to your desired output file (e.g. `D:\Logs\payloads.json`)
4. Add `hedge-payload-inspector.py` to any event in OffShoot/FoolCat/EditReady

## Output Format

Each event is appended as a timestamped entry:

```json
[
  {
    "timestamp": "2025-11-16 14:30:22",
    "payload": {
      "FileCopyCompleted_state": "Success",
      "FileCopyCompleted_bytesCopied": 52428800,
      "FileCopyCompleted_sourcePaths": "/Volumes/CARD_A001"
    }
  }
]
```

The file grows over time (append-only). Delete or archive it when it gets large.

## Troubleshooting

- **"HB_PAYLOAD_OUTPUT_PATH not configured"** — Add the variable in the HedgeBuddy app. Provide the full file path, not just a directory.
- **"Failed to parse payload as JSON"** — The event may not send JSON. Check the app's automation docs.
- **No output file created** — Verify the script is assigned to the correct event and the event actually fires.

## Files

- `hedge-payload-inspector.py` — Main script
- `hedge-payload-inspector-template.json` — HedgeBuddy import template
