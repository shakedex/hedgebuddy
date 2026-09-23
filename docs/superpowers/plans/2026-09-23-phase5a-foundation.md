# Phase 5A: Desktop App Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first working HedgeBuddy desktop app: a shared tool crate whose 31 tools return typed results with JSON Schemas (and TypeScript generated from them), the new core pieces (cross-process lock, batched watcher, Claude activity log, preferences, three parked fixes), and a Tauri app with the "instrument panel" design system, an adaptive shell, and working Home and Runs screens.

**Architecture:** The tools move from `crates/cli/src/tools/` into a new crate, `hedgebuddy-tools`, used by both the `hedgebuddy` binary (MCP server and `call`) and the Tauri app. Every tool gets a result type that derives `Serialize + JsonSchema`, so the MCP server can advertise `outputSchema` and send `structuredContent`, and a Bun script can generate `tools.gen.ts`. App-only commands (home summary, activity, preferences) are plain functions in `hedgebuddy_tools::app`, tested with `FakeHost`; the Tauri crate only wraps them and the generic `tool` bridge, watches the data folder, and emits `data-changed`. The React UI (shadcn/ui on Radix, Tailwind v4, TanStack Query, wouter hash routes) talks only to a typed bridge, which a mock with fixture data replaces in browser preview mode.

**Tech Stack:** Rust stable (1.98) with `std::fs::File::lock` (stable since 1.89); `schemars` 1, `jsonschema` 0.56 (dev), `rmcp` 3.4, `notify` 8, `jiff` 0.2, Tauri 2.11; Bun 1.4, Vite 8, TypeScript 7, React 19, Tailwind v4 via `@tailwindcss/vite`, shadcn/ui (Radix), `lucide-react`, `@tanstack/react-query` 5, `wouter` 3, `sonner` 2, `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono`.

**Spec:** `docs/superpowers/specs/2026-09-23-phase5-desktop-app-design.md` (binding for phase 5; §1, §2, §3, §4, §5, §6.1, §6.2, §7, §9, §10). Main spec: `docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md` (§4, §5, §8, §10, §13). Mockups: `docs/superpowers/specs/2026-09-23-phase5-mockups/` (`README.md` says which option won; `home.html`, `scripts-runs.html` Runs half, `navigation.html` option A, `icons-status.html` option A, `visual-direction.html` option B). Where a mockup and the spec disagree, the spec wins: no coloured dots, no teal numbers, colour only for problems.

## Global Constraints

- **Platforms.** macOS 26.0 or newer (`bundle.macOS.minimumSystemVersion` `"26.0"`), Windows 10 or newer with WebView2. Vite build target `safari26` (or the newest Safari the bundler recognises) on macOS and `chrome120` on Windows.
- **Crates.** `hedgebuddy-core` (all logic and storage), `hedgebuddy-tools` (new, `crates/tools`: the 31 tools, MCP resources, `author_script`, and the app-only command logic), `hedgebuddy-cli` (the `hedgebuddy` binary: `mcp.rs`, `env`, `tools`, `call`, and appending the Claude activity log), `hedgebuddy-app` (Tauri: the generic `tool` bridge plus app-only commands).
- **Typed results.** Every tool has a parameter type (`Deserialize + JsonSchema`) and a result type (`Serialize + JsonSchema`). `ToolDef` gains `output_schema: fn() -> Value`. The JSON a tool returns keeps its current shape: existing tool tests must pass unchanged.
- **MCP.** `tools/list` carries each tool's `outputSchema`; a successful call returns `structuredContent` plus the same pretty JSON text as today. Errors stay text-only with `isError: true`.
- **Schemas command.** `hedgebuddy tools --schemas` prints `{tool: {input, output}}` for all tools. `crates/app/ui/scripts/gen-tools.ts` turns it into `crates/app/ui/src/api/tools.gen.ts`; CI regenerates it and fails when it differs.
- **Cross-process lock.** Every tool that is not read-only, and every app command that writes, takes an exclusive lock on `<data>/.hedgebuddy.lock` (std `File::lock` family) in addition to the in-process mutex. A caller retries for up to 10 seconds, then fails with exactly `another HedgeBuddy is busy; try again`. Python scripts are unaffected.
- **Batched changes.** Changes arriving within 200 ms become one batch. Categories: `index`, `profile:<name>`, `scripts:<name>`, `runs`, `catalog`, `activity`, `preferences`. The app emits the Tauri event `data-changed` carrying them.
- **Claude activity log.** The MCP server appends one line per tool call to `<data>/activity.jsonl` as `{"ts", "tool", "target", "outcome"}`. `outcome` is `ok`, `error` or `needs_confirmation` (a `run_app_command` that returned `requires_confirmation`). `target` is the value of the first present argument among `name`, `script`, `run_id`, `event`, `app`, `profile`, else `null`. Argument values, script source and error text are never written. Past 250 lines the file is rewritten to the last 200 under the cross-process lock. Schema: `schema/activity-record.schema.json`. App calls and `hedgebuddy call` are not logged.
- **Preferences.** `<data>/preferences.json` is `{"version": 1, "last_opened": ts | null, "editor_command": string | null}`; a missing file reads as the defaults. At startup the app keeps the stored `last_opened` for the session's "since you last opened" figures, then stores the current time. Schema: `schema/preferences.schema.json`.
- **Parked fixes.** `list_runs` decodes run files lossily (one bad byte skips a line, not a day); `write_atomic` retries its rename for up to one second on Windows `PermissionDenied`; `check_requirements` counts a secret declared without a stored value as unmet.
- **App commands (5A).** `tool(name, args)`, `home_summary()`, `activity(limit)`, `preferences_get()`, `preferences_set(patch)`. The Python package check inside `home_summary` is cached for 60 seconds. App commands are never MCP tools.
- **Secrets stay masked.** No new code path returns a secret value. License commands (`activate`, `deactivate`, `update`) are never exposed.
- **Tests never touch the real machine.** Use `FakeHost` and temporary folders. Never write the real registry or real Hedge settings.
- **Frontend stack.** React 19, TypeScript 7, Vite 8; shadcn/ui on Radix; Tailwind v4 through `@tailwindcss/vite`; `lucide-react`; TanStack Query wraps every tool and app command; `wouter` hash routes (`#/`, `#/runs`, `#/runs/:runId`, `#/variables`, `#/variables/:name`, `#/scripts`, `#/scripts/:name`, `#/apps`, `#/apps/:id`, `#/connect`, `#/settings`). No React unit tests.
- **Layout.** shadcn `Sidebar` with `collapsible="icon"`, collapsing to the icon rail below a window width of 720 px, labels in tooltips on hover. A list-and-detail screen narrower than 640 px shows the list, and the detail slides over it with a back button. Window 960×640 by default, minimum 480×400.
- **Fonts.** Inter for text, JetBrains Mono for names, paths and code, bundled as local files.
- **CSP.** Scripts, styles and fonts from the app bundle only; no remote origins.
- **Dark only.** No light theme.
- **CI.** `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `cd python && uv run pytest -q`, `python scripts/sync_version.py --check`, and the UI builds with Bun from `crates/app/ui` (type-check against the generated types, fail when they are stale). Windows and macOS.
- **Docs style.** Every `pub` item has a `///` doc comment; tool parameter and result fields that clients read get a `///` line (schemars turns it into the schema description).
- **Git.** Branch `feat/phase5a-foundation`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Shell commands are Git Bash on Windows; the repo root is `E:/Coding/hedgebuddy`.

## Design direction (frontend-design, binding for every UI task)

The frontend-design skill shaped these rules. Every UI implementer loads and follows frontend-design before writing code, and every UI review judges against it together with the spec and mockups. Where frontend-design's general advice conflicts with the approved spec, the spec wins (see the ruling on Inter below).

**Concept: "instrument panel".** A calm, precise, machined console. The operator glances at it beside OffShoot and reads the state in one second. Status comes first; everything that is fine recedes to neutral grey; only problems get colour. The memorable thing is the readout: big tabular numerals over small uppercase labels, hairline rules, and surfaces that look milled rather than drawn.

**Colour discipline.**
- Tokens are exactly spec §5.1 (see Task 12). Nothing else gets a hue.
- Red (`destructive`) only for failed; amber (`warning`) only for needs-a-look. Fine is neutral: `muted-foreground` icons, `foreground` text.
- `primary` (#2a7cf7) only for actions, the current selection, the active-nav indicator, and focus rings. `link` (#8fb6ff) only for links.
- The brand gradient (#3dd6c6 → #2a7cf7) appears only in the logo mark.
- Atmosphere without hue: the main area has one faint ambient glow (primary at ≤ 6 % alpha, radial, top right) over `background`; panels carry a 1 px inset top highlight (`rgba(255,255,255,0.03)`) and a hairline border. No drop shadows on panels. No gradients on buttons.

**Typography.**
- Inter Variable for text with `font-feature-settings: "cv05", "cv08"` (tailed l, serifed I: names stay unambiguous). JetBrains Mono Variable for file names, variable names, paths, tool names, log lines and tracebacks.
- Sizes (Tailwind scale overridden so shadcn inherits it): `text-xs` 11.5 px (micro labels, meta), `text-sm` 12.5 px (lists, controls), `text-base` 13 px (body, detail text), `text-lg` 15 px (screen titles), `text-stat` 22 px (Home numbers). Mono uses the same steps from 11.5 to 13 px (the spec allows 10.5 to 13).
- Micro labels: uppercase, `tracking-[0.08em]`, `text-xs`, `muted-foreground`.
- Numbers that change (counts, times, durations, exit codes) use tabular figures (`tabular-nums`). Home numbers are 22 px, semibold, `foreground-strong`, `tracking-tight`, with `"ss01"` open digits.

**Space and shape.** 4 px grid only. Radius 6 px for controls, 8 px for panels. Dense but breathable: list rows 32–44 px tall, panel padding 12 px, screen gutters 16 px (12 px under 640 px).

**Icons.** Lucide only, `strokeWidth={1.75}`, 16 px in navigation, 14 px inline. Every status is icon plus word (spec §5.2 table, Task 12's `STATUS` map is the single source). Icon-only buttons carry `aria-label` and a tooltip. No coloured dots anywhere; the sidebar shows count badges.

**Motion.** One orchestrated moment per screen: content rises 3 px and fades in over 180 ms on route change, Home panels stagger by 40 ms. In a narrow list-and-detail screen the detail slides in from the right over 200 ms. Hover and press states are 120 ms colour changes. Everything honours `prefers-reduced-motion`.

**States.** Every data view has four designed states: loading (quiet skeletons in `card`/`accent`, no spinners on first paint), empty (icon tile, one title line, one sentence that names the next step, optional action), error (inline panel with the message and Retry), and busy (toast "Another HedgeBuddy is busy" with Try again).

**Accessibility.** Focus-visible ring 2 px `primary` with 2 px offset on every interactive element; lists are keyboard navigable with arrow keys; text contrast at least 4.5:1 (`muted-foreground` on `background` passes); hit targets at least 28 px.

**Avoid.** Default-looking shadcn (restyle to tokens), generic card grids with shadows, coloured status dots, emoji, purple, centred page layouts, oversized paddings, spinners as the only loading state, "Lorem ipsum", and any copy that is not plain short sentences.

**Visual checks.** Each UI task and review runs the browser preview (`bun run dev:mock`, port 5199, launch config `ui-mock`) and checks the changed screens at about 960×640 and 480×640 in the built-in browser pane, in the `problems`, `healthy` and `empty` scenarios (`http://localhost:5199/?scenario=problems#/`), and `error` where the screen loads data.

## Rulings made while planning

Each is recorded in the SDD ledger before Task 1.

1. The app-only command logic and its types live in `hedgebuddy_tools::app` (never registered as tools). Why: it stays testable with `FakeHost` without building Tauri, and its schemas reach TypeScript without the Tauri crate. Cost if wrong: the crate table in spec §4.1 says the app crate holds app-only commands; moving the logic later is mechanical.
2. App-command schemas come from `cargo run -p hedgebuddy-tools --example app_schemas`; tool and app types are generated into the one file `tools.gen.ts` so shared definitions are emitted once. Why: the spec fixes the shape of `hedgebuddy tools --schemas` and the generated file name. Cost if wrong: a second generated file later.
3. The TypeScript generator is a small custom JSON-Schema-to-TS converter in `gen-tools.ts`, not `json-schema-to-typescript`. Why: it must merge `$defs` across 35 root schemas into one namespace and fail on name clashes. Cost if wrong: about 200 lines to maintain.
4. Every Tauri app command takes exactly one argument named `args`. Why: one uniform bridge and generator. Cost if wrong: none visible to users.
5. `attached_to`, the `check_script` chain and environment assembly stay in `hedgebuddy-tools` instead of moving into core (memory's parked item). Why: the app now calls the same tools crate, which removes the reason to move them. Cost if wrong: a later move.
6. Activity appends are lock-free single `write_all` calls on a file opened for append; only trimming takes the cross-process lock, waiting at most 1 second and skipping the trim when busy. Why: a long `run_app_command` in another process must not lose Claude's activity lines. Cost if wrong: in a rare race one activity line is lost; the tolerant reader skips a torn line.
7. `ToolError` stays `ToolError(pub String)`; busy is detected by `ToolError::is_busy()` comparing with `BUSY_MESSAGE`. Why: minimal churn in 31 tools' tests. Cost if wrong: a string compare instead of a kind field.
8. Output schemas whose root has no `type` (untagged unions) get `"type": "object"` inserted at the root. Why: older MCP clients assume object output schemas; every variant is an object. Cost if wrong: none.
9. Home counts, the failed-run attention items, the Runs badge and recent runs cover all profiles; each row names its profile when it is not the active one. Why: a failure is a failure, and runs record the profile that was active then. Cost if wrong: a filter.
10. On first launch (`last_opened` is null) the "since" window is the whole run retention (30 days) and Home labels the count "Runs, last 30 days". Cost if wrong: a label.
11. The Python package problem shows whenever the Python the Hedge apps use lacks `hedgebuddy` at the app's version, or Python is missing, whether or not scripts import it yet. Why: installing it is a setup step. Cost if wrong: one attention row too many for script-less users.
12. Failed-run attention items list up to 3 runs, then one "N more failed runs" row linking to `#/runs`. Cost if wrong: a number.
13. The screens that arrive in 5B and 5C render a designed placeholder in 5A. Profile creation (dialog) and switching (toolbar) ship in 5A because Home's first-run steps need them.
14. The CSP allows `'unsafe-inline'` for styles only, with `dangerousDisableAssetCspModification: ["style-src"]`, because Radix and Sonner set inline styles at run time and a hash in `style-src` would disable `'unsafe-inline'`. Scripts stay `'self'` only; no remote origins anywhere. Cost if wrong: a small style-injection surface with no script execution.
15. shadcn's sidebar never switches to its mobile sheet: the provider is controlled by `(min-width: 720px)`, the sheet branch, cookie persistence and the Ctrl+B shortcut are removed. Why: spec §4.5 wants the icon rail below 720 px, not an off-canvas drawer.
16. frontend-design advises against Inter; spec §2.10 requires Inter and JetBrains Mono. The spec wins; character comes from Inter's alternates, tabular figures and the readout typography.
17. The activity outcome icon for `needs_confirmation` is Lucide `circle-pause` (neutral), `error` is `circle-x` (destructive), `ok` is `circle-check` (neutral). The spec names no icon for it.
18. `.claude/launch.json` is committed so every session can open the mock preview with `preview_start`.
19. The watcher failing to start is logged to stderr and the app runs without live refresh (focus refetch still works). Cost if wrong: stale screens until focus.
20. A design-system gallery route `#/_design` exists only in mock mode, for visual review of tokens and components.
21. `activity_target` takes the first of the six keys whose value is a non-empty string; a non-string value counts as absent. Why: never serialise arbitrary argument JSON.
22. The sidebar rail's count badge uses 10.5 px tabular numerals (below the 11.5 px text floor) because it is a numeral overlay, not text.

## File structure

| File | Responsibility |
|---|---|
| `Cargo.toml` | + `crates/tools` member, `hedgebuddy-tools` workspace dependency |
| `crates/core/Cargo.toml` | + `schemars = "1"` |
| `crates/core/src/lock.rs` (new) | `DataLock`, `Store::lock`, `Store::lock_within`, `LOCK_TIMEOUT`, `BUSY_MESSAGE` |
| `crates/core/src/clock.rs` (new) | `now_rfc3339()` (UTC, milliseconds) |
| `crates/core/src/activity.rs` (new) | `ActivityRecord`, `ActivityOutcome`, `activity_target`, `Store::{append_activity, read_activity}` |
| `crates/core/src/preferences.rs` (new) | `Preferences`, `PreferencesPatch`, `Store::{preferences, update_preferences}` |
| `crates/core/src/watch.rs` | + `watch_batched`, `batch_changes`, `Category`, `categorize`, `categories`, `BATCH_WINDOW` |
| `crates/core/src/error.rs` | + `CoreError::Busy` |
| `crates/core/src/fs_util.rs` | rename retry on Windows `PermissionDenied` |
| `crates/core/src/runs.rs` | lossy decoding of run files |
| `crates/core/src/manifest.rs`, `scripts.rs`, `hedge/sync.rs` | `check_requirements` takes the stored secrets |
| `crates/core/src/*` (result types) | `#[derive(JsonSchema)]` on every type a tool returns |
| `schema/activity-record.schema.json`, `schema/preferences.schema.json` (new) | storage contract for the two new files |
| `crates/tools/` (new crate) | `lib.rs` (was `crates/cli/src/tools/mod.rs`), the six tool groups, `resources.rs`, `app/` (app-only logic), `examples/app_schemas.rs` |
| `crates/cli/src/lib.rs`, `mcp.rs`, `main.rs` | thin: MCP adapter with `outputSchema`/`structuredContent`, activity logging, `tools --schemas` |
| `crates/app/src/{lib,state,commands,watcher}.rs` | Tauri state, commands, watcher thread |
| `crates/app/tauri.conf.json`, `capabilities/default.json` | CSP, macOS floor, window |
| `crates/app/ui/scripts/gen-tools.ts` (new) | JSON Schema → `src/api/tools.gen.ts` |
| `crates/app/ui/src/api/*` | bridge, generated types, queries, `data-changed` events |
| `crates/app/ui/src/mock/*` | browser preview bridge and fixture scenarios |
| `crates/app/ui/src/styles/globals.css` | Tailwind v4, tokens, fonts, base styles, motion |
| `crates/app/ui/src/components/ui/*` | shadcn components restyled to tokens |
| `crates/app/ui/src/components/app/*` | shell, sidebar, status, panels, list-detail, states |
| `crates/app/ui/src/screens/{home,runs,placeholder,design}/*` | screens |
| `.github/workflows/ci.yml` | generated-types check |
| `.claude/launch.json` (new) | `ui-mock` preview server |
| `docs/smoke-checklist.md`, `CHANGELOG.md`, `schema/README.md`, `crates/app/ui/README.md` | docs |

---

### Task 1: Move the tool layer into `hedgebuddy-tools`

A pure move: no behaviour change. Afterwards the CLI depends on the new crate and every existing test passes unchanged.

**Files:**
- Create: `crates/tools/Cargo.toml`
- Move: `crates/cli/src/tools/mod.rs` → `crates/tools/src/lib.rs`; `crates/cli/src/tools/{apps,attachments,profiles,scripts,system,variables}.rs` → `crates/tools/src/`; `crates/cli/src/resources.rs` → `crates/tools/src/resources.rs`
- Modify: `Cargo.toml`, `crates/cli/Cargo.toml`, `crates/cli/src/lib.rs`, `crates/cli/src/mcp.rs`, `crates/cli/src/main.rs`, `crates/cli/tests/mcp_contract.rs`

**Interfaces:**
- Produces: crate `hedgebuddy_tools` with the same public items the old module had: `Context`, `ToolError`, `ToolResult`, `Hints`, `READ`, `WRITE`, `DESTRUCTIVE`, `ToolDef`, `parse_args`, `schema_of`, `to_json`, `NoParams`, `all()`, `call()`, and `pub mod resources` (`list`, `read`, `author_script`, `ResourceInfo`). Test helper `test_ctx` stays `#[cfg(test)] pub(crate)`.
- The CLI uses `hedgebuddy_tools::{self as tools, resources, Context}`.

- [ ] **Step 1: Create the crate manifest and register it in the workspace**

`crates/tools/Cargo.toml`:

```toml
[package]
name = "hedgebuddy-tools"
version.workspace = true
edition.workspace = true
license.workspace = true
repository.workspace = true
description = "HedgeBuddy's tools, MCP resources and prompt, shared by the CLI and the desktop app"

[dependencies]
hedgebuddy-core = { workspace = true }
schemars = "1"
serde = { workspace = true }
serde_json = { workspace = true }

[dev-dependencies]
jiff = "0.2"
tempfile = "3"
```

Root `Cargo.toml`: `members = ["crates/core", "crates/tools", "crates/cli", "crates/app"]`, and under `[workspace.dependencies]` add `hedgebuddy-tools = { path = "crates/tools" }`.

- [ ] **Step 2: Move the files with git so history follows them**

```bash
cd /e/Coding/hedgebuddy
mkdir -p crates/tools/src
git mv crates/cli/src/tools/mod.rs crates/tools/src/lib.rs
for f in apps attachments profiles scripts system variables; do git mv crates/cli/src/tools/$f.rs crates/tools/src/$f.rs; done
git mv crates/cli/src/resources.rs crates/tools/src/resources.rs
rmdir crates/cli/src/tools
```

- [ ] **Step 3: Rewrite paths inside the moved files**

- In every moved file replace `crate::tools::` with `crate::`, and `use super::{...}` stays as it is (the group modules are now children of the crate root, so `super` is the crate root).
- In `lib.rs`, the `tool!` macro body: `$crate::tools::ToolDef` → `$crate::ToolDef`, `$crate::tools::schema_of` → `$crate::schema_of`, `$crate::tools::parse_args` → `$crate::parse_args`.
- In `lib.rs`, declare `pub mod resources;` next to the group modules, and change the test's `include_str!("../../../../catalog/offshoot.toml")` to `include_str!("../../../catalog/offshoot.toml")`.
- In `resources.rs`: `use crate::tools::{Context, ToolError};` → `use crate::{Context, ToolError};` and `use crate::tools::test_ctx;` → `use crate::test_ctx;`. The `include_str!("../../../schema/...")` paths stay the same (same depth).
- Replace the first doc paragraph of `lib.rs` with:

```rust
//! Every HedgeBuddy tool, defined once, plus the MCP resources and the
//! `author_script` prompt. A tool is a plain function from JSON arguments to
//! a JSON result over a [`Context`]; the MCP server, `hedgebuddy call` and the
//! desktop app all dispatch through [`call`].
```

- [ ] **Step 4: Point the CLI at the new crate**

`crates/cli/Cargo.toml`: add `hedgebuddy-tools = { workspace = true }` to `[dependencies]` and remove `schemars` (nothing in the CLI uses it now).

`crates/cli/src/lib.rs`:

```rust
//! The `hedgebuddy` binary's library: the MCP server over the shared tool
//! layer in `hedgebuddy_tools`. Every tool is defined once there and reached
//! both from `hedgebuddy call` and from MCP clients.

pub mod mcp;
```

`crates/cli/src/mcp.rs`: replace `use crate::resources;` and `use crate::tools::{self, Context};` with `use hedgebuddy_tools::{self as tools, resources, Context};`.

`crates/cli/src/main.rs`: replace `use hedgebuddy_cli::tools::{self, Context};` with `use hedgebuddy_tools::{self as tools, Context};`.

`crates/cli/tests/mcp_contract.rs`: replace `hedgebuddy_cli::tools::all()` with `hedgebuddy_tools::all()` (integration tests can use the package's normal dependencies).

- [ ] **Step 5: Build, test, lint**

Run: `cargo test --workspace 2>&1 | tail -30`
Expected: PASS; the tool tests now run under `hedgebuddy-tools` (for example `test profiles::tests::create_list_get_and_activate ... ok`), and `mcp_contract` still passes.

Run: `cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings`
Expected: no warnings.

- [ ] **Step 6: Commit**

```bash
git add -A Cargo.toml Cargo.lock crates/tools crates/cli
git commit -m "refactor: move the tool layer into the hedgebuddy-tools crate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Typed tool results and output schemas

Every tool returns a typed result whose JSON Schema is published. The JSON each tool returns keeps exactly its current shape, so every existing tool test passes unchanged. In tests, every result produced through `call` is validated against its own output schema.

**Files:**
- Modify: `crates/core/Cargo.toml` (+ `schemars = "1"`), every core module whose types appear in a tool result (derives only)
- Modify: `crates/tools/Cargo.toml` (+ dev-dependency `jsonschema = "0.56"`), `crates/tools/src/lib.rs`, `crates/tools/src/{profiles,variables,scripts,attachments,apps,system}.rs`

**Interfaces:**
- Consumes: Task 1's crate layout.
- Produces:
  - `pub struct ToolDef { pub name: &'static str, pub description: &'static str, pub hints: Hints, pub schema: fn() -> Value, pub output_schema: fn() -> Value, pub run: fn(&Context, Value) -> ToolResult }` — `schema` is the input schema, as before.
  - `tool!($name, $desc, $hints, $params:ty, $output:ty, $f:path)` where `$f: fn(&Context, $params) -> Result<$output, ToolError>`.
  - `pub fn output_schema_of<T: JsonSchema>() -> Value` (inserts `"type": "object"` at the root when absent).
  - `pub fn schemas() -> Value` — `{"<tool>": {"input": <schema>, "output": <schema>}}` for every tool (used by Task 3).
  - Result types, all `#[derive(Debug, Serialize, JsonSchema)]` and `pub`, named in the table in Step 3.
  - `pub(crate) fn attached_to(ctx, profile, script) -> Vec<AppEvent>` (typed; was `Vec<Value>`).
  - Core: `JsonSchema` on every type listed in Step 1.

- [ ] **Step 1: Derive `JsonSchema` on the core types that tools return**

Add `schemars = "1"` to `[dependencies]` in `crates/core/Cargo.toml`. Add `schemars::JsonSchema` to the derive list of each of these types (keep every existing serde attribute; schemars reads them):

| Module | Types |
|---|---|
| `profile.rs` | `Profile` |
| `variable.rs` | `VarType`, `Variable` |
| `manifest.rs` | `Requirement`, `Manifest`, `RequirementIssue` |
| `scripts.rs` | `ScriptInfo`, `ScriptCheck` |
| `runs.rs` | `RunStatus`, `LogLine`, `Run` |
| `host/mod.rs` | `Os`, `RegValue`, `VolumeInfo` |
| `volumes.rs` | `CardGuess`, `VolumeReport` |
| `python_env.rs` | `PythonInfo` |
| `catalog.rs` | `PerOs<T>`, `AppInfo`, `Detect`, `Scripting`, `EventSpec`, `CommandForm`, `CommandSpec`, `Files`, `PresetsSpec`, `AppManifest`, `ParamType`, `ParamSpec`, and any other type nested in `AppManifest` |
| `hedge/apps.rs` | `ScriptingSupport`, `AppStatus`, `ResolvedFiles`, `AppDescription` |
| `hedge/attach.rs` | `Action`, `AttachState`, `EventAttachment` |
| `hedge/commands.rs` | `CommandPlan`, `CommandOutcome` |
| `hedge/presets.rs` | `Preset` |
| `hedge/sync.rs` | `SyncItem`, `AttachPlan`, `SyncConflict`, `SyncSkip`, `SyncReport` |

The compiler names anything missing once Step 3 uses the types. `serde_json::Value` fields need nothing. `PathBuf` is a string schema.

Run: `cargo build -p hedgebuddy-core`
Expected: builds.

- [ ] **Step 2: Write the failing schema tests in `crates/tools/src/lib.rs`**

Add `jsonschema = "0.56"` to `[dev-dependencies]` in `crates/tools/Cargo.toml`. In `lib.rs`'s `mod tests`, add:

```rust
    #[test]
    fn every_tool_has_object_input_and_output_schemas() {
        for t in all() {
            let input = (t.schema)();
            let output = (t.output_schema)();
            assert_eq!(input["type"], "object", "{} input: {input}", t.name);
            assert_eq!(output["type"], "object", "{} output: {output}", t.name);
            jsonschema::validator_for(&output)
                .unwrap_or_else(|e| panic!("{} output schema does not compile: {e}", t.name));
        }
    }

    #[test]
    fn the_output_check_rejects_a_wrong_shape() {
        let def = all().into_iter().find(|t| t.name == "list_profiles").unwrap();
        assert!(output_errors(&def, &json!({"active": null, "profiles": []})).is_empty());
        assert!(!output_errors(&def, &json!({"active": null, "profiles": 3})).is_empty());
    }

    #[test]
    fn schemas_cover_every_tool() {
        let s = schemas();
        let map = s.as_object().unwrap();
        assert_eq!(map.len(), all().len());
        for t in all() {
            assert!(map[t.name]["input"].is_object(), "{}", t.name);
            assert!(map[t.name]["output"].is_object(), "{}", t.name);
        }
    }
```

Run: `cargo test -p hedgebuddy-tools every_tool_has 2>&1 | tail -5`
Expected: FAIL to compile (`output_schema`, `output_errors`, `schemas` do not exist).

- [ ] **Step 3: Add the output schema plumbing to `lib.rs`**

Replace the `tool!` macro and `ToolDef`, and add the helpers:

```rust
/// Build a [`ToolDef`] from a name, description, hints, parameter type,
/// result type, and handler `fn(&Context, Params) -> Result<Output, ToolError>`.
macro_rules! tool {
    ($name:literal, $desc:expr, $hints:expr, $params:ty, $output:ty, $f:path) => {
        $crate::ToolDef {
            name: $name,
            description: $desc,
            hints: $hints,
            schema: || $crate::schema_of::<$params>(),
            output_schema: || $crate::output_schema_of::<$output>(),
            run: |ctx, args| {
                let params: $params = $crate::parse_args(args)?;
                let output: $output = $f(ctx, params)?;
                $crate::to_json(&output)
            },
        }
    };
}
pub(crate) use tool;

/// One tool.
pub struct ToolDef {
    pub name: &'static str,
    pub description: &'static str,
    pub hints: Hints,
    /// JSON Schema of the arguments.
    pub schema: fn() -> Value,
    /// JSON Schema of the result.
    pub output_schema: fn() -> Value,
    pub run: fn(&Context, Value) -> ToolResult,
}

/// The JSON Schema of a result type. A root without `type` (an untagged
/// union, whose variants are all objects) gets `"type": "object"`, which
/// MCP clients expect of an output schema.
pub fn output_schema_of<T: JsonSchema>() -> Value {
    let mut schema = schema_of::<T>();
    if let Some(map) = schema.as_object_mut() {
        map.entry("type").or_insert_with(|| json!("object"));
    }
    schema
}

/// Every tool's input and output schema: `{"<tool>": {"input", "output"}}`.
pub fn schemas() -> Value {
    let map: serde_json::Map<String, Value> = all()
        .into_iter()
        .map(|t| {
            let entry = json!({ "input": (t.schema)(), "output": (t.output_schema)() });
            (t.name.to_owned(), entry)
        })
        .collect();
    Value::Object(map)
}

/// Why `value` does not match `def`'s output schema (empty when it does).
#[cfg(test)]
pub(crate) fn output_errors(def: &ToolDef, value: &Value) -> Vec<String> {
    let schema = (def.output_schema)();
    let validator = jsonschema::validator_for(&schema).expect("output schema compiles");
    validator.iter_errors(value).map(|e| format!("{} at {}", e, e.instance_path())).collect()
}
```

In `call`, validate every successful result when compiled for tests, so each tool test also checks its tool's schema:

```rust
pub fn call(ctx: &Context, name: &str, args: Value) -> ToolResult {
    let def = all()
        .into_iter()
        .find(|t| t.name == name)
        .ok_or_else(|| ToolError::new(format!("unknown tool '{name}'")))?;
    let result = if def.hints.read_only {
        (def.run)(ctx, args)
    } else {
        // A tool that panicked while holding the lock leaves nothing half-held
        // in `()`, so a poisoned lock is still safe to take.
        let _guard = ctx.write_lock.lock().unwrap_or_else(|e| e.into_inner());
        (def.run)(ctx, args)
    };
    #[cfg(test)]
    if let Ok(value) = &result {
        let errors = output_errors(&def, value);
        assert!(errors.is_empty(), "{name} result does not match its output schema: {errors:?}\n{value:#}");
    }
    result
}
```

(`jsonschema` 0.56: check `iter_errors` and `instance_path` against the installed crate; `crates/core/tests/schema_conformance.rs` already uses it.)

- [ ] **Step 4: Give every tool a result type**

Each handler now returns `Result<ItsResult, ToolError>` and builds the struct instead of `json!`. The field names, nesting and null-versus-absent behaviour below reproduce today's JSON exactly. Put each group's result types above its `tools()` function, with a `///` line on each type and field. Update each `tool!` call to pass the result type after the parameter type.

`scripts.rs` (shared types first):

```rust
/// A Hedge app event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct AppEvent {
    /// Catalog app id.
    pub app: String,
    /// Event id.
    pub event: String,
}

/// Result of `list_scripts`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListScriptsResult {
    /// The profile listed.
    pub profile: String,
    /// Its scripts with their manifests.
    pub scripts: Vec<ScriptInfo>,
}

/// Result of `read_script`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ReadScriptResult {
    /// The profile the script belongs to.
    pub profile: String,
    /// Script file name.
    pub name: String,
    /// The full Python source.
    pub source: String,
}

/// Result of `write_script`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct WriteScriptResult {
    /// The profile written to.
    pub profile: String,
    /// Script file name.
    pub name: String,
    /// Whether an existing script was replaced.
    pub replaced: bool,
    /// App events still attached to the replaced script.
    pub attached_to: Vec<AppEvent>,
    /// The parsed manifest, or null when the script has none.
    pub manifest: Option<Manifest>,
    /// Requirements the profile does not meet.
    pub unmet: Vec<RequirementIssue>,
}

/// A script in a profile.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ScriptRef {
    /// Profile name.
    pub profile: String,
    /// Script file name.
    pub name: String,
}

/// Result of `delete_script`.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum DeleteScriptResult {
    /// With `dry_run`: what would be deleted.
    DryRun {
        /// Always true.
        dry_run: bool,
        /// The script that would be deleted.
        would_delete: ScriptRef,
        /// App events attached to it.
        attached_to: Vec<AppEvent>,
    },
    /// The script was deleted.
    Deleted {
        /// Script file name.
        deleted: String,
        /// Profile name.
        profile: String,
        /// App events that still point at the deleted file.
        left_attached: Vec<AppEvent>,
    },
}

/// Result of `check_script`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct CheckScriptResult {
    /// Profile name.
    pub profile: String,
    /// Script file name.
    pub name: String,
    /// The parsed manifest, or null.
    pub manifest: Option<Manifest>,
    /// Requirements the profile does not meet.
    pub unmet: Vec<RequirementIssue>,
    /// Why the manifest's app or event is not in the catalog, if so.
    pub catalog_error: Option<String>,
    /// Whether a Python compile check ran.
    pub syntax_checked: bool,
    /// The interpreter used for the compile check.
    pub python: Option<PathBuf>,
    /// The compile error, if any.
    pub syntax_error: Option<String>,
    /// Why the script's `import hedgebuddy` would fail, if so.
    pub package_problem: Option<String>,
    /// True when nothing above is a problem.
    pub ok: bool,
}
```

`attached_to` returns `Vec<AppEvent>` (push `AppEvent { app: a.app, event: a.event }`).

`profiles.rs`:

```rust
/// Result of `list_profiles`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListProfilesResult {
    /// The active profile, or null when there is none.
    pub active: Option<String>,
    /// Every profile name.
    pub profiles: Vec<String>,
}

/// Result of `get_profile`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct GetProfileResult {
    /// The profile; secret values are never included.
    pub profile: Profile,
    /// Whether it is the active profile.
    pub active: bool,
    /// Its script file names.
    pub scripts: Vec<String>,
}

/// Result of `create_profile`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct CreateProfileResult {
    /// The new, empty profile.
    pub profile: Profile,
    /// Whether it became the active profile (the first one does).
    pub active: bool,
}

/// Result of `set_active_profile`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct SetActiveProfileResult {
    /// The profile that is now active.
    pub active: String,
}

/// An app event attached to one of a profile's scripts.
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ScriptEvent {
    /// Catalog app id.
    pub app: String,
    /// Event id.
    pub event: String,
    /// Script file name.
    pub script: String,
}

/// What `delete_profile` would delete.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ProfileDeletion {
    /// Profile name.
    pub profile: String,
    /// How many variables it holds.
    pub variables: usize,
    /// Its script file names.
    pub scripts: Vec<String>,
}

/// Result of `delete_profile`.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum DeleteProfileResult {
    /// With `dry_run`: what would be deleted.
    DryRun {
        /// Always true.
        dry_run: bool,
        /// What would be deleted.
        would_delete: ProfileDeletion,
        /// App events attached to its scripts.
        attached_to: Vec<ScriptEvent>,
    },
    /// The profile was deleted.
    Deleted {
        /// The deleted profile's name.
        deleted: String,
        /// The active profile afterwards.
        active: Option<String>,
        /// App events that pointed at its scripts.
        attached_to: Vec<ScriptEvent>,
    },
}
```

`variables.rs`:

```rust
/// A variable's JSON value, for the schema only: text (string, secret,
/// path, url), a number (int, float), a flag (bool) or a list of strings
/// (string[], path[]).
#[derive(JsonSchema)]
#[serde(untagged)]
#[allow(dead_code)]
enum VarValueShape {
    Text(String),
    Number(f64),
    Flag(bool),
    List(Vec<String>),
}

/// A variable as the tools return it.
#[derive(Debug, Serialize, JsonSchema)]
pub struct VarView {
    /// Variable name.
    pub name: String,
    /// Variable type.
    #[serde(rename = "type")]
    pub ty: VarType,
    /// What the variable is for.
    pub description: String,
    /// The value; `********` for a secret unless revealed; null when not set.
    #[schemars(with = "Option<VarValueShape>")]
    pub value: Option<Value>,
    /// True when the variable has no value (a secret with nothing stored).
    pub missing: bool,
}

/// Result of `list_vars`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListVarsResult {
    /// Profile name.
    pub profile: String,
    /// Its variables, sorted by name.
    pub variables: Vec<VarView>,
}

/// Result of `get_var`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct GetVarResult {
    /// The variable.
    #[serde(flatten)]
    pub var: VarView,
    /// Profile name.
    pub profile: String,
}

/// Result of `set_var`. Never includes the value.
#[derive(Debug, Serialize, JsonSchema)]
pub struct SetVarResult {
    /// Profile name.
    pub profile: String,
    /// Variable name.
    pub name: String,
    /// Variable type.
    #[serde(rename = "type")]
    pub ty: VarType,
    /// The description now stored.
    pub description: String,
}

/// What `delete_var` would delete.
#[derive(Debug, Serialize, JsonSchema)]
pub struct VarDeletion {
    /// Profile name.
    pub profile: String,
    /// Variable name.
    pub name: String,
    /// Variable type.
    #[serde(rename = "type")]
    pub ty: VarType,
}

/// Result of `delete_var`.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum DeleteVarResult {
    /// With `dry_run`: what would be deleted.
    DryRun {
        /// Always true.
        dry_run: bool,
        /// The variable that would be deleted.
        would_delete: VarDeletion,
    },
    /// The variable was deleted.
    Deleted {
        /// Variable name.
        deleted: String,
        /// Profile name.
        profile: String,
    },
}
```

`var_json` becomes `pub(crate) fn var_view(v: &ResolvedVariable, reveal: bool) -> VarView` with the same masking rule (`Some(_) if masked => Some(json!(MASK))`, `Some(value) => Some(value.clone())`, `None => None`). `VarType` serialises to the same strings `as_str()` returned (`"string"`, `"string[]"`, …), so `type` is unchanged.

`attachments.rs`:

```rust
/// Result of `list_attachments`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListAttachmentsResult {
    /// Catalog app id.
    pub app: String,
    /// Every event of the app and what it runs.
    pub events: Vec<EventAttachment>,
}

/// Result of `attach_script`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct AttachScriptResult {
    /// The planned (or applied) attachment.
    #[serde(flatten)]
    pub plan: AttachPlan,
    /// False on a dry run.
    pub applied: bool,
    /// How to apply the change on macOS; absent on a dry run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// Result of `detach_script`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct DetachScriptResult {
    /// Profile name.
    pub profile: String,
    /// Script file name.
    pub script: String,
    /// The changes to the Hedge app's settings.
    pub actions: Vec<Action>,
    /// False on a dry run.
    pub applied: bool,
    /// How to apply the change on macOS; absent on a dry run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// Result of `sync_attachments`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct SyncAttachmentsResult {
    /// What was (or would be) attached and detached.
    #[serde(flatten)]
    pub report: SyncReport,
    /// How to apply the change on macOS; absent on a dry run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// Result of `clear_stale_attachment`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ClearStaleResult {
    /// Catalog app id.
    pub app: String,
    /// Event id.
    pub event: String,
    /// The changes to the Hedge app's settings.
    pub actions: Vec<Action>,
    /// False on a dry run.
    pub applied: bool,
    /// How to apply the change on macOS; absent on a dry run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}
```

`with_note` becomes `fn note(applied: bool) -> Option<String> { applied.then(|| APPLY_NOTE.to_owned()) }`.

`apps.rs`:

```rust
/// Result of `list_apps`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListAppsResult {
    /// Every catalog app and its status on this machine.
    pub apps: Vec<AppStatus>,
}

/// Result of `run_app_command`.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum RunAppCommandResult {
    /// With `dry_run`: the planned URLs; nothing ran.
    DryRun {
        /// Always false.
        executed: bool,
        /// Always true.
        dry_run: bool,
        /// The URLs that would open.
        plan: CommandPlan,
    },
    /// Some commands need the operator's approval; nothing ran.
    NeedsConfirmation {
        /// Always false.
        executed: bool,
        /// Commands the operator must approve.
        requires_confirmation: Vec<String>,
        /// The URLs that would open.
        plan: CommandPlan,
        /// What to do next.
        message: String,
    },
    /// The commands ran.
    Executed {
        /// Always true.
        executed: bool,
        /// The URLs opened and the app's responses.
        outcome: CommandOutcome,
    },
}

/// Result of `read_app_log`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ReadAppLogResult {
    /// Catalog app id.
    pub app: String,
    /// "callback" or "event".
    pub log: String,
    /// The last lines, oldest first.
    pub lines: Vec<String>,
}

/// Result of `list_presets`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListPresetsResult {
    /// Catalog app id.
    pub app: String,
    /// The app's presets.
    pub presets: Vec<Preset>,
    /// The selected preset, if known.
    pub selected: Option<String>,
}

/// Result of `write_preset`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct WritePresetResult {
    /// The preset written (or planned).
    pub preset: Preset,
    /// The file changes.
    pub actions: Vec<Action>,
    /// False on a dry run.
    pub applied: bool,
    /// What to do next.
    pub next: String,
}

/// Result of `select_preset`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct SelectPresetResult {
    /// Catalog app id.
    pub app: String,
    /// The preset selected.
    pub selected: String,
    /// The settings changes.
    pub actions: Vec<Action>,
    /// False on a dry run.
    pub applied: bool,
}
```

`describe_app` returns `AppDescription` directly.

`system.rs`:

```rust
/// Result of `list_runs`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListRunsResult {
    /// Runs, newest first.
    pub runs: Vec<Run>,
}

/// Result of `list_volumes`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListVolumesResult {
    /// Mounted volumes.
    pub volumes: Vec<VolumeInfo>,
}

/// Result of `inspect_volume`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct InspectVolumeResult {
    /// What is on the volume or folder.
    pub report: VolumeReport,
    /// The mounted volume at that path, if it is one.
    pub volume: Option<VolumeInfo>,
}

/// Catalog overrides in effect.
#[derive(Debug, Serialize, JsonSchema)]
pub struct CatalogState {
    /// Apps whose catalog file is overridden from `<data>/catalog/`.
    pub overridden: Vec<String>,
    /// Why the overrides were ignored, if they were.
    pub error: Option<String>,
}

/// One Hedge app in `environment`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct EnvironmentApp {
    /// Catalog app id.
    pub id: String,
    /// Whether it is installed.
    pub installed: bool,
    /// Installed version.
    pub version: Option<String>,
    /// Warnings such as a version newer than tested.
    pub warnings: Vec<String>,
}

/// Result of `environment`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct EnvironmentResult {
    /// HedgeBuddy's version.
    pub version: String,
    /// "windows" or "macos".
    pub os: String,
    /// The data folder.
    pub data_dir: PathBuf,
    /// The active profile.
    pub active_profile: Option<String>,
    /// Catalog overrides.
    pub catalog: CatalogState,
    /// The Python the Hedge apps use, if found.
    pub python: Option<PythonInfo>,
    /// Whether that Python has this HedgeBuddy's `hedgebuddy` package.
    pub python_package_matches: bool,
    /// Hedge app status.
    pub apps: Vec<EnvironmentApp>,
}
```

`get_run` returns `Run` directly. (If `Catalog::overridden()` returns `&[String]`, use `.to_vec()`.)

- [ ] **Step 5: Run the whole tool suite**

Run: `cargo test -p hedgebuddy-tools 2>&1 | tail -20`
Expected: PASS, including the three new tests. A result that does not match its schema fails the tool test that produced it, with the path of the mismatch.

Run: `cargo test --workspace && cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings`
Expected: PASS, no warnings.

- [ ] **Step 6: Commit**

```bash
git add -A crates/core crates/tools Cargo.lock
git commit -m "feat(tools): typed results with output schemas for every tool

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: MCP structured output and `hedgebuddy tools --schemas`

**Files:**
- Modify: `crates/cli/src/mcp.rs`, `crates/cli/src/main.rs`
- Test: `crates/cli/tests/mcp_contract.rs`, `crates/cli/tests/cli.rs`

**Interfaces:**
- Consumes: `ToolDef::output_schema`, `hedgebuddy_tools::schemas()` (Task 2).
- Produces: `hedgebuddy tools --schemas` (pretty JSON, keys sorted by tool name); `tools/list` entries with `outputSchema`; successful `tools/call` results with `structuredContent`.

- [ ] **Step 1: Write the failing contract assertions**

In `mcp_server_speaks_the_protocol`, after `assert_eq!(by_name("set_var")["inputSchema"]["type"], "object");` add:

```rust
    for t in tools {
        assert_eq!(t["outputSchema"]["type"], "object", "{} has no object outputSchema", t["name"]);
    }
```

After `let created = c.call_tool("create_profile", json!({"name": "p"}));` add:

```rust
    assert_eq!(created["structuredContent"], text_json(&created), "{created}");
```

After `let missing = c.call_tool("get_var", json!({"name": "NOPE"}));` add:

```rust
    assert!(missing.get("structuredContent").is_none(), "errors are text only: {missing}");
```

In `crates/cli/tests/cli.rs`, add (match the file's existing `assert_cmd` style):

```rust
#[test]
fn tools_schemas_prints_input_and_output_for_every_tool() {
    let out = assert_cmd::Command::cargo_bin("hedgebuddy")
        .unwrap()
        .args(["tools", "--schemas"])
        .output()
        .unwrap();
    assert!(out.status.success());
    let v: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    let map = v.as_object().unwrap();
    assert_eq!(map.len(), hedgebuddy_tools::all().len());
    assert_eq!(map["list_runs"]["input"]["type"], "object");
    assert_eq!(map["list_runs"]["output"]["type"], "object");
}
```

Run: `cargo test -p hedgebuddy-cli 2>&1 | tail -15`
Expected: FAIL (`outputSchema` missing; `--schemas` unknown argument).

- [ ] **Step 2: Advertise output schemas and return structured content**

In `mcp.rs`, `tool_list()`:

```rust
fn tool_list() -> Vec<Tool> {
    let object = |v: serde_json::Value| match v {
        serde_json::Value::Object(map) => map,
        _ => serde_json::Map::new(),
    };
    tools::all()
        .into_iter()
        .map(|t| {
            Tool::new(t.name, t.description, Arc::new(object((t.schema)())))
                .with_raw_output_schema(Arc::new(object((t.output_schema)())))
                .with_annotations(
                    ToolAnnotations::new()
                        .read_only(t.hints.read_only)
                        .destructive(t.hints.destructive)
                        .idempotent(t.hints.idempotent)
                        .open_world(false),
                )
        })
        .collect()
}
```

In `call_tool`, the success branch:

```rust
            Ok(value) => {
                let mut ok = CallToolResult::success(vec![ContentBlock::text(
                    serde_json::to_string_pretty(&value).expect("JSON values serialize"),
                )]);
                ok.structured_content = Some(value);
                ok
            }
```

(`CallToolResult::structured` would replace the pretty text with compact JSON; keep the pretty text so today's clients see the same thing.)

- [ ] **Step 3: Add `--schemas` to `hedgebuddy tools`**

In `main.rs`:

```rust
    /// List every tool `call` and MCP clients can use
    Tools {
        /// Print every tool's input and output JSON Schema as {tool: {input, output}}
        #[arg(long)]
        schemas: bool,
    },
```

and:

```rust
        Command::Tools { schemas } => {
            if schemas {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&tools::schemas()).expect("schemas serialize")
                );
            } else {
                for t in tools::all() {
                    println!("{:<24} {}", t.name, t.description);
                }
            }
            ExitCode::SUCCESS
        }
```

- [ ] **Step 4: Run the tests**

Run: `cargo test -p hedgebuddy-cli 2>&1 | tail -15`
Expected: PASS.

Run: `cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add crates/cli
git commit -m "feat(mcp): advertise output schemas, return structured content, add tools --schemas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Cross-process write lock

**Files:**
- Create: `crates/core/src/lock.rs`
- Modify: `crates/core/src/error.rs`, `crates/core/src/lib.rs`, `crates/tools/src/lib.rs`

**Interfaces:**
- Consumes: `Store` (core), `Context`, `call` (Task 2).
- Produces:
  - Core: `pub const LOCK_TIMEOUT: Duration` (10 s), `pub const BUSY_MESSAGE: &str = "another HedgeBuddy is busy; try again"`, `CoreError::Busy` (displays `BUSY_MESSAGE`), `pub struct DataLock` (releases on drop), `Store::lock_path() -> PathBuf`, `Store::lock() -> Result<DataLock>`, `Store::lock_within(Duration) -> Result<DataLock>`. Re-exported from the crate root: `DataLock`, `BUSY_MESSAGE`, `LOCK_TIMEOUT`.
  - Tools: `Context::with_lock_timeout(self, Duration) -> Context`, `Context::write_guard(&self) -> Result<WriteGuard<'_>, ToolError>` (in-process mutex, then the data lock), `pub struct WriteGuard<'a>`, `ToolError::is_busy(&self) -> bool`. `call` takes `write_guard()` for every tool that is not read-only.

- [ ] **Step 1: Write the failing core tests**

Create `crates/core/src/lock.rs` with only the tests first:

```rust
//! The cross-process write lock, `<data>/.hedgebuddy.lock`.

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::*;
    use crate::error::CoreError;
    use crate::store::Store;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("HedgeBuddy"));
        (dir, store)
    }

    #[test]
    fn a_second_writer_waits_then_reports_busy() {
        let (_d, store) = temp_store();
        let held = store.lock().unwrap();
        assert!(store.lock_path().is_file());
        let started = Instant::now();
        let err = store.lock_within(Duration::from_millis(300)).unwrap_err();
        let waited = started.elapsed();
        assert!(matches!(err, CoreError::Busy), "{err}");
        assert_eq!(err.to_string(), BUSY_MESSAGE);
        assert!(waited >= Duration::from_millis(300), "gave up after {waited:?}");
        assert!(waited < Duration::from_secs(3), "waited {waited:?}");
        drop(held);
        store.lock_within(Duration::from_millis(300)).unwrap();
    }

    #[test]
    fn a_waiting_writer_gets_the_lock_once_it_is_released() {
        let (_d, store) = temp_store();
        let held = store.lock().unwrap();
        let other = store.clone();
        let waiter = std::thread::spawn(move || {
            let lock = other.lock_within(Duration::from_secs(5));
            (lock.is_ok(), Instant::now())
        });
        std::thread::sleep(Duration::from_millis(200));
        let released = Instant::now();
        drop(held);
        let (ok, acquired) = waiter.join().unwrap();
        assert!(ok, "the waiter never got the lock");
        assert!(acquired >= released);
    }

    #[test]
    fn the_default_lock_gives_up_after_ten_seconds() {
        assert_eq!(LOCK_TIMEOUT, Duration::from_secs(10));
        let (_d, store) = temp_store();
        let _held = store.lock().unwrap();
        let started = Instant::now();
        assert!(matches!(store.lock(), Err(CoreError::Busy)));
        let waited = started.elapsed();
        assert!(
            waited >= Duration::from_secs(10) && waited < Duration::from_secs(13),
            "waited {waited:?}"
        );
    }
}
```

Add `pub mod lock;` to `lib.rs` and `pub use lock::{DataLock, BUSY_MESSAGE, LOCK_TIMEOUT};`.

Run: `cargo test -p hedgebuddy-core lock 2>&1 | tail -5`
Expected: FAIL to compile (`lock`, `LOCK_TIMEOUT`, … missing).

- [ ] **Step 2: Implement the lock**

Add to `CoreError` in `error.rs`:

```rust
    /// Another HedgeBuddy process held the data folder's write lock for the
    /// whole wait.
    #[error("another HedgeBuddy is busy; try again")]
    Busy,
```

Above the tests in `lock.rs`:

```rust
use std::fs::{File, OpenOptions, TryLockError};
use std::path::PathBuf;
use std::time::{Duration, Instant};

use crate::error::{CoreError, Result};
use crate::store::Store;

/// How long a writer waits for another HedgeBuddy process.
pub const LOCK_TIMEOUT: Duration = Duration::from_secs(10);

/// What a writer reports when the lock stays taken (`CoreError::Busy`).
pub const BUSY_MESSAGE: &str = "another HedgeBuddy is busy; try again";

/// How often a waiting writer tries again.
const RETRY_EVERY: Duration = Duration::from_millis(25);

/// The exclusive write lock on a data folder. Released when dropped.
#[derive(Debug)]
pub struct DataLock {
    file: File,
}

impl Drop for DataLock {
    fn drop(&mut self) {
        // Closing the file releases the lock too; unlocking first makes the
        // release immediate on every platform.
        let _ = self.file.unlock();
    }
}

impl Store {
    /// `<root>/.hedgebuddy.lock`, the file writers lock.
    pub fn lock_path(&self) -> PathBuf {
        self.root().join(".hedgebuddy.lock")
    }

    /// Take the write lock, waiting up to [`LOCK_TIMEOUT`] for another
    /// HedgeBuddy process (an MCP server, the app, `hedgebuddy call`).
    pub fn lock(&self) -> Result<DataLock> {
        self.lock_within(LOCK_TIMEOUT)
    }

    /// Take the write lock, waiting up to `timeout`. Fails with
    /// [`CoreError::Busy`] when another holder keeps it that long. Creates
    /// the data folder and the lock file when missing.
    pub fn lock_within(&self, timeout: Duration) -> Result<DataLock> {
        std::fs::create_dir_all(self.root()).map_err(|e| CoreError::io(self.root(), e))?;
        let path = self.lock_path();
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&path)
            .map_err(|e| CoreError::io(&path, e))?;
        let deadline = Instant::now() + timeout;
        loop {
            match file.try_lock() {
                Ok(()) => return Ok(DataLock { file }),
                Err(TryLockError::WouldBlock) if Instant::now() < deadline => {
                    std::thread::sleep(RETRY_EVERY)
                }
                Err(TryLockError::WouldBlock) => return Err(CoreError::Busy),
                Err(TryLockError::Error(e)) => return Err(CoreError::io(&path, e)),
            }
        }
    }
}
```

`File::try_lock` is an OS lock per open file (`flock` on macOS, `LockFileEx` on Windows), so a second handle in the same process contends exactly like another process does; the tests rely on that.

Run: `cargo test -p hedgebuddy-core lock 2>&1 | tail -8`
Expected: 3 passed (one takes about 10 s).

- [ ] **Step 3: Write the failing tool-layer test**

In `crates/tools/src/lib.rs` `mod tests`:

```rust
    #[test]
    fn writes_wait_for_another_holder_and_report_busy() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let ctx = ctx.with_lock_timeout(std::time::Duration::from_millis(200));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        let other = Store::open(ctx.store.root());
        let held = other.lock().unwrap();
        let set = json!({"name": "A", "type": "string", "value": "x"});
        let err = call(&ctx, "set_var", set.clone()).unwrap_err();
        assert!(err.is_busy(), "{err}");
        assert_eq!(err.0, hedgebuddy_core::BUSY_MESSAGE);
        // Read-only tools never wait for the lock.
        call(&ctx, "list_vars", json!({})).unwrap();
        drop(held);
        call(&ctx, "set_var", set).unwrap();
    }
```

Run: `cargo test -p hedgebuddy-tools writes_wait 2>&1 | tail -5`
Expected: FAIL to compile (`with_lock_timeout`, `is_busy`).

- [ ] **Step 4: Take the data lock in the tool layer**

In `lib.rs`: add `use std::sync::MutexGuard; use std::time::Duration;` and `use hedgebuddy_core::{DataLock, LOCK_TIMEOUT};`. Add the field to `Context` and initialise it in `Context::new` with `lock_timeout: LOCK_TIMEOUT`:

```rust
    /// How long a write waits for another HedgeBuddy process to release the
    /// data folder's lock.
    pub(crate) lock_timeout: Duration,
```

Methods on `Context`:

```rust
    /// The same context with a different wait for the data folder's lock
    /// (tests use a short one).
    pub fn with_lock_timeout(mut self, timeout: Duration) -> Context {
        self.lock_timeout = timeout;
        self
    }

    /// Serialise a write: this process's mutex first, then the data folder's
    /// cross-process lock. Hold the guard for the whole write.
    pub fn write_guard(&self) -> Result<WriteGuard<'_>, ToolError> {
        // A tool that panicked while holding the mutex leaves nothing
        // half-held in `()`, so a poisoned mutex is still safe to take.
        let process = self.write_lock.lock().unwrap_or_else(|e| e.into_inner());
        let data = self.store.lock_within(self.lock_timeout)?;
        Ok(WriteGuard {
            _data: data,
            _process: process,
        })
    }
```

```rust
/// Held while a write runs; see [`Context::write_guard`]. Fields drop in
/// order, so the cross-process lock is released first.
pub struct WriteGuard<'a> {
    _data: DataLock,
    _process: MutexGuard<'a, ()>,
}
```

On `ToolError`:

```rust
    /// Whether this is the "another HedgeBuddy is busy" error, which the
    /// caller can offer to retry.
    pub fn is_busy(&self) -> bool {
        self.0 == hedgebuddy_core::BUSY_MESSAGE
    }
```

In `call`, replace the mutex branch with:

```rust
    } else {
        let _guard = ctx.write_guard()?;
        (def.run)(ctx, args)
    };
```

Update the `write_lock` field comment to say the data lock is taken with it through `write_guard`.

- [ ] **Step 5: Run everything**

Run: `cargo test --workspace 2>&1 | tail -15`
Expected: PASS (including `concurrent_writes_to_one_profile_are_all_kept`, which now also takes the file lock eight times in turn).

Run: `cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add crates/core crates/tools
git commit -m "feat(core): cross-process write lock on the data folder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Parked core fixes: lossy run files, rename retry, valueless secrets

**Files:**
- Modify: `crates/core/src/runs.rs`, `crates/core/src/fs_util.rs`, `crates/core/src/manifest.rs`, `crates/core/src/scripts.rs`, `crates/core/src/hedge/sync.rs`
- Modify (test helper only): `python/tests/test_fixtures.py`

**Interfaces:**
- Produces: `pub fn check_requirements(manifest: &Manifest, profile: &Profile, secrets: &BTreeMap<String, String>) -> Vec<RequirementIssue>` (new third parameter). `fs_util::rename_with_retry` (crate-private).

- [ ] **Step 1: Failing test for lossy run decoding**

In `runs.rs` tests:

```rust
    #[test]
    fn a_bad_byte_costs_at_most_its_line_not_the_day() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        fs::create_dir_all(store.runs_dir()).unwrap();
        let mut bytes = Vec::new();
        bytes.extend_from_slice(
            br#"{"ts":"2026-09-14T10:00:00Z","run_id":"a","phase":"start","script":"x.py","profile":"p"}"#,
        );
        bytes.push(b'\n');
        // Latin-1 "caf\xe9": not UTF-8.
        bytes.extend_from_slice(b"{\"ts\":\"2026-09-14T10:00:01Z\",\"run_id\":\"a\",\"phase\":\"log\",\"message\":\"caf\xe9\"}\n");
        bytes.extend_from_slice(b"{\"ts\":\xff\xfe broken\n");
        bytes.extend_from_slice(
            br#"{"ts":"2026-09-14T11:00:00Z","run_id":"b","phase":"start","script":"y.py","profile":"p"}"#,
        );
        bytes.push(b'\n');
        fs::write(store.runs_dir().join("2026-09-14.jsonl"), bytes).unwrap();
        let runs = store.list_runs(&RunFilter::default()).unwrap();
        let ids: Vec<&str> = runs.iter().map(|r| r.run_id.as_str()).collect();
        assert_eq!(ids, ["b", "a"]);
        assert_eq!(runs[1].logs[0].message, "caf\u{fffd}");
    }
```

Run: `cargo test -p hedgebuddy-core a_bad_byte 2>&1 | tail -5`
Expected: FAIL (`ids` is empty: the whole file is skipped as non-UTF-8).

- [ ] **Step 2: Decode run files lossily**

In `list_runs`, replace the read:

```rust
            // Skip a file that cannot be read (locked by a writer, a folder)
            // rather than failing the whole listing. Decode lossily: a bad
            // byte turns into U+FFFD, so at most its own line fails to parse.
            let Ok(bytes) = fs::read(&file) else {
                continue;
            };
            let text = String::from_utf8_lossy(&bytes);
```

Update the doc comment of `list_runs` to say invalid UTF-8 is replaced, not fatal.

Run: `cargo test -p hedgebuddy-core runs 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 3: Failing tests for the rename retry**

In `fs_util.rs` tests:

```rust
    use std::io;
    use std::time::{Duration, Instant};

    fn denied() -> io::Error {
        io::Error::from(io::ErrorKind::PermissionDenied)
    }

    #[test]
    fn rename_retries_permission_denied_until_it_succeeds() {
        let mut calls = 0;
        let result = rename_with_retry(
            || {
                calls += 1;
                if calls < 4 { Err(denied()) } else { Ok(()) }
            },
            true,
            Duration::from_secs(1),
        );
        assert!(result.is_ok());
        assert_eq!(calls, 4);
    }

    #[test]
    fn rename_gives_up_when_the_budget_runs_out() {
        let started = Instant::now();
        let result = rename_with_retry(|| Err(denied()), true, Duration::from_millis(150));
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::PermissionDenied);
        let waited = started.elapsed();
        assert!(waited >= Duration::from_millis(150) && waited < Duration::from_secs(1), "{waited:?}");
    }

    #[test]
    fn rename_does_not_retry_other_errors_or_when_retry_is_off() {
        let mut calls = 0;
        let _ = rename_with_retry(|| { calls += 1; Err(io::Error::from(io::ErrorKind::NotFound)) }, true, Duration::from_secs(1));
        assert_eq!(calls, 1);
        let mut calls = 0;
        let _ = rename_with_retry(|| { calls += 1; Err(denied()) }, false, Duration::from_secs(1));
        assert_eq!(calls, 1);
    }

    #[cfg(windows)]
    #[test]
    fn write_atomic_waits_for_a_reader_holding_the_target() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("t.json");
        fs::write(&target, b"old").unwrap();
        // A reader that does not share delete access blocks replacing the file.
        const FILE_SHARE_READ: u32 = 1;
        let reader = fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .open(&target)
            .unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(200));
            drop(reader);
        });
        write_atomic(&target, b"new", false).unwrap();
        release.join().unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new");
    }
```

Run: `cargo test -p hedgebuddy-core rename 2>&1 | tail -5`
Expected: FAIL to compile (`rename_with_retry` missing).

- [ ] **Step 4: Implement the retry**

In `fs_util.rs`:

```rust
use std::io;
use std::time::{Duration, Instant};

/// How long `write_atomic` keeps retrying a rename that Windows refuses.
const RENAME_RETRY_FOR: Duration = Duration::from_secs(1);
/// Pause between rename attempts.
const RENAME_RETRY_EVERY: Duration = Duration::from_millis(20);

/// Run `rename` until it succeeds, fails with anything other than
/// `PermissionDenied`, or `budget` runs out. With `retry` false it runs once.
/// On Windows `PermissionDenied` usually means another process (a virus
/// scanner, the Python library, another HedgeBuddy) has the target open for
/// a moment.
pub(crate) fn rename_with_retry(
    mut rename: impl FnMut() -> io::Result<()>,
    retry: bool,
    budget: Duration,
) -> io::Result<()> {
    let deadline = Instant::now() + budget;
    loop {
        match rename() {
            Err(e)
                if retry
                    && e.kind() == io::ErrorKind::PermissionDenied
                    && Instant::now() < deadline =>
            {
                std::thread::sleep(RENAME_RETRY_EVERY)
            }
            other => return other,
        }
    }
}
```

In `write_atomic`, replace `fs::rename(tmp, path).map_err(...)` with:

```rust
    rename_with_retry(|| fs::rename(tmp, path), cfg!(windows), RENAME_RETRY_FOR).map_err(|e| {
        let _ = fs::remove_file(tmp);
        CoreError::io(path, e)
    })?;
```

Run: `cargo test -p hedgebuddy-core fs_util 2>&1 | tail -8`
Expected: PASS on Windows (4 tests) and macOS (3 tests). If the Windows reader test surfaces a different error kind than `PermissionDenied` (for example raw OS error 32, a sharing violation), retry on that too and say so in the report and the doc comment.

- [ ] **Step 5: Failing test for a valueless secret**

In `manifest.rs` tests (adapt the helper names to the file's existing ones):

```rust
    #[test]
    fn a_secret_without_a_stored_value_is_missing() {
        let m = parse_manifest(
            "\"\"\"\n{\"hedgebuddy\": 1, \"requires\": {\"HOOK\": {\"type\": \"secret\"}}}\n---\n\"\"\"\n",
        )
        .unwrap()
        .unwrap();
        let mut p = Profile::new("p", "");
        p.variables.insert(
            "HOOK".into(),
            Variable { ty: VarType::Secret, value: None, description: String::new() },
        );
        let none = BTreeMap::new();
        assert_eq!(
            check_requirements(&m, &p, &none),
            vec![RequirementIssue::Missing { name: "HOOK".into(), ty: VarType::Secret }]
        );
        let stored = BTreeMap::from([("HOOK".to_owned(), "https://h".to_owned())]);
        assert!(check_requirements(&m, &p, &stored).is_empty());
    }
```

Run: `cargo test -p hedgebuddy-core a_secret_without 2>&1 | tail -5`
Expected: FAIL to compile (two-argument `check_requirements`).

- [ ] **Step 6: Count only variables that have a value**

In `manifest.rs`:

```rust
/// Requirements `profile` does not meet. A variable counts as declared only
/// when it has a value: a plain variable's value in `profile.json`, a
/// secret's entry in `secrets`. This matches what the Python library checks
/// when the script runs.
pub fn check_requirements(
    manifest: &Manifest,
    profile: &Profile,
    secrets: &BTreeMap<String, String>,
) -> Vec<RequirementIssue> {
    let declared = |name: &str| {
        profile.variables.get(name).filter(|var| match var.ty {
            VarType::Secret => secrets.contains_key(name),
            _ => var.value.is_some(),
        })
    };
    manifest
        .requires
        .iter()
        .filter_map(|(name, req)| match declared(name) {
            Some(var) if var.ty == req.ty => None,
            Some(var) => Some(RequirementIssue::TypeMismatch {
                name: name.clone(),
                expected: req.ty,
                actual: var.ty,
            }),
            None if req.default.is_some() => None,
            None => Some(RequirementIssue::Missing {
                name: name.clone(),
                ty: req.ty,
            }),
        })
        .collect()
}
```

Callers:
- `scripts.rs` `check_script`: `Some(m) => check_requirements(m, &self.load_profile(profile)?, &self.load_secrets(profile)?)`.
- `hedge/sync.rs`, where `profile_data` is loaded: load `let secrets = store.load_secrets(profile)?;` once next to it and pass `&secrets`.
- Existing `manifest.rs` tests: pass `&BTreeMap::new()`, or a map holding the secrets a test expects to be satisfied.

In `python/tests/test_fixtures.py` `summarize`, compute unmet from variables that have a value, as `_script.py` does:

```python
        declared = {n: v.type for n, v in variables.items() if v.raw is not None}
```

and pass `declared` to `check_requirements` (keep `types` for the `"types"` entry).

- [ ] **Step 7: Run everything**

Run: `cargo test --workspace 2>&1 | tail -15 && (cd python && uv run pytest -q 2>&1 | tail -3)`
Expected: PASS. `store_fixture` still passes (the fixture's secret has a value).

Run: `cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add crates/core python/tests/test_fixtures.py
git commit -m "fix(core): lossy run decoding, rename retry on Windows, valueless secrets are unmet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Batched watcher and change categories

**Files:**
- Modify: `crates/core/src/watch.rs`, `crates/core/src/lib.rs`

**Interfaces:**
- Produces:
  - `pub const BATCH_WINDOW: Duration` (200 ms).
  - `pub fn watch_batched(root: &Path, window: Duration) -> Result<(WatchHandle, Receiver<Vec<Change>>)>`.
  - `pub fn batch_changes(changes: Receiver<Change>, batches: Sender<Vec<Change>>, window: Duration)` (runs until either side hangs up).
  - `pub enum Category { Index, Profile(String), Scripts(String), Runs, Catalog, Activity, Preferences }` with `Display` giving `index`, `profile:<name>`, `scripts:<name>`, `runs`, `catalog`, `activity`, `preferences`.
  - `pub fn categorize(root: &Path, path: &Path) -> Option<Category>`; `pub fn categories(root: &Path, changes: &[Change]) -> Vec<String>` (sorted, unique).
  - Re-exported from the crate root: `watch_batched`, `Category`, `categories`, `BATCH_WINDOW`.

- [ ] **Step 1: Write the failing tests**

In `watch.rs` tests:

```rust
    use std::sync::mpsc::channel;

    fn change(path: &Path) -> Change {
        Change { path: path.to_path_buf(), kind: ChangeKind::Modified }
    }

    #[test]
    fn paths_map_to_categories() {
        let root = Path::new("/data/HedgeBuddy");
        let cat = |rel: &str| categorize(root, &root.join(rel)).map(|c| c.to_string());
        assert_eq!(cat("hedgebuddy.json").as_deref(), Some("index"));
        assert_eq!(cat("profiles").as_deref(), Some("index"));
        assert_eq!(cat("profiles/p").as_deref(), Some("profile:p"));
        assert_eq!(cat("profiles/p/profile.json").as_deref(), Some("profile:p"));
        assert_eq!(cat("profiles/p/secrets.json").as_deref(), Some("profile:p"));
        assert_eq!(cat("profiles/p/scripts").as_deref(), Some("scripts:p"));
        assert_eq!(cat("profiles/p/scripts/copy.py").as_deref(), Some("scripts:p"));
        assert_eq!(cat("runs/2026-09-23.jsonl").as_deref(), Some("runs"));
        assert_eq!(cat("catalog/offshoot.toml").as_deref(), Some("catalog"));
        assert_eq!(cat("activity.jsonl").as_deref(), Some("activity"));
        assert_eq!(cat("preferences.json").as_deref(), Some("preferences"));
        assert_eq!(cat(".hedgebuddy.lock"), None);
        assert_eq!(cat("something-else.txt"), None);
        assert_eq!(categorize(root, root), None);
        assert_eq!(categorize(root, Path::new("/elsewhere/x.json")), None);
    }

    #[test]
    fn a_batch_lists_each_category_once_in_order() {
        let root = Path::new("/data/HedgeBuddy");
        let batch = [
            change(&root.join("runs/a.jsonl")),
            change(&root.join("profiles/p/profile.json")),
            change(&root.join("runs/b.jsonl")),
            change(&root.join(".hedgebuddy.lock")),
        ];
        assert_eq!(categories(root, &batch), ["profile:p", "runs"]);
    }

    #[test]
    fn changes_within_the_window_form_one_batch() {
        let (tx, rx) = channel();
        let (btx, brx) = channel();
        let worker = std::thread::spawn(move || batch_changes(rx, btx, Duration::from_millis(150)));
        let p = Path::new("/x");
        for _ in 0..3 {
            tx.send(change(p)).unwrap();
        }
        let first = brx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(first.len(), 3);
        std::thread::sleep(Duration::from_millis(300));
        tx.send(change(p)).unwrap();
        let second = brx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(second.len(), 1);
        drop(tx);
        worker.join().unwrap();
    }

    #[test]
    fn the_batched_watcher_reports_a_write() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("HedgeBuddy");
        let (_handle, batches) = watch_batched(&root, BATCH_WINDOW).unwrap();
        let target = root.join("preferences.json");
        crate::fs_util::write_atomic(&target, b"{}\n", false).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        while std::time::Instant::now() < deadline {
            if let Ok(batch) = batches.recv_timeout(Duration::from_millis(500)) {
                if categories(&root, &batch).contains(&"preferences".to_owned()) {
                    return;
                }
            }
        }
        panic!("no batch for {}", target.display());
    }
```

Run: `cargo test -p hedgebuddy-core watch 2>&1 | tail -5`
Expected: FAIL to compile.

- [ ] **Step 2: Implement batching and categories**

In `watch.rs` (add imports `std::collections::BTreeSet`, `std::path::Component`, `std::sync::mpsc::{RecvTimeoutError, Sender}`, `std::time::{Duration, Instant}`):

```rust
/// Changes that arrive within this long after the first one form one batch.
pub const BATCH_WINDOW: Duration = Duration::from_millis(200);

/// Like [`watch()`], but delivers changes in batches: the first change opens
/// a window of `window`, and every change that arrives before it closes
/// joins the same batch. Bursts (an editor's save, macOS's FSEvents) become
/// one notification. Dropping the handle ends the batching thread.
pub fn watch_batched(root: &Path, window: Duration) -> Result<(WatchHandle, Receiver<Vec<Change>>)> {
    let (handle, changes) = watch(root)?;
    let (tx, batches) = channel();
    std::thread::Builder::new()
        .name("hedgebuddy-watch-batch".into())
        .spawn(move || batch_changes(changes, tx, window))
        .map_err(|e| CoreError::Watch(format!("cannot start the batching thread: {e}")))?;
    Ok((handle, batches))
}

/// Group `changes` into batches (see [`watch_batched`]) and send them on
/// `batches`, until the watcher stops or nobody listens any more.
pub fn batch_changes(changes: Receiver<Change>, batches: Sender<Vec<Change>>, window: Duration) {
    while let Ok(first) = changes.recv() {
        let mut batch = vec![first];
        let deadline = Instant::now() + window;
        let mut watcher_gone = false;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                break;
            }
            match changes.recv_timeout(left) {
                Ok(change) => batch.push(change),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => {
                    watcher_gone = true;
                    break;
                }
            }
        }
        if batches.send(batch).is_err() || watcher_gone {
            return;
        }
    }
}

/// What a change in the data folder affects, so a front end knows what to
/// reload.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Category {
    /// `hedgebuddy.json` or the list of profiles.
    Index,
    /// A profile's `profile.json` or `secrets.json`.
    Profile(String),
    /// A profile's scripts folder.
    Scripts(String),
    /// Run records.
    Runs,
    /// Catalog overrides.
    Catalog,
    /// The Claude activity log.
    Activity,
    /// `preferences.json`.
    Preferences,
}

impl std::fmt::Display for Category {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Category::Index => f.write_str("index"),
            Category::Profile(name) => write!(f, "profile:{name}"),
            Category::Scripts(name) => write!(f, "scripts:{name}"),
            Category::Runs => f.write_str("runs"),
            Category::Catalog => f.write_str("catalog"),
            Category::Activity => f.write_str("activity"),
            Category::Preferences => f.write_str("preferences"),
        }
    }
}

/// The category of a changed `path` under `root`, or `None` for the lock
/// file, temporary files and anything HedgeBuddy does not store.
pub fn categorize(root: &Path, path: &Path) -> Option<Category> {
    let rel = path.strip_prefix(root).ok()?;
    let parts: Vec<&str> = rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => s.to_str(),
            _ => None,
        })
        .collect();
    match parts.as_slice() {
        ["hedgebuddy.json"] | ["profiles"] => Some(Category::Index),
        ["profiles", name, "scripts", ..] => Some(Category::Scripts((*name).to_owned())),
        ["profiles", name, ..] => Some(Category::Profile((*name).to_owned())),
        ["runs", ..] => Some(Category::Runs),
        ["catalog", ..] => Some(Category::Catalog),
        ["activity.jsonl"] => Some(Category::Activity),
        ["preferences.json"] => Some(Category::Preferences),
        _ => None,
    }
}

/// The categories a batch touches, sorted and without repeats.
pub fn categories(root: &Path, changes: &[Change]) -> Vec<String> {
    let set: BTreeSet<Category> = changes.iter().filter_map(|c| categorize(root, &c.path)).collect();
    set.into_iter().map(|c| c.to_string()).collect()
}
```

In `lib.rs`: `pub use watch::{categories, watch, watch_batched, Category, Change, ChangeKind, WatchHandle, BATCH_WINDOW};`

- [ ] **Step 3: Run the tests**

Run: `cargo test -p hedgebuddy-core watch 2>&1 | tail -8`
Expected: PASS (5 tests).

Run: `cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add crates/core
git commit -m "feat(core): batched change notifications with categories

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Claude activity log

**Files:**
- Create: `crates/core/src/clock.rs`, `crates/core/src/activity.rs`, `schema/activity-record.schema.json`, `schema/fixtures/invalid/activity-record/extra-field.json`, `schema/fixtures/invalid/activity-record/bad-outcome.json`, `schema/fixtures/valid/basic/activity.jsonl`
- Modify: `crates/core/src/lib.rs`, `crates/core/tests/schema_conformance.rs`, `crates/tools/src/lib.rs`, `crates/tools/src/resources.rs`, `crates/cli/src/mcp.rs`, `crates/cli/tests/mcp_contract.rs`, `crates/cli/tests/cli.rs`, `schema/README.md`

**Interfaces:**
- Consumes: `Store::lock_within` (Task 4).
- Produces:
  - `clock::now_rfc3339() -> String` (UTC, exactly three fraction digits, `Z`), re-exported as `hedgebuddy_core::now_rfc3339`.
  - `pub enum ActivityOutcome { Ok, Error, NeedsConfirmation }` (snake_case), `pub struct ActivityRecord { ts, tool, target: Option<String>, outcome }` with `ActivityRecord::now(tool: &str, target: Option<String>, outcome) -> ActivityRecord`, `pub fn activity_target(args: &Value) -> Option<String>`, `pub const ACTIVITY_KEEP: usize = 200`, `pub const ACTIVITY_TRIM_AT: usize = 250`, `Store::activity_path()`, `Store::append_activity(&ActivityRecord) -> Result<()>`, `Store::read_activity(limit: usize) -> Result<Vec<ActivityRecord>>` (newest first). All derive `JsonSchema` where they are data.
  - Tools: `pub fn activity_outcome(result: &ToolResult) -> ActivityOutcome`.
  - The MCP server appends one record per call of a known tool.

- [ ] **Step 1: Write the clock and its test**

`crates/core/src/clock.rs`:

```rust
//! Timestamps HedgeBuddy writes.

/// Now, in UTC, as RFC 3339 with milliseconds: `2026-09-23T14:02:11.482Z`.
/// Run records from the Python library use the same form.
pub fn now_rfc3339() -> String {
    jiff::Timestamp::now().strftime("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

#[cfg(test)]
mod tests {
    #[test]
    fn timestamps_are_utc_with_milliseconds() {
        let ts = super::now_rfc3339();
        let bytes = ts.as_bytes();
        assert_eq!(ts.len(), 24, "{ts}");
        assert_eq!((bytes[4], bytes[10], bytes[19], bytes[23]), (b'-', b'T', b'.', b'Z'), "{ts}");
        assert!(ts.parse::<jiff::Timestamp>().is_ok(), "{ts}");
    }
}
```

(If jiff's `strftime` does not accept `%.3f`, round with `Timestamp::round(jiff::Unit::Millisecond)` and format the fraction yourself; the test fixes the output.)

- [ ] **Step 2: Write the failing activity tests**

`crates/core/src/activity.rs`, tests first:

```rust
#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::store::Store;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("HedgeBuddy"));
        (dir, store)
    }

    fn record(tool: &str, target: Option<&str>) -> ActivityRecord {
        ActivityRecord::now(tool, target.map(str::to_owned), ActivityOutcome::Ok)
    }

    #[test]
    fn the_target_is_the_first_named_argument_present() {
        assert_eq!(activity_target(&json!({"profile": "p", "name": "A"})).as_deref(), Some("A"));
        assert_eq!(activity_target(&json!({"app": "offshoot", "event": "DiskAdded"})).as_deref(), Some("DiskAdded"));
        assert_eq!(activity_target(&json!({"run_id": "01J", "profile": "p"})).as_deref(), Some("01J"));
        assert_eq!(activity_target(&json!({"name": 3, "script": "x.py"})).as_deref(), Some("x.py"));
        assert_eq!(activity_target(&json!({"name": "", "profile": "p"})).as_deref(), Some("p"));
        assert_eq!(activity_target(&json!({"value": "https://secret"})), None);
        assert_eq!(activity_target(&serde_json::Value::Null), None);
    }

    #[test]
    fn records_read_back_newest_first() {
        let (_d, store) = temp_store();
        assert!(store.read_activity(10).unwrap().is_empty());
        for tool in ["a", "b", "c"] {
            store.append_activity(&record(tool, None)).unwrap();
        }
        let tools: Vec<String> = store.read_activity(2).unwrap().into_iter().map(|r| r.tool).collect();
        assert_eq!(tools, ["c", "b"]);
    }

    #[test]
    fn the_log_is_trimmed_to_the_last_200_after_250() {
        let (_d, store) = temp_store();
        for i in 0..ACTIVITY_TRIM_AT {
            store.append_activity(&record(&format!("t{i}"), None)).unwrap();
        }
        assert_eq!(line_count(&store), ACTIVITY_TRIM_AT);
        store.append_activity(&record("last", None)).unwrap();
        assert_eq!(line_count(&store), ACTIVITY_KEEP);
        let all = store.read_activity(usize::MAX).unwrap();
        assert_eq!(all[0].tool, "last");
        assert_eq!(all[ACTIVITY_KEEP - 1].tool, format!("t{}", ACTIVITY_TRIM_AT + 1 - ACTIVITY_KEEP));
    }

    #[test]
    fn trimming_waits_its_turn_and_is_skipped_while_busy() {
        let (_d, store) = temp_store();
        for i in 0..=ACTIVITY_TRIM_AT {
            if i == ACTIVITY_TRIM_AT {
                let _held = Store::open(store.root()).lock().unwrap();
                store.append_activity(&record("while-busy", None)).unwrap();
                assert_eq!(line_count(&store), ACTIVITY_TRIM_AT + 1, "no trim while locked");
            } else {
                store.append_activity(&record("t", None)).unwrap();
            }
        }
        store.append_activity(&record("after", None)).unwrap();
        assert_eq!(line_count(&store), ACTIVITY_KEEP);
    }

    #[test]
    fn a_bad_line_is_skipped() {
        let (_d, store) = temp_store();
        store.append_activity(&record("a", Some("x"))).unwrap();
        let mut f = std::fs::OpenOptions::new().append(true).open(store.activity_path()).unwrap();
        std::io::Write::write_all(&mut f, b"not json\n\xff\xfe\n").unwrap();
        drop(f);
        store.append_activity(&record("b", None)).unwrap();
        let tools: Vec<String> = store.read_activity(10).unwrap().into_iter().map(|r| r.tool).collect();
        assert_eq!(tools, ["b", "a"]);
    }

    #[test]
    fn records_hold_no_argument_values() {
        let (_d, store) = temp_store();
        let args = json!({"name": "HOOK", "type": "secret", "value": "https://secret"});
        let r = ActivityRecord::now("set_var", activity_target(&args), ActivityOutcome::Ok);
        store.append_activity(&r).unwrap();
        let text = std::fs::read_to_string(store.activity_path()).unwrap();
        assert!(!text.contains("https://secret"), "{text}");
        let line: serde_json::Value = serde_json::from_str(text.trim()).unwrap();
        assert_eq!(line["target"], "HOOK");
        assert_eq!(line["outcome"], "ok");
        assert_eq!(line.as_object().unwrap().len(), 4);
    }

    fn line_count(store: &Store) -> usize {
        std::fs::read_to_string(store.activity_path()).unwrap().lines().count()
    }
}
```

Add `pub mod activity; pub mod clock;` to `lib.rs` with `pub use activity::{activity_target, ActivityOutcome, ActivityRecord, ACTIVITY_KEEP, ACTIVITY_TRIM_AT}; pub use clock::now_rfc3339;`.

Run: `cargo test -p hedgebuddy-core activity 2>&1 | tail -5`
Expected: FAIL to compile.

- [ ] **Step 3: Implement the log**

Above the tests in `activity.rs`:

```rust
//! The Claude activity log, `<data>/activity.jsonl`: one line per MCP tool
//! call, keeping only which tool ran, on what, and how it ended. Argument
//! values, script source and error text are never written.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{CoreError, Result};
use crate::fs_util;
use crate::store::Store;

/// How many records the log keeps after a trim.
pub const ACTIVITY_KEEP: usize = 200;
/// The log is trimmed once it holds more lines than this.
pub const ACTIVITY_TRIM_AT: usize = 250;
/// How long a trim waits for the data folder's lock before giving up for now.
const TRIM_WAIT: Duration = Duration::from_secs(1);
/// The arguments that name what a call acts on, in order of preference.
const TARGET_KEYS: [&str; 6] = ["name", "script", "run_id", "event", "app", "profile"];

/// How a tool call ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ActivityOutcome {
    /// The tool succeeded.
    Ok,
    /// The tool returned an error.
    Error,
    /// `run_app_command` stopped to ask the operator first.
    NeedsConfirmation,
}

/// One line of `activity.jsonl`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ActivityRecord {
    /// When the call finished (UTC, RFC 3339).
    pub ts: String,
    /// The tool's name.
    pub tool: String,
    /// What it acted on: the first of `name`, `script`, `run_id`, `event`,
    /// `app`, `profile` that the call passed, or null.
    pub target: Option<String>,
    /// How it ended.
    pub outcome: ActivityOutcome,
}

impl ActivityRecord {
    /// A record stamped now.
    pub fn now(tool: &str, target: Option<String>, outcome: ActivityOutcome) -> ActivityRecord {
        ActivityRecord { ts: crate::clock::now_rfc3339(), tool: tool.to_owned(), target, outcome }
    }
}

/// What a call with `args` acts on: the first of [`TARGET_KEYS`] whose value
/// is a non-empty string. Nothing else from `args` is ever kept.
pub fn activity_target(args: &Value) -> Option<String> {
    TARGET_KEYS.iter().find_map(|key| {
        args.get(key)
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    })
}

impl Store {
    /// `<root>/activity.jsonl`.
    pub fn activity_path(&self) -> PathBuf {
        self.root().join("activity.jsonl")
    }

    /// Append one record. The append is one `write_all` of one line on a
    /// file opened for appending, so it needs no lock. Past
    /// [`ACTIVITY_TRIM_AT`] lines the file is rewritten to the last
    /// [`ACTIVITY_KEEP`] under the data folder's lock; when another
    /// HedgeBuddy holds the lock for a second, the trim waits for a later
    /// append.
    pub fn append_activity(&self, record: &ActivityRecord) -> Result<()> {
        let path = self.activity_path();
        fs::create_dir_all(self.root()).map_err(|e| CoreError::io(self.root(), e))?;
        let mut line = serde_json::to_string(record).map_err(|e| CoreError::Json { path: path.clone(), source: e })?;
        line.push('\n');
        let mut file = OpenOptions::new().create(true).append(true).open(&path).map_err(|e| CoreError::io(&path, e))?;
        file.write_all(line.as_bytes()).map_err(|e| CoreError::io(&path, e))?;
        drop(file);
        if read_lines(&path)?.len() > ACTIVITY_TRIM_AT {
            match self.lock_within(TRIM_WAIT) {
                Ok(_lock) => {
                    let lines = read_lines(&path)?;
                    if lines.len() > ACTIVITY_TRIM_AT {
                        let mut kept = lines[lines.len() - ACTIVITY_KEEP..].join("\n");
                        kept.push('\n');
                        fs_util::write_atomic(&path, kept.as_bytes(), false)?;
                    }
                }
                Err(CoreError::Busy) => {}
                Err(e) => return Err(e),
            }
        }
        Ok(())
    }

    /// Up to `limit` records, newest first. Lines that do not parse are
    /// skipped; a missing file is an empty log.
    pub fn read_activity(&self, limit: usize) -> Result<Vec<ActivityRecord>> {
        let path = self.activity_path();
        if !path.exists() {
            return Ok(Vec::new());
        }
        Ok(read_lines(&path)?
            .iter()
            .rev()
            .filter_map(|l| serde_json::from_str(l).ok())
            .take(limit)
            .collect())
    }
}

/// The file's non-empty lines, decoded lossily.
fn read_lines(path: &std::path::Path) -> Result<Vec<String>> {
    let bytes = fs::read(path).map_err(|e| CoreError::io(path, e))?;
    Ok(String::from_utf8_lossy(&bytes)
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(str::to_owned)
        .collect())
}
```

Run: `cargo test -p hedgebuddy-core activity clock 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 4: Schema, fixtures and conformance**

`schema/activity-record.schema.json` (match the other schemas' header style):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/shakedex/hedgebuddy/schema/activity-record.schema.json",
  "title": "HedgeBuddy Claude activity record (one JSONL line)",
  "description": "One MCP tool call in <data>/activity.jsonl. Argument values, script source and error text are never recorded.",
  "type": "object",
  "additionalProperties": false,
  "required": ["ts", "tool", "target", "outcome"],
  "properties": {
    "ts": { "type": "string", "format": "date-time" },
    "tool": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" },
    "target": { "type": ["string", "null"] },
    "outcome": { "enum": ["ok", "error", "needs_confirmation"] }
  }
}
```

`schema/fixtures/valid/basic/activity.jsonl`:

```
{"ts":"2026-09-15T18:20:01.120Z","tool":"write_script","target":"on_copy_complete.py","outcome":"ok"}
{"ts":"2026-09-15T18:20:04.884Z","tool":"run_app_command","target":"offshoot","outcome":"needs_confirmation"}
{"ts":"2026-09-15T18:20:09.310Z","tool":"list_runs","target":null,"outcome":"ok"}
```

`schema/fixtures/invalid/activity-record/extra-field.json`:

```json
{"ts": "2026-09-15T18:20:01.120Z", "tool": "set_var", "target": "HOOK", "outcome": "ok", "value": "https://secret"}
```

`schema/fixtures/invalid/activity-record/bad-outcome.json`:

```json
{"ts": "2026-09-15T18:20:01.120Z", "tool": "set_var", "target": null, "outcome": "failed"}
```

In `crates/core/tests/schema_conformance.rs`, in `every_valid_fixture_data_dir_validates`, validate every line of `activity.jsonl` against `activity-record` when the file exists; add a test that a record written by `Store::append_activity` validates:

```rust
#[test]
fn activity_records_core_writes_conform() {
    let dir = tempfile::tempdir().unwrap();
    let store = hedgebuddy_core::Store::open(dir.path());
    let args = serde_json::json!({"app": "offshoot"});
    let rec = hedgebuddy_core::ActivityRecord::now(
        "run_app_command",
        hedgebuddy_core::activity_target(&args),
        hedgebuddy_core::ActivityOutcome::NeedsConfirmation,
    );
    store.append_activity(&rec).unwrap();
    let v = validator("activity-record");
    for line in std::fs::read_to_string(store.activity_path()).unwrap().lines() {
        assert_valid(&v, &serde_json::from_str(line).unwrap(), "activity line");
    }
}
```

Update the invalid-fixture count assertion if it counts exactly. Add a row to `schema/README.md`'s table (`activity-record.schema.json` | one line of `<data>/activity.jsonl`) and name `activity.jsonl` in the valid-fixture file list. The Python schema test picks up `fixtures/invalid/activity-record/` by itself.

In `crates/tools/src/resources.rs`, add `("activity-record", include_str!("../../../schema/activity-record.schema.json"))` to `SCHEMAS` (now 6) and update `resources_cover_catalog_schemas_and_docs` to expect 11.

- [ ] **Step 5: Failing tests for logging in the MCP server**

In `crates/tools/src/lib.rs` tests:

```rust
    #[test]
    fn outcomes_for_the_activity_log() {
        use hedgebuddy_core::ActivityOutcome;
        assert_eq!(activity_outcome(&Ok(json!({"active": "p"}))), ActivityOutcome::Ok);
        assert_eq!(activity_outcome(&Err(ToolError::new("nope"))), ActivityOutcome::Error);
        assert_eq!(
            activity_outcome(&Ok(json!({"executed": false, "requires_confirmation": ["addTransfers"]}))),
            ActivityOutcome::NeedsConfirmation
        );
    }
```

In `mcp_contract.rs`, after the `unknown` tool request:

```rust
    let log = std::fs::read_to_string(dir.path().join("activity.jsonl")).unwrap();
    assert!(!log.contains("https://hook"), "the activity log holds a value: {log}");
    let got: Vec<(String, Value, String)> = log
        .lines()
        .map(|l| {
            let r: Value = serde_json::from_str(l).unwrap();
            (r["tool"].as_str().unwrap().to_owned(), r["target"].clone(), r["outcome"].as_str().unwrap().to_owned())
        })
        .collect();
    assert_eq!(
        got,
        vec![
            ("create_profile".to_owned(), json!("p"), "ok".to_owned()),
            ("set_var".to_owned(), json!("HOOK"), "ok".to_owned()),
            ("list_vars".to_owned(), Value::Null, "ok".to_owned()),
            ("get_var".to_owned(), json!("NOPE"), "error".to_owned()),
        ]
    );
```

In `crates/cli/tests/cli.rs`:

```rust
#[test]
fn call_does_not_write_the_activity_log() {
    let dir = tempfile::tempdir().unwrap();
    assert_cmd::Command::cargo_bin("hedgebuddy")
        .unwrap()
        .env("HEDGEBUDDY_DATA_DIR", dir.path())
        .args(["call", "create_profile", r#"{"name":"p"}"#])
        .assert()
        .success();
    assert!(!dir.path().join("activity.jsonl").exists());
}
```

Run: `cargo test -p hedgebuddy-tools -p hedgebuddy-cli 2>&1 | tail -10`
Expected: FAIL (`activity_outcome` missing; no `activity.jsonl`).

- [ ] **Step 6: Log calls in the MCP server**

In `crates/tools/src/lib.rs`:

```rust
/// How a call ends up in the Claude activity log: an error, a
/// `run_app_command` that stopped for the operator's approval, or ok.
pub fn activity_outcome(result: &ToolResult) -> hedgebuddy_core::ActivityOutcome {
    use hedgebuddy_core::ActivityOutcome;
    match result {
        Err(_) => ActivityOutcome::Error,
        Ok(v) if v.get("requires_confirmation").is_some() => ActivityOutcome::NeedsConfirmation,
        Ok(_) => ActivityOutcome::Ok,
    }
}
```

In `crates/cli/src/mcp.rs` `call_tool`, replace the `spawn_blocking` block:

```rust
        let ctx = self.ctx.clone();
        // Only the name of what the call acts on is kept, never the arguments.
        let target = hedgebuddy_core::activity_target(&args);
        let result = tokio::task::spawn_blocking(move || {
            let result = tools::call(&ctx, &name, args);
            let record = hedgebuddy_core::ActivityRecord::now(&name, target, tools::activity_outcome(&result));
            if let Err(e) = ctx.store.append_activity(&record) {
                // stdout carries protocol messages only.
                eprintln!("hedgebuddy: cannot record Claude activity: {e}");
            }
            result
        })
        .await
        .map_err(|e| McpError::internal_error(format!("tool panicked: {e}"), None))?;
```

Add a sentence to the module doc of `mcp.rs`: the server appends each call to the Claude activity log.

- [ ] **Step 7: Run everything**

Run: `cargo test --workspace 2>&1 | tail -15 && (cd python && uv run pytest -q 2>&1 | tail -3)`
Expected: PASS.

Run: `cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add crates schema
git commit -m "feat: Claude activity log written by the MCP server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Preferences

**Files:**
- Create: `crates/core/src/preferences.rs`, `schema/preferences.schema.json`, `schema/fixtures/valid/basic/preferences.json`, `schema/fixtures/invalid/preferences/unknown-key.json`, `schema/fixtures/invalid/preferences/wrong-version.json`
- Modify: `crates/core/src/lib.rs`, `crates/core/tests/schema_conformance.rs`, `crates/tools/src/resources.rs`, `schema/README.md`

**Interfaces:**
- Produces: `pub struct Preferences { pub version: u32, pub last_opened: Option<String>, pub editor_command: Option<String> }` (`Default` = version 1, nulls), `pub struct PreferencesPatch { pub last_opened: Option<Option<String>>, pub editor_command: Option<Option<String>> }` (a missing key leaves a field alone, `null` clears it), `Store::preferences_path()`, `Store::preferences() -> Result<Preferences>`, `Store::update_preferences(&PreferencesPatch) -> Result<Preferences>`. Both types derive `JsonSchema`. The caller of `update_preferences` holds the write lock.

- [ ] **Step 1: Write the failing tests**

`crates/core/src/preferences.rs`, tests first:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::CoreError;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("HedgeBuddy"));
        (dir, store)
    }

    #[test]
    fn a_missing_file_reads_as_the_defaults() {
        let (_d, store) = temp_store();
        assert_eq!(store.preferences().unwrap(), Preferences { version: 1, last_opened: None, editor_command: None });
        assert!(!store.preferences_path().exists());
    }

    #[test]
    fn a_patch_changes_only_the_keys_it_names() {
        let (_d, store) = temp_store();
        let set: PreferencesPatch = serde_json::from_str(r#"{"editor_command": "code -n"}"#).unwrap();
        store.update_preferences(&set).unwrap();
        let opened: PreferencesPatch = serde_json::from_str(r#"{"last_opened": "2026-09-23T10:00:00.000Z"}"#).unwrap();
        let prefs = store.update_preferences(&opened).unwrap();
        assert_eq!(prefs.editor_command.as_deref(), Some("code -n"));
        assert_eq!(prefs.last_opened.as_deref(), Some("2026-09-23T10:00:00.000Z"));
        let clear: PreferencesPatch = serde_json::from_str(r#"{"editor_command": null}"#).unwrap();
        let prefs = store.update_preferences(&clear).unwrap();
        assert_eq!(prefs.editor_command, None);
        assert_eq!(prefs.last_opened.as_deref(), Some("2026-09-23T10:00:00.000Z"));
        assert_eq!(store.preferences().unwrap(), prefs);
        let text = std::fs::read_to_string(store.preferences_path()).unwrap();
        assert!(text.starts_with("{\n  \"version\": 1,"), "{text}");
    }

    #[test]
    fn a_blank_editor_command_is_stored_as_none() {
        let (_d, store) = temp_store();
        let blank: PreferencesPatch = serde_json::from_str(r#"{"editor_command": "   "}"#).unwrap();
        assert_eq!(store.update_preferences(&blank).unwrap().editor_command, None);
    }

    #[test]
    fn unknown_keys_and_other_versions_are_rejected() {
        assert!(serde_json::from_str::<PreferencesPatch>(r#"{"theme": "light"}"#).is_err());
        let (_d, store) = temp_store();
        std::fs::create_dir_all(store.root()).unwrap();
        std::fs::write(store.preferences_path(), r#"{"version": 2, "last_opened": null, "editor_command": null}"#).unwrap();
        assert!(matches!(store.preferences(), Err(CoreError::Validation(_))));
    }
}
```

Add `pub mod preferences;` and `pub use preferences::{Preferences, PreferencesPatch};` to `lib.rs`.

Run: `cargo test -p hedgebuddy-core preferences 2>&1 | tail -5`
Expected: FAIL to compile.

- [ ] **Step 2: Implement preferences**

```rust
//! `<data>/preferences.json`: the desktop app's own settings.

use std::path::PathBuf;

use schemars::JsonSchema;
use serde::{Deserialize, Deserializer, Serialize};

use crate::error::{CoreError, Result};
use crate::fs_util;
use crate::store::Store;

/// Contents of `preferences.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Preferences {
    /// Storage format version; always 1.
    pub version: u32,
    /// When the app was last opened (UTC, RFC 3339), or null.
    pub last_opened: Option<String>,
    /// The command "Open in editor" runs, or null for the system default.
    pub editor_command: Option<String>,
}

impl Default for Preferences {
    fn default() -> Self {
        Preferences { version: 1, last_opened: None, editor_command: None }
    }
}

/// A change to [`Preferences`]: a key that is absent leaves its field
/// alone, `null` clears it, a value sets it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PreferencesPatch {
    /// When the app was last opened (UTC, RFC 3339), or null to clear.
    #[serde(default, deserialize_with = "present")]
    #[schemars(with = "Option<String>")]
    pub last_opened: Option<Option<String>>,
    /// The editor command, or null for the system default.
    #[serde(default, deserialize_with = "present")]
    #[schemars(with = "Option<String>")]
    pub editor_command: Option<Option<String>>,
}

/// Deserialize a key that is present (possibly `null`) as `Some(..)`, so a
/// missing key (`#[serde(default)]`, `None`) differs from `null`.
fn present<'de, D, T>(d: D) -> std::result::Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(d).map(Some)
}

impl Store {
    /// `<root>/preferences.json`.
    pub fn preferences_path(&self) -> PathBuf {
        self.root().join("preferences.json")
    }

    /// Read the preferences; a missing file is the defaults.
    pub fn preferences(&self) -> Result<Preferences> {
        let prefs: Preferences = fs_util::read_json_or(&self.preferences_path(), Preferences::default())?;
        if prefs.version != 1 {
            return Err(CoreError::Validation(format!(
                "unsupported preferences.json version {} (expected 1)",
                prefs.version
            )));
        }
        Ok(prefs)
    }

    /// Apply `patch` and write the file atomically. A blank editor command
    /// is stored as null. The caller holds the data folder's write lock.
    pub fn update_preferences(&self, patch: &PreferencesPatch) -> Result<Preferences> {
        let mut prefs = self.preferences()?;
        if let Some(v) = &patch.last_opened {
            prefs.last_opened = v.clone();
        }
        if let Some(v) = &patch.editor_command {
            prefs.editor_command = v.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned);
        }
        fs_util::write_json_atomic(&self.preferences_path(), &prefs, false)?;
        Ok(prefs)
    }
}
```

Run: `cargo test -p hedgebuddy-core preferences 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 3: Schema, fixtures and conformance**

`schema/preferences.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/shakedex/hedgebuddy/schema/preferences.schema.json",
  "title": "HedgeBuddy desktop app preferences",
  "description": "<data>/preferences.json. A missing file means the defaults: version 1 and both fields null.",
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "last_opened", "editor_command"],
  "properties": {
    "version": { "const": 1 },
    "last_opened": { "type": ["string", "null"], "format": "date-time" },
    "editor_command": { "type": ["string", "null"], "minLength": 1 }
  }
}
```

`schema/fixtures/valid/basic/preferences.json`:

```json
{
  "version": 1,
  "last_opened": "2026-09-15T18:00:00.000Z",
  "editor_command": null
}
```

`schema/fixtures/invalid/preferences/unknown-key.json`: `{"version": 1, "last_opened": null, "editor_command": null, "theme": "light"}`
`schema/fixtures/invalid/preferences/wrong-version.json`: `{"version": 2, "last_opened": null, "editor_command": null}`

In `schema_conformance.rs`: validate `preferences.json` in valid data dirs when present, and add a test that a file written by `update_preferences` validates. Add the schema to `schema/README.md` and to `SCHEMAS` in `crates/tools/src/resources.rs` (now 7; the resources test expects 12).

- [ ] **Step 4: Run everything and commit**

Run: `cargo test --workspace 2>&1 | tail -10 && (cd python && uv run pytest -q 2>&1 | tail -3)`
Expected: PASS.

Run: `cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings`
Expected: clean.

```bash
git add crates schema
git commit -m "feat(core): desktop app preferences

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: App-only command logic: home summary, activity, preferences, session start

Plain functions over `Context`, tested with `FakeHost`. The Tauri crate (Task 10) only wraps them. They are never registered as tools.

**Files:**
- Create: `crates/tools/src/app/mod.rs`, `crates/tools/src/app/home.rs`, `crates/tools/examples/app_schemas.rs`
- Modify: `crates/tools/Cargo.toml` (move `jiff = "0.2"` from dev-dependencies to dependencies), `crates/tools/src/lib.rs` (`pub mod app;`)

**Interfaces:**
- Consumes: `Context::write_guard`, `ToolError::is_busy` (Task 4); `ActivityRecord`, `ACTIVITY_KEEP`, `Store::read_activity` (Task 7); `Preferences`, `PreferencesPatch`, `Store::{preferences, update_preferences}` (Task 8); `now_rfc3339` (Task 7); `check_requirements` via `Store::check_script` (Task 5).
- Produces (`hedgebuddy_tools::app`):
  - `pub struct AppCommandDef { pub name: &'static str, pub input: fn() -> Value, pub output: fn() -> Value }`, `pub fn commands() -> Vec<AppCommandDef>`, `pub fn schemas() -> Value` (`{"<command>": {"input", "output"}}`).
  - `pub const PYTHON_CACHE_TTL: Duration` (60 s), `pub struct PythonCache` with `new(ttl)`, `Default`, `get(&self, host: &dyn Host) -> Result<Option<PythonInfo>, ToolError>`.
  - `pub struct SessionStart { pub since: Option<String>, pub warning: Option<String> }`, `pub fn start_session(ctx: &Context) -> SessionStart`.
  - `pub struct ActivityArgs { pub limit: Option<usize> }`, `pub struct ActivityList { pub records: Vec<ActivityRecord> }`, `pub fn activity(ctx, ActivityArgs) -> Result<ActivityList, ToolError>`.
  - `pub fn preferences_get(ctx, NoParams) -> Result<Preferences, ToolError>`, `pub fn preferences_set(ctx, PreferencesPatch) -> Result<Preferences, ToolError>` (takes the write guard).
  - `home::{HomeSummary, HomeCounts, SidebarBadges, AttentionItem, VariableProblem, PythonStatus, home_summary}` re-exported from `app`; `pub fn home_summary(ctx: &Context, since: Option<&str>, python: &PythonCache) -> Result<HomeSummary, ToolError>`.
  - App command names in 5A: `home_summary`, `activity`, `preferences_get`, `preferences_set`.

- [ ] **Step 1: Write the registry, session, activity and preferences with their tests**

`crates/tools/src/app/mod.rs`:

```rust
//! Commands only the desktop app has. They are plain functions over a
//! [`Context`], tested with `FakeHost`; the Tauri crate wraps each one. None
//! of them is ever registered as a tool, so no MCP client can reach them.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use hedgebuddy_core::python_env::{self, PythonInfo};
use hedgebuddy_core::{now_rfc3339, ActivityRecord, Host, Preferences, PreferencesPatch, ACTIVITY_KEEP};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{output_schema_of, schema_of, Context, NoParams, ToolError};

mod home;

pub use home::{
    home_summary, AttentionItem, HomeCounts, HomeSummary, PythonStatus, SidebarBadges, VariableProblem,
};

/// One app-only command's name and schemas (for the generated TypeScript).
pub struct AppCommandDef {
    /// The Tauri command name.
    pub name: &'static str,
    /// JSON Schema of its `args`.
    pub input: fn() -> Value,
    /// JSON Schema of its result.
    pub output: fn() -> Value,
}

macro_rules! app_command {
    ($name:literal, $input:ty, $output:ty) => {
        AppCommandDef {
            name: $name,
            input: || schema_of::<$input>(),
            output: || output_schema_of::<$output>(),
        }
    };
}

/// Every app-only command.
pub fn commands() -> Vec<AppCommandDef> {
    vec![
        app_command!("home_summary", NoParams, HomeSummary),
        app_command!("activity", ActivityArgs, ActivityList),
        app_command!("preferences_get", NoParams, Preferences),
        app_command!("preferences_set", PreferencesPatch, Preferences),
    ]
}

/// Every app-only command's schemas: `{"<command>": {"input", "output"}}`.
pub fn schemas() -> Value {
    let map: serde_json::Map<String, Value> = commands()
        .into_iter()
        .map(|c| (c.name.to_owned(), json!({ "input": (c.input)(), "output": (c.output)() })))
        .collect();
    Value::Object(map)
}

/// How long the Python check behind `home_summary` is reused.
pub const PYTHON_CACHE_TTL: Duration = Duration::from_secs(60);

/// The Python the Hedge apps use, probed at most once per `ttl`: starting
/// Python costs tens to hundreds of milliseconds, and Home asks often.
pub struct PythonCache {
    ttl: Duration,
    slot: Mutex<Option<(Instant, Option<PythonInfo>)>>,
}

impl PythonCache {
    /// A cache that probes again after `ttl`.
    pub fn new(ttl: Duration) -> PythonCache {
        PythonCache { ttl, slot: Mutex::new(None) }
    }

    /// The cached probe, or a fresh one when it is older than the ttl.
    pub fn get(&self, host: &dyn Host) -> Result<Option<PythonInfo>, ToolError> {
        let mut slot = self.slot.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((at, info)) = slot.as_ref() {
            if at.elapsed() < self.ttl {
                return Ok(info.clone());
            }
        }
        let info = python_env::find_python(host)?;
        *slot = Some((Instant::now(), info.clone()));
        Ok(info)
    }
}

impl Default for PythonCache {
    fn default() -> Self {
        PythonCache::new(PYTHON_CACHE_TTL)
    }
}

/// What starting an app session found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionStart {
    /// `last_opened` as stored before this session: the session's "since".
    pub since: Option<String>,
    /// Why the new `last_opened` could not be read or stored, if so.
    pub warning: Option<String>,
}

/// Start an app session: keep the stored `last_opened` for this session's
/// "since you last opened" figures, then store now. A busy lock or an
/// unreadable file never stops the app from starting.
pub fn start_session(ctx: &Context) -> SessionStart {
    let (since, mut warning) = match ctx.store.preferences() {
        Ok(p) => (p.last_opened, None),
        Err(e) => (None, Some(e.to_string())),
    };
    let stored = ctx.write_guard().and_then(|_guard| {
        let now = PreferencesPatch { last_opened: Some(Some(now_rfc3339())), editor_command: None };
        ctx.store.update_preferences(&now).map_err(ToolError::from)
    });
    if let Err(e) = stored {
        warning.get_or_insert(e.0);
    }
    SessionStart { since, warning }
}

/// Arguments of `activity`.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ActivityArgs {
    /// How many records, newest first (default and maximum 200).
    #[serde(default)]
    pub limit: Option<usize>,
}

/// Result of `activity`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ActivityList {
    /// Claude's latest tool calls, newest first.
    pub records: Vec<ActivityRecord>,
}

/// The latest Claude activity records, newest first.
pub fn activity(ctx: &Context, args: ActivityArgs) -> Result<ActivityList, ToolError> {
    let limit = args.limit.unwrap_or(ACTIVITY_KEEP).min(ACTIVITY_KEEP);
    Ok(ActivityList { records: ctx.store.read_activity(limit)? })
}

/// The app's preferences.
pub fn preferences_get(ctx: &Context, _: NoParams) -> Result<Preferences, ToolError> {
    Ok(ctx.store.preferences()?)
}

/// Change the app's preferences under the write lock.
pub fn preferences_set(ctx: &Context, patch: PreferencesPatch) -> Result<Preferences, ToolError> {
    let _guard = ctx.write_guard()?;
    Ok(ctx.store.update_preferences(&patch)?)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::time::Duration;

    use hedgebuddy_core::{ActivityOutcome, FakeHost, Os, Store};

    use super::*;
    use crate::test_ctx;

    #[test]
    fn app_commands_are_never_tools_and_have_object_schemas() {
        let tools: BTreeSet<&str> = crate::all().iter().map(|t| t.name).collect();
        for c in commands() {
            assert!(!tools.contains(c.name), "{} is also a tool", c.name);
            assert_eq!((c.input)()["type"], "object", "{}", c.name);
            assert_eq!((c.output)()["type"], "object", "{}", c.name);
        }
        assert_eq!(schemas().as_object().unwrap().len(), commands().len());
    }

    #[test]
    fn a_session_returns_the_previous_open_and_stores_now() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let first = start_session(&ctx);
        assert_eq!(first, SessionStart { since: None, warning: None });
        let stored = ctx.store.preferences().unwrap().last_opened.unwrap();
        let second = start_session(&ctx);
        assert_eq!(second.since.as_deref(), Some(stored.as_str()));
    }

    #[test]
    fn a_busy_lock_does_not_stop_a_session() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let ctx = ctx.with_lock_timeout(Duration::from_millis(100));
        let _held = Store::open(ctx.store.root()).lock().unwrap();
        let s = start_session(&ctx);
        assert_eq!(s.since, None);
        assert_eq!(s.warning.as_deref(), Some(hedgebuddy_core::BUSY_MESSAGE));
    }

    #[test]
    fn activity_is_newest_first_and_capped() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        for tool in ["a", "b"] {
            ctx.store.append_activity(&ActivityRecord::now(tool, None, ActivityOutcome::Ok)).unwrap();
        }
        let got = activity(&ctx, ActivityArgs { limit: Some(1) }).unwrap();
        assert_eq!(got.records.len(), 1);
        assert_eq!(got.records[0].tool, "b");
        assert_eq!(activity(&ctx, ActivityArgs::default()).unwrap().records.len(), 2);
    }

    #[test]
    fn preferences_round_trip_and_writes_wait_for_the_lock() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let ctx = ctx.with_lock_timeout(Duration::from_millis(100));
        let patch: PreferencesPatch = serde_json::from_str(r#"{"editor_command": "code"}"#).unwrap();
        assert_eq!(preferences_set(&ctx, patch.clone()).unwrap().editor_command.as_deref(), Some("code"));
        assert_eq!(preferences_get(&ctx, NoParams {}).unwrap().editor_command.as_deref(), Some("code"));
        let _held = Store::open(ctx.store.root()).lock().unwrap();
        assert!(preferences_set(&ctx, patch).unwrap_err().is_busy());
    }

    #[test]
    fn the_python_probe_is_cached() {
        let (_d, fake, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let cache = PythonCache::new(Duration::from_secs(60));
        assert_eq!(cache.get(ctx.hedge.host()).unwrap(), None);
        assert_eq!(cache.get(ctx.hedge.host()).unwrap(), None);
        assert_eq!(fake.runs().len(), 1, "{:?}", fake.runs());
        let fresh = PythonCache::new(Duration::ZERO);
        fresh.get(ctx.hedge.host()).unwrap();
        fresh.get(ctx.hedge.host()).unwrap();
        assert_eq!(fake.runs().len(), 3);
    }
}
```

(`FakeHost::runs()` lists the commands the fake was asked to run; confirm it records calls that have no canned response. If it does not, register a failing `with_run_response` for the probe.)

- [ ] **Step 2: Write the home summary with its tests**

`crates/tools/src/app/home.rs`:

```rust
//! Everything Home and the sidebar badges show, in one call (spec §6.1).

use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;

use hedgebuddy_core::hedge::{managed_script, AttachState};
use hedgebuddy_core::python_env::{self, PythonInfo};
use hedgebuddy_core::{ActivityRecord, RequirementIssue, Run, RunFilter, RunStatus, VarType};
use jiff::Timestamp;
use schemars::JsonSchema;
use serde::Serialize;

use super::PythonCache;
use crate::{Context, ToolError};

/// How many recent runs Home lists.
pub const RECENT_RUNS: usize = 5;
/// How many Claude calls Home lists.
pub const RECENT_ACTIVITY: usize = 3;
/// Failed runs listed one by one before the rest are summed up.
pub const FAILED_RUNS_LISTED: usize = 3;

/// Result of `home_summary`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct HomeSummary {
    /// When the app was opened before this session (UTC, RFC 3339), or null
    /// on the first launch. Counts cover the runs since then, or every kept
    /// run (30 days) when null.
    pub since: Option<String>,
    /// The active profile, or null when there is none.
    pub active_profile: Option<String>,
    /// Every profile name.
    pub profiles: Vec<String>,
    /// The four numbers at the top of Home.
    pub counts: HomeCounts,
    /// Counts for the sidebar badges.
    pub badges: SidebarBadges,
    /// Problems, most serious first, each linking to where it gets fixed.
    pub attention: Vec<AttentionItem>,
    /// The latest runs across all profiles, newest first.
    pub recent_runs: Vec<Run>,
    /// Claude's latest tool calls, newest first.
    pub recent_activity: Vec<ActivityRecord>,
    /// The Python the Hedge apps use.
    pub python: PythonStatus,
}

/// The numbers at the top of Home.
#[derive(Debug, Serialize, JsonSchema)]
pub struct HomeCounts {
    /// Runs started since `since`, across all profiles.
    pub runs_since: usize,
    /// Of those, the runs that failed (status `failed` or `error`).
    pub failed_since: usize,
    /// The active profile's scripts attached to (or staged for) an app event.
    pub scripts_attached: usize,
    /// The active profile's variables.
    pub variables: usize,
}

/// Counts for the sidebar badges.
#[derive(Debug, Serialize, JsonSchema)]
pub struct SidebarBadges {
    /// Runs: failures since the last open.
    pub runs: usize,
    /// Variables: required variables missing or of the wrong type.
    pub variables: usize,
    /// Hedge apps: events pointing at deleted scripts.
    pub apps: usize,
    /// Settings: package problems (0 or 1).
    pub settings: usize,
}

/// What is wrong with a required variable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum VariableProblem {
    /// The profile has no value for it.
    Missing,
    /// The profile declares another type.
    TypeMismatch,
}

/// One row of "Needs attention".
#[derive(Debug, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AttentionItem {
    /// A run that failed since the last open.
    RunFailed {
        /// Run id (links to `#/runs/<id>`).
        run_id: String,
        /// Script file name.
        script: String,
        /// The profile it ran with.
        profile: String,
        /// When it started (UTC, RFC 3339).
        started_at: String,
    },
    /// Failed runs beyond the ones listed.
    MoreFailedRuns {
        /// How many more.
        count: usize,
    },
    /// A variable the active profile's scripts require is missing or has
    /// the wrong type.
    VariableIssue {
        /// Variable name.
        name: String,
        /// The type the scripts require.
        #[serde(rename = "type")]
        ty: VarType,
        /// Missing or the wrong type.
        problem: VariableProblem,
        /// The type the profile declares, for a type mismatch.
        actual: Option<VarType>,
        /// The scripts that require it.
        scripts: Vec<String>,
    },
    /// App events that point at deleted scripts.
    StaleEntries {
        /// Catalog app id.
        app: String,
        /// The app's display name.
        app_name: String,
        /// How many events.
        count: usize,
    },
    /// The Python the Hedge apps use cannot import this `hedgebuddy`.
    PackageProblem {
        /// Whether Python was found at all.
        python_found: bool,
        /// The installed `hedgebuddy` version, if any.
        installed: Option<String>,
        /// The version this HedgeBuddy needs.
        required: String,
    },
    /// An installed app is newer than the version HedgeBuddy was tested with.
    AppNewer {
        /// Catalog app id.
        app: String,
        /// The app's display name.
        app_name: String,
        /// Installed version.
        version: String,
        /// The version HedgeBuddy was tested with.
        tested_against: String,
    },
    /// Scripting is turned off in an app that has scripts attached.
    ScriptingOff {
        /// Catalog app id.
        app: String,
        /// The app's display name.
        app_name: String,
        /// How many of its events have a script attached.
        events: usize,
    },
}

/// The Python the Hedge apps use, for Home and Settings.
#[derive(Debug, Serialize, JsonSchema)]
pub struct PythonStatus {
    /// Whether an interpreter was found.
    pub found: bool,
    /// Its path.
    pub executable: Option<PathBuf>,
    /// Its version.
    pub version: Option<String>,
    /// The `hedgebuddy` version installed there, if any.
    pub installed: Option<String>,
    /// The version this HedgeBuddy needs.
    pub required: String,
    /// What is wrong, in one sentence, or null.
    pub problem: Option<String>,
}

/// Everything Home shows. `since` is the session's stored `last_opened`.
pub fn home_summary(ctx: &Context, since: Option<&str>, python: &PythonCache) -> Result<HomeSummary, ToolError> {
    let since_ts = since.and_then(|s| s.parse::<Timestamp>().ok());
    let active = ctx.store.active_profile_name()?;
    let profiles = ctx.store.list_profiles()?;

    let runs = ctx.store.list_recent_runs(&RunFilter::default())?;
    let new_runs: Vec<&Run> = runs.iter().filter(|r| started_after(&r.started_at, since_ts.as_ref())).collect();
    let failed: Vec<&Run> = new_runs.iter().copied().filter(|r| is_failure(r)).collect();

    let mut attention = Vec::new();
    for run in failed.iter().take(FAILED_RUNS_LISTED) {
        attention.push(AttentionItem::RunFailed {
            run_id: run.run_id.clone(),
            script: run.script.clone(),
            profile: run.profile.clone(),
            started_at: run.started_at.clone(),
        });
    }
    if failed.len() > FAILED_RUNS_LISTED {
        attention.push(AttentionItem::MoreFailedRuns { count: failed.len() - FAILED_RUNS_LISTED });
    }

    let (variables, variable_items) = match &active {
        Some(p) => (ctx.store.load_profile(p)?.variables.len(), variable_issues(ctx, p)?),
        None => (0, Vec::new()),
    };
    let variable_badge = variable_items.len();
    attention.extend(variable_items);

    let mut stale_total = 0;
    let mut attached = BTreeSet::new();
    let mut app_items = Vec::new();
    for status in ctx.hedge.apps()? {
        let Ok(events) = ctx.hedge.attachments(&status.id, &ctx.store) else {
            continue;
        };
        let mut stale = 0;
        let mut in_use = 0;
        for e in &events {
            match &e.state {
                AttachState::Stale { .. } => stale += 1,
                AttachState::Attached { profile, script, .. } => {
                    in_use += 1;
                    if active.as_deref() == Some(profile.as_str()) {
                        attached.insert(script.clone());
                    }
                }
                AttachState::Staged { path, .. } => {
                    in_use += 1;
                    if let Some((profile, script)) = managed_script(&ctx.store, path) {
                        if active.as_deref() == Some(profile.as_str()) {
                            attached.insert(script);
                        }
                    }
                }
                AttachState::External { .. } => in_use += 1,
                _ => {}
            }
        }
        if stale > 0 {
            stale_total += stale;
            app_items.push(AttentionItem::StaleEntries { app: status.id.clone(), app_name: status.name.clone(), count: stale });
        }
        if status.installed && status.newer_than_tested {
            if let Some(version) = &status.version {
                app_items.push(AttentionItem::AppNewer {
                    app: status.id.clone(),
                    app_name: status.name.clone(),
                    version: version.clone(),
                    tested_against: status.tested_against.clone(),
                });
            }
        }
        if status.scripting_enabled == Some(false) && in_use > 0 {
            app_items.push(AttentionItem::ScriptingOff { app: status.id.clone(), app_name: status.name.clone(), events: in_use });
        }
    }

    let python = python_status(python.get(ctx.hedge.host())?);
    if python.problem.is_some() {
        attention.push(AttentionItem::PackageProblem {
            python_found: python.found,
            installed: python.installed.clone(),
            required: python.required.clone(),
        });
    }
    // Stale entries before the package, the rest after (spec §6.1 order).
    let (stale_items, other_app_items): (Vec<_>, Vec<_>) =
        app_items.into_iter().partition(|i| matches!(i, AttentionItem::StaleEntries { .. }));
    let package_at = attention.len() - usize::from(python.problem.is_some());
    attention.splice(package_at..package_at, stale_items);
    attention.extend(other_app_items);

    Ok(HomeSummary {
        since: since.filter(|_| since_ts.is_some()).map(str::to_owned),
        active_profile: active,
        profiles,
        counts: HomeCounts {
            runs_since: new_runs.len(),
            failed_since: failed.len(),
            scripts_attached: attached.len(),
            variables,
        },
        badges: SidebarBadges {
            runs: failed.len(),
            variables: variable_badge,
            apps: stale_total,
            settings: usize::from(python.problem.is_some()),
        },
        attention,
        recent_runs: runs.iter().take(RECENT_RUNS).cloned().collect(),
        recent_activity: ctx.store.read_activity(RECENT_ACTIVITY)?,
        python,
    })
}

/// Whether a run started after `since` (every run counts when `since` is
/// `None`; a timestamp that does not parse never counts).
fn started_after(started_at: &str, since: Option<&Timestamp>) -> bool {
    match since {
        None => true,
        Some(since) => started_at.parse::<Timestamp>().map(|t| t > *since).unwrap_or(false),
    }
}

fn is_failure(run: &Run) -> bool {
    matches!(run.status, Some(RunStatus::Failed | RunStatus::Error))
}

/// The active profile's unmet requirements, one item per variable.
fn variable_issues(ctx: &Context, profile: &str) -> Result<Vec<AttentionItem>, ToolError> {
    let mut by_name: BTreeMap<String, (VarType, VariableProblem, Option<VarType>, Vec<String>)> = BTreeMap::new();
    for info in ctx.store.list_scripts(profile)? {
        if info.manifest.is_none() {
            continue;
        }
        let Ok(check) = ctx.store.check_script(profile, &info.name) else {
            continue;
        };
        for issue in check.issues {
            let (name, ty, problem, actual) = match issue {
                RequirementIssue::Missing { name, ty } => (name, ty, VariableProblem::Missing, None),
                RequirementIssue::TypeMismatch { name, expected, actual } => {
                    (name, expected, VariableProblem::TypeMismatch, Some(actual))
                }
            };
            by_name.entry(name).or_insert((ty, problem, actual, Vec::new())).3.push(info.name.clone());
        }
    }
    Ok(by_name
        .into_iter()
        .map(|(name, (ty, problem, actual, scripts))| AttentionItem::VariableIssue { name, ty, problem, actual, scripts })
        .collect())
}

fn python_status(info: Option<PythonInfo>) -> PythonStatus {
    let required = env!("CARGO_PKG_VERSION").to_owned();
    match info {
        None => PythonStatus {
            found: false,
            executable: None,
            version: None,
            installed: None,
            problem: Some("Python 3 was not found; the Hedge apps need it to run scripts".to_owned()),
            required,
        },
        Some(info) => {
            let problem = python_env::package_problem(&info, &required);
            PythonStatus {
                found: true,
                executable: Some(info.executable),
                version: Some(info.version),
                installed: info.hedgebuddy,
                required,
                problem,
            }
        }
    }
}
```

The attention order is: failed runs, "more failed runs", variables, stale entries, package problem, newer apps, scripting off. (Simplify the splice if you build the list in that order directly; the order is what the test checks.)

Tests at the bottom of `home.rs`:

```rust
#[cfg(test)]
mod tests {
    use hedgebuddy_core::host::{CommandOutput, RegValue};
    use hedgebuddy_core::python_env::PROBE;
    use hedgebuddy_core::{ActivityOutcome, FakeHost, Os};
    use jiff::{Span, Timestamp};
    use serde_json::json;

    use super::*;
    use crate::app::PythonCache;
    use crate::{call, test_ctx};

    const KEY: &str = "HKCU\\Software\\Hedge";
    const COPY: &str = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\", \"requires\": {\"CLIENT_EMAIL\": {\"type\": \"string\"}}}\n---\n\"\"\"\n";

    fn with_python(host: FakeHost, package: Option<&str>) -> FakeHost {
        let pkg = package.map(|v| format!("\"{v}\"")).unwrap_or_else(|| "null".into());
        host.with_run_response(
            "py",
            &["-3", "-c", PROBE],
            CommandOutput {
                status: 0,
                stdout: format!("{{\"executable\": \"C:\\\\Py\\\\python.exe\", \"version\": \"3.13.5\", \"hedgebuddy\": {pkg}}}\n"),
                stderr: String::new(),
            },
        )
    }

    fn ts(offset: Span) -> String {
        Timestamp::now().checked_add(offset).unwrap().to_string()
    }

    fn write_runs(ctx: &Context, lines: &[String]) {
        let today = jiff::Zoned::now().date().to_string();
        std::fs::create_dir_all(ctx.store.runs_dir()).unwrap();
        std::fs::write(ctx.store.runs_dir().join(format!("{today}.jsonl")), lines.join("\n") + "\n").unwrap();
    }

    fn start(id: &str, at: &str, profile: &str) -> String {
        format!(r#"{{"ts":"{at}","run_id":"{id}","phase":"start","app":"offshoot","event":"FileCopyCompleted","script":"copy.py","profile":"{profile}"}}"#)
    }

    fn end(id: &str, at: &str, status: &str) -> String {
        let code = if status == "ok" { 0 } else { 1 };
        format!(r#"{{"ts":"{at}","run_id":"{id}","phase":"end","status":"{status}","exit_code":{code}}}"#)
    }

    fn kinds(s: &HomeSummary) -> Vec<String> {
        s.attention.iter().map(|i| serde_json::to_value(i).unwrap()["kind"].as_str().unwrap().to_owned()).collect()
    }

    #[test]
    fn a_fresh_install_shows_no_profile_and_the_missing_python() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let s = home_summary(&ctx, None, &PythonCache::default()).unwrap();
        assert_eq!(s.active_profile, None);
        assert!(s.profiles.is_empty());
        assert_eq!((s.counts.runs_since, s.counts.failed_since, s.counts.scripts_attached, s.counts.variables), (0, 0, 0, 0));
        assert_eq!(kinds(&s), ["package_problem"]);
        assert!(!s.python.found);
        assert_eq!(s.badges.settings, 1);
        assert_eq!(s.since, None);
    }

    #[test]
    fn a_healthy_setup_needs_no_attention() {
        let host = with_python(
            FakeHost::new(Os::Windows)
                .with_registry_value(KEY, "BuildVersion", RegValue::String("26.1 (1023)".into()))
                .with_registry_value(KEY, "EventScriptAllowScripting", RegValue::Dword(1)),
            Some(env!("CARGO_PKG_VERSION")),
        );
        let (_d, _f, ctx) = test_ctx(host);
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        call(&ctx, "set_var", json!({"name": "CLIENT_EMAIL", "type": "string", "value": "a@b.c"})).unwrap();
        call(&ctx, "write_script", json!({"name": "copy.py", "source": COPY})).unwrap();
        call(&ctx, "attach_script", json!({"name": "copy.py"})).unwrap();
        write_runs(&ctx, &[start("a", &ts(Span::new().minutes(-5)), "p"), end("a", &ts(Span::new().minutes(-5)), "ok")]);
        let s = home_summary(&ctx, None, &PythonCache::default()).unwrap();
        assert!(s.attention.is_empty(), "{:?}", s.attention);
        assert_eq!((s.counts.runs_since, s.counts.failed_since, s.counts.scripts_attached, s.counts.variables), (1, 0, 1, 1));
        assert_eq!(s.recent_runs.len(), 1);
        assert_eq!(s.python.installed.as_deref(), Some(env!("CARGO_PKG_VERSION")));
        assert_eq!((s.badges.runs, s.badges.variables, s.badges.apps, s.badges.settings), (0, 0, 0, 0));
    }

    #[test]
    fn problems_are_listed_in_order_and_counted_since_the_last_open() {
        let gone = "E:\\gone\\old.py";
        let host = with_python(
            FakeHost::new(Os::Windows)
                .with_registry_value(KEY, "BuildVersion", RegValue::String("27.0 (1)".into()))
                .with_registry_value(KEY, "EventScriptDiskAdded", RegValue::String(gone.into())),
            Some("0.10.0"),
        );
        let (_d, _f, ctx) = test_ctx(host);
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        call(&ctx, "write_script", json!({"name": "copy.py", "source": COPY})).unwrap();
        let since = ts(Span::new().hours(-1));
        write_runs(
            &ctx,
            &[
                start("old", &ts(Span::new().hours(-2)), "p"),
                end("old", &ts(Span::new().hours(-2)), "failed"),
                start("new", &ts(Span::new().minutes(-10)), "other"),
                end("new", &ts(Span::new().minutes(-10)), "error"),
                start("ok", &ts(Span::new().minutes(-5)), "p"),
                end("ok", &ts(Span::new().minutes(-5)), "ok"),
            ],
        );
        ctx.store.append_activity(&ActivityRecord::now("list_runs", None, ActivityOutcome::Ok)).unwrap();
        let s = home_summary(&ctx, Some(&since), &PythonCache::default()).unwrap();
        assert_eq!(s.since.as_deref(), Some(since.as_str()));
        assert_eq!((s.counts.runs_since, s.counts.failed_since), (2, 1));
        assert_eq!(kinds(&s), ["run_failed", "variable_issue", "stale_entries", "package_problem", "app_newer"]);
        let first = serde_json::to_value(&s.attention[0]).unwrap();
        assert_eq!(first["run_id"], "new");
        assert_eq!(first["profile"], "other");
        let var = serde_json::to_value(&s.attention[1]).unwrap();
        assert_eq!(var, json!({"kind": "variable_issue", "name": "CLIENT_EMAIL", "type": "string", "problem": "missing", "actual": null, "scripts": ["copy.py"]}));
        assert_eq!((s.badges.runs, s.badges.variables, s.badges.apps, s.badges.settings), (1, 1, 1, 1));
        assert_eq!(s.recent_runs.len(), 3);
        assert_eq!(s.recent_activity.len(), 1);
    }

    #[test]
    fn many_failures_are_summed_up() {
        let (_d, _f, ctx) = test_ctx(with_python(FakeHost::new(Os::Windows), Some(env!("CARGO_PKG_VERSION"))));
        let lines: Vec<String> = (0..5)
            .flat_map(|i| {
                let at = ts(Span::new().minutes(-(i + 1)));
                [start(&format!("r{i}"), &at, "p"), end(&format!("r{i}"), &at, "failed")]
            })
            .collect();
        write_runs(&ctx, &lines);
        let s = home_summary(&ctx, None, &PythonCache::default()).unwrap();
        assert_eq!(kinds(&s), ["run_failed", "run_failed", "run_failed", "more_failed_runs"]);
        assert_eq!(serde_json::to_value(&s.attention[3]).unwrap()["count"], 2);
    }

    #[test]
    fn scripting_off_with_something_attached_is_flagged() {
        let own = tempfile::NamedTempFile::new().unwrap();
        let host = with_python(
            FakeHost::new(Os::Windows)
                .with_registry_value(KEY, "BuildVersion", RegValue::String("26.1 (1023)".into()))
                .with_registry_value(KEY, "EventScriptDiskAdded", RegValue::String(own.path().display().to_string())),
            Some(env!("CARGO_PKG_VERSION")),
        );
        let (_d, _f, ctx) = test_ctx(host);
        let s = home_summary(&ctx, None, &PythonCache::default()).unwrap();
        assert_eq!(kinds(&s), ["scripting_off"]);
        assert_eq!(serde_json::to_value(&s.attention[0]).unwrap()["events"], 1);
    }
}
```

(Registry value names follow the catalog; `EventScriptDiskAdded` is OffShoot's DiskAdded entry. If the FakeHost setup for "installed but scripting off" differs, follow `crates/core/src/hedge/apps.rs` tests: `BuildVersion` without `EventScriptAllowScripting` reads as scripting off.)

- [ ] **Step 3: The schemas example**

`crates/tools/examples/app_schemas.rs`:

```rust
//! Prints every app-only command's input and output JSON Schema as
//! `{command: {input, output}}`, for `crates/app/ui/scripts/gen-tools.ts`.

fn main() {
    println!(
        "{}",
        serde_json::to_string_pretty(&hedgebuddy_tools::app::schemas()).expect("schemas serialize")
    );
}
```

- [ ] **Step 4: Run everything**

Run: `cargo test -p hedgebuddy-tools app 2>&1 | tail -15 && cargo run -q -p hedgebuddy-tools --example app_schemas | head -5`
Expected: PASS; the example prints JSON starting with `{` and `"activity": {`.

Run: `cargo test --workspace && cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add crates/tools Cargo.lock
git commit -m "feat(tools): app-only commands: home summary, activity, preferences, session start

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Tauri backend: state, commands, watcher, CSP, platform floors

**Files:**
- Create: `crates/app/src/state.rs`, `crates/app/src/commands.rs`, `crates/app/src/watcher.rs`
- Modify: `crates/app/Cargo.toml`, `crates/app/src/lib.rs`, `crates/app/tauri.conf.json`, `crates/app/capabilities/default.json`, `crates/app/ui/vite.config.ts`

**Interfaces:**
- Consumes: `hedgebuddy_tools::{call, Context, NoParams, ToolError}`, `hedgebuddy_tools::app::*` (Task 9), `hedgebuddy_core::{watch_batched, categories, BATCH_WINDOW, WatchHandle}` (Task 6).
- Produces (the contract the UI relies on):
  - Commands, each taking one argument named `args` except `tool`: `tool(name: string, args: object)`, `home_summary(args: {})`, `activity(args: {limit?})`, `preferences_get(args: {})`, `preferences_set(args: PreferencesPatch)`.
  - Every command rejects with `{ "kind": "busy" | "error", "message": string }`.
  - Event `data-changed` with payload `{ "categories": string[] }`.

- [ ] **Step 1: Dependencies**

`crates/app/Cargo.toml` `[dependencies]`: add `hedgebuddy-tools = { workspace = true }`. Keep `tauri`, `serde`, `serde_json`, `hedgebuddy-core`.

- [ ] **Step 2: Write the failing error-mapping test**

`crates/app/src/commands.rs`, test module:

```rust
#[cfg(test)]
mod tests {
    use hedgebuddy_tools::ToolError;

    use super::CommandError;

    #[test]
    fn busy_errors_are_marked_so_the_ui_can_offer_try_again() {
        let busy = CommandError::from(ToolError::new(hedgebuddy_core::BUSY_MESSAGE));
        assert_eq!(
            serde_json::to_value(&busy).unwrap(),
            serde_json::json!({"kind": "busy", "message": hedgebuddy_core::BUSY_MESSAGE})
        );
        let other = CommandError::from(ToolError::new("profile 'x' not found"));
        assert_eq!(serde_json::to_value(&other).unwrap()["kind"], "error");
    }
}
```

Run: `cargo test -p hedgebuddy-app 2>&1 | tail -5`
Expected: FAIL to compile.

- [ ] **Step 3: State, commands and the watcher**

`crates/app/src/state.rs`:

```rust
//! What the app keeps for its whole run.

use std::sync::{Arc, Mutex};

use hedgebuddy_core::WatchHandle;
use hedgebuddy_tools::app::{start_session, PythonCache};
use hedgebuddy_tools::Context;

/// Managed Tauri state.
pub struct AppState {
    /// The tool context over the real machine and data folder.
    pub ctx: Arc<Context>,
    /// `last_opened` as stored before this session started.
    pub since: Option<String>,
    /// The Python check behind the home summary, reused for 60 seconds.
    pub python: Arc<PythonCache>,
    /// Keeps the data-folder watcher alive.
    pub watch: Mutex<Option<WatchHandle>>,
}

impl AppState {
    /// Open the data folder and start a session.
    pub fn open() -> Result<AppState, String> {
        let ctx = Arc::new(Context::real().map_err(|e| e.0)?);
        let session = start_session(&ctx);
        if let Some(warning) = &session.warning {
            eprintln!("hedgebuddy: could not record this launch: {warning}");
        }
        Ok(AppState {
            ctx,
            since: session.since,
            python: Arc::new(PythonCache::default()),
            watch: Mutex::new(None),
        })
    }
}
```

`crates/app/src/commands.rs`:

```rust
//! The commands the UI calls: the generic tool bridge and the app-only
//! commands. Each runs on a blocking thread; no logic lives here.

use hedgebuddy_core::{Preferences, PreferencesPatch};
use hedgebuddy_tools::app::{self, ActivityArgs, ActivityList, HomeSummary};
use hedgebuddy_tools::{NoParams, ToolError};
use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::state::AppState;

/// How a command fails, as the UI sees it.
#[derive(Debug, Serialize)]
pub struct CommandError {
    /// `busy` when another HedgeBuddy holds the data folder (the UI offers
    /// Try again), otherwise `error`.
    kind: &'static str,
    /// The message to show.
    message: String,
}

impl From<ToolError> for CommandError {
    fn from(e: ToolError) -> CommandError {
        let kind = if e.is_busy() { "busy" } else { "error" };
        CommandError { kind, message: e.0 }
    }
}

/// Run `f` on a blocking thread.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, ToolError> + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| CommandError { kind: "error", message: format!("the command stopped unexpectedly: {e}") })?
        .map_err(CommandError::from)
}

/// Run any tool, exactly as Claude and `hedgebuddy call` do. App calls are
/// not written to the Claude activity log.
#[tauri::command]
pub async fn tool(state: State<'_, AppState>, name: String, args: Value) -> Result<Value, CommandError> {
    let ctx = state.ctx.clone();
    blocking(move || hedgebuddy_tools::call(&ctx, &name, args)).await
}

/// Everything Home and the sidebar badges show.
#[tauri::command]
pub async fn home_summary(state: State<'_, AppState>, args: NoParams) -> Result<HomeSummary, CommandError> {
    let _ = args;
    let (ctx, since, python) = (state.ctx.clone(), state.since.clone(), state.python.clone());
    blocking(move || app::home_summary(&ctx, since.as_deref(), &python)).await
}

/// Claude's latest tool calls.
#[tauri::command]
pub async fn activity(state: State<'_, AppState>, args: ActivityArgs) -> Result<ActivityList, CommandError> {
    let ctx = state.ctx.clone();
    blocking(move || app::activity(&ctx, args)).await
}

/// The app's preferences.
#[tauri::command]
pub async fn preferences_get(state: State<'_, AppState>, args: NoParams) -> Result<Preferences, CommandError> {
    let ctx = state.ctx.clone();
    blocking(move || app::preferences_get(&ctx, args)).await
}

/// Change the app's preferences.
#[tauri::command]
pub async fn preferences_set(state: State<'_, AppState>, args: PreferencesPatch) -> Result<Preferences, CommandError> {
    let ctx = state.ctx.clone();
    blocking(move || app::preferences_set(&ctx, args)).await
}
```

(If `NoParams` lacks `Send`/`Deserialize` bounds Tauri needs, it has them: it derives `Deserialize`, and it is a unit-like struct.)

`crates/app/src/watcher.rs`:

```rust
//! Tell the UI what changed in the data folder, so it reloads only that.

use std::path::PathBuf;

use hedgebuddy_core::{categories, watch_batched, WatchHandle, BATCH_WINDOW};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Payload of the `data-changed` event.
#[derive(Debug, Clone, Serialize)]
struct DataChanged {
    categories: Vec<String>,
}

/// Start watching `root`; each batch of changes becomes one `data-changed`
/// event naming the categories it touched.
pub fn start(app: AppHandle, root: PathBuf) -> Result<WatchHandle, String> {
    let (handle, batches) = watch_batched(&root, BATCH_WINDOW).map_err(|e| e.to_string())?;
    std::thread::Builder::new()
        .name("hedgebuddy-data-changed".into())
        .spawn(move || {
            for batch in batches {
                let categories = categories(&root, &batch);
                if !categories.is_empty() {
                    let _ = app.emit("data-changed", DataChanged { categories });
                }
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(handle)
}
```

`crates/app/src/lib.rs`:

```rust
//! HedgeBuddy desktop app. The UI calls the same tool layer as Claude
//! through one generic `tool` command, plus a few app-only commands; all
//! logic lives in `hedgebuddy_core` and `hedgebuddy_tools`.

mod commands;
mod state;
mod watcher;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = state::AppState::open()?;
            let root = state.ctx.store.root().to_path_buf();
            match watcher::start(app.handle().clone(), root) {
                Ok(handle) => *state.watch.lock().unwrap_or_else(|e| e.into_inner()) = Some(handle),
                // The app still works; screens refresh when the window regains focus.
                Err(e) => eprintln!("hedgebuddy: live refresh is off: {e}"),
            }
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::tool,
            commands::home_summary,
            commands::activity,
            commands::preferences_get,
            commands::preferences_set,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HedgeBuddy");
}
```

(`AppState::open()?` needs the error to be `Box<dyn Error>`-convertible; `String` is. Adjust if the compiler asks.)

- [ ] **Step 4: Configuration: window, CSP, macOS floor, build targets**

`crates/app/tauri.conf.json`:
- `app.windows[0]`: add `"label": "main"`, keep `960×640` and `minWidth 480`, `minHeight 400`, add `"backgroundColor": "#0f151d"` so no white flash appears before the UI paints.
- `app.security`:

```json
    "security": {
      "csp": {
        "default-src": "'self'",
        "script-src": "'self'",
        "style-src": "'self' 'unsafe-inline'",
        "font-src": "'self'",
        "img-src": "'self'",
        "connect-src": "ipc: http://ipc.localhost",
        "object-src": "'none'",
        "base-uri": "'none'",
        "form-action": "'none'"
      },
      "devCsp": {
        "default-src": "'self'",
        "script-src": "'self' 'unsafe-inline'",
        "style-src": "'self' 'unsafe-inline'",
        "font-src": "'self'",
        "img-src": "'self'",
        "connect-src": "ipc: http://ipc.localhost ws://localhost:5173 http://localhost:5173"
      },
      "dangerousDisableAssetCspModification": ["style-src"]
    }
```

- `bundle.macOS.minimumSystemVersion`: `"26.0"`.

`crates/app/capabilities/default.json` keeps `"permissions": ["core:default"]` (it includes listening to events); app commands need no permission entries.

`crates/app/ui/vite.config.ts` (the frontend tasks add plugins; this task only moves the targets):

```ts
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome120" : "safari26",
```

If the bundler rejects `safari26`, use the newest Safari version it accepts and note it in the report.

- [ ] **Step 5: Build and test**

Run: `(cd crates/app/ui && bun run build) && cargo test -p hedgebuddy-app 2>&1 | tail -5`
Expected: the UI builds; 1 test passes. (Tauri checks the config and CSP at compile time.)

Run: `cargo test --workspace && cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add crates/app Cargo.lock
git commit -m "feat(app): tool bridge, app commands, data-changed events, strict CSP, macOS 26 floor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: Typed bridge, generated types, browser preview mode, data layer

Everything the screens call goes through one typed bridge. In the browser preview (`bun run dev:mock`) a mock with fixture scenarios replaces Tauri. **UI task: load and follow the frontend-design skill; the Design direction section above binds it.** This task has no visible design yet; its smoke page is replaced in Task 13.

**Files:**
- Create: `crates/app/ui/scripts/gen-tools.ts`, `crates/app/ui/src/api/tools.gen.ts` (generated), `crates/app/ui/src/api/bridge.ts`, `crates/app/ui/src/api/queries.ts`, `crates/app/ui/src/api/events.ts`, `crates/app/ui/src/mock/handlers.ts`, `crates/app/ui/src/mock/fixtures.ts`, `.claude/launch.json`
- Modify: `crates/app/ui/package.json`, `crates/app/ui/bun.lock`, `crates/app/ui/tsconfig.json`, `crates/app/ui/vite.config.ts`, `crates/app/ui/src/App.tsx`, `crates/app/ui/src/main.tsx`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `hedgebuddy tools --schemas` (Task 3), `cargo run -p hedgebuddy-tools --example app_schemas` (Task 9), the Tauri command contract (Task 10).
- Produces (TypeScript, `@/` = `src/`):
  - `@/api/tools.gen`: `ToolTypes`, `ToolName`, `AppCommandTypes`, `AppCommandName`, one `<Name>Input`/`<Name>Output` type per tool and app command (for example `ListRunsInput`, `HomeSummaryOutput`), every shared definition by its Rust name (`Run`, `RunStatus`, `LogLine`, `ActivityRecord`, `ActivityOutcome`, `AttentionItem`, `HomeCounts`, `SidebarBadges`, `PythonStatus`, `VarType`, …), and the call objects `tools.<camelName>(args)` and `app.<camelName>(args)`.
  - `@/api/bridge`: `callTool(name, args)`, `callApp(name, args)`, `class BridgeError { kind: "busy" | "error"; message }`, `isPreview: boolean`.
  - `@/api/queries`: `queryClient`, `queryKey`, `invalidateFor(categories: string[])`, `useHomeSummary()`, `useProfiles()`, `useRuns(profile: string | null)`, `useRun(runId: string | null)`, `useActivateProfile()`, `useCreateProfile()`.
  - `@/api/events`: `useDataChanged()`, `MOCK_EVENT = "hb:data-changed"`.
  - Preview: `bun run dev:mock` serves on port 5199; `?scenario=problems|healthy|empty|error|busy` (default `problems`) before the hash, for example `http://localhost:5199/?scenario=empty#/`; `window.__hb.emit(["runs"])` fires a fake `data-changed`.

- [ ] **Step 1: Dependencies, scripts, alias**

```bash
cd /e/Coding/hedgebuddy/crates/app/ui
bun add @tanstack/react-query wouter
```

`package.json` scripts:

```json
  "scripts": {
    "dev": "vite",
    "dev:mock": "vite --mode mock",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b",
    "gen": "bun scripts/gen-tools.ts",
    "gen:check": "bun scripts/gen-tools.ts --check",
    "preview": "vite preview"
  },
```

`tsconfig.json` `compilerOptions`: add `"paths": { "@/*": ["./src/*"] }` (TypeScript 7 resolves `paths` relative to the tsconfig; no `baseUrl`).

`vite.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  clearScreen: false,
  server: {
    // Tauri's devUrl is 5173; the browser preview with mock data uses 5199.
    port: mode === "mock" ? 5199 : 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome120" : "safari26",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
```

(Keep whatever target Task 10 settled on if `safari26` was rejected.)

`.claude/launch.json` (repo root):

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "ui-mock",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["run", "--cwd", "crates/app/ui", "dev:mock"],
      "port": 5199
    }
  ]
}
```

- [ ] **Step 2: The generator**

`crates/app/ui/scripts/gen-tools.ts`:

```ts
/**
 * Generates src/api/tools.gen.ts from the Rust JSON Schemas:
 *   - `hedgebuddy tools --schemas`                          (every tool)
 *   - `cargo run -p hedgebuddy-tools --example app_schemas` (app-only commands)
 *
 *   bun scripts/gen-tools.ts           write the file
 *   bun scripts/gen-tools.ts --check   exit 1 when the committed file is stale
 *
 * A small converter for the JSON Schema subset schemars emits. Shared
 * definitions from all schemas land in one namespace; two different Rust
 * types with the same name are an error.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Schema = boolean | { [key: string]: any };
type Entry = { input: Schema; output: Schema };

const UI = resolve(import.meta.dir, "..");
const REPO = resolve(UI, "../../..");
const OUT = resolve(UI, "src/api/tools.gen.ts");

function cargoJson(args: string[]): Record<string, Entry> {
  const run = spawnSync("cargo", ["run", "--quiet", ...args], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) {
    process.stderr.write(run.stderr ?? "");
    throw new Error(`cargo run ${args.join(" ")} failed`);
  }
  return JSON.parse(run.stdout);
}

const pascal = (s: string) =>
  s
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
const camel = (s: string) => {
  const p = pascal(s);
  return p[0].toLowerCase() + p.slice(1);
};

const defs = new Map<string, { schema: Schema; from: string }>();

/** Stable JSON without prose, so two copies of one Rust type compare equal. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (key, v) => {
    if (key === "description" || key === "title") return undefined;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
    }
    return v;
  });
}

function register(schema: Schema, from: string) {
  if (typeof schema !== "object") return;
  const local: Record<string, Schema> = schema.$defs ?? schema.definitions ?? {};
  for (const [raw, def] of Object.entries(local)) {
    const name = pascal(raw);
    const seen = defs.get(name);
    if (!seen) defs.set(name, { schema: def, from });
    else if (canonical(seen.schema) !== canonical(def)) {
      throw new Error(
        `Two different Rust types are named ${name} (${seen.from}, ${from}); give one #[schemars(rename = "...")].`,
      );
    }
  }
}

function refName(ref: string): string {
  const m = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(ref);
  if (!m) throw new Error(`unsupported $ref ${ref}`);
  return pascal(decodeURIComponent(m[1]));
}

function doc(schema: Schema, indent: string): string {
  if (typeof schema !== "object" || typeof schema.description !== "string") return "";
  const text = schema.description
    .split("\n")
    .map((l: string) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\*\//g, "*\\/");
  return `${indent}/** ${text} */\n`;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function ts(schema: Schema, indent = ""): string {
  if (schema === true) return "unknown";
  if (schema === false) return "never";
  const s = schema;
  if (typeof s.$ref === "string") return refName(s.$ref);
  if ("const" in s) return JSON.stringify(s.const);
  if (Array.isArray(s.enum)) return s.enum.map((v: Json) => JSON.stringify(v)).join(" | ");
  const parts: string[] = [];
  const own = ownType(s, indent);
  if (own) parts.push(own);
  for (const key of ["oneOf", "anyOf"]) {
    if (Array.isArray(s[key])) parts.push(s[key].map((x: Schema) => ts(x, indent)).join(" | "));
  }
  if (Array.isArray(s.allOf)) for (const x of s.allOf) parts.push(ts(x, indent));
  if (parts.length === 0) return "unknown";
  if (parts.length === 1) return parts[0];
  return parts.map((p) => `(${p})`).join(" & ");
}

function ownType(s: { [key: string]: any }, indent: string): string | null {
  const types: string[] | undefined = Array.isArray(s.type)
    ? s.type
    : typeof s.type === "string"
      ? [s.type]
      : s.properties
        ? ["object"]
        : undefined;
  if (!types) return null;
  return types
    .map((t) => {
      switch (t) {
        case "null":
          return "null";
        case "string":
          return "string";
        case "integer":
        case "number":
          return "number";
        case "boolean":
          return "boolean";
        case "array":
          if (Array.isArray(s.prefixItems)) return `[${s.prefixItems.map((x: Schema) => ts(x, indent)).join(", ")}]`;
          return s.items === undefined || s.items === true ? "unknown[]" : `Array<${ts(s.items, indent)}>`;
        case "object":
          return objectType(s, indent);
        default:
          throw new Error(`unsupported JSON Schema type ${t}`);
      }
    })
    .join(" | ");
}

function objectType(s: { [key: string]: any }, indent: string): string {
  const props: Record<string, Schema> = s.properties ?? {};
  const required = new Set<string>(s.required ?? []);
  const inner = `${indent}  `;
  const lines = Object.entries(props).map(
    ([k, v]) =>
      `${doc(v, inner)}${inner}${IDENT.test(k) ? k : JSON.stringify(k)}${required.has(k) ? "" : "?"}: ${ts(v, inner)};`,
  );
  const extra = s.additionalProperties;
  if (extra !== undefined && extra !== false) {
    const value = lines.length ? "unknown" : ts(extra, inner);
    lines.push(`${inner}[key: string]: ${value};`);
  }
  if (lines.length === 0) return extra === false ? "Record<string, never>" : "Record<string, unknown>";
  return `{\n${lines.join("\n")}\n${indent}}`;
}

function takesNoArgs(schema: Schema): boolean {
  return typeof schema === "object" && (!schema.required || schema.required.length === 0);
}

function emit(tools: Record<string, Entry>, app: Record<string, Entry>): string {
  for (const [name, e] of Object.entries(tools)) {
    register(e.input, name);
    register(e.output, name);
  }
  for (const [name, e] of Object.entries(app)) {
    register(e.input, name);
    register(e.output, name);
  }
  const out: string[] = [
    "// Generated by scripts/gen-tools.ts from the Rust JSON Schemas. Do not edit by hand:",
    "// run `bun run gen` after changing a tool or app command, and commit the result.",
    "",
    'import { callApp, callTool } from "./bridge";',
    "",
  ];
  const group = (entries: Record<string, Entry>, map: string, alias: string, obj: string, call: string) => {
    const names = Object.keys(entries).sort();
    for (const name of names) {
      const e = entries[name];
      out.push(`${doc(e.input, "")}export type ${pascal(name)}Input = ${ts(e.input)};`, "");
      out.push(`${doc(e.output, "")}export type ${pascal(name)}Output = ${ts(e.output)};`, "");
    }
    out.push(`export interface ${map} {`);
    for (const name of names) out.push(`  ${name}: { input: ${pascal(name)}Input; output: ${pascal(name)}Output };`);
    out.push("}", "", `export type ${alias} = keyof ${map};`, "", `export const ${obj} = {`);
    for (const name of names) {
      const arg = takesNoArgs(entries[name].input)
        ? `args: ${pascal(name)}Input = {}`
        : `args: ${pascal(name)}Input`;
      out.push(`  ${camel(name)}: (${arg}) => ${call}("${name}", args),`);
    }
    out.push("} as const;", "");
  };
  group(tools, "ToolTypes", "ToolName", "tools", "callTool");
  group(app, "AppCommandTypes", "AppCommandName", "app", "callApp");
  for (const name of [...defs.keys()].sort()) {
    const { schema } = defs.get(name)!;
    out.push(`${doc(schema, "")}export type ${name} = ${ts(schema)};`, "");
  }
  return out.join("\n");
}

const text = emit(
  cargoJson(["-p", "hedgebuddy-cli", "--bin", "hedgebuddy", "--", "tools", "--schemas"]),
  cargoJson(["-p", "hedgebuddy-tools", "--example", "app_schemas"]),
);

if (process.argv.includes("--check")) {
  // Git on Windows may check the file out with CRLF line endings.
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== text) {
    console.error("src/api/tools.gen.ts is stale: run `bun run gen` in crates/app/ui and commit it.");
    process.exit(1);
  }
  console.log("src/api/tools.gen.ts is up to date");
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}`);
}
```

Run: `bun run gen` then `bun run typecheck`
Expected: the file is written; it type-checks once `bridge.ts` exists (Step 3). If a schema construct is not handled, extend the converter (not the output). If two Rust types clash, rename one with `#[schemars(rename = "...")]` in Rust.

- [ ] **Step 3: The bridge**

`src/api/bridge.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import type { AppCommandName, AppCommandTypes, ToolName, ToolTypes } from "./tools.gen";

/** `busy`: another HedgeBuddy holds the data folder, so offer Try again. */
export type BridgeErrorKind = "busy" | "error";

/** A failed tool or app command, carrying the message to show. */
export class BridgeError extends Error {
  readonly kind: BridgeErrorKind;

  constructor(kind: BridgeErrorKind, message: string) {
    super(message);
    this.name = "BridgeError";
    this.kind = kind;
  }
}

/** The browser preview's stand-in for Tauri; only `vite --mode mock` loads it. */
const mock = import.meta.env.MODE === "mock" ? import("@/mock/handlers") : null;

/** True in the browser preview (`bun run dev:mock`). */
export const isPreview = mock !== null;

function toBridgeError(e: unknown): BridgeError {
  if (e instanceof BridgeError) return e;
  if (typeof e === "object" && e !== null && "message" in e) {
    const { kind, message } = e as { kind?: unknown; message: unknown };
    return new BridgeError(kind === "busy" ? "busy" : "error", String(message));
  }
  return new BridgeError("error", String(e));
}

/** Run a tool exactly as Claude does. */
export async function callTool<N extends ToolName>(
  name: N,
  args: ToolTypes[N]["input"],
): Promise<ToolTypes[N]["output"]> {
  try {
    if (mock) return await (await mock).callTool(name, args);
    return await invoke<ToolTypes[N]["output"]>("tool", { name, args });
  } catch (e) {
    throw toBridgeError(e);
  }
}

/** Run an app-only command. */
export async function callApp<C extends AppCommandName>(
  name: C,
  args: AppCommandTypes[C]["input"],
): Promise<AppCommandTypes[C]["output"]> {
  try {
    if (mock) return await (await mock).callApp(name, args);
    return await invoke<AppCommandTypes[C]["output"]>(name, { args });
  } catch (e) {
    throw toBridgeError(e);
  }
}
```

- [ ] **Step 4: Queries and live refresh**

`src/api/queries.ts`:

```ts
import { QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { BridgeError, callApp, callTool } from "./bridge";
import type { AppCommandName, AppCommandTypes, ToolName, ToolTypes } from "./tools.gen";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Retry only "busy": another HedgeBuddy finishes its write in moments.
      retry: (failures, error) => error instanceof BridgeError && error.kind === "busy" && failures < 2,
    },
  },
});

type Name = ToolName | AppCommandName;

export const queryKey = {
  tool: <N extends ToolName>(name: N, args: ToolTypes[N]["input"]) => ["tool", name, args] as const,
  app: <C extends AppCommandName>(name: C, args: AppCommandTypes[C]["input"]) => ["app", name, args] as const,
};

/** Which queries each `data-changed` category makes stale. Home's summary reads nearly everything. */
const RELOAD: Record<string, Name[]> = {
  index: ["list_profiles", "get_profile", "list_runs", "home_summary"],
  runs: ["list_runs", "get_run", "home_summary"],
  activity: ["activity", "home_summary"],
  preferences: ["preferences_get"],
  catalog: ["list_apps", "describe_app", "list_attachments", "home_summary"],
};
const PROFILE: Name[] = ["list_profiles", "get_profile", "list_vars", "get_var", "home_summary"];
const SCRIPTS: Name[] = ["list_scripts", "read_script", "check_script", "get_profile", "list_attachments", "home_summary"];

function namesFor(category: string): Name[] {
  if (category.startsWith("profile:")) return PROFILE;
  if (category.startsWith("scripts:")) return SCRIPTS;
  return RELOAD[category] ?? [];
}

/** Reload the queries that read what changed. */
export function invalidateFor(categories: string[]) {
  const names = new Set<string>(categories.flatMap(namesFor));
  void queryClient.invalidateQueries({ predicate: (q) => names.has(String(q.queryKey[1])) });
}

/** Everything Home and the sidebar badges show. Hedge app state lives outside the data folder, so it also reloads when the window regains focus. */
export function useHomeSummary() {
  return useQuery({
    queryKey: queryKey.app("home_summary", {}),
    queryFn: () => callApp("home_summary", {}),
    refetchOnWindowFocus: true,
  });
}

export function useProfiles() {
  return useQuery({ queryKey: queryKey.tool("list_profiles", {}), queryFn: () => callTool("list_profiles", {}) });
}

/** Runs of one profile, or of every profile when `profile` is null. */
export function useRuns(profile: string | null) {
  const args: ToolTypes["list_runs"]["input"] = profile ? { profile, limit: 1000 } : { limit: 1000 };
  return useQuery({ queryKey: queryKey.tool("list_runs", args), queryFn: () => callTool("list_runs", args) });
}

export function useRun(runId: string | null) {
  const args = { run_id: runId ?? "" };
  return useQuery({
    queryKey: queryKey.tool("get_run", args),
    queryFn: () => callTool("get_run", args),
    enabled: runId !== null,
  });
}

export function useActivateProfile() {
  return useMutation({
    mutationFn: (name: string) => callTool("set_active_profile", { name }),
    onSuccess: () => invalidateFor(["index"]),
  });
}

/** Create a profile; with `activate`, also make it active (the first profile becomes active by itself). */
export function useCreateProfile() {
  return useMutation({
    mutationFn: async (v: { name: string; description: string; activate: boolean }) => {
      const created = await callTool("create_profile", { name: v.name, description: v.description });
      if (v.activate && !created.active) await callTool("set_active_profile", { name: v.name });
      return created;
    },
    onSuccess: () => invalidateFor(["index"]),
  });
}
```

(Match the argument types to the generated ones; if `ListRunsInput.profile` is `string | null`, passing `undefined` by omission is fine.)

`src/api/events.ts`:

```ts
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { isPreview } from "./bridge";
import { invalidateFor } from "./queries";

/** Payload of the app's `data-changed` event. */
export type DataChanged = { categories: string[] };

/** The browser preview's stand-in event name. */
export const MOCK_EVENT = "hb:data-changed";

/** Reload what changed on disk (Claude, `hedgebuddy call`, another HedgeBuddy). Mount once. */
export function useDataChanged() {
  useEffect(() => {
    if (isPreview) {
      const onEvent = (e: Event) => invalidateFor((e as CustomEvent<DataChanged>).detail.categories);
      window.addEventListener(MOCK_EVENT, onEvent);
      return () => window.removeEventListener(MOCK_EVENT, onEvent);
    }
    const stop = listen<DataChanged>("data-changed", (e) => invalidateFor(e.payload.categories));
    return () => {
      void stop.then((unlisten) => unlisten());
    };
  }, []);
}
```

- [ ] **Step 5: The mock and its scenarios**

`src/mock/fixtures.ts` builds one in-memory data set per scenario from the generated types, with times relative to now so "Today" and "since you last opened" always have content. It must provide at least:

- Profiles `commercial-one-day` (active) and `doc-series`.
- Runs over the last three days: today several `ok` runs of `on_copy_complete.py` and `on_disk_added.py` (OffShoot `FileCopyCompleted`/`DiskAdded`, durations 0.3 to 2 s), one `failed` run of `on_copy_complete.py` with exit 1, a log line `copy of A003 finished, posting to Slack` and the traceback from `scripts-runs.html` (`urllib.error.URLError: <urlopen error timed out>`), one `error` run with a `RuntimeError` traceback, one unfinished run (no end), a `foolcat_report.py` run (`foolcat`, `ReportCreated`), and two runs of profile `doc-series`; yesterday and two days ago a handful of `ok` runs.
- `since` two hours ago, so some of today's runs fall before it.
- Activity: `sync_attachments` (target `commercial-one-day`, ok), `write_script` (`on_copy_complete.py`, ok), `run_app_command` (`offshoot`, needs_confirmation), `get_var` (`NOPE`, error).

Scenarios:

| `?scenario=` | What it shows |
|---|---|
| `problems` (default) | The mockup's Home: 14-ish runs since the last open, failures, `CLIENT_EMAIL` missing (required by `on_copy_complete.py`), 3 stale OffShoot events, `hedgebuddy` 0.10.0 installed (needs 0.11.0), OffShoot newer than tested; badges set |
| `healthy` | Same data, no failures, no attention items, Python fine, badges all 0 |
| `empty` | No profiles, no runs, no activity (first launch, `since` null) |
| `error` | Every query rejects with `BridgeError("error", "cannot read hedgebuddy.json: invalid JSON at line 1")` |
| `busy` | Reads work as in `problems`; every write rejects with `BridgeError("busy", "another HedgeBuddy is busy; try again")` |

`home_summary` in the mock is computed from the scenario's data (counts from its runs and `since`, attention from its failures plus the scenario's fixed items), so it always agrees with `list_runs`.

`src/mock/handlers.ts`:

```ts
import { BridgeError } from "@/api/bridge";
import type { AppCommandName, AppCommandTypes, ToolName, ToolTypes } from "@/api/tools.gen";
import { MOCK_EVENT } from "@/api/events";
import { loadScenario } from "./fixtures";

type ToolHandlers = { [N in ToolName]?: (args: ToolTypes[N]["input"]) => ToolTypes[N]["output"] };
type AppHandlers = { [C in AppCommandName]?: (args: AppCommandTypes[C]["input"]) => AppCommandTypes[C]["output"] };

/** Feels like a real round trip, so loading states show. */
const LATENCY_MS = 180;
const pause = () => new Promise((r) => setTimeout(r, LATENCY_MS));

const data = loadScenario(new URLSearchParams(window.location.search).get("scenario") ?? "problems");

const toolHandlers: ToolHandlers = {
  list_profiles: () => data.listProfiles(),
  list_runs: (args) => data.listRuns(args),
  get_run: (args) => data.getRun(args.run_id),
  set_active_profile: (args) => data.setActive(args.name),
  create_profile: (args) => data.createProfile(args.name, args.description ?? ""),
};

const appHandlers: AppHandlers = {
  home_summary: () => data.homeSummary(),
  activity: (args) => data.activity(args.limit ?? 200),
  preferences_get: () => data.preferences(),
};

const WRITES = new Set<string>(["set_active_profile", "create_profile", "preferences_set"]);

function check(name: string) {
  if (data.scenario === "error") throw new BridgeError("error", "cannot read hedgebuddy.json: invalid JSON at line 1");
  if (data.scenario === "busy" && WRITES.has(name)) throw new BridgeError("busy", "another HedgeBuddy is busy; try again");
}

export async function callTool<N extends ToolName>(name: N, args: ToolTypes[N]["input"]): Promise<ToolTypes[N]["output"]> {
  await pause();
  check(name);
  const handler = toolHandlers[name] as ((a: ToolTypes[N]["input"]) => ToolTypes[N]["output"]) | undefined;
  if (!handler) throw new BridgeError("error", `${name} is not available in the preview`);
  const result = handler(args);
  if (WRITES.has(name)) emit(["index"]);
  return result;
}

export async function callApp<C extends AppCommandName>(name: C, args: AppCommandTypes[C]["input"]): Promise<AppCommandTypes[C]["output"]> {
  await pause();
  check(name);
  const handler = appHandlers[name] as ((a: AppCommandTypes[C]["input"]) => AppCommandTypes[C]["output"]) | undefined;
  if (!handler) throw new BridgeError("error", `${name} is not available in the preview`);
  return handler(args);
}

/** Fire a fake `data-changed`, as the app does when files change. */
function emit(categories: string[]) {
  window.dispatchEvent(new CustomEvent(MOCK_EVENT, { detail: { categories } }));
}

declare global {
  interface Window {
    __hb?: { emit: (categories: string[]) => void; scenario: string };
  }
}
window.__hb = { emit, scenario: data.scenario };
```

The fixtures are typed against the generated types, so a Rust result change that the preview's data no longer satisfies fails `bun run typecheck`.

- [ ] **Step 6: A smoke page that proves the pipe**

Replace `src/App.tsx` for now (Task 13 replaces it again):

```tsx
import { useDataChanged } from "@/api/events";
import { useHomeSummary } from "@/api/queries";

export default function App() {
  useDataChanged();
  const summary = useHomeSummary();
  return (
    <main style={{ padding: 16, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
      <pre>{summary.isPending ? "loading…" : summary.isError ? `error: ${summary.error.message}` : JSON.stringify(summary.data, null, 2)}</pre>
    </main>
  );
}
```

`src/main.tsx`:

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { queryClient } from "@/api/queries";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 7: Generated-types check in CI**

`.github/workflows/ci.yml`, in the Rust job's frontend step:

```yaml
      - name: Build frontend (the app crate embeds ui/dist at compile time)
        working-directory: crates/app/ui
        run: |
          bun install --frozen-lockfile
          bun run gen:check
          bun run build
```

(The toolchain is already set up earlier in the job; `gen:check` compiles `hedgebuddy-cli` and the tools example.)

- [ ] **Step 8: Verify**

Run: `cd crates/app/ui && bun run gen && bun run gen:check && bun run build`
Expected: "up to date"; the build passes. Confirm the production bundle has no mock code: `grep -l "not available in the preview" dist/assets/*.js` prints nothing.

Run the preview (`preview_start` with `ui-mock`, or `bun run dev:mock`) and open `http://localhost:5199/?scenario=problems#/`: the page prints the summary JSON after a short delay; `?scenario=error` prints the error; in the browser console `window.__hb.emit(["runs"])` refetches (the network-free mock logs nothing; watch the JSON's `recent_runs` stay consistent).

Run: `cd /e/Coding/hedgebuddy && cargo build -p hedgebuddy-app`
Expected: builds (the app embeds the new `dist`).

- [ ] **Step 9: Commit**

```bash
git add .claude/launch.json .github/workflows/ci.yml crates/app/ui
git commit -m "feat(ui): typed bridge with generated types, browser preview mock, data layer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Design system: Tailwind v4, tokens, fonts, shadcn/ui, app components

**UI task: load and follow the frontend-design skill before writing code; the Design direction section above binds it.** The result is judged against frontend-design, spec §5 and the mockups.

**Files:**
- Create: `crates/app/ui/components.json`, `crates/app/ui/src/styles/globals.css`, `crates/app/ui/src/lib/utils.ts`, `crates/app/ui/src/lib/status.ts`, `crates/app/ui/src/lib/format.ts`, `crates/app/ui/src/components/ui/*` (shadcn), `crates/app/ui/src/components/app/{status-icon,count-badge,panel,stat,empty-state,error-panel,list-detail,screen-header,mono}.tsx`, `crates/app/ui/src/screens/design/design-gallery.tsx`
- Modify: `crates/app/ui/package.json`, `bun.lock`, `crates/app/ui/vite.config.ts`, `crates/app/ui/src/main.tsx`, `crates/app/ui/index.html`

**Interfaces:**
- Consumes: generated types (`RunStatus`), `BridgeError` (Task 11).
- Produces:
  - Tailwind colour utilities for every token: `bg-background`, `bg-card`, `bg-accent`, `bg-well`, `bg-sidebar`, `border-border`, `border-border-strong`, `text-foreground`, `text-foreground-strong`, `text-muted-foreground`, `text-primary`, `text-link`, `text-destructive`, `bg-destructive-tint`, `border-destructive-border`, `text-warning`, `bg-warning-tint`, `border-warning-border`; sizes `text-xs` 11.5, `text-sm` 12.5, `text-base` 13, `text-lg` 15, `text-stat` 22; custom utilities `readout`, `micro-label`, `surface`, `well`, `ambient`; animations `animate-rise`, `animate-slide-in`.
  - `@/lib/utils`: `cn(...classes)`.
  - `@/lib/status`: `type StatusKey`, `STATUS: Record<StatusKey, {icon, word, tone}>`, `TONE_TEXT`, `runStatusKey(status)`, `NAV_ICONS`.
  - `@/lib/format`: `clock(ts, seconds?)`, `when(ts)`, `dayKey(ts)`, `dayLabel(key)`, `duration(start, end)`, `plural(n, word)`, `appName(id)`.
  - Components: `StatusIcon({status, label?})`, `CountBadge({count, tone, variant?: "pill" | "rail"})`, `Panel({title, action?, children})`, `Stat({label, value, tone?})`, `EmptyState({icon, title, children, action?})`, `ErrorPanel({error, onRetry})`, `ListDetail({list, detail, selected, onBack, backLabel})`, `ScreenHeader({title, children})`, `Mono({children})`.
  - shadcn components in `@/components/ui`: `button`, `badge`, `dialog`, `dropdown-menu`, `input`, `label`, `scroll-area`, `separator`, `sidebar` (with `sheet`, `tooltip`, `skeleton`, `use-mobile` it pulls in), `skeleton`, `sonner`, `switch`, `toggle-group`, `tooltip`.
  - `#/_design` gallery in preview mode.

- [ ] **Step 1: Install Tailwind v4, fonts, icons and shadcn's runtime**

```bash
cd /e/Coding/hedgebuddy/crates/app/ui
bun add tailwindcss @tailwindcss/vite tw-animate-css class-variance-authority clsx tailwind-merge lucide-react sonner @fontsource-variable/inter @fontsource-variable/jetbrains-mono
```

`vite.config.ts`: `import tailwindcss from "@tailwindcss/vite";` and `plugins: [react(), tailwindcss()]`.

`components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/styles/globals.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "iconLibrary": "lucide",
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" }
}
```

`src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Tokens, fonts, base styles**

`src/styles/globals.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "@fontsource-variable/inter";
@import "@fontsource-variable/jetbrains-mono";

/* HedgeBuddy is dark only (spec §2.3). Colours are spec §5.1; nothing else gets a hue. */
:root {
  color-scheme: dark;

  --background: #0f151d;
  --sidebar: #0b1016;
  --well: #0b1016;
  --card: #141c26;
  --accent: #1a2432;
  --border: #1f2a38;
  --border-strong: #243244;
  --foreground: #c9d4e0;
  --foreground-strong: #ffffff;
  --muted-foreground: #7d8da2;
  --primary: #2a7cf7;
  --primary-foreground: #ffffff;
  --link: #8fb6ff;
  --destructive: #ff6b81;
  --destructive-tint: #2a1418;
  --destructive-border: #5a2330;
  --warning: #f5b73b;
  --warning-tint: #2a1d0c;
  --warning-border: #5a4318;
  --brand-from: #3dd6c6;
  --brand-to: #2a7cf7;

  /* shadcn's names, pointed at the tokens above */
  --popover: var(--card);
  --popover-foreground: var(--foreground);
  --secondary: var(--accent);
  --secondary-foreground: var(--foreground-strong);
  --muted: var(--card);
  --accent-foreground: var(--foreground-strong);
  --input: var(--border-strong);
  --ring: var(--primary);
  --sidebar-foreground: var(--muted-foreground);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
  --sidebar-accent: var(--accent);
  --sidebar-accent-foreground: var(--foreground-strong);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--primary);
  --radius: 8px;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-foreground-strong: var(--foreground-strong);
  --color-card: var(--card);
  --color-card-foreground: var(--foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-tint: var(--destructive-tint);
  --color-destructive-border: var(--destructive-border);
  --color-warning: var(--warning);
  --color-warning-tint: var(--warning-tint);
  --color-warning-border: var(--warning-border);
  --color-link: var(--link);
  --color-well: var(--well);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

@theme {
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, "Cascadia Mono", monospace;

  /* spec §5.1: text 11.5–15 px, Home numbers 22 px, mono 10.5–13 px.
     Overriding Tailwind's steps makes shadcn's components use this scale. */
  --text-xs: 11.5px;
  --text-xs--line-height: 16px;
  --text-sm: 12.5px;
  --text-sm--line-height: 18px;
  --text-base: 13px;
  --text-base--line-height: 20px;
  --text-lg: 15px;
  --text-lg--line-height: 22px;
  --text-stat: 22px;
  --text-stat--line-height: 26px;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 8px;

  --animate-rise: hb-rise 180ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  --animate-slide-in: hb-slide-in 200ms cubic-bezier(0.2, 0.7, 0.2, 1) both;

  @keyframes hb-rise {
    from { opacity: 0; transform: translateY(3px); }
  }
  @keyframes hb-slide-in {
    from { opacity: 0.4; transform: translateX(24px); }
  }
}

@layer base {
  * { @apply border-border; }
  html, body, #root { height: 100%; }
  body {
    @apply bg-background font-sans text-base text-foreground antialiased;
    font-feature-settings: "cv05", "cv08";
    overflow: hidden;
  }
  ::selection { background: color-mix(in srgb, var(--primary) 35%, transparent); color: var(--foreground-strong); }
  * { scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
  :focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
}

/* A readout: tabular, open digits, a little tight. */
@utility readout {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "cv05", "cv08", "ss01", "tnum";
  letter-spacing: -0.01em;
}
/* Uppercase micro label above a value or a group. */
@utility micro-label {
  @apply text-xs text-muted-foreground uppercase;
  letter-spacing: 0.08em;
}
/* A milled surface: hairline border, inset top highlight, no drop shadow. */
@utility surface {
  @apply rounded-lg border border-border bg-card;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.03);
}
/* A recessed well for code, logs and previews. */
@utility well {
  @apply rounded-md border border-border bg-well;
}
/* The main area's one faint glow; primary at 6 % so it reads as light, not colour. */
@utility ambient {
  background:
    radial-gradient(900px 480px at 100% -12%, color-mix(in srgb, var(--primary) 6%, transparent), transparent 62%),
    var(--background);
}

@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

`src/main.tsx`: add `import "@/styles/globals.css";` first. `index.html`: `<html lang="en" class="dark">` and `<body class="bg-background">` (the window's `backgroundColor` already avoids a flash).

- [ ] **Step 3: shadcn components, restyled**

```bash
bunx --bun shadcn@latest add button badge dialog dropdown-menu input label scroll-area separator sidebar skeleton sonner switch toggle-group tooltip
```

If the CLI cannot read the aliases under TypeScript 7, add the same components by copying their source from the shadcn registry (new-york, Tailwind v4) into `src/components/ui/`. After adding:
- If the CLI rewrote `globals.css` (it adds `--sidebar-*` and `oklch` values), restore the token block above; keep only additions that are new names, pointed at existing tokens.
- Buttons: `default` variant `bg-primary text-primary-foreground hover:bg-primary/90`, `outline` `border-border-strong bg-transparent hover:bg-accent`, `ghost` `hover:bg-accent`, `destructive` text-only red for Delete; sizes `sm` `h-7 px-2.5 text-sm`, `default` `h-8 px-3 text-sm`, `icon` `size-7`; radius `rounded-md`; no shadows.
- Inputs: `h-8 rounded-md border-border-strong bg-well px-2.5 text-sm placeholder:text-muted-foreground/70`, invalid state `aria-invalid:border-destructive-border`.
- Dialog: `surface` background, `bg-black/60` overlay, title `text-lg`, width up to 440 px.
- Dropdown, tooltip: `bg-popover border-border-strong`, `text-sm`; tooltip `text-xs`.
- Sonner: `theme="dark"`, toasts use `surface`, errors keep a destructive icon only.
- Sidebar: leave behaviour to Task 13; only make sure it compiles.

- [ ] **Step 4: Status map and formatting helpers**

`src/lib/status.ts`:

```ts
import {
  AppWindow, Ban, Braces, CircleCheck, CircleDashed, CirclePause, CircleX, FileCode, FileX, Hand,
  History, Hourglass, House, Link, Package, Plug, Settings, TriangleAlert, Unlink, type LucideIcon,
} from "lucide-react";
import type { ActivityOutcome, RunStatus } from "@/api/tools.gen";

/** Colour only marks problems (spec §2.7): red failed, amber needs a look; fine is neutral grey. */
export type Tone = "neutral" | "muted" | "destructive" | "warning";

/** Spec §5.2 status table: one icon and one word per state. */
export const STATUS = {
  runOk: { icon: CircleCheck, word: "ok", tone: "neutral" },
  runFailed: { icon: CircleX, word: "failed", tone: "destructive" },
  runUnfinished: { icon: CircleDashed, word: "unfinished", tone: "neutral" },
  attached: { icon: Link, word: "attached", tone: "neutral" },
  detached: { icon: Unlink, word: "nothing attached", tone: "muted" },
  external: { icon: FileCode, word: "your own file", tone: "neutral" },
  stale: { icon: FileX, word: "file missing", tone: "warning" },
  staged: { icon: Hourglass, word: "apply in OffShoot Helper", tone: "warning" },
  manual: { icon: Hand, word: "set in the app", tone: "neutral" },
  unsupported: { icon: Ban, word: "not supported yet", tone: "muted" },
  varMissing: { icon: Braces, word: "not set", tone: "warning" },
  package: { icon: Package, word: "package problem", tone: "warning" },
  alert: { icon: TriangleAlert, word: "needs a look", tone: "warning" },
  callOk: { icon: CircleCheck, word: "ok", tone: "neutral" },
  callError: { icon: CircleX, word: "error", tone: "destructive" },
  callWaiting: { icon: CirclePause, word: "waited for your OK", tone: "neutral" },
} as const satisfies Record<string, { icon: LucideIcon; word: string; tone: Tone }>;

export type StatusKey = keyof typeof STATUS;

/** Icon colour per tone. Fine stays grey. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  muted: "text-muted-foreground/60",
  destructive: "text-destructive",
  warning: "text-warning",
};

export function runStatusKey(status: RunStatus | null | undefined): StatusKey {
  if (status === "ok") return "runOk";
  if (status === "failed" || status === "error") return "runFailed";
  return "runUnfinished";
}

export function outcomeKey(outcome: ActivityOutcome): StatusKey {
  return outcome === "ok" ? "callOk" : outcome === "error" ? "callError" : "callWaiting";
}

/** Spec §5.2 navigation icons. */
export const NAV_ICONS = {
  home: House, runs: History, variables: Braces, scripts: FileCode, apps: AppWindow, connect: Plug, settings: Settings,
} satisfies Record<string, LucideIcon>;
```

`src/lib/format.ts`:

```ts
const APP_NAMES: Record<string, string> = {
  offshoot: "OffShoot", foolcat: "FoolCat", editready: "EditReady", canister: "Canister",
};

/** A catalog app id as the operator knows it. */
export const appName = (id: string | null | undefined) => (id ? (APP_NAMES[id] ?? id) : "—");

/** Local 24-hour time: `02:14`, or `02:14:07` with seconds. */
export function clock(ts: string, seconds = false): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hourCycle: "h23",
  });
}

/** Local calendar day, `2026-09-23`. */
export function dayKey(ts: string | Date): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `Today`, `Yesterday`, or `Mon 21 Sep`. */
export function dayLabel(key: string, now = new Date()): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(yesterday)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** A time with its day when it is not today: `02:14`, `Yesterday 02:14`, `Mon 21 Sep 02:14`. */
export function when(ts: string): string {
  const label = dayLabel(dayKey(ts));
  return label === "Today" ? clock(ts) : `${label} ${clock(ts)}`;
}

/** `340 ms`, `1.2 s`, `2 min 5 s`, or null without an end. */
export function duration(start: string, end: string | null | undefined): string | null {
  if (!end) return null;
  const ms = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

export const plural = (n: number, word: string, many = `${word}s`) => (n === 1 ? word : many);
```

- [ ] **Step 5: App components**

`src/components/app/mono.tsx`:

```tsx
import { cn } from "@/lib/utils";

/** File names, variable names, paths and tool names. */
export function Mono({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("font-mono text-[0.95em] text-foreground-strong", className)} {...props} />;
}
```

`src/components/app/status-icon.tsx`:

```tsx
import { STATUS, TONE_TEXT, type StatusKey } from "@/lib/status";
import { cn } from "@/lib/utils";

/** A state as icon plus word (spec §5.2). Without `label` the word is for screen readers only. */
export function StatusIcon({ status, label = false, className }: { status: StatusKey; label?: boolean; className?: string }) {
  const { icon: Icon, word, tone } = STATUS[status];
  const wordClass = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-muted-foreground";
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5", className)}>
      <Icon aria-hidden className={cn("size-3.5", TONE_TEXT[tone])} strokeWidth={1.75} />
      {label ? <span className={cn("text-sm", wordClass)}>{word}</span> : <span className="sr-only">{word}</span>}
    </span>
  );
}
```

`src/components/app/count-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";

/** A count in a problem tint (spec §5.2: badges, never dots). `rail` is the small overlay on the collapsed sidebar. */
export function CountBadge({ count, tone, variant = "pill", className }: {
  count: number; tone: "destructive" | "warning"; variant?: "pill" | "rail"; className?: string;
}) {
  if (count <= 0) return null;
  const text = count > 99 ? "99+" : String(count);
  return (
    <span
      aria-label={`${count} ${tone === "destructive" ? "failed" : "need a look"}`}
      className={cn(
        "readout inline-flex items-center justify-center rounded-full font-medium ring-1 ring-inset",
        tone === "destructive" ? "bg-destructive-tint text-destructive ring-destructive-border" : "bg-warning-tint text-warning ring-warning-border",
        variant === "pill" ? "h-[18px] min-w-[18px] px-1.5 text-xs" : "h-3.5 min-w-3.5 px-1 text-[10.5px] leading-none",
        className,
      )}
    >
      {text}
    </span>
  );
}
```

`src/components/app/panel.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function Panel({ title, action, children, className, bodyClassName, style }: {
  title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
  className?: string; bodyClassName?: string; style?: React.CSSProperties;
}) {
  return (
    <section className={cn("surface flex min-w-0 flex-col", className)} style={style}>
      {title && (
        <header className="flex h-10 shrink-0 items-center justify-between gap-2 px-3">
          <h2 className="text-sm font-medium text-foreground-strong">{title}</h2>
          {action}
        </header>
      )}
      <div className={cn("min-h-0 px-1.5 pb-1.5", !title && "pt-1.5", bodyClassName)}>{children}</div>
    </section>
  );
}
```

`src/components/app/stat.tsx`:

```tsx
import { cn } from "@/lib/utils";

/** A Home readout: micro label over a 22 px tabular number. Only a non-zero failure count is tinted. */
export function Stat({ label, value, tone, className }: { label: string; value: number; tone?: "destructive"; className?: string }) {
  const bad = tone === "destructive" && value > 0;
  return (
    <div className={cn(bad ? "rounded-lg border border-destructive-border bg-destructive-tint" : "surface", "px-3 py-2.5", className)}>
      <div className={cn("micro-label truncate", bad && "text-destructive/80")}>{label}</div>
      <div className={cn("readout mt-1 text-stat font-semibold tracking-tight", bad ? "text-destructive" : "text-foreground-strong")}>{value}</div>
    </div>
  );
}
```

`src/components/app/empty-state.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Every empty list says what to do next (spec §7). Left-aligned, quiet. */
export function EmptyState({ icon: Icon, title, children, action, className }: {
  icon: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-2 px-3 py-6", className)}>
      <div className="grid size-8 place-items-center rounded-md border border-border-strong bg-accent/40">
        <Icon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <p className="text-base font-medium text-foreground-strong">{title}</p>
      {children && <p className="max-w-[46ch] text-sm text-muted-foreground">{children}</p>}
      {action}
    </div>
  );
}
```

`src/components/app/error-panel.tsx`:

```tsx
import { CircleX, RotateCw } from "lucide-react";
import { BridgeError } from "@/api/bridge";
import { Button } from "@/components/ui/button";

/** A failed load, inline, with Retry (spec §7). */
export function ErrorPanel({ error, onRetry, title = "Couldn't load this" }: { error: unknown; onRetry: () => void; title?: string }) {
  const busy = error instanceof BridgeError && error.kind === "busy";
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive-border bg-destructive-tint/60 p-3">
      <CircleX aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground-strong">{busy ? "Another HedgeBuddy is busy" : title}</p>
        <p className="mt-0.5 text-sm break-words text-muted-foreground">{busy ? "It is saving something. Try again in a moment." : message}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RotateCw aria-hidden className="size-3.5" /> {busy ? "Try again" : "Retry"}
      </Button>
    </div>
  );
}
```

`src/components/app/screen-header.tsx`:

```tsx
/** The toolbar row at the top of every screen: title left, controls (the profile switcher) right. */
export function ScreenHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4 max-[560px]:px-3">
      <h1 className="truncate text-lg font-semibold text-foreground-strong">{title}</h1>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </header>
  );
}
```

`src/components/app/list-detail.tsx`:

```tsx
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * List and detail (spec §4.5). When the screen is at least 640 px wide the list sits on the left and the
 * detail on the right. Narrower, the list fills the screen; a selection slides the detail over it with a
 * back button. Width comes from a container query, so the sidebar's width is accounted for.
 */
export function ListDetail({ list, detail, selected, onBack, backLabel }: {
  list: React.ReactNode; detail: React.ReactNode; selected: boolean; onBack: () => void; backLabel: string;
}) {
  return (
    <div className="@container flex h-full min-h-0">
      <div
        className={cn(
          "flex min-h-0 w-full flex-col @min-[640px]:w-[clamp(248px,38%,360px)] @min-[640px]:shrink-0 @min-[640px]:border-r @min-[640px]:border-border",
          selected && "@max-[640px]:hidden",
        )}
      >
        {list}
      </div>
      <div
        className={cn("min-h-0 min-w-0 flex-1 flex-col", selected ? "flex @max-[640px]:animate-slide-in" : "hidden @min-[640px]:flex")}
        onKeyDown={(e) => {
          if (e.key === "Escape" && selected) onBack();
        }}
      >
        {selected && (
          <div className="flex h-10 shrink-0 items-center border-b border-border px-1.5 @min-[640px]:hidden">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft aria-hidden className="size-3.5" /> {backLabel}
            </Button>
          </div>
        )}
        {detail}
      </div>
    </div>
  );
}
```

(Check Tailwind v4's container-query variants in its docs for your installed version: `@min-[640px]:` means container width ≥ 640 px and `@max-[640px]:` means < 640 px.)

- [ ] **Step 6: The design gallery (preview only)**

`src/screens/design/design-gallery.tsx` renders, on the `ambient` background: every colour token as a labelled swatch, the type scale (xs, sm, base, lg, stat, and mono at each), every `STATUS` entry as `StatusIcon` with its word, `CountBadge` pill and rail in both tones, a `Panel` with rows, the four `Stat` tiles (with Failed at 0 and at 2), `EmptyState`, `ErrorPanel` (normal and busy), buttons in every variant and size, an input with its invalid state, and `ListDetail` with a fake list. Task 13 routes `#/_design` to it in preview mode only. For now render it from `App.tsx` when `location.hash === "#/_design"`, else the smoke page.

- [ ] **Step 7: Verify, including visually**

Run: `cd crates/app/ui && bun run build`
Expected: passes.

Open the preview at `http://localhost:5199/?scenario=problems#/_design` in the built-in browser pane at about 960×640 and 480×640. Check against the Design direction: token colours exact, only red and amber carry hue (plus primary on buttons and focus), Inter and JetBrains Mono render (not a fallback font), numerals tabular, focus rings visible when tabbing, no drop shadows, `ListDetail` switches to one pane below 640 px. Fix what does not match. If the browser pane is not available to you, say so in the report.

- [ ] **Step 8: Commit**

```bash
git add crates/app/ui
git commit -m "feat(ui): instrument-panel design system: tokens, fonts, shadcn/ui, status components

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: App shell: adaptive sidebar, routes, profile switcher, placeholders

**UI task: load and follow the frontend-design skill before writing code; the Design direction section above binds it.** Compare with `navigation.html` option A, `icons-status.html` option A (sidebar with count badges), and `home.html`'s header row.

**Files:**
- Create: `crates/app/ui/src/components/app/{app-shell,app-sidebar,profile-switcher,create-profile-dialog,error-boundary}.tsx`, `crates/app/ui/src/hooks/use-media-query.ts`, `crates/app/ui/src/lib/toast.ts`, `crates/app/ui/src/lib/routes.ts`, `crates/app/ui/src/screens/placeholder.tsx`
- Modify: `crates/app/ui/src/App.tsx`, `crates/app/ui/src/main.tsx`, `crates/app/ui/src/components/ui/sidebar.tsx`

**Interfaces:**
- Consumes: `useHomeSummary`, `useActivateProfile`, `useCreateProfile`, `useDataChanged`, `isPreview` (Task 11); design components (Task 12).
- Produces:
  - Routes (wouter hash): `/`, `/runs`, `/runs/:runId`, `/variables`, `/variables/:name`, `/scripts`, `/scripts/:name`, `/apps`, `/apps/:id`, `/connect`, `/settings`, and `/_design` in preview mode. Tasks 14 and 15 fill `/` and `/runs`.
  - `AppShell` renders the sidebar, the `ScreenHeader` with the route's title and the `ProfileSwitcher`, and the screen.
  - `showError(error, retry?)` in `@/lib/toast` (spec §7: a failed action shows a toast; "busy" offers Try again).
  - `CreateProfileDialog({open, onOpenChange, activate})` (used by Home's first-run step in Task 14).

- [ ] **Step 1: Width hook and the sidebar's behaviour**

`src/hooks/use-media-query.ts`:

```ts
import { useSyncExternalStore } from "react";

/** Whether a CSS media query matches, kept up to date. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}
```

In `src/components/ui/sidebar.tsx` (ruling 15): the provider takes `open`/`onOpenChange` from the app; delete the `useIsMobile` branch that renders a `Sheet`, the Ctrl/Cmd+B shortcut effect, and the cookie write. Keep `collapsible="icon"` rendering, `SidebarMenuButton`'s `tooltip` (shown only when collapsed), and the CSS variables `--sidebar-width` and `--sidebar-width-icon`. Remove `use-mobile.ts` and `sheet.tsx` if nothing else uses them.

- [ ] **Step 2: Routes and the sidebar**

`src/lib/routes.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import { NAV_ICONS } from "@/lib/status";
import type { SidebarBadges } from "@/api/tools.gen";

export type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Which count from `home_summary.badges` shows on it, and in which tint (spec §5.2). */
  badge?: { key: keyof SidebarBadges; tone: "destructive" | "warning" };
};

/** Spec §5.2 order. Settings sits at the bottom. */
export const NAV: NavItem[] = [
  { path: "/", label: "Home", icon: NAV_ICONS.home },
  { path: "/runs", label: "Runs", icon: NAV_ICONS.runs, badge: { key: "runs", tone: "destructive" } },
  { path: "/variables", label: "Variables", icon: NAV_ICONS.variables, badge: { key: "variables", tone: "warning" } },
  { path: "/scripts", label: "Scripts", icon: NAV_ICONS.scripts },
  { path: "/apps", label: "Hedge apps", icon: NAV_ICONS.apps, badge: { key: "apps", tone: "warning" } },
  { path: "/connect", label: "Connect", icon: NAV_ICONS.connect },
];
export const SETTINGS: NavItem = { path: "/settings", label: "Settings", icon: NAV_ICONS.settings, badge: { key: "settings", tone: "warning" } };

/** The nav item a location belongs to (`/runs/abc` → Runs). */
export function navFor(location: string): NavItem {
  return [...NAV, SETTINGS].find((n) => (n.path === "/" ? location === "/" : location === n.path || location.startsWith(`${n.path}/`))) ?? NAV[0];
}
```

`src/components/app/app-sidebar.tsx`: a shadcn `Sidebar collapsible="icon"` on `bg-sidebar` with a right hairline.
- Header: the brand mark (an 18 px square, radius 5 px, `bg-linear-135 from-[var(--brand-from)] to-[var(--brand-to)]`) and the word "HedgeBuddy" in `text-base font-semibold text-foreground-strong`; the word hides in the rail.
- `SidebarMenu` of `NAV`, and `SETTINGS` in `SidebarFooter`. Each item is a `SidebarMenuButton asChild isActive tooltip={label}` wrapping a wouter `Link`: 32 px tall, 16 px icon (`strokeWidth={1.75}`), `text-sm`, inactive `text-muted-foreground hover:bg-card hover:text-foreground`, active `bg-accent text-foreground-strong` with a 2 px `bg-primary` bar on the left edge (`before:` pseudo-element, inset 6 px top and bottom).
- Badges from `useHomeSummary().data?.badges`: a `CountBadge variant="pill"` right-aligned when labelled; in the rail, a `CountBadge variant="rail"` overlaid at the icon's top-right corner.
- Widths: `--sidebar-width: 12.5rem; --sidebar-width-icon: 3.25rem` on the provider.
- `aria-current="page"` on the active link.

- [ ] **Step 3: Profile switcher, create dialog, toasts**

`src/lib/toast.ts`:

```ts
import { toast } from "sonner";
import { BridgeError } from "@/api/bridge";

/** A failed action as a toast (spec §7). "Busy" offers Try again. */
export function showError(error: unknown, retry?: () => void) {
  const busy = error instanceof BridgeError && error.kind === "busy";
  const message = error instanceof Error ? error.message : String(error);
  toast.error(busy ? "Another HedgeBuddy is busy" : message, {
    description: busy ? "It is saving something. Try again in a moment." : undefined,
    action: busy && retry ? { label: "Try again", onClick: retry } : undefined,
  });
}
```

`src/components/app/create-profile-dialog.tsx`:

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { useCreateProfile } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** Main spec §5: a profile name is a slug. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function CreateProfileDialog({ open, onOpenChange, activate }: { open: boolean; onOpenChange: (open: boolean) => void; activate: boolean }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateProfile();
  const invalid = name.length > 0 && !SLUG.test(name);

  const submit = () =>
    create.mutate(
      { name, description, activate },
      {
        onSuccess: () => {
          onOpenChange(false);
          setName("");
          setDescription("");
          toast(`Profile ${name} created`);
        },
        onError: (e) => showError(e, submit),
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>New profile</DialogTitle>
          <DialogDescription>A profile holds the variables and scripts for one kind of job.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (SLUG.test(name)) submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              autoFocus
              className="font-mono"
              placeholder="commercial-one-day"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              aria-invalid={invalid}
              aria-describedby="profile-name-hint"
            />
            <p id="profile-name-hint" className={cn("text-xs", invalid ? "text-destructive" : "text-muted-foreground")}>
              {invalid ? "Use lowercase letters, digits and dashes, starting with a letter or digit." : "Lowercase letters, digits and dashes."}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-description">
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input id="profile-description" placeholder="Client X, single-day commercial" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!SLUG.test(name) || create.isPending}>Create profile</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`src/components/app/profile-switcher.tsx`: a pill trigger (`h-7 rounded-full border border-border-strong bg-card px-3`, Lucide `layers` icon in `muted-foreground`, the profile name in `font-mono text-xs text-foreground-strong`, truncating at 200 px, `chevron-down`) opening a `DropdownMenu` aligned to the end: a `micro-label` "Profiles", one item per profile with a `check` icon on the active one (profile names in mono), a separator, and "New profile…" with a `plus` icon that opens `CreateProfileDialog` with `activate`. Selecting another profile calls `useActivateProfile().mutate(name, { onError: (e) => showError(e, retry) })`. It reads `active_profile` and `profiles` from `useHomeSummary()`, shows a 28 px pill-shaped `Skeleton` while loading, and renders nothing when there is no active profile (Home then shows its first-run steps). The trigger's `aria-label` is "Profile <name>. Change profile".

- [ ] **Step 4: Placeholders, error boundary, shell, routes**

`src/screens/placeholder.tsx`: one designed screen for the five later screens. It shows the screen's nav icon in the `EmptyState` tile, the title, and one plain sentence per screen:

| Screen | Sentence |
|---|---|
| Variables | "Editing variables here arrives in the next update. Until then, ask Claude to set them." |
| Scripts | "Managing scripts here arrives in the next update. Until then, ask Claude to write and attach them." |
| Hedge apps | "Checking each Hedge app here arrives in the next update. Home already flags stale entries and version warnings." |
| Connect | "Setting up Claude Desktop from here arrives in a later update. Until then, follow the README's “Use it from Claude” steps." |
| Settings | "The Python check and the one-click package install arrive in a later update." |

When the route carries a name (`/variables/CLIENT_EMAIL`), the placeholder names it in mono above the sentence ("You followed a link to CLIENT_EMAIL."), so attention links still land somewhere meaningful.

`src/components/app/error-boundary.tsx`: a class component that catches render errors and shows an `ErrorPanel` titled "This screen stopped working" with Retry resetting the boundary.

`src/components/app/app-shell.tsx`:

```tsx
import { useLocation } from "wouter";
import { AppSidebar } from "@/components/app/app-sidebar";
import { ErrorBoundary } from "@/components/app/error-boundary";
import { ProfileSwitcher } from "@/components/app/profile-switcher";
import { ScreenHeader } from "@/components/app/screen-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useMediaQuery } from "@/hooks/use-media-query";
import { navFor } from "@/lib/routes";

/** Spec §4.5: labelled sidebar from 720 px, icon rail below. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const wide = useMediaQuery("(min-width: 720px)");
  const [location] = useLocation();
  const title = location === "/_design" ? "Design system" : navFor(location).label;
  return (
    <SidebarProvider open={wide} onOpenChange={() => {}} style={{ "--sidebar-width": "12.5rem", "--sidebar-width-icon": "3.25rem" } as React.CSSProperties}>
      <AppSidebar />
      <SidebarInset className="ambient flex h-svh min-w-0 flex-col">
        <ScreenHeader title={title}>
          <ProfileSwitcher />
        </ScreenHeader>
        <main className="min-h-0 flex-1">
          <ErrorBoundary key={location}>
            <div key={location} className="h-full animate-rise">{children}</div>
          </ErrorBoundary>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

`src/App.tsx`:

```tsx
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { isPreview } from "@/api/bridge";
import { useDataChanged } from "@/api/events";
import { AppShell } from "@/components/app/app-shell";
import { DesignGallery } from "@/screens/design/design-gallery";
import { Placeholder } from "@/screens/placeholder";

export default function App() {
  useDataChanged();
  return (
    <Router hook={useHashLocation}>
      <AppShell>
        <Switch>
          <Route path="/">{/* Task 14: <HomeScreen /> */}<Placeholder screen="home" /></Route>
          <Route path="/runs">{/* Task 15 */}<Placeholder screen="runs" /></Route>
          <Route path="/runs/:runId">{() => <Placeholder screen="runs" />}</Route>
          <Route path="/variables">{() => <Placeholder screen="variables" />}</Route>
          <Route path="/variables/:name">{(p) => <Placeholder screen="variables" name={decodeURIComponent(p.name)} />}</Route>
          <Route path="/scripts">{() => <Placeholder screen="scripts" />}</Route>
          <Route path="/scripts/:name">{(p) => <Placeholder screen="scripts" name={decodeURIComponent(p.name)} />}</Route>
          <Route path="/apps">{() => <Placeholder screen="apps" />}</Route>
          <Route path="/apps/:id">{(p) => <Placeholder screen="apps" name={p.id} />}</Route>
          <Route path="/connect">{() => <Placeholder screen="connect" />}</Route>
          <Route path="/settings">{() => <Placeholder screen="settings" />}</Route>
          {isPreview && <Route path="/_design"><DesignGallery /></Route>}
          <Route><Placeholder screen="home" /></Route>
        </Switch>
      </AppShell>
    </Router>
  );
}
```

(Home and Runs use temporary placeholders here; Tasks 14 and 15 replace those two routes. The placeholder component accepts `home` and `runs` for this interim.)

`src/main.tsx`: wrap `<App />` in `TooltipProvider` (delay 300 ms) inside `QueryClientProvider`, and render `<Toaster theme="dark" position="bottom-right" />` next to it.

- [ ] **Step 5: Verify, including visually**

Run: `cd crates/app/ui && bun run build && cd /e/Coding/hedgebuddy && cargo build -p hedgebuddy-app`
Expected: passes.

In the browser pane (`ui-mock`), at 960×640 and 480×640, scenarios `problems`, `healthy`, `empty`, `busy`:
- Wide: labelled sidebar in spec order, Settings at the bottom, count badges on Runs (red), Variables, Hedge apps, Settings (amber) in `problems`, none in `healthy`; the active item has the accent background and the primary bar.
- Narrow (480): the icon rail; hovering an icon shows its label; badges overlay the icons.
- The profile switcher lists both profiles, switches (the header updates), and "New profile…" validates the name live; in `busy` a switch shows the busy toast with Try again.
- Each placeholder route reads well and names the linked item.
- Tab through: every control shows the focus ring.

If the browser pane is not available to you, say so in the report.

- [ ] **Step 6: Commit**

```bash
git add crates/app/ui
git commit -m "feat(ui): app shell with adaptive sidebar, routes, profile switcher

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Home screen

**UI task: load and follow the frontend-design skill before writing code; the Design direction section above binds it.** Compare with `home.html` (wide and narrow) and `icons-status.html` option A's "Needs attention" panel. Spec §6.1 is binding.

**Files:**
- Create: `crates/app/ui/src/screens/home/{home-screen,attention-panel,recent-runs-panel,claude-lately-panel,first-run}.tsx`
- Modify: `crates/app/ui/src/App.tsx` (route `/`)

**Interfaces:**
- Consumes: `useHomeSummary`, `useActivateProfile` (Task 11); `HomeSummaryOutput`, `AttentionItem`, `Run`, `ActivityRecord` types; `Stat`, `Panel`, `StatusIcon`, `EmptyState`, `ErrorPanel`, `Mono` (Task 12); `CreateProfileDialog`, `showError` (Task 13); `when`, `plural`, `appName` (Task 12).
- Produces: `HomeScreen` on route `/`.

- [ ] **Step 1: Attention rows**

`src/screens/home/attention-panel.tsx` turns each `AttentionItem` into a row. The switch is exhaustive over `item.kind` (a `never` check makes a new kind a type error):

| `kind` | Status icon | Text | Link |
|---|---|---|---|
| `run_failed` | `runFailed` | `<Mono>{script}</Mono> failed {when(started_at)}`, plus ` · {profile}` in muted text when it is not the active profile | `/runs/<run_id>`, "Runs" |
| `more_failed_runs` | `runFailed` | `{count} more failed {plural(count, "run")}` | `/runs`, "Runs" |
| `variable_issue` | `varMissing` | missing: `<Mono>{name}</Mono> is needed but not set`; mismatch: `<Mono>{name}</Mono> should be {type}, not {actual}` | `/variables/<name>`, "Variables" |
| `stale_entries` | `stale` | `{count} {app_name} {plural(count,"event")} {count === 1 ? "points at a deleted script" : "point at deleted scripts"}` | `/apps/<app>`, "Hedge apps" |
| `package_problem` | `package` | Python missing: "Python 3 is not installed"; package missing: "hedgebuddy package is not installed (needs {required})"; wrong version: "hedgebuddy package is {installed}, needs {required}" | `/settings`, "Settings" |
| `app_newer` | `alert` | `{app_name} {version before " ("} is newer than tested ({tested_against})` | `/apps/<app>`, "Hedge apps" |
| `scripting_off` | `alert` | `Scripting is off in {app_name}, which has {events} {plural(events,"event")} attached` | `/apps/<app>`, "Hedge apps" |

Each row is a wouter `Link`: `flex min-h-9 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60`, the status icon, the text (`min-w-0 flex-1`, wrapping), and on the right the link label in `text-xs text-link` plus a 14 px `chevron-right`; under 640 px the label hides and only the chevron stays. With no items the panel shows `EmptyState` (icon `circle-check`, "Nothing needs a look", "Runs, variables, Hedge apps and Python are all fine.") in its compact form.

- [ ] **Step 2: Recent runs and Claude, lately**

`recent-runs-panel.tsx`: up to 5 rows, each a `Link` to `/runs/<run_id>`: `StatusIcon` for `runStatusKey(run.status)`, the script in `Mono` (`text-sm`, truncating), the profile in muted text when it is not the active one, and `when(run.started_at)` right-aligned in `readout text-xs text-muted-foreground`. Header action: a `Link` "All runs" to `/runs` in `text-xs text-link`. Empty: `EmptyState` (icon `history`, "No runs yet", "Each time a Hedge app fires an event, its attached script records a run here.").

`claude-lately-panel.tsx`: up to 3 rows: the tool name in `Mono`, the target in muted mono (truncating), a status icon only when the outcome is not `ok` (`outcomeKey`), and the time right-aligned. Empty: `EmptyState` (icon `plug`, "Claude hasn't used HedgeBuddy yet", "Connect Claude so it can set up variables and scripts for you.", action: a `Link` "Connect Claude" to `/connect`).

- [ ] **Step 3: The screen and the first run**

`src/screens/home/home-screen.tsx`:

```tsx
import { useHomeSummary } from "@/api/queries";
import { ErrorPanel } from "@/components/app/error-panel";
import { Stat } from "@/components/app/stat";
import { Skeleton } from "@/components/ui/skeleton";
import { AttentionPanel } from "./attention-panel";
import { ClaudeLatelyPanel } from "./claude-lately-panel";
import { FirstRun } from "./first-run";
import { RecentRunsPanel } from "./recent-runs-panel";

/** Spec §6.1. Everything on it links to the screen that fixes it. */
export function HomeScreen() {
  const summary = useHomeSummary();
  if (summary.isPending) return <HomeSkeleton />;
  if (summary.isError) {
    return (
      <div className="p-4">
        <ErrorPanel error={summary.error} onRetry={() => void summary.refetch()} />
      </div>
    );
  }
  const s = summary.data;
  if (!s.active_profile) return <FirstRun profiles={s.profiles} />;
  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-3 p-4 @max-[640px]:p-3">
        <div className="grid grid-cols-2 gap-2 @min-[640px]:grid-cols-4">
          <Stat label={s.since ? "Runs since last open" : "Runs, last 30 days"} value={s.counts.runs_since} />
          <Stat label="Failed" value={s.counts.failed_since} tone="destructive" />
          <Stat className="@max-[640px]:hidden" label="Scripts attached" value={s.counts.scripts_attached} />
          <Stat className="@max-[640px]:hidden" label="Variables" value={s.counts.variables} />
        </div>
        <div className="grid items-start gap-3 @min-[640px]:grid-cols-[1.25fr_1fr]">
          <AttentionPanel items={s.attention} activeProfile={s.active_profile} className="animate-rise [animation-delay:40ms]" />
          <div className="flex min-w-0 flex-col gap-3">
            <RecentRunsPanel runs={s.recent_runs} activeProfile={s.active_profile} className="animate-rise [animation-delay:80ms]" />
            <ClaudeLatelyPanel records={s.recent_activity} className="animate-rise [animation-delay:120ms] @max-[640px]:hidden" />
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="@container p-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-2 @min-[640px]:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[66px] rounded-lg bg-card" />
        ))}
      </div>
      <div className="mt-3 grid gap-3 @min-[640px]:grid-cols-[1.25fr_1fr]">
        <Skeleton className="h-48 rounded-lg bg-card" />
        <Skeleton className="h-48 rounded-lg bg-card" />
      </div>
    </div>
  );
}
```

`first-run.tsx` (spec §6.1: with no profile, two steps): a `micro-label` "Welcome", the heading "Two steps to get HedgeBuddy ready" (`text-lg font-semibold`), then an ordered list of two `surface` rows, each with its step number as a readout in a 24 px bordered square, a title, one sentence and an action:
1. "Create your first profile" — "A profile holds the variables and scripts for one kind of job, like a one-day commercial." Action: primary button "Create profile" opening `CreateProfileDialog` (`activate`). When `profiles` is not empty but none is active, this step reads "Choose a profile" with one outline button per profile (mono name) calling `useActivateProfile`.
2. "Connect Claude" — "Claude can then set up variables and scripts for you." Action: outline button linking to `/connect`.

Content is left-aligned in a column up to 560 px wide with 24 px padding; it rises in with the screen.

Route `/` renders `HomeScreen` in `App.tsx`.

- [ ] **Step 4: Verify, including visually**

Run: `cd crates/app/ui && bun run build`
Expected: passes.

Browser pane, `ui-mock`:
- `problems` at 960×640: four readouts (Failed tinted), "Needs attention" with rows in the table's order and wording, Recent runs and Claude, lately on the right; everything links to the right route. Compare with `home.html` wide; the only colours are the red failed row/tile and the amber rows.
- `problems` at 480×640: two readouts, Needs attention, Recent runs; Claude, lately hidden; link labels reduced to chevrons.
- `healthy`: Failed at 0 in neutral, "Nothing needs a look".
- `empty`: the two first-run steps; creating a profile switches Home to the dashboard.
- `error`: the inline error with Retry.
- Keyboard: Tab reaches every row and link with a visible ring.

If the browser pane is not available to you, say so in the report.

- [ ] **Step 5: Commit**

```bash
git add crates/app/ui
git commit -m "feat(ui): Home screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Runs screen

**UI task: load and follow the frontend-design skill before writing code; the Design direction section above binds it.** Compare with the Runs half of `scripts-runs.html` (the spec's icons replace its dots). Spec §6.2 is binding.

**Files:**
- Create: `crates/app/ui/src/screens/runs/{runs-screen,run-list,run-detail}.tsx`, `crates/app/ui/src/hooks/use-list-keyboard.ts`
- Modify: `crates/app/ui/src/App.tsx` (routes `/runs`, `/runs/:runId`)

**Interfaces:**
- Consumes: `useRuns`, `useRun`, `useHomeSummary` (Task 11); `ListDetail`, `StatusIcon`, `EmptyState`, `ErrorPanel`, `Mono`, `Panel`, format helpers (Task 12); `showError` (Task 13).
- Produces: `RunsScreen({ runId })` on `/runs` and `/runs/:runId`; `useListKeyboard(ids, selectedId, onSelect)`.

- [ ] **Step 1: Keyboard navigation hook**

`src/hooks/use-list-keyboard.ts`:

```ts
import { useCallback } from "react";

/** Arrow keys, Home and End move the selection through `ids` (spec §7). Attach to the list's onKeyDown. */
export function useListKeyboard(ids: string[], selectedId: string | null, onSelect: (id: string) => void) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (ids.length === 0) return;
      const at = selectedId ? ids.indexOf(selectedId) : -1;
      const next =
        e.key === "ArrowDown" ? Math.min(ids.length - 1, at + 1)
        : e.key === "ArrowUp" ? Math.max(0, at === -1 ? 0 : at - 1)
        : e.key === "Home" ? 0
        : e.key === "End" ? ids.length - 1
        : null;
      if (next === null) return;
      e.preventDefault();
      onSelect(ids[next]);
      document.getElementById(`run-${ids[next]}`)?.scrollIntoView({ block: "nearest" });
    },
    [ids, selectedId, onSelect],
  );
}
```

- [ ] **Step 2: The list**

`run-list.tsx`:
- **Toolbar** (40 px, `border-b`): a `ToggleGroup` with "All" and "Failed" (the Failed item shows the failure count in the list as a `CountBadge` when above 0); a filter `Input` (`h-7`, `search` icon, placeholder "Filter runs", matching script, event, app and profile, case-insensitive); and, when there is an active profile, a `Switch` labelled "All profiles" (off: the active profile's runs; on: every profile's). Under 480 px the filter input moves to a second row.
- **Groups by local day** (`dayKey(started_at)`), newest first. Each group has a sticky header (`micro-label`, `bg-background/95 backdrop-blur-[2px]`, 28 px): `dayLabel` on the left, the group's count in `readout` on the right.
- **"Since you last opened"**: when `home_summary.since` is set and the list holds runs on both sides of it, a hairline divider labelled "since you last opened" in `micro-label` sits between the newest run before it and the oldest after it.
- **Row** (a `Link` to `/runs/<run_id>`, `id="run-<run_id>"`, `role="option"`, `aria-selected`): line 1 is `StatusIcon`, the script in `Mono` (`text-sm`, truncating), and `clock(started_at)` right-aligned (`readout text-xs text-muted-foreground`); line 2 (`text-xs text-muted-foreground`, indented under the name): `{event ?? "no event"}` then `· exit {code}` for failures, `· {duration}` for ok runs, `· unfinished` without an end, and `· {profile}` when it is not the active profile. The failed word is not repeated; the red icon carries it. Selected: `bg-accent` with a 2 px `bg-primary` bar on the left; hover `bg-accent/50`.
- The scroll container is `role="listbox"`, `aria-label="Runs"`, `tabIndex={0}`, and uses `useListKeyboard` to navigate (replace the location, so Back goes to the list).
- **States:** loading shows 8 skeleton rows; an error shows `ErrorPanel`; no runs at all: `EmptyState` (icon `history`, "No runs yet", "Each time a Hedge app fires an event, its attached script records a run here."); Failed with none: (icon `circle-check`, "No failed runs", "Everything that ran in the last 30 days succeeded."); a filter with no match: (icon `search-x`, "No runs match “{query}”").

- [ ] **Step 3: The detail**

`run-detail.tsx` loads `useRun(runId)`:
- **Header:** the script name in `Mono` (`text-base font-medium`, truncating) and a status pill: failed `rounded-full bg-destructive-tint px-2 text-xs text-destructive ring-1 ring-inset ring-destructive-border` reading "failed · exit {code}"; ok `bg-accent text-muted-foreground` reading "ok · exit 0"; unfinished `bg-accent text-muted-foreground` reading "unfinished".
- **Facts** as a definition list (`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm`, labels in `text-muted-foreground`, values in `text-foreground`, two such grids side by side from 640 px): App (`appName`), Event (mono), Profile (mono), Started (`dayLabel` + `clock(…, true)`), Ended, Duration, Exit code (`readout`), Run id (mono, `text-xs`, selectable).
- **Log:** `micro-label` "Log", then a `well` with one line per record: `clock(ts, true)` in muted mono, then the message in mono `text-xs` (wrapping). No lines: "No log lines." in muted text.
- **Traceback** (only when present): `micro-label` "Traceback", then a destructive well: `rounded-md border border-destructive-border bg-destructive-tint/70 p-3 font-mono text-xs leading-relaxed text-destructive/90 whitespace-pre-wrap break-words`.
- **Actions** in a footer bar (`border-t`, `h-11`, right-aligned): "Copy details" (`copy` icon; writes the text below to the clipboard, then `toast("Copied run details")`, or `showError` on failure) and "Open script" (`file-code` icon; a `Link` to `/scripts/<script>`).
- Copy details text:

```
on_copy_complete.py: failed (exit 1)
App: OffShoot · Event: FileCopyCompleted · Profile: commercial-one-day
Started: Today 02:14:07 · Ended: 02:14:09 · Duration: 2.0 s
Run id: 01J7ZK3Q8R

Log
02:14:08 copy of A003 finished, posting to Slack

Traceback
Traceback (most recent call last):
  …
```

- **States:** loading shows skeleton lines; a `get_run` error that says "not found" shows `EmptyState` (icon `circle-dashed`, "This run is gone", "Runs older than 30 days are removed.") with a Back link; other errors show `ErrorPanel`.
- The body scrolls; the header and footer stay put.

`runs-screen.tsx`:

```tsx
import { useState } from "react";
import { useLocation } from "wouter";
import { useHomeSummary, useRuns } from "@/api/queries";
import { EmptyState } from "@/components/app/empty-state";
import { ListDetail } from "@/components/app/list-detail";
import { History } from "lucide-react";
import { RunDetail } from "./run-detail";
import { RunList } from "./run-list";

/** Spec §6.2: runs grouped by day, All or Failed, the active profile's with an All profiles switch. */
export function RunsScreen({ runId }: { runId?: string }) {
  const summary = useHomeSummary();
  const active = summary.data?.active_profile ?? null;
  const [allProfiles, setAllProfiles] = useState(false);
  const runs = useRuns(active && !allProfiles ? active : null);
  const [, navigate] = useLocation();
  return (
    <ListDetail
      selected={Boolean(runId)}
      onBack={() => navigate("/runs")}
      backLabel="Runs"
      list={
        <RunList
          query={runs}
          selectedId={runId ?? null}
          activeProfile={active}
          since={summary.data?.since ?? null}
          allProfiles={allProfiles}
          onAllProfilesChange={setAllProfiles}
          onSelect={(id) => navigate(`/runs/${encodeURIComponent(id)}`, { replace: Boolean(runId) })}
        />
      }
      detail={
        runId ? (
          <RunDetail runId={runId} activeProfile={active} />
        ) : (
          <EmptyState icon={History} title="Pick a run" className="m-auto">
            Choose a run on the left to see its log and traceback.
          </EmptyState>
        )
      }
    />
  );
}
```

Routes in `App.tsx`: `/runs` → `<RunsScreen />`, `/runs/:runId` → `{(p) => <RunsScreen runId={decodeURIComponent(p.runId)} />}`. Home's run links now land here.

- [ ] **Step 4: Verify, including visually**

Run: `cd crates/app/ui && bun run build && cd /e/Coding/hedgebuddy && cargo build -p hedgebuddy-app`
Expected: passes.

Browser pane, `ui-mock`, scenario `problems`:
- 960×640: list left, detail right; days grouped (Today, Yesterday, a weekday); the "since you last opened" divider; Failed filter shows only the failures; the filter field narrows; "All profiles" adds the `doc-series` runs, labelled with their profile. Selecting the failed run shows the red pill, facts, the log and the traceback well; Copy details copies; Open script goes to the Scripts placeholder naming the script.
- Arrow keys move through runs with the detail following; Home and End jump.
- 480×640: the list alone; choosing a run slides the detail over it with a Back button; Escape and Back return to the list.
- `healthy`: the Failed filter's empty state; `empty`: "No runs yet"; `error`: the inline error with Retry.
- A deep link `#/runs/<an old id>` that does not exist shows "This run is gone".

If the browser pane is not available to you, say so in the report.

- [ ] **Step 5: Commit**

```bash
git add crates/app/ui
git commit -m "feat(ui): Runs screen with day groups, filters and run detail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Docs: smoke checklist, changelog, schema and UI readmes

**Files:**
- Modify: `docs/smoke-checklist.md`, `CHANGELOG.md`, `README.md`
- Create: `crates/app/ui/README.md`

- [ ] **Step 1: Smoke checklist, desktop app part**

Add a section "6. Desktop app (phase 5A)" to `docs/smoke-checklist.md`, run on Windows and macOS (the checklist still needs the user's go-ahead before it is run):
- [ ] Launch the app (`cargo tauri dev` from `crates/app`, or an installer build). Home shows the active profile, the four readouts and Needs attention. Result:
- [ ] With the app open, run `hedgebuddy call set_var '{"name":"SMOKE","type":"string","value":"1"}'` in a terminal. The Variables count on Home changes within a second without clicking. Result:
- [ ] Ask Claude (MCP) to run any write tool. Home's "Claude, lately" shows the call within a second. Result:
- [ ] Make a script fail (section 3). Home shows the failure with a red Failed readout; Runs shows the run with its traceback; Copy details pastes a readable summary. Result:
- [ ] Put the window beside OffShoot at about 480 px wide. The sidebar becomes the icon rail with badges, Home keeps the run counts, Needs attention and Recent runs, and Runs shows the list with the detail sliding over it. Result:
- [ ] Hold the data folder's lock (run `hedgebuddy call run_app_command` with a long `wait_seconds` from Claude) and switch profiles in the app. The "Another HedgeBuddy is busy" toast offers Try again. Result:
- [ ] Close the window: the app quits, and nothing stays in the tray or task list. Result:

- [ ] **Step 2: Changelog, READMEs**

`CHANGELOG.md` under Unreleased: Added — the desktop app's foundation (Home, Runs, adaptive sidebar, profile switching), typed tool results with MCP `outputSchema` and `structuredContent`, `hedgebuddy tools --schemas`, the Claude activity log, the cross-process lock, preferences; Changed — `check_requirements` counts a secret without a stored value as unmet, run files decode lossily, Windows rename retry, macOS floor 26.

`crates/app/ui/README.md`: how to run the app (`cargo tauri dev` in `crates/app`), the browser preview (`bun run dev:mock`, the scenarios, `window.__hb.emit`), regenerating types (`bun run gen`, CI's `gen:check`), where tokens live (`src/styles/globals.css`) and the design rules in one paragraph (dark only, colour only for problems, Lucide icon plus word, Inter and JetBrains Mono).

`README.md`: in the development section, one line pointing to `crates/app/ui/README.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/smoke-checklist.md CHANGELOG.md README.md crates/app/ui/README.md
git commit -m "docs: desktop app smoke steps, changelog, UI readme

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (phase 5 spec, 5A scope):**
- §3 platforms: macOS 26 floor and build targets → Task 10 (and Task 11's Vite config).
- §4.1 crates → Task 1 (tools crate), Tasks 7 and 10 (CLI holds activity logging; app is a bridge).
- §4.2 typed results, `outputSchema`, `structuredContent`, `tools --schemas`, `gen-tools.ts`, CI check, the two schema tests → Tasks 2, 3, 11.
- §4.3 app commands for 5A (`tool`, `home_summary` with the 60 s Python cache, `activity`, `preferences_get`, `preferences_set`), CSP → Tasks 9, 10.
- §4.4 cross-process lock → Task 4; batched notifications and `data-changed` → Tasks 6, 10; activity log → Task 7; preferences and the startup `last_opened` rule → Tasks 8, 9, 10; the three parked items → Task 5.
- §4.5 stack, TanStack Query invalidation on `data-changed`, focus refetch for Hedge state, wouter hash routes, adaptive sidebar at 720 px, list-detail at 640 px, window sizes, bundled fonts, no React unit tests → Tasks 10–15.
- §5 tokens, radius, spacing, type, Lucide icons and the status table, sidebar badges → Tasks 12, 13.
- §6.1 Home and §6.2 Runs → Tasks 14, 15.
- §7 patterns used in 5A: errors (inline Retry, toasts, busy Try again), empty states, keyboard → Tasks 12–15. The change-preview dialog, typed editors and Save belong to 5B.
- §9 testing for 5A: tool schema tests (Task 2), MCP contract (Tasks 3, 7), lock including the 10 s timeout (Task 4), batching (Task 6), activity trimming and target naming with no values (Task 7), preferences (Task 8), tolerant runs, rename retry, valueless secret (Task 5), home summary and activity reading against `FakeHost` (Task 9), frontend type-check and stale-types check (Task 11), smoke steps (Task 16).
- Main spec §5 storage additions are already in the spec; `schema/README.md` gains the two schemas (Tasks 7, 8).

**Placeholders:** Rust tasks carry complete code; where an installed crate's API may differ (`jsonschema` error paths, jiff's `%.3f`, `FakeHost::runs`, Tauri's `setup` error type), the step says what to check and what the test fixes. UI tasks carry complete code for infrastructure, tokens and shared components, and precise specifications (classes, copy, states) for screen composition, which the frontend-design skill and the visual checks govern.

**Type consistency:** `ToolDef.output_schema`, `output_schema_of`, `schemas()` (Task 2) are used in Tasks 3 and 9. `Context::write_guard`, `with_lock_timeout`, `ToolError::is_busy` (Task 4) are used in Tasks 9 and 10. `ActivityRecord::now`, `activity_target`, `activity_outcome` (Task 7) are used in Tasks 9 and the MCP server. `PreferencesPatch`'s double option (Task 8) is used in Tasks 9 and 10. `HomeSummary` and friends (Task 9) are the generated `HomeSummaryOutput`, `AttentionItem`, `SidebarBadges` in Tasks 11–15. Bridge names (`callTool`, `callApp`, `BridgeError`, `isPreview`) and query hooks (Task 11) are used unchanged in Tasks 12–15.
