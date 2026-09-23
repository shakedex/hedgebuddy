# Manual smoke checklist (phase 3)

These steps change real Hedge app settings and need a machine with OffShoot Pro (and optionally FoolCat Pro). Run them from Claude Desktop or Claude Code with the HedgeBuddy MCP server connected, or with `hedgebuddy call`. Record results in the boxes.

## 1. Environment
- [ ] `environment` shows the version, data directory, and the Python interpreter OffShoot uses. Result:
- [ ] `list_apps` shows OffShoot (and FoolCat) installed with the right versions and scripting enabled. Result:

## 2. Clean up stale attachments
- [ ] `list_attachments` for offshoot shows `stale` entries pointing at deleted files (on the development machine: the old Quills scripts).
- [ ] For each: `clear_stale_attachment` with `dry_run: true`, then without. Afterwards `list_attachments` shows `detached`. Result:

## 3. Attach a real script
- [ ] `create_profile` `smoke`, then `write_script` `log_copy.py` with manifest app offshoot, event FileCopyCompleted, whose body appends `sys.argv[1]` to a text file in your home folder (plain Python; the hedgebuddy package is phase 4).
- [ ] `attach_script` with `dry_run`, then for real. `list_attachments` shows `attached`.
- [ ] Copy a small folder with OffShoot **without restarting it**. Did the script run? (If not, restart OffShoot and repeat.) Result — do attachments apply live or only after a restart?:

## 4. Commands
- [ ] `run_app_command` offshoot `open` with `wait_seconds: 5`: OffShoot comes to the front and `outcome.responses` shows the callback-log lines. Result:
- [ ] Card scenario with a card or any folder: `inspect_volume` → `write_preset` (dry run, then real) → `run_app_command reloadPresets` → `select_preset` → `run_app_command` `[reset {type: destinations}, setSource, setDestination × 2, addTransfers]` dry run, then without `confirmed` (refused), then `confirmed: true`. Did the transfer start with the right label, destinations, and folder pattern? Result:
- [ ] Did OffShoot pick up the selected preset without a restart? Result:
- [ ] Optional: with a catalog override (`<data>/catalog/offshoot.toml`) changing `reset` and `addTransfers` to `form = "action"`, does the whole scenario work as one `actions` URL? Result:

## 5. macOS (when available)
- [ ] `attach_script` writes `~/Library/Preferences/Hedge/Workspaces/HedgeBuddy.json`; applying it from the OffShoot Helper menu attaches the script. Result:
- [ ] `read_app_log` callback shows responses from `~/Library/Logs/Hedge/urlSchemeResponseLog.txt`; note whether that file is appended to or rewritten. Result:
