# Phase 5B: Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop app the place to edit a setup by hand: the Variables screen with typed editors, the Scripts screen with attach, detach, sync and new-from-template, the Hedge apps screen with stale clean-up, one change-preview dialog in front of every change outside the data folder and every deletion, and profile delete, export and import.

**Architecture:** Every change still goes through the 31 tools (`hedgebuddy_tools::call`) or an app-only command in `hedgebuddy_tools::app`; the Tauri crate stays a thin wrapper. New read models (`variables_overview`, `scripts_overview`, `apps_overview`, `path_status`) compute in Rust, with `FakeHost` tests, what the screens show, so no business rule is duplicated in TypeScript. Profile export and import live in core. Pickers (`tauri-plugin-dialog`) and opening/revealing (`tauri-plugin-opener`) run on the Rust side, so the webview keeps the single `core:event:default` permission. The UI adds a change-preview dialog that runs a tool with `dry_run: true`, words the result, and applies it on confirmation, plus typed editors, an unsaved-changes guard, and a richer in-memory mock for the browser preview.

**Tech Stack:** as 5A (Rust 1.98, schemars 1, Tauri 2.11, React 19, TypeScript 7, Vite 8, Tailwind v4, shadcn/ui, TanStack Query, wouter), plus `tauri-plugin-dialog` 2 and `tauri-plugin-opener` 2.

**Spec:** `docs/superpowers/specs/2026-09-23-phase5-desktop-app-design.md` (binding; §4.3 app commands, §5, §6.3 Variables, §6.4 Scripts, §6.5 Hedge apps, §7 shared patterns, §9 testing). Main spec §5 (storage, variable types), §8 (tool rules). Mockups: `docs/superpowers/specs/2026-09-23-phase5-mockups/variables.html` option B, `scripts-runs.html` (Scripts half), `hedge-apps.html`, `icons-status.html` option A; the spec wins over the mockups (no coloured dots, no teal, colour only for problems). 5A's plan (`docs/superpowers/plans/2026-09-23-phase5a-foundation.md`) describes the foundation this builds on.

## Global Constraints

- **Crates.** Logic in `hedgebuddy-core` and `hedgebuddy-tools`; `hedgebuddy-app` only wraps (Tauri commands, plugins, the watcher). App-only commands are never registered as tools; profile export stays app-only (house rule: an agent must not be able to export secrets).
- **Change preview (spec §7).** "Any action that changes something outside the data folder, and any deletion, opens a dialog. It runs the tool with `dry_run: true`, then shows the planned changes in plain words. The words come from the dry-run result: registry values, workspace preferences, files, and what an attach would replace. Apply runs the tool again without `dry_run`." In 5B: attach, detach, sync, clear stale (one and all), delete script, delete variable, delete profile.
- **Saving (spec §7).** "Variable edits have an explicit Save, which enables on change. Leaving with unsaved changes asks first."
- **Typed editors (spec §7).** string: text field; secret: masked field, Reveal fetches the value with `reveal: true` on click; int, float: number field; bool: switch; path: text field plus a folder picker, with a "not mounted" warning when the drive is absent; url: text field with an http(s) check; string[], path[]: list editor with add, remove and reorder. "Invalid values cannot be saved, and the reason shows under the field." Validation mirrors core (`crates/core/src/variable.rs`): int is an integer, float a number, path non-empty, url starts with `http://` or `https://`, path[] items non-empty.
- **Errors (spec §7).** A failed load shows an inline panel with Retry; a failed action shows a toast with its message; "Another HedgeBuddy is busy" offers Try again.
- **Empty states.** Every list explains the next step when it is empty.
- **Keyboard.** Arrow keys move through lists; a filter field narrows them.
- **Screens.** Variables (§6.3), Scripts (§6.4), Hedge apps (§6.5) use list and detail (`ListDetail`, detail slides over below a 640 px container). Hedge app state lives outside the data folder: those screens refetch on window focus and have a refresh button. Attaching and detaching happen only from Scripts.
- **App commands added in 5B.** From spec §4.3: `open_in_editor(profile, script)`, `reveal_path(path)` ("Only paths inside the data folder, script paths and Hedge app files are allowed."), `script_template(app, event)`, `export_profile(name, include_secrets, dest)`, `import_profile(path, name)`. Plus (rulings below) `variables_overview`, `scripts_overview`, `apps_overview`, `path_status`, `open_app_docs`, `pick_folder`, `pick_export_path`, `pick_import_file`. Every command takes one argument named `args`.
- **Secrets stay masked.** Overviews and lists never carry a secret value; only `get_var` with `reveal: true`, on the operator's click, does. Export includes secrets only when `include_secrets` is set, and then the file is created owner-only on Unix.
- **Tests never touch the real machine.** `FakeHost` and temporary folders only; never write the real registry or real Hedge settings. Never run `docs/smoke-checklist.md`.
- **Frontend.** Same stack and design rules as 5A: dark only, tokens in `crates/app/ui/src/styles/globals.css`, Lucide icon plus word, colour only for problems (red failed and delete, amber needs a look), count badges, Inter and JetBrains Mono, 4 px grid, `ListDetail`, `ErrorPanel`, `EmptyState`, `StatusIcon`, `STATUS` map, `showError`. No React unit tests.
- **Browser preview.** `bun run dev:mock` on port 5199 (launch config `ui-mock`); scenarios `problems` (default), `healthy`, `empty`, `error`, `busy`, and (new) `macos`.
- **CI.** `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `cd python && uv run pytest -q`, `python scripts/sync_version.py --check`, `bun run gen:check` and `bun run build` in `crates/app/ui`; Windows and macOS.
- **Docs style.** Every `pub` item has a `///` doc comment; result and argument fields get a `///` line (schemars turns it into the schema description).
- **Git.** Branch `feat/phase5b-editing`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Design direction (frontend-design, binding for every UI task)

Everything in 5A's Design direction section still binds (concept "instrument panel", colour discipline, typography scale, 4 px grid, Lucide icons with `strokeWidth={1.75}`, motion, the four designed states, accessibility, the avoid-list, visual checks at about 960×640 and 480×640). Every UI implementer loads and follows frontend-design before writing code, and every UI review judges against it together with the spec and mockups. What 5B adds:

**Editing surfaces.** The detail pane of an editable item is a calm form, not a card grid: micro-label above each field (`VALUE · secret`, `DESCRIPTION`, `REQUIRED BY`), fields in `bg-well` with `border-border-strong`, 32 px tall, mono for names, paths, URLs and list items. A sticky footer carries the actions: Delete on the left as red text (destructive is for delete), Save on the right as the one primary button, disabled until something changed and everything is valid. A dirty form shows a quiet "Unsaved changes" micro-label beside Save.

**Validation.** The reason sits directly under the field in `text-xs text-destructive` with the field's border in `border-destructive-border`; nothing else turns red. Warnings that do not block saving (a path whose drive is not mounted) use amber text with `triangle-alert`.

**List editors (string[], path[]).** One row per item: a drag-free reorder with up and down icon buttons (keyboard reachable), a remove button, and an "Add" row at the end. Rows are 32 px, mono, on the well.

**Secrets.** Masked with `••••••••` until Reveal; Reveal is a quiet text button that swaps to Hide. The revealed value is never cached in the query cache beyond the detail's lifetime.

**The change-preview dialog.** A precise ledger of what will happen: one summary sentence, then a well with one row per change: a Lucide icon for the kind (`key-round` registry, `key-square` registry removal, `file-cog` OffShoot Helper workspace, `file-pen` file, `trash-2` deletion, `unlink` detach, `link` attach), the target in mono, and the detail in muted text. Things that need a look (what an attach replaces, events left pointing at a deleted script, unmet requirements) are amber rows with `triangle-alert` above the ledger. The footer has Cancel and one Apply button labelled with the verb ("Attach", "Detach", "Clear 3", "Delete"); deletion uses the destructive button. Planning shows skeleton rows; a dry-run error shows `ErrorPanel` inside the dialog and no Apply. Width up to 520 px; the ledger scrolls when long.

**Tables (Hedge apps events).** A hairline-ruled table in a `surface`: header row of micro-labels, 36 px rows, the event id in regular text, what it runs in mono, the status icon and word from `STATUS`, and a right-aligned text action ("Clear") only on stale rows.

**Script preview.** A read-only well with line numbers in muted tabular mono, the code in `text-xs` mono, soft-wrapped off, horizontal scroll inside the well, no syntax colours beyond muting the manifest docstring lines.

## Rulings made while planning

1. The screens read Rust-computed overviews: `variables_overview` (variables, masked, plus every requirement the profile's scripts declare with its state and the scripts that need it), `scripts_overview` (each script's manifest, target event, what the target runs now, every event that runs it, unmet requirements), `apps_overview` (status, availability on this OS, docs, events, attached and stale counts), and `path_status` (exists, drive mounted). Why: these combine catalog, registry and requirement rules that already live in Rust and must not be re-derived in TypeScript. Cost if wrong: four extra commands.
2. Pickers (`pick_folder`, `pick_export_path`, `pick_import_file`) and opening (`open_in_editor`, `reveal_path`, `open_app_docs`) run on the Rust side through `tauri-plugin-dialog` and `tauri-plugin-opener`; the webview keeps only `core:event:default`. Why: least privilege (spec §4.3 "capabilities allow only what these commands need"). Cost if wrong: none.
3. `open_app_docs(app)` opens the catalog's `https://` docs URL for the mockup's "Docs ↗" link; nothing else can be opened by URL.
4. `set_var` accepts an omitted `value` to keep the current one (the variable must exist with the same type). Why: editing a secret's description must not send the secret through the webview. Cost if wrong: an additive MCP contract change.
5. A profile export (format `hedgebuddy_profile_export: 1`) holds `profile.json`, every script's source, and secret values only with `include_secrets`; with secrets the file is created owner-only on Unix. Why: a profile is its variables and its scripts. Cost if wrong: scripts in a file the operator shares.
6. Import validates the whole file before writing, refuses secrets for variables that are not secret-typed, and removes a half-created profile when a write fails; the first profile becomes active, as with `create_profile`.
7. The toolbar profile menu (5A) gains Delete…, Export… and Import…; spec §6.3's "profile menu" is that one menu, available on every screen.
8. The app rebuilds its tool context when `<data>/catalog/` changes, so catalog overrides apply without a restart (5A's parked M5).
9. Unsaved changes are guarded on in-app navigation (route changes, selecting another item, hash links); closing the window is not guarded. Why: spec §7 talks about leaving an item; a close guard needs a window permission. Cost if wrong: a closed window loses an unsaved edit.
10. `editor_command` is split shell-style; `{file}` is replaced by the script path, else the path is appended. On Windows the program is resolved through `PATH` and `PATHEXT` (so `code` finds `code.cmd`) and started without a console window. Without a command, the system's default app for `.py` opens it.
11. A new script's suggested name is `on_<event in snake_case>.py`, with `_2`, `_3` … when taken.
12. After an attach or sync on macOS, the tool's apply note appears as a toast, and the script shows the `staged` state until OffShoot Helper applies it.
13. The mock gains a `macos` scenario (helper-workspace actions, staged states, the apply note).
14. The Variables list shows missing and wrong-typed requirements first (amber rows with Add or Fix), then the variables by name; requirements satisfied by a default are not listed separately.
15. `reveal_path` allows a path that exists and is inside the data folder, or is one of a Hedge app's resolved callback log, event log, or a path inside its presets folder.
16. 5A's parked `useCreateProfile` retry memory is cleared when the dialog closes and on any non-busy failure.

## File structure

| File | Responsibility |
|---|---|
| `crates/core/src/export.rs` (new) | `ProfileExport`, `ImportSummary`, `Store::{export_profile, import_profile}`, `write_profile_export`, `read_profile_export` |
| `schema/profile-export.schema.json` (new) + fixtures | export file contract |
| `crates/tools/src/variables.rs` | `set_var` keeps the value when `value` is omitted |
| `crates/tools/src/resources.rs` | template text shared with `script_template` |
| `crates/tools/src/app/overview.rs` (new) | `variables_overview`, `scripts_overview`, `apps_overview` |
| `crates/tools/src/app/files.rs` (new) | `path_status`, `reveal_target`, `editor_argv`, `find_in_path`, `script_file`, export/import wrappers, `script_template` |
| `crates/tools/src/app/mod.rs` | new argument and result types, registry entries |
| `crates/app/src/{commands,state,watcher,lib}.rs`, `crates/app/Cargo.toml` | plugins, new commands, catalog reload |
| `crates/app/ui/src/api/*` | regenerated types, hooks, invalidation |
| `crates/app/ui/src/lib/unsaved.ts`, `src/components/app/unsaved-dialog.tsx` (new) | unsaved-changes guard |
| `crates/app/ui/src/mock/model.ts` (new), `fixtures.ts`, `handlers.ts` | in-memory model behind every 5B tool and command |
| `crates/app/ui/src/lib/actions.ts`, `src/components/app/change-preview-dialog.tsx` (new) | the change-preview dialog and the wording of actions |
| `crates/app/ui/src/lib/var-values.ts`, `src/components/editors/*` (new) | typed editors and validation |
| `crates/app/ui/src/screens/variables/*` (new) | Variables |
| `crates/app/ui/src/components/app/{profile-switcher,delete-profile-dialog,export-profile-dialog,import-profile-dialog}.tsx` | profile menu |
| `crates/app/ui/src/screens/scripts/*` (new) | Scripts and the New script dialog |
| `crates/app/ui/src/screens/apps/*` (new) | Hedge apps |
| `docs/smoke-checklist.md`, `CHANGELOG.md`, `crates/app/ui/README.md`, `schema/README.md` | docs |

---

### Task 1: Profile export and import in core

**Files:**
- Create: `crates/core/src/export.rs`, `schema/profile-export.schema.json`, `schema/fixtures/invalid/profile-export/unknown-version.json`, `schema/fixtures/invalid/profile-export/missing-profile.json`
- Modify: `crates/core/src/lib.rs`, `crates/core/tests/schema_conformance.rs`, `crates/tools/src/resources.rs` (`SCHEMAS` gains `profile-export`; the resources count test goes up by one), `schema/README.md`

**Interfaces:**
- Produces: `pub struct ProfileExport { pub hedgebuddy_profile_export: u32, pub exported_at: String, pub profile: Profile, pub secrets: Option<BTreeMap<String, String>>, pub scripts: BTreeMap<String, String> }` (Serialize, Deserialize, JsonSchema, `deny_unknown_fields`); `pub struct ImportSummary { pub profile: String, pub active: bool, pub variables: usize, pub scripts: usize, pub secrets_imported: usize, pub secrets_missing: Vec<String> }` (Serialize, JsonSchema); `Store::export_profile(&self, name: &str, include_secrets: bool) -> Result<ProfileExport>`; `Store::import_profile(&self, export: &ProfileExport, name: &str) -> Result<ImportSummary>`; `pub fn write_profile_export(path: &Path, export: &ProfileExport) -> Result<()>`; `pub fn read_profile_export(path: &Path, max_bytes: u64) -> Result<ProfileExport>`; `pub const EXPORT_MAX_BYTES: u64 = 16 * 1024 * 1024`. All re-exported from the crate root.

- [ ] **Step 1: Write the failing tests**

`crates/core/src/export.rs`, tests first:

```rust
#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::secrets::VariableInput;
    use crate::variable::VarType;

    const COPY: &str = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\"}\n---\n\"\"\"\nprint('x')\n";

    fn store_with_profile() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("HedgeBuddy"));
        store.create_profile("a", "Client A").unwrap();
        store
            .set_variable("a", "PROJECT_NAME", VariableInput { ty: VarType::String, value: Some(json!("Spot")), description: "Name".into() })
            .unwrap();
        store
            .set_variable("a", "HOOK", VariableInput { ty: VarType::Secret, value: Some(json!("https://secret")), description: String::new() })
            .unwrap();
        store.write_script("a", "copy.py", COPY).unwrap();
        (dir, store)
    }

    #[test]
    fn an_export_leaves_secrets_out_unless_asked() {
        let (_d, store) = store_with_profile();
        let plain = store.export_profile("a", false).unwrap();
        assert_eq!(plain.hedgebuddy_profile_export, 1);
        assert_eq!(plain.secrets, None);
        assert_eq!(plain.scripts["copy.py"], COPY);
        assert_eq!(plain.profile.variables.len(), 2);
        assert!(!serde_json::to_string(&plain).unwrap().contains("https://secret"));
        let full = store.export_profile("a", true).unwrap();
        assert_eq!(full.secrets.unwrap()["HOOK"], "https://secret");
    }

    #[test]
    fn an_import_recreates_the_profile_under_a_new_name() {
        let (_d, store) = store_with_profile();
        let export = store.export_profile("a", true).unwrap();
        let summary = store.import_profile(&export, "b").unwrap();
        assert_eq!(
            summary,
            ImportSummary { profile: "b".into(), active: false, variables: 2, scripts: 1, secrets_imported: 1, secrets_missing: vec![] }
        );
        assert_eq!(store.load_profile("b").unwrap().name, "b");
        assert_eq!(store.get_variable("b", "HOOK").unwrap().value, Some(json!("https://secret")));
        assert_eq!(store.read_script("b", "copy.py").unwrap(), COPY);
        assert_eq!(store.active_profile_name().unwrap().as_deref(), Some("a"));
    }

    #[test]
    fn an_import_without_secrets_reports_them_missing() {
        let (_d, store) = store_with_profile();
        let export = store.export_profile("a", false).unwrap();
        let summary = store.import_profile(&export, "b").unwrap();
        assert_eq!(summary.secrets_imported, 0);
        assert_eq!(summary.secrets_missing, vec!["HOOK".to_owned()]);
        assert_eq!(store.get_variable("b", "HOOK").unwrap().value, None);
    }

    #[test]
    fn the_first_import_becomes_active() {
        let (_d, source) = store_with_profile();
        let export = source.export_profile("a", false).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let fresh = Store::open(dir.path().join("HedgeBuddy"));
        assert!(fresh.import_profile(&export, "a").unwrap().active);
        assert_eq!(fresh.active_profile_name().unwrap().as_deref(), Some("a"));
    }

    #[test]
    fn a_bad_file_writes_nothing() {
        let (_d, store) = store_with_profile();
        let good = store.export_profile("a", true).unwrap();
        assert!(matches!(store.import_profile(&good, "a"), Err(CoreError::ProfileExists(_))));
        assert!(store.import_profile(&good, "Bad Name").is_err());
        let mut wrong_secret = good.clone();
        wrong_secret.secrets.as_mut().unwrap().insert("PROJECT_NAME".into(), "x".into());
        assert!(store.import_profile(&wrong_secret, "c").is_err());
        let mut bad_script = good.clone();
        bad_script.scripts.insert("../x.py".into(), "print(1)\n".into());
        assert!(store.import_profile(&bad_script, "c").is_err());
        let mut bad_manifest = good.clone();
        bad_manifest.scripts.insert("m.py".into(), "\"\"\"\n{not json\n---\n\"\"\"\n".into());
        assert!(store.import_profile(&bad_manifest, "c").is_err());
        let mut bad_version = good.clone();
        bad_version.hedgebuddy_profile_export = 2;
        assert!(store.import_profile(&bad_version, "c").is_err());
        assert!(!store.profile_dir("c").exists(), "nothing was written");
    }

    #[test]
    fn files_round_trip_and_large_files_are_refused() {
        let (dir, store) = store_with_profile();
        let path = dir.path().join("out").join("a.hedgebuddy.json");
        let export = store.export_profile("a", false).unwrap();
        write_profile_export(&path, &export).unwrap();
        assert_eq!(read_profile_export(&path, EXPORT_MAX_BYTES).unwrap(), export);
        assert!(read_profile_export(&path, 10).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn an_export_with_secrets_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let (dir, store) = store_with_profile();
        let path = dir.path().join("secret.json");
        write_profile_export(&path, &store.export_profile("a", true).unwrap()).unwrap();
        assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
    }
}
```

Add `pub mod export;` to `lib.rs` and `pub use export::{read_profile_export, write_profile_export, ImportSummary, ProfileExport, EXPORT_MAX_BYTES};`.

Run: `cargo test -p hedgebuddy-core export 2>&1 | tail -5`
Expected: FAIL to compile.

- [ ] **Step 2: Implement export and import**

Above the tests:

```rust
//! Profile export and import: one JSON file with a profile's variables, its
//! scripts and, only when asked, its secret values. App-only: no tool
//! reaches this, so an agent cannot export secrets.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::fs_util;
use crate::manifest::parse_manifest;
use crate::profile::Profile;
use crate::scripts::validate_script_name;
use crate::store::Store;
use crate::variable::{validate_slug, VarType};

/// The largest export file `read_profile_export` accepts by default.
pub const EXPORT_MAX_BYTES: u64 = 16 * 1024 * 1024;

/// A profile as one file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ProfileExport {
    /// Export format version; always 1.
    pub hedgebuddy_profile_export: u32,
    /// When it was exported (UTC, RFC 3339).
    pub exported_at: String,
    /// The profile exactly as `profile.json` holds it (no secret values).
    pub profile: Profile,
    /// Secret values by variable name, present only when exported with secrets.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secrets: Option<BTreeMap<String, String>>,
    /// Script sources by file name.
    #[serde(default)]
    pub scripts: BTreeMap<String, String>,
}

/// What an import created.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct ImportSummary {
    /// The new profile's name.
    pub profile: String,
    /// Whether it became the active profile (the first profile does).
    pub active: bool,
    /// How many variables it has.
    pub variables: usize,
    /// How many scripts it has.
    pub scripts: usize,
    /// How many secret values the file carried.
    pub secrets_imported: usize,
    /// Secret variables that arrived without a value; set them before use.
    pub secrets_missing: Vec<String>,
}

impl Store {
    /// A profile, its scripts and, with `include_secrets`, its secret values.
    pub fn export_profile(&self, name: &str, include_secrets: bool) -> Result<ProfileExport> {
        let profile = self.load_profile(name)?;
        let secrets = if include_secrets { Some(self.load_secrets(name)?) } else { None };
        let mut scripts = BTreeMap::new();
        for info in self.list_scripts(name)? {
            let source = self.read_script(name, &info.name)?;
            scripts.insert(info.name, source);
        }
        Ok(ProfileExport {
            hedgebuddy_profile_export: 1,
            exported_at: crate::clock::now_rfc3339(),
            profile,
            secrets,
            scripts,
        })
    }

    /// Create profile `name` from `export`. Everything is checked before
    /// anything is written, and a profile half-created by a failed write is
    /// removed. The first profile becomes active. The caller holds the write
    /// lock.
    pub fn import_profile(&self, export: &ProfileExport, name: &str) -> Result<ImportSummary> {
        if export.hedgebuddy_profile_export != 1 {
            return Err(CoreError::Validation(format!(
                "unsupported profile export version {} (expected 1)",
                export.hedgebuddy_profile_export
            )));
        }
        validate_slug(name)?;
        if self.profile_dir(name).exists() {
            return Err(CoreError::ProfileExists(name.to_owned()));
        }
        let mut profile = export.profile.clone();
        profile.name = name.to_owned();
        profile.validate()?;
        let secret_names: BTreeSet<&String> = profile
            .variables
            .iter()
            .filter(|(_, v)| v.ty == VarType::Secret)
            .map(|(n, _)| n)
            .collect();
        let secrets = export.secrets.clone().unwrap_or_default();
        if let Some(key) = secrets.keys().find(|k| !secret_names.contains(k)) {
            return Err(CoreError::Validation(format!(
                "the file has a secret value for '{key}', which is not a secret variable of the profile"
            )));
        }
        for (script, source) in &export.scripts {
            validate_script_name(script)?;
            parse_manifest(source)?;
        }

        let written = (|| {
            self.create_profile(name, &profile.description)?;
            self.save_profile(&profile)?;
            if !secrets.is_empty() {
                self.save_secrets(name, &secrets)?;
            }
            for (script, source) in &export.scripts {
                self.write_script(name, script, source)?;
            }
            Ok::<(), CoreError>(())
        })();
        if let Err(e) = written {
            let _ = self.delete_profile(name);
            return Err(e);
        }
        Ok(ImportSummary {
            profile: name.to_owned(),
            active: self.active_profile_name()?.as_deref() == Some(name),
            variables: profile.variables.len(),
            scripts: export.scripts.len(),
            secrets_imported: secrets.len(),
            secrets_missing: secret_names
                .into_iter()
                .filter(|n| !secrets.contains_key(*n))
                .cloned()
                .collect(),
        })
    }
}

/// Write an export file as pretty JSON, atomically. A file holding secrets
/// is created owner-only (0600) on Unix.
pub fn write_profile_export(path: &Path, export: &ProfileExport) -> Result<()> {
    fs_util::write_json_atomic(path, export, export.secrets.is_some())
}

/// Read an export file, refusing one larger than `max_bytes`.
pub fn read_profile_export(path: &Path, max_bytes: u64) -> Result<ProfileExport> {
    let size = fs::metadata(path).map_err(|e| CoreError::io(path, e))?.len();
    if size > max_bytes {
        return Err(CoreError::Validation(format!(
            "{} is {size} bytes, too large to be a profile export",
            path.display()
        )));
    }
    fs_util::read_json(path)
}
```

(`clock` must be `pub(crate)` or public in `lib.rs`; `save_secrets`, `profile_dir` and `delete_profile` already exist.)

Run: `cargo test -p hedgebuddy-core export 2>&1 | tail -8`
Expected: PASS (6 tests on Windows, 7 on macOS).

- [ ] **Step 3: Schema, fixtures, conformance**

`schema/profile-export.schema.json` (same header style as the others):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/shakedex/hedgebuddy/schema/profile-export.schema.json",
  "title": "HedgeBuddy profile export",
  "description": "One profile as a file, written by the desktop app's Export. `profile` must also validate against profile.schema.json. `secrets` is present only when the operator chose to include them.",
  "type": "object",
  "additionalProperties": false,
  "required": ["hedgebuddy_profile_export", "exported_at", "profile"],
  "properties": {
    "hedgebuddy_profile_export": { "const": 1 },
    "exported_at": { "type": "string", "format": "date-time" },
    "profile": { "type": "object" },
    "secrets": { "type": "object", "additionalProperties": { "type": "string" } },
    "scripts": { "type": "object", "additionalProperties": { "type": "string" } }
  }
}
```

Invalid fixtures: `unknown-version.json` (`"hedgebuddy_profile_export": 2`, otherwise valid) and `missing-profile.json` (no `profile`). In `schema_conformance.rs`, add a test that an export written by core validates against `profile-export`, and its `profile` against `profile`; raise the invalid-fixture floor by two (13) in Rust and in `python/tests/test_schema_conformance.py`. Add the schema to `schema/README.md` and to `SCHEMAS` in `crates/tools/src/resources.rs` (the resources test count goes up by one).

- [ ] **Step 4: Run everything and commit**

Run: `cargo test --workspace 2>&1 | tail -10 && (cd python && uv run pytest -q 2>&1 | tail -2) && cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings`
Expected: PASS, clean.

```bash
git add crates/core crates/tools/src/resources.rs schema python/tests/test_schema_conformance.py
git commit -m "feat(core): profile export and import

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `set_var` keeps the value when it is omitted; the shared script template

**Files:**
- Modify: `crates/tools/src/variables.rs`, `crates/tools/src/resources.rs`

**Interfaces:**
- Produces: `SetVar.value: Option<Value>` (omitted keeps the stored value; the variable must exist with the same type); `pub(crate) fn script_template_source(ctx: &Context, app: &str, event: &str) -> Result<String, ToolError>` in `resources.rs` (the Python source only; `author_script` wraps it).

- [ ] **Step 1: Failing tests**

In `variables.rs` tests:

```rust
    #[test]
    fn omitting_the_value_keeps_it_and_only_changes_the_description() {
        let (_d, ctx) = ctx_with_profile();
        call(&ctx, "set_var", json!({"name": "HOOK", "type": "secret", "value": "https://hook"})).unwrap();
        let out = call(&ctx, "set_var", json!({"name": "HOOK", "type": "secret", "description": "Webhook"})).unwrap();
        assert_eq!(out["description"], "Webhook");
        let v = call(&ctx, "get_var", json!({"name": "HOOK", "reveal": true})).unwrap();
        assert_eq!(v["value"], "https://hook");
        assert_eq!(v["description"], "Webhook");
    }

    #[test]
    fn omitting_the_value_needs_an_existing_variable_of_the_same_type() {
        let (_d, ctx) = ctx_with_profile();
        let missing = call(&ctx, "set_var", json!({"name": "NEW", "type": "string"})).unwrap_err();
        assert!(missing.0.contains("pass a value"), "{missing}");
        call(&ctx, "set_var", json!({"name": "N", "type": "int", "value": 3})).unwrap();
        let retyped = call(&ctx, "set_var", json!({"name": "N", "type": "string"})).unwrap_err();
        assert!(retyped.0.contains("pass a value"), "{retyped}");
    }
```

In `resources.rs` tests:

```rust
    #[test]
    fn the_template_source_is_a_valid_script_for_its_event() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let source = script_template_source(&ctx, "offshoot", "FileCopyCompleted").unwrap();
        let manifest = hedgebuddy_core::parse_manifest(&source).unwrap().unwrap();
        assert_eq!(manifest.app.as_deref(), Some("offshoot"));
        assert_eq!(manifest.event.as_deref(), Some("FileCopyCompleted"));
        assert!(source.contains("@hb.script"));
        assert!(author_script(&ctx, "offshoot", "FileCopyCompleted").unwrap().contains(&source));
        assert!(script_template_source(&ctx, "offshoot", "Nope").is_err());
    }
```

(Adjust imports to the test module's existing ones.)

Run: `cargo test -p hedgebuddy-tools omitting the_template 2>&1 | tail -5`
Expected: FAIL.

- [ ] **Step 2: Implement**

`SetVar.value`:

```rust
    /// The value, as JSON matching the type (secret and url are strings; string[] and path[] are arrays of strings). Omit it to keep the current value of an existing variable of the same type, for example to change only the description.
    #[serde(default)]
    pub value: Option<Value>,
```

In `set_var`, before `set_variable`:

```rust
    let value = match p.value {
        Some(v) => v,
        None => {
            let keep = || ToolError::new(format!(
                "variable '{}' has no {} value to keep; pass a value",
                p.name,
                ty.as_str()
            ));
            let existing = ctx.store.get_variable(&profile, &p.name).map_err(|_| keep())?;
            if existing.ty != ty {
                return Err(keep());
            }
            existing.value.ok_or_else(keep)?
        }
    };
```

and pass `value: Some(value)`. Update the tool description: "…value must match it; omit value to keep the current one (for example to change only the description)." The secret value read here never leaves Rust.

In `resources.rs`, move the Python source of `author_script`'s template into `script_template_source` unchanged (the manifest docstring through `return 0`, with the payload-field comment lines), and make `author_script` embed it:

```rust
/// The Python source of a new script for `app`'s `event`: the manifest
/// docstring, and a `main` listing the payload fields.
pub(crate) fn script_template_source(ctx: &Context, app: &str, event: &str) -> Result<String, ToolError> {
    // Body: the text author_script used to build between its code fences,
    // moved here unchanged.
}
```

In `author_script`, build the fence with `let fence = "`".repeat(3);` and interpolate `{fence}python\n{source}{fence}` where the template used to be, so no source line of this file starts with three backticks. `author_script`'s text stays otherwise identical; its existing test must still pass.

- [ ] **Step 3: Run and commit**

Run: `cargo test --workspace 2>&1 | tail -8 && cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings`
Expected: PASS, clean.

```bash
git add crates/tools
git commit -m "feat(tools): set_var keeps the value when omitted; shared script template

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Read models for the editing screens

**Files:**
- Create: `crates/tools/src/app/overview.rs`
- Modify: `crates/tools/src/app/mod.rs` (module, re-exports, registry), `crates/tools/src/variables.rs` (make `VarView` and `var_view` reachable as `pub(crate)`), `crates/tools/src/scripts.rs` (make `AppEvent` reachable)

**Interfaces:**
- Consumes: `crate::variables::{VarView, var_view}`, `crate::scripts::AppEvent`, core `check_script`, `list_variables`, `Hedge::{attachments, apps, catalog}`, `hedge::{managed_script, validate_manifest, AttachState}`.
- Produces (all `pub`, derive `Serialize, JsonSchema`; argument types derive `Deserialize, JsonSchema` with `deny_unknown_fields`):
  - `ProfileArgs { profile: Option<String> }`.
  - `variables_overview(ctx, ProfileArgs) -> Result<VariablesOverview, ToolError>`; `VariablesOverview { profile, variables: Vec<VarView>, requirements: Vec<RequirementRow> }`; `RequirementRow { name, ty (serde "type"), description, has_default: bool, required_by: Vec<ScriptTarget>, state: RequirementState, actual: Option<VarType> }`; `ScriptTarget { script, app: Option<String>, event: Option<String> }`; `RequirementState { Set, Missing, TypeMismatch, Defaulted }` (snake_case).
  - `scripts_overview(ctx, ProfileArgs) -> Result<ScriptsOverview, ToolError>`; `ScriptsOverview { profile, scripts: Vec<ScriptRow> }`; `ScriptRow { name, manifest: Option<Manifest>, manifest_error: Option<String>, target: Option<TargetEvent>, catalog_error: Option<String>, attachment: TargetAttachment, attached_to: Vec<AppEvent>, unmet: Vec<RequirementIssue> }`; `TargetEvent { app, app_name, event }`; `TargetAttachment` tagged by `state` (snake_case): `NoTarget`, `Attached`, `Staged`, `OtherScript { profile, script }`, `External { path }`, `Stale { path }`, `Free`, `Manual { note }`, `Unsupported`, `Unknown { error }`.
  - `apps_overview(ctx, NoParams) -> Result<AppsOverview, ToolError>`; `AppsOverview { os: Os, apps: Vec<AppRow> }`; `AppRow { status: AppStatus, available_here: bool, docs: String, events: Vec<AppEventInfo>, attached: usize, stale: usize }`; `AppEventInfo { id, description }`.
  - Registry entries `variables_overview` (ProfileArgs → VariablesOverview), `scripts_overview` (ProfileArgs → ScriptsOverview), `apps_overview` (NoParams → AppsOverview).

- [ ] **Step 1: Failing tests**

`overview.rs` tests (use `crate::test_ctx`, `crate::call`, `FakeHost`, `RegValue` as the 5A home tests do; `KEY = "HKCU\\Software\\Hedge"`):

```rust
#[cfg(test)]
mod tests {
    use hedgebuddy_core::host::RegValue;
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use super::*;
    use crate::app::checked;
    use crate::{call, test_ctx};

    const KEY: &str = "HKCU\\Software\\Hedge";
    const COPY: &str = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\", \"requires\": {\"CLIENT_EMAIL\": {\"type\": \"string\", \"description\": \"Who gets the report\"}, \"HOOK\": {\"type\": \"secret\"}, \"RETRIES\": {\"type\": \"int\", \"default\": 3}, \"NOTIFY\": {\"type\": \"bool\"}}}\n---\n\"\"\"\n";
    const DISK: &str = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"DiskAdded\", \"requires\": {\"CLIENT_EMAIL\": {\"type\": \"string\"}}}\n---\n\"\"\"\n";

    fn host() -> FakeHost {
        FakeHost::new(Os::Windows)
            .with_registry_value(KEY, "BuildVersion", RegValue::String("26.1 (1023)".into()))
            .with_registry_value(KEY, "EventScriptAllowScripting", RegValue::Dword(1))
            .with_registry_value(KEY, "EventScriptDiskIdle", RegValue::String("E:\\gone\\idle.py".into()))
    }

    #[test]
    fn variables_list_every_requirement_with_its_state() {
        let (_d, _f, ctx) = test_ctx(host());
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        call(&ctx, "set_var", json!({"name": "HOOK", "type": "secret", "value": "https://hook"})).unwrap();
        call(&ctx, "set_var", json!({"name": "NOTIFY", "type": "string", "value": "yes"})).unwrap();
        call(&ctx, "write_script", json!({"name": "copy.py", "source": COPY})).unwrap();
        call(&ctx, "write_script", json!({"name": "disk.py", "source": DISK})).unwrap();
        let o = checked("variables_overview", variables_overview(&ctx, ProfileArgs::default()).unwrap());
        assert_eq!(o.profile, "p");
        assert!(!serde_json::to_string(&o).unwrap().contains("https://hook"), "secrets stay masked");
        let row = |n: &str| o.requirements.iter().find(|r| r.name == n).unwrap();
        assert_eq!(row("CLIENT_EMAIL").state, RequirementState::Missing);
        assert_eq!(row("CLIENT_EMAIL").description, "Who gets the report");
        assert_eq!(row("CLIENT_EMAIL").required_by.iter().map(|s| s.script.as_str()).collect::<Vec<_>>(), ["copy.py", "disk.py"]);
        assert_eq!(row("HOOK").state, RequirementState::Set);
        assert_eq!(row("RETRIES").state, RequirementState::Defaulted);
        assert!(row("RETRIES").has_default);
        assert_eq!(row("NOTIFY").state, RequirementState::TypeMismatch);
        assert_eq!(row("NOTIFY").actual, Some(VarType::String));
        assert_eq!(o.variables.len(), 2);
    }

    #[test]
    fn scripts_show_what_their_target_event_runs() {
        let (_d, _f, ctx) = test_ctx(host());
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        let plain_copy = COPY.replace(", \"requires\": {\"CLIENT_EMAIL\": {\"type\": \"string\", \"description\": \"Who gets the report\"}, \"HOOK\": {\"type\": \"secret\"}, \"RETRIES\": {\"type\": \"int\", \"default\": 3}, \"NOTIFY\": {\"type\": \"bool\"}}", "");
        call(&ctx, "write_script", json!({"name": "copy.py", "source": plain_copy})).unwrap();
        call(&ctx, "write_script", json!({"name": "disk.py", "source": DISK})).unwrap();
        call(&ctx, "write_script", json!({"name": "notes.py", "source": "print('x')\n"})).unwrap();
        call(&ctx, "attach_script", json!({"name": "copy.py"})).unwrap();
        let o = checked("scripts_overview", scripts_overview(&ctx, ProfileArgs::default()).unwrap());
        let row = |n: &str| o.scripts.iter().find(|s| s.name == n).unwrap();
        assert!(matches!(row("copy.py").attachment, TargetAttachment::Attached));
        assert_eq!(row("copy.py").attached_to, vec![AppEvent { app: "offshoot".into(), event: "FileCopyCompleted".into() }]);
        assert_eq!(row("copy.py").target.as_ref().unwrap().app_name, "OffShoot");
        assert!(matches!(row("disk.py").attachment, TargetAttachment::Free));
        assert_eq!(row("disk.py").unmet.len(), 1);
        assert!(matches!(row("notes.py").attachment, TargetAttachment::NoTarget));
    }

    #[test]
    fn apps_count_attached_and_stale_events() {
        let (_d, _f, ctx) = test_ctx(host());
        let o = checked("apps_overview", apps_overview(&ctx, crate::NoParams {}).unwrap());
        assert_eq!(o.os, Os::Windows);
        let offshoot = o.apps.iter().find(|a| a.status.id == "offshoot").unwrap();
        assert!(offshoot.available_here);
        assert_eq!(offshoot.stale, 1);
        assert_eq!(offshoot.attached, 0);
        assert!(offshoot.events.iter().any(|e| e.id == "FileCopyCompleted"));
        assert!(offshoot.docs.starts_with("https://"));
    }
}
```

(Check the Canister catalog's `detect` table: if it has no `windows` entry, also assert `!canister.available_here` on Windows.)

Run: `cargo test -p hedgebuddy-tools overview 2>&1 | tail -5`
Expected: FAIL to compile.

- [ ] **Step 2: Implement**

`overview.rs` computes:

- **`variables_overview`:** `profile = ctx.profile(args.profile)`; `variables = store.list_variables(profile).iter().map(|v| var_view(v, false))`; for every script with a manifest, for every `(name, req)` of `requires`, add the script (with its manifest app/event) to that name's `required_by`, keeping the first script's type, the first non-empty description and `has_default` if any script gives a default. State per name, from `store.check_script(profile, script).issues` over the scripts that require it: any `TypeMismatch` → `TypeMismatch` (with `actual`), else any `Missing` → `Missing`, else the profile has the variable with a value (from `list_variables`) → `Set`, else `Defaulted`. Rows sorted by name.
- **`scripts_overview`:** read every app's attachments once (`hedge.attachments(app, store)` for each catalog app; keep the `Result`), then per script: `target` when the manifest has app and event (with the catalog app's display name) and `validate_manifest` passes, else `catalog_error`; `attachment` from the cached state of the target event: `Attached { profile, script }` → `Attached` when it is this profile and script, else `OtherScript`; `Staged { path, .. }` → `Staged` when `managed_script(path)` is this script, `OtherScript` when it is another managed script, else `External { path }`; `External`, `Stale`, `Manual`, `Unsupported` map across; `Detached` → `Free`; a failed read → `Unknown { error }`. `attached_to` lists every event (across apps) whose `Attached`/`Staged` state points at this script (same rule as `crate::scripts::attached_to`, using the cached lists). `unmet` from `check_script` when the manifest parses.
- **`apps_overview`:** `os = host.os()`; per catalog app in `hedge.apps()` order: `available_here = manifest.detect.get(os).is_some()`; `docs = manifest.app.docs`; `events` from the manifest; `attached` counts `Attached`, `Staged` and `External` states, `stale` counts `Stale` (a failed attachments read counts 0 for both).

Add the three to `commands()` and re-export the types from `app`.

- [ ] **Step 3: Run and commit**

Run: `cargo test -p hedgebuddy-tools 2>&1 | tail -8 && cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings`
Expected: PASS, clean.

```bash
git add crates/tools
git commit -m "feat(tools): variables, scripts and apps overviews for the editing screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: File actions: path status, reveal allow-list, editor command, export and import, template

**Files:**
- Create: `crates/tools/src/app/files.rs`
- Modify: `crates/tools/src/app/mod.rs`

**Interfaces:**
- Produces (types `pub`, `Serialize/Deserialize + JsonSchema` as fits):
  - `path_status(ctx, PathStatusArgs { paths: Vec<String> }) -> Result<PathStatusList, ToolError>`; `PathStatusList { paths: Vec<PathState> }`; `PathState { path, exists: bool, mounted: bool }`; at most 64 paths.
  - `reveal_target(ctx, path: &str) -> Result<PathBuf, ToolError>` (the canonical path when allowed).
  - `editor_argv(command: &str, file: &Path) -> Result<Vec<String>, ToolError>`; `find_in_path(program: &str, path_var: &str, pathext: &str) -> Option<PathBuf>`.
  - `script_file(ctx, profile: Option<&str>, script: &str) -> Result<PathBuf, ToolError>` (existing script of an existing profile).
  - `script_template(ctx, ScriptTemplateArgs { app, event, profile: Option<String> }) -> Result<ScriptTemplate, ToolError>`; `ScriptTemplate { name, source }` (name suggested per ruling 11, unused in the profile).
  - `export_profile(ctx, ExportArgs { name, include_secrets, dest }) -> Result<ExportResult, ToolError>`; `ExportResult { path, variables, scripts, secrets_included }`.
  - `import_profile(ctx, ImportArgs { path, name }) -> Result<ImportSummary, ToolError>` (under `write_guard`).
  - Types for commands the app crate implements alone: `OpenInEditorArgs { profile: Option<String>, script }` → `Opened { path, with }`; `RevealArgs { path }` → `Opened`; `OpenAppDocsArgs { app }` → `Opened`; `PickFolderArgs { title: Option<String> }`, `PickExportArgs { default_name }`, `NoParams` (import) → `PickedPath { path: Option<String> }`.
  - Registry entries: `path_status`, `script_template`, `export_profile`, `import_profile`, `open_in_editor`, `reveal_path`, `open_app_docs`, `pick_folder`, `pick_export_path`, `pick_import_file`.

- [ ] **Step 1: Failing tests**

`files.rs` tests:

```rust
#[cfg(test)]
mod tests {
    use std::path::Path;

    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use super::*;
    use crate::app::checked;
    use crate::{call, test_ctx};

    #[test]
    fn path_status_tells_missing_folders_from_absent_drives() {
        let (dir, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let here = dir.path().display().to_string();
        let gone = dir.path().join("nope").display().to_string();
        let out = checked("path_status", path_status(&ctx, PathStatusArgs { paths: vec![here.clone(), gone.clone(), String::new()] }).unwrap());
        assert_eq!(out.paths[0], PathState { path: here, exists: true, mounted: true });
        assert_eq!(out.paths[1], PathState { path: gone, exists: false, mounted: true });
        assert!(!out.paths[2].exists);
        #[cfg(windows)]
        {
            let absent = (b'D'..=b'Z').map(|c| format!("{}:\\", c as char)).find(|d| !Path::new(d).exists());
            if let Some(d) = absent {
                let p = format!("{d}Offload");
                let out = path_status(&ctx, PathStatusArgs { paths: vec![p] }).unwrap();
                assert!(!out.paths[0].mounted);
            }
        }
        #[cfg(target_os = "macos")]
        {
            let out = path_status(&ctx, PathStatusArgs { paths: vec!["/Volumes/HB-NOT-MOUNTED-7f3/x".into()] }).unwrap();
            assert!(!out.paths[0].mounted);
        }
        assert!(path_status(&ctx, PathStatusArgs { paths: vec![String::new(); 65] }).is_err());
    }

    #[test]
    fn reveal_allows_the_data_folder_and_nothing_else() {
        let (dir, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        call(&ctx, "write_script", json!({"name": "a.py", "source": "print(1)\n"})).unwrap();
        let script = ctx.store.script_path("p", "a.py");
        assert!(reveal_target(&ctx, &script.display().to_string()).is_ok());
        assert!(reveal_target(&ctx, &ctx.store.root().display().to_string()).is_ok());
        let outside = dir.path().join("outside.txt");
        std::fs::write(&outside, "x").unwrap();
        assert!(reveal_target(&ctx, &outside.display().to_string()).is_err());
        let sneaky = ctx.store.root().join("..").join("outside.txt");
        assert!(reveal_target(&ctx, &sneaky.display().to_string()).is_err());
        assert!(reveal_target(&ctx, &ctx.store.root().join("missing.txt").display().to_string()).is_err());
    }

    #[test]
    fn reveal_allows_a_hedge_app_log() {
        let appdata = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(appdata.path().join("Hedge")).unwrap();
        std::fs::write(appdata.path().join("Hedge").join("HedgeCallback.log"), "x").unwrap();
        let host = FakeHost::new(Os::Windows).with_env("APPDATA", &appdata.path().display().to_string());
        let (_d, _f, ctx) = test_ctx(host);
        let log = appdata.path().join("Hedge").join("HedgeCallback.log");
        assert!(reveal_target(&ctx, &log.display().to_string()).is_ok());
    }

    #[test]
    fn editor_commands_split_like_a_shell() {
        let f = Path::new("C:/data/p/scripts/a b.py");
        assert_eq!(editor_argv("code -n", f).unwrap(), ["code", "-n", "C:/data/p/scripts/a b.py"]);
        assert_eq!(editor_argv("\"C:/Program Files/Sublime/subl.exe\" --wait {file}", f).unwrap(), ["C:/Program Files/Sublime/subl.exe", "--wait", "C:/data/p/scripts/a b.py"]);
        assert_eq!(editor_argv("open -a 'BBEdit'", f).unwrap(), ["open", "-a", "BBEdit", "C:/data/p/scripts/a b.py"]);
        assert!(editor_argv("   ", f).is_err());
        assert!(editor_argv("code \"unterminated", f).is_err());
    }

    #[test]
    fn programs_are_found_through_path_and_pathext() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("code.cmd"), "").unwrap();
        let path_var = std::env::join_paths([dir.path()]).unwrap().into_string().unwrap();
        assert_eq!(find_in_path("code", &path_var, ".EXE;.CMD"), Some(dir.path().join("code.cmd")));
        assert_eq!(find_in_path("nope", &path_var, ".EXE;.CMD"), None);
    }

    #[test]
    fn a_template_suggests_a_free_name() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        let args = || ScriptTemplateArgs { app: "offshoot".into(), event: "FileCopyCompleted".into(), profile: None };
        let t = checked("script_template", script_template(&ctx, args()).unwrap());
        assert_eq!(t.name, "on_file_copy_completed.py");
        call(&ctx, "write_script", json!({"name": t.name, "source": t.source})).unwrap();
        assert_eq!(script_template(&ctx, args()).unwrap().name, "on_file_copy_completed_2.py");
    }

    #[test]
    fn export_and_import_go_through_files() {
        let (dir, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        call(&ctx, "set_var", json!({"name": "HOOK", "type": "secret", "value": "https://hook"})).unwrap();
        let dest = dir.path().join("p.hedgebuddy.json");
        let out = checked("export_profile", export_profile(&ctx, ExportArgs { name: "p".into(), include_secrets: false, dest: dest.display().to_string() }).unwrap());
        assert!(!out.secrets_included);
        assert!(!std::fs::read_to_string(&dest).unwrap().contains("https://hook"));
        let imported = checked("import_profile", import_profile(&ctx, ImportArgs { path: dest.display().to_string(), name: "q".into() }).unwrap());
        assert_eq!(imported.secrets_missing, vec!["HOOK".to_owned()]);
        assert!(ctx.store.profile_exists("q"));
    }
}
```

Run: `cargo test -p hedgebuddy-tools files 2>&1 | tail -5`
Expected: FAIL to compile.

- [ ] **Step 2: Implement**

- **`path_status`:** error when more than 64 paths. For each path: `exists = !p.is_empty() && Path::new(p).exists()`; `mounted` = the volume root exists: on Windows the path's prefix component (`C:` → `C:\`, a UNC `\\server\share` → that share root); on macOS a path under `/Volumes/<name>` → that folder; any other absolute path → `true`; a relative or empty path → `true` (no drive to be missing).
- **`reveal_target`:** canonicalize the path (it must exist); allowed when it starts with the canonical data folder, or equals the canonical resolved `callback_log` or `event_log` of any catalog app, or starts with its canonical `presets_dir` (from `ctx.hedge.describe_app(id)?.files`, skipping apps whose files do not resolve). Otherwise `ToolError` "HedgeBuddy only reveals its data folder and Hedge app files".
- **`editor_argv`:** a small splitter: whitespace separates words; `"…"` and `'…'` group (no escapes inside single quotes; `\"` inside double quotes); an unterminated quote is an error; an empty result is an error. Replace a word `{file}` with the path; if none, append the path.
- **`find_in_path`:** a program containing a path separator, or with an extension, is returned as is when it exists; otherwise search each `path_var` directory (split with `std::env::split_paths`) for `program` plus each `pathext` extension (split on `;`, case-insensitive), then `program` itself.
- **`script_file`:** `ctx.profile(profile)`, `validate_script_name`, the profile exists, the file exists → `store.script_path`.
- **`script_template`:** `crate::resources::script_template_source`; name `on_<snake>.py` from the event id (`FileCopyCompleted` → `file_copy_completed`), then `_2`, `_3` … while `store.script_path(profile, name)` exists.
- **`export_profile`:** `store.export_profile(name, include_secrets)` then `write_profile_export(dest)`; `ExportResult` with the counts. A read; no lock.
- **`import_profile`:** `ctx.write_guard()?`, `read_profile_export(path, EXPORT_MAX_BYTES)`, `store.import_profile(&export, name)`.

Register every command (with the argument and result types above) in `commands()`.

- [ ] **Step 3: Run and commit**

Run: `cargo test --workspace 2>&1 | tail -8 && cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo run -q -p hedgebuddy-tools --example app_schemas | grep -c '"output"'`
Expected: PASS, clean; the example lists 17 commands.

```bash
git add crates/tools
git commit -m "feat(tools): path status, reveal allow-list, editor command, template, export and import

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tauri: plugins, the new commands, catalog reload

**Files:**
- Modify: `crates/app/Cargo.toml`, `crates/app/src/lib.rs`, `crates/app/src/commands.rs`, `crates/app/src/state.rs`, `crates/app/src/watcher.rs`

**Interfaces:**
- Consumes: every Task 3 and 4 function and type.
- Produces: Tauri commands `variables_overview`, `scripts_overview`, `apps_overview`, `path_status`, `script_template`, `export_profile`, `import_profile`, `open_in_editor`, `reveal_path`, `open_app_docs`, `pick_folder`, `pick_export_path`, `pick_import_file` (each takes `args`); `AppState::ctx() -> Arc<Context>` (the current context); the context is rebuilt when a batch touches `catalog`.

- [ ] **Step 1: Dependencies and plugins**

`crates/app/Cargo.toml`: `tauri-plugin-dialog = "2"`, `tauri-plugin-opener = "2"`. In `run()`: `.plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_opener::init())`. The capability file keeps `["core:event:default"]` only: both plugins are used from Rust commands, which capabilities do not gate.

- [ ] **Step 2: A reloadable context**

`AppState.ctx` becomes `RwLock<Arc<Context>>` with:

```rust
    /// The current tool context. Callers clone the Arc and release the lock
    /// at once, so a reload never waits for a running command.
    pub fn ctx(&self) -> Arc<Context> {
        self.ctx.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Rebuild the context so catalog overrides in `<data>/catalog/` apply.
    /// A command still running on the old context finishes on it; writes
    /// stay serialised by the data folder's lock.
    pub fn reload_catalog(&self) {
        match Context::real() {
            Ok(fresh) => *self.ctx.write().unwrap_or_else(|e| e.into_inner()) = Arc::new(fresh),
            Err(e) => eprintln!("hedgebuddy: could not reload the catalog: {}", e.0),
        }
    }
```

Every command uses `state.ctx()`. In `watcher.rs`, when a batch's categories contain `catalog`, call `app.state::<AppState>().reload_catalog()` before emitting `data-changed`.

- [ ] **Step 3: The commands**

In `commands.rs`, wrap each pure function with `blocking(...)` exactly like `home_summary`. The OS-facing ones:

```rust
/// Open a profile script with the editor command from preferences, or the
/// system's default app for .py files.
#[tauri::command]
pub async fn open_in_editor(app: AppHandle, state: State<'_, AppState>, args: OpenInEditorArgs) -> Result<Opened, CommandError> {
    let ctx = state.ctx();
    blocking(move || {
        let file = hedgebuddy_tools::app::script_file(&ctx, args.profile.as_deref(), &args.script)?;
        let command = ctx.store.preferences()?.editor_command;
        match command {
            Some(cmd) => {
                let argv = hedgebuddy_tools::app::editor_argv(&cmd, &file)?;
                spawn_detached(&argv).map_err(|e| ToolError::new(format!("could not start {}: {e}", argv[0])))?;
                Ok(Opened { path: file.display().to_string(), with: cmd })
            }
            None => {
                app.opener().open_path(file.display().to_string(), None::<&str>).map_err(|e| ToolError::new(e.to_string()))?;
                Ok(Opened { path: file.display().to_string(), with: "the default app".into() })
            }
        }
    })
    .await
}
```

`spawn_detached(argv)`: on Windows resolve `argv[0]` with `find_in_path(argv[0], PATH, PATHEXT)` (fall back to `argv[0]`), set `CREATE_NO_WINDOW` (0x0800_0000), `stdin/stdout/stderr` to null, and `spawn()` without waiting; elsewhere just spawn with null stdio. `reveal_path` → `reveal_target` then `app.opener().reveal_item_in_dir(path)`. `open_app_docs` → the catalog docs URL; refuse anything not starting with `https://`; `app.opener().open_url(url, None::<&str>)`. Pickers use `app.dialog().file()` with `blocking_pick_folder()` / `blocking_save_file()` (add filter `HedgeBuddy profile` → `json`, `set_file_name(default_name)`) / `blocking_pick_file()` (same filter), inside `blocking(...)` so they never run on the main thread; a cancelled dialog returns `PickedPath { path: None }`. Register all thirteen in `generate_handler!`.

- [ ] **Step 4: Build and test**

Run: `(cd crates/app/ui && bun run build) && cargo test --workspace 2>&1 | tail -5 && cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add crates/app Cargo.lock
git commit -m "feat(app): editing commands, dialog and opener plugins, catalog reload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: UI data layer for editing, and the unsaved-changes guard

**UI task: load and follow the frontend-design skill; the Design direction sections (5A's and this plan's) bind it.**

**Files:**
- Modify: `crates/app/ui/src/api/tools.gen.ts` (regenerated), `crates/app/ui/src/api/queries.ts`, `crates/app/ui/src/App.tsx`, `crates/app/ui/src/components/app/app-shell.tsx`
- Create: `crates/app/ui/src/lib/unsaved.ts`, `crates/app/ui/src/lib/guarded-location.ts`, `crates/app/ui/src/components/app/unsaved-dialog.tsx`

**Interfaces:**
- Consumes: Tasks 2–5 (schemas regenerate into `tools.gen.ts`: `VariablesOverviewOutput`, `RequirementRow`, `RequirementState`, `ScriptsOverviewOutput`, `ScriptRow`, `TargetAttachment`, `AppsOverviewOutput`, `AppRow`, `PathState`, `ScriptTemplateOutput`, `ExportProfileOutput`, `ImportProfileOutput`, `Opened`, `PickedPath`, and the tool types such as `AttachScriptOutput`, `SyncAttachmentsOutput`, `Action`, `AttachState`, `RegValue`).
- Produces:
  - Hooks in `@/api/queries`: `useVariablesOverview()`, `useScriptsOverview()`, `useAppsOverview()`, `useAttachments(app: string | null)`, `useAppDescription(app: string | null)`, `usePathStatus(paths: string[])`, `useScriptSource(name: string | null)`, `useScriptCheck(name: string | null)`, and `invalidateHedgeState()` (reloads everything that reads Hedge app settings: `scripts_overview`, `apps_overview`, `list_attachments`, `describe_app`, `home_summary`).
  - `@/lib/unsaved`: `useUnsaved(key: string, dirty: boolean)`, `hasUnsaved()`, `confirmLeave(): Promise<boolean>`, `useLeavePrompt()`.
  - `@/lib/guarded-location`: `useGuardedHashLocation` (a wouter location hook whose navigate asks first when something is unsaved).
  - `UnsavedDialog` (mounted once in `AppShell`).

- [ ] **Step 1: Regenerate the types**

Run: `cd crates/app/ui && bun run gen && bun run typecheck`
Expected: the file changes (new commands, `set_var` with optional `value`); the type check passes. If a new Rust type name clashes, rename it in Rust with `#[schemars(rename = "...")]`.

- [ ] **Step 2: Hooks and invalidation**

In `queries.ts`:
- Extend the reload map: `index` also reloads `variables_overview`, `scripts_overview`; `profile:*` also `variables_overview`, `scripts_overview`; `scripts:*` also `scripts_overview`, `variables_overview`; `catalog` also `apps_overview`, `scripts_overview`.
- `useVariablesOverview()` → `callApp("variables_overview", {})`.
- `useScriptsOverview()`, `useAppsOverview()`, `useAttachments(app)` (`list_attachments`), `useAppDescription(app)` (`describe_app`): `refetchOnWindowFocus: true` (Hedge app settings live outside the data folder, so no `data-changed` covers them).
- `usePathStatus(paths)`: key on the sorted unique non-empty paths; `enabled` when there is at least one; `staleTime: 10_000`.
- `useScriptSource(name)` (`read_script`), `useScriptCheck(name)` (`check_script`, `staleTime: 30_000`; it starts Python).
- `invalidateHedgeState()`: invalidates the five names above. Every attach, detach, sync and clear calls it on success, because registry and workspace changes raise no `data-changed`.

- [ ] **Step 3: The unsaved-changes guard**

`src/lib/unsaved.ts`:

```ts
import { useEffect, useSyncExternalStore } from "react";

/** Edits that are not saved yet, by editor key (spec §7: leaving with unsaved changes asks first). */
const dirty = new Set<string>();
const listeners = new Set<() => void>();
let pending: { decide: (leave: boolean) => void } | null = null;
const notify = () => listeners.forEach((l) => l());

/** Mark an editor dirty while `isDirty` is true; cleared on unmount. */
export function useUnsaved(key: string, isDirty: boolean) {
  useEffect(() => {
    if (isDirty) dirty.add(key);
    else dirty.delete(key);
    return () => {
      dirty.delete(key);
    };
  }, [key, isDirty]);
}

export const hasUnsaved = () => dirty.size > 0;

/** True to go ahead (discarding the edits), false to stay. Asks only when something is unsaved. */
export function confirmLeave(): Promise<boolean> {
  if (!hasUnsaved()) return Promise.resolve(true);
  if (pending) return Promise.resolve(false);
  return new Promise((resolve) => {
    pending = {
      decide: (leave) => {
        pending = null;
        if (leave) dirty.clear();
        notify();
        resolve(leave);
      },
    };
    notify();
  });
}

/** The open question, for UnsavedDialog. */
export function useLeavePrompt() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pending,
  );
}
```

`src/lib/guarded-location.ts`:

```ts
import { useCallback } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import { confirmLeave } from "./unsaved";

/** wouter's hash location, whose navigate asks before throwing away unsaved edits. Links and navigate() both go through it. */
export function useGuardedHashLocation(): ReturnType<typeof useHashLocation> {
  const [location, navigate] = useHashLocation();
  const guarded = useCallback(
    (to: Parameters<typeof navigate>[0], options?: Parameters<typeof navigate>[1]) => {
      void confirmLeave().then((ok) => {
        if (ok) navigate(to, options);
      });
    },
    [navigate],
  ) as typeof navigate;
  return [location, guarded];
}
```

`App.tsx`: `<Router hook={useGuardedHashLocation}>`. `unsaved-dialog.tsx`: a `Dialog` bound to `useLeavePrompt()`: title "Discard unsaved changes?", one sentence "Your edits have not been saved.", buttons "Keep editing" (focused first, outline) and "Discard" (primary); Escape and the overlay mean Keep editing. Mount it once in `AppShell`. Selecting another item inside a list screen goes through `navigate`, so it is guarded too; a screen that changes selection without navigating calls `confirmLeave()` itself.

- [ ] **Step 4: Verify**

Run: `bun run gen:check && bun run build`
Expected: pass. Nothing visible changes yet; the Variables screen (Task 10) exercises the guard.

- [ ] **Step 5: Commit**

```bash
git add crates/app/ui
git commit -m "feat(ui): data layer for editing and the unsaved-changes guard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The preview's in-memory model

**Files:**
- Create: `crates/app/ui/src/mock/model.ts`
- Modify: `crates/app/ui/src/mock/fixtures.ts`, `crates/app/ui/src/mock/handlers.ts`, `crates/app/ui/README.md` (scenarios)

**Interfaces:**
- Consumes: the generated types.
- Produces: an in-memory model, typed against `tools.gen.ts`, behind every tool and command the 5B screens use, consistent across calls: `list_profiles`, `get_profile`, `create_profile`, `set_active_profile`, `delete_profile` (dry run), `list_vars`, `get_var` (reveal), `set_var` (value optional), `delete_var` (dry run), `list_scripts`, `read_script`, `write_script`, `delete_script` (dry run), `check_script`, `list_attachments`, `attach_script`, `detach_script`, `sync_attachments`, `clear_stale_attachment` (all with dry run), `list_apps`, `describe_app`, and the app commands `variables_overview`, `scripts_overview`, `apps_overview`, `path_status`, `script_template`, `export_profile`, `import_profile`, `open_in_editor`, `reveal_path`, `open_app_docs`, `pick_folder`, `pick_export_path`, `pick_import_file`, plus 5A's `home_summary`, `list_runs`, `get_run`, `activity`, `preferences_get`. A new scenario `macos`.

- [ ] **Step 1: The model**

`model.ts` holds, per scenario: profiles (description; variables with type, value and description; secrets; scripts by name → source), the active profile, the OS (`windows` or `macos`), app statuses, and each app's events → attach state. It exposes the handlers' logic. Rules that keep the screens honest:
- **Manifests** are parsed from the script source with a small JS port of core's rule (first `"""` docstring, text before a `---` line when it starts with `{`); a parse error becomes `manifest_error`.
- **Requirements** follow core: a variable counts as declared only when it has a value (secrets: an entry in the secrets map); type mismatch beats missing; a default satisfies an absent variable.
- **Dry runs** return exactly the shapes the real tools do; applying changes the model. On `windows` an attach is one `registry_set` on `HKCU\Software\Hedge` (FoolCat: `HKCU\Software\FoolCat`) named `EventScript<Event>` (with the catalog's internal names: `VerificationIssue` → `EventScriptCheckpointIssue`, `OffShootStarted` → `EventScriptAppStarted`, `DisksIdle` → `EventScriptAllDisksIdle`) plus `EventScriptAllowScripting = 1`; on `macos` it is one `workspace_prefs` on `~/Library/Preferences/Hedge/Workspaces/HedgeBuddy.json`, the event becomes `staged`, and the result carries the tool's apply note. Unsupported events on `macos`: OffShoot's `OffShootStarted`, `TransfersAdded`, `SourceAdded`, and every FoolCat and EditReady event (manual).
- **Writes** emit `data-changed` for what they touch (`profile:<name>`, `scripts:<name>`, `index`), like the real watcher; registry and workspace changes emit nothing (the UI reloads Hedge state itself).
- **`home_summary`** derives its variable issues, stale entries and badges from the model, so Home, the sidebar and the new screens agree; runs and activity stay as in 5A.
- **`path_status`**: a path on drive `X:` or under `/Volumes/Offline` is not mounted (and does not exist); an empty path does not exist; anything else exists.
- **Pickers** return fixed paths (`D:/Offload/NEW` for a folder; `C:/Users/you/Documents/<default name>` to save; `C:/Users/you/Documents/commercial-one-day.hedgebuddy.json` to open). `import_profile` copies `commercial-one-day` under the new name without secret values. `open_in_editor`, `reveal_path` and `open_app_docs` return `Opened` and log to the console.

- [ ] **Step 2: Scenario data**

`problems` (default) matches the mockups:
- Profile `commercial-one-day` (active): `PROJECT_NAME` string `ClientX Spot` ("Client and project name"), `SLACK_WEBHOOK` secret (value `https://hooks.slack.com/services/T000/B000/XXXX`, "Incoming webhook URL"), `DEST_ROOTS` path[] `D:/Offload`, `F:/Offload`, `NOTIFY` bool true, `REPORT_DIR` path `X:/Reports`, `RETRIES` int 3, `THRESHOLD` float 0.5, `API_URL` url `https://api.example.com/v1`, `CAMERAS` string[] `A`, `B`.
- Scripts: `on_copy_complete.py` (OffShoot `FileCopyCompleted`; requires `SLACK_WEBHOOK` secret "Incoming webhook URL", `PROJECT_NAME` string, `CLIENT_EMAIL` string "Who gets the delivery report"; body posts to Slack), `on_disk_added.py` (OffShoot `DiskAdded`; requires `NOTIFY` bool), `foolcat_report.py` (FoolCat `ReportCreated`), `helpers_notes.py` (no manifest).
- Attachments: OffShoot `FileCopyCompleted` → `on_copy_complete.py` (this profile), `DiskAdded` → `on_disk_added.py`, `VerificationIssue` → the operator's own `C:\Tools\notify_dit.py`, `DiskIdle`, `DisksIdle` and `DiskBusy` → stale files under `C:\Users\you\Quills\service\`, the rest detached; FoolCat `ReportCreated` → `foolcat_report.py`. Apps: OffShoot `26.1 (1023)`, scripting on, Pro; FoolCat `26.1.1`, scripting on; EditReady not installed; Canister not available on Windows.
- Profile `doc-series`: two variables and one script, nothing attached.

`healthy`: the same with `CLIENT_EMAIL` set, `REPORT_DIR` on `D:/Reports`, and no stale events. `empty`: no profiles. `error` and `busy`: as in 5A (`busy` fails writes; `window.__hb.busy([...])` narrows them). `macos`: `problems`' profiles on `macos`: OffShoot `FileCopyCompleted` `staged`, the unsupported events above, Canister available.

- [ ] **Step 3: Verify**

Run: `bun run build`
Expected: pass (the model type-checks against the generated types).

Open `http://localhost:5199/?scenario=problems#/` in the preview and confirm Home's badges now come from the model (Variables 1, Hedge apps 3), then that `?scenario=macos#/` loads.

- [ ] **Step 4: Commit**

```bash
git add crates/app/ui
git commit -m "feat(ui): in-memory model behind the preview for the editing screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The change-preview dialog

**UI task: load and follow the frontend-design skill before writing code; the Design direction sections bind it.**

**Files:**
- Create: `crates/app/ui/src/lib/actions.ts`, `crates/app/ui/src/components/app/change-preview-dialog.tsx`
- Modify: `crates/app/ui/src/screens/design/design-gallery.tsx` (a section with the dialog in every state)

**Interfaces:**
- Consumes: `Action`, `AttachState`, `RegValue` (generated), `ErrorPanel`, `Mono`, `showError`, `Button`, `Dialog`.
- Produces:
  - `@/lib/actions`: `type ChangeKind = "registry" | "registry_delete" | "workspace" | "file" | "delete" | "attach" | "detach"`; `interface ChangeRow { kind: ChangeKind; target: string; detail?: string }`; `describeActions(actions: Action[]): ChangeRow[]`; `describeState(state: AttachState): string` (plain words for what an event runs, e.g. "your own file C:\Tools\notify_dit.py", "on_x.py from profile doc-series", "a file that no longer exists: …", "a change waiting in OffShoot Helper").
  - `ChangePreviewDialog<P, R>` with props `{ open: boolean; onOpenChange(open: boolean): void; title: string; applyLabel: string; destructive?: boolean; plan: () => Promise<P>; describe: (plan: P) => PreviewModel; apply: () => Promise<R>; onApplied?: (result: R) => void }` and `interface PreviewModel { summary: ReactNode; changes: ChangeRow[]; warnings?: ReactNode[]; blocked?: string; nothingToDo?: string }`.

- [ ] **Step 1: The wording**

```ts
import type { Action, AttachState, RegValue } from "@/api/tools.gen";

export type ChangeKind = "registry" | "registry_delete" | "workspace" | "file" | "delete" | "attach" | "detach";

/** One line of the change preview (spec §7: the words come from the dry-run result). */
export interface ChangeRow {
  kind: ChangeKind;
  /** What changes, shown in mono: a registry value, a file. */
  target: string;
  /** How it changes, in plain words. */
  detail?: string;
}

const regValue = (v: RegValue) => (v.type === "string" ? v.data : `${v.data}`);

export function describeActions(actions: Action[]): ChangeRow[] {
  return actions.map((a): ChangeRow => {
    switch (a.action) {
      case "registry_set":
        return { kind: "registry", target: `${a.key}\\${a.value}`, detail: `set to ${regValue(a.data)}` };
      case "registry_delete":
        return { kind: "registry_delete", target: `${a.key}\\${a.value}`, detail: "removed" };
      case "workspace_prefs":
        return {
          kind: "workspace",
          target: a.path,
          detail: Object.entries(a.set)
            .map(([k, v]) => `${k} = ${typeof v === "string" ? v : JSON.stringify(v)}`)
            .join(", "),
        };
      case "write_file":
        return { kind: "file", target: a.path, detail: "written" };
    }
  });
}

export function describeState(state: AttachState): string {
  switch (state.state) {
    case "attached":
      return `${state.script} from profile ${state.profile}`;
    case "external":
      return `your own file ${state.path}`;
    case "stale":
      return `a file that no longer exists: ${state.path}`;
    case "staged":
      return "a change waiting in OffShoot Helper";
    case "detached":
      return "nothing";
    case "manual":
      return state.note;
    case "unsupported":
      return "nothing (not supported here)";
  }
}
```

(Adjust the field access to the generated types; the switches stay exhaustive with a `never` check.)

- [ ] **Step 2: The dialog**

States, in order: **planning** (on open, run `plan()`; show three skeleton ledger rows), **plan failed** (`ErrorPanel` with Retry re-running `plan()`, no Apply), **blocked** (`describe` returned `blocked`: the reason in a neutral panel, no Apply), **nothing to do** (`nothingToDo`: one muted sentence, only Close), **ready** (summary sentence; amber warning rows with `triangle-alert`; the ledger: one row per `ChangeRow` with its icon — `key-round` registry, `key-square` registry_delete, `file-cog` workspace, `file-pen` file, `trash-2` delete, `link` attach, `unlink` detach — the target in mono `text-xs` (wrapping, `break-all`), and the detail in muted text; footer Cancel and Apply), **applying** (Apply shows a spinner and "Applying…", both buttons disabled), then on success close, call `onApplied(result)`, and toast a short past-tense confirmation supplied by the caller through `onApplied`; on failure keep the dialog open in ready state and `showError(e, apply)` (busy offers Try again). Apply is `variant="destructive"` when `destructive`, else primary. The dialog re-plans every time it opens (the machine may have changed). Focus: Apply once ready (Cancel for destructive dialogs); Escape cancels unless applying.

Design per the Design direction: a precise ledger in a `well`, max height 45 vh with scroll, 520 px wide, the summary in `text-base`, warnings above the ledger.

- [ ] **Step 3: Gallery**

Add a "Change preview" section to `#/_design` with buttons opening the dialog in each state (planning forever, failed, blocked, nothing to do, a Windows attach that replaces your own file, a macOS staged attach, a delete), using fake `plan`/`apply` functions.

- [ ] **Step 4: Verify, including visually**

Run: `bun run build`
Expected: pass. In the browser pane at 960×640 and 480×640 (preview on port 5199, `#/_design`), open every state: the ledger reads as plain words, warnings are amber, delete uses the destructive button, focus lands on Apply (Cancel for delete), long paths wrap without breaking the layout, the dialog fits 480 px with 12 px margins. If the browser pane is not available to you, say so in the report.

- [ ] **Step 5: Commit**

```bash
git add crates/app/ui
git commit -m "feat(ui): change-preview dialog with plain-words ledger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Typed editors

**UI task: load and follow the frontend-design skill before writing code; the Design direction sections bind it.**

**Files:**
- Create: `crates/app/ui/src/lib/var-values.ts`, `crates/app/ui/src/components/editors/var-editor.tsx`, `crates/app/ui/src/components/editors/list-editor.tsx`, `crates/app/ui/src/components/editors/path-editor.tsx`, `crates/app/ui/src/components/editors/secret-editor.tsx`
- Modify: `crates/app/ui/src/screens/design/design-gallery.tsx` (an Editors section)

**Interfaces:**
- Consumes: `VarType` (generated), `callApp` (`pick_folder`), `usePathStatus`, `Switch`, `Input`, `Button`.
- Produces:
  - `@/lib/var-values`: `VAR_TYPES: VarType[]` (in the spec's order), `type EditValue = string | boolean | string[]`, `toEdit(type, value: unknown): EditValue`, `fromEdit(type, edit): unknown` (the JSON `set_var` takes: numbers as numbers), `validateValue(type, edit): string | null`, `validateName(name): string | null`, `summarize(type, value: unknown): string` (list-row text: `ClientX Spot`, `2 folders`, `on`/`off`, `••••••••`, `not set`), `emptyEdit(type): EditValue`.
  - `VarEditor({ id, type, value: EditValue, onChange(v: EditValue): void, error: string | null, secret?: SecretState })`: one field per type, the error under it (`aria-describedby`), amber "not mounted" note for path and path[].
  - `SecretEditor`: masked until Reveal; props `{ id, state: SecretState, onChange }` where `SecretState = { changed: boolean; value: string; revealed: string | null }` and a `reveal(): Promise<string>` callback supplied by the screen.

- [ ] **Step 1: Values and validation**

`src/lib/var-values.ts` mirrors core (`crates/core/src/variable.rs`, spec main §5):

```ts
import type { VarType } from "@/api/tools.gen";

/** The nine types, in the order the spec lists them. */
export const VAR_TYPES: VarType[] = ["string", "secret", "int", "float", "bool", "path", "url", "string[]", "path[]"];

/** What an editor holds: numbers are edited as text so a half-typed "1." is not lost. */
export type EditValue = string | boolean | string[];

export function emptyEdit(type: VarType): EditValue {
  if (type === "bool") return false;
  if (type === "string[]" || type === "path[]") return [];
  return "";
}

export function toEdit(type: VarType, value: unknown): EditValue {
  if (value === null || value === undefined) return emptyEdit(type);
  if (type === "bool") return value === true;
  if (type === "string[]" || type === "path[]") return Array.isArray(value) ? value.map(String) : [];
  return String(value);
}

export function fromEdit(type: VarType, edit: EditValue): unknown {
  if (type === "int") return Number.parseInt(String(edit).trim(), 10);
  if (type === "float") return Number(String(edit).trim());
  return edit;
}

/** Why a value cannot be saved, or null. Same rules as core. */
export function validateValue(type: VarType, edit: EditValue): string | null {
  const text = typeof edit === "string" ? edit.trim() : "";
  switch (type) {
    case "int":
      return /^-?\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? null : "Enter a whole number.";
    case "float":
      return text !== "" && Number.isFinite(Number(text)) ? null : "Enter a number.";
    case "path":
      return text !== "" ? null : "Enter a folder or file path.";
    case "url":
      return /^https?:\/\//.test(text) ? null : "Start the address with http:// or https://.";
    case "path[]":
      return (edit as string[]).every((p) => p.trim() !== "") ? null : "Fill in or remove the empty folder.";
    default:
      return null;
  }
}

/** Main spec §5: variable names are ^[A-Z][A-Z0-9_]*$. */
export function validateName(name: string): string | null {
  return /^[A-Z][A-Z0-9_]*$/.test(name) ? null : "Use capital letters, digits and underscores, starting with a letter.";
}

/** The short text a list row shows for a value. */
export function summarize(type: VarType, value: unknown): string {
  if (type === "secret") return value === null || value === undefined ? "not set" : "••••••••";
  if (value === null || value === undefined) return "not set";
  if (type === "bool") return value ? "on" : "off";
  if (type === "path[]") return `${(value as unknown[]).length} ${(value as unknown[]).length === 1 ? "folder" : "folders"}`;
  if (type === "string[]") return (value as unknown[]).join(", ");
  return String(value);
}
```

- [ ] **Step 2: The editors**

- **string:** `Input`. **url:** `Input` (mono) with the http(s) rule. **int, float:** `Input` with `inputMode="numeric"`/`"decimal"`, tabular mono, right-aligned text.
- **bool:** `Switch` with the word "On"/"Off" beside it.
- **path:** mono `Input` plus an icon button (`folder-open`, `aria-label="Choose a folder"`) that calls `callApp("pick_folder", { title: "Choose a folder" })` and fills the field when a path comes back. Under it, when `usePathStatus([value])` says the drive is not mounted: amber `triangle-alert` + "Drive X: is not connected. You can still save it." (macOS: "The volume is not mounted. You can still save it.").
- **string[], path[]:** `ListEditor`: one mono row per item with a text field (path rows also get the folder button and the not-mounted note), up and down icon buttons (`arrow-up`, `arrow-down`; disabled at the ends; `aria-label` "Move up"/"Move down") and a remove button (`x`, `aria-label="Remove"`); an "Add" text button at the end appends an empty row and focuses it. Keyboard: every control is a button, reachable by Tab.
- **secret:** `SecretEditor`: a password `Input` showing `••••••••` as its placeholder while `changed` is false (meaning "keep the stored secret"); typing sets `changed` and the new value; a "Reveal" text button calls the screen's `reveal()` (which uses `get_var` with `reveal: true`), shows the value in the field as plain text and switches to "Hide"; the revealed value is kept only in this component's state.

Every editor renders the error from `validateValue` under the field in `text-xs text-destructive` with `aria-invalid` and `aria-describedby`.

- [ ] **Step 3: Gallery**

An "Editors" section in `#/_design` with every type, valid and invalid values, a not-mounted path, a list with three items, and a secret (a fake `reveal`).

- [ ] **Step 4: Verify, including visually**

Run: `bun run build`
Expected: pass. Browser pane at 960×640 and 480×640 on `#/_design`: every editor fits 480 px, errors sit under their fields, list reorder and remove work with keyboard only, the folder button fills the field (mock path), the not-mounted note is amber, Reveal shows and Hide masks. If the browser pane is not available to you, say so in the report.

- [ ] **Step 5: Commit**

```bash
git add crates/app/ui
git commit -m "feat(ui): typed editors for the nine variable types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Variables screen

**UI task: load and follow the frontend-design skill before writing code; the Design direction sections bind it.** Compare with `variables.html` option B. Spec §6.3 and §7 are binding.

**Files:**
- Create: `crates/app/ui/src/screens/variables/{variables-screen,variable-list,variable-detail}.tsx`
- Modify: `crates/app/ui/src/App.tsx` (routes `/variables`, `/variables/:name`; the placeholder goes)

**Interfaces:**
- Consumes: `useVariablesOverview`, `usePathStatus`, `callTool` (`set_var`, `get_var` with `reveal`, `delete_var`), `invalidateFor`, `useUnsaved`, `confirmLeave`, `ChangePreviewDialog`, `VarEditor`, `SecretEditor`, `var-values` helpers, `ListDetail`, `useListKeyboard`, `EmptyState`, `ErrorPanel`, `StatusIcon`, `Mono`, `showError`.
- Produces: `VariablesScreen({ name?: string })`. Routes: `/variables`; `/variables/new` (a new variable); `/variables/<NAME>` — the variable when it exists, otherwise the new-variable form prefilled from the requirement of that name (so Home's "CLIENT_EMAIL is needed" link lands on a ready Add form).

- [ ] **Step 1: The list**

- **Toolbar:** a filter field (name, type, description) and a primary icon button `plus` with `aria-label="New variable"` → `/variables/new`.
- **Needs a value:** when the overview has requirements in `missing` or `type_mismatch`, a `micro-label` "NEEDS A VALUE" and one amber row each (warning tint background, `braces` icon): the name in mono, second line "`<type>` · needed by `<first script>`" (+ " and N more"), and at the right "Add" (missing) or "Fix" (mismatch) as text. Selecting it opens `/variables/<NAME>`.
- **Variables:** `micro-label` "VARIABLES", then one row per variable: the name in mono, second line "`<type>` · `<summarize(type, value)>`"; path and path[] rows whose drive is not mounted (`usePathStatus` on all their values at once) end with an amber `triangle-alert` titled "Drive not connected".
- The list is one listbox (rows `tabIndex=-1`, `aria-activedescendant`) with arrow keys, Home and End (`useListKeyboard` with a `var-` id prefix); selection navigates, so the unsaved guard applies.
- **Empty:** no profile → `EmptyState` (`braces`, "No profile yet", "Create a profile from the profile menu at the top right."); no variables and no requirements → (`braces`, "No variables yet", "Variables hold the values your scripts read, such as a project name or a Slack webhook.", action "New variable"); filter with no match → "No variables match “…”".

- [ ] **Step 2: The detail**

- **Header:** the name in mono (`text-base`, `font-medium`) and a type chip.
- **Fields**, each with a micro-label: `VALUE · <type>` (the typed editor; secrets use `SecretEditor` with `reveal` calling `get_var` with `reveal: true` — never cached), `TYPE` (a select of `VAR_TYPES`; changing it clears the value field and shows the new editor), `DESCRIPTION` (text field).
- **A mismatch banner** when a script needs another type: amber, "on_copy_complete.py needs NOTIFY as bool; it is string." with a text button "Change type to bool" that sets the type select.
- **Required by:** each script that declares it, linking to `/scripts/<script>`: the script in mono, then " · OffShoot · FileCopyCompleted" muted; none → "No script needs it." muted.
- **New variable** (`/variables/new` or a name that is only a requirement): a NAME field (mono, typed as uppercase, `validateName`, and "A variable with this name already exists." when it does), TYPE (prefilled from the requirement), VALUE (a new secret needs a value), DESCRIPTION (prefilled from the requirement's description).
- **Footer** (sticky): Delete on the left as red text (existing variables only); on the right "Unsaved changes" micro-label when dirty, and Save (primary), enabled only when dirty and every field is valid.
- **Save:** `set_var` with `name`, `type`, `description`, and `value` from `fromEdit` — omitted for a secret whose field was not changed (the stored secret stays in Rust). On success toast "Saved <NAME>", invalidate `profile:<active>`, and after a new variable navigate (replace) to `/variables/<NAME>`. Errors: `showError` (busy offers Try again).
- **Delete:** `ChangePreviewDialog` (destructive): plan `delete_var` with `dry_run: true`; summary "Delete <NAME> from <profile>."; ledger one `delete` row with target `<profile> › <NAME>`; a warning per requiring script ("on_copy_complete.py needs it and will stop with an error until it is set again."). Apply `delete_var`; then navigate to `/variables`.
- **Unsaved changes:** `useUnsaved("variable:" + name, dirty)`; the guard asks before navigation; after Save or Delete the form is clean.

- [ ] **Step 3: Routes**

`/variables` → `<VariablesScreen />`, `/variables/:name` → `<VariablesScreen name={p.name} />` (no second decode).

- [ ] **Step 4: Verify, including visually**

Run: `bun run build`
Expected: pass.

Browser pane (port 5199) at 960×640 and 480×640, scenarios `problems`, `healthy`, `empty`, `error`, `busy`:
- `problems`: CLIENT_EMAIL pinned in amber with Add; REPORT_DIR shows the not-connected warning; selecting SLACK_WEBHOOK shows the mask, Reveal shows the webhook, Hide masks it; editing PROJECT_NAME enables Save and "Unsaved changes"; navigating away asks, Keep editing stays, Discard leaves; Save persists (the list updates).
- Add CLIENT_EMAIL from Home's attention link: the form is prefilled; saving removes the amber row and Home's badge.
- Each type's editor behaves as in Task 9; an invalid int blocks Save with the reason under the field.
- Delete PROJECT_NAME: the preview names on_copy_complete.py; Apply removes it.
- `busy`: Save shows the busy toast with Try again.
- 480 px: list, then the detail slides over with Back; the footer stays reachable.

If the browser pane is not available to you, say so in the report.

- [ ] **Step 5: Commit**

```bash
git add crates/app/ui
git commit -m "feat(ui): Variables screen with typed editors, requirements and delete preview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Profile menu: delete, export, import

**UI task: load and follow the frontend-design skill before writing code; the Design direction sections bind it.** Spec §6.3 ("Profile menu. Switch, new, and delete. Delete previews which attached scripts would be left pointing at deleted files." and "Import and export") is binding.

**Files:**
- Create: `crates/app/ui/src/components/app/{delete-profile-dialog,export-profile-dialog,import-profile-dialog}.tsx`, `crates/app/ui/src/components/ui/checkbox.tsx` (shadcn, restyled)
- Modify: `crates/app/ui/src/components/app/profile-switcher.tsx`, `crates/app/ui/src/api/queries.ts` (`useCreateProfile` retry memory, ruling 16)

**Interfaces:**
- Consumes: `ChangePreviewDialog`, `callApp` (`pick_export_path`, `export_profile`, `pick_import_file`, `import_profile`), `callTool` (`delete_profile`, `set_active_profile`), `useProfiles`, `invalidateFor`, `showError`.
- Produces: the toolbar profile menu with, after "New profile…": a separator, "Export profile…" (`download`), "Import profile…" (`upload`), and "Delete profile…" (`trash-2`, red text).

- [ ] **Step 1: Delete**

`ChangePreviewDialog` (destructive): plan `delete_profile` with `{ name, dry_run: true }`; summary "Delete profile <name> with its <N> variables and <M> scripts."; ledger: a `delete` row for the profile folder (`profiles/<name>`); warnings, one per `attached_to` entry: "<App> · <Event> runs <script> from this profile. After deleting, it points at a missing file. Sync another profile or detach it first." Apply `delete_profile`; toast "Deleted <name>"; invalidate `index`. When the active profile is deleted the app has none; Home shows its choose-a-profile step.

- [ ] **Step 2: Export**

A dialog "Export <name>": one sentence "Saves this profile's variables and scripts to one file you can import on another computer."; a checkbox "Include secret values"; when ticked an amber note "The file will hold <the secret names> in plain text. Keep it somewhere private."; the primary button "Choose where to save…" calls `pick_export_path` with `default_name: "<name>.hedgebuddy.json"`, then `export_profile` with `{ name, include_secrets, dest }`; toast "Exported <name> to <path>". A cancelled picker leaves the dialog open with nothing changed.

- [ ] **Step 3: Import**

"Import profile…" calls `pick_import_file` first; with a path, a dialog "Import a profile" shows the file path in mono, a NAME field (slug rule, "A profile with this name already exists." when it does; prefilled from the file name without `.hedgebuddy.json`), and a checkbox "Switch to it" (ticked). Import calls `import_profile` with `{ path, name }`, then `set_active_profile` when ticked and not already active; toast "Imported <name>: <N> variables, <M> scripts." and, when `secrets_missing` is not empty, a second amber line in the toast "Set <names> before its scripts run." Invalidate `index`.

- [ ] **Step 4: The create-retry memory**

In `useCreateProfile`, clear the remembered "created but not activated" profile when the create dialog closes and on any failure that is not busy (ruling 16).

- [ ] **Step 5: Verify, including visually**

Run: `bun run build`
Expected: pass. Browser pane at 960×640 and 480×640: in `problems`, Delete profile… on commercial-one-day shows the three attached events as warnings and deletes on Apply; Export with and without secrets toasts the path (and the secret note appears only when ticked); Import creates `commercial-one-day-2` (rename in the field), switches to it, and warns about the missing secret; in `busy`, delete and import show the busy toast with Try again. Every dialog fits 480 px and returns focus to the profile pill when it closes. If the browser pane is not available to you, say so in the report.

- [ ] **Step 6: Commit**

```bash
git add crates/app/ui
git commit -m "feat(ui): profile menu: delete with preview, export and import

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Scripts screen

**UI task: load and follow the frontend-design skill before writing code; the Design direction sections bind it.** Compare with the Scripts half of `scripts-runs.html` (Lucide icons and words replace its dots; no teal). Spec §6.4 is binding.

**Files:**
- Create: `crates/app/ui/src/screens/scripts/{scripts-screen,script-list,script-detail,script-preview,new-script-dialog}.tsx`
- Modify: `crates/app/ui/src/App.tsx` (routes `/scripts`, `/scripts/:name`)

**Interfaces:**
- Consumes: `useScriptsOverview`, `useAppsOverview`, `useScriptSource`, `useScriptCheck`, `invalidateHedgeState`, `invalidateFor`, `callTool` (`attach_script`, `detach_script`, `sync_attachments`, `delete_script`, `write_script`), `callApp` (`script_template`, `open_in_editor`, `reveal_path`), `ChangePreviewDialog`, `describeActions`, `describeState`, `STATUS`, `ListDetail`, `useListKeyboard`.
- Produces: `ScriptsScreen({ name?: string })`.

- [ ] **Step 1: The list**

- **Toolbar:** the filter field and a primary "New" button (`plus`) opening the New script dialog; under it a full-width outline button "Sync attachments to this profile" (`link`).
- **Rows:** the name in mono; second line "<App> · <Event> · <state word>" where the state word comes from `attachment`: attached → "attached"; staged → "apply in OffShoot Helper"; other_script → "runs <script> from <profile>"; external → "runs your own file"; stale → "points at a missing file"; free → "nothing attached"; manual → "attach by hand"; unsupported → "not supported yet"; unknown → "can't read the app's settings"; no_target → "no manifest" (or "no app event" when the manifest has none); then " · N unmet" when `unmet` is not empty. The right-hand status icon by priority: `manifest_error` or `catalog_error` → `alert` (amber); unmet → `varMissing` (amber); staged → `staged` (amber); attached → `attached`; anything else → `detached` (muted).
- One listbox with arrow keys (`script-` id prefix).
- **Empty:** no scripts → `EmptyState` (`file-code`, "No scripts yet", "Scripts run when a Hedge app fires an event. Start one from a template.", action "New script").

- [ ] **Step 2: The detail**

- **Header:** the name in mono and two text buttons: "Open in editor" (`square-pen`; `open_in_editor`; toast "Opened in <with>") and "Show in folder" (`folder-open`; `reveal_path` with the script's path from the overview's profile folder).
- **Chips:** "<App> · <Event>" and the attachment state (icon + word from `STATUS`). A sentence explaining the target's current state in plain words, e.g. "FileCopyCompleted runs your own file C:\Tools\notify_dit.py. Attaching replaces it." (`describeState`).
- **Manifest or catalog error:** an amber panel with the error text.
- **NEEDS:** one row per `requires` entry: the variable in mono and, at the right, "set" (neutral `circle-check`), "missing · Add" (amber, links to `/variables/<NAME>`), or "should be <type> · Fix" (amber). None → "Needs no variables." muted.
- **CHECK** (`check_script`, loaded when the detail opens; a "Check again" text button refetches): "Python <version>" (neutral check), "compiles" (neutral check) or the compile error (red `circle-x` and the message in mono), and the package: "hedgebuddy <version>" (neutral) or the package problem (amber `package`). Without Python: amber "Python 3 not found".
- **Preview:** `script-preview.tsx`: the source (`read_script`) in a well with line numbers, per the Design direction.
- **Footer:** Delete (red text) on the left; on the right Detach (outline) when attached or staged to this script, else Attach (outline) when the target is free, stale, external or another script, disabled with a title "Set <names> first" when requirements are unmet.

- [ ] **Step 3: The preview dialogs**

- **Attach:** plan `attach_script` `{ name, dry_run: true }`; summary "Attach <script> to <App> · <Event>."; warning when `replaces` is set: "It replaces <describeState(replaces)>."; ledger `describeActions(actions)`; Apply `attach_script`; on success `invalidateHedgeState()`, toast "Attached <script>", and when the result has `note`, a second toast with the note (8 s). A tool error (unmet requirements) shows as the plan-failed state.
- **Detach:** plan `detach_script`; summary "Detach <script> from <App> · <Event>."; ledger from actions.
- **Delete:** plan `delete_script`; summary "Delete <script> from <profile>."; ledger a `delete` row for the file; warnings for each `attached_to`: "<App> · <Event> still runs it. Detach it first, or the event will point at a missing file."; Apply `delete_script`; then navigate to `/scripts`; invalidate `scripts:<profile>` and Hedge state.
- **Sync:** plan `sync_attachments` `{ dry_run: true }`; summary "Make the Hedge apps run <profile>'s scripts."; ledger: one `attach` row per `attach` item ("<App> · <Event>" → "run <script>"), one `detach` row per `detach` item, then `describeActions(actions)`; warnings: each `replaces` ("<App> · <Event> now runs <describeState>."), each conflict ("<scripts> all target <App> · <Event>; none was attached."), each skip ("<script>: <reason>"); `nothingToDo` when there are no actions: "The Hedge apps already run this profile's scripts."; Apply `sync_attachments`; then as Attach (note toast on macOS).

- [ ] **Step 4: New script**

`new-script-dialog.tsx`: an app select (apps from `useAppsOverview`, installed first), an event select (the app's events with their descriptions as secondary text), and a NAME field (mono) filled from `script_template` for the chosen app and event until the operator edits it (script-name rule: ends in `.py`, no path characters). Create: `script_template` → `write_script` `{ name, source }` → `open_in_editor` → navigate to `/scripts/<name>`; toast "Created <name>". Errors: `showError`.

- [ ] **Step 5: Routes and verify, including visually**

Routes `/scripts` and `/scripts/:name` (no second decode).

Run: `bun run build`
Expected: pass.

Browser pane at 960×640 and 480×640:
- `problems`: on_copy_complete.py shows attached with "1 unmet"; its detail lists CLIENT_EMAIL missing with Add; the check lists Python, compiles and the package problem (0.10.0); the preview shows the source with line numbers.
- Detach on_disk_added.py, then Attach it again: each dialog shows its registry rows; Apply updates the list and the detail.
- Attach is disabled on on_copy_complete.py only while CLIENT_EMAIL is missing (after detaching it), with the "Set CLIENT_EMAIL first" title.
- Detach on_copy_complete.py, then Sync: the sync preview lists the attach and the three stale events are untouched; Apply attaches.
- Delete foolcat_report.py warns that FoolCat · ReportCreated still runs it.
- New script: OffShoot · DiskIdle → on_disk_idle.py is created and selected.
- `macos`: attaching stages and shows the OffShoot Helper note; unsupported events say so.
- `busy`: Apply shows the busy toast with Try again.

If the browser pane is not available to you, say so in the report.

- [ ] **Step 6: Commit**

```bash
git add crates/app/ui
git commit -m "feat(ui): Scripts screen with attach, detach, sync, delete previews and new-from-template

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Hedge apps screen

**UI task: load and follow the frontend-design skill before writing code; the Design direction sections bind it.** Compare with `hedge-apps.html` (icons and words replace its dots; no teal). Spec §6.5 is binding.

**Files:**
- Create: `crates/app/ui/src/screens/apps/{apps-screen,app-list,app-detail,events-table}.tsx`
- Modify: `crates/app/ui/src/App.tsx` (routes `/apps`, `/apps/:id`)

**Interfaces:**
- Consumes: `useAppsOverview`, `useAttachments`, `useAppDescription`, `invalidateHedgeState`, `callTool` (`clear_stale_attachment`), `callApp` (`open_app_docs`), `ChangePreviewDialog`, `describeActions`, `STATUS`, `ListDetail`, `useListKeyboard`.
- Produces: `AppsScreen({ id?: string })`.

- [ ] **Step 1: The list**

- **Header action:** a refresh icon button (`rotate-cw`, `aria-label="Refresh"`) calling `invalidateHedgeState()` (the screens also refetch on window focus).
- **Rows:** the app name; second line "<version> · <attached> attached · <stale> stale" (omit zero parts), or "not installed", or "macOS only"/"Windows only" when `available_here` is false (then the row is muted). The right-hand icon: stale > 0 → `stale` (amber) with the count in its title; newer than tested, or scripting off with something attached → `alert` (amber); otherwise nothing.
- One listbox with arrow keys (`app-` id prefix).

- [ ] **Step 2: The detail**

- **Header:** the name and the version (muted); at the right a "Docs" text button (`external-link`) calling `open_app_docs`.
- **Chips:** scripting on (neutral) or off (amber when something is attached, else muted); "needs Pro" when `requires_pro`; "tested with <tested_against>" (neutral), plus an amber "newer than tested" chip when `newer_than_tested`.
- **Stale bar** (spec: "a warning bar for stale entries, with Clear all"): an amber-tinted bar "<n> events point at scripts that no longer exist" with a text button "Clear all <n>".
- **Events table** (`events-table.tsx`, from `list_attachments`): columns EVENT, RUNS and an action column. EVENT is the id (with the catalog description as a muted second line from the container width 560 px up, and as the `title` below). RUNS by state:
  - attached: `link` icon, the script in mono, then "this profile" or the profile name (muted);
  - external: `file-code`, the path in mono, then "your own file";
  - stale: `file-x` amber, the path in muted mono, then "file missing" in amber; action "Clear";
  - staged: `hourglass` amber, "apply in OffShoot Helper";
  - detached: `unlink` muted, "nothing attached";
  - manual: `hand`, "set in the app" (the note as `title`);
  - unsupported: `ban` muted, "not supported yet".
  Below 480 px of container width each row stacks (event, then what it runs, then the action).
- **Footer note** (muted): "Attaching and detaching happen from Scripts. This screen shows the app's side and cleans up leftovers."
- **Not installed / not available:** an `EmptyState` in the detail ("OffShoot is not installed on this computer." / "Canister runs on macOS only.").

- [ ] **Step 3: Clearing**

- **One event:** `ChangePreviewDialog`: plan `clear_stale_attachment` `{ app, event, dry_run: true }`; summary "Clear <Event>: it points at <path>, which no longer exists."; ledger from actions; Apply; `invalidateHedgeState()`; toast "Cleared <Event>".
- **Clear all:** plan runs the dry run for every stale event (sequentially) and concatenates the ledgers under one summary "Clear <n> events that point at missing files."; Apply runs each for real in order; if one fails, stop, toast which one failed with its message, and reload Hedge state (the ones before it are cleared).

- [ ] **Step 4: Routes and verify, including visually**

Routes `/apps` and `/apps/:id`.

Run: `bun run build`
Expected: pass.

Browser pane at 960×640 and 480×640:
- `problems`: OffShoot shows 26.1, 2 attached (plus your own file), 3 stale; the detail's stale bar, the table with each state's icon and word; Clear on DiskIdle previews one registry removal and applies; Clear all previews the rest together.
- FoolCat attached; EditReady not installed; Canister "Windows" shows as unavailable.
- `macos`: staged and unsupported rows.
- Docs opens (mock logs); refresh reloads.
- 480 px: the table stacks; the detail slides over the list.

If the browser pane is not available to you, say so in the report.

- [ ] **Step 5: Commit**

```bash
git add crates/app/ui
git commit -m "feat(ui): Hedge apps screen with events table and stale clean-up

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Docs: smoke steps, changelog, readmes

**Files:**
- Modify: `docs/smoke-checklist.md`, `CHANGELOG.md`, `crates/app/ui/README.md`

- [ ] **Step 1: Smoke checklist, editing part**

Add a section "8. Desktop app editing (phase 5B)" to `docs/smoke-checklist.md` (run on Windows and macOS; the checklist still needs the user's go-ahead because it changes real Hedge settings):
- [ ] Variables: add, edit and delete one variable of each type; Reveal a secret; a path on an unplugged drive shows "not connected" and still saves; leaving with an unsaved edit asks first. Result:
- [ ] A secret's description can be changed without re-typing the secret. Result:
- [ ] Scripts: New from template opens the file in the editor (with and without an editor command in preferences.json). Result:
- [ ] Attach, Detach and Sync each show the preview (registry rows on Windows; the OffShoot Helper workspace and the apply note on macOS) and change the app's setting as shown. Result:
- [ ] Hedge apps: Clear one stale entry and Clear all; the table updates after Refresh and on returning to the window. Result:
- [ ] Delete a script, a variable and a profile: each preview names what stays attached. Result:
- [ ] Export a profile without and with secrets (on macOS the file with secrets is owner-only: `ls -l`), then import it under a new name on the same or another machine. Result:
- [ ] Show in folder and Docs open the right places. Result:
- [ ] Edit a catalog override in `<data>/catalog/` while the app is open: Hedge apps and Scripts reflect it without a restart. Result:

- [ ] **Step 2: Changelog and README**

`CHANGELOG.md` under Unreleased, full sentences in the file's style: the editing screens, the change preview, typed editors, profile export and import, `set_var` keeping the value when it is omitted, the new app commands, catalog reload. `crates/app/ui/README.md`: the `macos` scenario, what each scenario shows for the new screens, and that pickers and opening run in Rust (no webview permission).

- [ ] **Step 3: Commit**

```bash
git add docs/smoke-checklist.md CHANGELOG.md crates/app/ui/README.md
git commit -m "docs: editing smoke steps, changelog, UI readme

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (phase 5 spec, 5B scope):**
- §4.3 app commands for 5B: `open_in_editor`, `reveal_path` (allow-list), `script_template`, `export_profile`, `import_profile` → Tasks 1, 4, 5; pickers from `tauri-plugin-dialog`, opening and revealing from `tauri-plugin-opener`, capabilities limited → Task 5.
- §6.3 Variables: list and detail (option B), missing requirements pinned with Add, typed editor, description, required-by links, profile menu switch/new/delete with the attached-scripts preview, import and export with secrets opt-in → Tasks 3, 9, 10, 11.
- §6.4 Scripts: each script's state, Sync, New; detail with app and event, attachment state, required variables set or missing, the check (Python, compiles, package), read-only preview, Open in editor, Detach, Delete; New from template opening in the editor; previews for Sync, Attach, Detach, Delete; the macOS note → Tasks 3, 12.
- §6.5 Hedge apps: version or not installed or macOS only; version, scripting, Pro, tested-with; stale warning bar with Clear all; every event with §5.2's states and Clear on stale rows; preview for clearing; refresh; attach only from Scripts → Tasks 3, 13.
- §7: change preview → Task 8 (used in 10–13); saving and the unsaved guard → Tasks 6, 10; typed editors → Task 9; errors and busy → every screen; empty states and keyboard → every list.
- §9 app-only command tests: profile export without secrets unless asked, and import → Task 1 (core) and Task 4 (files); home summary and activity were 5A; the Claude Desktop merge is 5C.
- Parked from 5A: catalog reload (M5) → Task 5; the create-retry memory → Task 11.

**Placeholders:** Rust tasks carry the code and tests; where an installed crate's API may differ (Tauri dialog `blocking_*` names, opener's `reveal_item_in_dir` signature) the step names the call and the test/build fixes it. UI tasks carry complete code for the shared logic (unsaved guard, action wording, value rules) and exact specifications (copy, states, icons, behaviour) for composition, which frontend-design and the visual checks govern.

**Type consistency:** `ProfileArgs`, the overview types and `TargetAttachment` (Task 3) are what Tasks 10, 12 and 13 read through the generated types; `SecretState` and `EditValue` (Task 9) are used by Task 10; `ChangePreviewDialog`'s props and `ChangeRow` (Task 8) by Tasks 10–13; `useUnsaved`/`confirmLeave` (Task 6) by Task 10; `invalidateHedgeState` (Task 6) by Tasks 12 and 13; command names match the registry (Task 4) and the Tauri handlers (Task 5).
