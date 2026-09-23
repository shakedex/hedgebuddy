# Manual smoke checklist (phases 3 and 4)

These steps change real Hedge app settings and need a machine with OffShoot Pro (and optionally FoolCat Pro). Run them from Claude Desktop or Claude Code with the HedgeBuddy MCP server connected, or with `hedgebuddy call`. Record results in the boxes.

## 1. Environment
- [ ] `environment` shows the version, data directory, and the Python interpreter OffShoot uses. Result:
- [ ] `list_apps` shows OffShoot (and FoolCat) installed with the right versions and scripting enabled. Result:
- [ ] Run `environment` and `check_script` from Claude Desktop and watch the screen. Does a console window flash? (Python is started without hiding its window.) Result:

## 2. Clean up stale attachments
- [ ] `list_attachments` for offshoot shows `stale` entries pointing at deleted files (on the development machine: the old Quills scripts).
- [ ] For each: `clear_stale_attachment` with `dry_run: true`, then without. Afterwards `list_attachments` shows `detached`. Result:

## 3. Attach a real script
- [ ] Install the hedgebuddy package for the Python OffShoot uses, from a checkout of this repository: `py -3 -m pip install ./python`.
- [ ] `create_profile` `smoke`, then `write_script` `log_copy.py` with manifest app offshoot, event FileCopyCompleted. Make it an `@hb.script` script whose `main` calls `hb.log(f"{event.name}: {event.raw}")`. `check_script` reports no issues and does not say the package is missing. Result:
- [ ] `attach_script` with `dry_run`, then for real. `list_attachments` shows `attached`.
- [ ] Copy a small folder with OffShoot **without restarting it**. Did the script run? (If not, restart OffShoot and repeat.) Result — do attachments apply live or only after a restart?:
- [ ] `list_runs` shows the run of `log_copy.py` with status `ok`. Its log line holds the payload fields, such as `FileCopyCompleted_state`. Result:
- [ ] Make the script fail: `write_script` `log_copy.py` again with `raise RuntimeError("smoke test")` as the last line of `main`, then copy again. `list_runs` (or `get_run`) shows the new run with status `error` and a traceback ending in `RuntimeError: smoke test`. Restore the script afterwards. Result:
- [ ] If FoolCat is installed: `write_script` `log_report.py` with manifest app foolcat, event ReportCreated, and the same body. `attach_script` with `dry_run` first, then for real. Create a report in FoolCat. Did the script run? Result:

## 4. Commands
- [ ] `run_app_command` offshoot `open` with `wait_seconds: 5`: OffShoot comes to the front and `outcome.responses` shows the callback-log lines. Result:
- [ ] Card scenario with a card or any folder: `inspect_volume` → `write_preset` (dry run, then real) → `run_app_command reloadPresets` → `select_preset` → `run_app_command` `[reset {type: destinations}, setSource, setDestination × 2, addTransfers]` dry run, then without `confirmed` (refused), then `confirmed: true`. Did the transfer start with the right label, destinations, and folder pattern? Result:
- [ ] Did OffShoot pick up the selected preset without a restart? Result:
- [ ] In Claude Desktop, ask for the spec §14 card offload in plain language, for example: "Camera A finished card A003. I put it in the workstation. Name it A003, add it as a source in OffShoot, and offload it to my external drives with my usual commercial one-day folder scheme." Record which tools it called, whether it ran dry runs and asked you before `confirmed: true`, and whether the transfer started as asked. Result:
- [ ] Optional: with a catalog override (`<data>/catalog/offshoot.toml`) changing `reset` and `addTransfers` to `form = "action"`, does the whole scenario work as one `actions` URL? Result:

## 5. macOS (when available)
- [ ] `attach_script` writes `~/Library/Preferences/Hedge/Workspaces/HedgeBuddy.json`; applying it from the OffShoot Helper menu attaches the script. Result:
- [ ] `read_app_log` callback shows responses from `~/Library/Logs/Hedge/urlSchemeResponseLog.txt`; note whether that file is appended to or rewritten. Result:
