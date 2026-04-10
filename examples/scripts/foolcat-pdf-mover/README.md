# FoolCat Report Mover

Move or copy FoolCat PDF camera reports to a destination folder on creation.

**Trigger:** FoolCat "Report Created"

---

## Variables

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `HB_FC_DESTINATION_PATH` | Path | Yes | Where to move/copy reports |
| `HB_FC_OPERATION_TYPE` | String | No | `"move"` (default) or `"copy"` |

## Setup

1. `pip install --user hedgebuddy`
2. Import `foolcat-report-mover-template.json` in the HedgeBuddy app (or add variables manually)
3. Set `HB_FC_DESTINATION_PATH` to your reports folder
4. Add `foolcat-report-mover.py` to FoolCat's "Report Created" event

## What It Does

1. Receives FoolCat event with PDF path
2. Reads destination from `HB_FC_DESTINATION_PATH`
3. Creates destination folder if needed
4. Moves or copies the PDF (based on `HB_FC_OPERATION_TYPE`)

## Troubleshooting

- **"HB_FC_DESTINATION_PATH not configured"** — Add the variable in the HedgeBuddy app. Name must match exactly.
- **"Source PDF not found"** — Check FoolCat's report output settings.
- **Script doesn't trigger** — Verify it's added to the correct event in FoolCat.

## Files

- `foolcat-report-mover.py` — Main script
- `foolcat-report-mover-template.json` — HedgeBuddy import template
