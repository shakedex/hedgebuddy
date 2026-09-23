# HedgeBuddy phase 5: desktop app design

**Status:** approved in brainstorming on 2026-09-23. It refines §10 of `2026-09-15-hedgebuddy-v0.11-overhaul-design.md` (the "main spec") and supersedes it where they differ. The main spec's changes are listed in §12.

**Mockups:** `2026-09-23-phase5-mockups/`. Its README says which option was chosen on each screen.

## 1. Goal

The desktop app is where the operator checks and trusts the setup, does hands-on setup, and sees whether their scripts ran. Claude does most of the work through MCP, and the app is for seeing and adjusting it. The app is not meant to stay open. Closing the window quits it. Claude's MCP server is a separate program that Claude Desktop or Claude Code starts on its own, and it never needs the app.

Phase 5 is split into three implementation plans. Each one ends in a working app:

| Sub-phase | Delivers |
|---|---|
| **5A Foundation** | The shared tool crate with typed results, the new core pieces, the app shell and design system, and the Home and Runs screens |
| **5B Editing** | The Variables, Scripts and Hedge apps screens, the change-preview dialog, and profile import and export |
| **5C Connect and Settings** | Claude Desktop setup, Claude activity, the Python check with the bundled wheel install, and bundling the `hedgebuddy` binary and wheel |

The in-app update check moves to phase 6, because Tauri's updater needs signed builds and an update endpoint.

## 2. Decisions

The decisions made during the design exploration:

1. **Three jobs.** The app is for checking status, hands-on setup, and seeing whether scripts ran and succeeded. It does not watch the Hedge apps themselves.
2. **No live monitoring.** There are no notifications and nothing runs after the window closes. When the app opens, it shows what happened since it was last opened.
3. **Theme.** The app is dark only.
4. **Visual direction.** Direction B, "Instrument panel": status first, rounded surfaces, large numbers on Home, and monospace for file and variable names.
5. **Navigation.** An adaptive sidebar, labelled when the window is wide and collapsing to an icon rail when it is narrow.
6. **Screen layout.** Every data screen uses list and detail: a searchable list, with the selected item on the right.
7. **Icons and status.**
   - Icons come from Lucide, used as icon plus text or icon only.
   - Each status has its own icon and a word.
   - Colour marks only problems: red for failed, amber for things that need a look.
   - Anything that is fine stays neutral grey.
   - The sidebar shows count badges, never coloured dots.
8. **Claude activity.** The MCP server logs Claude's tool calls, keeping the last 200.
9. **Architecture.** The app calls the same tool layer as Claude and `hedgebuddy call`, which moves into its own crate. Every tool gets a typed result with a JSON Schema.
10. **Frontend stack.**
    - shadcn/ui on Radix, with Tailwind v4 and `lucide-react`.
    - TanStack Query and `wouter`.
    - Inter and JetBrains Mono, bundled with the app.
11. **Platforms.** macOS 26 or newer, and Windows 10 or newer with WebView2.

## 3. Platforms

| Platform | Floor | Web engine |
|---|---|---|
| macOS | 26.0 | WKWebView, the WebKit shipped with macOS 26 |
| Windows | 10 | WebView2, an evergreen Chromium; the Tauri installer installs it if it is missing |

Tailwind v4 needs Safari 16.4 or Chrome 111 or newer, and both floors meet that.

Configuration changes:
- `crates/app/tauri.conf.json` sets `bundle.macOS.minimumSystemVersion` to `"26.0"`.
- The frontend build target in `crates/app/ui/vite.config.ts` moves from `safari15` to `safari26`, or to the newest Safari version the bundler recognizes if it does not know `safari26`. On Windows it moves from `chrome105` to `chrome120`.

The Python library keeps its floor at Python 3.9 or newer, because Hedge apps run scripts with the system's Python.

## 4. Architecture

### 4.1 Crates

| Crate | Role after phase 5 |
|---|---|
| `hedgebuddy-core` | All logic and storage, plus the new pieces in §4.4 |
| `hedgebuddy-tools` (new, `crates/tools`) | The 31 tools, moved from `crates/cli/src/tools/`, and the MCP resources and `author_script` prompt, moved from `crates/cli/src/resources.rs` |
| `hedgebuddy-cli` | The `hedgebuddy` binary: the MCP server (`mcp.rs`), the `env`, `tools` and `call` subcommands, and the Claude activity log |
| `hedgebuddy-app` | Tauri: a generic tool bridge plus the app-only commands |

### 4.2 Typed tool results

Every tool has a parameter type (Deserialize + JsonSchema, as today) and a **result type** (Serialize + JsonSchema). `ToolDef` gains `output_schema: fn() -> Value`.

The MCP server advertises each tool's `outputSchema`. It returns results as `structuredContent`, together with the same pretty JSON text it sends today.

`hedgebuddy tools --schemas` prints `{tool: {input, output}}` for all tools. The script `crates/app/ui/scripts/gen-tools.ts` turns that into `crates/app/ui/src/api/tools.gen.ts`, which gives one typed call function per tool. CI regenerates the file and fails when it differs from the committed one.

Two tests in `hedgebuddy-tools` keep the schemas honest:
- Every tool must have an input and an output schema.
- Every result produced in the tool tests must validate against its own output schema, using the `jsonschema` crate as a dev dependency.

### 4.3 App commands

**Generic bridge:**

| Command | What it does |
|---|---|
| `tool(name, args)` | Runs `hedgebuddy_tools::call` on a blocking thread with the app's `Context`. It takes the same in-process write lock and the same cross-process lock as every other caller. App calls are not written to the Claude activity log. |

**App-only commands.** These are never MCP tools:

| Command | Sub-phase | What it does |
|---|---|---|
| `home_summary()` | 5A | Everything Home shows, in one call (§6.1). The Python package check inside it is cached for 60 seconds. |
| `activity(limit)` | 5A | The latest Claude activity records, newest first. |
| `preferences_get()`, `preferences_set(patch)` | 5A | Reads and updates `preferences.json`. |
| `open_in_editor(profile, script)` | 5B | Opens a profile script with the editor command from preferences, or else the system's default app for `.py` files. |
| `reveal_path(path)` | 5B | Reveals a path in Explorer or Finder. Only paths inside the data folder, script paths and Hedge app files are allowed. |
| `script_template(app, event)` | 5B | Returns starter source for a new script. The Scripts screen saves it with the `write_script` tool. |
| `export_profile(name, include_secrets, dest)`, `import_profile(path, name)` | 5B | Exports a profile to JSON, with secrets only when `include_secrets` is set. Import creates a new profile from such a file. These stay app-only so an agent cannot export secrets. |
| `claude_desktop_status()`, `claude_desktop_plan()`, `claude_desktop_apply()` | 5C | Reads, previews and writes Claude Desktop's config (§6.6). |
| `pip_install()` | 5C | Installs the bundled wheel into the Python the Hedge apps use. Returns the output. |

Folder and file pickers come from `tauri-plugin-dialog`, and opening and revealing from `tauri-plugin-opener`. Tauri capabilities allow only what these commands need. The app sets a strict Content Security Policy: scripts, styles and fonts from the app bundle only, and no remote origins.

### 4.4 New core pieces (5A)

- **Cross-process lock.**
  - Every tool that is not read-only, and every app command that writes, takes an exclusive lock on `<data>/.hedgebuddy.lock` with the standard library's `File::lock` family. This is in addition to the existing in-process mutex.
  - A caller retries for up to 10 seconds, then fails with "another HedgeBuddy is busy; try again".
  - Python scripts are unaffected: they only append run records, under their per-file lock.
- **Batched change notifications.**
  - `watch` gains batching: changes arriving within 200 ms become one batch.
  - The app maps each batch to categories: `index`, `profile:<name>`, `scripts:<name>`, `runs`, `catalog`, `activity` and `preferences`.
  - It emits a Tauri event, `data-changed`, carrying those categories.
- **Claude activity log.**
  - The MCP server appends one line per tool call to `<data>/activity.jsonl`, as `{"ts", "tool", "target", "outcome"}`.
  - `outcome` is `ok`, `error` or `needs_confirmation`. A `run_app_command` that returned `requires_confirmation` counts as `needs_confirmation`.
  - `target` is the value of the first of these arguments that is present: `name`, `script`, `run_id`, `event`, `app`, `profile`. Otherwise it is `null`. Argument values, script source and error text are never written.
  - When the file passes 250 lines, it is rewritten to the last 200 under the cross-process lock.
  - The shape gets a JSON Schema, `schema/activity-record.schema.json`.
- **Preferences.**
  - `<data>/preferences.json` holds `{"version": 1, "last_opened": ts | null, "editor_command": string | null}`. A missing file reads as the defaults.
  - At startup, the app keeps the stored `last_opened` for the session's "since you last opened" figures, then stores the current time.
  - The shape gets a JSON Schema, `schema/preferences.schema.json`.
- **Items parked from earlier phases:**
  - `list_runs` decodes run files tolerantly (lossy UTF-8), so one bad byte skips a line instead of hiding a whole day.
  - `write_atomic` retries its rename for up to one second on Windows `PermissionDenied`.
  - `check_requirements` counts a secret declared without a value as unmet, so attaching and `check_script` agree with the Python library.

### 4.5 Frontend

- **Stack.**
  - React 19, TypeScript and Vite, as scaffolded.
  - shadcn/ui on Radix, with Tailwind v4 through `@tailwindcss/vite`.
  - `lucide-react` for icons.
- **Data.** TanStack Query wraps every tool and app command. On `data-changed`, the app invalidates the queries for the affected categories. The Hedge app state, which lives in the registry or the OffShoot Helper workspace, is refetched when the window regains focus, and those screens have a refresh button.
- **Routing.** `wouter` with hash routes:

  | Route | Screen |
  |---|---|
  | `#/` | Home |
  | `#/runs` and `#/runs/:runId` | Runs |
  | `#/variables` and `#/variables/:name` | Variables |
  | `#/scripts` and `#/scripts/:name` | Scripts |
  | `#/apps` and `#/apps/:id` | Hedge apps |
  | `#/connect` | Connect |
  | `#/settings` | Settings |

  Needs-attention items link straight to the item.
- **Layout.**
  - shadcn's `Sidebar` uses `collapsible="icon"`. The sidebar collapses to the icon rail below a window width of 720 px, and its labels show on hover.
  - A list-and-detail screen narrower than 640 px shows the list, and the detail slides over it with a back button.
  - The window defaults to 960×640, with a minimum of 480×400.
- **Fonts.** Inter for text and JetBrains Mono for names, paths and code, bundled as local files.
- **Tests.** There are no React unit tests. CI type-checks the frontend against the generated types, fails when those types are stale, and builds it.

## 5. Visual design

### 5.1 Tokens

The colour tokens map onto shadcn's theme variables. They come from direction B.

| Token | Value | Use |
|---|---|---|
| `background` | `#0f151d` | App background |
| `sidebar` | `#0b1016` | Sidebar and code wells |
| `card` | `#141c26` | Surfaces and panels |
| `accent` | `#1a2432` | Selected list item and active navigation |
| `border` | `#1f2a38`, strong `#243244` | Borders |
| `foreground` | `#c9d4e0`, strong `#ffffff` | Text |
| `muted-foreground` | `#7d8da2` | Secondary text and neutral icons |
| `primary` | `#2a7cf7` | Actions, selection, focus ring |
| `link` | `#8fb6ff` | Links and "required by" chips |
| `destructive` | `#ff6b81`, tint `#2a1418`, border `#5a2330` | Failed, delete |
| `warning` | `#f5b73b`, tint `#2a1d0c`, border `#5a4318` | Needs a look |
| Brand mark | Gradient `#3dd6c6` to `#2a7cf7` | The logo mark only |

Other tokens:
- **Radius:** 6 px for controls and 8 px for panels.
- **Spacing:** multiples of 4 px.
- **Type:** text from 11.5 to 15 px, big Home numbers at 22 px, and monospace from 10.5 to 13 px.

### 5.2 Icons and status (Lucide)

Navigation icons:

| Screen | Icon |
|---|---|
| Home | `house` |
| Runs | `history` |
| Variables | `braces` |
| Scripts | `file-code` |
| Hedge apps | `app-window` |
| Connect | `plug` |
| Settings | `settings` |

Status icons:

| State | Icon | Word | Colour |
|---|---|---|---|
| Run succeeded | `circle-check` | ok | neutral |
| Run failed | `circle-x` | failed | destructive |
| Run without an end record | `circle-dashed` | unfinished | neutral |
| Attached to a profile script | `link` | attached | neutral |
| Nothing attached | `unlink` | nothing attached | muted |
| The operator's own file | `file-code` | your own file | neutral |
| File missing (stale) | `file-x` | file missing | warning |
| Staged (macOS) | `hourglass` | apply in OffShoot Helper | warning |
| Set up in the app itself | `hand` | set in the app | neutral |
| Not supported | `ban` | not supported yet | muted |
| Required variable missing | `braces` | not set | warning |
| Package problem | `package` | needs 0.11.0 (for example) | warning |
| App newer than tested, or scripting off | `triangle-alert` | as stated | warning |

Sidebar badges show counts:
- **Runs:** failures since the last open, in the destructive tint.
- **Variables:** missing requirements, in the warning tint.
- **Hedge apps:** stale entries, in the warning tint.
- **Settings:** package problems, in the warning tint.

## 6. Screens

### 6.1 Home (5A)

The profile switcher sits in the toolbar. The screen shows four counts:
- runs since the last open;
- failed runs since the last open;
- scripts attached;
- variables.

Below the counts, **Needs attention** lists the following, each linking to where it gets fixed:
- failed runs since the last open;
- missing required variables;
- stale entries per app;
- package problems;
- apps newer than the version HedgeBuddy was tested with;
- scripting turned off in an app that has scripts attached.

Beside that are **Recent runs** (the last 5) and **Claude, lately** (the last 3 calls).

In a narrow window, Home keeps the two run counts, Needs attention and Recent runs.

With no profile, Home shows two steps instead: create your first profile, then connect Claude.

### 6.2 Runs (5A)

**List:** runs grouped by day. Filters: All or Failed. It shows the active profile's runs, with an "All profiles" toggle.

**Detail:**
- status;
- exit code;
- start and end times and duration;
- app, event and profile;
- log lines;
- the traceback, in a destructive-tinted well;
- actions: Copy details, and Open script, which opens the Scripts screen on that script.

### 6.3 Variables (5B)

- **Layout.** List and detail, as in `variables.html` option B.
- **Missing requirements.** These are pinned at the top of the list. Each has an Add button that fills in the name and type.
- **Detail.** The typed editor (§7), the description, and the scripts that require the variable, each linking to Scripts.
- **Profile menu.** Switch, new, and delete. Delete previews which attached scripts would be left pointing at deleted files.
- **Import and export.** Export writes a profile to JSON, with secrets left out unless the operator ticks the box. Import creates a new profile from such a file.

### 6.4 Scripts (5B)

- **List:** each script's state, plus Sync attachments to this profile and New.
- **Detail:**
  - app and event;
  - attachment state;
  - required variables, each set or missing;
  - the check: Python found, compiles, and `hedgebuddy` package version;
  - a read-only preview;
  - Open in editor, Detach and Delete.
- **New:** pick an app and event, `script_template` creates the starter file, and it opens in the editor.
- **Previews:** Sync, Attach, Detach and Delete all use the preview dialog (§7).
- **macOS:** after attaching, a note says to apply the change in OffShoot Helper.

### 6.5 Hedge apps (5B)

**List:** each app with its version, or "not installed" or "macOS only".

**Detail:**
- the version, and whether scripting is on;
- Pro;
- the tested-with version;
- a warning bar for stale entries, with Clear all;
- every event and what it runs, using §5.2's states, with a Clear button on stale rows.

Clearing goes through the preview dialog, and the screen has a refresh button. Attaching and detaching happen only from Scripts.

### 6.6 Connect (5C)

- **Claude Desktop.**
  - The screen shows whether HedgeBuddy is set up.
  - "Set up" or "Update" previews the change to `claude_desktop_config.json`. It keeps every other server entry, and it saves a backup of the original file before writing.
  - After that, the operator has to restart Claude Desktop.
  - The config points at the `hedgebuddy` binary bundled with the app.
- **Claude Code.** The command `claude mcp add hedgebuddy -- "<bundled binary>" mcp`, with a Copy button.
- **Other clients.** The command and stdio transport, and a Copy button for a JSON config.
- **Activity.** The last 200 Claude calls, as time, tool, target and outcome, with outcome icons.

### 6.7 Settings (5C)

- **Python.**
  - The interpreter the Hedge apps use, and its version.
  - The installed `hedgebuddy` version against the one required.
  - "Install hedgebuddy" runs `<launcher> -m pip install <bundled wheel>` and shows pip's output. It works offline and before the PyPI release.
- **Data folder.** Its path, a Reveal button, and the catalog overrides in effect.
- **Editor command.** Optional. It is used by "Open in editor".

## 7. Shared interaction patterns

- **Change preview.**
  - Any action that changes something outside the data folder, and any deletion, opens a dialog. It runs the tool with `dry_run: true`, then shows the planned changes in plain words.
  - The words come from the dry-run result: registry values, workspace preferences, files, and what an attach would replace.
  - Apply runs the tool again without `dry_run`.
- **Saving.** Variable edits have an explicit Save, which enables on change. Leaving with unsaved changes asks first.
- **Typed editors.**

  | Type | Editor |
  |---|---|
  | `string` | text field |
  | `secret` | masked field; Reveal fetches the value with `reveal: true` on click |
  | `int`, `float` | number field |
  | `bool` | switch |
  | `path` | text field plus a folder picker, with a "not mounted" warning when the drive is absent |
  | `url` | text field with an http(s) check |
  | `string[]`, `path[]` | list editor with add, remove and reorder |

  Invalid values cannot be saved, and the reason shows under the field.
- **Errors.**
  - A failed load shows an inline panel with a Retry button.
  - A failed action shows a toast (shadcn's Sonner) with its message.
  - "Another HedgeBuddy is busy" offers Try again.
- **Empty states.** Every list explains the next step when it is empty.
- **Keyboard.** Arrow keys move through lists, and a filter field narrows them. There is no command palette in this version.

## 8. Packaging (5C)

The installer bundles:
- the `hedgebuddy` binary, as a Tauri `externalBin` sidecar;
- the `hedgebuddy` Python wheel, as a resource.

Connect and Settings use their installed paths. The app never starts the MCP server itself.

## 9. Testing

- **Tool crate.**
  - Every existing tool test moves with the tools.
  - A test checks that every tool has input and output schemas.
  - Every result in the tool tests is validated against its output schema.
  - The MCP contract test also checks `outputSchema` and `structuredContent`.
- **Core.** New tests cover:
  - two writers contending for the lock file, including the 10-second timeout;
  - batching;
  - activity-log trimming and target naming, including that no values are ever written;
  - preferences defaults and updates;
  - tolerant run decoding;
  - the rename retry;
  - a secret without a value counting as unmet.
- **App-only commands.** These are tested in Rust against `FakeHost` and temporary folders:
  - the home summary;
  - the Claude Desktop config merge, which must keep other servers and write a backup;
  - profile export without secrets unless asked, and import;
  - reading activity.
- **Frontend.** CI type-checks, fails when the generated types are stale, and builds.
- **Smoke checklist.** `docs/smoke-checklist.md` gains app steps, run on Windows and macOS:
  - live refresh while Claude edits;
  - a narrow window beside OffShoot;
  - every preview dialog;
  - Claude Desktop setup;
  - the pip install from the bundled wheel.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Typed results for 31 tools is a large mechanical change | It lands first in 5A, with schema tests that fail on any mismatch |
| Bursts of watcher events on macOS | 200 ms batching |
| OffShoot state is outside the data folder, so no notification covers it | Refetch on window focus, plus refresh buttons |
| The app and several MCP servers write at the same time | The cross-process lock, with a clear busy message |
| Claude Desktop's config format changes | Merge only the `mcpServers.hedgebuddy` entry, keep everything else, and write a backup first |

## 11. Out of scope

- Editing code in the app beyond the read-only preview.
- Running scripts from the app.
- Command panels for individual Hedge apps.
- Notifications, a tray icon, or any background process.
- A light theme.
- A command palette.
- The in-app update check, which moves to phase 6.

## 12. Changes to the main spec

The main spec (`2026-09-15-hedgebuddy-v0.11-overhaul-design.md`) changes as follows:

- **§4, repository layout:** add `crates/tools` (`hedgebuddy-tools`). The **app** bullet says the app calls the shared tool layer plus app-only commands.
- **§10, desktop app:**
  - The platform floor becomes macOS 26 and Windows 10.
  - The views become Home, Runs, Variables, Scripts, Hedge apps, Connect and Settings, with the details in this document.
  - The update check moves to phase 6.
- **§13, phasing:** phase 5 is 5A, 5B and 5C as in §1, and phase 6 gains the update check.
- **§5, storage format:** add `activity.jsonl` and `.hedgebuddy.lock`, and the shape of `preferences.json`.
