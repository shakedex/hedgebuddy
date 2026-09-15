# HedgeBuddy overhaul — design

**Date:** 2026-09-15
**Status:** Approved in conversation, pending written review
**First release:** 0.11.0 (ZeroVer; must exceed the archived 0.10.0 on PyPI)
**Supersedes:** everything under `app/`, `updater/`, `python-lib/`, and all earlier specs and plans in this folder

## 1. Goal

Rebuild HedgeBuddy from scratch as a small, AI-compatible setup tool for DITs who automate Hedge's apps (OffShoot, FoolCat, EditReady, Canister) with Python scripts.

HedgeBuddy:

- stores variables and profiles that scripts read,
- keeps the scripts themselves per profile and attaches them to Hedge app events,
- exposes all of that to AI agents through an MCP server,
- ships a desktop app for the same operations,
- keeps parity with Hedge apps through data manifests, not code.

HedgeBuddy is **not** a daemon. Nothing runs in the background. Agents act at setup time or when the DIT asks; on set, scripts run without AI.

Go is removed entirely. Quills (script catalog service, split earlier into its own repo) is ignored and not integrated.

## 2. Decisions made during brainstorming

| Topic | Decision |
|---|---|
| AI role | Agents manage vars and profiles, author Hedge scripts, and drive Hedge apps on request via MCP. No event-driven AI at runtime. |
| Quills | Ignored. Archived attempt. |
| Script side | Python API redesigned (typed values, script manifest, event object). Pure Python, zero dependencies, not Rust-backed. |
| Scripts | HedgeBuddy manages a scripts folder per profile and auto-attaches to Hedge app events (registry on Windows, OffShoot Helper workspace on macOS). |
| Architecture | One Rust core crate, a CLI whose `mcp` subcommand serves MCP over stdio, and a Tauri app bundling the CLI as a sidecar. |
| Frontend | Vite + React + TypeScript. |
| Visual design | Fresh design pass during phase 5. Not bound to the 0.10 UI. Must work at small window sizes. |
| Compatibility | None. No migration from 0.10, no API shims, no updater hand-off. |
| Git | Fresh orphan `main` with one initial commit. Current `master` tagged `legacy/0.10.0`. Default branch becomes `main`. |
| Versioning | ZeroVer. Major stays 0. First release 0.11.0 for all components. |

## 3. What Hedge apps expose (facts the design relies on)

Verified September 2026 against docs.hedge.video and a Windows machine with OffShoot 26.1 and FoolCat 26.1.1 installed.

**Scripting (Pro licenses only).** OffShoot, FoolCat, and EditReady run one Python 3 script per event, configured in each app's Scripting settings. The script receives a JSON object as `sys.argv[1]`. Keys are `<EventName>_<field>`, e.g. `FileCopyCompleted_destinationPath`. Some fields are JSON encoded as strings (`sourceInfo`, `transferGroups`). Script stdout and return value go to the app's Event Log. No env vars, no stdin, no exit-code contract.

Events: OffShoot 10 (OffShootStarted, DiskAdded, DiskRemoved, DiskBusy, DiskIdle, DisksIdle, TransfersAdded, SourceAdded, FileCopyCompleted, VerificationIssue). FoolCat 2 (FoolCatStarted, ReportCreated). EditReady 2 (EditReadyStarted, FileConversionCompleted). Canister and PostLab: none.

**Where attachments are stored.**

- Windows: one registry string value per event under `HKCU\Software\Hedge` (OffShoot) and `HKCU\Software\FoolCat`, named `EventScript<InternalName>`, plus `EventScriptAllowScripting` (DWORD 1). Internal names differ from documented event names in at least one case: `VerificationIssue` is stored as `EventScriptCheckpointIssue`; `OffShootStarted` as `EventScriptAppStarted`; `DisksIdle` as `EventScriptAllDisksIdle`. Undocumented but stable across the two apps observed.
- macOS: OffShoot Helper applies workspace JSON from `~/Library/Preferences/Hedge/Workspaces/`, whose `setPreferences` dictionary accepts keys such as `scripting_events_checkpoint_issue`. Documented as "not all preferences are built in." Preferences domain for Helper is `nl.syncfactory.Hedge.Mac.Helper`.
- Unknown: whether apps re-read attachment settings live or only at launch. To be tested in phase 2.

**Control.** Each app has a URL scheme (`offshoot://`, `foolcat://`, `editready://`, `canister://`) invoked via `start` (Windows) or `open` (macOS). OffShoot: `open`, `quit`, `restart`, `update`, `activate`, `deactivate`, `reset?type=sources|destinations`, `setSource {paths, label}`, `setDestination {path}`, `addTransfers`, `restartTransfer?id=`, `reloadPresets`, `setPreferences` (macOS only), and `actions?json=[...]` to chain. Responses are logged to `%APPDATA%\Hedge\HedgeCallback.log` / `~/Library/Logs/Hedge/urlSchemeResponseLog.txt`. No URL command selects a preset.

**Presets.** OffShoot presets are JSON files in `%APPDATA%\Hedge\Presets\*.hedge` with `folderPattern`, `labelPattern`, `renamePattern`, `counter`, and flags. `offshoot://reloadPresets` reloads them. The active preset name is in the registry value `SessionVariableSelectedPreset` (undocumented).

**Nothing from Hedge about MCP or AI.** Their docs publish `https://docs.hedge.video/llms.txt`.

## 4. Repository layout

```
hedgebuddy/
├── Cargo.toml               # workspace
├── crates/
│   ├── core/                # all logic; no UI, no argument parsing
│   ├── cli/                 # `hedgebuddy` binary; `mcp` subcommand
│   └── app/                 # Tauri v2 app; links core; bundles cli as sidecar
│       └── ui/              # Vite + React + TypeScript
├── catalog/                 # offshoot.toml, foolcat.toml, editready.toml, canister.toml
├── python/                  # pure-Python `hedgebuddy` package + tests
├── schema/                  # JSON Schemas + shared conformance fixtures
├── branding/
├── docs/
├── LICENSE, DISCLAIMER, README.md, CHANGELOG.md, VERSION
```

Deleted from the old tree: `app/`, `updater/`, `python-lib/`, `tests/`, `examples/`, `tools/`, `scripts/`, `build/`, `skills-lock.json`, `TODO.md`, and all prior `docs/superpowers/` content except this spec.

### Components

- **core** owns storage, profiles, variables and validation, script manifest parsing, catalog loading, attach/detach/state, app commands, volume inspection, run-record reading, and the data-directory watcher. OS-specific integration (registry, plist/Helper workspace, `start`/`open`, volume enumeration) sits behind a trait with Windows and macOS implementations and a fake for tests.
- **cli** is a thin parser over core. `hedgebuddy mcp` serves MCP over stdio using the official Rust MCP SDK. Other subcommands mirror the MCP tools for shell use.
- **app** is a Tauri v2 shell. Tauri commands call core directly. The CLI binary is bundled as a sidecar so hosts can reach the MCP server whether or not the window is open.
- **catalog** manifests are embedded in both binaries and can be overridden per file from `<data>/catalog/`.
- **python** reads the data directory directly and never invokes Rust.
- **schema** holds JSON Schemas for `hedgebuddy.json`, `profile.json`, `secrets.json`, run records, and the script manifest, plus fixtures both Rust and Python test against.

## 5. Storage format

Data directory: `%APPDATA%\HedgeBuddy` on Windows, `~/Library/Application Support/HedgeBuddy` on macOS.

```
HedgeBuddy/
├── hedgebuddy.json          {"version": 1, "active_profile": "<name>"}
├── profiles/<name>/
│   ├── profile.json         variables + metadata
│   ├── secrets.json         secret-typed values only; file mode 0600; excluded from export by default
│   └── scripts/*.py
├── catalog/                 optional manifest overrides
├── runs/YYYY-MM-DD.jsonl    append-only run records
└── preferences.json         GUI preferences
```

`profile.json`:

```json
{
  "version": 1,
  "name": "commercial-one-day",
  "description": "Client X, single-day commercial",
  "variables": {
    "PROJECT_NAME": {"type": "string", "value": "ClientX Spot", "description": ""},
    "DEST_ROOTS":   {"type": "path[]", "value": ["D:/Offload", "F:/Offload"], "description": ""},
    "NOTIFY":       {"type": "bool", "value": true, "description": ""},
    "SLACK_WEBHOOK": {"type": "secret", "description": "Incoming webhook URL"}
  }
}
```

Profile `name` is a slug matching `^[a-z0-9][a-z0-9-]{0,63}$` and is also the directory name under `profiles/`. Human-readable wording goes in `description`.

Secret-typed entries carry no `value` in `profile.json`; the value lives under the same name in `secrets.json` as `{"SLACK_WEBHOOK": "https://..."}`.

Variable names: `^[A-Z][A-Z0-9_]*$`. Types and their Python representation:

| Type | JSON value | Python |
|---|---|---|
| `string` | string | `str` |
| `secret` | string (in secrets.json) | `str` |
| `int` | number | `int` |
| `float` | number | `float` |
| `bool` | boolean | `bool` |
| `path` | string | `pathlib.Path` |
| `url` | string, validated http/https | `str` |
| `string[]` | array of strings | `list[str]` |
| `path[]` | array of strings | `list[Path]` |

Validation on write: type conformance, name pattern, url format. `path` values are not required to exist on disk (they may point at drives not currently mounted), but the GUI and `check_script` flag missing paths as warnings.

Attachment state is **not** stored in HedgeBuddy files. The Hedge app's own setting is the source of truth; core reads it and reports each script as `attached`, `detached`, or `stale` (the app points at a path that does not exist). Switching the active profile does not rewrite attachments; `sync_attachments` does, explicitly.

Run records (`runs/*.jsonl`), one line per event written by the Python library:

```json
{"ts": "2026-09-15T18:23:47Z", "run_id": "…", "phase": "start", "app": "offshoot", "event": "FileCopyCompleted", "script": "on_copy_complete.py", "profile": "commercial-one-day"}
{"ts": "…", "run_id": "…", "phase": "log", "message": "posted to slack"}
{"ts": "…", "run_id": "…", "phase": "end", "status": "ok", "exit_code": 0}
```

`status` is `ok`, `failed` (non-zero return), or `error` (uncaught exception, with `traceback`). Files older than 30 days are pruned by core on read.

## 6. Script manifest

A script declares itself in a JSON object at the top of its module docstring, terminated by a line containing only `---`. Anything after `---` is free-text description.

```python
"""
{"hedgebuddy": 1,
 "app": "offshoot",
 "event": "FileCopyCompleted",
 "requires": {
   "SLACK_WEBHOOK": {"type": "secret", "description": "Incoming webhook URL"},
   "PROJECT_NAME":  {"type": "string", "default": "Untitled"}
 }}
---
Posts a summary to Slack after each card finishes.
"""
```

Fields: `hedgebuddy` (manifest version, integer), `app` (catalog id), `event` (event id from the catalog), `requires` (map of variable name to `{type, description?, default?}`). `app` and `event` are optional for scripts not tied to a Hedge event.

JSON is chosen over YAML or TOML because Python's standard library parses it on every supported version (3.9+), and the library must remain dependency-free.

Core parses the manifest without executing Python. A `requires` entry with a `default` is satisfied when absent from the profile; one without is required. Type mismatch between manifest and profile is an error.

## 7. Hedge app catalog

One TOML manifest per app. Shape, using OffShoot:

```toml
catalog_version = 1
tested_against = "26.1"

[app]
id = "offshoot"
name = "OffShoot"
scheme = "offshoot"
requires_pro = true
docs = "https://docs.hedge.video/offshoot/features/automation"

[detect.windows]
registry = "HKCU\\Software\\Hedge"
version_value = "BuildVersion"
[detect.macos]
bundle_id = "nl.syncfactory.Hedge.Mac"

[scripting.windows]
kind = "registry"
key = "HKCU\\Software\\Hedge"
enable_value = "EventScriptAllowScripting"
value_pattern = "EventScript{registry_name}"
[scripting.macos]
kind = "helper_workspace"
workspace_dir = "~/Library/Preferences/Hedge/Workspaces"
pref_pattern = "scripting_events_{pref_name}"

[[events]]
id = "FileCopyCompleted"
registry_name = "FileCopyCompleted"
pref_name = "file_copy_completed"
payload = ["sourcePaths", "presetName", "state", "sourceInfo", "startedAt",
           "destinationPath", "verification_mode", "duration", "bytesCopied",
           "id", "transferLogJSONPath"]
json_fields = ["sourceInfo"]

[[events]]
id = "VerificationIssue"
registry_name = "CheckpointIssue"
pref_name = "checkpoint_issue"
payload = ["description", "filePath"]

[[commands]]
id = "setSource"
params = { paths = "path[]", label = "string?" }

[[commands]]
id = "setDestination"
params = { path = "path" }

[[commands]]
id = "addTransfers"
confirm = true

[[commands]]
id = "reloadPresets"

[files.windows]
presets = "%APPDATA%\\Hedge\\Presets"
callback_log = "%APPDATA%\\Hedge\\HedgeCallback.log"
event_log = "%APPDATA%\\Hedge\\Hedge.log"
[files.macos]
presets = "~/Library/Application Support/Hedge/Presets"
callback_log = "~/Library/Logs/Hedge/urlSchemeResponseLog.txt"
```

Core uses manifests for: detection and version; event list and payload keys (documentation for agents, accessor list for Python); attach, detach, and state per OS by `kind` (`registry`, `helper_workspace`; new kinds can be added); command validation, URL encoding, launching, and chaining via `actions?json` when more than one command is passed; file locations for presets and logs.

When an installed app's version is newer than `tested_against`, core emits a warning surfaced in the GUI and in `list_apps`.

Shipped manifests: `offshoot`, `foolcat`, `editready`, `canister` (commands only). PostLab is omitted; it has no automation surface.

## 8. MCP surface

Transport: stdio, via `hedgebuddy mcp`. Every tool wraps one core function.

| Group | Tools |
|---|---|
| Profiles | `list_profiles`, `get_profile`, `create_profile`, `set_active_profile`, `delete_profile` |
| Variables | `list_vars`, `get_var`, `set_var`, `delete_var` |
| Scripts | `list_scripts`, `read_script`, `write_script`, `delete_script`, `check_script`, `attach_script`, `detach_script`, `sync_attachments` |
| Hedge apps | `list_apps`, `describe_app`, `run_app_command`, `read_app_log`, `list_presets`, `write_preset` |
| Runs | `list_runs`, `get_run` |
| System | `list_volumes`, `inspect_volume`, `environment` |

Rules:

- **Secrets are masked.** `list_vars` and `get_var` return `********` for secret-typed values unless `reveal: true` is passed; the tool description states this is for the operator's explicit request only. Setting a secret is allowed.
- **`write_script` validates first.** Parses the manifest, rejects unknown app or event, reports missing required variables in the active profile. `check_script` does the same for an existing file and runs a Python syntax check via the interpreter found by `environment`.
- **Dry runs on anything irreversible.** `run_app_command`, `attach_script`, `detach_script`, `sync_attachments`, `write_preset`, `delete_profile`, `delete_script`, `delete_var` accept `dry_run: true` and return what would be written or launched (URL, registry values, file diff). They carry the MCP `destructiveHint` annotation. Commands marked `confirm = true` in the catalog say so in the tool output so the agent asks the operator before firing.
- **`describe_app`** returns install state, version, Pro scripting flag, events with payload keys, commands with parameter types, file locations, and the docs URL.
- **`inspect_volume`** returns label, filesystem, size, removable flag, and a camera-card guess from folder structure (e.g. `PRIVATE/`, `DCIM/`, `XDROOT/`, `.ari`/`.mxf` counts), with clip count and total media size.
- **`run_app_command`** takes `app` and an ordered list of `{command, params}`; single commands use the direct URL form, multiple use `actions?json`. It waits up to a few seconds for the callback log to change and returns the response lines.
- **`environment`** returns data directory, catalog overrides in effect, Python interpreter path and version as Hedge apps would resolve it (Windows: `py` launcher; macOS: `python3`), and whether the `hedgebuddy` package is installed there.

Resources (read-only): `hedgebuddy://catalog/<app>`, `hedgebuddy://schema/<name>`, `hedgebuddy://docs/hedge-llms` (pointer to Hedge's `llms.txt`).

Prompt: `author_script(app, event)` returns a filled template with the manifest block and typed payload accessors.

Connecting: the GUI writes the server entry into Claude Desktop's config and shows the `claude mcp add` command for Claude Code.

## 9. Python library

Package `hedgebuddy`, version 0.11.0, Python 3.9+, zero dependencies.

```python
import hedgebuddy as hb

@hb.script
def main(event, vars):
    if event.state != "Success":
        hb.log(f"copy failed: {event.state}")
        return 1
    post(vars.SLACK_WEBHOOK, vars.PROJECT_NAME, event.destinationPath)
```

- **`@hb.script`**: reads the manifest from the module docstring, validates required variables (fails fast naming the variable), parses `sys.argv[1]`, opens a run record, calls `main(event, vars)`, closes the record with `ok`/`failed`/`error`, and calls `sys.exit` with the return value (default 0).
- **`vars`**: attribute and item access over the active profile, typed per section 5. Secrets are read from `secrets.json`.
- **`event`**: attributes are the payload keys with the `<EventName>_` prefix removed. Fields listed as `json_fields` in the catalog are decoded once; since the library does not ship the catalog, it decodes any string value that parses as a JSON object or array and starts with `{` or `[`. `event.raw` is the original dict. `event.app` and `event.name` come from the manifest, or from the key prefix when there is no manifest.
- **`hb.var(name, default=...)`**: typed single read. Raises `VariableNotFoundError` when missing and no default given.
- **`hb.exists(name)`**, **`hb.all_vars()`**: as today, typed.
- **`hb.inject_env(overwrite=False)`**: copies all variables into `os.environ` as strings (lists joined with `os.pathsep`, bools as `"1"`/`"0"`). Kept so an operator's existing environment-variable script needs one line to adopt HedgeBuddy.
- **`hb.log(message)`**: appends to the current run record; prints to stdout when no run is open.
- **`hb.event()`**: standalone parser for scripts not using the decorator.
- Removed: `get()`.

Errors: `VariableNotFoundError`, `VariableTypeError`, `StorageNotFoundError`, `StorageCorruptedError`, `ManifestError`.

## 10. Desktop app

Tauri v2, Vite + React + TypeScript, one window with sidebar navigation. Visual design is a fresh pass in phase 5 with mockups; the only constraint is that it must remain usable at a small window size beside OffShoot.

Views:

1. **Variables** — profile switcher in the toolbar; typed editors per type; "required by" badge from script manifests; import/export (secrets excluded unless opted in).
2. **Scripts** — the profile's scripts folder; target app/event, attachment state, unmet requirements; attach, detach, new from template, open in external editor, delete; "sync attachments to this profile."
3. **Hedge apps** — installed apps and versions, Pro scripting flag, `tested_against` warnings, matrix of events versus attached scripts, stale entries with one-click detach.
4. **Connect** — writes Claude Desktop config, shows the Claude Code command, shows the last MCP call.
5. **Settings** — Python check against the interpreter Hedge apps use with one-click `pip install`; update check via Tauri updater plugin; data directory path and reveal button.

Behaviours: core watches the data directory and the app reflects external changes (MCP writes) within a second. Closing the window quits; no tray, no background process.

Out of scope: in-app code editing beyond read-only preview, running scripts from the GUI, command panels for individual Hedge apps.

## 11. Git and repository reset

1. Tag current `master` as `legacy/0.10.0` and push the tag.
2. Create an orphan branch `main` with a single initial commit containing the new scaffold and this spec.
3. Push `main`, set it as the default branch on GitHub, delete `master` from the remote after the default branch switch.
4. Old GitHub releases and PyPI versions stay published; nothing is yanked.

## 12. Testing

- **Core unit tests** (Rust): storage, profiles, validation, manifest parsing, catalog loading, URL building. OS integration behind a trait with a fake; real implementations get a small integration test gated behind an env flag for machines with Hedge apps installed.
- **Conformance fixtures** (`schema/fixtures/`): sample data directories and script files with expected parsed output; run by both `cargo test` and `pytest`.
- **MCP contract tests**: spawn `hedgebuddy mcp` against a temp data directory and exercise every tool including dry runs. Doubles as the GUI's logic tests since Tauri commands call the same functions.
- **Manual smoke checklist**: attach in OffShoot and FoolCat on a real Windows and macOS machine; confirm whether attachments are picked up live or need an app restart; fire `run_app_command` and read the callback log; run the card scenario end to end from Claude Desktop.
- No React unit tests in this version.

CI: GitHub Actions on `windows-latest` and `macos-latest` running `cargo test`, `pytest`, and the MCP contract tests.

## 13. Phasing

Each phase is one implementation plan.

1. **Repo reset and scaffold** — archive tag, orphan `main`, Cargo workspace, `python/` skeleton, `schema/` with first fixtures, CI green on both platforms.
2. **Core** — storage, profiles, variables, validation, manifest parsing, catalog with four manifests, OS integration trait with Windows and macOS implementations, volume inspection, run-record reading, watcher.
3. **CLI and MCP** — `hedgebuddy` binary, all subcommands, `mcp` over stdio, dry runs, contract tests. Milestone: the card scenario runs from Claude Desktop with no GUI.
4. **Python 0.11.0** — decorator, typed vars, event, log, inject_env, run records, conformance tests, PyPI publish.
5. **Desktop app** — design pass with mockups, five views, live reload, Connect panel, sidecar bundling.
6. **Release** — Tauri updater, signed builds (certificates still to be obtained), docs rewrite, `v0.11.0` tag.

Phases 4 and 5 are independent and may run in parallel.

## 14. Reference scenario

"Camera A finished card A003. I put it in the workstation. Claude: name it A003, add it as a source in OffShoot, offload it to my external drives with my usual commercial one-day folder scheme."

1. Agent calls `list_volumes`, then `inspect_volume` on the new removable drive; it reports a camera card.
2. Agent calls `get_profile` for `commercial-one-day`: destination roots, project name, camera labels.
3. Agent calls `write_preset` (dry run, then real) to write an OffShoot preset with the profile's folder pattern and counter `003`, then `run_app_command` `reloadPresets`. Selecting that preset in OffShoot is either done by the operator once or via the registry value; the catalog records the value name, and phase 2 decides whether to expose it.
4. Agent calls `run_app_command` with `[reset destinations, setSource(paths, label="A003"), setDestination × N, addTransfers]` as a dry run, shows the operator the URL, and fires on confirmation.
5. Agent reads the callback log through the same call's response. Completion later arrives through the attached `FileCopyCompleted` script's run record, readable via `list_runs`.

Requires OffShoot Pro and an MCP host on the workstation.

## 15. Risks

| Risk | Mitigation |
|---|---|
| Hedge renames registry values or preference keys | Catalog is data; `tested_against` warns on newer app versions; user overrides in `<data>/catalog/`. |
| Apps read attachments only at launch | Test in phase 2; if so, `attach_script` reports "restart OffShoot to apply." |
| Secrets in a plain file | 0600 permissions, excluded from export, masked in MCP. Keychain can replace the backend later behind the same type. |
| Python interpreter mismatch | `environment` and the Settings view target the interpreter Hedge apps resolve, not PATH's first Python. |
| Tauri sidecar path changes between installs | Connect panel rewrites the host config on every launch if the path differs. |
| Unsigned builds on macOS | Existing TODO; phase 6. Until then the docs keep the `xattr -cr` note. |

## 16. Out of scope

- Any daemon, tray, or event bridge to AI at runtime.
- Quills, script catalogs, or community script repositories.
- Linux.
- OS keychain storage (deferred).
- In-app script editing or execution.
- Migration of any 0.10 data or API.
