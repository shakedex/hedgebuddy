# Phase 1: Repo Reset and Scaffold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repository's contents with a fresh Rust workspace (core, CLI, Tauri app), a Python package skeleton, shared JSON Schemas with conformance fixtures, and CI that is green on Windows and macOS, on a new orphan `main` branch with the old history archived under a tag.

**Architecture:** One Cargo workspace with three crates. `hedgebuddy-core` is a library with no UI; `hedgebuddy-cli` is a thin binary named `hedgebuddy`; `hedgebuddy-app` is a Tauri 2 shell whose frontend lives in `crates/app/ui` (Vite + React + TypeScript). The `schema/` folder is the contract between Rust and Python: both test suites validate the same fixtures against the same JSON Schemas. Nothing functional beyond "print the data directory" ships in this phase.

**Tech Stack:** Rust stable (1.98 at time of writing), Cargo workspace, Tauri 2.x (not the 3.0 alpha), clap 4, serde/serde_json, directories 6, thiserror 2, jsonschema 0.56 (Rust, dev only), assert_cmd 2, tempfile 3; bun 1.4 for the frontend, Vite + React 19 + TypeScript; Python 3.9+ with hatchling, uv, pytest, and the `jsonschema` package as a dev-only dependency; GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md` (sections 4, 5, 6, 11, 12, 13 are the ones this phase implements).

## Global Constraints

- Versioning is ZeroVer; the version everywhere is `0.11.0` (root `VERSION`, workspace `Cargo.toml`, `python/pyproject.toml`, `crates/app/tauri.conf.json`, `crates/app/ui/package.json`).
- Python package: name `hedgebuddy`, `requires-python = ">=3.9"`, runtime `dependencies = []`. Dev-only dependencies are allowed.
- Rust edition 2021 for every crate. Tauri dependency spec is `"2"`, never a 3.x pre-release.
- Data directory is `%APPDATA%\HedgeBuddy` on Windows and `~/Library/Application Support/HedgeBuddy` on macOS, overridable by the `HEDGEBUDDY_DATA_DIR` environment variable.
- Variable names match `^[A-Z][A-Z0-9_]*$`. Variable types are exactly: `string`, `secret`, `int`, `float`, `bool`, `path`, `url`, `string[]`, `path[]`.
- Profile names are slugs matching `^[a-z0-9][a-z0-9-]{0,63}$` and double as the profile directory name (clarification added to the spec in Task 3).
- Storage `version` fields are the integer `1`. Script manifest `hedgebuddy` field is the integer `1`.
- No compatibility with 0.10 anywhere: no migration code, no old API names.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Shell commands below are for Git Bash on Windows (the machine this was written on). Paths use forward slashes. The repo root is `E:/Coding/hedgebuddy`.
- Do not push `main`, change the GitHub default branch, or delete `master` until Task 9. Tasks 1 through 8 are local except for pushing the archive tag.

---

### Task 1: Archive the old history and start the orphan `main` branch

**Files:**
- Create: `.gitignore`, `VERSION`, `README.md`, `CHANGELOG.md`
- Keep from old tree: `LICENSE`, `DISCLAIMER`, `branding/hedgebuddy_icon2.png`, `branding/hedgebuddy_icon2.ico`, `branding/hedgebuddy_icon2.icns`, `branding/hedgebuddy.psd`, `branding/github.png`, `branding/github_cover.psd`, `docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md`, `docs/superpowers/plans/2026-09-15-phase1-repo-reset-and-scaffold.md`
- Everything else from the old tree is dropped.

**Interfaces:**
- Produces: the tag `legacy/0.10.0` on the remote, and a local orphan branch `main` with one commit. Every later task commits on `main`.

- [ ] **Step 1: Commit the two dangling modifications on `master` so nothing is lost in the archive**

```bash
cd E:/Coding/hedgebuddy
git status --short
git add docs/superpowers/plans/2026-05-24-quills-repo-split.md python-lib/uv.lock
git commit -m "docs: record quills split execution notes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git status --short
```
Expected: the last `git status --short` prints nothing.

- [ ] **Step 2: Tag `master` as the archive and push the tag**

```bash
git tag -a legacy/0.10.0 -m "Archive of the Go/Fyne HedgeBuddy before the v0.11 overhaul"
git push origin legacy/0.10.0
git ls-remote --tags origin | grep legacy/0.10.0
```
Expected: one line ending in `refs/tags/legacy/0.10.0`.

- [ ] **Step 3: Create the orphan branch and empty the index and working tree**

```bash
git checkout --orphan main
git rm -rf -q .
rm -rf app updater python-lib tests examples tools scripts build docs .vscode .github Makefile CONTRIBUTING.md TODO.md skills-lock.json hedgebuddy-smoke.exe
rm -f branding/quills.*
ls
```
Expected: `ls` shows only `branding` (with `github.png`, `github_cover.psd`, `hedgebuddy.psd`, `hedgebuddy_icon2.icns`, `hedgebuddy_icon2.ico`, `hedgebuddy_icon2.png`) plus any ignored leftovers like `.venv` directories. `git status --short` shows nothing staged.

- [ ] **Step 4: Restore the files that carry over from the archive**

```bash
git checkout legacy/0.10.0 -- LICENSE DISCLAIMER branding/hedgebuddy_icon2.png branding/hedgebuddy_icon2.ico branding/hedgebuddy_icon2.icns branding/hedgebuddy.psd branding/github.png branding/github_cover.psd docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md
git show legacy/0.10.0:docs/superpowers/plans/2026-09-15-phase1-repo-reset-and-scaffold.md > /dev/null 2>&1 && git checkout legacy/0.10.0 -- docs/superpowers/plans/2026-09-15-phase1-repo-reset-and-scaffold.md
git status --short
```
Expected: the listed files appear as `A` (added). If the plan file was not committed on `master` before Step 2, copy it in from wherever it lives and `git add` it; it must be in the initial commit.

- [ ] **Step 5: Write `.gitignore`**

```gitignore
# Rust
/target/
**/target/

# Tauri
/crates/app/gen/

# Node / Vite
node_modules/
/crates/app/ui/dist/
*.local

# Python
__pycache__/
*.py[cod]
.venv/
.pytest_cache/
/python/dist/
/python/build/
*.egg-info/

# OS / editor
.DS_Store
Thumbs.db
.idea/
.vscode/

# Local only
.env
.worktrees/
outside-resources/
```

- [ ] **Step 6: Write `VERSION`, `README.md`, `CHANGELOG.md`**

`VERSION` (no trailing newline is fine, a single trailing newline is also fine):
```
0.11.0
```

`README.md`:
```markdown
<p align="center">
  <img src="branding/github.png" alt="HedgeBuddy" width="640" />
</p>

# HedgeBuddy

HedgeBuddy is a small setup tool for DITs who automate Hedge's apps (OffShoot, FoolCat, EditReady, Canister) with Python scripts. It stores the variables and profiles those scripts read, keeps the scripts per profile, attaches them to Hedge app events, and exposes all of that to AI agents through an MCP server.

**Status:** being rebuilt from scratch. This branch is the 0.11 line. The previous Go/Fyne app and 0.10 Python library are archived under the git tag `legacy/0.10.0` and are not compatible with anything here.

## Layout

| Path | What it is |
|---|---|
| `crates/core` | All logic: storage, profiles, catalog, Hedge app integration |
| `crates/cli` | The `hedgebuddy` binary; `hedgebuddy mcp` serves MCP over stdio |
| `crates/app` | Tauri 2 desktop app; frontend in `crates/app/ui` |
| `python` | Pure-Python `hedgebuddy` package that scripts import |
| `schema` | JSON Schemas and fixtures shared by the Rust and Python test suites |
| `docs/superpowers/specs` | Design specs |

## Development

```bash
# Rust (build the frontend first; the app crate embeds it)
cd crates/app/ui && bun install && bun run build && cd ../../..
cargo test --workspace

# Python
cd python && uv sync && uv run pytest
```

## License

MIT. HedgeBuddy is an independent, open-source project, not affiliated with Hedge (hedge.co).
```

`CHANGELOG.md`:
```markdown
# Changelog

All notable changes to this project are documented here. Versioning follows [ZeroVer](https://0ver.org/).

## Unreleased

### Changed
- Fresh start. The Go/Fyne desktop app, the Go updater, and the 0.10 Python library are archived under the git tag `legacy/0.10.0`. Nothing in this line is compatible with them.

### Added
- Cargo workspace with `hedgebuddy-core`, `hedgebuddy-cli`, and `hedgebuddy-app` (Tauri 2).
- Python package skeleton at `python/`.
- Shared JSON Schemas and conformance fixtures at `schema/`.
- CI on Windows and macOS.
```

- [ ] **Step 7: Make the initial commit**

```bash
git add -A
git status --short
git commit -m "chore: fresh start for the v0.11 overhaul

Archive of the previous implementation is tagged legacy/0.10.0.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline
```
Expected: `git log --oneline` prints exactly one line. `git status --short` before the commit listed only `LICENSE`, `DISCLAIMER`, the six branding files, the spec, this plan, `.gitignore`, `VERSION`, `README.md`, `CHANGELOG.md`.

---

### Task 2: Cargo workspace and the `hedgebuddy-core` crate

**Files:**
- Create: `Cargo.toml`, `rust-toolchain.toml`, `crates/core/Cargo.toml`, `crates/core/src/lib.rs`, `crates/core/src/paths.rs`

**Interfaces:**
- Produces: `hedgebuddy_core::data_dir() -> Result<PathBuf, hedgebuddy_core::PathError>` and the constant `hedgebuddy_core::DATA_DIR_ENV: &str = "HEDGEBUDDY_DATA_DIR"`. Tasks 4 and 6 call `data_dir()`.

- [ ] **Step 1: Write the workspace manifest and toolchain file**

`Cargo.toml` (repo root):
```toml
[workspace]
resolver = "2"
members = ["crates/core"]

[workspace.package]
version = "0.11.0"
edition = "2021"
license = "MIT"
repository = "https://github.com/shakedex/hedgebuddy"

[workspace.dependencies]
hedgebuddy-core = { path = "crates/core" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
directories = "6"
```

`rust-toolchain.toml`:
```toml
[toolchain]
channel = "stable"
components = ["rustfmt", "clippy"]
```

- [ ] **Step 2: Write the core crate manifest and an empty lib**

`crates/core/Cargo.toml`:
```toml
[package]
name = "hedgebuddy-core"
version.workspace = true
edition.workspace = true
license.workspace = true
repository.workspace = true
description = "Core logic for HedgeBuddy: storage, profiles, catalog, and Hedge app integration"

[dependencies]
directories = { workspace = true }
thiserror = { workspace = true }

[dev-dependencies]
tempfile = "3"
```

`crates/core/src/lib.rs`:
```rust
//! HedgeBuddy core.
//!
//! Everything HedgeBuddy does lives here. The CLI, the MCP server, and the
//! desktop app are thin front ends over this crate. This crate has no UI and
//! never parses command-line arguments.

pub mod paths;

pub use paths::{data_dir, PathError, DATA_DIR_ENV};
```

`crates/core/src/paths.rs` (stub so the crate compiles; the real body comes in Step 4):
```rust
//! Location of the HedgeBuddy data directory.

use std::path::PathBuf;

/// Environment variable that overrides the data directory. Used by tests and
/// by anyone who wants HedgeBuddy to keep its files somewhere unusual.
pub const DATA_DIR_ENV: &str = "HEDGEBUDDY_DATA_DIR";

/// Errors from resolving the data directory.
#[derive(Debug, thiserror::Error)]
pub enum PathError {
    #[error("could not determine the user's application data directory")]
    NoBaseDir,
}

/// Resolve the HedgeBuddy data directory. Does not create it.
pub fn data_dir() -> Result<PathBuf, PathError> {
    todo!()
}
```

Run: `cargo build --workspace`
Expected: compiles with no errors (a `todo!()` is fine for now; there may be an unused-import warning, which disappears in Step 4).

- [ ] **Step 3: Write the failing test**

Append to `crates/core/src/paths.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    // One test, not two, because the two halves mutate the same process-wide
    // environment variable and cargo runs tests in parallel threads.
    #[test]
    fn data_dir_honours_env_override_then_falls_back_to_platform_default() {
        std::env::set_var(DATA_DIR_ENV, "Z:/hb-override");
        assert_eq!(data_dir().unwrap(), PathBuf::from("Z:/hb-override"));

        std::env::set_var(DATA_DIR_ENV, "");
        let d = data_dir().unwrap();
        assert!(d.ends_with("HedgeBuddy"), "got {}", d.display());

        std::env::remove_var(DATA_DIR_ENV);
        let d = data_dir().unwrap();
        assert!(d.ends_with("HedgeBuddy"), "got {}", d.display());

        #[cfg(target_os = "windows")]
        {
            let appdata = std::env::var("APPDATA").expect("APPDATA is set on Windows");
            assert!(d.starts_with(&appdata), "{} should start with {}", d.display(), appdata);
        }
        #[cfg(target_os = "macos")]
        {
            let s = d.to_string_lossy();
            assert!(s.contains("Library/Application Support"), "got {s}");
        }
    }
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cargo test -p hedgebuddy-core`
Expected: FAIL with `not yet implemented` panic from `todo!()`.

- [ ] **Step 5: Implement `data_dir`**

Replace the `todo!()` body in `crates/core/src/paths.rs`:
```rust
pub fn data_dir() -> Result<PathBuf, PathError> {
    if let Some(v) = std::env::var_os(DATA_DIR_ENV) {
        if !v.is_empty() {
            return Ok(PathBuf::from(v));
        }
    }
    let base = directories::BaseDirs::new().ok_or(PathError::NoBaseDir)?;
    // `config_dir()` is %APPDATA% (Roaming) on Windows and
    // ~/Library/Application Support on macOS, which is exactly what the spec asks for.
    Ok(base.config_dir().join("HedgeBuddy"))
}
```

- [ ] **Step 6: Run the test to verify it passes, plus fmt and clippy**

Run:
```bash
cargo test -p hedgebuddy-core
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 1 test passed; fmt and clippy clean. If `cargo fmt --all --check` complains, run `cargo fmt --all` and re-check.

- [ ] **Step 7: Commit**

```bash
git add Cargo.toml Cargo.lock rust-toolchain.toml crates/core
git commit -m "feat(core): workspace and data_dir resolution

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: JSON Schemas, conformance fixtures, and the Rust conformance test

**Files:**
- Create: `schema/README.md`, `schema/hedgebuddy.schema.json`, `schema/profile.schema.json`, `schema/secrets.schema.json`, `schema/run-record.schema.json`, `schema/script-manifest.schema.json`
- Create fixtures: `schema/fixtures/valid/basic/hedgebuddy.json`, `schema/fixtures/valid/basic/profiles/commercial-one-day/profile.json`, `schema/fixtures/valid/basic/profiles/commercial-one-day/secrets.json`, `schema/fixtures/valid/basic/profiles/commercial-one-day/scripts/on_copy_complete.py`, `schema/fixtures/valid/basic/runs/2026-09-15.jsonl`, `schema/fixtures/invalid/profile/secret-with-value.json`, `schema/fixtures/invalid/profile/lowercase-variable-name.json`, `schema/fixtures/invalid/profile/url-not-http.json`, `schema/fixtures/invalid/hedgebuddy/bad-profile-slug.json`, `schema/fixtures/invalid/script-manifest/unknown-type.json`, `schema/fixtures/invalid/run-record/end-without-status.json`
- Create test: `crates/core/tests/schema_conformance.rs`
- Modify: `crates/core/Cargo.toml` (dev-dependencies), `docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md` (profile-name clarification)

**Interfaces:**
- Produces: the fixture convention documented in `schema/README.md`. Task 5's Python test implements the same convention. Phase 2 and phase 4 add "expected parsed output" files next to fixtures; this task only establishes validity.

- [ ] **Step 1: Add the profile-name clarification to the spec**

In `docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md`, section 5, directly after the `profile.json` code block, add this paragraph:

```markdown
Profile `name` is a slug matching `^[a-z0-9][a-z0-9-]{0,63}$` and is also the directory name under `profiles/`. Human-readable wording goes in `description`.
```

- [ ] **Step 2: Write `schema/README.md`**

```markdown
# HedgeBuddy schemas and fixtures

The JSON Schemas here (draft 2020-12) are the contract between the Rust core and the Python library. Both test suites validate the same fixtures against the same schemas, so the storage format cannot drift between them.

| Schema | Describes |
|---|---|
| `hedgebuddy.schema.json` | `<data>/hedgebuddy.json` |
| `profile.schema.json` | `<data>/profiles/<name>/profile.json` |
| `secrets.schema.json` | `<data>/profiles/<name>/secrets.json` |
| `run-record.schema.json` | one line of `<data>/runs/*.jsonl` |
| `script-manifest.schema.json` | the JSON block at the top of a script's module docstring |

## Fixture convention

`fixtures/valid/<case>/` is a complete data directory. Every file in it must validate:

- `hedgebuddy.json` against `hedgebuddy.schema.json`
- `profiles/*/profile.json` against `profile.schema.json`
- `profiles/*/secrets.json` against `secrets.schema.json`
- every line of `runs/*.jsonl` against `run-record.schema.json`
- the manifest extracted from every `profiles/*/scripts/*.py` against `script-manifest.schema.json`

`fixtures/invalid/<schema-stem>/*.json` are single documents that must **fail** validation against `<schema-stem>.schema.json`.

Manifest extraction: take the module docstring (the first `"""..."""` block in the file), keep the text before the first line that is exactly `---`, parse it as JSON.
```

- [ ] **Step 3: Write the five schemas**

`schema/hedgebuddy.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/shakedex/hedgebuddy/schema/hedgebuddy.schema.json",
  "title": "HedgeBuddy data directory index",
  "type": "object",
  "required": ["version", "active_profile"],
  "additionalProperties": false,
  "properties": {
    "version": { "const": 1 },
    "active_profile": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{0,63}$" }
  }
}
```

`schema/profile.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/shakedex/hedgebuddy/schema/profile.schema.json",
  "title": "HedgeBuddy profile",
  "type": "object",
  "required": ["version", "name", "variables"],
  "additionalProperties": false,
  "properties": {
    "version": { "const": 1 },
    "name": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{0,63}$" },
    "description": { "type": "string" },
    "variables": {
      "type": "object",
      "propertyNames": { "pattern": "^[A-Z][A-Z0-9_]*$" },
      "additionalProperties": { "$ref": "#/$defs/variable" }
    }
  },
  "$defs": {
    "variableType": {
      "enum": ["string", "secret", "int", "float", "bool", "path", "url", "string[]", "path[]"]
    },
    "variable": {
      "type": "object",
      "required": ["type"],
      "additionalProperties": false,
      "properties": {
        "type": { "$ref": "#/$defs/variableType" },
        "value": {},
        "description": { "type": "string" }
      },
      "allOf": [
        { "if": { "properties": { "type": { "const": "string" } } },
          "then": { "required": ["value"], "properties": { "value": { "type": "string" } } } },
        { "if": { "properties": { "type": { "const": "secret" } } },
          "then": { "not": { "required": ["value"] } } },
        { "if": { "properties": { "type": { "const": "int" } } },
          "then": { "required": ["value"], "properties": { "value": { "type": "integer" } } } },
        { "if": { "properties": { "type": { "const": "float" } } },
          "then": { "required": ["value"], "properties": { "value": { "type": "number" } } } },
        { "if": { "properties": { "type": { "const": "bool" } } },
          "then": { "required": ["value"], "properties": { "value": { "type": "boolean" } } } },
        { "if": { "properties": { "type": { "const": "path" } } },
          "then": { "required": ["value"], "properties": { "value": { "type": "string", "minLength": 1 } } } },
        { "if": { "properties": { "type": { "const": "url" } } },
          "then": { "required": ["value"], "properties": { "value": { "type": "string", "pattern": "^https?://" } } } },
        { "if": { "properties": { "type": { "const": "string[]" } } },
          "then": { "required": ["value"], "properties": { "value": { "type": "array", "items": { "type": "string" } } } } },
        { "if": { "properties": { "type": { "const": "path[]" } } },
          "then": { "required": ["value"], "properties": { "value": { "type": "array", "items": { "type": "string", "minLength": 1 } } } } }
      ]
    }
  }
}
```

`schema/secrets.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/shakedex/hedgebuddy/schema/secrets.schema.json",
  "title": "HedgeBuddy profile secrets",
  "type": "object",
  "propertyNames": { "pattern": "^[A-Z][A-Z0-9_]*$" },
  "additionalProperties": { "type": "string" }
}
```

`schema/run-record.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/shakedex/hedgebuddy/schema/run-record.schema.json",
  "title": "HedgeBuddy run record (one JSONL line)",
  "type": "object",
  "required": ["ts", "run_id", "phase"],
  "properties": {
    "ts": { "type": "string", "format": "date-time" },
    "run_id": { "type": "string", "minLength": 1 },
    "phase": { "enum": ["start", "log", "end"] }
  },
  "allOf": [
    { "if": { "properties": { "phase": { "const": "start" } } },
      "then": {
        "required": ["script", "profile"],
        "properties": {
          "app": { "type": "string" },
          "event": { "type": "string" },
          "script": { "type": "string", "minLength": 1 },
          "profile": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{0,63}$" }
        }
      } },
    { "if": { "properties": { "phase": { "const": "log" } } },
      "then": { "required": ["message"], "properties": { "message": { "type": "string" } } } },
    { "if": { "properties": { "phase": { "const": "end" } } },
      "then": {
        "required": ["status", "exit_code"],
        "properties": {
          "status": { "enum": ["ok", "failed", "error"] },
          "exit_code": { "type": "integer" },
          "traceback": { "type": "string" }
        }
      } }
  ]
}
```

`schema/script-manifest.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/shakedex/hedgebuddy/schema/script-manifest.schema.json",
  "title": "HedgeBuddy script manifest",
  "type": "object",
  "required": ["hedgebuddy"],
  "additionalProperties": false,
  "properties": {
    "hedgebuddy": { "const": 1 },
    "app": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
    "event": { "type": "string", "pattern": "^[A-Za-z][A-Za-z0-9]*$" },
    "requires": {
      "type": "object",
      "propertyNames": { "pattern": "^[A-Z][A-Z0-9_]*$" },
      "additionalProperties": {
        "type": "object",
        "required": ["type"],
        "additionalProperties": false,
        "properties": {
          "type": { "enum": ["string", "secret", "int", "float", "bool", "path", "url", "string[]", "path[]"] },
          "description": { "type": "string" },
          "default": {}
        }
      }
    }
  },
  "dependentRequired": { "event": ["app"] }
}
```

- [ ] **Step 4: Write the valid fixture data directory**

`schema/fixtures/valid/basic/hedgebuddy.json`:
```json
{ "version": 1, "active_profile": "commercial-one-day" }
```

`schema/fixtures/valid/basic/profiles/commercial-one-day/profile.json`:
```json
{
  "version": 1,
  "name": "commercial-one-day",
  "description": "Client X, single-day commercial",
  "variables": {
    "PROJECT_NAME": { "type": "string", "value": "ClientX Spot", "description": "Shown in Slack messages" },
    "DEST_ROOTS": { "type": "path[]", "value": ["D:/Offload", "F:/Offload"], "description": "Every external drive to offload to" },
    "NOTIFY": { "type": "bool", "value": true, "description": "" },
    "RETRIES": { "type": "int", "value": 3, "description": "" },
    "THRESHOLD": { "type": "float", "value": 0.85, "description": "" },
    "REPORT_DIR": { "type": "path", "value": "D:/Reports", "description": "" },
    "API_URL": { "type": "url", "value": "https://example.com/api", "description": "" },
    "CAMERAS": { "type": "string[]", "value": ["A", "B"], "description": "" },
    "SLACK_WEBHOOK": { "type": "secret", "description": "Incoming webhook URL" }
  }
}
```

`schema/fixtures/valid/basic/profiles/commercial-one-day/secrets.json`:
```json
{ "SLACK_WEBHOOK": "https://hooks.slack.com/services/T000/B000/XXXX" }
```

`schema/fixtures/valid/basic/profiles/commercial-one-day/scripts/on_copy_complete.py`:
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

# Body intentionally empty: this fixture exists to exercise manifest parsing.
```

`schema/fixtures/valid/basic/runs/2026-09-15.jsonl` (three lines, no blank line at the end is fine):
```
{"ts": "2026-09-15T18:23:47Z", "run_id": "01J7ZK3Q8R", "phase": "start", "app": "offshoot", "event": "FileCopyCompleted", "script": "on_copy_complete.py", "profile": "commercial-one-day"}
{"ts": "2026-09-15T18:23:48Z", "run_id": "01J7ZK3Q8R", "phase": "log", "message": "posted to slack"}
{"ts": "2026-09-15T18:23:48Z", "run_id": "01J7ZK3Q8R", "phase": "end", "status": "ok", "exit_code": 0}
```

- [ ] **Step 5: Write the invalid fixtures**

`schema/fixtures/invalid/profile/secret-with-value.json`:
```json
{ "version": 1, "name": "x", "variables": { "TOKEN": { "type": "secret", "value": "leaked" } } }
```

`schema/fixtures/invalid/profile/lowercase-variable-name.json`:
```json
{ "version": 1, "name": "x", "variables": { "project": { "type": "string", "value": "a" } } }
```

`schema/fixtures/invalid/profile/url-not-http.json`:
```json
{ "version": 1, "name": "x", "variables": { "API": { "type": "url", "value": "ftp://example.com" } } }
```

`schema/fixtures/invalid/hedgebuddy/bad-profile-slug.json`:
```json
{ "version": 1, "active_profile": "Commercial One Day" }
```

`schema/fixtures/invalid/script-manifest/unknown-type.json`:
```json
{ "hedgebuddy": 1, "app": "offshoot", "event": "FileCopyCompleted", "requires": { "X": { "type": "date" } } }
```

`schema/fixtures/invalid/run-record/end-without-status.json`:
```json
{ "ts": "2026-09-15T18:23:48Z", "run_id": "01J7ZK3Q8R", "phase": "end", "exit_code": 0 }
```

- [ ] **Step 6: Write the failing Rust conformance test**

Add to `crates/core/Cargo.toml` under `[dev-dependencies]`:
```toml
jsonschema = "0.56"
serde_json = { workspace = true }
```

`crates/core/tests/schema_conformance.rs`:
```rust
//! Validates the shared fixtures in `schema/fixtures` against the shared
//! schemas in `schema/`. The Python test suite runs the same check, so this
//! is what keeps the Rust and Python sides of the storage contract in step.

use std::fs;
use std::path::{Path, PathBuf};

use jsonschema::Validator;
use serde_json::Value;

fn schema_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../schema")
}

fn load_json(path: &Path) -> Value {
    let text = fs::read_to_string(path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("parse {}: {e}", path.display()))
}

fn validator(stem: &str) -> Validator {
    let schema = load_json(&schema_root().join(format!("{stem}.schema.json")));
    jsonschema::validator_for(&schema).unwrap_or_else(|e| panic!("schema {stem}: {e}"))
}

fn assert_valid(v: &Validator, instance: &Value, what: &str) {
    let errors: Vec<String> = v.iter_errors(instance).map(|e| e.to_string()).collect();
    assert!(errors.is_empty(), "{what} should be valid but:\n{}", errors.join("\n"));
}

/// Manifest extraction as documented in schema/README.md. Phase 2 moves this
/// into the core crate proper; until then the test owns it.
fn extract_manifest(py_source: &str) -> Value {
    let start = py_source.find("\"\"\"").expect("docstring start") + 3;
    let end = py_source[start..].find("\"\"\"").expect("docstring end") + start;
    let doc = &py_source[start..end];
    let json_part = doc
        .lines()
        .take_while(|line| line.trim_end() != "---")
        .collect::<Vec<_>>()
        .join("\n");
    serde_json::from_str(json_part.trim()).expect("manifest JSON")
}

fn dirs_in(path: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = fs::read_dir(path)
        .unwrap_or_else(|e| panic!("read_dir {}: {e}", path.display()))
        .map(|e| e.unwrap().path())
        .filter(|p| p.is_dir())
        .collect();
    v.sort();
    v
}

fn files_in(path: &Path, ext: &str) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = match fs::read_dir(path) {
        Ok(rd) => rd
            .map(|e| e.unwrap().path())
            .filter(|p| p.is_file() && p.extension().map(|x| x == ext).unwrap_or(false))
            .collect(),
        Err(_) => Vec::new(),
    };
    v.sort();
    v
}

#[test]
fn every_valid_fixture_data_dir_validates() {
    let hedgebuddy = validator("hedgebuddy");
    let profile = validator("profile");
    let secrets = validator("secrets");
    let run_record = validator("run-record");
    let manifest = validator("script-manifest");

    let cases = dirs_in(&schema_root().join("fixtures/valid"));
    assert!(!cases.is_empty(), "no valid fixture cases found");

    for case in cases {
        let name = case.file_name().unwrap().to_string_lossy().to_string();

        assert_valid(&hedgebuddy, &load_json(&case.join("hedgebuddy.json")), &format!("{name}/hedgebuddy.json"));

        for prof in dirs_in(&case.join("profiles")) {
            let pname = prof.file_name().unwrap().to_string_lossy().to_string();
            assert_valid(&profile, &load_json(&prof.join("profile.json")), &format!("{name}/{pname}/profile.json"));
            if prof.join("secrets.json").exists() {
                assert_valid(&secrets, &load_json(&prof.join("secrets.json")), &format!("{name}/{pname}/secrets.json"));
            }
            for script in files_in(&prof.join("scripts"), "py") {
                let src = fs::read_to_string(&script).unwrap();
                assert_valid(&manifest, &extract_manifest(&src), &script.display().to_string());
            }
        }

        for log in files_in(&case.join("runs"), "jsonl") {
            let text = fs::read_to_string(&log).unwrap();
            for (i, line) in text.lines().filter(|l| !l.trim().is_empty()).enumerate() {
                let v: Value = serde_json::from_str(line).unwrap();
                assert_valid(&run_record, &v, &format!("{}:{}", log.display(), i + 1));
            }
        }
    }
}

#[test]
fn every_invalid_fixture_fails_its_schema() {
    let groups = dirs_in(&schema_root().join("fixtures/invalid"));
    assert!(!groups.is_empty(), "no invalid fixture groups found");
    let mut checked = 0;
    for group in groups {
        let stem = group.file_name().unwrap().to_string_lossy().to_string();
        let v = validator(&stem);
        for file in files_in(&group, "json") {
            let instance = load_json(&file);
            assert!(!v.is_valid(&instance), "{} should be INVALID against {stem}.schema.json", file.display());
            checked += 1;
        }
    }
    assert!(checked >= 6, "expected at least 6 invalid fixtures, checked {checked}");
}
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cargo test -p hedgebuddy-core --test schema_conformance`
Expected: compile succeeds; if any schema or fixture has a mistake the relevant assertion fails with the file name. (If everything passes on the first run, that is acceptable: the fixtures were written to match the schemas. Deliberately break one, for example change `"const": 1` to `"const": 2` in `hedgebuddy.schema.json`, run again, see the failure, then restore it. Do not commit the broken state.)

- [ ] **Step 8: Run the tests to verify they pass**

Run:
```bash
cargo test -p hedgebuddy-core
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: `every_valid_fixture_data_dir_validates` and `every_invalid_fixture_fails_its_schema` pass alongside the paths test; fmt and clippy clean.

- [ ] **Step 9: Commit**

```bash
git add schema crates/core docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md Cargo.lock
git commit -m "feat(schema): storage and manifest schemas with conformance fixtures

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The `hedgebuddy` CLI crate

**Files:**
- Create: `crates/cli/Cargo.toml`, `crates/cli/src/main.rs`, `crates/cli/tests/cli.rs`
- Modify: `Cargo.toml` (workspace members)

**Interfaces:**
- Consumes: `hedgebuddy_core::data_dir()`.
- Produces: the binary `hedgebuddy` with `--version` and the subcommand `env`, which prints `data_dir=<path>` on one line. Phase 3 adds the rest of the subcommands and `mcp` here.

- [ ] **Step 1: Add the crate to the workspace and write its manifest**

In root `Cargo.toml`, change `members = ["crates/core"]` to:
```toml
members = ["crates/core", "crates/cli"]
```
and add to `[workspace.dependencies]`:
```toml
clap = { version = "4", features = ["derive"] }
```

`crates/cli/Cargo.toml`:
```toml
[package]
name = "hedgebuddy-cli"
version.workspace = true
edition.workspace = true
license.workspace = true
repository.workspace = true
description = "HedgeBuddy command line and MCP server"

[[bin]]
name = "hedgebuddy"
path = "src/main.rs"

[dependencies]
clap = { workspace = true }
hedgebuddy-core = { workspace = true }

[dev-dependencies]
assert_cmd = "2"
predicates = "3"
```

- [ ] **Step 2: Write the failing tests**

`crates/cli/tests/cli.rs`:
```rust
use assert_cmd::Command;
use predicates::prelude::*;

fn hb() -> Command {
    Command::cargo_bin("hedgebuddy").expect("binary built")
}

#[test]
fn version_flag_prints_the_workspace_version() {
    hb().arg("--version")
        .assert()
        .success()
        .stdout(predicate::str::contains(env!("CARGO_PKG_VERSION")));
}

#[test]
fn env_prints_the_data_dir_and_honours_the_override() {
    hb().env("HEDGEBUDDY_DATA_DIR", "Z:/hb-cli-test")
        .arg("env")
        .assert()
        .success()
        .stdout(predicate::str::contains("data_dir=Z:/hb-cli-test"));
}

#[test]
fn no_subcommand_is_a_usage_error() {
    hb().assert().failure().stderr(predicate::str::contains("Usage"));
}
```

- [ ] **Step 3: Write a stub main so the tests compile, then run them to see them fail**

`crates/cli/src/main.rs`:
```rust
fn main() {}
```

Run: `cargo test -p hedgebuddy-cli`
Expected: all three tests FAIL (`--version` exits 0 with empty stdout, so the `contains` predicate fails; `env` prints nothing; no-subcommand exits 0).

- [ ] **Step 4: Implement the CLI**

`crates/cli/src/main.rs`:
```rust
//! `hedgebuddy` command line. Every subcommand is a thin call into
//! `hedgebuddy_core`; no logic lives here.

use std::process::ExitCode;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "hedgebuddy", version, about = "HedgeBuddy command line", arg_required_else_help = true)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Print environment information (data directory and overrides in effect)
    Env,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.command {
        Command::Env => match hedgebuddy_core::data_dir() {
            Ok(dir) => {
                println!("data_dir={}", dir.display());
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("error: {e}");
                ExitCode::FAILURE
            }
        },
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass, plus fmt and clippy**

Run:
```bash
cargo test -p hedgebuddy-cli
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 3 passed; fmt and clippy clean.

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml Cargo.lock crates/cli
git commit -m "feat(cli): hedgebuddy binary with env subcommand

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Python package skeleton with the same conformance test

**Files:**
- Create: `python/pyproject.toml`, `python/README.md`, `python/hedgebuddy/__init__.py`, `python/hedgebuddy/py.typed`, `python/tests/__init__.py`, `python/tests/test_version.py`, `python/tests/test_schema_conformance.py`

**Interfaces:**
- Produces: importable package `hedgebuddy` with `hedgebuddy.__version__ == "0.11.0"`. Phase 4 fills in the API.

- [ ] **Step 1: Write the package manifest and README**

`python/pyproject.toml`:
```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "hedgebuddy"
version = "0.11.0"
description = "Read HedgeBuddy variables and Hedge app events from Python scripts"
readme = "README.md"
requires-python = ">=3.9"
license = "MIT"
authors = [{ name = "Shaked Lipszyc", email = "shakedl@gmail.com" }]
keywords = ["hedge", "offshoot", "foolcat", "editready", "dit", "environment", "variables"]
classifiers = [
  "Development Status :: 3 - Alpha",
  "Intended Audience :: End Users/Desktop",
  "License :: OSI Approved :: MIT License",
  "Programming Language :: Python :: 3",
  "Programming Language :: Python :: 3.9",
  "Programming Language :: Python :: 3.10",
  "Programming Language :: Python :: 3.11",
  "Programming Language :: Python :: 3.12",
  "Programming Language :: Python :: 3.13",
  "Operating System :: Microsoft :: Windows",
  "Operating System :: MacOS",
  "Topic :: Multimedia :: Video",
]
dependencies = []

[project.urls]
Homepage = "https://github.com/shakedex/hedgebuddy"
Repository = "https://github.com/shakedex/hedgebuddy"
Issues = "https://github.com/shakedex/hedgebuddy/issues"

[dependency-groups]
dev = ["pytest>=8", "jsonschema>=4.23"]

[tool.hatch.build.targets.wheel]
packages = ["hedgebuddy"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

`python/README.md`:
```markdown
# hedgebuddy

The Python side of [HedgeBuddy](https://github.com/shakedex/hedgebuddy). Scripts run by Hedge apps (OffShoot, FoolCat, EditReady) import this package to read their variables and the event payload.

Pure Python, no dependencies, Python 3.9+.

**Status:** 0.11 is a fresh start. The API arrives in the next release; this version only establishes the package.
```

- [ ] **Step 2: Write the package and the failing tests**

`python/hedgebuddy/__init__.py`:
```python
"""HedgeBuddy: variables and Hedge app events for Python scripts."""

__version__ = "0.11.0"

__all__ = ["__version__"]
```

`python/hedgebuddy/py.typed`: empty file.

`python/tests/__init__.py`: empty file.

`python/tests/test_version.py`:
```python
from pathlib import Path

import hedgebuddy

ROOT = Path(__file__).resolve().parents[2]


def test_package_version_matches_root_version_file():
    assert hedgebuddy.__version__ == (ROOT / "VERSION").read_text(encoding="utf-8").strip()
```

`python/tests/test_schema_conformance.py`:
```python
"""Validates schema/fixtures against schema/*.schema.json.

Mirrors crates/core/tests/schema_conformance.rs. The convention is documented in
schema/README.md. Both suites must stay in step.
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

SCHEMA_ROOT = Path(__file__).resolve().parents[2] / "schema"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def validator(stem: str) -> Draft202012Validator:
    schema = load_json(SCHEMA_ROOT / f"{stem}.schema.json")
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def assert_valid(v: Draft202012Validator, instance, what: str) -> None:
    errors = [e.message for e in v.iter_errors(instance)]
    assert not errors, f"{what} should be valid but:\n" + "\n".join(errors)


def extract_manifest(py_source: str):
    """Manifest extraction per schema/README.md. Phase 4 moves this into the package."""
    start = py_source.index('"""') + 3
    end = py_source.index('"""', start)
    doc = py_source[start:end]
    json_lines = []
    for line in doc.splitlines():
        if line.rstrip() == "---":
            break
        json_lines.append(line)
    return json.loads("\n".join(json_lines).strip())


def valid_cases():
    return sorted(p for p in (SCHEMA_ROOT / "fixtures" / "valid").iterdir() if p.is_dir())


@pytest.mark.parametrize("case", valid_cases(), ids=lambda p: p.name)
def test_valid_fixture_data_dir_validates(case: Path):
    hedgebuddy = validator("hedgebuddy")
    profile = validator("profile")
    secrets = validator("secrets")
    run_record = validator("run-record")
    manifest = validator("script-manifest")

    assert_valid(hedgebuddy, load_json(case / "hedgebuddy.json"), f"{case.name}/hedgebuddy.json")

    for prof in sorted(p for p in (case / "profiles").iterdir() if p.is_dir()):
        assert_valid(profile, load_json(prof / "profile.json"), f"{case.name}/{prof.name}/profile.json")
        if (prof / "secrets.json").exists():
            assert_valid(secrets, load_json(prof / "secrets.json"), f"{case.name}/{prof.name}/secrets.json")
        for script in sorted((prof / "scripts").glob("*.py")):
            assert_valid(manifest, extract_manifest(script.read_text(encoding="utf-8")), str(script))

    runs = case / "runs"
    if runs.exists():
        for log in sorted(runs.glob("*.jsonl")):
            for i, line in enumerate(log.read_text(encoding="utf-8").splitlines(), start=1):
                if line.strip():
                    assert_valid(run_record, json.loads(line), f"{log}:{i}")


def invalid_files():
    root = SCHEMA_ROOT / "fixtures" / "invalid"
    return sorted((group.name, f) for group in root.iterdir() if group.is_dir() for f in group.glob("*.json"))


@pytest.mark.parametrize("stem,file", invalid_files(), ids=lambda x: x.name if isinstance(x, Path) else x)
def test_invalid_fixture_fails_its_schema(stem: str, file: Path):
    v = validator(stem)
    assert not v.is_valid(load_json(file)), f"{file} should be INVALID against {stem}.schema.json"


def test_there_are_invalid_fixtures():
    assert len(invalid_files()) >= 6
```

- [ ] **Step 3: Install and run the tests**

```bash
cd E:/Coding/hedgebuddy/python
uv sync
uv run pytest -v
cd ..
```
Expected: all tests pass (1 version test, 1 valid case, 6 invalid fixtures, 1 count test). If a test fails, the failure names a fixture or schema file; fix the file, not the test. `uv sync` creates `python/uv.lock`; commit it.

- [ ] **Step 4: Confirm the package builds with zero runtime dependencies**

```bash
cd E:/Coding/hedgebuddy/python
uv build
uv run python -c "import zipfile,glob; z=zipfile.ZipFile(glob.glob('dist/*.whl')[0]); print([n for n in z.namelist() if n.endswith('METADATA')]); print(z.read([n for n in z.namelist() if n.endswith('METADATA')][0]).decode())"
rm -rf dist
cd ..
```
Expected: METADATA contains `Requires-Python: >=3.9` and no `Requires-Dist:` line.

- [ ] **Step 5: Commit**

```bash
git add python
git commit -m "feat(python): package skeleton and schema conformance test

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Tauri app scaffold with a Vite + React frontend

**Files:**
- Create: `crates/app/Cargo.toml`, `crates/app/build.rs`, `crates/app/tauri.conf.json`, `crates/app/capabilities/default.json`, `crates/app/src/main.rs`, `crates/app/src/lib.rs`, `crates/app/icons/*` (generated), `crates/app/ui/package.json`, `crates/app/ui/bun.lock` (generated), `crates/app/ui/index.html`, `crates/app/ui/vite.config.ts`, `crates/app/ui/tsconfig.json`, `crates/app/ui/src/main.tsx`, `crates/app/ui/src/App.tsx`, `crates/app/ui/src/vite-env.d.ts`
- Modify: `Cargo.toml` (workspace members)

**Interfaces:**
- Consumes: `hedgebuddy_core::data_dir()`.
- Produces: Tauri command `data_dir` returning `Result<String, String>`, invoked from React as `invoke<string>("data_dir")`. Phase 5 replaces the placeholder UI.

- [ ] **Step 1: Install the Tauri CLI (one-time, local machine)**

```bash
cargo install tauri-cli --version "^2" --locked
cargo tauri --version
```
Expected: prints `tauri-cli 2.x.y`.

- [ ] **Step 2: Write the frontend**

`crates/app/ui/package.json`:
```json
{
  "name": "hedgebuddy-ui",
  "private": true,
  "version": "0.11.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  }
}
```

Then add dependencies so bun resolves current versions:
```bash
cd E:/Coding/hedgebuddy/crates/app/ui
bun add react react-dom @tauri-apps/api
bun add -d vite @vitejs/plugin-react typescript @types/react @types/react-dom
cd ../../..
```
Expected: `package.json` now has `dependencies` and `devDependencies` blocks with caret versions, and `bun.lock` exists.

`crates/app/ui/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HedgeBuddy</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`crates/app/ui/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
```

`crates/app/ui/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`crates/app/ui/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`crates/app/ui/src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`crates/app/ui/src/App.tsx`:
```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function App() {
  const [dataDir, setDataDir] = useState<string>("…");

  useEffect(() => {
    invoke<string>("data_dir")
      .then(setDataDir)
      .catch((e: unknown) => setDataDir(`error: ${String(e)}`));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>HedgeBuddy</h1>
      <p>Scaffold build. Data directory:</p>
      <code>{dataDir}</code>
    </main>
  );
}
```

Build it once so `ui/dist` exists (the Rust crate embeds it at compile time):
```bash
cd E:/Coding/hedgebuddy/crates/app/ui
bun install
bun run build
ls dist
cd ../../..
```
Expected: `dist/index.html` and `dist/assets/` exist.

- [ ] **Step 3: Write the Tauri crate**

In root `Cargo.toml`, set:
```toml
members = ["crates/core", "crates/cli", "crates/app"]
```

`crates/app/Cargo.toml`:
```toml
[package]
name = "hedgebuddy-app"
version.workspace = true
edition.workspace = true
license.workspace = true
repository.workspace = true
description = "HedgeBuddy desktop app"

[lib]
name = "hedgebuddy_app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { workspace = true }
serde_json = { workspace = true }
hedgebuddy-core = { workspace = true }
```

`crates/app/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

`crates/app/src/lib.rs`:
```rust
//! HedgeBuddy desktop app. Tauri commands call `hedgebuddy_core` directly; no
//! logic lives in this crate.

#[tauri::command]
fn data_dir() -> Result<String, String> {
    hedgebuddy_core::data_dir()
        .map(|p| p.display().to_string())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![data_dir])
        .run(tauri::generate_context!())
        .expect("error while running HedgeBuddy");
}
```

`crates/app/src/main.rs`:
```rust
// Hide the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    hedgebuddy_app_lib::run()
}
```

`crates/app/tauri.conf.json`:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "HedgeBuddy",
  "version": "0.11.0",
  "identifier": "com.shakedex.hedgebuddy",
  "build": {
    "frontendDist": "ui/dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "bun run --cwd ui dev",
    "beforeBuildCommand": "bun run --cwd ui build"
  },
  "app": {
    "windows": [
      {
        "title": "HedgeBuddy",
        "width": 960,
        "height": 640,
        "minWidth": 480,
        "minHeight": 400
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

`crates/app/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability for the main window",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

- [ ] **Step 4: Generate the icon set from the branding PNG**

```bash
cd E:/Coding/hedgebuddy/crates/app
cargo tauri icon ../../branding/hedgebuddy_icon2.png -o icons
ls icons
cd ../..
```
Expected: `icons/` contains at least `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`, `icon.png`, plus Windows Store and mobile sizes. Commit the whole folder.

- [ ] **Step 5: Build the workspace and run all tests**

```bash
cd E:/Coding/hedgebuddy
cargo build --workspace
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: the app crate compiles (first Tauri build takes several minutes), all earlier tests still pass, fmt and clippy clean. `crates/app/gen/` appears and is ignored by git.

- [ ] **Step 6: Launch the app once to confirm the Rust-to-React bridge works**

```bash
cd E:/Coding/hedgebuddy/crates/app
cargo tauri dev
```
Expected: a window titled "HedgeBuddy" opens showing "Scaffold build. Data directory:" followed by `C:\Users\<you>\AppData\Roaming\HedgeBuddy`. Close the window; the process exits. If the window shows `error: ...`, the command name in `App.tsx` and `generate_handler!` do not match.

- [ ] **Step 7: Commit**

```bash
cd E:/Coding/hedgebuddy
git status --short
git add Cargo.toml Cargo.lock crates/app
git commit -m "feat(app): Tauri 2 scaffold with Vite + React frontend

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Check `git status --short` first: `crates/app/ui/dist`, `crates/app/ui/node_modules`, `crates/app/gen`, and `target` must not appear. If they do, fix `.gitignore` before committing.

---

### Task 7: Version sync script

**Files:**
- Create: `scripts/sync_version.py`

**Interfaces:**
- Produces: `python scripts/sync_version.py --check` exits 0 when every version location matches `VERSION`, and `--set X.Y.Z` rewrites them all. Task 8's CI calls `--check`.

- [ ] **Step 1: Write the script**

`scripts/sync_version.py`:
```python
#!/usr/bin/env python3
"""Keep the version identical everywhere it is declared.

    python scripts/sync_version.py            # print the version from VERSION
    python scripts/sync_version.py --check    # exit 1 if any target disagrees with VERSION
    python scripts/sync_version.py --set 0.12.0

The root VERSION file is the source of truth. `--set` rewrites VERSION and every
target, then prints the follow-up commands that refresh lock files.
"""

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "VERSION"

# (relative path, regex with the version in group 2, human label)
# Group 1 is the prefix to keep, group 3 the suffix to keep.
TARGETS = [
    ("Cargo.toml", r'(^version\s*=\s*")([^"]+)(")', "workspace package version"),
    ("python/pyproject.toml", r'(^version\s*=\s*")([^"]+)(")', "python package version"),
    ("python/hedgebuddy/__init__.py", r'(^__version__\s*=\s*")([^"]+)(")', "python __version__"),
    ("crates/app/tauri.conf.json", r'(^\s*"version"\s*:\s*")([^"]+)(")', "tauri.conf.json version"),
    ("crates/app/ui/package.json", r'(^\s*"version"\s*:\s*")([^"]+)(")', "ui package.json version"),
]

SEMVER = re.compile(r"^0\.\d+\.\d+$")  # ZeroVer: major is always 0


def read_version() -> str:
    return VERSION_FILE.read_text(encoding="utf-8").strip()


def find(path: Path, pattern: str) -> str:
    m = re.search(pattern, path.read_text(encoding="utf-8"), flags=re.MULTILINE)
    if not m:
        sys.exit(f"pattern not found in {path.relative_to(ROOT)}")
    return m.group(2)


def replace(path: Path, pattern: str, version: str) -> None:
    text = path.read_text(encoding="utf-8")
    new, n = re.subn(pattern, lambda m: f"{m.group(1)}{version}{m.group(3)}", text, count=1, flags=re.MULTILINE)
    if n != 1:
        sys.exit(f"pattern not found in {path.relative_to(ROOT)}")
    path.write_text(new, encoding="utf-8")


def check() -> int:
    expected = read_version()
    bad = 0
    for rel, pattern, label in TARGETS:
        actual = find(ROOT / rel, pattern)
        status = "ok " if actual == expected else "BAD"
        if actual != expected:
            bad += 1
        print(f"{status}  {label:28} {actual:10} ({rel})")
    print(f"VERSION = {expected}")
    return 1 if bad else 0


def set_version(version: str) -> None:
    if not SEMVER.match(version):
        sys.exit(f"'{version}' is not a ZeroVer version (0.MINOR.PATCH)")
    VERSION_FILE.write_text(version + "\n", encoding="utf-8")
    for rel, pattern, _ in TARGETS:
        replace(ROOT / rel, pattern, version)
    print(f"set {version} in VERSION and {len(TARGETS)} targets")
    print("now refresh lock files:")
    print("  cargo update --workspace")
    print("  (cd python && uv lock)")
    print("  (cd crates/app/ui && bun install)")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group()
    g.add_argument("--check", action="store_true")
    g.add_argument("--set", metavar="VERSION")
    a = p.parse_args()
    if a.check:
        return check()
    if a.set:
        set_version(a.set)
        return 0
    print(read_version())
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run the check and prove it detects drift**

```bash
cd E:/Coding/hedgebuddy
python scripts/sync_version.py --check
sed -i 's/"version": "0.11.0"/"version": "0.11.1"/' crates/app/ui/package.json
python scripts/sync_version.py --check; echo "exit=$?"
git checkout -- crates/app/ui/package.json
python scripts/sync_version.py --check; echo "exit=$?"
```
Expected: first run prints five `ok` lines and exits 0; after the sed, the ui line says `BAD` and `exit=1`; after restoring, `exit=0`.

- [ ] **Step 3: Commit**

```bash
git add scripts/sync_version.py
git commit -m "chore: version sync script for the new layout

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: CI on Windows and macOS

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: a `CI` workflow that runs on pushes to `main` and on pull requests. Task 9 relies on it being green after the push.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

env:
  CARGO_TERM_COLOR: always

jobs:
  version:
    name: Version sync
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-python@v6
        with:
          python-version: "3.13"
      - run: python scripts/sync_version.py --check

  rust:
    name: Rust (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v6
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: swatinem/rust-cache@v2
      - uses: oven-sh/setup-bun@v2
      - name: Build frontend (the app crate embeds ui/dist at compile time)
        working-directory: crates/app/ui
        run: |
          bun install --frozen-lockfile
          bun run build
      - run: cargo fmt --all --check
      - run: cargo clippy --workspace --all-targets -- -D warnings
      - run: cargo test --workspace

  python:
    name: Python ${{ matrix.python }} (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest]
        python: ["3.9", "3.13"]
    runs-on: ${{ matrix.os }}
    defaults:
      run:
        working-directory: python
    steps:
      - uses: actions/checkout@v6
      - uses: astral-sh/setup-uv@v6
        with:
          python-version: ${{ matrix.python }}
      - run: uv sync --frozen
      - run: uv run pytest -v
```

- [ ] **Step 2: Sanity-check locally that the exact CI commands pass**

```bash
cd E:/Coding/hedgebuddy
python scripts/sync_version.py --check
(cd crates/app/ui && bun install --frozen-lockfile && bun run build)
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
(cd python && uv sync --frozen && uv run pytest -v)
```
Expected: every command exits 0. If `bun install --frozen-lockfile` or `uv sync --frozen` fails, the lock file is stale: run the same command without `--frozen`, commit the updated lock file, and re-run.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: rust and python checks on windows and macos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Publish `main`, switch the default branch, retire `master`

This task is outward-facing and partly irreversible. Do it only after Tasks 1 through 8 are committed and the local checks in Task 8 Step 2 pass.

**Files:** none.

**Interfaces:**
- Produces: `main` on GitHub as the default branch, CI green, `master` deleted from the remote. The archive lives at tag `legacy/0.10.0`.

- [ ] **Step 1: Push `main`**

```bash
cd E:/Coding/hedgebuddy
git log --oneline
git push -u origin main
```
Expected: `git log --oneline` shows the eight commits from Tasks 1 through 8 and nothing older. The push succeeds.

- [ ] **Step 2: Wait for CI**

```bash
gh run list --branch main --limit 3
gh run watch $(gh run list --branch main --limit 1 --json databaseId -q '.[0].databaseId')
```
Expected: the `CI` run finishes with all jobs green. If a job fails, fix it on `main` with a normal commit, push, and watch again. Do not continue to Step 3 until CI is green.

- [ ] **Step 3: Make `main` the default branch on GitHub**

```bash
gh api -X PATCH repos/shakedex/hedgebuddy -f default_branch=main
gh repo view --json defaultBranchRef -q .defaultBranchRef.name
```
Expected: prints `main`.

- [ ] **Step 4: Delete `master` from the remote and locally**

```bash
git push origin --delete master
git branch -D master
git fetch --prune
git branch -a
```
Expected: `branch -a` lists `main` and `remotes/origin/main` only. `git tag -l 'legacy/*'` still lists `legacy/0.10.0`.

- [ ] **Step 5: Record the state in the changelog (no code change)**

Append under `## Unreleased` → `### Changed` in `CHANGELOG.md`:
```markdown
- Default branch is now `main`. The old `master` branch was deleted; its last commit is tag `legacy/0.10.0`.
```

```bash
git add CHANGELOG.md
git commit -m "docs: note the default branch switch

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

Known side effect, acceptable per spec: the published docs site at shakedex.github.io/hedgebuddy stays at its last deployment (the workflow that updated it lived on `master`). Phase 6 rewrites the docs and their deployment.

---

## Self-review

**Spec coverage for phase 1 (spec section 13, item 1):** archive tag and orphan `main` → Task 1 and Task 9. Cargo workspace with three crates → Tasks 2, 4, 6. `python/` skeleton → Task 5. `schema/` with first fixtures → Task 3, validated by both Task 3 (Rust) and Task 5 (Python). CI green on both platforms → Tasks 8 and 9. Spec section 11 (git reset procedure) → Tasks 1 and 9 in the stated order. Spec section 4 layout → matches the files created; `catalog/` is intentionally absent until phase 2, which is the first consumer.

**Placeholders:** none. Every code step has full content. The `todo!()` in Task 2 Step 2 is replaced in Step 5 of the same task.

**Type consistency:** `hedgebuddy_core::data_dir() -> Result<PathBuf, PathError>` is defined in Task 2 and consumed unchanged in Task 4 (`Command::Env`) and Task 6 (`#[tauri::command] fn data_dir`). The env var name `HEDGEBUDDY_DATA_DIR` is the same string in Task 2's constant, Task 4's test, and the spec. The version string `0.11.0` appears in the five locations `sync_version.py` checks and nowhere else. The manifest extraction rule (docstring, stop at `---`, JSON) is identical in `schema/README.md`, the Rust test, and the Python test.
