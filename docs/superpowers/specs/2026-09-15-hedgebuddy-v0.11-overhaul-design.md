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
- macOS: OffShoot Helper applies workspace JSON files from `~/Library/Preferences/Hedge/Workspaces/`; a workspace's `setPreferences` object accepts `scripting_opt_in` and `scripting_events_{checkpoint_issue, disk_added, disk_busy, disk_idle, disk_removed, disks_idle, file_copy_completed}` (documented on the Helper page). HedgeBuddy writes `HedgeBuddy.json` there and the operator applies it from the Helper menu, so macOS attachments are reported as *staged*. No keys are documented for OffShoot Started, Transfers Added, or Source Added, or for FoolCat and EditReady; those are attached by hand on macOS.
- Unknown: whether apps re-read attachment settings live or only at launch. To be tested in phase 2.

**Control.** Each app has a URL scheme (`offshoot://`, `foolcat://`, `editready://`, `canister://`) invoked via `start` (Windows) or `open` (macOS). OffShoot: `open`, `quit`, `restart`, `update`, `activate`, `deactivate`, `reset?type=sources|destinations`, `setSource {paths, label}`, `setDestination {path}`, `addTransfers`, `restartTransfer?id=`, `reloadPresets`, `setPreferences` (macOS only), and `actions?json=[...]` to chain. Responses are logged to `%APPDATA%\Hedge\HedgeCallback.log` / `~/Library/Logs/Hedge/urlSchemeResponseLog.txt`. No URL command selects a preset.

**Presets.** OffShoot presets are JSON files in `%APPDATA%\Hedge\Presets\*.hedge` with `folderPattern`, `labelPattern`, `renamePattern`, `counter`, and flags. `offshoot://reloadPresets` reloads them. The active preset name is in the registry value `SessionVariableSelectedPreset` (observed, undocumented); `PresetsLocation` overrides the folder. No API selects a preset, and the macOS preset folder is not documented.

**Nothing from Hedge about MCP or AI.** Their docs publish `https://docs.hedge.video/llms.txt`.

## 4. Repository layout

```
hedgebuddy/
├── Cargo.toml               # workspace
├── crates/
│   ├── core/                # all logic; no UI, no argument parsing
│   ├── tools/               # the MCP tools, resources and prompt, shared by cli and app
│   ├── cli/                 # `hedgebuddy` binary; `mcp` subcommand
│   └── app/                 # Tauri v2 app; links tools and core; bundles cli as sidecar
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
- **tools** (`hedgebuddy-tools`, from phase 5) defines every MCP tool once, with typed parameters and typed results that both have JSON Schemas, plus the MCP resources and the `author_script` prompt.
- **cli** is a thin layer over tools and core. `hedgebuddy mcp` serves MCP over stdio using the official Rust MCP SDK (`rmcp`). Every tool also runs from the shell as `hedgebuddy call <tool> <json>`, and `hedgebuddy tools` lists them.
- **app** is a Tauri v2 shell. It calls the same tools as Claude through one generic command, plus a few app-only commands for OS actions and the home summary (phase 5 design: `2026-09-23-phase5-desktop-app-design.md`). The CLI binary is bundled as a sidecar so hosts can reach the MCP server whether or not the window is open.
- **catalog** manifests are embedded in both binaries and can be overridden per file from `<data>/catalog/`.
- **python** reads the data directory directly and never invokes Rust.
- **schema** holds JSON Schemas for `hedgebuddy.json`, `profile.json`, `secrets.json`, run records, the script manifest, Claude activity records (`activity.jsonl`, phase 5) and `preferences.json` (phase 5), plus fixtures both Rust and Python test against.

## 5. Storage format

Data directory: `%APPDATA%\HedgeBuddy` on Windows, `~/Library/Application Support/HedgeBuddy` on macOS.

```
HedgeBuddy/
├── hedgebuddy.json          {"version": 1, "active_profile": "<name>" | null}
├── profiles/<name>/
│   ├── profile.json         variables + metadata
│   ├── secrets.json         secret-typed values only; file mode 0600; excluded from export by default
│   └── scripts/*.py
├── catalog/                 optional manifest overrides
├── runs/YYYY-MM-DD.jsonl    append-only run records
├── activity.jsonl           Claude's last 200 MCP tool calls (phase 5)
├── .hedgebuddy.lock         cross-process write lock (phase 5)
└── preferences.json         GUI preferences: {"version": 1, "last_opened": ts | null, "editor_command": string | null}
```

`active_profile` is `null` when no profile exists (a fresh install). A missing `hedgebuddy.json` is read as `{"version": 1, "active_profile": null}`; `profiles/` and `runs/` are created on first write.

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

The authoritative format is `catalog/README.md`, and the shipped files are `catalog/*.toml`. Differences from the first draft of this section: detection uses `registry_key` + `version_value` (Windows) and `app_path` + optional `bundle_id` (macOS); scripting kinds are `registry`, `helper_workspace`, and `manual`; `payload` lists the exact keys scripts receive; commands declare `form = "url"` or `"action"` (actions are batched into one `actions?json=` URL) and `list_separator` for `|`-separated lists; a `[presets.<os>]` section describes the preset folder, its registry override, and preset selection. License commands (`activate`, `deactivate`) and `update` are deliberately absent, and `setPreferences` is not used.

Core uses the catalog through `Hedge`: app status and version warnings, attachment state per event (`attached`, `external`, `stale`, `staged`, `detached`, `manual`, `unsupported`), attach/detach plans applied only by `Hedge::apply`, profile-wide `sync_attachments`, URL commands with callback-log responses, presets, and app log tails.

When an installed app's version is newer than `tested_against`, core emits a warning surfaced in the GUI and in `list_apps`.

Shipped manifests: `offshoot`, `foolcat`, `editready`, `canister` (commands only). PostLab is omitted; it has no automation surface.

## 8. MCP surface

Transport: stdio, via `hedgebuddy mcp`. Every tool wraps one core function.

| Group | Tool | Hints |
|---|---|---|
| Profiles | `list_profiles`, `get_profile` | read |
| | `create_profile`, `set_active_profile` | write |
| | `delete_profile` | destructive, `dry_run` |
| Variables | `list_vars`, `get_var` | read (`reveal`) |
| | `set_var` | write |
| | `delete_var` | destructive, `dry_run` |
| Scripts | `list_scripts`, `read_script`, `check_script` | read |
| | `write_script` | destructive (may overwrite) |
| | `delete_script` | destructive, `dry_run` |
| Attachments | `list_attachments` | read |
| | `attach_script`, `detach_script`, `sync_attachments`, `clear_stale_attachment` | destructive, `dry_run` |
| Hedge apps | `list_apps`, `describe_app`, `read_app_log`, `list_presets` | read |
| | `run_app_command` | destructive, `dry_run`, `confirmed` |
| | `write_preset`, `select_preset` | destructive, `dry_run` |
| Runs | `list_runs`, `get_run` | read |
| System | `list_volumes`, `inspect_volume`, `environment` | read |

Rules:

- **Secrets are masked.** `list_vars` and `get_var` return `********` for secret-typed values unless `reveal: true` is passed; the tool description states this is for the operator's explicit request only. Setting a secret is allowed.
- **`write_script` validates first.** Parses the manifest, rejects unknown app or event, reports missing required variables in the active profile. `check_script` does the same for an existing file and runs a Python syntax check via the interpreter found by `environment`.
- **Dry runs on anything irreversible.** `run_app_command`, `attach_script`, `detach_script`, `sync_attachments`, `clear_stale_attachment`, `write_preset`, `select_preset`, `delete_profile`, `delete_script`, `delete_var` accept `dry_run: true` and return what would be written or launched (URL, registry values, file diff). They carry the MCP `destructiveHint` annotation. Commands marked `confirm = true` in the catalog say so in the tool output so the agent asks the operator before firing.
- **`describe_app`** returns install state, version, Pro scripting flag, events with payload keys, commands with parameter types, file locations, and the docs URL.
- **`inspect_volume`** returns label, filesystem, size, removable flag, and a camera-card guess from folder structure (e.g. `PRIVATE/`, `DCIM/`, `XDROOT/`, `.ari`/`.mxf` counts), with clip count and total media size.
- **`run_app_command`** takes `app` and an ordered list of `{command, params}`; each command is encoded as the catalog declares: `url` commands as their own URL, consecutive `action` commands batched into one `actions?json=` URL. URLs are opened in order; when waiting for responses, each URL's callback-log response is awaited before the next opens. It waits up to a few seconds for the callback log to change and returns the response lines.
- **`environment`** returns data directory, catalog overrides in effect, Python interpreter path and version as Hedge apps would resolve it (Windows: `py` launcher; macOS: `python3`), and whether the `hedgebuddy` package is installed there.
- **`detach_script`** only detaches an event currently attached to that very script. **`clear_stale_attachment`** only detaches an event whose file no longer exists. External (operator-owned) attachments are changed only by `attach_script`/`sync_attachments` replacing them, and those report what they replace.
- **`run_app_command`** returns `requires_confirmation` and runs nothing when a command the catalog marks `confirm` is present and `confirmed: true` was not passed.
- **`list_runs`** prunes run files older than 30 days before listing.
- **Writes are serialised.** Within one `hedgebuddy` process, tools that change state run one at a time (MCP clients may send calls in parallel); read-only tools do not wait.

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

Decisions made in phase 4:
- `@hb.script` runs `main` only when its module is `__main__`; imported (for example by a test), it returns the function unchanged.
- The decorated `main` must be the last top-level definition: `@hb.script` runs it while decorating, so code below it has not run yet (putting helpers below `main` raises `NameError`). Deferring the run to interpreter exit was rejected because it cannot set the exit code without skipping other libraries' exit handlers.
- `main` returns `None` or an int from 0 to 255. Any other value is recorded as `error` and the exit code is 1.
- The run record opens as soon as the active profile is known, so manifest and requirement failures are recorded with status `error`. Without an active profile nothing is recorded; the error goes to stderr and the exit code is 1.
- `hb.var(name, default)` returns the default only when the variable is missing; storage errors are always raised. A variable declared without a value (a secret with nothing in `secrets.json`) counts as missing when a script runs.
- `load_variables` rejects a `profile.json` whose `name` differs from its folder, just as core does.
- `VariableNotFoundError` is both a `KeyError` and an `AttributeError`, so `vars.get`, `getattr(vars, name, default)` and `hasattr` work.
- Payload fields named like `Event` attributes (`raw`, `app`, `name`, `get`) are read with `event["name"]`. A missing or blank `sys.argv[1]` is an empty payload; a payload that is not a JSON object raises `ValueError`.
- Run records are written under an exclusive file lock (`msvcrt.locking` on Windows, `flock` on macOS) so parallel scripts never interleave lines. On Windows the lock covers one byte at 1 GiB, past the end of the file, because Windows locks are mandatory and would otherwise stop core from reading the runs. Core's `list_runs` skips a run file it cannot read. A record that cannot be written is reported once on stderr and never fails the script. Run ids are ULIDs; timestamps are UTC with milliseconds; all records of one run go to the file named by the local date at its start. The end record is written before a traceback is printed, so it is also recorded when stderr is missing or closed.
- The library replaces the profile's secret values with `********` in `log` messages and the `end` traceback, and in the traceback it prints to stderr. Values shorter than four characters are not masked, so they cannot mangle unrelated text.
- Manifest extraction skips a leading UTF-8 BOM, in core and in the library.
- A requirement's `default` must be a valid value of its type (a string for `secret`). Core and the library both reject a manifest that breaks this. `"default": null` means no default, so the requirement is required.
- `check_script` reports when a script imports `hedgebuddy` but the package is missing or at another version in the Python the Hedge apps use.

## 10. Desktop app

Tauri v2, Vite + React + TypeScript, one window with an adaptive sidebar. The full design is `2026-09-23-phase5-desktop-app-design.md`, with mockups in `2026-09-23-phase5-mockups/`. In short, the app is dark only, uses the "instrument panel" visual direction, shadcn/ui with Tailwind v4, and Lucide icons, and colours only problems. It must stay usable at a small window size beside OffShoot.

Platform floor: macOS 26.0 or newer, declared as `bundle.macOS.minimumSystemVersion` in `tauri.conf.json`, and Windows 10 or newer with the WebView2 runtime.

Views:

1. **Home** — since you last opened the app: runs, failures, and a "needs attention" list that links to the fix; recent runs; Claude's recent calls.
2. **Runs** — script runs by day, failures filter, and each run's log and traceback.
3. **Variables** — profile menu in the toolbar; typed editors per type; "required by" links from script manifests; missing requirements pinned first; import/export (secrets excluded unless opted in).
4. **Scripts** — the profile's scripts folder; target app/event, attachment state, unmet requirements, package check; attach, detach, new from template, open in external editor, delete; "sync attachments to this profile". Every change is previewed first.
5. **Hedge apps** — installed apps and versions, Pro scripting flag, `tested_against` warnings, every event with what it runs, stale entries with one-click clear.
6. **Connect** — writes Claude Desktop config (with a backup), shows the Claude Code command, shows Claude's last 200 tool calls.
7. **Settings** — Python check against the interpreter Hedge apps use, with a one-click install of the bundled `hedgebuddy` wheel; data directory path and reveal button; optional editor command.

Behaviours: core watches the data directory and the app reflects external changes (MCP writes) within a second. The app is not meant to stay open: closing the window quits, and there is no tray, background process, or notification. The in-app update check moves to phase 6.

Out of scope: in-app code editing beyond read-only preview, running scripts from the GUI, command panels for individual Hedge apps, a light theme.

## 11. Git and repository reset

1. Tag current `master` as `legacy/0.10.0` and push the tag.
2. Create an orphan branch `main` with a single initial commit containing the new scaffold and this spec.
3. Push `main`, set it as the default branch on GitHub, delete `master` from the remote after the default branch switch.
4. Old GitHub releases and PyPI versions stay published; nothing is yanked.

## 12. Testing

- **Core unit tests** (Rust): storage, profiles, validation, manifest parsing, catalog loading, URL building. OS integration behind a trait with a fake; real implementations get a small integration test gated behind an env flag for machines with Hedge apps installed.
- **Conformance fixtures** (`schema/fixtures/`): sample data directories and script files with expected parsed output; run by both `cargo test` and `pytest`.
- **Tool and MCP contract tests**: unit tests cover every tool through `tools::call` with `FakeHost`, dry runs included. They double as the GUI's logic tests, since Tauri commands call the same functions. The MCP contract test spawns `hedgebuddy mcp` against a temp data directory and covers the protocol: initialize, `tools/list` with annotations, tool calls and errors, resources, prompts, and exit when stdin closes. It calls only tools that touch the data directory or the catalog.
- **Manual smoke checklist**: attach in OffShoot and FoolCat on a real Windows and macOS machine; confirm whether attachments are picked up live or need an app restart; fire `run_app_command` and read the callback log; run the card scenario end to end from Claude Desktop.
- No React unit tests in this version.

CI: GitHub Actions on `windows-latest` and `macos-latest` running `cargo test`, `pytest`, and the MCP contract tests.

## 13. Phasing

Each phase is one implementation plan.

1. **Repo reset and scaffold** — archive tag, orphan `main`, Cargo workspace, `python/` skeleton, `schema/` with first fixtures, CI green on both platforms.
2. **Core** — storage, profiles, variables, validation, manifest parsing, catalog with four manifests, OS integration trait with Windows and macOS implementations, volume inspection, run-record reading, watcher.
3. **CLI and MCP** — `hedgebuddy` binary, all subcommands, `mcp` over stdio, dry runs, contract tests. Milestone: the card scenario runs from Claude Desktop with no GUI.
4. **Python 0.11.0** — decorator, typed vars, event, log, inject_env, run records, conformance tests, PyPI publish.
5. **Desktop app**, in three plans (design: `2026-09-23-phase5-desktop-app-design.md`):
   - **5A Foundation** — shared tool crate with typed results, cross-process lock, batched watcher, Claude activity log, preferences, app shell and design system, Home and Runs.
   - **5B Editing** — Variables, Scripts, Hedge apps, the change-preview dialog, profile import/export.
   - **5C Connect and Settings** — Claude Desktop setup, Claude activity, Python check with the bundled wheel install, sidecar and wheel bundling.
6. **Release** — Tauri updater and the in-app update check, signed builds (certificates still to be obtained), docs rewrite, `v0.11.0` tag.

Phases 4 and 5 are independent and may run in parallel.

## 14. Reference scenario

"Camera A finished card A003. I put it in the workstation. Claude: name it A003, add it as a source in OffShoot, offload it to my external drives with my usual commercial one-day folder scheme."

1. Agent calls `list_volumes`, then `inspect_volume` on the new removable drive; it reports a camera card.
2. Agent calls `get_profile` for `commercial-one-day`: destination roots, project name, camera labels.
3. Agent calls `write_preset` (dry run, then real) to write an OffShoot preset with the profile's folder pattern and counter `003`, then `run_app_command` `reloadPresets`. Selecting it uses `plan_select_preset` (Windows registry value `SessionVariableSelectedPreset`; whether a running OffShoot picks it up is unverified).
4. Agent calls `run_app_command` with `[reset destinations, setSource(paths, label="A003"), setDestination × N, addTransfers]` as a dry run, shows the operator the planned URLs (a `reset` URL, one batched `actions` URL, and an `addTransfers` URL), and fires on confirmation.
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
| URL commands race each other | `run_commands` opens URLs one at a time and waits for each callback-log response; whether `reset`/`addTransfers` can join the `actions` batch is checked in the phase 3 smoke test. |

## 16. Out of scope

- Any daemon, tray, or event bridge to AI at runtime.
- Quills, script catalogs, or community script repositories.
- Linux.
- OS keychain storage (deferred).
- In-app script editing or execution.
- Migration of any 0.10 data or API.
