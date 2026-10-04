"""
{"hedgebuddy": 1,
 "app": "foolcat",
 "event": "ReportCreated",
 "requires": {
   "SMOKE_FAIL": {"type": "bool", "default": false, "description": "Set to true to make the next run fail on purpose"}
 }}
---
Smoke test for FoolCat. Logs every field of each new report, and fails
on purpose while SMOKE_FAIL is true.
"""
import hedgebuddy as hb


@hb.script
def main(event, vars):
    hb.log(f"{event.name}: {len(event)} fields")
    for key in sorted(event):
        hb.log(f"  {key} = {event[key]!r}")
    if vars.SMOKE_FAIL:
        raise RuntimeError("smoke test")
