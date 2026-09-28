# Manual smoke checklist (phases 3, 4, 5A, 5B and 5C)

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

## 6. Desktop app (phase 5A)
Run on Windows and macOS.
- [ ] Launch the app (`cargo tauri dev` from `crates/app`, or an installer build). Home shows the active profile, the four readouts and Needs attention. Result:
- [ ] With the app open, run `hedgebuddy call set_var '{"name":"SMOKE","type":"string","value":"1"}'` in a terminal. The Variables count on Home changes within a second without clicking. Result:
- [ ] Ask Claude (MCP) to run any write tool. Home's "Claude, lately" shows the call within a second. Result:
- [ ] Make a script fail (section 3). Home shows the failure with a red Failed readout; Runs shows the run with its traceback; Copy details pastes a readable summary. Result:
- [ ] In Runs, open a run and click Copy details, then paste into a text editor. In the real webview (not the browser preview), the clipboard holds a readable run summary. Result:
- [ ] Put the window beside OffShoot at about 480 px wide. The sidebar becomes the icon rail with badges, Home keeps the run counts, Needs attention and Recent runs, and Runs shows the list with the detail sliding over it. Result:
- [ ] Hold the data folder's lock (run `hedgebuddy call run_app_command` with a long `wait_seconds` from Claude) and switch profiles in the app. The "Another HedgeBuddy is busy" toast offers Try again. Result:
- [ ] Close the window: the app quits, and nothing stays in the tray or task list. Result:

## 7. Typed tool results (MCP clients)
- [ ] With Claude Desktop or Claude Code connected, run a tool call. It still works, and the client shows no schema error for the new `outputSchema` / `structuredContent` (JSON Schema 2020-12). Result:

## 8. Desktop app editing (phase 5B)
Run on Windows and macOS. These steps change real Hedge app settings; wait for the go-ahead before running this section.
- [ ] Variables: add, edit and delete one variable of each type; Reveal a secret; a path on an unplugged drive shows "not connected" and still saves; leaving with an unsaved edit asks first. Result:
- [ ] A secret's description can be changed without re-typing the secret; the stored value is kept and never leaves Rust. Result:
- [ ] New script refuses a name that already exists in the profile, compared case-insensitively. Result:
- [ ] Scripts: New from template opens the file in the editor (with and without an editor command in preferences.json; without one, Notepad on Windows or the default text editor on macOS — never the script's own .py default app). Result:
- [ ] Attach, Detach and Sync each show the preview (registry rows on Windows; the OffShoot Helper workspace and the apply note on macOS) and change the app's setting as shown. Result:
- [ ] The scripts CHECK section shows the Python version, whether the script compiles, and the hedgebuddy package version or its problem. Result:
- [ ] Hedge apps: Clear one stale entry and Clear all; if Clear all fails partway, it stops, names the event that failed, and a retry skips the ones already cleared; the table updates after Refresh and on returning to the window. Result:
- [ ] Delete a script, a variable and a profile: each preview names what stays attached. Result:
- [ ] Export a profile without and with secrets (on macOS the file with secrets is owner-only: `ls -l`), then import it under a new name on the same or another machine. Result:
- [ ] Import a profile from Home's first step on a machine (or a fresh profile folder) with no active profile. Result:
- [ ] Show in folder and Docs open the right places. Result:
- [ ] Edit a catalog override in `<data>/catalog/` while the app is open: Hedge apps and Scripts reflect it without a restart. Result:

## 9. Desktop app connect and settings (phase 5C)
Run on Windows and macOS. These steps change Claude Desktop's config file and the Python environment the Hedge apps use; wait for the go-ahead before running this section. On Windows, when Claude Desktop is installed as an app package (the MSIX Claude: one `Claude_*` folder in `%LOCALAPPDATA%\Packages`), run the Claude Desktop items below (the config path, Set up, Update and activity) against it.
- [ ] Connect's Claude Desktop panel shows the right config path: `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude` when exactly one `Claude_*` package is installed, else `%APPDATA%\Claude` on Windows; `~/Library/Application Support/Claude` on macOS. Result:
- [ ] MSIX edge case (Windows): with one `Claude_*` package installed but no config file in its folder, while `%APPDATA%\Claude` does have one with other servers, Connect shows the package's config path and lists those other servers, and Set up's preview says it starts from the `%APPDATA%` config, with no backup. Apply it: the package's folder now holds the config, with the other servers and `hedgebuddy`, and the `%APPDATA%` file is unchanged. After restarting Claude Desktop, HedgeBuddy's tools and the other servers all work. Result:
- [ ] Set up previews the change (the file, `mcpServers.hedgebuddy`, and a timestamped backup of the config in its folder), applies it, writes the backup, and keeps every other server already in the file. After restarting Claude Desktop, HedgeBuddy's tools appear in a new chat. Result:
- [ ] Manually add a README-style entry (`"command": "hedgebuddy"`) to `claude_desktop_config.json`, restart Claude Desktop, then use Connect's Update: it points the entry at the bundled binary, keeps other servers, and HedgeBuddy still works after restarting again. Result:
- [ ] Make the config invalid (truncate it to `{`, say): Connect shows "can't read the config" and Set up/Update is refused; the file is untouched. Result:
- [ ] Copy the Claude Code command from Connect and run it as printed: `claude mcp add hedgebuddy` succeeds and HedgeBuddy's tools appear in Claude Code. Result:
- [ ] Copy the JSON config from Connect's Other MCP clients panel into another MCP-speaking client's own config: it connects and lists HedgeBuddy's tools over stdio. Result:
- [ ] With Claude Desktop or Claude Code connected, ask Claude to run a few tools: Connect's activity list updates with each call (time, tool, target, outcome) while Claude is still working, without a reload. Result:
- [ ] With the MSIX Claude Desktop (Windows), ask Claude to run a few tools and to change a variable: Connect's activity list shows those calls, the app's Variables screen shows the new value, and no `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\HedgeBuddy` folder has appeared (the MCP server Claude starts uses the app's own data folder). Result:
- [ ] With network access turned off, use Settings' Install to run the bundled wheel (`pip install --no-index`): it succeeds offline, and Home and Settings both show `hedgebuddy` installed at the app's version. Result:
- [ ] Settings' Reveal (Show in folder) opens the real data folder in the file manager. Result:
- [ ] With a catalog override in `<data>/catalog/`, Settings' Data folder panel lists it under Overrides. Result:
- [ ] Set an editor command in Settings, then use Open in editor (Scripts): it runs that command. Set it to something unparsable (an unterminated quote): Save is refused with the reason shown, and the old command keeps working. Result:
- [ ] macOS: start the app with `HEDGEBUDDY_DATA_DIR` pointed at a path it can't open (an existing file, say): a native "HedgeBuddy can't start" alert shows the reason, with no blank window behind it. Result:
- [ ] macOS: launch the app through a symlink to its executable (`ln -s /Applications/HedgeBuddy.app/Contents/MacOS/hedgebuddy-app ~/hb`, then run `~/hb`): Connect finds the bundled command, and Set up writes the path inside `/Applications/HedgeBuddy.app`, so Connect still reads set up when the app is next opened normally. Result:
- [ ] macOS: launch the app from a mounted DMG, or translocated (moved to Downloads and opened without first dragging it to Applications), and use Set up: Connect's Claude Desktop panel shows the entry as set up. Then run the app for real from `/Applications`: the path written earlier no longer resolves, and Connect now reads "points elsewhere" until Set up/Update is run again. Result:
- [ ] The installed layout matches the confirmed bundle paths: on Windows, `hedgebuddy-app.exe`, `hedgebuddy.exe` and the `wheel\` folder all sit together in the install folder; on macOS, `HedgeBuddy.app/Contents/MacOS/` holds both `hedgebuddy-app` and `hedgebuddy` side by side, and `HedgeBuddy.app/Contents/Resources/wheel/` holds the `.whl`. Result:
