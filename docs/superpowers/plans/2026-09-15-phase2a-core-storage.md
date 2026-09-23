# Phase 2A: Core Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `hedgebuddy-core` a complete, tested storage layer: the data-directory index, profiles, typed variables, secrets, script files with parsed manifests and requirement checks, run-record reading and pruning, and a file watcher, all driven by the shared schemas and fixtures.

**Architecture:** One `Store` struct owns a root path and is the only entry point; every operation is an `impl Store` block in the module that owns that concern (`profile.rs`, `variable.rs`, `scripts.rs`, `runs.rs`). All logic takes explicit paths, so tests never touch the process environment; `data_dir()` is used only by `Store::at_default()`. Writes are atomic (temp file + rename), reads of a missing data directory return the empty state, and every JSON file we write is checked against the JSON Schemas in the conformance tests. Phase 2B (catalog, OS integration, commands, volumes) is a separate plan and builds on the interfaces named here.

**Tech Stack:** Rust stable (1.98), serde + serde_json, thiserror 2, jiff 0.2 (dates for run-record pruning), notify 8 (file watching), tempfile 3 and jsonschema 0.56 (dev only). Python 3.9+ with pytest and jsonschema (dev only) for the mirrored conformance test.

**Spec:** `docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md` (sections 4, 5, 6, and the "Runs" and "Storage" parts of 8 bind this plan). Phase 1 plan for context: `docs/superpowers/plans/2026-09-15-phase1-repo-reset-and-scaffold.md`.

## Global Constraints

- Data directory: `%APPDATA%\HedgeBuddy` on Windows, `~/Library/Application Support/HedgeBuddy` on macOS, overridable via `HEDGEBUDDY_DATA_DIR` (already implemented as `hedgebuddy_core::data_dir()`).
- Layout inside the data directory (spec section 5): `hedgebuddy.json`, `profiles/<name>/profile.json`, `profiles/<name>/secrets.json`, `profiles/<name>/scripts/*.py`, `runs/YYYY-MM-DD.jsonl`, `catalog/` (phase 2B), `preferences.json` (phase 5).
- `hedgebuddy.json` is `{"version": 1, "active_profile": <slug or null>}`. A missing file is equivalent to `{"version": 1, "active_profile": null}`. This plan's Task 1 adds the `null` case to the schema and spec (it was parked from the phase 1 final review).
- Profile names are slugs matching `^[a-z0-9][a-z0-9-]{0,63}$` and are also the directory name. Variable names match `^[A-Z][A-Z0-9_]*$`.
- Variable types are exactly `string`, `secret`, `int`, `float`, `bool`, `path`, `url`, `string[]`, `path[]`. A `url` value must start with `http://` or `https://`. `path` and `path[]` entries are non-empty strings and are not required to exist on disk. Secret-typed variables carry no `value` in `profile.json`; the value lives in `secrets.json` under the same name. `secrets.json` has mode `0600` on Unix.
- Script manifest: a JSON object at the top of the module docstring, terminated by a line that is `---` (trailing whitespace ignored); `hedgebuddy` is the integer 1; `event` requires `app`; `requires` entries are `{type, description?, default?}`; a `requires` entry with a `default` is satisfied when absent from the profile; a type mismatch between manifest and profile is an error.
- Run records: one JSON object per line in `runs/YYYY-MM-DD.jsonl`, `phase` is `start`, `log`, or `end`; `status` is `ok`, `failed`, or `error`. Files older than 30 days are pruned by core on read.
- Storage `version` fields are the integer 1. Files we write are UTF-8, pretty-printed JSON with two-space indent and a trailing newline. Writes are atomic.
- Rust edition 2021. Public API is documented with `///` comments. `cargo fmt --all --check` and `cargo clippy --workspace --all-targets -- -D warnings` must stay clean. No compatibility with 0.10.
- The Rust and Python conformance tests implement the convention in `schema/README.md`; any change to the convention edits the README and both tests in the same task.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Shell commands are for Git Bash on Windows; repo root is `E:/Coding/hedgebuddy`; branch `main`.

## File structure

| File | Responsibility |
|---|---|
| `crates/core/src/error.rs` | `CoreError` and `Result<T>` for the whole crate |
| `crates/core/src/fs_util.rs` | atomic JSON write, private-file mode, read helpers |
| `crates/core/src/store.rs` | `Store` (root path), `Index`, path helpers, index read/write |
| `crates/core/src/variable.rs` | `VarType`, `Variable`, `VarValue`, name and value validation |
| `crates/core/src/profile.rs` | `Profile` model; `impl Store` for list/load/save/create/delete/active |
| `crates/core/src/secrets.rs` | `impl Store` for the secrets file and the variable get/set/delete that spans both files |
| `crates/core/src/manifest.rs` | `Manifest`, `Requirement`, docstring extraction, requirement check |
| `crates/core/src/scripts.rs` | `impl Store` for listing, reading, writing, deleting, checking scripts |
| `crates/core/src/runs.rs` | `RunRecord`, `Run`, `RunFilter`; `impl Store` for reading and pruning |
| `crates/core/src/watch.rs` | `watch(root)` returning a receiver of `Change` events |
| `crates/core/tests/schema_conformance.rs` | existing; extended for the empty fixture and aggregate guards |
| `crates/core/tests/store_fixture.rs` | new; loads `schema/fixtures/valid/*` through `Store` and compares to `expected.json` |
| `python/tests/test_schema_conformance.py` | existing; mirrored changes |
| `schema/*.schema.json`, `schema/fixtures/**`, `schema/README.md` | contract changes in Tasks 1 and 10 |

---

### Task 1: Empty-state contract (parked from phase 1)

**Files:**
- Modify: `schema/hedgebuddy.schema.json`, `schema/README.md`, `crates/core/tests/schema_conformance.rs`, `python/tests/test_schema_conformance.py`, `docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md`
- Create: `schema/fixtures/valid/empty/hedgebuddy.json`, `schema/fixtures/invalid/hedgebuddy/missing-active-profile.json`

**Interfaces:**
- Produces: the contract that `active_profile` may be `null` and that `profiles/` and `runs/` may be absent. Task 2's `Index` type relies on it.

- [ ] **Step 1: Change the schema**

Replace `schema/hedgebuddy.schema.json` with:
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
    "active_profile": {
      "anyOf": [
        { "type": "null" },
        { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{0,63}$" }
      ]
    }
  }
}
```

- [ ] **Step 2: Add the fixtures**

`schema/fixtures/valid/empty/hedgebuddy.json`:
```json
{ "version": 1, "active_profile": null }
```
(No `profiles/` and no `runs/` directory in this case. Git cannot store empty directories, and the convention now tolerates their absence.)

`schema/fixtures/invalid/hedgebuddy/missing-active-profile.json`:
```json
{ "version": 1 }
```

- [ ] **Step 3: Update the README convention**

In `schema/README.md`, replace the paragraph that begins "`fixtures/valid/<case>/` is a complete data directory." and its bullet list with:

```markdown
`fixtures/valid/<case>/` is a data directory. `hedgebuddy.json` is always present; `profiles/` and `runs/` may be absent (the `empty` case has neither, because a fresh install has no profiles yet and `active_profile` is `null`). Every file that is present must validate:

- `hedgebuddy.json` against `hedgebuddy.schema.json`
- `profiles/*/profile.json` against `profile.schema.json`
- `profiles/*/secrets.json` against `secrets.schema.json`, when the file exists (a profile with no secret-typed variables has none)
- every line of `runs/*.jsonl` against `run-record.schema.json`
- the manifest extracted from every `profiles/*/scripts/*.py` against `script-manifest.schema.json`

Across all valid cases together there must be at least one profile, one script, and one run-record line, so that every schema is exercised by a valid instance and not only by invalid ones.
```

- [ ] **Step 4: Update the Rust conformance test**

In `crates/core/tests/schema_conformance.rs`:

Replace `dirs_in` with a version that tolerates a missing directory:
```rust
fn dirs_in(path: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = match fs::read_dir(path) {
        Ok(rd) => rd
            .map(|e| e.unwrap().path())
            .filter(|p| p.is_dir())
            .collect(),
        Err(_) => Vec::new(),
    };
    v.sort();
    v
}
```

Replace the body of `every_valid_fixture_data_dir_validates` with:
```rust
    let hedgebuddy = validator("hedgebuddy");
    let profile = validator("profile");
    let secrets = validator("secrets");
    let run_record = validator("run-record");
    let manifest = validator("script-manifest");

    let cases = dirs_in(&schema_root().join("fixtures/valid"));
    assert!(!cases.is_empty(), "no valid fixture cases found");

    let (mut profiles_seen, mut scripts_seen, mut run_lines_seen) = (0, 0, 0);

    for case in cases {
        let name = case.file_name().unwrap().to_string_lossy().to_string();

        assert_valid(
            &hedgebuddy,
            &load_json(&case.join("hedgebuddy.json")),
            &format!("{name}/hedgebuddy.json"),
        );

        for prof in dirs_in(&case.join("profiles")) {
            profiles_seen += 1;
            let pname = prof.file_name().unwrap().to_string_lossy().to_string();
            assert_valid(
                &profile,
                &load_json(&prof.join("profile.json")),
                &format!("{name}/{pname}/profile.json"),
            );
            if prof.join("secrets.json").exists() {
                assert_valid(
                    &secrets,
                    &load_json(&prof.join("secrets.json")),
                    &format!("{name}/{pname}/secrets.json"),
                );
            }
            for script in files_in(&prof.join("scripts"), "py") {
                scripts_seen += 1;
                let src = fs::read_to_string(&script).unwrap();
                assert_valid(&manifest, &extract_manifest(&src), &script.display().to_string());
            }
        }

        for log in files_in(&case.join("runs"), "jsonl") {
            let text = fs::read_to_string(&log).unwrap();
            for (i, line) in text.lines().filter(|l| !l.trim().is_empty()).enumerate() {
                run_lines_seen += 1;
                let v: Value = serde_json::from_str(line).unwrap();
                assert_valid(&run_record, &v, &format!("{}:{}", log.display(), i + 1));
            }
        }
    }

    assert!(profiles_seen >= 1, "valid fixtures must contain at least one profile");
    assert!(scripts_seen >= 1, "valid fixtures must contain at least one script");
    assert!(run_lines_seen >= 1, "valid fixtures must contain at least one run record");
```

Change the invalid-fixture floor from `checked >= 6` to `checked >= 7`.

- [ ] **Step 5: Update the Python conformance test**

In `python/tests/test_schema_conformance.py`, replace the profile loop and the runs block inside `test_valid_fixture_data_dir_validates` with:
```python
    profiles_dir = case / "profiles"
    for prof in sorted(p for p in profiles_dir.iterdir() if p.is_dir()) if profiles_dir.exists() else []:
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
```

Add after `test_valid_fixture_data_dir_validates`:
```python
def test_valid_fixtures_exercise_every_schema():
    profiles = scripts = run_lines = 0
    for case in valid_cases():
        profiles_dir = case / "profiles"
        if profiles_dir.exists():
            for prof in (p for p in profiles_dir.iterdir() if p.is_dir()):
                profiles += 1
                scripts += len(list((prof / "scripts").glob("*.py")))
        runs = case / "runs"
        if runs.exists():
            for log in runs.glob("*.jsonl"):
                run_lines += sum(1 for l in log.read_text(encoding="utf-8").splitlines() if l.strip())
    assert profiles >= 1 and scripts >= 1 and run_lines >= 1
```

Change `assert len(invalid_files()) >= 6` to `>= 7`.

- [ ] **Step 6: Update the spec**

In the spec, section 5, replace the line
```
├── hedgebuddy.json          {"version": 1, "active_profile": "<name>"}
```
with
```
├── hedgebuddy.json          {"version": 1, "active_profile": "<name>" | null}
```
and add this paragraph directly after the layout code block:

```markdown
`active_profile` is `null` when no profile exists (a fresh install). A missing `hedgebuddy.json` is read as `{"version": 1, "active_profile": null}`; `profiles/` and `runs/` are created on first write.
```

- [ ] **Step 7: Run both suites**

```bash
cd E:/Coding/hedgebuddy
cargo test -p hedgebuddy-core --test schema_conformance
(cd python && uv run pytest -v)
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: Rust 2 passed; Python 12 passed (2 valid cases, 7 invalid, version, coverage, count). fmt and clippy clean.

- [ ] **Step 8: Commit**

```bash
git add schema crates/core/tests/schema_conformance.rs python/tests/test_schema_conformance.py docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md
git commit -m "feat(schema): active_profile may be null; empty-state fixture and coverage guards

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Error type, atomic file helpers, and `Store` with the index

**Files:**
- Create: `crates/core/src/error.rs`, `crates/core/src/fs_util.rs`, `crates/core/src/store.rs`
- Modify: `crates/core/Cargo.toml`, `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: `hedgebuddy_core::data_dir()`.
- Produces:
  - `CoreError` (variants below) and `pub type Result<T> = std::result::Result<T, CoreError>`.
  - `fs_util::write_atomic(path: &Path, bytes: &[u8], private: bool) -> Result<()>`, `fs_util::write_json_atomic<T: Serialize>(path, value, private) -> Result<()>`, `fs_util::read_json<T: DeserializeOwned>(path) -> Result<T>`, `fs_util::read_json_or<T>(path, default: T) -> Result<T>` (missing file returns default).
  - `Store::open(root) -> Store`, `Store::at_default() -> Result<Store>`, `Store::root() -> &Path`, `Store::index() -> Result<Index>`, `Store::write_index(&Index) -> Result<()>`, `Store::profiles_dir()`, `Store::profile_dir(name)`, `Store::scripts_dir(name)`, `Store::runs_dir()`.
  - `Index { version: u32, active_profile: Option<String> }` with `Default` = `{1, None}`.

- [ ] **Step 1: Add dependencies**

In `crates/core/Cargo.toml` under `[dependencies]` add:
```toml
serde = { workspace = true }
serde_json = { workspace = true }
```
(Keep `serde_json` in `[dev-dependencies]` too; cargo tolerates both.)

- [ ] **Step 2: Write `error.rs`**

`crates/core/src/error.rs`:
```rust
//! The one error type for the crate.

use std::path::PathBuf;

/// Every fallible core operation returns this.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("i/o error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("invalid JSON in {path}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("{0}")]
    Validation(String),
    #[error("profile '{0}' not found")]
    ProfileNotFound(String),
    #[error("profile '{0}' already exists")]
    ProfileExists(String),
    #[error("variable '{0}' not found")]
    VariableNotFound(String),
    #[error("script '{0}' not found")]
    ScriptNotFound(String),
    #[error("invalid script manifest: {0}")]
    Manifest(String),
    #[error(transparent)]
    Path(#[from] crate::paths::PathError),
}

impl CoreError {
    pub(crate) fn io(path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        CoreError::Io {
            path: path.into(),
            source,
        }
    }
}

pub type Result<T> = std::result::Result<T, CoreError>;
```

- [ ] **Step 3: Write `fs_util.rs`**

`crates/core/src/fs_util.rs`:
```rust
//! Atomic, UTF-8, schema-friendly file I/O.

use std::fs;
use std::path::Path;

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::{CoreError, Result};

/// Write `bytes` to `path` atomically: write to a sibling temp file, then
/// rename over the target. Creates parent directories. When `private` is
/// true the file is created with mode 0600 on Unix (no-op on Windows).
pub fn write_atomic(path: &Path, bytes: &[u8], private: bool) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| CoreError::io(parent, e))?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = Path::new(&tmp);

    let mut opts = fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    if private {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    #[cfg(not(unix))]
    let _ = private;

    {
        use std::io::Write;
        let mut f = opts.open(tmp).map_err(|e| CoreError::io(tmp, e))?;
        f.write_all(bytes).map_err(|e| CoreError::io(tmp, e))?;
        f.sync_all().map_err(|e| CoreError::io(tmp, e))?;
    }
    fs::rename(tmp, path).map_err(|e| CoreError::io(path, e))?;
    Ok(())
}

/// Serialize `value` as pretty JSON (two-space indent, trailing newline) and
/// write it atomically.
pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T, private: bool) -> Result<()> {
    let mut text = serde_json::to_string_pretty(value).map_err(|e| CoreError::Json {
        path: path.to_path_buf(),
        source: e,
    })?;
    text.push('\n');
    write_atomic(path, text.as_bytes(), private)
}

/// Read and parse a JSON file. A missing file is an `Io` error.
pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T> {
    let text = fs::read_to_string(path).map_err(|e| CoreError::io(path, e))?;
    serde_json::from_str(&text).map_err(|e| CoreError::Json {
        path: path.to_path_buf(),
        source: e,
    })
}

/// Like `read_json`, but a missing file yields `default`.
pub fn read_json_or<T: DeserializeOwned>(path: &Path, default: T) -> Result<T> {
    if !path.exists() {
        return Ok(default);
    }
    read_json(path)
}
```

- [ ] **Step 4: Write the failing store test inside `store.rs`**

`crates/core/src/store.rs`:
```rust
//! `Store`: the root of a HedgeBuddy data directory, and the index file.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::fs_util;

/// Contents of `hedgebuddy.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Index {
    pub version: u32,
    pub active_profile: Option<String>,
}

impl Default for Index {
    fn default() -> Self {
        Index {
            version: 1,
            active_profile: None,
        }
    }
}

/// A HedgeBuddy data directory. Construction does no I/O.
#[derive(Debug, Clone)]
pub struct Store {
    root: PathBuf,
}

impl Store {
    /// Open the data directory at `root`. Nothing is read or created.
    pub fn open(root: impl Into<PathBuf>) -> Store {
        Store { root: root.into() }
    }

    /// Open the platform default data directory (see `data_dir`).
    pub fn at_default() -> Result<Store> {
        Ok(Store::open(crate::paths::data_dir()?))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn index_path(&self) -> PathBuf {
        self.root.join("hedgebuddy.json")
    }

    pub fn profiles_dir(&self) -> PathBuf {
        self.root.join("profiles")
    }

    pub fn profile_dir(&self, name: &str) -> PathBuf {
        self.profiles_dir().join(name)
    }

    pub fn scripts_dir(&self, name: &str) -> PathBuf {
        self.profile_dir(name).join("scripts")
    }

    pub fn runs_dir(&self) -> PathBuf {
        self.root.join("runs")
    }

    /// Read `hedgebuddy.json`. A missing file is the empty state.
    pub fn index(&self) -> Result<Index> {
        todo!()
    }

    /// Write `hedgebuddy.json` atomically.
    pub fn write_index(&self, index: &Index) -> Result<()> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_index_is_the_empty_state() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        assert_eq!(store.index().unwrap(), Index::default());
        assert_eq!(store.index().unwrap().active_profile, None);
    }

    #[test]
    fn index_round_trips_and_is_pretty_json() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        let idx = Index {
            version: 1,
            active_profile: Some("commercial-one-day".into()),
        };
        store.write_index(&idx).unwrap();
        assert_eq!(store.index().unwrap(), idx);
        let text = std::fs::read_to_string(store.index_path()).unwrap();
        assert_eq!(
            text,
            "{\n  \"version\": 1,\n  \"active_profile\": \"commercial-one-day\"\n}\n"
        );
        assert!(!store.index_path().with_extension("json.tmp").exists());
    }

    #[test]
    fn malformed_index_is_a_json_error() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("hedgebuddy.json"), "{ nope").unwrap();
        let err = Store::open(dir.path()).index().unwrap_err();
        assert!(matches!(err, CoreError::Json { .. }), "{err}");
    }

    #[test]
    fn wrong_version_is_a_validation_error() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("hedgebuddy.json"),
            "{\"version\": 2, \"active_profile\": null}",
        )
        .unwrap();
        let err = Store::open(dir.path()).index().unwrap_err();
        assert!(matches!(err, CoreError::Validation(_)), "{err}");
    }
}
```

Register the modules in `crates/core/src/lib.rs` (replace the whole file):
```rust
//! HedgeBuddy core.
//!
//! Everything HedgeBuddy does lives here. The CLI, the MCP server, and the
//! desktop app are thin front ends over this crate. This crate has no UI and
//! never parses command-line arguments.

pub mod error;
pub mod fs_util;
pub mod paths;
pub mod store;

pub use error::{CoreError, Result};
pub use paths::{data_dir, PathError, DATA_DIR_ENV};
pub use store::{Index, Store};
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cargo test -p hedgebuddy-core store::`
Expected: 4 tests, all FAIL with `not yet implemented`.

- [ ] **Step 6: Implement `index` and `write_index`**

Replace the two `todo!()` bodies in `store.rs`:
```rust
    pub fn index(&self) -> Result<Index> {
        let idx: Index = fs_util::read_json_or(&self.index_path(), Index::default())?;
        if idx.version != 1 {
            return Err(CoreError::Validation(format!(
                "unsupported hedgebuddy.json version {} (expected 1)",
                idx.version
            )));
        }
        Ok(idx)
    }

    pub fn write_index(&self, index: &Index) -> Result<()> {
        fs_util::write_json_atomic(&self.index_path(), index, false)
    }
```

- [ ] **Step 7: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: all pass (previous tests plus 4 new). Clean.

- [ ] **Step 8: Commit**

```bash
git add crates/core Cargo.lock
git commit -m "feat(core): Store with index read/write, error type, atomic file helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Variable model and validation

**Files:**
- Create: `crates/core/src/variable.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Produces:
  - `VarType` enum (`String, Secret, Int, Float, Bool, Path, Url, StringList, PathList`) serializing to the exact schema strings; `VarType::as_str()`, `FromStr`.
  - `Variable { ty: VarType, value: Option<serde_json::Value>, description: String }` serialized as `{"type", "value"?, "description"}`.
  - `VarValue` enum: `Str(String), Int(i64), Float(f64), Bool(bool), Path(String), Url(String), StrList(Vec<String>), PathList(Vec<String>)`.
  - `validate_var_name(&str) -> Result<()>`, `validate_slug(&str) -> Result<()>`, `Variable::validate(&self, name: &str) -> Result<()>`, `Variable::typed(&self) -> Result<Option<VarValue>>` (`None` for a secret or a missing value).

- [ ] **Step 1: Write the failing tests inside `variable.rs`**

`crates/core/src/variable.rs`:
```rust
//! Variable types, values, and validation rules from spec section 5.

use std::str::FromStr;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{CoreError, Result};

/// The nine variable types. Serialized names are the schema's exact strings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VarType {
    #[serde(rename = "string")]
    String,
    #[serde(rename = "secret")]
    Secret,
    #[serde(rename = "int")]
    Int,
    #[serde(rename = "float")]
    Float,
    #[serde(rename = "bool")]
    Bool,
    #[serde(rename = "path")]
    Path,
    #[serde(rename = "url")]
    Url,
    #[serde(rename = "string[]")]
    StringList,
    #[serde(rename = "path[]")]
    PathList,
}

impl VarType {
    pub const ALL: [VarType; 9] = [
        VarType::String,
        VarType::Secret,
        VarType::Int,
        VarType::Float,
        VarType::Bool,
        VarType::Path,
        VarType::Url,
        VarType::StringList,
        VarType::PathList,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            VarType::String => "string",
            VarType::Secret => "secret",
            VarType::Int => "int",
            VarType::Float => "float",
            VarType::Bool => "bool",
            VarType::Path => "path",
            VarType::Url => "url",
            VarType::StringList => "string[]",
            VarType::PathList => "path[]",
        }
    }
}

impl FromStr for VarType {
    type Err = CoreError;
    fn from_str(s: &str) -> Result<Self> {
        VarType::ALL
            .into_iter()
            .find(|t| t.as_str() == s)
            .ok_or_else(|| CoreError::Validation(format!("unknown variable type '{s}'")))
    }
}

/// One entry in `profile.json`'s `variables` map.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Variable {
    #[serde(rename = "type")]
    pub ty: VarType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
    #[serde(default)]
    pub description: String,
}

/// A variable's value with its declared type applied.
#[derive(Debug, Clone, PartialEq)]
pub enum VarValue {
    Str(String),
    Int(i64),
    Float(f64),
    Bool(bool),
    Path(String),
    Url(String),
    StrList(Vec<String>),
    PathList(Vec<String>),
}

/// `^[A-Z][A-Z0-9_]*$`
pub fn validate_var_name(name: &str) -> Result<()> {
    todo!()
}

/// `^[a-z0-9][a-z0-9-]{0,63}$`
pub fn validate_slug(name: &str) -> Result<()> {
    todo!()
}

impl Variable {
    /// Check the value against the declared type (spec section 5 rules).
    pub fn validate(&self, name: &str) -> Result<()> {
        todo!()
    }

    /// The typed value, or `None` for a secret (whose value lives elsewhere)
    /// or a variable with no value. Validates first.
    pub fn typed(&self) -> Result<Option<VarValue>> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn var(ty: VarType, value: Value) -> Variable {
        Variable {
            ty,
            value: Some(value),
            description: String::new(),
        }
    }

    #[test]
    fn type_names_round_trip_through_serde() {
        for t in VarType::ALL {
            let s = serde_json::to_string(&t).unwrap();
            assert_eq!(s, format!("\"{}\"", t.as_str()));
            assert_eq!(serde_json::from_str::<VarType>(&s).unwrap(), t);
            assert_eq!(t.as_str().parse::<VarType>().unwrap(), t);
        }
        assert!("date".parse::<VarType>().is_err());
    }

    #[test]
    fn variable_names_follow_the_pattern() {
        for ok in ["A", "PROJECT_NAME", "DEST_ROOTS2", "X_"] {
            validate_var_name(ok).unwrap();
        }
        for bad in ["", "project", "1ABC", "A-B", "A B", "_A", "É"] {
            assert!(validate_var_name(bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn slugs_follow_the_pattern() {
        for ok in ["a", "commercial-one-day", "x1-2", &"a".repeat(64)] {
            validate_slug(ok).unwrap();
        }
        for bad in ["", "-a", "A", "a_b", "a b", &"a".repeat(65)] {
            assert!(validate_slug(bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn values_are_checked_against_their_type() {
        var(VarType::String, json!("x")).validate("S").unwrap();
        var(VarType::Int, json!(3)).validate("I").unwrap();
        var(VarType::Float, json!(0.5)).validate("F").unwrap();
        var(VarType::Float, json!(2)).validate("F").unwrap(); // integers are numbers
        var(VarType::Bool, json!(true)).validate("B").unwrap();
        var(VarType::Path, json!("D:/x")).validate("P").unwrap();
        var(VarType::Url, json!("https://e.com")).validate("U").unwrap();
        var(VarType::StringList, json!(["a", "b"])).validate("L").unwrap();
        var(VarType::PathList, json!(["D:/a"])).validate("PL").unwrap();

        assert!(var(VarType::String, json!(1)).validate("S").is_err());
        assert!(var(VarType::Int, json!(1.5)).validate("I").is_err());
        assert!(var(VarType::Int, json!("1")).validate("I").is_err());
        assert!(var(VarType::Bool, json!("true")).validate("B").is_err());
        assert!(var(VarType::Path, json!("")).validate("P").is_err());
        assert!(var(VarType::Url, json!("ftp://e.com")).validate("U").is_err());
        assert!(var(VarType::StringList, json!("a")).validate("L").is_err());
        assert!(var(VarType::StringList, json!([1])).validate("L").is_err());
        assert!(var(VarType::PathList, json!([""])).validate("PL").is_err());
    }

    #[test]
    fn value_presence_rules() {
        // Non-secret without a value is invalid.
        let missing = Variable {
            ty: VarType::String,
            value: None,
            description: String::new(),
        };
        assert!(missing.validate("S").is_err());
        // Secret must not carry a value.
        assert!(var(VarType::Secret, json!("leak")).validate("S").is_err());
        let secret = Variable {
            ty: VarType::Secret,
            value: None,
            description: "hook".into(),
        };
        secret.validate("S").unwrap();
        assert_eq!(secret.typed().unwrap(), None);
    }

    #[test]
    fn typed_values() {
        assert_eq!(
            var(VarType::Int, json!(3)).typed().unwrap(),
            Some(VarValue::Int(3))
        );
        assert_eq!(
            var(VarType::PathList, json!(["D:/a", "F:/b"])).typed().unwrap(),
            Some(VarValue::PathList(vec!["D:/a".into(), "F:/b".into()]))
        );
        assert_eq!(
            var(VarType::Float, json!(2)).typed().unwrap(),
            Some(VarValue::Float(2.0))
        );
        assert!(var(VarType::Int, json!("3")).typed().is_err());
    }

    #[test]
    fn serde_shape_matches_the_schema() {
        let v: Variable = serde_json::from_value(json!({
            "type": "path[]", "value": ["D:/Offload"], "description": "roots"
        }))
        .unwrap();
        assert_eq!(v.ty, VarType::PathList);
        let back = serde_json::to_value(&v).unwrap();
        assert_eq!(
            back,
            json!({"type": "path[]", "value": ["D:/Offload"], "description": "roots"})
        );
        let s: Variable = serde_json::from_value(json!({"type": "secret", "description": "d"})).unwrap();
        assert_eq!(serde_json::to_value(&s).unwrap(), json!({"type": "secret", "description": "d"}));
    }
}
```

Add `pub mod variable;` to `lib.rs` (alphabetical, after `store`) and `pub use variable::{VarType, VarValue, Variable};`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test -p hedgebuddy-core variable::`
Expected: `type_names_round_trip_through_serde` and `serde_shape_matches_the_schema` pass (they need no implementation); the other five FAIL with `not yet implemented`.

- [ ] **Step 3: Implement validation and typing**

Replace the `todo!()` functions in `variable.rs`:
```rust
pub fn validate_var_name(name: &str) -> Result<()> {
    let mut chars = name.chars();
    let ok = matches!(chars.next(), Some(c) if c.is_ascii_uppercase())
        && chars.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_');
    if ok {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "variable name '{name}' must match ^[A-Z][A-Z0-9_]*$"
        )))
    }
}

pub fn validate_slug(name: &str) -> Result<()> {
    let mut chars = name.chars();
    let ok = name.len() <= 64
        && matches!(chars.next(), Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if ok {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "profile name '{name}' must match ^[a-z0-9][a-z0-9-]{{0,63}}$"
        )))
    }
}

fn err(name: &str, msg: impl AsRef<str>) -> CoreError {
    CoreError::Validation(format!("variable '{name}': {}", msg.as_ref()))
}

fn string_list(name: &str, v: &Value, non_empty: bool) -> Result<Vec<String>> {
    let arr = v
        .as_array()
        .ok_or_else(|| err(name, "value must be an array of strings"))?;
    arr.iter()
        .map(|item| {
            let s = item
                .as_str()
                .ok_or_else(|| err(name, "every list item must be a string"))?;
            if non_empty && s.is_empty() {
                return Err(err(name, "list items must be non-empty"));
            }
            Ok(s.to_owned())
        })
        .collect()
}

impl Variable {
    pub fn validate(&self, name: &str) -> Result<()> {
        self.typed_inner(name).map(|_| ())
    }

    pub fn typed(&self) -> Result<Option<VarValue>> {
        self.typed_inner("<value>")
    }

    fn typed_inner(&self, name: &str) -> Result<Option<VarValue>> {
        if self.ty == VarType::Secret {
            return if self.value.is_some() {
                Err(err(name, "secret variables must not carry a value in profile.json"))
            } else {
                Ok(None)
            };
        }
        let v = self
            .value
            .as_ref()
            .ok_or_else(|| err(name, format!("{} variables require a value", self.ty.as_str())))?;
        let typed = match self.ty {
            VarType::Secret => unreachable!(),
            VarType::String => VarValue::Str(
                v.as_str()
                    .ok_or_else(|| err(name, "value must be a string"))?
                    .to_owned(),
            ),
            VarType::Int => VarValue::Int(
                v.as_i64()
                    .ok_or_else(|| err(name, "value must be an integer"))?,
            ),
            VarType::Float => VarValue::Float(
                v.as_f64()
                    .ok_or_else(|| err(name, "value must be a number"))?,
            ),
            VarType::Bool => VarValue::Bool(
                v.as_bool()
                    .ok_or_else(|| err(name, "value must be true or false"))?,
            ),
            VarType::Path => {
                let s = v.as_str().ok_or_else(|| err(name, "value must be a string path"))?;
                if s.is_empty() {
                    return Err(err(name, "path must be non-empty"));
                }
                VarValue::Path(s.to_owned())
            }
            VarType::Url => {
                let s = v.as_str().ok_or_else(|| err(name, "value must be a string URL"))?;
                if !(s.starts_with("http://") || s.starts_with("https://")) {
                    return Err(err(name, "url must start with http:// or https://"));
                }
                VarValue::Url(s.to_owned())
            }
            VarType::StringList => VarValue::StrList(string_list(name, v, false)?),
            VarType::PathList => VarValue::PathList(string_list(name, v, true)?),
        };
        Ok(Some(typed))
    }
}
```

- [ ] **Step 4: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: all pass (7 new). Clean.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): variable types, typed values, and validation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Profiles: model, list, load, save, create, delete, active

**Files:**
- Create: `crates/core/src/profile.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: `Store`, `Index`, `fs_util`, `validate_slug`, `Variable::validate`.
- Produces:
  - `Profile { version: u32, name: String, description: String, variables: BTreeMap<String, Variable> }` with `Profile::new(name, description)`, `Profile::validate()`.
  - `impl Store`: `list_profiles() -> Result<Vec<String>>`, `load_profile(name) -> Result<Profile>`, `save_profile(&Profile) -> Result<()>`, `create_profile(name, description) -> Result<Profile>`, `delete_profile(name) -> Result<()>`, `set_active_profile(name) -> Result<()>`, `active_profile_name() -> Result<Option<String>>`, `active_profile() -> Result<Option<Profile>>`, `profile_exists(name) -> bool`, `profile_path(name) -> PathBuf`.
  - Behaviour: `create_profile` on a store with `active_profile == None` makes the new profile active; `delete_profile` of the active profile sets `active_profile` to `None`; `load_profile` errors with `Validation` when the file's `name` differs from the directory name or `version != 1`.

- [ ] **Step 1: Write the failing tests inside `profile.rs`**

`crates/core/src/profile.rs`:
```rust
//! Profiles: `profiles/<name>/profile.json` and the active-profile pointer.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::fs_util;
use crate::store::Store;
use crate::variable::{validate_slug, validate_var_name, Variable};

/// Contents of `profile.json`. Variables are kept sorted by name.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Profile {
    pub version: u32,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub variables: BTreeMap<String, Variable>,
}

impl Profile {
    pub fn new(name: impl Into<String>, description: impl Into<String>) -> Profile {
        Profile {
            version: 1,
            name: name.into(),
            description: description.into(),
            variables: BTreeMap::new(),
        }
    }

    /// Slug, version, every variable name, and every variable value.
    pub fn validate(&self) -> Result<()> {
        todo!()
    }
}

impl Store {
    pub fn profile_path(&self, name: &str) -> PathBuf {
        self.profile_dir(name).join("profile.json")
    }

    pub fn profile_exists(&self, name: &str) -> bool {
        self.profile_path(name).is_file()
    }

    /// Names of every directory under `profiles/` that holds a `profile.json`, sorted.
    pub fn list_profiles(&self) -> Result<Vec<String>> {
        todo!()
    }

    pub fn load_profile(&self, name: &str) -> Result<Profile> {
        todo!()
    }

    /// Validate and write `profile.json` atomically. Does not touch secrets or scripts.
    pub fn save_profile(&self, profile: &Profile) -> Result<()> {
        todo!()
    }

    /// Create an empty profile (with its `scripts/` directory). Becomes active
    /// when nothing else is.
    pub fn create_profile(&self, name: &str, description: &str) -> Result<Profile> {
        todo!()
    }

    /// Remove the whole profile directory. Clears `active_profile` if it pointed here.
    pub fn delete_profile(&self, name: &str) -> Result<()> {
        todo!()
    }

    pub fn set_active_profile(&self, name: &str) -> Result<()> {
        todo!()
    }

    pub fn active_profile_name(&self) -> Result<Option<String>> {
        Ok(self.index()?.active_profile)
    }

    pub fn active_profile(&self) -> Result<Option<Profile>> {
        match self.active_profile_name()? {
            Some(name) => Ok(Some(self.load_profile(&name)?)),
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::variable::VarType;
    use serde_json::json;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        (dir, store)
    }

    #[test]
    fn empty_store_lists_nothing_and_has_no_active_profile() {
        let (_d, store) = temp_store();
        assert_eq!(store.list_profiles().unwrap(), Vec::<String>::new());
        assert_eq!(store.active_profile().unwrap(), None);
    }

    #[test]
    fn create_makes_first_profile_active_and_creates_scripts_dir() {
        let (_d, store) = temp_store();
        let p = store.create_profile("commercial-one-day", "Client X").unwrap();
        assert_eq!(p, Profile::new("commercial-one-day", "Client X"));
        assert!(store.scripts_dir("commercial-one-day").is_dir());
        assert_eq!(store.active_profile_name().unwrap().as_deref(), Some("commercial-one-day"));

        store.create_profile("second", "").unwrap();
        assert_eq!(store.active_profile_name().unwrap().as_deref(), Some("commercial-one-day"));
        assert_eq!(store.list_profiles().unwrap(), vec!["commercial-one-day", "second"]);
    }

    #[test]
    fn create_rejects_bad_slug_and_duplicates() {
        let (_d, store) = temp_store();
        assert!(matches!(
            store.create_profile("Bad Name", "").unwrap_err(),
            CoreError::Validation(_)
        ));
        store.create_profile("dup", "").unwrap();
        assert!(matches!(
            store.create_profile("dup", "").unwrap_err(),
            CoreError::ProfileExists(_)
        ));
    }

    #[test]
    fn save_and_load_round_trip_with_sorted_variables() {
        let (_d, store) = temp_store();
        let mut p = store.create_profile("p", "").unwrap();
        p.variables.insert(
            "ZED".into(),
            Variable { ty: VarType::Int, value: Some(json!(1)), description: String::new() },
        );
        p.variables.insert(
            "ALPHA".into(),
            Variable { ty: VarType::String, value: Some(json!("a")), description: "first".into() },
        );
        store.save_profile(&p).unwrap();
        let loaded = store.load_profile("p").unwrap();
        assert_eq!(loaded, p);
        let text = fs::read_to_string(store.profile_path("p")).unwrap();
        assert!(text.find("ALPHA").unwrap() < text.find("ZED").unwrap());
        assert!(text.ends_with("}\n"));
    }

    #[test]
    fn save_rejects_invalid_variables() {
        let (_d, store) = temp_store();
        let mut p = store.create_profile("p", "").unwrap();
        p.variables.insert(
            "lower".into(),
            Variable { ty: VarType::String, value: Some(json!("x")), description: String::new() },
        );
        assert!(matches!(store.save_profile(&p).unwrap_err(), CoreError::Validation(_)));
        p.variables.clear();
        p.variables.insert(
            "URL".into(),
            Variable { ty: VarType::Url, value: Some(json!("ftp://x")), description: String::new() },
        );
        assert!(matches!(store.save_profile(&p).unwrap_err(), CoreError::Validation(_)));
    }

    #[test]
    fn load_rejects_name_mismatch_and_missing_profile() {
        let (_d, store) = temp_store();
        store.create_profile("real", "").unwrap();
        let text = fs::read_to_string(store.profile_path("real")).unwrap();
        fs::create_dir_all(store.profile_dir("other")).unwrap();
        fs::write(store.profile_path("other"), text).unwrap();
        assert!(matches!(store.load_profile("other").unwrap_err(), CoreError::Validation(_)));
        assert!(matches!(
            store.load_profile("nope").unwrap_err(),
            CoreError::ProfileNotFound(_)
        ));
    }

    #[test]
    fn delete_removes_dir_and_clears_active_pointer() {
        let (_d, store) = temp_store();
        store.create_profile("a", "").unwrap();
        store.create_profile("b", "").unwrap();
        store.set_active_profile("b").unwrap();
        store.delete_profile("b").unwrap();
        assert!(!store.profile_dir("b").exists());
        assert_eq!(store.active_profile_name().unwrap(), None);
        assert_eq!(store.list_profiles().unwrap(), vec!["a"]);
        assert!(matches!(
            store.delete_profile("b").unwrap_err(),
            CoreError::ProfileNotFound(_)
        ));
    }

    #[test]
    fn set_active_requires_existing_profile() {
        let (_d, store) = temp_store();
        assert!(matches!(
            store.set_active_profile("ghost").unwrap_err(),
            CoreError::ProfileNotFound(_)
        ));
    }

    #[test]
    fn fixture_profile_loads_and_validates() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../schema/fixtures/valid/basic");
        let store = Store::open(root);
        assert_eq!(store.list_profiles().unwrap(), vec!["commercial-one-day"]);
        let p = store.load_profile("commercial-one-day").unwrap();
        assert_eq!(p.variables.len(), 9);
        assert_eq!(p.variables["SLACK_WEBHOOK"].ty, VarType::Secret);
        assert_eq!(p.variables["SLACK_WEBHOOK"].value, None);
        assert_eq!(
            store.active_profile().unwrap().map(|p| p.name),
            Some("commercial-one-day".to_string())
        );
    }
}
```

Add `pub mod profile;` to `lib.rs` and `pub use profile::Profile;`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test -p hedgebuddy-core profile::`
Expected: compile succeeds; the tests FAIL with `not yet implemented` (except `empty_store_lists_nothing...` which also hits `todo!()` in `list_profiles`).

- [ ] **Step 3: Implement**

Replace the `todo!()` bodies in `profile.rs`:
```rust
impl Profile {
    pub fn validate(&self) -> Result<()> {
        if self.version != 1 {
            return Err(CoreError::Validation(format!(
                "unsupported profile.json version {} (expected 1)",
                self.version
            )));
        }
        validate_slug(&self.name)?;
        for (name, var) in &self.variables {
            validate_var_name(name)?;
            var.validate(name)?;
        }
        Ok(())
    }
}
```
and in `impl Store`:
```rust
    pub fn list_profiles(&self) -> Result<Vec<String>> {
        let dir = self.profiles_dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut names: Vec<String> = fs::read_dir(&dir)
            .map_err(|e| CoreError::io(&dir, e))?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().join("profile.json").is_file())
            .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
            .collect();
        names.sort();
        Ok(names)
    }

    pub fn load_profile(&self, name: &str) -> Result<Profile> {
        let path = self.profile_path(name);
        if !path.is_file() {
            return Err(CoreError::ProfileNotFound(name.to_owned()));
        }
        let profile: Profile = fs_util::read_json(&path)?;
        if profile.name != name {
            return Err(CoreError::Validation(format!(
                "profile.json in '{name}' declares name '{}'",
                profile.name
            )));
        }
        profile.validate()?;
        Ok(profile)
    }

    pub fn save_profile(&self, profile: &Profile) -> Result<()> {
        profile.validate()?;
        fs_util::write_json_atomic(&self.profile_path(&profile.name), profile, false)
    }

    pub fn create_profile(&self, name: &str, description: &str) -> Result<Profile> {
        validate_slug(name)?;
        if self.profile_dir(name).exists() {
            return Err(CoreError::ProfileExists(name.to_owned()));
        }
        let profile = Profile::new(name, description);
        self.save_profile(&profile)?;
        let scripts = self.scripts_dir(name);
        fs::create_dir_all(&scripts).map_err(|e| CoreError::io(&scripts, e))?;
        let mut index = self.index()?;
        if index.active_profile.is_none() {
            index.active_profile = Some(name.to_owned());
            self.write_index(&index)?;
        }
        Ok(profile)
    }

    pub fn delete_profile(&self, name: &str) -> Result<()> {
        let dir = self.profile_dir(name);
        if !dir.is_dir() {
            return Err(CoreError::ProfileNotFound(name.to_owned()));
        }
        fs::remove_dir_all(&dir).map_err(|e| CoreError::io(&dir, e))?;
        let mut index = self.index()?;
        if index.active_profile.as_deref() == Some(name) {
            index.active_profile = None;
            self.write_index(&index)?;
        }
        Ok(())
    }

    pub fn set_active_profile(&self, name: &str) -> Result<()> {
        if !self.profile_exists(name) {
            return Err(CoreError::ProfileNotFound(name.to_owned()));
        }
        let mut index = self.index()?;
        index.active_profile = Some(name.to_owned());
        self.write_index(&index)
    }
```

- [ ] **Step 4: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: all pass (9 new). Clean.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): profiles: list, load, save, create, delete, active pointer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Secrets file and the variable operations that span both files

**Files:**
- Create: `crates/core/src/secrets.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: `Store`, `Profile`, `Variable`, `VarType`, `fs_util`.
- Produces:
  - `impl Store`: `secrets_path(name) -> PathBuf`, `load_secrets(name) -> Result<BTreeMap<String, String>>` (missing file = empty), `save_secrets(name, &BTreeMap<String,String>) -> Result<()>` (private file).
  - `VariableInput { ty: VarType, value: Option<serde_json::Value>, description: String }` — for `Secret`, `value` must be `Some(String)` and goes to `secrets.json`.
  - `ResolvedVariable { name: String, ty: VarType, value: Option<serde_json::Value>, description: String }` — for secrets, `value` is the secret string (masking is the caller's job).
  - `impl Store`: `set_variable(profile, name, VariableInput) -> Result<()>`, `get_variable(profile, name) -> Result<ResolvedVariable>`, `list_variables(profile) -> Result<Vec<ResolvedVariable>>` (sorted by name), `delete_variable(profile, name) -> Result<()>`.

- [ ] **Step 1: Write the failing tests inside `secrets.rs`**

`crates/core/src/secrets.rs`:
```rust
//! `secrets.json` and the variable operations that must keep `profile.json`
//! and `secrets.json` consistent.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde_json::Value;

use crate::error::{CoreError, Result};
use crate::fs_util;
use crate::store::Store;
use crate::variable::{validate_var_name, VarType, Variable};

/// What a caller supplies to create or replace a variable.
#[derive(Debug, Clone, PartialEq)]
pub struct VariableInput {
    pub ty: VarType,
    /// For `Secret`, the secret string as a JSON string; for all other types
    /// the typed JSON value.
    pub value: Option<Value>,
    pub description: String,
}

/// A variable with its value resolved from whichever file holds it.
#[derive(Debug, Clone, PartialEq)]
pub struct ResolvedVariable {
    pub name: String,
    pub ty: VarType,
    pub value: Option<Value>,
    pub description: String,
}

impl Store {
    pub fn secrets_path(&self, name: &str) -> PathBuf {
        self.profile_dir(name).join("secrets.json")
    }

    /// Missing file means no secrets.
    pub fn load_secrets(&self, profile: &str) -> Result<BTreeMap<String, String>> {
        todo!()
    }

    /// Written with mode 0600 on Unix.
    pub fn save_secrets(&self, profile: &str, secrets: &BTreeMap<String, String>) -> Result<()> {
        todo!()
    }

    pub fn set_variable(&self, profile: &str, name: &str, input: VariableInput) -> Result<()> {
        todo!()
    }

    pub fn get_variable(&self, profile: &str, name: &str) -> Result<ResolvedVariable> {
        todo!()
    }

    pub fn list_variables(&self, profile: &str) -> Result<Vec<ResolvedVariable>> {
        todo!()
    }

    pub fn delete_variable(&self, profile: &str, name: &str) -> Result<()> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        store.create_profile("p", "").unwrap();
        (dir, store)
    }

    fn input(ty: VarType, value: Value) -> VariableInput {
        VariableInput { ty, value: Some(value), description: "d".into() }
    }

    #[test]
    fn plain_variable_lives_in_profile_json_only() {
        let (_d, store) = temp_store();
        store.set_variable("p", "PROJECT_NAME", input(VarType::String, json!("X"))).unwrap();
        let got = store.get_variable("p", "PROJECT_NAME").unwrap();
        assert_eq!(got.value, Some(json!("X")));
        assert_eq!(got.ty, VarType::String);
        assert!(!store.secrets_path("p").exists());
    }

    #[test]
    fn secret_lives_in_secrets_json_only() {
        let (_d, store) = temp_store();
        store.set_variable("p", "HOOK", input(VarType::Secret, json!("https://h"))).unwrap();
        let profile = store.load_profile("p").unwrap();
        assert_eq!(profile.variables["HOOK"].value, None);
        assert_eq!(store.load_secrets("p").unwrap()["HOOK"], "https://h");
        assert_eq!(store.get_variable("p", "HOOK").unwrap().value, Some(json!("https://h")));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(store.secrets_path("p")).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }
    }

    #[test]
    fn secret_requires_a_string_value() {
        let (_d, store) = temp_store();
        let no_value = VariableInput { ty: VarType::Secret, value: None, description: String::new() };
        assert!(matches!(store.set_variable("p", "S", no_value).unwrap_err(), CoreError::Validation(_)));
        assert!(matches!(
            store.set_variable("p", "S", input(VarType::Secret, json!(5))).unwrap_err(),
            CoreError::Validation(_)
        ));
    }

    #[test]
    fn changing_type_moves_the_value_between_files() {
        let (_d, store) = temp_store();
        store.set_variable("p", "V", input(VarType::Secret, json!("s"))).unwrap();
        store.set_variable("p", "V", input(VarType::String, json!("plain"))).unwrap();
        assert!(!store.load_secrets("p").unwrap().contains_key("V"));
        assert_eq!(store.get_variable("p", "V").unwrap().value, Some(json!("plain")));
        store.set_variable("p", "V", input(VarType::Secret, json!("s2"))).unwrap();
        assert_eq!(store.load_profile("p").unwrap().variables["V"].value, None);
        assert_eq!(store.load_secrets("p").unwrap()["V"], "s2");
    }

    #[test]
    fn invalid_name_or_value_is_rejected_before_writing() {
        let (_d, store) = temp_store();
        assert!(store.set_variable("p", "bad", input(VarType::String, json!("x"))).is_err());
        assert!(store.set_variable("p", "N", input(VarType::Int, json!("x"))).is_err());
        assert!(store.load_profile("p").unwrap().variables.is_empty());
    }

    #[test]
    fn list_is_sorted_and_delete_cleans_both_files() {
        let (_d, store) = temp_store();
        store.set_variable("p", "B", input(VarType::Int, json!(2))).unwrap();
        store.set_variable("p", "A", input(VarType::Secret, json!("s"))).unwrap();
        let names: Vec<String> = store.list_variables("p").unwrap().into_iter().map(|v| v.name).collect();
        assert_eq!(names, vec!["A", "B"]);
        store.delete_variable("p", "A").unwrap();
        assert!(store.load_secrets("p").unwrap().is_empty());
        assert!(matches!(store.get_variable("p", "A").unwrap_err(), CoreError::VariableNotFound(_)));
        assert!(matches!(store.delete_variable("p", "A").unwrap_err(), CoreError::VariableNotFound(_)));
    }

    #[test]
    fn missing_profile_is_reported() {
        let (_d, store) = temp_store();
        assert!(matches!(
            store.get_variable("ghost", "A").unwrap_err(),
            CoreError::ProfileNotFound(_)
        ));
    }

    #[test]
    fn fixture_secret_resolves() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../schema/fixtures/valid/basic");
        let store = Store::open(root);
        let v = store.get_variable("commercial-one-day", "SLACK_WEBHOOK").unwrap();
        assert_eq!(v.ty, VarType::Secret);
        assert_eq!(v.value, Some(json!("https://hooks.slack.com/services/T000/B000/XXXX")));
    }
}
```

Add `pub mod secrets;` to `lib.rs` and `pub use secrets::{ResolvedVariable, VariableInput};`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test -p hedgebuddy-core secrets::`
Expected: all FAIL with `not yet implemented`.

- [ ] **Step 3: Implement**

Replace the `todo!()` bodies in `secrets.rs`:
```rust
    pub fn load_secrets(&self, profile: &str) -> Result<BTreeMap<String, String>> {
        fs_util::read_json_or(&self.secrets_path(profile), BTreeMap::new())
    }

    pub fn save_secrets(&self, profile: &str, secrets: &BTreeMap<String, String>) -> Result<()> {
        fs_util::write_json_atomic(&self.secrets_path(profile), secrets, true)
    }

    pub fn set_variable(&self, profile: &str, name: &str, input: VariableInput) -> Result<()> {
        validate_var_name(name)?;
        let mut prof = self.load_profile(profile)?;
        let mut secrets = self.load_secrets(profile)?;

        let variable = if input.ty == VarType::Secret {
            let secret = match input.value {
                Some(Value::String(s)) => s,
                _ => {
                    return Err(CoreError::Validation(format!(
                        "variable '{name}': secret variables require a string value"
                    )))
                }
            };
            secrets.insert(name.to_owned(), secret);
            Variable { ty: VarType::Secret, value: None, description: input.description }
        } else {
            secrets.remove(name);
            Variable { ty: input.ty, value: input.value, description: input.description }
        };
        variable.validate(name)?;

        prof.variables.insert(name.to_owned(), variable);
        self.save_profile(&prof)?;
        if !secrets.is_empty() || self.secrets_path(profile).exists() {
            self.save_secrets(profile, &secrets)?;
        }
        Ok(())
    }

    pub fn get_variable(&self, profile: &str, name: &str) -> Result<ResolvedVariable> {
        let prof = self.load_profile(profile)?;
        let var = prof
            .variables
            .get(name)
            .ok_or_else(|| CoreError::VariableNotFound(name.to_owned()))?;
        Ok(self.resolve(profile, name, var, None)?)
    }

    pub fn list_variables(&self, profile: &str) -> Result<Vec<ResolvedVariable>> {
        let prof = self.load_profile(profile)?;
        let secrets = self.load_secrets(profile)?;
        prof.variables
            .iter()
            .map(|(name, var)| self.resolve(profile, name, var, Some(&secrets)))
            .collect()
    }

    pub fn delete_variable(&self, profile: &str, name: &str) -> Result<()> {
        let mut prof = self.load_profile(profile)?;
        if prof.variables.remove(name).is_none() {
            return Err(CoreError::VariableNotFound(name.to_owned()));
        }
        self.save_profile(&prof)?;
        let mut secrets = self.load_secrets(profile)?;
        if secrets.remove(name).is_some() {
            self.save_secrets(profile, &secrets)?;
        }
        Ok(())
    }

    fn resolve(
        &self,
        profile: &str,
        name: &str,
        var: &Variable,
        secrets: Option<&BTreeMap<String, String>>,
    ) -> Result<ResolvedVariable> {
        let value = if var.ty == VarType::Secret {
            let owned;
            let map = match secrets {
                Some(m) => m,
                None => {
                    owned = self.load_secrets(profile)?;
                    &owned
                }
            };
            map.get(name).map(|s| Value::String(s.clone()))
        } else {
            var.value.clone()
        };
        Ok(ResolvedVariable {
            name: name.to_owned(),
            ty: var.ty,
            value,
            description: var.description.clone(),
        })
    }
```

- [ ] **Step 4: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: all pass (8 new). Clean. If clippy flags the `Ok(self.resolve(..)?)` as `needless_question_mark`, change it to `self.resolve(profile, name, var, None)`.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): secrets file and set/get/list/delete variable across both files

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Script manifest parsing and requirement checks

**Files:**
- Create: `crates/core/src/manifest.rs`
- Modify: `crates/core/src/lib.rs`, `crates/core/tests/schema_conformance.rs` (use the crate's extractor instead of the test-local copy)

**Interfaces:**
- Consumes: `Profile`, `VarType`, `Variable`.
- Produces:
  - `Manifest { hedgebuddy: u32, app: Option<String>, event: Option<String>, requires: BTreeMap<String, Requirement> }`, `Requirement { ty: VarType, description: String, default: Option<serde_json::Value> }`.
  - `extract_manifest_text(source: &str) -> Option<String>`: the JSON text before the `---` line of the module docstring, or `None` when there is no docstring or the docstring does not start with `{`.
  - `parse_manifest(source: &str) -> Result<Option<Manifest>>`: `Ok(None)` when there is no manifest block; `Err(Manifest(..))` when the block is present but invalid (bad JSON, wrong `hedgebuddy` version, `event` without `app`, bad names).
  - `RequirementIssue` enum: `Missing { name, ty }`, `TypeMismatch { name, expected, actual }`.
  - `check_requirements(&Manifest, &Profile) -> Vec<RequirementIssue>` (sorted by name).

- [ ] **Step 1: Write the failing tests inside `manifest.rs`**

`crates/core/src/manifest.rs`:
```rust
//! The JSON manifest at the top of a script's module docstring (spec section 6).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{CoreError, Result};
use crate::profile::Profile;
use crate::variable::{validate_var_name, VarType};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Requirement {
    #[serde(rename = "type")]
    pub ty: VarType,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Manifest {
    pub hedgebuddy: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
    #[serde(default)]
    pub requires: BTreeMap<String, Requirement>,
}

/// Why a profile does not satisfy a manifest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RequirementIssue {
    Missing { name: String, ty: VarType },
    TypeMismatch { name: String, expected: VarType, actual: VarType },
}

/// The text before the `---` line of the first `"""` docstring, when that
/// text begins with `{`. Trailing whitespace on the `---` line is ignored.
pub fn extract_manifest_text(source: &str) -> Option<String> {
    todo!()
}

/// `Ok(None)` when the script has no manifest block.
pub fn parse_manifest(source: &str) -> Result<Option<Manifest>> {
    todo!()
}

/// Every requirement the profile fails, sorted by variable name.
pub fn check_requirements(manifest: &Manifest, profile: &Profile) -> Vec<RequirementIssue> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::variable::Variable;
    use serde_json::json;

    const FIXTURE: &str = include_str!(
        "../../../schema/fixtures/valid/basic/profiles/commercial-one-day/scripts/on_copy_complete.py"
    );

    #[test]
    fn fixture_manifest_parses() {
        let m = parse_manifest(FIXTURE).unwrap().unwrap();
        assert_eq!(m.hedgebuddy, 1);
        assert_eq!(m.app.as_deref(), Some("offshoot"));
        assert_eq!(m.event.as_deref(), Some("FileCopyCompleted"));
        assert_eq!(m.requires["SLACK_WEBHOOK"].ty, VarType::Secret);
        assert_eq!(m.requires["PROJECT_NAME"].default, Some(json!("Untitled")));
    }

    #[test]
    fn no_docstring_or_prose_docstring_means_no_manifest() {
        assert_eq!(parse_manifest("import os\n").unwrap(), None);
        assert_eq!(parse_manifest("\"\"\"Just prose.\"\"\"\nimport os\n").unwrap(), None);
        assert_eq!(extract_manifest_text("x = '\"\"\"'"), None);
    }

    #[test]
    fn terminator_tolerates_trailing_whitespace_and_is_optional() {
        let src = "\"\"\"\n{\"hedgebuddy\": 1}\n---   \nprose\n\"\"\"\n";
        assert_eq!(extract_manifest_text(src).unwrap().trim(), "{\"hedgebuddy\": 1}");
        let no_term = "\"\"\"\n{\"hedgebuddy\": 1}\n\"\"\"\n";
        assert_eq!(parse_manifest(no_term).unwrap().unwrap().hedgebuddy, 1);
    }

    #[test]
    fn invalid_manifests_are_errors_not_none() {
        let bad_json = "\"\"\"\n{\"hedgebuddy\": 1,\n---\n\"\"\"\n";
        assert!(matches!(parse_manifest(bad_json).unwrap_err(), CoreError::Manifest(_)));
        let wrong_version = "\"\"\"\n{\"hedgebuddy\": 2}\n---\n\"\"\"\n";
        assert!(matches!(parse_manifest(wrong_version).unwrap_err(), CoreError::Manifest(_)));
        let event_without_app = "\"\"\"\n{\"hedgebuddy\": 1, \"event\": \"X\"}\n---\n\"\"\"\n";
        assert!(matches!(parse_manifest(event_without_app).unwrap_err(), CoreError::Manifest(_)));
        let bad_name = "\"\"\"\n{\"hedgebuddy\": 1, \"requires\": {\"lower\": {\"type\": \"string\"}}}\n---\n\"\"\"\n";
        assert!(matches!(parse_manifest(bad_name).unwrap_err(), CoreError::Manifest(_)));
        let bad_type = "\"\"\"\n{\"hedgebuddy\": 1, \"requires\": {\"A\": {\"type\": \"date\"}}}\n---\n\"\"\"\n";
        assert!(matches!(parse_manifest(bad_type).unwrap_err(), CoreError::Manifest(_)));
    }

    #[test]
    fn requirement_check_reports_missing_and_mismatched_only() {
        let m = parse_manifest(FIXTURE).unwrap().unwrap();
        let mut p = Profile::new("p", "");
        // Nothing set: SLACK_WEBHOOK missing; PROJECT_NAME has a default so it is fine.
        assert_eq!(
            check_requirements(&m, &p),
            vec![RequirementIssue::Missing { name: "SLACK_WEBHOOK".into(), ty: VarType::Secret }]
        );
        p.variables.insert(
            "SLACK_WEBHOOK".into(),
            Variable { ty: VarType::String, value: Some(json!("x")), description: String::new() },
        );
        assert_eq!(
            check_requirements(&m, &p),
            vec![RequirementIssue::TypeMismatch {
                name: "SLACK_WEBHOOK".into(),
                expected: VarType::Secret,
                actual: VarType::String
            }]
        );
        p.variables.insert(
            "SLACK_WEBHOOK".into(),
            Variable { ty: VarType::Secret, value: None, description: String::new() },
        );
        p.variables.insert(
            "PROJECT_NAME".into(),
            Variable { ty: VarType::Int, value: Some(json!(1)), description: String::new() },
        );
        assert_eq!(
            check_requirements(&m, &p),
            vec![RequirementIssue::TypeMismatch {
                name: "PROJECT_NAME".into(),
                expected: VarType::String,
                actual: VarType::Int
            }]
        );
    }
}
```

Add `pub mod manifest;` to `lib.rs` and `pub use manifest::{check_requirements, parse_manifest, Manifest, Requirement, RequirementIssue};`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test -p hedgebuddy-core manifest::`
Expected: FAIL with `not yet implemented`.

- [ ] **Step 3: Implement**

Replace the `todo!()` functions in `manifest.rs`:
```rust
pub fn extract_manifest_text(source: &str) -> Option<String> {
    // The module docstring is the first statement: skip blank lines and
    // comments, then require the file to open with a triple quote.
    let body = source
        .lines()
        .skip_while(|l| l.trim().is_empty() || l.trim_start().starts_with('#'))
        .collect::<Vec<_>>()
        .join("\n");
    let quote = if body.trim_start().starts_with("\"\"\"") {
        "\"\"\""
    } else if body.trim_start().starts_with("'''") {
        "'''"
    } else {
        return None;
    };
    let start = body.find(quote)? + quote.len();
    let end = body[start..].find(quote)? + start;
    let doc = &body[start..end];
    if !doc.trim_start().starts_with('{') {
        return None;
    }
    let json_part = doc
        .lines()
        .take_while(|line| line.trim_end() != "---")
        .collect::<Vec<_>>()
        .join("\n");
    Some(json_part)
}

pub fn parse_manifest(source: &str) -> Result<Option<Manifest>> {
    let Some(text) = extract_manifest_text(source) else {
        return Ok(None);
    };
    let manifest: Manifest =
        serde_json::from_str(text.trim()).map_err(|e| CoreError::Manifest(e.to_string()))?;
    if manifest.hedgebuddy != 1 {
        return Err(CoreError::Manifest(format!(
            "unsupported manifest version {} (expected 1)",
            manifest.hedgebuddy
        )));
    }
    if manifest.event.is_some() && manifest.app.is_none() {
        return Err(CoreError::Manifest("'event' requires 'app'".into()));
    }
    for name in manifest.requires.keys() {
        validate_var_name(name).map_err(|e| CoreError::Manifest(e.to_string()))?;
    }
    Ok(Some(manifest))
}

pub fn check_requirements(manifest: &Manifest, profile: &Profile) -> Vec<RequirementIssue> {
    manifest
        .requires
        .iter()
        .filter_map(|(name, req)| match profile.variables.get(name) {
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
(`BTreeMap` iteration is already sorted by name.)

- [ ] **Step 4: Point the conformance test at the crate's extractor**

In `crates/core/tests/schema_conformance.rs`, delete the test-local `extract_manifest` function and its doc comment, and replace its one call site with:
```rust
                let text = hedgebuddy_core::manifest::extract_manifest_text(&src)
                    .unwrap_or_else(|| panic!("{} has no manifest block", script.display()));
                let value: Value = serde_json::from_str(text.trim()).expect("manifest JSON");
                assert_valid(&manifest, &value, &script.display().to_string());
```

- [ ] **Step 5: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: all pass (5 new; conformance still 2). Clean.

- [ ] **Step 6: Commit**

```bash
git add crates/core
git commit -m "feat(core): script manifest parsing and requirement checks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Scripts: list, read, write, delete, check

**Files:**
- Create: `crates/core/src/scripts.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: `Store`, `parse_manifest`, `check_requirements`, `load_profile`.
- Produces:
  - `ScriptInfo { name: String, manifest: Option<Manifest>, manifest_error: Option<String> }`.
  - `ScriptCheck { name: String, manifest: Option<Manifest>, issues: Vec<RequirementIssue> }`.
  - `validate_script_name(&str) -> Result<()>`: must end in `.py`, be a single path component (no `/`, `\`, `..`), and be non-empty before the extension.
  - `impl Store`: `script_path(profile, name) -> PathBuf`, `list_scripts(profile) -> Result<Vec<ScriptInfo>>` (sorted), `read_script(profile, name) -> Result<String>`, `write_script(profile, name, source) -> Result<Option<Manifest>>` (rejects an invalid manifest block before writing; a script with no manifest is allowed), `delete_script(profile, name) -> Result<()>`, `check_script(profile, name) -> Result<ScriptCheck>`.
  - Phase 2B adds catalog validation of `app`/`event` on top of `write_script`; this task does not know the catalog.

- [ ] **Step 1: Write the failing tests inside `scripts.rs`**

`crates/core/src/scripts.rs`:
```rust
//! The `scripts/` folder of a profile.

use std::fs;
use std::path::PathBuf;

use crate::error::{CoreError, Result};
use crate::fs_util;
use crate::manifest::{check_requirements, parse_manifest, Manifest, RequirementIssue};
use crate::store::Store;

#[derive(Debug, Clone, PartialEq)]
pub struct ScriptInfo {
    pub name: String,
    pub manifest: Option<Manifest>,
    /// Set when the file has a manifest block that does not parse.
    pub manifest_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScriptCheck {
    pub name: String,
    pub manifest: Option<Manifest>,
    pub issues: Vec<RequirementIssue>,
}

/// A single `*.py` file name with no path separators.
pub fn validate_script_name(name: &str) -> Result<()> {
    todo!()
}

impl Store {
    pub fn script_path(&self, profile: &str, name: &str) -> PathBuf {
        self.scripts_dir(profile).join(name)
    }

    pub fn list_scripts(&self, profile: &str) -> Result<Vec<ScriptInfo>> {
        todo!()
    }

    pub fn read_script(&self, profile: &str, name: &str) -> Result<String> {
        todo!()
    }

    /// Validate the name and (if present) the manifest block, then write.
    pub fn write_script(&self, profile: &str, name: &str, source: &str) -> Result<Option<Manifest>> {
        todo!()
    }

    pub fn delete_script(&self, profile: &str, name: &str) -> Result<()> {
        todo!()
    }

    /// Parse the manifest and compare its requirements against the profile.
    pub fn check_script(&self, profile: &str, name: &str) -> Result<ScriptCheck> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::variable::VarType;

    const FIXTURE: &str = include_str!(
        "../../../schema/fixtures/valid/basic/profiles/commercial-one-day/scripts/on_copy_complete.py"
    );

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        store.create_profile("p", "").unwrap();
        (dir, store)
    }

    #[test]
    fn script_names_are_single_py_files() {
        for ok in ["a.py", "on_copy_complete.py", "A-1.py"] {
            validate_script_name(ok).unwrap();
        }
        for bad in ["", ".py", "a.txt", "a", "dir/a.py", "dir\\a.py", "../a.py", "a.py/"] {
            assert!(validate_script_name(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn write_list_read_delete_round_trip() {
        let (_d, store) = temp_store();
        let m = store.write_script("p", "on_copy_complete.py", FIXTURE).unwrap().unwrap();
        assert_eq!(m.app.as_deref(), Some("offshoot"));
        assert_eq!(store.write_script("p", "plain.py", "print('hi')\n").unwrap(), None);

        let list = store.list_scripts("p").unwrap();
        assert_eq!(
            list.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(),
            vec!["on_copy_complete.py", "plain.py"]
        );
        assert!(list[0].manifest.is_some() && list[0].manifest_error.is_none());
        assert!(list[1].manifest.is_none() && list[1].manifest_error.is_none());

        assert_eq!(store.read_script("p", "plain.py").unwrap(), "print('hi')\n");
        store.delete_script("p", "plain.py").unwrap();
        assert!(matches!(store.read_script("p", "plain.py").unwrap_err(), CoreError::ScriptNotFound(_)));
        assert!(matches!(store.delete_script("p", "plain.py").unwrap_err(), CoreError::ScriptNotFound(_)));
    }

    #[test]
    fn write_rejects_invalid_manifest_without_touching_disk() {
        let (_d, store) = temp_store();
        let bad = "\"\"\"\n{\"hedgebuddy\": 2}\n---\n\"\"\"\n";
        assert!(matches!(store.write_script("p", "bad.py", bad).unwrap_err(), CoreError::Manifest(_)));
        assert!(!store.script_path("p", "bad.py").exists());
        assert!(store.write_script("p", "../x.py", "").is_err());
        assert!(matches!(
            store.write_script("ghost", "a.py", "").unwrap_err(),
            CoreError::ProfileNotFound(_)
        ));
    }

    #[test]
    fn list_reports_broken_manifests_instead_of_failing() {
        let (_d, store) = temp_store();
        fs::write(store.script_path("p", "broken.py"), "\"\"\"\n{\"hedgebuddy\": 1,\n---\n\"\"\"\n").unwrap();
        let list = store.list_scripts("p").unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].manifest.is_none());
        assert!(list[0].manifest_error.as_deref().unwrap().contains("manifest"));
    }

    #[test]
    fn check_script_reports_unmet_requirements() {
        let (_d, store) = temp_store();
        store.write_script("p", "s.py", FIXTURE).unwrap();
        let check = store.check_script("p", "s.py").unwrap();
        assert_eq!(check.issues.len(), 1);
        assert!(matches!(&check.issues[0], RequirementIssue::Missing { name, ty: VarType::Secret } if name == "SLACK_WEBHOOK"));
        store
            .set_variable(
                "p",
                "SLACK_WEBHOOK",
                crate::secrets::VariableInput {
                    ty: VarType::Secret,
                    value: Some(serde_json::json!("https://h")),
                    description: String::new(),
                },
            )
            .unwrap();
        assert!(store.check_script("p", "s.py").unwrap().issues.is_empty());
    }

    #[test]
    fn fixture_scripts_list() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../schema/fixtures/valid/basic");
        let list = Store::open(root).list_scripts("commercial-one-day").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "on_copy_complete.py");
    }
}
```

Add `pub mod scripts;` to `lib.rs` and `pub use scripts::{ScriptCheck, ScriptInfo};`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test -p hedgebuddy-core scripts::`
Expected: FAIL with `not yet implemented`.

- [ ] **Step 3: Implement**

Replace the `todo!()` bodies in `scripts.rs`:
```rust
pub fn validate_script_name(name: &str) -> Result<()> {
    let stem = name.strip_suffix(".py");
    let ok = matches!(stem, Some(s) if !s.is_empty())
        && !name.contains('/')
        && !name.contains('\\')
        && name != ".py"
        && !name.starts_with("..")
        && !name.contains("..");
    if ok {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "script name '{name}' must be a single file name ending in .py"
        )))
    }
}

impl Store {
    fn require_profile(&self, profile: &str) -> Result<()> {
        if self.profile_exists(profile) {
            Ok(())
        } else {
            Err(CoreError::ProfileNotFound(profile.to_owned()))
        }
    }

    pub fn list_scripts(&self, profile: &str) -> Result<Vec<ScriptInfo>> {
        self.require_profile(profile)?;
        let dir = self.scripts_dir(profile);
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut names: Vec<String> = fs::read_dir(&dir)
            .map_err(|e| CoreError::io(&dir, e))?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().is_file())
            .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
            .filter(|name| validate_script_name(name).is_ok())
            .collect();
        names.sort();
        names
            .into_iter()
            .map(|name| {
                let source = self.read_script(profile, &name)?;
                let (manifest, manifest_error) = match parse_manifest(&source) {
                    Ok(m) => (m, None),
                    Err(e) => (None, Some(e.to_string())),
                };
                Ok(ScriptInfo { name, manifest, manifest_error })
            })
            .collect()
    }

    pub fn read_script(&self, profile: &str, name: &str) -> Result<String> {
        self.require_profile(profile)?;
        validate_script_name(name)?;
        let path = self.script_path(profile, name);
        if !path.is_file() {
            return Err(CoreError::ScriptNotFound(name.to_owned()));
        }
        fs::read_to_string(&path).map_err(|e| CoreError::io(&path, e))
    }

    pub fn write_script(&self, profile: &str, name: &str, source: &str) -> Result<Option<Manifest>> {
        self.require_profile(profile)?;
        validate_script_name(name)?;
        let manifest = parse_manifest(source)?;
        fs_util::write_atomic(&self.script_path(profile, name), source.as_bytes(), false)?;
        Ok(manifest)
    }

    pub fn delete_script(&self, profile: &str, name: &str) -> Result<()> {
        self.require_profile(profile)?;
        validate_script_name(name)?;
        let path = self.script_path(profile, name);
        if !path.is_file() {
            return Err(CoreError::ScriptNotFound(name.to_owned()));
        }
        fs::remove_file(&path).map_err(|e| CoreError::io(&path, e))
    }

    pub fn check_script(&self, profile: &str, name: &str) -> Result<ScriptCheck> {
        let source = self.read_script(profile, name)?;
        let manifest = parse_manifest(&source)?;
        let issues = match &manifest {
            Some(m) => check_requirements(m, &self.load_profile(profile)?),
            None => Vec::new(),
        };
        Ok(ScriptCheck { name: name.to_owned(), manifest, issues })
    }
}
```

- [ ] **Step 4: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: all pass (6 new). Clean.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): scripts folder: list, read, write, delete, check

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Run records: read, group, filter, prune

**Files:**
- Create: `crates/core/src/runs.rs`
- Modify: `crates/core/Cargo.toml` (add `jiff`), `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: `Store::runs_dir()`.
- Produces:
  - `RunRecord` enum tagged by `phase`: `Start { ts, run_id, app: Option<String>, event: Option<String>, script, profile }`, `Log { ts, run_id, message }`, `End { ts, run_id, status: RunStatus, exit_code: i32, traceback: Option<String> }`; `RunStatus { Ok, Failed, Error }` serialized as `ok`, `failed`, `error`.
  - `Run { run_id, started_at, app, event, script, profile, logs: Vec<(String, String)>, ended_at: Option<String>, status: Option<RunStatus>, exit_code: Option<i32>, traceback: Option<String> }`.
  - `RunFilter { profile: Option<String>, script: Option<String>, app: Option<String>, limit: Option<usize> }` (`Default` = no filter).
  - `impl Store`: `list_runs(&RunFilter) -> Result<Vec<Run>>` (newest first by `started_at`; records without a `start` are skipped), `get_run(run_id) -> Result<Option<Run>>`, `prune_runs(today: jiff::civil::Date, keep_days: i32) -> Result<Vec<PathBuf>>` (deletes files whose `YYYY-MM-DD` stem is older than `today - keep_days`; returns what it deleted). `RUN_RETENTION_DAYS: i32 = 30`.

- [ ] **Step 1: Add the dependency**

In `crates/core/Cargo.toml` `[dependencies]` add:
```toml
jiff = "0.2"
```

- [ ] **Step 2: Write the failing tests inside `runs.rs`**

`crates/core/src/runs.rs`:
```rust
//! Run records written by the Python library (`runs/YYYY-MM-DD.jsonl`).

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use jiff::civil::Date;
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::store::Store;

/// Files older than this many days are pruned.
pub const RUN_RETENTION_DAYS: i32 = 30;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
    Ok,
    Failed,
    Error,
}

/// One JSONL line.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "phase", rename_all = "lowercase")]
pub enum RunRecord {
    Start {
        ts: String,
        run_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        app: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        event: Option<String>,
        script: String,
        profile: String,
    },
    Log {
        ts: String,
        run_id: String,
        message: String,
    },
    End {
        ts: String,
        run_id: String,
        status: RunStatus,
        exit_code: i32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        traceback: Option<String>,
    },
}

/// A start record with its logs and (if any) its end record.
#[derive(Debug, Clone, PartialEq)]
pub struct Run {
    pub run_id: String,
    pub started_at: String,
    pub app: Option<String>,
    pub event: Option<String>,
    pub script: String,
    pub profile: String,
    pub logs: Vec<(String, String)>,
    pub ended_at: Option<String>,
    pub status: Option<RunStatus>,
    pub exit_code: Option<i32>,
    pub traceback: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RunFilter {
    pub profile: Option<String>,
    pub script: Option<String>,
    pub app: Option<String>,
    pub limit: Option<usize>,
}

impl Store {
    /// All runs, newest first. Lines that do not parse are skipped; a
    /// `log`/`end` without a matching `start` is skipped.
    pub fn list_runs(&self, filter: &RunFilter) -> Result<Vec<Run>> {
        todo!()
    }

    pub fn get_run(&self, run_id: &str) -> Result<Option<Run>> {
        todo!()
    }

    /// Delete `runs/*.jsonl` whose date stem is before `today - keep_days`.
    pub fn prune_runs(&self, today: Date, keep_days: i32) -> Result<Vec<PathBuf>> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_store() -> Store {
        Store::open(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../schema/fixtures/valid/basic"),
        )
    }

    #[test]
    fn records_round_trip_through_serde() {
        let line = r#"{"ts": "2026-09-15T18:23:48Z", "run_id": "01J", "phase": "end", "status": "ok", "exit_code": 0}"#;
        let rec: RunRecord = serde_json::from_str(line).unwrap();
        assert_eq!(
            rec,
            RunRecord::End { ts: "2026-09-15T18:23:48Z".into(), run_id: "01J".into(), status: RunStatus::Ok, exit_code: 0, traceback: None }
        );
        let back = serde_json::to_value(&rec).unwrap();
        assert_eq!(back["phase"], "end");
        assert_eq!(back["status"], "ok");
        assert!(back.get("traceback").is_none());
    }

    #[test]
    fn fixture_run_is_grouped() {
        let runs = fixture_store().list_runs(&RunFilter::default()).unwrap();
        assert_eq!(runs.len(), 1);
        let r = &runs[0];
        assert_eq!(r.run_id, "01J7ZK3Q8R");
        assert_eq!(r.script, "on_copy_complete.py");
        assert_eq!(r.app.as_deref(), Some("offshoot"));
        assert_eq!(r.logs, vec![("2026-09-15T18:23:48Z".to_string(), "posted to slack".to_string())]);
        assert_eq!(r.status, Some(RunStatus::Ok));
        assert_eq!(r.exit_code, Some(0));
        assert_eq!(fixture_store().get_run("01J7ZK3Q8R").unwrap().unwrap().run_id, "01J7ZK3Q8R");
        assert_eq!(fixture_store().get_run("nope").unwrap(), None);
    }

    #[test]
    fn filters_limit_and_order() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        fs::create_dir_all(store.runs_dir()).unwrap();
        fs::write(
            store.runs_dir().join("2026-09-14.jsonl"),
            concat!(
                r#"{"ts":"2026-09-14T10:00:00Z","run_id":"a","phase":"start","app":"offshoot","event":"DiskAdded","script":"x.py","profile":"p1"}"#, "\n",
                r#"{"ts":"2026-09-14T10:00:01Z","run_id":"a","phase":"end","status":"failed","exit_code":1}"#, "\n",
                "this line is garbage\n",
                r#"{"ts":"2026-09-14T11:00:00Z","run_id":"orphan","phase":"log","message":"no start"}"#, "\n",
            ),
        )
        .unwrap();
        fs::write(
            store.runs_dir().join("2026-09-15.jsonl"),
            concat!(
                r#"{"ts":"2026-09-15T10:00:00Z","run_id":"b","phase":"start","script":"y.py","profile":"p2"}"#, "\n",
                r#"{"ts":"2026-09-15T12:00:00Z","run_id":"c","phase":"start","app":"foolcat","event":"ReportCreated","script":"x.py","profile":"p1"}"#, "\n",
            ),
        )
        .unwrap();

        let all = store.list_runs(&RunFilter::default()).unwrap();
        assert_eq!(all.iter().map(|r| r.run_id.as_str()).collect::<Vec<_>>(), vec!["c", "b", "a"]);
        assert_eq!(all[0].status, None); // still running / never ended
        assert_eq!(all[2].status, Some(RunStatus::Failed));

        let p1 = store.list_runs(&RunFilter { profile: Some("p1".into()), ..Default::default() }).unwrap();
        assert_eq!(p1.iter().map(|r| r.run_id.as_str()).collect::<Vec<_>>(), vec!["c", "a"]);
        let x = store.list_runs(&RunFilter { script: Some("x.py".into()), app: Some("offshoot".into()), ..Default::default() }).unwrap();
        assert_eq!(x.iter().map(|r| r.run_id.as_str()).collect::<Vec<_>>(), vec!["a"]);
        let one = store.list_runs(&RunFilter { limit: Some(1), ..Default::default() }).unwrap();
        assert_eq!(one.len(), 1);
        assert_eq!(one[0].run_id, "c");
    }

    #[test]
    fn missing_runs_dir_is_empty_and_prune_deletes_old_files_only() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        assert!(store.list_runs(&RunFilter::default()).unwrap().is_empty());
        assert!(store.prune_runs(Date::constant(2026, 9, 15), 30).unwrap().is_empty());

        fs::create_dir_all(store.runs_dir()).unwrap();
        for name in ["2026-08-15.jsonl", "2026-08-16.jsonl", "2026-09-15.jsonl", "notes.txt", "bad-name.jsonl"] {
            fs::write(store.runs_dir().join(name), "").unwrap();
        }
        let deleted = store.prune_runs(Date::constant(2026, 9, 15), 30).unwrap();
        let deleted: Vec<String> = deleted.iter().map(|p| p.file_name().unwrap().to_string_lossy().into()).collect();
        assert_eq!(deleted, vec!["2026-08-15.jsonl"]); // 31 days old; 2026-08-16 is exactly 30 and kept
        assert!(store.runs_dir().join("2026-08-16.jsonl").exists());
        assert!(store.runs_dir().join("notes.txt").exists());
        assert!(store.runs_dir().join("bad-name.jsonl").exists());
    }
}
```

Add `pub mod runs;` to `lib.rs` and `pub use runs::{Run, RunFilter, RunRecord, RunStatus, RUN_RETENTION_DAYS};`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cargo test -p hedgebuddy-core runs::`
Expected: `records_round_trip_through_serde` passes; the other three FAIL with `not yet implemented`.

- [ ] **Step 4: Implement**

Replace the `todo!()` bodies in `runs.rs`:
```rust
    pub fn list_runs(&self, filter: &RunFilter) -> Result<Vec<Run>> {
        let dir = self.runs_dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut files: Vec<PathBuf> = fs::read_dir(&dir)
            .map_err(|e| CoreError::io(&dir, e))?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().map(|x| x == "jsonl").unwrap_or(false))
            .collect();
        files.sort();

        // Group by run_id, preserving first-seen order so ties sort stably.
        let mut runs: BTreeMap<String, Run> = BTreeMap::new();
        for file in files {
            let text = fs::read_to_string(&file).map_err(|e| CoreError::io(&file, e))?;
            for line in text.lines().filter(|l| !l.trim().is_empty()) {
                let Ok(record) = serde_json::from_str::<RunRecord>(line) else {
                    continue;
                };
                match record {
                    RunRecord::Start { ts, run_id, app, event, script, profile } => {
                        runs.insert(
                            run_id.clone(),
                            Run {
                                run_id,
                                started_at: ts,
                                app,
                                event,
                                script,
                                profile,
                                logs: Vec::new(),
                                ended_at: None,
                                status: None,
                                exit_code: None,
                                traceback: None,
                            },
                        );
                    }
                    RunRecord::Log { ts, run_id, message } => {
                        if let Some(run) = runs.get_mut(&run_id) {
                            run.logs.push((ts, message));
                        }
                    }
                    RunRecord::End { ts, run_id, status, exit_code, traceback } => {
                        if let Some(run) = runs.get_mut(&run_id) {
                            run.ended_at = Some(ts);
                            run.status = Some(status);
                            run.exit_code = Some(exit_code);
                            run.traceback = traceback;
                        }
                    }
                }
            }
        }

        let mut out: Vec<Run> = runs
            .into_values()
            .filter(|r| filter.profile.as_deref().map_or(true, |p| r.profile == p))
            .filter(|r| filter.script.as_deref().map_or(true, |s| r.script == s))
            .filter(|r| filter.app.as_deref().map_or(true, |a| r.app.as_deref() == Some(a)))
            .collect();
        out.sort_by(|a, b| b.started_at.cmp(&a.started_at));
        if let Some(limit) = filter.limit {
            out.truncate(limit);
        }
        Ok(out)
    }

    pub fn get_run(&self, run_id: &str) -> Result<Option<Run>> {
        Ok(self
            .list_runs(&RunFilter::default())?
            .into_iter()
            .find(|r| r.run_id == run_id))
    }

    pub fn prune_runs(&self, today: Date, keep_days: i32) -> Result<Vec<PathBuf>> {
        let dir = self.runs_dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let cutoff = today
            .checked_sub(jiff::Span::new().days(keep_days))
            .map_err(|e| CoreError::Validation(format!("invalid retention window: {e}")))?;
        let mut deleted = Vec::new();
        for entry in fs::read_dir(&dir).map_err(|e| CoreError::io(&dir, e))? {
            let path = entry.map_err(|e| CoreError::io(&dir, e))?.path();
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if path.extension().map(|x| x != "jsonl").unwrap_or(true) {
                continue;
            }
            let Ok(date) = stem.parse::<Date>() else {
                continue;
            };
            if date < cutoff {
                fs::remove_file(&path).map_err(|e| CoreError::io(&path, e))?;
                deleted.push(path);
            }
        }
        deleted.sort();
        Ok(deleted)
    }
```

- [ ] **Step 5: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: all pass (4 new). Clean. If clippy suggests `is_none_or`/`is_some_and` for the `map_or` chains, apply its suggestion.

- [ ] **Step 6: Commit**

```bash
git add crates/core Cargo.lock
git commit -m "feat(core): run records: read, group, filter, prune

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Data-directory watcher

**Files:**
- Create: `crates/core/src/watch.rs`
- Modify: `crates/core/Cargo.toml` (add `notify`), `crates/core/src/lib.rs`

**Interfaces:**
- Produces:
  - `Change { path: PathBuf, kind: ChangeKind }`, `ChangeKind { Created, Modified, Removed, Other }`.
  - `watch(root: &Path) -> Result<(WatchHandle, std::sync::mpsc::Receiver<Change>)>`; creates `root` if missing; watching stops when `WatchHandle` is dropped. Temp files written by `fs_util::write_atomic` (`*.tmp`) are filtered out so consumers see only final files.
  - Debouncing is the consumer's job (phase 5 GUI).

- [ ] **Step 1: Add the dependency**

In `crates/core/Cargo.toml` `[dependencies]` add:
```toml
notify = "8"
```

- [ ] **Step 2: Write the failing test inside `watch.rs`**

`crates/core/src/watch.rs`:
```rust
//! Watch the data directory so front ends can react to external writes
//! (for example an MCP client editing a profile while the GUI is open).

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::error::{CoreError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeKind {
    Created,
    Modified,
    Removed,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Change {
    pub path: PathBuf,
    pub kind: ChangeKind,
}

/// Keeps the OS watcher alive. Drop it to stop watching.
pub struct WatchHandle {
    _watcher: RecommendedWatcher,
}

/// Start watching `root` recursively. The directory is created if missing.
pub fn watch(root: &Path) -> Result<(WatchHandle, Receiver<Change>)> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn a_written_file_produces_a_change_and_tmp_files_are_hidden() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("HedgeBuddy");
        let (_handle, rx) = watch(&root).unwrap();
        assert!(root.is_dir());

        let target = root.join("hedgebuddy.json");
        crate::fs_util::write_atomic(&target, b"{}\n", false).unwrap();

        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        let mut saw_target = false;
        while std::time::Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(change) => {
                    assert!(
                        change.path.extension().map(|e| e != "tmp").unwrap_or(true),
                        "tmp file leaked: {}",
                        change.path.display()
                    );
                    if change.path == target {
                        saw_target = true;
                        break;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(e) => panic!("watcher channel closed: {e}"),
            }
        }
        assert!(saw_target, "no change event for {}", target.display());
    }
}
```

Add `pub mod watch;` to `lib.rs` and `pub use watch::{watch, Change, ChangeKind, WatchHandle};`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cargo test -p hedgebuddy-core watch::`
Expected: FAIL with `not yet implemented`.

- [ ] **Step 4: Implement**

Replace the `todo!()` in `watch.rs`:
```rust
pub fn watch(root: &Path) -> Result<(WatchHandle, Receiver<Change>)> {
    std::fs::create_dir_all(root).map_err(|e| CoreError::io(root, e))?;
    let (tx, rx) = channel::<Change>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        let kind = match event.kind {
            EventKind::Create(_) => ChangeKind::Created,
            EventKind::Modify(_) => ChangeKind::Modified,
            EventKind::Remove(_) => ChangeKind::Removed,
            _ => ChangeKind::Other,
        };
        for path in event.paths {
            if path.extension().map(|e| e == "tmp").unwrap_or(false) {
                continue;
            }
            // A closed receiver just means nobody is listening any more.
            let _ = tx.send(Change { path, kind });
        }
    })
    .map_err(|e| CoreError::Validation(format!("cannot start file watcher: {e}")))?;
    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(|e| CoreError::Validation(format!("cannot watch {}: {e}", root.display())))?;
    Ok((WatchHandle { _watcher: watcher }, rx))
}
```

- [ ] **Step 5: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: all pass (1 new; the watcher test finishes within a couple of seconds). Clean. If the `notify` 8 callback signature differs from `notify::Result<notify::Event>`, consult `cargo doc -p notify --open` and adapt the closure type only; note the change in the report.

- [ ] **Step 6: Commit**

```bash
git add crates/core Cargo.lock
git commit -m "feat(core): data-directory watcher

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Fixture expectations shared with Python, and the public API surface

**Files:**
- Create: `schema/fixtures/valid/basic/expected.json`, `schema/fixtures/valid/empty/expected.json`, `crates/core/tests/store_fixture.rs`
- Modify: `schema/README.md`, `crates/core/src/lib.rs` (crate docs), `CHANGELOG.md`

**Interfaces:**
- Produces: `expected.json` per valid fixture case, a language-neutral summary that phase 4's Python loader asserts against too. Shape:
```json
{
  "active_profile": "commercial-one-day",
  "profiles": {
    "commercial-one-day": {
      "variable_count": 9,
      "types": {"PROJECT_NAME": "string", "DEST_ROOTS": "path[]", "NOTIFY": "bool", "RETRIES": "int", "THRESHOLD": "float", "REPORT_DIR": "path", "API_URL": "url", "CAMERAS": "string[]", "SLACK_WEBHOOK": "secret"},
      "secret_names": ["SLACK_WEBHOOK"],
      "scripts": {"on_copy_complete.py": {"app": "offshoot", "event": "FileCopyCompleted", "requires": ["PROJECT_NAME", "SLACK_WEBHOOK"], "unmet": []}}
    }
  },
  "runs": [{"run_id": "01J7ZK3Q8R", "script": "on_copy_complete.py", "status": "ok", "log_count": 1}]
}
```
`unmet` lists variable names the profile fails to satisfy (empty here because `PROJECT_NAME` has a default and `SLACK_WEBHOOK` is present as a secret).

- [ ] **Step 1: Write the expectation files**

`schema/fixtures/valid/basic/expected.json`: exactly the JSON shown in Interfaces above.

`schema/fixtures/valid/empty/expected.json`:
```json
{ "active_profile": null, "profiles": {}, "runs": [] }
```

- [ ] **Step 2: Document them in the README**

Append to `schema/README.md`:
```markdown
## Expected parse results

Each valid case also carries `expected.json`: a language-neutral summary of what a correct loader produces from that directory (active profile, per-profile variable count and types, secret names, per-script manifest summary and unmet requirements, and per-run id, script, status, and log count). The Rust core asserts it in `crates/core/tests/store_fixture.rs`; the Python library asserts the same file once it has a loader (phase 4). `expected.json` is not validated against any schema and is ignored by the schema-validity tests.
```

- [ ] **Step 3: Write the Rust test**

`crates/core/tests/store_fixture.rs`:
```rust
//! Loads every `schema/fixtures/valid/<case>` through `Store` and compares
//! the result with that case's `expected.json`.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use hedgebuddy_core::{RunFilter, Store};
use serde_json::{json, Value};

fn cases() -> Vec<PathBuf> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../schema/fixtures/valid");
    let mut v: Vec<PathBuf> = fs::read_dir(root)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.is_dir())
        .collect();
    v.sort();
    v
}

fn summarize(store: &Store) -> Value {
    let mut profiles = serde_json::Map::new();
    for name in store.list_profiles().unwrap() {
        let profile = store.load_profile(&name).unwrap();
        let types: BTreeMap<&str, &str> = profile
            .variables
            .iter()
            .map(|(k, v)| (k.as_str(), v.ty.as_str()))
            .collect();
        let secret_names: Vec<&str> = profile
            .variables
            .iter()
            .filter(|(_, v)| v.ty == hedgebuddy_core::VarType::Secret)
            .map(|(k, _)| k.as_str())
            .collect();
        let mut scripts = serde_json::Map::new();
        for info in store.list_scripts(&name).unwrap() {
            let check = store.check_script(&name, &info.name).unwrap();
            let m = info.manifest.expect("fixture scripts carry manifests");
            let unmet: Vec<String> = check
                .issues
                .iter()
                .map(|i| match i {
                    hedgebuddy_core::RequirementIssue::Missing { name, .. } => name.clone(),
                    hedgebuddy_core::RequirementIssue::TypeMismatch { name, .. } => name.clone(),
                })
                .collect();
            scripts.insert(
                info.name,
                json!({
                    "app": m.app, "event": m.event,
                    "requires": m.requires.keys().collect::<Vec<_>>(),
                    "unmet": unmet,
                }),
            );
        }
        profiles.insert(
            name,
            json!({
                "variable_count": profile.variables.len(),
                "types": types,
                "secret_names": secret_names,
                "scripts": scripts,
            }),
        );
    }
    let runs: Vec<Value> = store
        .list_runs(&RunFilter::default())
        .unwrap()
        .into_iter()
        .map(|r| {
            json!({
                "run_id": r.run_id, "script": r.script,
                "status": r.status.map(|s| serde_json::to_value(s).unwrap()),
                "log_count": r.logs.len(),
            })
        })
        .collect();
    json!({
        "active_profile": store.active_profile_name().unwrap(),
        "profiles": profiles,
        "runs": runs,
    })
}

#[test]
fn every_valid_fixture_matches_its_expected_json() {
    let cases = cases();
    assert!(cases.len() >= 2);
    for case in cases {
        let expected: Value =
            serde_json::from_str(&fs::read_to_string(case.join("expected.json")).unwrap()).unwrap();
        let actual = summarize(&Store::open(&case));
        assert_eq!(actual, expected, "fixture {} does not match expected.json", case.display());
    }
}
```

`VarType`, `RequirementIssue`, `RunFilter`, and `Store` are all re-exported from the crate root by earlier tasks. If any is missing, add the `pub use` in `lib.rs` rather than reaching through the module path.

- [ ] **Step 4: Run the test**

Run: `cargo test -p hedgebuddy-core --test store_fixture`
Expected: PASS. If it fails, the assertion prints both JSON values; the cause is either the expectation file (fix it only if the loader is right) or a loader bug (fix the loader).

- [ ] **Step 5: Crate-level docs and changelog**

Replace the doc comment at the top of `crates/core/src/lib.rs` with:
```rust
//! HedgeBuddy core.
//!
//! Everything HedgeBuddy does lives here. The CLI, the MCP server, and the
//! desktop app are thin front ends over this crate. This crate has no UI and
//! never parses command-line arguments.
//!
//! Entry point: [`Store`], opened on a data directory ([`Store::at_default`]
//! for the platform location). Profiles, variables, secrets, scripts, and run
//! records are all methods on `Store`; [`watch`] reports external changes.
//! Every file `Store` writes conforms to the JSON Schemas under `schema/`.
```

In `CHANGELOG.md` under `## Unreleased` → `### Added`, append:
```markdown
- Core storage: profiles, typed variables, secrets, scripts with manifests and requirement checks, run-record reading and pruning, and a data-directory watcher.
- `hedgebuddy.json` may have `active_profile: null` (fresh install); fixtures gained an `empty` case and `expected.json` parse summaries.
```

- [ ] **Step 6: Full verification**

```bash
cd E:/Coding/hedgebuddy
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
(cd python && uv run pytest -v)
python scripts/sync_version.py --check
```
Expected: everything green; Python 12 passed (unchanged by this task).

- [ ] **Step 7: Commit**

```bash
git add schema crates/core CHANGELOG.md
git commit -m "test(core): fixture expectations shared with Python; crate docs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (phase 2 core, storage half):** section 5 layout and index → Tasks 1, 2; variables and types → Task 3; profiles and active pointer → Task 4; secrets file with 0600 and secret placement → Task 5; section 6 manifest rules → Task 6; scripts folder and `check_script`'s requirement half → Task 7 (the Python syntax check needs an interpreter and belongs to the CLI in phase 3; catalog validation of app/event is phase 2B); run records and 30-day pruning → Task 8; watcher for live reload → Task 9; "fixtures plus expected parsed output" from section 12 → Task 10. Not in this plan, by design: catalog, detection, attach/detach, commands, volumes (phase 2B).

**Placeholders:** none; every `todo!()` is replaced within its own task.

**Type consistency:** `Store` methods used across tasks: `index`/`write_index` (T2) used by T4; `validate_slug`/`validate_var_name`/`Variable::validate` (T3) used by T4, T5, T6; `load_profile`/`save_profile`/`create_profile`/`profile_exists` (T4) used by T5, T7; `set_variable`/`VariableInput` (T5) used in T7's test; `parse_manifest`/`check_requirements`/`RequirementIssue` (T6) used by T7 and T10; `list_scripts`/`check_script`/`ScriptInfo.manifest` (T7) used by T10; `list_runs`/`RunFilter`/`Run.status` (T8) used by T10; `fs_util::write_atomic` (T2) used by T7 and T9. `VarType::as_str` (T3) used by T10. Re-exports in `lib.rs` accumulate: T2 `CoreError, Result, Index, Store`; T3 `VarType, VarValue, Variable`; T4 `Profile`; T5 `ResolvedVariable, VariableInput`; T6 `check_requirements, parse_manifest, Manifest, Requirement, RequirementIssue`; T7 `ScriptCheck, ScriptInfo`; T8 `Run, RunFilter, RunRecord, RunStatus, RUN_RETENTION_DAYS`; T9 `watch, Change, ChangeKind, WatchHandle`.
