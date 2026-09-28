# Phase 5C: Connect and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the desktop app. The Connect screen sets up Claude Desktop from the app (with a preview and a backup), shows the Claude Code and other-client commands, and lists the last 200 Claude calls. The Settings screen shows the Python the Hedge apps use, installs the bundled `hedgebuddy` wheel, shows the data folder and the catalog overrides in effect, and edits the editor command. The installer bundles the `hedgebuddy` binary as a sidecar and the wheel as a resource.

**Architecture:**
- **Logic.** Claude Desktop config handling, pip install and the Settings read model live in `hedgebuddy-tools` (`crates/tools/src/app/`), tested against `FakeHost` and temporary folders.
- **Tauri crate.** It stays a thin wrapper. It resolves the bundled paths (the sidecar next to the app executable, the wheel in the resource folder) and passes them in as a `Bundle` value.
- **Packaging.** The sidecar and the wheel are declared in a separate `tauri.bundle.conf.json`, merged only when bundling. A `scripts/prepare_bundle.py` step builds the CLI and the wheel into place. Plain `cargo build`/`test`/`clippy` never need them.
- **CI.** A new CI job builds an unsigned bundle on Windows and macOS and checks both files land where the app looks for them.
- **UI.** Two simple pages, not list-and-detail (the mockup says so).

**Tech Stack:** as 5B (Rust 1.98, schemars 1, Tauri 2.11 with `tauri-plugin-dialog` and `tauri-plugin-opener`, React 19, TypeScript 7, Vite 8, Tailwind v4, shadcn/ui, TanStack Query, wouter). The Tauri CLI in CI comes from npm (`@tauri-apps/cli@2`, run with `bunx`), so CI never compiles `tauri-cli`.

**Spec:** `docs/superpowers/specs/2026-09-23-phase5-desktop-app-design.md`, binding. The sections this plan uses:
- §4.3: `claude_desktop_status()`, `claude_desktop_plan()`, `claude_desktop_apply()`, `pip_install()`.
- §6.6 Connect.
- §6.7 Settings.
- §7 shared patterns.
- §8 Packaging.
- §9 Testing: "the Claude Desktop config merge, which must keep other servers and write a backup"; smoke steps "Claude Desktop setup" and "the pip install from the bundled wheel".
- §10 risk: "Merge only the `mcpServers.hedgebuddy` entry, keep everything else, and write a backup first".
- §11: the update check is phase 6.

The mockup is `docs/superpowers/specs/2026-09-23-phase5-mockups/connect-settings.html`. It's a reference only; the spec wins. That means no teal "connected" pill, and no Updates section (phase 6). The 5A and 5B plans describe the foundation.

## Global Constraints

- **Crates.** Logic lives in `hedgebuddy-core` and `hedgebuddy-tools`; `hedgebuddy-app` only wraps. App-only commands are never registered as tools. The test `app_commands_are_never_tools_and_have_object_schemas` guards this.
- **The app never starts the MCP server itself (spec §8).** Connect and Settings use the installed paths only.
- **Change preview (spec §7).** Claude Desktop setup changes a file outside the data folder, so it goes through `ChangePreviewDialog`: `claude_desktop_plan` is the dry run, `claude_desktop_apply` applies.
- **Claude Desktop merge (spec §6.6, §10).**
  - Only `mcpServers.hedgebuddy` changes; every other server entry and every other key stays.
  - A backup of the original file is written before any write.
  - After applying, the operator has to restart Claude Desktop.
  - The config points at the `hedgebuddy` binary bundled with the app.
- **pip (spec §6.7).** "Install hedgebuddy" runs `<launcher> -m pip install <bundled wheel>` and shows pip's output. It works offline and before the PyPI release.
- **Settings (spec §6.7).**
  - Python: the interpreter the Hedge apps use, its version, and the installed `hedgebuddy` version against the one required.
  - The data folder, with Reveal.
  - The catalog overrides in effect.
  - The optional editor command, used by "Open in editor".
- **Connect (spec §6.6).**
  - Claude Desktop status with Set up or Update.
  - Claude Code: `claude mcp add hedgebuddy -- "<bundled binary>" mcp`, with Copy.
  - Other clients: the command, the stdio transport, and a Copy for a JSON config.
  - Activity: the last 200 Claude calls, as time, tool, target and outcome, with outcome icons.
- **Errors, empty states, keyboard (spec §7).**
  - A failed load shows an inline panel with Retry.
  - A failed action shows a toast; "Another HedgeBuddy is busy" offers Try again.
  - Every list explains the next step when it is empty.
- **Tests never touch the real machine.** Use `FakeHost` and temporary folders only. Tests never write the real registry, real Hedge settings or the real Claude Desktop config. Never run `docs/smoke-checklist.md`.
- **Never publish.** Don't publish to PyPI, and don't run the publish workflow. The bundle CI job builds an unsigned bundle and uploads nothing.
- **Frontend.**
  - Same stack and design rules as 5A/5B: dark only, the tokens in `crates/app/ui/src/styles/globals.css`, a Lucide icon plus a word, colour only for problems (red = failed/destructive, amber = needs a look), Inter and JetBrains Mono, the 4 px grid.
  - Reuse `ErrorPanel`, `EmptyState`, `StatusIcon`, `STATUS`, `Mono`, `ChangePreviewDialog`, `showError`/`clearBusyToast`, `useUnsaved`/`confirmLeave`.
  - No React unit tests.
- **Browser preview.** `bun run dev:mock` on port 5199. The scenarios are `problems` (default), `healthy`, `empty`, `error`, `busy`, `macos`, plus two new ones: `unactivated` (profiles exist, none active) and `nopackage` (hedgebuddy not installed).
- **CI.**
  - Existing: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `cd python && uv run pytest -q`, `python scripts/sync_version.py --check`, and in `crates/app/ui` `bun run gen:check` and `bun run build`. They run on Windows and macOS.
  - New: the unsigned "App bundle" job on Windows and macOS.
- **Docs style.** Every `pub` item gets a `///` doc comment. Result and argument fields get a `///` line.
- **Git.**
  - Branch `feat/phase5c-connect-settings`.
  - Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Stage only your own files and commit with a pathspec (`git commit -m … -- <files>`).

## Design direction (frontend-design, binding for every UI task)

Everything in 5A's and 5B's Design direction sections still binds:
- concept "instrument panel";
- colour discipline;
- the typography scale;
- the 4 px grid;
- Lucide icons with `strokeWidth={1.75}`;
- motion;
- the four designed states;
- accessibility (focus ring, 28 px hit targets);
- the avoid-list;
- visual checks at about 960×640 and 480×640.

Every UI implementer loads and follows frontend-design before writing code. Every UI review judges against it together with the spec and the mockup. What 5C adds:

**Simple pages.**
- **Layout.**
  - Connect and Settings are single scrolling pages, not list-and-detail.
  - The screen header (h-11, `screen-heading`) is followed by sections.
  - Each section is a `surface` panel (8 px radius, hairline border, 1 px inset top highlight) with a micro-label title (`CLAUDE DESKTOP`, `CLAUDE CODE`, `OTHER MCP CLIENTS`, `RECENT CLAUDE ACTIVITY`, `PYTHON THE HEDGE APPS USE`, `DATA FOLDER`, `EDITOR COMMAND`), 12 px padding, and 12 px between panels.
  - The content column is at most 720 px wide, left-aligned in the main area, with 16 px gutters (12 px under 640 px).
- **Readouts.**
  - A panel's key facts read as label/value pairs.
  - Labels are micro-labels on the left (120 px column) and values on the right.
  - Below 480 px of container width, each label stacks above its value.
  - Paths, commands, file names, tool names and versions are mono. Versions use tabular figures.
- **Status line.**
  - A panel's state is one line: the Lucide icon and a word from `STATUS`, then one plain sentence.
  - Fine is neutral grey.
  - Something that needs a look (Claude Desktop pointing at another binary, a package problem) is amber.
  - Something that can't be read (an invalid config) is amber with `triangle-alert`.
  - Nothing is teal. Nothing is green.
- **Command wells.**
  - A copyable command sits in a `bg-well` box: mono `text-xs`, wraps at spaces and separators (never mid-word), with a right-aligned "Copy" text button (`copy` icon plus word).
  - After copying, the button reads "Copied" for 1.5 s and a toast says "Copied".
  - The well scrolls horizontally only if a single token is longer than the box.
- **The activity list.**
  - A dense, hairline-ruled list grouped by day (the same day headers as Runs).
  - Rows are 32 px: time `HH:MM` (tabular, muted), the tool name (mono), the target (mono, muted, truncated with a `title`), and at the right the outcome icon and word from `STATUS.callOk`/`callError`/`callWaiting`.
  - Failed calls are red, "waited for your OK" is neutral, ok is neutral.
- **pip output.**
  - After an install, a `bg-well` log box (mono `text-xs`, max 240 px tall, scrolls, keeps line breaks) shows the command line first, then pip's output.
  - Above it, one line gives the outcome: neutral `circle-check` "Installed hedgebuddy 0.11.0", or red `circle-x` "pip failed (exit 1)".
- **Editor command.**
  - A form row: a mono text field (32 px, `bg-well`, `border-border-strong`), a help line under it, and Save on the right. Save is disabled until the field changes and is valid.
  - It shows "Unsaved changes" when dirty, and leaving asks first (`useUnsaved`).
  - The reason for an invalid value shows under the field in `text-destructive`.

## Rulings made while planning

1. **Where Claude Desktop's config lives.**
   - Windows:
     - Use `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\claude_desktop_config.json` when exactly one `Claude_*` package folder exists (an MSIX install sees its private copy there).
     - Otherwise `%APPDATA%\Claude\claude_desktop_config.json`.
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`.
   - The status shows the path it uses.
   - Why: README's documented locations, plus MSIX file virtualization.
   - Cost if wrong: setup writes a file Claude doesn't read. The status shows the path, and the smoke checklist verifies it.
2. **The entry.**
   - `mcpServers.hedgebuddy = {"command": "<absolute bundled binary>", "args": ["mcp"]}`.
   - Every other key and server stays as it was.
   - The file is written back as pretty JSON with 2-space indents. serde_json is not built with `preserve_order`, so key order may change; the backup keeps the original bytes.
   - Why: turning on `preserve_order` workspace-wide would reorder every generated schema.
   - Cost if wrong: formatting only.
3. **States.**
   - `set_up`: the entry equals the expected one.
   - `outdated`: an entry exists but differs, e.g. README's `"command": "hedgebuddy"` on PATH, or an old install path.
   - `not_set_up`: the file has no entry, or the file is missing but Claude's folder exists.
   - `no_claude`: no Claude folder. Set up creates the folder and the file, with a note that Claude Desktop doesn't seem to be installed.
   - `invalid`: the file isn't a JSON object, or `mcpServers` isn't an object. Plan and apply refuse with a plain error and never overwrite.
4. **Backups.**
   - Before writing an existing file, copy it byte for byte to `claude_desktop_config.<YYYYMMDD-HHMMSS>.hedgebuddy-backup.json` in the same folder.
   - Keep the 5 newest files matching exactly that pattern, and delete older ones. Nothing else is ever deleted.
   - A missing file has nothing to back up.
   - Why: a single rotating backup would lose the good copy after two bad writes.
   - Cost if wrong: up to 5 small files beside the config.
5. **Locking.**
   - `claude_desktop_apply` takes the data-folder write guard. That serializes HedgeBuddy writers and gives the busy toast.
   - It writes atomically with `write_atomic` (not private).
   - `pip_install` takes no data-folder lock, since it changes the Python environment. One install runs at a time: a second call fails with "An install is already running".
6. **Bundled paths.** The app resolves them and passes `Bundle { binary: Option<PathBuf>, wheel: Option<PathBuf> }` into the tools functions. Each is `None` when the file isn't there.
   - `binary` is `<dir of current_exe>/hedgebuddy[.exe]`. Tauri puts `externalBin` sidecars next to the main executable (Windows install folder, `Contents/MacOS` on macOS). In a dev build, `target/debug/hedgebuddy.exe` is the workspace's own CLI.
   - `wheel` is `<resource_dir>/wheel/hedgebuddy-<app version>-py3-none-any.whl`.
   - No `tauri-plugin-shell`: the app never runs the sidecar.
   - Without the binary, Set up and Update are disabled with the reason "This build has no bundled hedgebuddy command." The Claude Code and other-client commands then show `hedgebuddy` (the PATH form) with that note.
   - Without the wheel, Install is disabled with "This build has no bundled package", and the pip command from `python.problem` is shown for copying.
7. **Packaging.**
   - `externalBin: ["binaries/hedgebuddy"]` and `resources: {"bundle/wheel/": "wheel/"}` go in `crates/app/tauri.bundle.conf.json`. It's merged only for bundling (`tauri build --config tauri.bundle.conf.json`), so `tauri-build` never demands the sidecar during `cargo build`, `test` or `clippy`.
   - `scripts/prepare_bundle.py`:
     - builds the CLI in release mode;
     - copies it to `crates/app/binaries/hedgebuddy-<host triple>[.exe]`;
     - runs `uv build` in `python/`;
     - copies `hedgebuddy-<VERSION>-py3-none-any.whl` into `crates/app/bundle/wheel/`.

     Both destinations are git-ignored.
   - Signing and release stay in phase 6.
8. **pip command.**
   - `<launcher…> -m pip install --upgrade --no-index --disable-pip-version-check <wheel>`, through `Host::run` (no console window).
   - `--no-index` guarantees offline behaviour; the wheel has no dependencies.
   - When site-packages isn't writable, pip falls back to a user install on its own. A PEP 668 refusal (Homebrew Python) is shown as pip's own message.
   - Afterwards the command invalidates the Python cache and probes again.
   - The result: `{ok, exit_code, command, output, installed}`. `output` is stdout then stderr, capped to the last 64 KiB.
   - Cost if wrong: an operator on a locked-down Python sees pip's error and follows README.
9. **`settings_overview` (new app command, read-only).** It returns:
   - the data folder;
   - the catalog overrides in effect (`Catalog::overridden()` ids) and `catalog_error`;
   - the Python status (the cached probe, the same `PythonStatus` Home uses);
   - the bundle (binary path, wheel path and wheel version);
   - `editor_command`.
10. **Status words.**

    | State | Icon | Word | Tone |
    |---|---|---|---|
    | `set_up` | `plug` | "set up" | neutral |
    | `not_set_up` | `unplug` | "not set up" | muted |
    | `no_claude` | `unplug` | "Claude Desktop not found" | muted |
    | `outdated` | `triangle-alert` | "points elsewhere" | amber |
    | `invalid` | `triangle-alert` | "can't read the config" | amber |

    Why: colour marks only problems. The mockup's teal pill is exploratory.
11. **Editor command.**
    - `preferences_set` validates `editor_command` by splitting it with `editor_argv`. An invalid value returns a plain error, which shows under the field.
    - 5B's concern stands accepted: a compromised webview could choose the program. There's no native confirm; the webview is our own bundled code under a strict CSP, and it can already write and attach scripts.
    - The help line documents `{file}` and quoting, including single quotes for a word ending in a backslash (5B's parked minor).
12. **Copy.** Copy buttons use `navigator.clipboard.writeText` (5A's runtime smoke confirmed it works in the real webview) and toast "Copied".
13. **Activity targets are capped at 200 characters** when written by the MCP server (core), with "…" appended. Why: 5A parked "activity target has no length cap".
14. **Folded-in parked items.**
    - A startup failure (data folder unresolvable) shows a native error dialog before exit.
    - Deleting the last item of a list moves focus to the screen heading.
    - Home's "Choose a profile" buttons wrap long names at 480 px.
    - The mock gains the `unactivated` and `nopackage` scenarios.
    - **Still parked for phase 6:**
      - macOS staged-stale detection (needs a real OffShoot Helper);
      - Home's per-refetch run parsing;
      - queued writes waiting without limit;
      - malformed Tauri args rejecting with a plain string.
15. **CI "App bundle" job.** On `windows-latest` (`--bundles nsis`) and `macos-latest` (`--bundles app`) it:
    1. runs `scripts/prepare_bundle.py`;
    2. runs `bunx @tauri-apps/cli@2 build --config tauri.bundle.conf.json --bundles <b>` from `crates/app`;
    3. runs `scripts/check_bundle.py`, which asserts that the sidecar sits next to the app binary in the build output, and that the wheel is in the bundle's resource folder (inside `HedgeBuddy.app/Contents/Resources/wheel/` on macOS).

    It uploads nothing and signs nothing.
    Why: spec §8 packaging is otherwise unverified.
    Cost if wrong: CI time.

## File structure

| File | Responsibility |
|---|---|
| `crates/tools/src/app/claude_desktop.rs` (new) | config path resolution, `ClaudeDesktopStatus`, `ClaudeDesktopPlan`, `ClaudeDesktopApplied`, merge, backups, and the three commands |
| `crates/tools/src/app/settings.rs` (new) | `Bundle`, `SettingsOverview`, `settings_overview`, `PipInstallResult`, `pip_install` |
| `crates/tools/src/app/mod.rs` | registers the five new commands; `preferences_set` validates `editor_command` |
| `crates/core/src/activity.rs` | the target is capped at 200 characters |
| `crates/app/src/commands.rs`, `lib.rs`, `state.rs` | Tauri wrappers, `Bundle` resolution, the install mutex, the startup error dialog |
| `crates/app/tauri.bundle.conf.json` (new) | `externalBin` and `resources`, merged only when bundling |
| `scripts/prepare_bundle.py` (new), `scripts/check_bundle.py` (new) | put the sidecar and wheel in place; verify a built bundle |
| `.github/workflows/ci.yml` | the new "App bundle" job |
| `.gitignore` | `/crates/app/binaries/`, `/crates/app/bundle/` |
| `crates/app/ui/src/api/queries.ts`, `tools.gen.ts` | hooks and invalidation for the new commands |
| `crates/app/ui/src/mock/*` | the mock commands and the new scenarios |
| `crates/app/ui/src/lib/status.ts` | the Claude Desktop status keys |
| `crates/app/ui/src/screens/connect/*` (new) | the Connect screen |
| `crates/app/ui/src/screens/settings/*` (new) | the Settings screen |
| `crates/app/ui/src/components/app/command-well.tsx` (new) | the copyable command box |
| `crates/app/ui/src/App.tsx`, `screens/placeholder.tsx` | routes; the placeholder is removed |
| `docs/smoke-checklist.md`, `CHANGELOG.md`, `README.md`, `crates/app/ui/README.md` | docs |

---

### Task 1: Claude Desktop config: status, plan, apply

**Files:**
- Create: `crates/tools/src/app/claude_desktop.rs`
- Modify: `crates/tools/src/app/mod.rs` (`mod claude_desktop;`, `pub use`, register three commands), `crates/core/src/activity.rs` (the target cap)

**Interfaces:**
- Consumes: `hedgebuddy_core::catalog::expand_path(host, template)`, `Host::{os, env_var, home_dir}`, `hedgebuddy_core::fs_util::write_atomic(path, bytes, private)`, `Context::write_guard()`, `crate::app::checked`, and `Bundle` from Task 2. To keep Task 1 self-contained, define `Bundle` in `claude_desktop.rs` now; Task 2 re-exports it from `settings.rs`.
- Produces:
  - `pub struct Bundle { pub binary: Option<PathBuf>, pub wheel: Option<PathBuf> }` (Debug, Clone, Default).
  - `pub fn claude_desktop_status(ctx: &Context, bundle: &Bundle) -> Result<ClaudeDesktopStatus, ToolError>`.
  - `pub fn claude_desktop_plan(ctx: &Context, bundle: &Bundle) -> Result<ClaudeDesktopPlan, ToolError>`.
  - `pub fn claude_desktop_apply(ctx: &Context, bundle: &Bundle, now: &str) -> Result<ClaudeDesktopApplied, ToolError>`. `now` is a timestamp for the backup name, `YYYYMMDD-HHMMSS`; the Tauri wrapper passes the local time and tests pass a fixed string.
  - These types:

    ```rust
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema)]
    #[serde(rename_all = "snake_case")]
    pub enum ClaudeDesktopState { SetUp, Outdated, NotSetUp, NoClaude, Invalid }

    /// The `mcpServers.hedgebuddy` entry.
    #[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
    pub struct ServerEntry { pub command: String, pub args: Vec<String> }

    #[derive(Debug, Serialize, JsonSchema)]
    pub struct ClaudeDesktopStatus {
        /// The config file this machine's Claude Desktop reads.
        pub config_path: PathBuf,
        pub state: ClaudeDesktopState,
        /// Why the config can't be read (state `invalid`), else null.
        pub problem: Option<String>,
        /// The hedgebuddy entry in the file now, if any.
        pub current: Option<ServerEntry>,
        /// The entry Set up writes, or null without a bundled binary.
        pub expected: Option<ServerEntry>,
        /// The other MCP servers in the file, by name (kept as they are).
        pub other_servers: Vec<String>,
        /// The bundled hedgebuddy command, or null in a build without one.
        pub binary: Option<PathBuf>,
        /// `claude mcp add hedgebuddy -- "<binary>" mcp` (or `hedgebuddy mcp` without a binary).
        pub claude_code_command: String,
        /// `{"mcpServers": {"hedgebuddy": {...}}}` for other clients, pretty-printed.
        pub client_json: String,
    }

    #[derive(Debug, Serialize, JsonSchema)]
    pub struct ClaudeDesktopPlan {
        pub config_path: PathBuf,
        /// True when the file does not exist yet and will be created.
        pub creates_file: bool,
        /// Where the original is copied first, or null when there is no file yet.
        pub backup_path: Option<PathBuf>,
        pub before: Option<ServerEntry>,
        pub after: ServerEntry,
        pub other_servers: Vec<String>,
        /// True when nothing would change (already set up).
        pub unchanged: bool,
    }

    #[derive(Debug, Serialize, JsonSchema)]
    pub struct ClaudeDesktopApplied {
        pub config_path: PathBuf,
        pub backup_path: Option<PathBuf>,
        /// Old HedgeBuddy backups removed to keep the newest five.
        pub removed_backups: Vec<PathBuf>,
    }
    ```

- [ ] **Step 1: Write the failing tests.** Put them in `claude_desktop.rs` `mod tests`, using `test_ctx(FakeHost…)`, `tempfile`, and `checked("claude_desktop_status", …)` etc.
  - `windows_path_is_appdata_claude`: set `APPDATA=<tmp>/Roaming` and `LOCALAPPDATA=<tmp>/Local` (no Packages). The status `config_path` is `<tmp>/Roaming/Claude/claude_desktop_config.json`, and the state is `no_claude`.
  - `windows_msix_package_path_wins`: create `<tmp>/Local/Packages/Claude_pzs8sxrjxfjjc/LocalCache/Roaming/Claude/`. The `config_path` is inside it.
  - `two_claude_packages_fall_back_to_appdata`: two `Claude_*` folders, so the path is under APPDATA.
  - `macos_path_is_application_support`: `FakeHost::new(Os::Macos).with_home(tmp)`, so the path is `<tmp>/Library/Application Support/Claude/claude_desktop_config.json`.
  - `status_states`:
    - an existing folder without a file gives `not_set_up`;
    - the file `{"mcpServers":{"other":{"command":"x"}}}` gives `not_set_up` with `other_servers == ["other"]`;
    - the file with `hedgebuddy: {"command":"hedgebuddy","args":["mcp"]}` and `bundle.binary=Some(/opt/hb)` gives `outdated`;
    - the same entry as expected gives `set_up`;
    - `[1,2]`, `{"mcpServers": 3}` and non-JSON bytes each give `invalid` with a `problem`.
  - `commands_quote_the_binary`:
    - `claude_code_command == r#"claude mcp add hedgebuddy -- "<binary>" mcp"#`;
    - `client_json` parses to `{"mcpServers":{"hedgebuddy":{"command":"<binary>","args":["mcp"]}}}`;
    - with no binary, the command is `claude mcp add hedgebuddy -- hedgebuddy mcp`.
  - `plan_describes_the_change_without_writing`: plan on an existing file. `backup_path` is `Some`, with a name matching `claude_desktop_config.*.hedgebuddy-backup.json` in the same folder. `before`/`after`/`other_servers` are right. The file is unchanged, and no backup exists yet.
  - `apply_keeps_other_servers_and_writes_a_backup`:
    - Start from a file with `"globalShortcut": "Ctrl+Space"` and `mcpServers.other`, then apply with `now="20260928-120000"`.
    - The new JSON has `globalShortcut` unchanged, `mcpServers.other` unchanged, and `mcpServers.hedgebuddy == expected`.
    - The backup file's bytes equal the original bytes.
    - The status is now `set_up`.
  - `apply_creates_a_missing_file_and_folder`: `no_claude` gives a new file containing only `mcpServers.hedgebuddy`, and `backup_path` is `None`.
  - `apply_refuses_invalid_and_missing_binary`:
    - An `invalid` file gives an `Err` whose message contains "isn't valid", and the file bytes are unchanged.
    - `bundle.binary=None` gives an `Err` containing "no bundled hedgebuddy command".
  - `backups_keep_the_newest_five`:
    - Pre-create six `claude_desktop_config.2026010{1..6}-000000.hedgebuddy-backup.json` files and one unrelated `claude_desktop_config.backup.json`.
    - Apply at `now="20260928-120000"`. That leaves 5 matching backups: the new one plus the four newest old ones.
    - `removed_backups` lists the two oldest. The unrelated file still exists.
  - `apply_takes_the_write_lock`: while holding `ctx.write_guard()` on another `Context` over the same store, with a short `with_lock_timeout`, apply returns an error where `is_busy()` is true.
  - In core, `activity.rs`: `activity_target_is_capped`. A 300-character `name` gives a target of 200 characters that ends with "…".

- [ ] **Step 2: Run the tests; they fail** (`cargo test -p hedgebuddy-tools claude_desktop`, `cargo test -p hedgebuddy-core activity_target_is_capped`).

- [ ] **Step 3: Implement.** Sketch (keep functions small and documented):

```rust
fn config_path(ctx: &Context) -> Result<PathBuf, ToolError> {
    let host = ctx.hedge.host();
    match host.os() {
        Os::Windows => {
            if let Ok(packages) = expand_path(host, r"%LOCALAPPDATA%\Packages") {
                let found: Vec<PathBuf> = std::fs::read_dir(&packages).into_iter().flatten().flatten()
                    .filter(|e| e.file_name().to_string_lossy().starts_with("Claude_"))
                    .map(|e| e.path().join(r"LocalCache\Roaming\Claude")).collect();
                if let [one] = found.as_slice() { return Ok(one.join("claude_desktop_config.json")); }
            }
            Ok(expand_path(host, r"%APPDATA%\Claude\claude_desktop_config.json")?)
        }
        Os::Macos => Ok(expand_path(host, "~/Library/Application Support/Claude/claude_desktop_config.json")?),
    }
}

enum Read { Missing { folder_exists: bool }, Object(serde_json::Map<String, Value>), Invalid(String) }

fn read_config(path: &Path) -> Result<Read, ToolError> { /* NotFound → Missing{folder_exists}; parse; must be an
   object whose "mcpServers" (if present) is an object; else Invalid("claude_desktop_config.json isn't valid: …") */ }

fn expected(bundle: &Bundle) -> Option<ServerEntry> {
    bundle.binary.as_ref().map(|b| ServerEntry { command: b.display().to_string(), args: vec!["mcp".into()] })
}
```

   - The backup name is `claude_desktop_config.{now}.hedgebuddy-backup.json`. Recognize backups with an exact pattern: the prefix `claude_desktop_config.`, then 8 digits, `-`, 6 digits, then `.hedgebuddy-backup.json`. Sort the names and keep the last 5.
   - `apply`:
     1. `let _g = ctx.write_guard()?;`
     2. Read the config and refuse `Invalid`.
     3. Build the new object: take the map, or an empty one; take `mcpServers`, or an empty object; set `hedgebuddy`.
     4. If the file exists, `std::fs::copy` it to the backup, then prune.
     5. `create_dir_all` the parent.
     6. `write_atomic(path, serde_json::to_vec_pretty(&obj)? + "\n", false)`.
   - In the core `activity_target`, truncate to 199 chars plus `…` (by chars, not bytes) when longer than 200.
   - Register the commands in `mod.rs`'s `commands()`:
     - `app_command!("claude_desktop_status", NoParams, ClaudeDesktopStatus)`
     - `app_command!("claude_desktop_plan", NoParams, ClaudeDesktopPlan)`
     - `app_command!("claude_desktop_apply", NoParams, ClaudeDesktopApplied)`

     The bundle comes from the app, not from args.

- [ ] **Step 4: Run the tests; they pass.** Then run `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test --workspace`.

- [ ] **Step 5: Commit** `feat(tools): Claude Desktop config status, plan and apply with backups`.

---

### Task 2: Settings overview, pip install, editor command check

**Files:**
- Create: `crates/tools/src/app/settings.rs`
- Modify: `crates/tools/src/app/mod.rs` (`mod settings;`; move `Bundle` here and re-export it; register `settings_overview` and `pip_install`; `preferences_set` validation)

**Interfaces:**
- Consumes: `PythonCache::{get, invalidate}`, `python_env::{launcher, PythonInfo}`, `home.rs`'s `python_status` (make it `pub(crate)`), `Host::run`, `Catalog::overridden()`, `Context::catalog_error`, `Store::{root, preferences}`, `files::editor_argv`.
- Produces:
  - Types:

    ```rust
    #[derive(Debug, Serialize, JsonSchema)]
    pub struct BundleInfo {
        /// The bundled hedgebuddy command, or null.
        pub binary: Option<PathBuf>,
        /// The bundled wheel, or null.
        pub wheel: Option<PathBuf>,
        /// The wheel's version (from its file name), or null.
        pub wheel_version: Option<String>,
    }
    #[derive(Debug, Serialize, JsonSchema)]
    pub struct SettingsOverview {
        /// This machine's OS (for OS-specific wording such as the default editor).
        pub os: Os,
        pub data_dir: PathBuf,
        /// Apps whose catalog entry comes from <data>/catalog/, by id.
        pub catalog_overrides: Vec<String>,
        /// Why the catalog overrides could not be loaded, or null.
        pub catalog_error: Option<String>,
        pub python: PythonStatus,
        /// The pip command Install runs, as the operator would type it, or null without Python or wheel.
        pub install_command: Option<String>,
        pub bundle: BundleInfo,
        pub editor_command: Option<String>,
    }
    #[derive(Debug, Serialize, JsonSchema)]
    pub struct PipInstallResult {
        pub ok: bool,
        pub exit_code: i32,
        /// The command line that ran.
        pub command: String,
        /// pip's stdout then stderr, the last 64 KiB.
        pub output: String,
        /// The hedgebuddy version installed afterwards, if any.
        pub installed: Option<String>,
    }
    ```

  - `pub fn settings_overview(ctx: &Context, python: &PythonCache, bundle: &Bundle) -> Result<SettingsOverview, ToolError>`.
  - `pub fn pip_install(ctx: &Context, python: &PythonCache, bundle: &Bundle) -> Result<PipInstallResult, ToolError>`.

- [ ] **Step 1: Write the failing tests** (`settings.rs` tests, FakeHost, `with_run_response` for the probe and for pip):
  - `overview_reports_folder_overrides_python_and_bundle`:
    - Write `<data>/catalog/offshoot.toml` by copying the embedded one via `hedgebuddy_core::Catalog::embedded()`'s source, or any valid manifest the tests already use. `catalog_overrides == ["offshoot"]`.
    - With the probe response for `py -3 -c PROBE` returning `{"executable":"C:/Py/python.exe","version":"3.13.5","hedgebuddy":"0.10.0"}`, `python.installed == Some("0.10.0")` and `python.problem` is `Some`.
    - With `bundle.wheel=Some(<tmp>/wheel/hedgebuddy-0.11.0-py3-none-any.whl)` (the file exists), `bundle.wheel_version == Some("0.11.0")` and `install_command == Some("py -3 -m pip install --upgrade --no-index --disable-pip-version-check \"<wheel>\"")`.
  - `overview_without_python_or_wheel`: no probe response gives `python.found == false`, `install_command == None` and `bundle.wheel == None`.
  - `pip_install_runs_the_bundled_wheel_offline`:
    - Register the pip run for `py` with args `["-3","-m","pip","install","--upgrade","--no-index","--disable-pip-version-check","<wheel>"]` → status 0, stdout "Successfully installed hedgebuddy-0.11.0".
    - Register a second probe response reporting `0.11.0`. Probe responses are matched by args; if the FakeHost can't return different outputs for the same args, test `installed` through a cache the test invalidates and a host whose probe already reports 0.11.0.
    - Expect `ok`, `exit_code == 0`, and output containing "Successfully installed"; `host.runs()` includes the pip argv. Wrap the result in `checked("pip_install", …)`.
  - `pip_install_failure_is_a_result_not_an_error`: pip exits 1 with a stderr message, which gives `ok == false`, `exit_code == 1`, and the message in `output`.
  - `pip_install_needs_python_and_a_wheel`: without Python, or with `bundle.wheel == None`, the result is `Err` with plain messages ("Python 3 was not found…" / "This build has no bundled package").
  - `pip_output_is_capped`: 100 KiB of stdout leaves `output` at ≤ 64 KiB and ending with the tail.
  - `preferences_set_rejects_an_unparsable_editor_command`: `editor_command: Some("code \"unterminated")` gives `Err` with the `editor_argv` message, and the stored preferences are unchanged. `Some("code --wait {file}")` is ok, and null clears it.

- [ ] **Step 2: Run the tests; they fail.**

- [ ] **Step 3: Implement.**
  - `wheel_version` parses `hedgebuddy-<ver>-py3-none-any.whl`.
  - The pip argv is `launcher(os)` + `["-m","pip","install","--upgrade","--no-index","--disable-pip-version-check", <wheel path>]`. `install_command` is the display form, with the wheel path double-quoted.
  - `pip_install` runs `host.run(argv[0], rest)`.
    - Build `output` from stdout, then a newline, then stderr. Keep the last 64 KiB on a char boundary.
    - Call `python.invalidate()`, then `python.get(host)` for `installed`.
    - A spawn failure (`Err` from `run`) becomes a `ToolError` saying "couldn't start <launcher>: …".
  - The one-at-a-time guard lives in the Tauri crate (Task 3); document it here.
  - `settings_overview`:
    - `data_dir = ctx.store.root()`;
    - `ctx.hedge.catalog().overridden().to_vec()`;
    - `ctx.catalog_error.clone()`;
    - `python_status(python.get(host)?)`;
    - `bundle` paths, keeping only those that exist;
    - `ctx.store.preferences()?.editor_command`.
  - In `preferences_set`: when the patch sets `editor_command` to a non-empty string, call `editor_argv(cmd, Path::new("x.py"))?` before writing.
  - Register `app_command!("settings_overview", NoParams, SettingsOverview)` and `app_command!("pip_install", NoParams, PipInstallResult)`.

- [ ] **Step 4: Run the tests; they pass,** along with all the checks: fmt, clippy, `cargo test --workspace`, and `cargo run -p hedgebuddy-tools --example app_schemas` prints the 22 commands.

- [ ] **Step 5: Commit** `feat(tools): settings overview, bundled pip install, editor command check`.

---

### Task 3: Tauri wiring, packaging and the bundle CI job

**Files:**
- Modify: `crates/app/src/{commands.rs,lib.rs,state.rs}`, `.gitignore`, `.github/workflows/ci.yml`, `docs/releasing-python.md` (one line: the app bundle builds its own wheel)
- Create: `crates/app/tauri.bundle.conf.json`, `scripts/prepare_bundle.py`, `scripts/check_bundle.py`

**Interfaces:**
- Consumes: Task 1 and Task 2 functions and `Bundle`.
- Produces:
  - Tauri commands `claude_desktop_status`, `claude_desktop_plan`, `claude_desktop_apply`, `settings_overview` and `pip_install`, each taking `args: NoParams`.
  - `AppState.installing: Mutex<()>`.

- [ ] **Step 1: The bundle resolver.**
  - In `commands.rs`, add `fn bundle(app: &AppHandle) -> Bundle`:
    - `binary`: `std::env::current_exe()?.parent()?.join(format!("hedgebuddy{}", std::env::consts::EXE_SUFFIX))`, kept if it is a file.
    - `wheel`: `app.path().resource_dir()?.join("wheel").join(format!("hedgebuddy-{}-py3-none-any.whl", app.package_info().version))`, kept if it is a file.
    - Any error becomes `None`.
  - Each new command takes `app: AppHandle`, `state`, and `args`, and calls the tools function in `blocking(...)`.
  - `claude_desktop_apply` passes the local time as `YYYYMMDD-HHMMSS`. Use `hedgebuddy_core::clock` if it offers local time; otherwise UTC with the same format, documented as UTC.
  - `pip_install` calls `state.installing.try_lock()`. On failure it returns `CommandError { kind: "error", message: "An install is already running" }`. It holds the guard across the blocking call.
  - Register all five in `generate_handler!`.
- [ ] **Step 2: Startup failure (parked).**
  - In `lib.rs` `setup`, when `AppState::open` fails, show `app.dialog().message(<plain message>).kind(MessageDialogKind::Error).title("HedgeBuddy can't start").blocking_show()`, then return the error. The message is "HedgeBuddy couldn't open its data folder: <reason>".
  - Keep the existing error path.
- [ ] **Step 3: Packaging config.** Create `crates/app/tauri.bundle.conf.json`:

```json
{
  "bundle": {
    "externalBin": ["binaries/hedgebuddy"],
    "resources": { "bundle/wheel/": "wheel/" }
  }
}
```

  Add to `.gitignore`: `/crates/app/binaries/` and `/crates/app/bundle/`.
- [ ] **Step 4: `scripts/prepare_bundle.py`** (Python 3.9+, stdlib only; run from the repo root). It does four things:
  1. Reads `VERSION`.
  2. Runs `cargo build --release -p hedgebuddy-cli`.
  3. Finds the host triple from `rustc -vV` (the `host:` line). Copies `target/release/hedgebuddy[.exe]` to `crates/app/binaries/hedgebuddy-<triple>[.exe]`, creating the folder.
  4. Runs `uv build --wheel` in `python/`. Checks that `python/dist/hedgebuddy-<VERSION>-py3-none-any.whl` exists. Clears `crates/app/bundle/wheel/` and copies the wheel there.

  It prints what it placed. It exits non-zero with a plain message on any failure. `--skip-build` reuses existing artifacts (for local runs).
- [ ] **Step 5: `scripts/check_bundle.py <target-dir>`.** It asserts the following and prints what it found:
  - **Windows:** `target/release/hedgebuddy.exe` exists next to `target/release/hedgebuddy-app.exe`. Tauri copies sidecars beside the main binary when building. The NSIS installer exists under `target/release/bundle/nsis/`. The resource `target/release/wheel/hedgebuddy-<VERSION>-py3-none-any.whl` exists.
  - **macOS:** `target/release/bundle/macos/HedgeBuddy.app/Contents/MacOS/hedgebuddy` and `…/Contents/Resources/wheel/hedgebuddy-<VERSION>-py3-none-any.whl` exist.

  Adjust the exact paths to what the first real build shows. Record them in the script's docstring, and keep the assertions strict.
- [ ] **Step 6: CI job.** Add `bundle` to `.github/workflows/ci.yml`, with matrix `windows-latest` / `macos-latest`. Steps:
  1. checkout;
  2. the Rust toolchain;
  3. the `uv` setup used by the python job;
  4. the `bun` setup used by the rust job;
  5. `bun install` and `bun run build` in `crates/app/ui`;
  6. `python scripts/prepare_bundle.py`;
  7. in `crates/app`: `bunx @tauri-apps/cli@2 build --config tauri.bundle.conf.json --bundles ${{ matrix.os == 'windows-latest' && 'nsis' || 'app' }}`;
  8. `python scripts/check_bundle.py target`.

  Also:
  - No signing and no uploads.
  - Cache cargo like the rust job.
  - The Tauri CLI's `beforeBuildCommand` (`bun run build`) runs from `crates/app`; confirm it resolves `ui/`, as `tauri.conf.json` already expects.
- [ ] **Step 7: Verify locally on Windows.**
  1. Run `python scripts/prepare_bundle.py`.
  2. In `crates/app`, run `cargo tauri build --config tauri.bundle.conf.json --bundles nsis`. The local tauri-cli 2.11 is fine.
  3. Run `python scripts/check_bundle.py target`.
  4. Restore `crates/app/Cargo.toml` if the build rewrote its line endings.

  Then run `cargo fmt/clippy/test`. Push the branch and open the draft PR if it isn't open, so the new CI job runs on macOS. Fix what it reports.
- [ ] **Step 8: Commit** `feat(app): Connect/Settings commands, bundled sidecar and wheel, bundle CI job`.

---

### Task 4: UI data layer and the preview's model

**UI task: load and follow the frontend-design skill before writing code.**

**Files:**
- Modify:
  - `crates/app/ui/src/api/tools.gen.ts` (via `bun run gen`)
  - `src/api/queries.ts`
  - `src/lib/status.ts`
  - `src/mock/{handlers,model,fixtures,views,store}.ts` (whichever hold scenarios and app handlers)
  - `crates/app/ui/README.md` (scenario table)

**Interfaces:**
- Consumes: the generated types `ClaudeDesktopStatus`, `ClaudeDesktopPlan`, `ClaudeDesktopApplied`, `SettingsOverview`, `PipInstallResult` and `ActivityList`.
- Produces:
  - Hooks:
    - `useClaudeDesktopStatus()`, refetching on window focus, since the file lives outside the data folder;
    - `useSettingsOverview()`;
    - `useActivity()`, which is `callApp("activity", {limit: 200})`;
    - `usePipInstall()`, a mutation. On settle it invalidates `settings_overview` and `home_summary`.
  - `RELOAD` additions:
    - `activity` → also `activity` (the full list);
    - `catalog` and `preferences` → also `settings_overview`.
  - `STATUS` keys:
    - `claudeSetUp` (`Plug`, "set up", neutral)
    - `claudeNotSetUp` (`Unplug`, "not set up", muted)
    - `claudeNotFound` (`Unplug`, "Claude Desktop not found", muted)
    - `claudeOutdated` (`TriangleAlert`, "points elsewhere", warning)
    - `claudeInvalid` (`TriangleAlert`, "can't read the config", warning)

    Plus `claudeStateKey(state)`.
  - The mock implements `claude_desktop_status`, `claude_desktop_plan`, `claude_desktop_apply`, `settings_overview` and `pip_install`.

- [ ] **Step 1:** `bun run gen` and `bun run gen:check`.
- [ ] **Step 2: Hooks, the RELOAD map, and the STATUS keys** as above.
- [ ] **Step 3: The mock.** An in-memory Claude Desktop config per scenario:

  | Scenario | Claude Desktop | Other entries |
  |---|---|---|
  | `problems` | `outdated` (`"command": "hedgebuddy"`) | `filesystem` |
  | `healthy` | `set_up` | — |
  | `empty` | `no_claude` | — |
  | `macos` | `not_set_up`, with the macOS path | — |
  | `error` | every read fails | — |
  | `busy` | apply is a write and can be busy | — |

  - Paths look real: `C:\Users\operator\AppData\Roaming\Claude\claude_desktop_config.json`, and the bundled binary `C:\Users\operator\AppData\Local\Programs\HedgeBuddy\hedgebuddy.exe` (macOS: `/Applications/HedgeBuddy.app/Contents/MacOS/hedgebuddy`).
  - `apply` records a backup name and flips to `set_up`.
  - `settings_overview` mirrors Home's Python fixtures:
    - `problems`: 0.10.0 installed, needs 0.11.0;
    - `healthy`: 0.11.0;
    - `nopackage`: installed null;
    - `empty`: Python not found.

    The wheel is present except in `macos`, where it is null, to show the disabled Install. `catalog_overrides` is `["offshoot"]` in `problems`, else `[]`.
  - `pip_install` returns a realistic pip transcript. In `problems` it succeeds and then Home and Settings show 0.11.0. Add `?pipfail=1` to force a failure with a PEP 668-style stderr.
  - Add the scenarios `unactivated` (profiles exist, none active) and `nopackage`.
  - Update the scenario table in `crates/app/ui/README.md`.
- [ ] **Step 4: Verify.** `bun run build` and `gen:check` pass. In the pane, `callApp` for each new command returns the scenario's data. Check with the console via `import('/src/api/bridge.ts')`.
- [ ] **Step 5: Commit** `feat(ui): data layer and preview model for Connect and Settings`.

---

### Task 5: Connect screen

**UI task: load and follow the frontend-design skill before writing code; the Design direction sections bind it.** Spec §6.6 is binding. The mockup's Connect half is a reference; there is no teal.

**Files:**
- Create: `crates/app/ui/src/screens/connect/{connect-screen,claude-desktop-panel,clients-panel,activity-panel}.tsx`, `src/components/app/command-well.tsx`
- Modify: `src/App.tsx` (route `/connect` → `ConnectScreen`)

- [ ] **Step 1: `CommandWell({ label, text, copyText? })`.** The well, a Copy button (`copy` icon plus word, 28 px), "Copied" for 1.5 s, and a toast "Copied". A clipboard failure calls `showError`. The text wraps at spaces and separators via `wrapPath`-style `<wbr>`.
- [ ] **Step 2: The Claude Desktop panel.**
  - A status line from `STATUS` via `claudeStateKey`, then one sentence:
    - set_up: "HedgeBuddy is set up in Claude Desktop."
    - not_set_up: "Claude Desktop doesn't know about HedgeBuddy yet."
    - no_claude: "Claude Desktop's settings folder wasn't found. Set up anyway, then open Claude Desktop."
    - outdated: "Claude Desktop runs a different hedgebuddy: <current.command in mono>."
    - invalid: "<problem>. Fix or remove the file, then check again."
  - Readouts:
    - CONFIG: the path in mono, as text only (it is outside `reveal_path`'s allow-list, so there is no Show in folder);
    - OTHER SERVERS: the names in mono, or "none";
    - COMMAND: `expected.command` in mono.
  - Actions, on the right:
    - "Set up…" (primary) for `not_set_up`/`no_claude`;
    - "Update…" (primary) for `outdated`;
    - nothing for `set_up`, except a quiet "Check again" text button that refetches;
    - disabled with visible muted text "This build has no bundled hedgebuddy command." when `binary` is null;
    - no action for `invalid`, only "Check again".
  - The ChangePreviewDialog:
    - plan `claude_desktop_plan`;
    - summary "Add HedgeBuddy to Claude Desktop." (or "Point Claude Desktop at this HedgeBuddy.");
    - ledger rows:
      - a `file-pen` row for the config path, detail "set mcpServers.hedgebuddy";
      - a `copy` row for the backup path, detail "backup of the current file", when present;
      - a `folder-plus` row when `creates_file`;
    - a neutral warning line listing `other_servers` ("Keeps <names>.") when there are any;
    - `nothingToDo` when `unchanged`;
    - Apply "Set up" or "Update".
  - On success:
    - `invalidate` the status;
    - a toast "Set up. Restart Claude Desktop to use it.";
    - a persistent muted line in the panel, "Restart Claude Desktop to pick up the change.", until the next status refetch shows `set_up`. Keep it for the session.
- [ ] **Step 3: The clients panel.**
  - CLAUDE CODE: `CommandWell` with `claude_code_command`.
  - OTHER MCP CLIENTS:
    - A readout: command `<binary> mcp` (mono), transport "stdio".
    - A `CommandWell` "JSON config" with `client_json`, labelled "Copy JSON".
  - Without a binary, a muted note: "Uses hedgebuddy from PATH. Install the app build that bundles it, or add it to PATH."
- [ ] **Step 4: The activity panel.**
  - `useActivity()`: the last 200, newest first, grouped by day (reuse Runs' day-heading helper if one exists; otherwise make a small `dayLabel` in `lib/format`).
  - Rows as the Design direction says.
  - The micro-label reads "RECENT CLAUDE ACTIVITY · tool names only, never values".
  - Live update via the `activity` category.
  - Empty: `EmptyState` (`message-square`) "No Claude activity yet" / "Set up Claude Desktop or Claude Code above, then ask Claude to do something."
  - Error: `ErrorPanel` with Retry.
  - Loading: skeleton rows.
- [ ] **Step 5: Layout and states.** Sections in the order Claude Desktop, Claude Code, Other clients, Activity. Each panel has its own loading, error and empty states. The whole page scrolls. Nothing overflows horizontally at 480.
- [ ] **Step 6: Verify, including visually.**
  - `bun run build` and `gen:check` pass.
  - In the browser pane at 960×640 and 480×640 (measure `innerWidth`):
    - `problems`: `outdated` → Update… → the preview shows the backup and the kept `filesystem` → Apply → set_up and the restart line;
    - `healthy`: set_up with no primary action;
    - `empty`: no_claude with Set up… and the empty activity state;
    - `macos`: the macOS paths;
    - `error`: ErrorPanels;
    - `busy`: Apply shows the busy toast and Try again works.
  - Copy buttons toast "Copied".
  - The activity list groups by day and shows the outcome icons (failed in red).
  - Keyboard: every control is reachable, and the focus ring is visible.
- [ ] **Step 7: Commit** `feat(ui): Connect screen: Claude Desktop setup, client commands, activity`.

---

### Task 6: Settings screen

**UI task: load and follow the frontend-design skill before writing code; the Design direction sections bind it.** Spec §6.7 is binding. The mockup's Settings half is a reference; the Updates section is out of scope (phase 6).

**Files:**
- Create: `crates/app/ui/src/screens/settings/{settings-screen,python-panel,data-folder-panel,editor-panel}.tsx`
- Modify: `src/App.tsx` (route `/settings` → `SettingsScreen`); delete `src/screens/placeholder.tsx` if nothing routes to it any more, and remove its imports

- [ ] **Step 1: The Python panel.**
  - Readouts:
    - INTERPRETER: the executable in mono, with the launcher and version muted, e.g. `(py -3, 3.13.5)`.
    - HEDGEBUDDY PACKAGE: "<installed> installed" or "not installed", then "needs <required>". Versions in mono and tabular figures. Amber `package` icon plus word when `python.problem` is set, neutral `circle-check` "up to date" otherwise.
    - BUNDLED PACKAGE: the wheel file name in mono, or "none in this build".
  - Action:
    - "Install hedgebuddy <wheel_version>" (primary), when the package isn't up to date, a wheel exists and Python is found.
    - Disabled, with a visible muted reason, when there is no wheel ("This build has no bundled package. Run: <python.problem's command>" as a `CommandWell`) or no Python ("Install Python 3 first").
    - Up to date: a quiet "Reinstall" text button (same action).
  - Running:
    - The button shows "Installing…" and is disabled. The rest of the page stays usable.
    - On the result, the outcome line and the output well appear (Design direction), and the overview and Home refetch.
    - A second click while running can't happen (disabled); the Rust mutex backs this up.
    - Busy can't happen (no data lock). A spawn error calls `showError`.
- [ ] **Step 2: The data folder panel.**
  - FOLDER: the path in mono, with a "Show in folder" text button (`folder-open`; `reveal_path` with `data_dir`).
  - CATALOG OVERRIDES:
    - "none", or the app names (via `appName`) with their ids in mono ("OffShoot (`offshoot.toml`)");
    - plus `catalog_error` as an amber line with `triangle-alert` when set, with the sentence "HedgeBuddy uses its built-in catalog until this is fixed."
- [ ] **Step 3: The editor panel.**
  - An EDITOR COMMAND field (mono, placeholder "Notepad" on Windows, "TextEdit" on macOS, from `settings_overview.os`).
  - The help line: "Leave empty to open scripts in <default>. Use {file} where the script path goes; quote words with spaces ("C:\Program Files\…"), and use single quotes for a word that ends in a backslash."
  - Save:
    - disabled until the value changes;
    - calls `preferences_set({editor_command: value.trim() || null})`;
    - an error from Rust shows under the field in `text-destructive`;
    - busy → toast with Try again;
    - on success, the toast "Saved editor command" and `clearBusyToast()`.
  - The unsaved guard: `useUnsaved("settings-editor", dirty)`.
- [ ] **Step 4: Layout and states.**
  - The order is Python, Data folder, Editor command.
  - Loading: skeletons. Error: `ErrorPanel` with Retry.
  - The sidebar's Settings badge (5A) keeps working; it's driven by `home_summary`.
- [ ] **Step 5: Verify, including visually.**
  - `bun run build` passes.
  - Browser pane at 960×640 and 480×640:
    - `problems`: 0.10.0 → Install → the output well → 0.11.0 → the sidebar badge clears;
    - `?pipfail=1`: the red outcome line and pip's message;
    - `macos`: the disabled Install with the command well;
    - `empty`: Install Python 3 first;
    - `nopackage`: "not installed";
    - the editor command: invalid (an unterminated quote) → the reason under the field; valid → Saved;
    - a dirty field followed by navigating away asks first;
    - catalog overrides show OffShoot in `problems`;
    - Show in folder calls `reveal_path` (the mock logs it).
  - Nothing overflows at 480.
- [ ] **Step 6: Commit** `feat(ui): Settings screen: Python and bundled install, data folder, editor command`.

---

### Task 7: Parked fixes and docs

**UI task for Steps 1–2: load and follow the frontend-design skill.**

**Files:**
- Modify:
  - `crates/app/ui/src/screens/{variables,scripts}/*` (focus after deleting the last item)
  - `src/screens/home/first-run.tsx` (the chooser wraps)
  - `docs/smoke-checklist.md`, `CHANGELOG.md`, `README.md`, `crates/app/ui/README.md`

- [ ] **Step 1: Focus after deleting the last item.** When the list becomes empty after a delete, the delete dialog's `returnFocus` finds no listbox. In that case, move focus to `#screen-heading`, after the list re-renders empty (as a fallback inside `returnFocus`, or a follow-up effect). Verify in the mock by deleting every variable in a profile.
- [ ] **Step 2: Home's chooser at 480.** "Choose a profile" buttons with a 64-character name wrap (`break-all` on the mono name, `min-w-0`) instead of overflowing. Verify in the `unactivated` scenario.
- [ ] **Step 3: Docs.**
  - `README.md` "Use it from Claude (MCP)": lead with "Open HedgeBuddy → Connect → Set up" for Claude Desktop and the Copy commands. Keep the manual steps for CLI-only installs.
  - `CHANGELOG.md` Unreleased, full sentences:
    - the Connect screen (Claude Desktop setup with preview and backups, the client commands, activity);
    - the Settings screen (Python and bundled install, data folder and overrides, editor command);
    - the bundled binary and wheel;
    - the activity target cap;
    - the startup error dialog.
  - `docs/smoke-checklist.md`:
    - Retitle to include 5C.
    - Add "9. Desktop app connect and settings (phase 5C)", run on Windows and macOS, with the note that it changes Claude Desktop's config and the Python environment and needs the go-ahead. Items (with `Result:`):
      - Connect shows the right config path (MSIX or not).
      - Set up previews, writes a backup, and keeps other servers; after restarting Claude Desktop, HedgeBuddy's tools appear.
      - Update from a README-style manual entry.
      - An invalid config is refused and untouched.
      - The Claude Code command works as copied.
      - The JSON config works in another client.
      - The activity list updates while Claude works.
      - Install hedgebuddy from the bundled wheel with the network off; Home and Settings show 0.11.0.
      - Reveal the data folder.
      - Catalog overrides are listed.
      - The editor command is used by Open in editor; an invalid command is refused.
      - The installed app has `hedgebuddy` next to the app binary and the wheel in resources.
  - `crates/app/ui/README.md`: the new scenarios and `?pipfail=1`.
- [ ] **Step 4: Verify.** `bun run build` passes; the docs read correctly.
- [ ] **Step 5: Commit** `docs: connect and settings smoke steps, changelog, readmes`, together with the Step 1–2 code, as `fix(ui): focus after deleting the last item; chooser wraps` (two commits).

---

## Self-review

**Spec coverage:**
- §4.3 `claude_desktop_status/plan/apply` → Task 1; `pip_install` → Task 2; wrappers → Task 3.
- §6.6:
  - status, Set up/Update with preview and backup, restart note, bundled binary → Tasks 1, 5;
  - Claude Code command with Copy, and other clients' command, transport and Copy JSON → Tasks 1 (strings), 5;
  - activity of 200 with outcome icons → Task 5, using 5A's `activity`.
- §6.7:
  - interpreter and version, installed against required, Install with the bundled wheel showing pip's output, offline → Tasks 2, 6;
  - the data folder with Reveal and the catalog overrides → Tasks 2, 6;
  - the editor command → Tasks 2, 6.
- §7: the change preview (Task 5), errors and busy (every UI task), empty states (activity, overrides), keyboard.
- §8: the sidecar via `externalBin` and the wheel as a resource, with Connect and Settings using the installed paths → Task 3; the app never starts the MCP server (no shell plugin).
- §9:
  - the Claude Desktop merge keeps other servers and writes a backup → Task 1 tests;
  - the smoke steps for Claude Desktop setup and pip → Task 7.
- §10: merge only `mcpServers.hedgebuddy`, back up first → Task 1.
- §11: no update check (phase 6).
- Parked items: editor-command concern (ruling 11), startup message, activity cap, last-item focus, chooser overflow, mock scenarios → Tasks 1, 3, 4, 7. The rest are named in ruling 14.

**Placeholders:** None. Where the bundle's on-disk layout can only be confirmed by a real build (Task 3 Step 5), the step names the expected paths and requires recording the confirmed ones.

**Type consistency:**
- `Bundle` (Task 1) → `settings.rs` re-export (Task 2) → Tauri resolver (Task 3).
- `ClaudeDesktopStatus/Plan/Applied`, `SettingsOverview`, `PipInstallResult` → generated TS (Task 4) → screens (Tasks 5, 6).
- `PythonStatus` is reused from `home.rs`.
- The `STATUS` keys (Task 4) are used by Task 5.
