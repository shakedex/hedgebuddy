# Phase 4: Python 0.11.0 Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `hedgebuddy` Python package 0.11.0 that Hedge-app scripts import: `@hb.script`, typed `vars`, the `event` payload, `hb.log` run records, `inject_env`, and the standalone helpers. Conformance fixtures prove it reads storage exactly as the Rust core does. A manual workflow is ready to publish it to PyPI.

**Architecture:** A pure-Python package in `python/hedgebuddy/`, split into small private modules:
- `_errors`, `_paths` and `_values` handle types.
- `_store` and `_vars` read profiles.
- `_manifest` parses the docstring manifest.
- `_event` parses the payload.
- `_lock` and `_runs` append run records.
- `_script` holds the decorator.
- `_api` holds the module-level helpers.

`__init__.py` re-exports the public API. The library only reads `hedgebuddy.json`, `profile.json` and `secrets.json`, and only appends to `runs/*.jsonl`. Core stays the only writer of everything else. One Rust task makes `check_script` report a missing or mismatched package, and makes core skip a UTF-8 BOM in manifests like the Python side does.

**Tech Stack:** Python 3.9+, standard library only; pytest and jsonschema (dev); uv and hatchling for build; GitHub Actions with PyPI trusted publishing; Rust (one task) for `check_script`.

**Spec:** `docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md`, sections 5, 6, 9, 12 and 13 item 4. Storage contract: `schema/*.schema.json` and `schema/README.md`.

## Global Constraints

- **Runtime.** Pure Python with zero runtime dependencies, `requires-python = ">=3.9"`. Tests run on Python 3.9 and 3.13, on Windows and macOS.
- **Python 3.9 syntax.** Every module starts with `from __future__ import annotations`. Use no syntax newer than 3.9: no `match`, and no `X | Y` unions evaluated at runtime. Use `typing.Optional`, `Dict` and `List` in annotations that `dataclasses` inspects.
- **Public API.** Exactly `script`, `var`, `exists`, `all_vars`, `inject_env`, `log`, `event`, `Event`, `Vars`, `HedgeBuddyError`, `VariableNotFoundError`, `VariableTypeError`, `StorageNotFoundError`, `StorageCorruptedError`, `ManifestError` and `__version__`. Everything else lives in underscore modules.
- **Storage access.** The library reads `hedgebuddy.json`, `profiles/<name>/profile.json` and `profiles/<name>/secrets.json`. It appends to `runs/<YYYY-MM-DD>.jsonl`. It never writes any other file.
- **Data directory.** A non-empty `HEDGEBUDDY_DATA_DIR` wins. Otherwise use:
  - Windows: `%APPDATA%\HedgeBuddy`, falling back to `~\AppData\Roaming\HedgeBuddy`.
  - macOS: `~/Library/Application Support/HedgeBuddy`.
  - Elsewhere: `$XDG_CONFIG_HOME/HedgeBuddy` when absolute, else `~/.config/HedgeBuddy`.

  This matches `crates/core/src/paths.rs`.
- **Secrets.** Secret values never appear in error messages, `repr()` output, or run records the library writes.
- **Manifest extraction** follows `schema/README.md` and matches core's `extract_manifest_text` line for line. The one addition is that a leading UTF-8 BOM is skipped, and Task 7 makes core skip it too.
- **Run records.**
  - Each line validates against `schema/run-record.schema.json`.
  - It is written with `json.dumps(..., ensure_ascii=True)` plus `"\n"`, under an exclusive file lock.
  - A write failure is reported once on stderr and never fails the script.
- **Version.** Stays `0.11.0` (ZeroVer). `python scripts/sync_version.py --check` must pass.
- **Test isolation.** Tests never touch the real data directory. `tests/conftest.py` sets `HEDGEBUDDY_DATA_DIR` to a fresh temp folder for every test, and subprocess tests pass it explicitly.
- **No publishing.** Nothing is published to PyPI while this plan executes. The publish workflow only runs when someone triggers it by hand.
- **Git.** Work on branch `feat/phase4-python`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Shell.** Commands are for Git Bash on Windows. Python commands run from `python/` with `uv run`. The repo root is `E:/Coding/hedgebuddy`.
- **Rust checks (Task 7).** `cargo fmt --all --check` and `cargo clippy --workspace --all-targets -- -D warnings` stay clean.

Decisions this plan makes where spec §9 is silent (Task 8 records them in the spec):
1. **When `@hb.script` runs `main`.** It runs `main` only when the function's module is `__main__`. When the module is imported, it returns the function unchanged, so scripts can be tested.
2. **When the run record opens.** It opens as soon as the active profile is known, before the manifest and requirement checks, so those failures are recorded with status `error`. With no active profile, nothing is recorded: the error goes to stderr and the exit code is 1.
3. **Defaults.** `hb.var(name, default)` returns the default only when the variable is missing. A storage error is never hidden. A variable declared without a value (a secret with nothing in `secrets.json`) counts as missing at run time.
4. **Payload name collisions.** Payload fields that collide with `Event` attributes (`raw`, `app`, `name`, `get`), such as OffShoot's `SourceAdded_name`, are read with `event["name"]`.
5. **Payload errors.** A missing or blank `sys.argv[1]` means an empty payload. A payload that is not a JSON object raises `ValueError`.
6. **`VariableNotFoundError`** is both a `KeyError` and an `AttributeError`, so `vars.get("X")`, `getattr(vars, "X", None)` and `hasattr` all work.
7. **Run record details.**
   - Run ids are ULIDs.
   - Timestamps are UTC with milliseconds.
   - Every record of one run goes to the file named by the local date at its start.

## Module map

| File | Responsibility |
|---|---|
| `python/hedgebuddy/_errors.py` | The six exception classes |
| `python/hedgebuddy/_paths.py` | `data_dir()` |
| `python/hedgebuddy/_values.py` | `TYPES`, `convert()` (JSON to Python per type), `to_env()` |
| `python/hedgebuddy/_store.py` | `Variable`, `active_profile()`, `resolve_profile()`, `load_variables()`, `profile_names()` |
| `python/hedgebuddy/_vars.py` | `Vars`, the typed mapping scripts receive |
| `python/hedgebuddy/_api.py` | `var`, `exists`, `all_vars`, `inject_env` |
| `python/hedgebuddy/_manifest.py` | `Requirement`, `Manifest`, `RequirementIssue`, `extract_manifest_text`, `parse_manifest`, `check_requirements` |
| `python/hedgebuddy/_event.py` | `Event`, `parse_event()` |
| `python/hedgebuddy/_lock.py` | `locked()`, an exclusive lock on an open file |
| `python/hedgebuddy/_runs.py` | `new_run_id`, `utc_timestamp`, `RunLog`, `set_current`, `log` |
| `python/hedgebuddy/_script.py` | `script` decorator, `run()`, `read_manifest()`, `event()` |
| `python/hedgebuddy/__init__.py` | Public re-exports and `__version__` |
| `python/tests/conftest.py` | Autouse `hb_root` fixture (temp data dir) |
| `python/tests/helpers.py` | `SCHEMA_ROOT`, `write_profile`, `run_lines`, `validate_run_record` |
| `python/scripts/check_dist.py` | Checks the built wheel and sdist |
| `.github/workflows/publish-python.yml` | Manual PyPI publish with trusted publishing |

---

### Task 1: Errors, data directory, and typed values

**Files:**
- Create: `python/hedgebuddy/_errors.py`, `python/hedgebuddy/_paths.py`, `python/hedgebuddy/_values.py`
- Create: `python/tests/conftest.py`, `python/tests/test_errors.py`, `python/tests/test_paths.py`, `python/tests/test_values.py`
- Modify: `python/hedgebuddy/__init__.py`

**Interfaces:**
- Produces:
  - `HedgeBuddyError`, `VariableNotFoundError`, `VariableTypeError`, `StorageNotFoundError`, `StorageCorruptedError`, `ManifestError` (in `_errors`, re-exported).
  - `_paths.DATA_DIR_ENV = "HEDGEBUDDY_DATA_DIR"` and `_paths.data_dir() -> Path`.
  - `_values.TYPES`, a tuple of the nine type strings.
  - `_values.convert(name: str, ty: str, raw: Any) -> Any`, which raises `VariableTypeError`.
  - `_values.to_env(value: Any) -> str`.
  - The autouse fixture `hb_root: Path`.

- [ ] **Step 1: The isolation fixture**

`python/tests/conftest.py`:
```python
"""Every test runs against its own empty data directory, never the real one."""

from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def hb_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "HedgeBuddy"
    root.mkdir()
    monkeypatch.setenv("HEDGEBUDDY_DATA_DIR", str(root))
    return root
```

- [ ] **Step 2: Write the failing tests**

`python/tests/test_errors.py`:
```python
import hedgebuddy as hb


def test_variable_not_found_is_a_key_and_attribute_error_with_a_plain_message():
    e = hb.VariableNotFoundError("X is not set")
    assert isinstance(e, KeyError)
    assert isinstance(e, AttributeError)
    assert isinstance(e, hb.HedgeBuddyError)
    assert str(e) == "X is not set"


def test_error_hierarchy():
    assert issubclass(hb.VariableTypeError, TypeError)
    assert issubclass(hb.ManifestError, ValueError)
    assert issubclass(hb.StorageCorruptedError, ValueError)
    for cls in (hb.VariableTypeError, hb.ManifestError, hb.StorageCorruptedError, hb.StorageNotFoundError):
        assert issubclass(cls, hb.HedgeBuddyError)
```

`python/tests/test_paths.py`:
```python
import sys
from pathlib import Path

from hedgebuddy._paths import DATA_DIR_ENV, data_dir


def test_override_wins(monkeypatch, tmp_path):
    monkeypatch.setenv(DATA_DIR_ENV, str(tmp_path / "custom"))
    assert data_dir() == tmp_path / "custom"


def test_platform_defaults_match_core(monkeypatch):
    monkeypatch.setenv(DATA_DIR_ENV, "")  # empty means "not set", as in core
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setenv("APPDATA", str(Path("C:/Users/x/AppData/Roaming")))
    assert data_dir() == Path("C:/Users/x/AppData/Roaming") / "HedgeBuddy"
    monkeypatch.delenv("APPDATA")
    assert data_dir() == Path.home() / "AppData" / "Roaming" / "HedgeBuddy"

    monkeypatch.setattr(sys, "platform", "darwin")
    assert data_dir() == Path.home() / "Library" / "Application Support" / "HedgeBuddy"

    monkeypatch.setattr(sys, "platform", "linux")
    xdg = Path.home() / "xdg-config"
    monkeypatch.setenv("XDG_CONFIG_HOME", str(xdg))
    assert data_dir() == xdg / "HedgeBuddy"
    monkeypatch.setenv("XDG_CONFIG_HOME", "relative/dir")  # core ignores a relative XDG path
    assert data_dir() == Path.home() / ".config" / "HedgeBuddy"
```

`python/tests/test_values.py`:
```python
import os
import re
from pathlib import Path

import pytest

from hedgebuddy._errors import VariableTypeError
from hedgebuddy._values import TYPES, convert, to_env


def test_nine_types():
    assert TYPES == ("string", "secret", "int", "float", "bool", "path", "url", "string[]", "path[]")


@pytest.mark.parametrize(
    "ty,raw,expected",
    [
        ("string", "x", "x"),
        ("secret", "s3cret", "s3cret"),
        ("int", 3, 3),
        ("float", 1, 1.0),
        ("float", 0.5, 0.5),
        ("bool", True, True),
        ("path", "D:/Offload", Path("D:/Offload")),
        ("url", "https://example.com/api", "https://example.com/api"),
        ("string[]", ["A", "B"], ["A", "B"]),
        ("path[]", ["D:/A", "F:/B"], [Path("D:/A"), Path("F:/B")]),
    ],
)
def test_convert_accepts_each_type(ty, raw, expected):
    value = convert("X", ty, raw)
    assert value == expected
    assert type(value) is type(expected)


@pytest.mark.parametrize(
    "ty,raw",
    [
        ("string", 1),
        ("int", True),
        ("int", 1.5),
        ("int", "3"),
        ("float", True),
        ("float", "1"),
        ("bool", 1),
        ("path", ""),
        ("path", 3),
        ("url", "ftp://example.com"),
        ("url", "example.com"),
        ("string[]", ["a", 1]),
        ("string[]", "a"),
        ("path[]", [""]),
    ],
)
def test_convert_rejects_wrong_values(ty, raw):
    with pytest.raises(VariableTypeError, match=re.escape(f"X is declared as {ty}")):
        convert("X", ty, raw)


def test_secret_values_never_appear_in_errors():
    with pytest.raises(VariableTypeError) as err:
        convert("TOKEN", "secret", ["hunter2"])
    assert "hunter2" not in str(err.value)


def test_unknown_type():
    with pytest.raises(VariableTypeError, match="unknown type 'date'"):
        convert("X", "date", "x")


def test_to_env():
    assert to_env(True) == "1"
    assert to_env(False) == "0"
    assert to_env(3) == "3"
    assert to_env(0.5) == "0.5"
    assert to_env("x") == "x"
    assert to_env(Path("D:/A")) == str(Path("D:/A"))
    assert to_env(["x", "y"]) == f"x{os.pathsep}y"
    assert to_env([Path("D:/A"), Path("F:/B")]) == os.pathsep.join([str(Path("D:/A")), str(Path("F:/B"))])
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd python && uv run pytest tests/test_errors.py tests/test_paths.py tests/test_values.py -q`
Expected: collection errors, `ModuleNotFoundError: No module named 'hedgebuddy._paths'` / `_values`, and `AttributeError: module 'hedgebuddy' has no attribute 'VariableNotFoundError'`.

- [ ] **Step 4: Implement**

`python/hedgebuddy/_errors.py`:
```python
"""Errors raised by hedgebuddy."""

from __future__ import annotations


class HedgeBuddyError(Exception):
    """Base class of every error hedgebuddy raises."""


class VariableNotFoundError(HedgeBuddyError, KeyError, AttributeError):
    """A variable is not set in the active profile and has no default.

    It is a ``KeyError`` for ``vars["NAME"]`` and an ``AttributeError`` for
    ``vars.NAME``, so ``vars.get("NAME")``, ``getattr(vars, "NAME", None)``
    and ``hasattr(vars, "NAME")`` all work.
    """

    def __str__(self) -> str:
        # KeyError would quote the message; show it as written.
        return str(self.args[0]) if self.args else ""


class VariableTypeError(HedgeBuddyError, TypeError):
    """A variable's value does not match its declared type, or a script
    requires a different type than the profile declares."""


class StorageNotFoundError(HedgeBuddyError):
    """There is no active profile, or its files cannot be found or read."""


class StorageCorruptedError(HedgeBuddyError, ValueError):
    """A HedgeBuddy file exists but is not valid JSON or not in the expected shape."""


class ManifestError(HedgeBuddyError, ValueError):
    """A script's manifest block is not valid."""
```

`python/hedgebuddy/_paths.py`:
```python
"""Where the HedgeBuddy data directory is (the same rules as the Rust core)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

DATA_DIR_ENV = "HEDGEBUDDY_DATA_DIR"


def data_dir() -> Path:
    """The HedgeBuddy data directory. A non-empty ``HEDGEBUDDY_DATA_DIR`` wins."""
    override = os.environ.get(DATA_DIR_ENV)
    if override:
        return Path(override)
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        base = Path(appdata) if appdata else Path.home() / "AppData" / "Roaming"
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        xdg = os.environ.get("XDG_CONFIG_HOME")
        base = Path(xdg) if xdg and os.path.isabs(xdg) else Path.home() / ".config"
    return base / "HedgeBuddy"
```

`python/hedgebuddy/_values.py`:
```python
"""The nine variable types and their Python values (spec section 5)."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

from ._errors import VariableTypeError

TYPES = ("string", "secret", "int", "float", "bool", "path", "url", "string[]", "path[]")

_URL = re.compile(r"^https?://")


def convert(name: str, ty: str, raw: Any) -> Any:
    """The Python value of ``raw`` for variable ``name`` declared as ``ty``.

    Raises ``VariableTypeError`` when ``raw`` does not fit the type. A secret's
    value is never included in the message.
    """

    def bad(expected: str) -> VariableTypeError:
        shown = f"a {type(raw).__name__}" if ty == "secret" else repr(raw)
        return VariableTypeError(f"{name} is declared as {ty} but its value is not {expected}: {shown}")

    if ty in ("string", "secret"):
        if isinstance(raw, str):
            return raw
        raise bad("a string")
    if ty == "int":
        if isinstance(raw, int) and not isinstance(raw, bool):
            return raw
        raise bad("an integer")
    if ty == "float":
        if isinstance(raw, (int, float)) and not isinstance(raw, bool):
            return float(raw)
        raise bad("a number")
    if ty == "bool":
        if isinstance(raw, bool):
            return raw
        raise bad("true or false")
    if ty == "path":
        if isinstance(raw, str) and raw:
            return Path(raw)
        raise bad("a non-empty path")
    if ty == "url":
        if isinstance(raw, str) and _URL.match(raw):
            return raw
        raise bad("an http or https URL")
    if ty == "string[]":
        if isinstance(raw, list) and all(isinstance(x, str) for x in raw):
            return list(raw)
        raise bad("a list of strings")
    if ty == "path[]":
        if isinstance(raw, list) and all(isinstance(x, str) and x for x in raw):
            return [Path(x) for x in raw]
        raise bad("a list of non-empty paths")
    raise VariableTypeError(f"{name} has an unknown type {ty!r}")


def to_env(value: Any) -> str:
    """A typed value as an environment variable: bools as 1/0, lists joined with os.pathsep."""
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, list):
        return os.pathsep.join(str(x) for x in value)
    return str(value)
```

Replace `python/hedgebuddy/__init__.py` with:
```python
"""HedgeBuddy for Python scripts run by Hedge apps."""

from ._errors import (
    HedgeBuddyError,
    ManifestError,
    StorageCorruptedError,
    StorageNotFoundError,
    VariableNotFoundError,
    VariableTypeError,
)

__version__ = "0.11.0"

__all__ = [
    "HedgeBuddyError",
    "ManifestError",
    "StorageCorruptedError",
    "StorageNotFoundError",
    "VariableNotFoundError",
    "VariableTypeError",
    "__version__",
]
```

- [ ] **Step 5: Run the tests**

Run: `cd python && uv run pytest -q`
Expected: all pass, including the existing `test_version.py` and `test_schema_conformance.py`.

- [ ] **Step 6: Commit**

```bash
git add python
git commit -m "feat(python): errors, data directory, and typed variable values

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Reading profiles: store, `Vars`, and the module-level helpers

**Files:**
- Create: `python/hedgebuddy/_store.py`, `python/hedgebuddy/_vars.py`, `python/hedgebuddy/_api.py`
- Create: `python/tests/helpers.py`, `python/tests/test_store.py`, `python/tests/test_vars.py`, `python/tests/test_api.py`
- Modify: `python/hedgebuddy/__init__.py`

**Interfaces:**
- Consumes: `_errors`, `_paths.data_dir`, `_values.TYPES`, `convert` and `to_env` (Task 1).
- Produces:
  - `_store.Variable(name, type, raw, description)`, a frozen dataclass. `raw` is `None` when unset.
  - `_store.active_profile(root: Path) -> Optional[str]`.
  - `_store.resolve_profile(root: Path) -> str`, which raises `StorageNotFoundError`.
  - `_store.load_variables(root: Path, profile: str) -> Dict[str, Variable]`.
  - `_store.profile_names(root: Path) -> List[str]`.
  - `_vars.Vars(variables: Mapping[str, Variable], profile: str, defaults: Optional[Mapping[str, Any]] = None)`.
  - Public `var(name, default=...)`, `exists(name) -> bool`, `all_vars() -> Dict[str, Any]`, `inject_env(overwrite=False) -> List[str]`, `Vars`.
  - `tests/helpers.py`: `SCHEMA_ROOT` and `write_profile(root, name, variables, secrets=None, active=True) -> Path`.

- [ ] **Step 1: Test helpers**

`python/tests/helpers.py`:
```python
"""Shared test helpers."""

import json
from pathlib import Path
from typing import Optional

SCHEMA_ROOT = Path(__file__).resolve().parents[2] / "schema"


def write_profile(root: Path, name: str, variables: dict, secrets: Optional[dict] = None, active: bool = True) -> Path:
    """Write profiles/<name>/profile.json (and secrets.json); make it active unless told not to."""
    folder = root / "profiles" / name
    (folder / "scripts").mkdir(parents=True, exist_ok=True)
    profile = {"version": 1, "name": name, "description": "", "variables": variables}
    (folder / "profile.json").write_text(json.dumps(profile), encoding="utf-8")
    if secrets is not None:
        (folder / "secrets.json").write_text(json.dumps(secrets), encoding="utf-8")
    if active:
        (root / "hedgebuddy.json").write_text(json.dumps({"version": 1, "active_profile": name}), encoding="utf-8")
    return folder
```

- [ ] **Step 2: Write the failing tests**

`python/tests/test_store.py`:
```python
import pytest

from hedgebuddy._errors import StorageCorruptedError, StorageNotFoundError
from hedgebuddy._store import Variable, active_profile, load_variables, profile_names, resolve_profile
from tests.helpers import write_profile


def test_missing_index_means_no_active_profile(hb_root):
    assert active_profile(hb_root) is None
    with pytest.raises(StorageNotFoundError, match="no active HedgeBuddy profile"):
        resolve_profile(hb_root)


def test_null_active_profile(hb_root):
    (hb_root / "hedgebuddy.json").write_text('{"version": 1, "active_profile": null}', encoding="utf-8")
    assert active_profile(hb_root) is None


def test_active_profile(hb_root):
    write_profile(hb_root, "commercial-one-day", {})
    assert active_profile(hb_root) == "commercial-one-day"
    assert resolve_profile(hb_root) == "commercial-one-day"


@pytest.mark.parametrize(
    "text",
    [
        "not json",
        "[]",
        '{"version": 2, "active_profile": null}',
        '{"version": true, "active_profile": null}',
        '{"version": 1, "active_profile": "../evil"}',
        '{"version": 1, "active_profile": 3}',
    ],
)
def test_bad_index_is_corrupted(hb_root, text):
    (hb_root / "hedgebuddy.json").write_text(text, encoding="utf-8")
    with pytest.raises(StorageCorruptedError):
        active_profile(hb_root)


def test_load_variables_merges_secrets(hb_root):
    write_profile(
        hb_root,
        "p",
        {
            "PROJECT_NAME": {"type": "string", "value": "Spot", "description": "Shown in Slack"},
            "HOOK": {"type": "secret", "description": ""},
            "TOKEN": {"type": "secret"},
        },
        secrets={"HOOK": "https://hook"},
    )
    variables = load_variables(hb_root, "p")
    assert variables["PROJECT_NAME"] == Variable("PROJECT_NAME", "string", "Spot", "Shown in Slack")
    assert variables["HOOK"].raw == "https://hook"
    assert variables["TOKEN"].raw is None
    assert variables["TOKEN"].description == ""


def test_missing_secrets_file_means_no_secret_values(hb_root):
    write_profile(hb_root, "p", {"HOOK": {"type": "secret"}})
    assert load_variables(hb_root, "p")["HOOK"].raw is None


def test_missing_profile(hb_root):
    with pytest.raises(StorageNotFoundError, match="profile 'nope' does not exist"):
        load_variables(hb_root, "nope")


def test_invalid_profile_name_is_rejected_before_touching_the_disk(hb_root):
    with pytest.raises(StorageNotFoundError, match="not a valid profile name"):
        load_variables(hb_root, "../x")


@pytest.mark.parametrize(
    "profile_json",
    [
        "{",
        '{"version": 1, "name": "p"}',
        '{"version": 2, "name": "p", "variables": {}}',
        '{"version": 1, "name": "p", "variables": {"lower": {"type": "string", "value": "x"}}}',
        '{"version": 1, "name": "p", "variables": {"X": {"type": "date", "value": "x"}}}',
        '{"version": 1, "name": "p", "variables": {"X": "string"}}',
    ],
)
def test_corrupted_profiles(hb_root, profile_json):
    folder = hb_root / "profiles" / "p"
    folder.mkdir(parents=True)
    (folder / "profile.json").write_text(profile_json, encoding="utf-8")
    with pytest.raises(StorageCorruptedError):
        load_variables(hb_root, "p")


def test_corrupted_secrets(hb_root):
    write_profile(hb_root, "p", {"HOOK": {"type": "secret"}})
    (hb_root / "profiles" / "p" / "secrets.json").write_text("[1]", encoding="utf-8")
    with pytest.raises(StorageCorruptedError, match="secrets.json"):
        load_variables(hb_root, "p")


def test_profile_names_lists_folders_with_a_profile_json(hb_root):
    write_profile(hb_root, "b", {})
    write_profile(hb_root, "a", {}, active=False)
    (hb_root / "profiles" / "not-a-profile").mkdir()
    assert profile_names(hb_root) == ["a", "b"]
```

`python/tests/test_vars.py`:
```python
from pathlib import Path

import pytest

from hedgebuddy._errors import VariableNotFoundError, VariableTypeError
from hedgebuddy._store import Variable
from hedgebuddy._vars import Vars


def make(**defaults):
    variables = {
        "PROJECT_NAME": Variable("PROJECT_NAME", "string", "Spot", ""),
        "ROOTS": Variable("ROOTS", "path[]", ["D:/A", "F:/B"], ""),
        "HOOK": Variable("HOOK", "secret", "https://hook", ""),
        "TOKEN": Variable("TOKEN", "secret", None, ""),
        "BROKEN": Variable("BROKEN", "int", "3", ""),
    }
    return Vars(variables, "p", defaults)


def test_attribute_and_item_access_are_typed():
    v = make()
    assert v.PROJECT_NAME == "Spot"
    assert v["PROJECT_NAME"] == "Spot"
    assert v.ROOTS == [Path("D:/A"), Path("F:/B")]
    assert v.HOOK == "https://hook"


def test_missing_and_unset_variables():
    v = make()
    with pytest.raises(VariableNotFoundError, match="NOPE is not set in profile 'p'"):
        v.NOPE
    with pytest.raises(VariableNotFoundError, match="TOKEN has no value in profile 'p'"):
        v["TOKEN"]
    assert getattr(v, "NOPE", None) is None
    assert not hasattr(v, "TOKEN")
    assert v.get("NOPE", 5) == 5


def test_defaults_fill_only_missing_or_unset_values():
    v = make(TOKEN="fallback", PROJECT_NAME="Untitled", EXTRA=1)
    assert v.TOKEN == "fallback"
    assert v.PROJECT_NAME == "Spot"
    assert v.EXTRA == 1


def test_membership_iteration_and_length():
    v = make(EXTRA=1)
    assert "PROJECT_NAME" in v
    assert "TOKEN" not in v
    assert "EXTRA" in v
    assert list(v) == ["BROKEN", "EXTRA", "HOOK", "PROJECT_NAME", "ROOTS"]
    assert len(v) == 5


def test_a_bad_stored_value_fails_on_access():
    with pytest.raises(VariableTypeError, match="BROKEN is declared as int"):
        make().BROKEN


def test_repr_shows_names_but_never_values():
    text = repr(make())
    assert "HOOK" in text
    assert "https://hook" not in text
    assert "Spot" not in text


def test_private_attributes_are_plain_attribute_errors():
    with pytest.raises(AttributeError) as err:
        make()._missing
    assert not isinstance(err.value, VariableNotFoundError)
```

`python/tests/test_api.py`:
```python
import os
from pathlib import Path

import pytest

import hedgebuddy as hb
from tests.helpers import write_profile

VARIABLES = {
    "PROJECT_NAME": {"type": "string", "value": "Spot"},
    "NOTIFY": {"type": "bool", "value": True},
    "ROOTS": {"type": "path[]", "value": ["D:/A", "F:/B"]},
    "HOOK": {"type": "secret"},
    "TOKEN": {"type": "secret"},
}


@pytest.fixture
def profile(hb_root):
    write_profile(hb_root, "p", VARIABLES, secrets={"HOOK": "https://hook"})
    return hb_root


def test_var_reads_typed_values(profile):
    assert hb.var("PROJECT_NAME") == "Spot"
    assert hb.var("NOTIFY") is True
    assert hb.var("HOOK") == "https://hook"
    assert hb.var("ROOTS") == [Path("D:/A"), Path("F:/B")]


def test_var_default_covers_missing_variables_only(profile):
    assert hb.var("NOPE", default="x") == "x"
    assert hb.var("TOKEN", default=None) is None
    with pytest.raises(hb.VariableNotFoundError):
        hb.var("NOPE")


def test_storage_errors_are_not_hidden_by_defaults():
    with pytest.raises(hb.StorageNotFoundError):
        hb.var("X", default=1)


def test_exists_and_all_vars(profile):
    assert hb.exists("HOOK")
    assert not hb.exists("TOKEN")
    assert not hb.exists("NOPE")
    values = hb.all_vars()
    assert sorted(values) == ["HOOK", "NOTIFY", "PROJECT_NAME", "ROOTS"]
    assert values["ROOTS"] == [Path("D:/A"), Path("F:/B")]


def test_inject_env(profile, monkeypatch):
    for name in VARIABLES:
        # setenv then delenv: monkeypatch removes whatever inject_env sets.
        monkeypatch.setenv(name, "placeholder")
        monkeypatch.delenv(name)
    monkeypatch.setenv("NOTIFY", "keep")
    assert hb.inject_env() == ["HOOK", "PROJECT_NAME", "ROOTS"]
    assert os.environ["NOTIFY"] == "keep"
    assert os.environ["PROJECT_NAME"] == "Spot"
    assert os.environ["HOOK"] == "https://hook"
    assert os.environ["ROOTS"] == os.pathsep.join([str(Path("D:/A")), str(Path("F:/B"))])
    assert "TOKEN" not in os.environ
    assert hb.inject_env(overwrite=True) == ["HOOK", "NOTIFY", "PROJECT_NAME", "ROOTS"]
    assert os.environ["NOTIFY"] == "1"
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd python && uv run pytest tests/test_store.py tests/test_vars.py tests/test_api.py -q`
Expected: collection errors, `No module named 'hedgebuddy._store'` / `_vars`, and `module 'hedgebuddy' has no attribute 'var'`.

- [ ] **Step 4: Implement**

`python/hedgebuddy/_store.py`:
```python
"""Reading the data directory: the active profile, its variables, its secrets.

The library only reads these files; the Rust core is their only writer.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from ._errors import StorageCorruptedError, StorageNotFoundError
from ._values import TYPES

SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
VAR_NAME = re.compile(r"^[A-Z][A-Z0-9_]*$")


@dataclass(frozen=True)
class Variable:
    """One stored variable: its declared type, raw JSON value (``None`` when
    unset) and description."""

    name: str
    type: str
    raw: Any
    description: str


def _is_one(value: Any) -> bool:
    return type(value) is int and value == 1


def _read_json(path: Path) -> Any:
    """Parsed JSON of ``path``. ``FileNotFoundError`` passes through."""
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise
    except (OSError, UnicodeDecodeError) as e:
        raise StorageNotFoundError(f"cannot read {path}: {e}") from e
    try:
        return json.loads(text)
    except ValueError as e:
        raise StorageCorruptedError(f"{path} is not valid JSON: {e}") from e


def active_profile(root: Path) -> Optional[str]:
    """The active profile named in ``hedgebuddy.json``; ``None`` when the
    file is missing or names none."""
    path = root / "hedgebuddy.json"
    try:
        index = _read_json(path)
    except FileNotFoundError:
        return None
    if not isinstance(index, dict) or not _is_one(index.get("version")):
        raise StorageCorruptedError(f"{path} is not a version 1 HedgeBuddy index")
    name = index.get("active_profile")
    if name is None:
        return None
    if not isinstance(name, str) or not SLUG.match(name):
        raise StorageCorruptedError(f"{path} names an invalid profile {name!r}")
    return name


def resolve_profile(root: Path) -> str:
    """The active profile, or ``StorageNotFoundError`` when there is none."""
    name = active_profile(root)
    if name is None:
        raise StorageNotFoundError(
            f"no active HedgeBuddy profile in {root}; create one in the HedgeBuddy app "
            "or with `hedgebuddy call create_profile`"
        )
    return name


def profile_names(root: Path) -> List[str]:
    """Every folder under ``profiles/`` that holds a ``profile.json``, sorted (as core lists them)."""
    folder = root / "profiles"
    if not folder.is_dir():
        return []
    return sorted(p.name for p in folder.iterdir() if (p / "profile.json").is_file())


def load_variables(root: Path, profile: str) -> Dict[str, Variable]:
    """Every variable of ``profile``, with secret values merged in from ``secrets.json``."""
    if not SLUG.match(profile):
        raise StorageNotFoundError(f"{profile!r} is not a valid profile name")
    folder = root / "profiles" / profile
    path = folder / "profile.json"
    try:
        data = _read_json(path)
    except FileNotFoundError:
        raise StorageNotFoundError(f"profile '{profile}' does not exist ({path} is missing)") from None
    if not isinstance(data, dict) or not _is_one(data.get("version")) or not isinstance(data.get("variables"), dict):
        raise StorageCorruptedError(f"{path} is not a version 1 HedgeBuddy profile")
    secrets = _load_secrets(folder / "secrets.json")
    out: Dict[str, Variable] = {}
    for name, entry in data["variables"].items():
        if not VAR_NAME.match(name) or not isinstance(entry, dict) or entry.get("type") not in TYPES:
            raise StorageCorruptedError(f"{path}: variable {name!r} is not valid")
        ty = entry["type"]
        raw = secrets.get(name) if ty == "secret" else entry.get("value")
        description = entry.get("description", "")
        out[name] = Variable(name, ty, raw, description if isinstance(description, str) else "")
    return out


def _load_secrets(path: Path) -> Dict[str, Any]:
    try:
        data = _read_json(path)
    except FileNotFoundError:
        return {}
    if not isinstance(data, dict):
        raise StorageCorruptedError(f"{path} is not a JSON object")
    return data
```

`python/hedgebuddy/_vars.py`:
```python
"""The ``vars`` object scripts receive."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Dict, Iterator, List, Optional

from ._errors import VariableNotFoundError
from ._store import Variable
from ._values import convert


class Vars(Mapping):
    """Typed, read-only access to a profile's variables: ``vars.NAME`` or
    ``vars["NAME"]``. Values are converted on access, so one bad value only
    fails the script that reads it."""

    def __init__(self, variables: Mapping[str, Variable], profile: str, defaults: Optional[Mapping[str, Any]] = None) -> None:
        self._variables: Dict[str, Variable] = dict(variables)
        self._profile = profile
        self._defaults: Dict[str, Any] = dict(defaults or {})

    def __getitem__(self, name: str) -> Any:
        var = self._variables.get(name)
        if var is not None and var.raw is not None:
            return convert(name, var.type, var.raw)
        if name in self._defaults:
            return self._defaults[name]
        if var is not None:
            raise VariableNotFoundError(f"{name} has no value in profile '{self._profile}'")
        raise VariableNotFoundError(f"{name} is not set in profile '{self._profile}'")

    def __getattr__(self, name: str) -> Any:
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]

    def __contains__(self, name: object) -> bool:
        if not isinstance(name, str):
            return False
        var = self._variables.get(name)
        return (var is not None and var.raw is not None) or name in self._defaults

    def __iter__(self) -> Iterator[str]:
        names = {n for n, v in self._variables.items() if v.raw is not None} | set(self._defaults)
        return iter(sorted(names))

    def __len__(self) -> int:
        return sum(1 for _ in self)

    def __dir__(self) -> List[str]:
        return sorted(set(super().__dir__()) | set(self))

    def __repr__(self) -> str:
        return f"Vars(profile={self._profile!r}, names={list(self)!r})"
```

`python/hedgebuddy/_api.py`:
```python
"""Module-level helpers that read the active profile directly."""

from __future__ import annotations

import os
from typing import Any, Dict, List

from ._errors import VariableNotFoundError
from ._paths import data_dir
from ._store import load_variables, resolve_profile
from ._values import to_env
from ._vars import Vars

_MISSING = object()


def _current() -> Vars:
    root = data_dir()
    profile = resolve_profile(root)
    return Vars(load_variables(root, profile), profile)


def var(name: str, default: Any = _MISSING) -> Any:
    """One variable of the active profile, typed. ``default`` is returned only
    when the variable is missing; storage errors are always raised."""
    try:
        return _current()[name]
    except VariableNotFoundError:
        if default is _MISSING:
            raise
        return default


def exists(name: str) -> bool:
    """Whether the active profile has a value for ``name``."""
    return name in _current()


def all_vars() -> Dict[str, Any]:
    """Every variable of the active profile that has a value, typed."""
    values = _current()
    return {name: values[name] for name in values}


def inject_env(overwrite: bool = False) -> List[str]:
    """Copy every variable into ``os.environ`` as a string (bools as 1/0,
    lists joined with ``os.pathsep``). Existing environment variables are
    kept unless ``overwrite``. Returns the names set, sorted."""
    names = []
    for name, value in all_vars().items():
        if overwrite or name not in os.environ:
            os.environ[name] = to_env(value)
            names.append(name)
    return names
```

In `python/hedgebuddy/__init__.py` add `from ._api import all_vars, exists, inject_env, var` and `from ._vars import Vars` above the `_errors` import, and add `"Vars"`, `"all_vars"`, `"exists"`, `"inject_env"`, `"var"` to `__all__` (keep the list sorted: capitalised names first, then `__version__`, then lowercase).

- [ ] **Step 5: Run the tests**

Run: `cd python && uv run pytest -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add python
git commit -m "feat(python): read the active profile: typed vars, var/exists/all_vars/inject_env

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Script manifests and the conformance fixtures

**Files:**
- Create: `python/hedgebuddy/_manifest.py`, `python/tests/test_manifest.py`, `python/tests/test_fixtures.py`
- Modify: `python/tests/test_schema_conformance.py`

**Interfaces:**
- Consumes: `_errors.ManifestError`, `VariableTypeError`, `_values.TYPES`, `convert` (Task 1); `_store.active_profile`, `load_variables`, `profile_names` and `tests.helpers.SCHEMA_ROOT` (Task 2).
- Produces:
  - `Requirement(type: str, description: str = "", default: Any = <no default>)` with `.has_default`.
  - `Manifest(app: Optional[str] = None, event: Optional[str] = None, requires: Dict[str, Requirement] = {})`.
  - `RequirementIssue(kind: str, name: str, expected: str, actual: Optional[str] = None)`, where `kind` is `"missing"` or `"type_mismatch"`.
  - `extract_manifest_text(source: str) -> Optional[str]`.
  - `parse_manifest(source: str) -> Optional[Manifest]`, which raises `ManifestError`.
  - `check_requirements(manifest: Manifest, declared: Mapping[str, str]) -> List[RequirementIssue]`, sorted by name.

- [ ] **Step 1: Write the failing tests**

`python/tests/test_manifest.py`:
```python
import pytest

from hedgebuddy._errors import ManifestError
from hedgebuddy._manifest import Requirement, RequirementIssue, check_requirements, extract_manifest_text, parse_manifest
from tests.helpers import SCHEMA_ROOT

SCRIPTS = SCHEMA_ROOT / "fixtures" / "valid" / "basic" / "profiles" / "commercial-one-day" / "scripts"


def manifest(text: str) -> str:
    return f'"""\n{text}\n---\nProse.\n"""\n'


def test_fixture_manifests_parse():
    m = parse_manifest((SCRIPTS / "on_copy_complete.py").read_text(encoding="utf-8"))
    assert m.app == "offshoot"
    assert m.event == "FileCopyCompleted"
    assert m.requires["SLACK_WEBHOOK"] == Requirement("secret", "Incoming webhook URL")
    assert not m.requires["SLACK_WEBHOOK"].has_default
    assert m.requires["PROJECT_NAME"].default == "Untitled"
    d = parse_manifest((SCRIPTS / "on_disk_added.py").read_text(encoding="utf-8"))
    assert d.event == "DiskAdded"
    assert d.requires["NOTIFY"].default is True


@pytest.mark.parametrize(
    "source",
    [
        "print('x')\n",
        '"""Just prose."""\n',
        "# comment\nx = 1\n",
        '"""\n{"hedgebuddy": 1}\n',  # docstring never closed
        "x = '''{\"hedgebuddy\": 1}'''\n",  # first statement is not a docstring
    ],
)
def test_no_manifest(source):
    assert parse_manifest(source) is None


def test_extraction_follows_the_shared_rules():
    source = "\ufeff# comment\n\n'''\n{\"hedgebuddy\": 1}\n---   \nprose\n'''\n"
    assert extract_manifest_text(source) == '\n{"hedgebuddy": 1}'
    crlf = '"""\r\n{"hedgebuddy": 1}\r\n---\r\n"""\r\n'
    assert extract_manifest_text(crlf) == '\n{"hedgebuddy": 1}'


def test_optional_app_and_event():
    m = parse_manifest(manifest('{"hedgebuddy": 1}'))
    assert m.app is None and m.event is None and m.requires == {}


@pytest.mark.parametrize(
    "text,message",
    [
        ("{not json", "not valid JSON"),
        ('{"hedgebuddy": 2}', "unsupported manifest version"),
        ('{"hedgebuddy": true}', "unsupported manifest version"),
        ('{"app": "offshoot"}', "unsupported manifest version"),
        ('{"hedgebuddy": 1, "event": "DiskAdded"}', "'event' requires 'app'"),
        ('{"hedgebuddy": 1, "app": 3}', "'app' must be a string"),
        ('{"hedgebuddy": 1, "color": "red"}', "unknown manifest field"),
        ('{"hedgebuddy": 1, "requires": []}', "'requires' must be an object"),
        ('{"hedgebuddy": 1, "requires": {"lower": {"type": "string"}}}', "UPPER_SNAKE_CASE"),
        ('{"hedgebuddy": 1, "requires": {"X": "string"}}', "requirement X must be an object"),
        ('{"hedgebuddy": 1, "requires": {"X": {"type": "date"}}}', "unknown type"),
        ('{"hedgebuddy": 1, "requires": {"X": {"type": "string", "optional": true}}}', "unknown field"),
        ('{"hedgebuddy": 1, "requires": {"X": {"type": "string", "description": 3}}}', "description"),
        ('{"hedgebuddy": 1, "requires": {"X": {"type": "int", "default": "3"}}}', "default for X"),
    ],
)
def test_invalid_manifests(text, message):
    with pytest.raises(ManifestError, match=message):
        parse_manifest(manifest(text))


def test_defaults_are_converted_to_their_type():
    m = parse_manifest(manifest('{"hedgebuddy": 1, "requires": {"ROOT": {"type": "path", "default": "D:/A"}}}'))
    assert str(m.requires["ROOT"].default).replace("\\", "/") == "D:/A"


def test_check_requirements():
    m = parse_manifest(
        manifest(
            '{"hedgebuddy": 1, "requires": {"B": {"type": "int"}, "A": {"type": "string"},'
            ' "C": {"type": "bool", "default": false}, "D": {"type": "path"}}}'
        )
    )
    assert check_requirements(m, {"A": "string", "B": "string"}) == [
        RequirementIssue("type_mismatch", "B", "int", "string"),
        RequirementIssue("missing", "D", "path"),
    ]
```

`python/tests/test_fixtures.py`:
```python
"""Loads every schema/fixtures/valid/<case> with the library and compares it
with that case's expected.json (the Rust core asserts the same file in
crates/core/tests/store_fixture.rs)."""

import json

import pytest

from hedgebuddy._manifest import check_requirements, parse_manifest
from hedgebuddy._store import active_profile, load_variables, profile_names
from tests.helpers import SCHEMA_ROOT


def cases():
    return sorted(p for p in (SCHEMA_ROOT / "fixtures" / "valid").iterdir() if p.is_dir())


def summarize_runs(root):
    runs = {}
    folder = root / "runs"
    for path in sorted(folder.glob("*.jsonl")) if folder.is_dir() else []:
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except ValueError:
                continue
            run_id = record.get("run_id")
            if record.get("phase") == "start":
                runs.setdefault(
                    run_id,
                    {"run_id": run_id, "script": record["script"], "status": None, "log_count": 0, "ts": record["ts"]},
                )
            elif run_id in runs and record.get("phase") == "log":
                runs[run_id]["log_count"] += 1
            elif run_id in runs and record.get("phase") == "end":
                runs[run_id]["status"] = record["status"]
    # Core orders by run id, then stably by start time, newest first.
    ordered = sorted(runs.values(), key=lambda r: r["run_id"])
    ordered.sort(key=lambda r: r["ts"], reverse=True)
    return [{k: v for k, v in r.items() if k != "ts"} for r in ordered]


def summarize(root):
    profiles = {}
    for name in profile_names(root):
        variables = load_variables(root, name)
        types = {n: v.type for n, v in variables.items()}
        scripts = {}
        for script in sorted((root / "profiles" / name / "scripts").glob("*.py")):
            m = parse_manifest(script.read_text(encoding="utf-8"))
            assert m is not None, f"{script} should carry a manifest"
            scripts[script.name] = {
                "app": m.app,
                "event": m.event,
                "requires": sorted(m.requires),
                "unmet": [issue.name for issue in check_requirements(m, types)],
            }
        profiles[name] = {
            "variable_count": len(variables),
            "types": types,
            "secret_names": sorted(n for n, v in variables.items() if v.type == "secret"),
            "scripts": scripts,
        }
    return {"active_profile": active_profile(root), "profiles": profiles, "runs": summarize_runs(root)}


def test_there_are_fixture_cases():
    assert len(cases()) >= 2


@pytest.mark.parametrize("case", cases(), ids=lambda p: p.name)
def test_fixture_matches_expected_json(case):
    expected = json.loads((case / "expected.json").read_text(encoding="utf-8"))
    assert summarize(case) == expected
```

In `python/tests/test_schema_conformance.py`, delete the local `extract_manifest` function and its docstring. Import `from hedgebuddy._manifest import extract_manifest_text` and replace the call inside `test_valid_fixture_data_dir_validates` with:
```python
            text = extract_manifest_text(script.read_text(encoding="utf-8"))
            if text is not None:
                assert_valid(manifest, json.loads(text.strip()), str(script))
```
and change the module docstring's last sentence to "Manifest extraction is the library's own `extract_manifest_text`."

- [ ] **Step 2: Run them to see them fail**

Run: `cd python && uv run pytest tests/test_manifest.py tests/test_fixtures.py tests/test_schema_conformance.py -q`
Expected: collection errors, `No module named 'hedgebuddy._manifest'`.

- [ ] **Step 3: Implement**

`python/hedgebuddy/_manifest.py`:
```python
"""The JSON manifest at the top of a script's module docstring (spec section 6).

Extraction matches schema/README.md and core's ``extract_manifest_text``.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional

from ._errors import ManifestError, VariableTypeError
from ._values import TYPES, convert

VAR_NAME = re.compile(r"^[A-Z][A-Z0-9_]*$")
_FIELDS = {"hedgebuddy", "app", "event", "requires"}
_REQUIREMENT_FIELDS = {"type", "description", "default"}


class _NoDefault:
    def __repr__(self) -> str:
        return "<no default>"


NO_DEFAULT: Any = _NoDefault()


@dataclass(frozen=True)
class Requirement:
    """One ``requires`` entry. ``default`` is already converted to its type."""

    type: str
    description: str = ""
    default: Any = NO_DEFAULT

    @property
    def has_default(self) -> bool:
        return self.default is not NO_DEFAULT


@dataclass(frozen=True)
class Manifest:
    """A parsed manifest."""

    app: Optional[str] = None
    event: Optional[str] = None
    requires: Dict[str, Requirement] = field(default_factory=dict)


@dataclass(frozen=True)
class RequirementIssue:
    """A requirement the profile does not satisfy: ``missing`` or ``type_mismatch``."""

    kind: str
    name: str
    expected: str
    actual: Optional[str] = None


def _lines(text: str) -> List[str]:
    """Split like Rust's ``str::lines``: on ``\\n``, dropping a trailing ``\\r``
    per line and the empty piece after a final newline."""
    parts = text.split("\n")
    if parts and parts[-1] == "":
        parts.pop()
    return [p[:-1] if p.endswith("\r") else p for p in parts]


def extract_manifest_text(source: str) -> Optional[str]:
    """The text before the ``---`` line of the module docstring, when that
    docstring starts with ``{``; ``None`` when the script has no manifest."""
    if source.startswith("\ufeff"):
        source = source[1:]
    lines = _lines(source)
    i = 0
    while i < len(lines) and (lines[i].strip() == "" or lines[i].lstrip().startswith("#")):
        i += 1
    body = "\n".join(lines[i:])
    head = body.lstrip()
    if head.startswith('"""'):
        quote = '"""'
    elif head.startswith("'''"):
        quote = "'''"
    else:
        return None
    start = body.index(quote) + len(quote)
    end = body.find(quote, start)
    if end < 0:
        return None
    doc = body[start:end]
    if not doc.lstrip().startswith("{"):
        return None
    kept = []
    for line in _lines(doc):
        if line.rstrip() == "---":
            break
        kept.append(line)
    return "\n".join(kept)


def parse_manifest(source: str) -> Optional[Manifest]:
    """The script's manifest; ``None`` without one; ``ManifestError`` when invalid."""
    text = extract_manifest_text(source)
    if text is None:
        return None
    try:
        data = json.loads(text.strip())
    except ValueError as e:
        raise ManifestError(f"the manifest is not valid JSON: {e}") from e
    if not isinstance(data, dict):
        raise ManifestError("the manifest must be a JSON object")
    unknown = sorted(set(data) - _FIELDS)
    if unknown:
        raise ManifestError(f"unknown manifest field(s): {', '.join(unknown)}")
    version = data.get("hedgebuddy")
    if type(version) is not int or version != 1:
        raise ManifestError(f"unsupported manifest version {version!r} (expected 1)")
    app, event = data.get("app"), data.get("event")
    for key, value in (("app", app), ("event", event)):
        if value is not None and not isinstance(value, str):
            raise ManifestError(f"'{key}' must be a string")
    if event is not None and app is None:
        raise ManifestError("'event' requires 'app'")
    raw_requires = data.get("requires", {})
    if not isinstance(raw_requires, dict):
        raise ManifestError("'requires' must be an object")
    requires: Dict[str, Requirement] = {}
    for name, spec in raw_requires.items():
        if not VAR_NAME.match(name):
            raise ManifestError(f"requirement name {name!r} must be UPPER_SNAKE_CASE")
        if not isinstance(spec, dict):
            raise ManifestError(f"requirement {name} must be an object")
        extra = sorted(set(spec) - _REQUIREMENT_FIELDS)
        if extra:
            raise ManifestError(f"requirement {name} has unknown field(s): {', '.join(extra)}")
        ty = spec.get("type")
        if ty not in TYPES:
            raise ManifestError(f"requirement {name} has unknown type {ty!r}")
        description = spec.get("description", "")
        if not isinstance(description, str):
            raise ManifestError(f"requirement {name}: description must be a string")
        default = NO_DEFAULT
        if "default" in spec:
            try:
                default = convert(name, ty, spec["default"])
            except VariableTypeError as e:
                raise ManifestError(f"default for {name}: {e}") from e
        requires[name] = Requirement(ty, description, default)
    return Manifest(app, event, requires)


def check_requirements(manifest: Manifest, declared: Mapping[str, str]) -> List[RequirementIssue]:
    """Requirements not satisfied by ``declared`` (variable name to type),
    sorted by name. A requirement with a default is satisfied when absent."""
    issues = []
    for name in sorted(manifest.requires):
        req = manifest.requires[name]
        actual = declared.get(name)
        if actual == req.type:
            continue
        if actual is not None:
            issues.append(RequirementIssue("type_mismatch", name, req.type, actual))
        elif not req.has_default:
            issues.append(RequirementIssue("missing", name, req.type))
    return issues
```

- [ ] **Step 4: Run the tests**

Run: `cd python && uv run pytest -q`
Expected: all pass (the `basic` and `empty` fixture cases match `expected.json`).

- [ ] **Step 5: Commit**

```bash
git add python
git commit -m "feat(python): script manifests, requirement checks, and expected.json conformance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The event payload

**Files:**
- Create: `python/hedgebuddy/_event.py`, `python/tests/test_event.py`
- Modify: `python/hedgebuddy/__init__.py`

**Interfaces:**
- Consumes: `_manifest.Manifest` (Task 3, used only in type hints).
- Produces:
  - `Event(raw: Mapping[str, Any], name: Optional[str] = None, app: Optional[str] = None)`.
    - Attributes: `.raw`, `.app`, `.name`.
    - Access: attribute access to fields, `event["key"]`, `key in event`, iteration over field names, `len()`, and `.get(key, default=None)`.
  - `parse_event(argv: Sequence[str], manifest: Optional[Manifest] = None) -> Event`, which raises `ValueError`.
  - The public name `Event`.

- [ ] **Step 1: Write the failing tests**

`python/tests/test_event.py`:
```python
import json

import pytest

import hedgebuddy as hb
from hedgebuddy._event import parse_event
from hedgebuddy._manifest import Manifest

COPY = {
    "FileCopyCompleted_state": "Success",
    "FileCopyCompleted_destinationPath": "D:/Offload/A003",
    "FileCopyCompleted_sourceInfo": '{"label": "A003", "clips": 12}',
    "FileCopyCompleted_sourcePaths": '["E:/A003"]',
    "FileCopyCompleted_verification_mode": "checksum",
    "FileCopyCompleted_presetName": "{not json",
}


def test_prefix_is_stripped_and_json_fields_decoded():
    event = hb.Event(COPY, name="FileCopyCompleted", app="offshoot")
    assert event.state == "Success"
    assert event.destinationPath == "D:/Offload/A003"
    assert event.sourceInfo == {"label": "A003", "clips": 12}
    assert event.sourcePaths == ["E:/A003"]
    assert event.verification_mode == "checksum"
    assert event.presetName == "{not json"  # starts with { but is not JSON: kept as text
    assert event.raw == COPY
    assert event.app == "offshoot"
    assert event.name == "FileCopyCompleted"


def test_name_is_inferred_from_a_shared_key_prefix():
    event = hb.Event({"DiskAdded_title": "A003", "DiskAdded_rootFilePath": "/Volumes/A003"})
    assert event.name == "DiskAdded"
    assert event.app is None
    assert event.title == "A003"


def test_no_shared_prefix_means_no_name_and_keys_as_given():
    event = hb.Event({"transferType": "copy", "addedAt": "now"})
    assert event.name is None
    assert event.transferType == "copy"
    assert hb.Event({}).name is None


def test_unprefixed_keys_stay_as_given_under_a_manifest_name():
    event = hb.Event({"transferType": "copy", "transferGroups": "[1, 2]"}, name="TransfersAdded")
    assert event.transferType == "copy"
    assert event.transferGroups == [1, 2]


def test_fields_that_collide_with_event_attributes_use_item_access():
    event = hb.Event({"SourceAdded_name": "A003", "SourceAdded_paths": '["E:/"]'}, name="SourceAdded")
    assert event.name == "SourceAdded"
    assert event["name"] == "A003"
    assert event.paths == ["E:/"]


def test_mapping_style_access():
    event = hb.Event(COPY, name="FileCopyCompleted")
    assert "state" in event
    assert "nope" not in event
    assert event.get("nope", 5) == 5
    assert len(event) == len(COPY)
    assert sorted(event) == sorted(["state", "destinationPath", "sourceInfo", "sourcePaths", "verification_mode", "presetName"])
    with pytest.raises(KeyError):
        event["nope"]


def test_a_missing_field_names_the_available_ones():
    event = hb.Event({"DiskIdle_title": "A003"})
    with pytest.raises(AttributeError, match="DiskIdle has no field 'state'; fields: title"):
        event.state
    with pytest.raises(AttributeError):
        event._private


def test_parse_event_uses_argv_and_the_manifest():
    manifest = Manifest(app="offshoot", event="FileCopyCompleted")
    event = parse_event(["script.py", json.dumps(COPY)], manifest)
    assert event.app == "offshoot"
    assert event.state == "Success"


@pytest.mark.parametrize("argv", [["script.py"], ["script.py", ""], ["script.py", "   "]])
def test_no_payload_is_an_empty_event(argv):
    event = parse_event(argv, Manifest(app="offshoot", event="OffShootStarted"))
    assert len(event) == 0
    assert event.name == "OffShootStarted"


@pytest.mark.parametrize("payload,message", [("not json", "is not JSON"), ("[1, 2]", "must be a JSON object")])
def test_bad_payloads(payload, message):
    with pytest.raises(ValueError, match=message):
        parse_event(["script.py", payload])
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd python && uv run pytest tests/test_event.py -q`
Expected: `No module named 'hedgebuddy._event'`.

- [ ] **Step 3: Implement**

`python/hedgebuddy/_event.py`:
```python
"""The event payload Hedge apps pass to scripts as JSON in ``sys.argv[1]``."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, Dict, Iterator, Mapping, Optional, Sequence

if TYPE_CHECKING:
    from ._manifest import Manifest


def _decode(value: Any) -> Any:
    """A string holding a JSON object or array is decoded; anything else is kept."""
    if isinstance(value, str) and value.lstrip()[:1] in ("{", "["):
        try:
            decoded = json.loads(value)
        except ValueError:
            return value
        if isinstance(decoded, (dict, list)):
            return decoded
    return value


def _infer_name(raw: Mapping[str, Any]) -> Optional[str]:
    """The event name when every key starts with the same ``<Name>_`` prefix."""
    prefixes = set()
    for key in raw:
        head, sep, _ = key.partition("_")
        if not sep or not head:
            return None
        prefixes.add(head)
    return prefixes.pop() if len(prefixes) == 1 else None


class Event:
    """One Hedge app event.

    Fields are the payload keys without their ``<EventName>_`` prefix, read as
    attributes (``event.state``) or items (``event["state"]``). String values
    holding a JSON object or array are decoded. ``raw`` is the original
    payload; ``app`` and ``name`` come from the script's manifest, or ``name``
    from the key prefix when there is no manifest. A field named like one of
    those attributes (``raw``, ``app``, ``name``, ``get``) is read with
    ``event["name"]``.
    """

    def __init__(self, raw: Mapping[str, Any], name: Optional[str] = None, app: Optional[str] = None) -> None:
        self.raw: Dict[str, Any] = dict(raw)
        self.app = app
        self.name = name if name is not None else _infer_name(self.raw)
        prefix = f"{self.name}_" if self.name else ""
        fields: Dict[str, Any] = {}
        for key, value in self.raw.items():
            short = key[len(prefix):] if prefix and key.startswith(prefix) and len(key) > len(prefix) else key
            fields[short] = _decode(value)
        self._fields = fields

    def __getattr__(self, attr: str) -> Any:
        if attr.startswith("_"):
            raise AttributeError(attr)
        try:
            return self._fields[attr]
        except KeyError:
            available = ", ".join(sorted(self._fields)) or "none"
            raise AttributeError(f"{self.name or 'the event'} has no field {attr!r}; fields: {available}") from None

    def __getitem__(self, key: str) -> Any:
        return self._fields[key]

    def __contains__(self, key: object) -> bool:
        return key in self._fields

    def __iter__(self) -> Iterator[str]:
        return iter(self._fields)

    def __len__(self) -> int:
        return len(self._fields)

    def get(self, key: str, default: Any = None) -> Any:
        """A field, or ``default`` when the payload does not have it."""
        return self._fields.get(key, default)

    def __repr__(self) -> str:
        return f"Event(app={self.app!r}, name={self.name!r}, fields={sorted(self._fields)!r})"


def parse_event(argv: Sequence[str], manifest: Optional[Manifest] = None) -> Event:
    """The event in ``argv[1]``. A missing or blank argument is an empty payload."""
    text = argv[1] if len(argv) > 1 else ""
    if text.strip():
        try:
            raw = json.loads(text)
        except ValueError as e:
            raise ValueError(f"the event payload in sys.argv[1] is not JSON: {e}") from e
        if not isinstance(raw, dict):
            raise ValueError("the event payload in sys.argv[1] must be a JSON object")
    else:
        raw = {}
    return Event(raw, name=manifest.event if manifest else None, app=manifest.app if manifest else None)
```

In `python/hedgebuddy/__init__.py` add `from ._event import Event` and `"Event"` to `__all__`.

- [ ] **Step 4: Run the tests**

Run: `cd python && uv run pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add python
git commit -m "feat(python): the event payload with prefix stripping and JSON field decoding

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Run records and `hb.log`

**Files:**
- Create: `python/hedgebuddy/_lock.py`, `python/hedgebuddy/_runs.py`, `python/tests/test_runs.py`
- Modify: `python/tests/helpers.py`, `python/hedgebuddy/__init__.py`

**Interfaces:**
- Consumes: `tests.helpers.SCHEMA_ROOT` (Task 2).
- Produces:
  - `_lock.locked(f)`, a context manager giving an exclusive lock on a binary file opened with `"ab"`.
  - `_runs.new_run_id() -> str`, a 26-character ULID.
  - `_runs.utc_timestamp(now: Optional[datetime] = None) -> str`.
  - `_runs.RunLog(root: Path, run_id: Optional[str] = None, day: Optional[str] = None)`, with methods `.start(*, script, profile, app=None, event=None)`, `.log(message)` and `.end(status, exit_code, traceback=None)`, and attributes `.run_id` and `.path`.
  - `_runs.set_current(run: Optional[RunLog])`.
  - `log(message)`, re-exported as `hb.log`.
  - `tests/helpers.py`: `run_lines(root) -> List[dict]` and `validate_run_record(record)`.

- [ ] **Step 1: Helpers**

Append to `python/tests/helpers.py`:
```python
def run_lines(root: Path) -> list:
    """Every record in root/runs/*.jsonl, file by file, in order."""
    records = []
    folder = root / "runs"
    for path in sorted(folder.glob("*.jsonl")) if folder.is_dir() else []:
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                records.append(json.loads(line))
    return records


def validate_run_record(record: dict) -> None:
    """Fail unless ``record`` validates against schema/run-record.schema.json."""
    from jsonschema import Draft202012Validator

    schema = json.loads((SCHEMA_ROOT / "run-record.schema.json").read_text(encoding="utf-8"))
    errors = [e.message for e in Draft202012Validator(schema).iter_errors(record)]
    assert not errors, f"{record} is not a valid run record: {errors}"
```

- [ ] **Step 2: Write the failing tests**

`python/tests/test_runs.py`:
```python
import datetime
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import hedgebuddy as hb
from hedgebuddy import _runs
from hedgebuddy._runs import RunLog, new_run_id, set_current, utc_timestamp
from tests.helpers import run_lines, validate_run_record

PACKAGE_ROOT = Path(__file__).resolve().parents[1]


def test_run_ids_are_ulids_that_sort_by_time():
    first = new_run_id()
    time.sleep(0.005)
    second = new_run_id()
    assert re.fullmatch(r"[0-9A-HJKMNP-TV-Z]{26}", first)
    assert first != second
    assert first[:10] < second[:10]


def test_timestamps_are_utc_with_milliseconds():
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", utc_timestamp())
    moment = datetime.datetime(2026, 9, 15, 18, 23, 47, 123456, tzinfo=datetime.timezone.utc)
    assert utc_timestamp(moment) == "2026-09-15T18:23:47.123Z"


def test_a_run_writes_start_log_and_end_records(hb_root):
    run = RunLog(hb_root)
    assert run.path == hb_root / "runs" / f"{datetime.date.today().isoformat()}.jsonl"
    run.start(script="on_copy.py", profile="p", app="offshoot", event="FileCopyCompleted")
    run.log("posted to slack ✓")
    run.end("error", 1, traceback="Traceback ...")
    records = run_lines(hb_root)
    assert [r["phase"] for r in records] == ["start", "log", "end"]
    assert {r["run_id"] for r in records} == {run.run_id}
    assert records[0]["app"] == "offshoot" and records[0]["event"] == "FileCopyCompleted"
    assert records[0]["script"] == "on_copy.py" and records[0]["profile"] == "p"
    assert records[1]["message"] == "posted to slack ✓"
    assert records[2] == {"ts": records[2]["ts"], "run_id": run.run_id, "phase": "end", "status": "error", "exit_code": 1, "traceback": "Traceback ..."}
    for record in records:
        validate_run_record(record)
    assert run.path.read_bytes().isascii()  # ensure_ascii keeps every line plain ASCII


def test_start_without_app_and_event_omits_them(hb_root):
    run = RunLog(hb_root, run_id="R1", day="2026-01-01")
    run.start(script="a.py", profile="p")
    record = run_lines(hb_root)[0]
    assert "app" not in record and "event" not in record
    assert run.path.name == "2026-01-01.jsonl"


def test_write_failures_warn_once_and_never_raise(tmp_path, capsys):
    blocker = tmp_path / "not-a-folder"
    blocker.write_text("x", encoding="utf-8")
    run = RunLog(blocker)  # runs/ would have to live inside a file
    run.start(script="a.py", profile="p")
    run.log("m")
    run.end("ok", 0)
    assert capsys.readouterr().err.count("cannot write the run record") == 1


def test_log_prints_when_no_run_is_open(capsys):
    hb.log("hello")
    assert capsys.readouterr().out == "hello\n"


def test_log_appends_to_the_current_run(hb_root, capsys):
    run = RunLog(hb_root, run_id="R1", day="2026-01-01")
    set_current(run)
    try:
        hb.log(42)
    finally:
        set_current(None)
    assert capsys.readouterr().out == ""
    assert run_lines(hb_root)[-1]["message"] == "42"
    assert _runs._current is None


WRITER = (
    "import sys\n"
    "from pathlib import Path\n"
    "from hedgebuddy._runs import RunLog\n"
    "run = RunLog(Path(sys.argv[1]), run_id=sys.argv[2], day='2026-01-01')\n"
    "for i in range(int(sys.argv[3])):\n"
    "    run.log('x' * 300 + str(i))\n"
)


def test_parallel_writers_never_interleave_lines(hb_root):
    env = dict(os.environ, PYTHONPATH=str(PACKAGE_ROOT))
    procs = [
        subprocess.Popen([sys.executable, "-c", WRITER, str(hb_root), f"R{n}", "100"], env=env)
        for n in range(4)
    ]
    for proc in procs:
        assert proc.wait(timeout=120) == 0
    records = run_lines(hb_root)  # json.loads fails on any interleaved line
    assert len(records) == 400
    assert sorted({r["run_id"] for r in records}) == ["R0", "R1", "R2", "R3"]
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd python && uv run pytest tests/test_runs.py -q`
Expected: `No module named 'hedgebuddy._runs'`.

- [ ] **Step 4: Implement**

`python/hedgebuddy/_lock.py`:
```python
"""An exclusive lock on an open file, so parallel scripts do not interleave run records."""

from __future__ import annotations

import os
import time
from contextlib import contextmanager
from typing import BinaryIO, Iterator


@contextmanager
def locked(f: BinaryIO) -> Iterator[None]:
    """Hold an exclusive lock on ``f`` (a binary file opened with ``"ab"``).

    Windows locks the first byte with ``msvcrt.locking``, retrying every
    10 ms for up to ten seconds before raising ``OSError`` (``LK_LOCK``'s own
    retry waits a whole second); writes in append mode still go to the end of
    the file. macOS uses ``flock``.
    """
    if os.name == "nt":
        import msvcrt

        f.seek(0)
        deadline = time.monotonic() + 10
        while True:
            try:
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
                break
            except OSError:
                if time.monotonic() > deadline:
                    raise
                time.sleep(0.01)
        try:
            yield
        finally:
            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        import fcntl

        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
```

`python/hedgebuddy/_runs.py`:
```python
"""Run records: one JSON line per event in ``runs/<local date>.jsonl``."""

from __future__ import annotations

import datetime
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional

from ._lock import locked

_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def new_run_id() -> str:
    """A ULID: 48 bits of milliseconds then 80 random bits, Crockford base32."""
    value = (int(time.time() * 1000) << 80) | int.from_bytes(os.urandom(10), "big")
    chars = []
    for _ in range(26):
        chars.append(_CROCKFORD[value & 31])
        value >>= 5
    return "".join(reversed(chars))


def utc_timestamp(now: Optional[datetime.datetime] = None) -> str:
    """``2026-09-15T18:23:47.123Z``."""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


class RunLog:
    """Appends one run's records to ``runs/<local date at start>.jsonl``.

    A record that cannot be written is reported once on stderr; the script
    itself never fails because of its run record.
    """

    def __init__(self, root: Path, run_id: Optional[str] = None, day: Optional[str] = None) -> None:
        self.run_id = run_id or new_run_id()
        self.path = root / "runs" / f"{day or datetime.date.today().isoformat()}.jsonl"
        self._failed = False

    def start(self, *, script: str, profile: str, app: Optional[str] = None, event: Optional[str] = None) -> None:
        record: Dict[str, Any] = {"ts": utc_timestamp(), "run_id": self.run_id, "phase": "start"}
        if app is not None:
            record["app"] = app
        if event is not None:
            record["event"] = event
        record["script"] = script
        record["profile"] = profile
        self._write(record)

    def log(self, message: str) -> None:
        self._write({"ts": utc_timestamp(), "run_id": self.run_id, "phase": "log", "message": message})

    def end(self, status: str, exit_code: int, traceback: Optional[str] = None) -> None:
        record: Dict[str, Any] = {
            "ts": utc_timestamp(),
            "run_id": self.run_id,
            "phase": "end",
            "status": status,
            "exit_code": exit_code,
        }
        if traceback is not None:
            record["traceback"] = traceback
        self._write(record)

    def _write(self, record: Dict[str, Any]) -> None:
        if self._failed:
            return
        line = (json.dumps(record, ensure_ascii=True) + "\n").encode("ascii")
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.path, "ab") as f:
                with locked(f):
                    f.write(line)
                    f.flush()
        except OSError as e:
            self._failed = True
            print(f"hedgebuddy: cannot write the run record to {self.path}: {e}", file=sys.stderr)


_current: Optional[RunLog] = None


def set_current(run: Optional[RunLog]) -> None:
    """Make ``run`` the run ``log()`` appends to (``None`` closes it)."""
    global _current
    _current = run


def log(message: Any) -> None:
    """Append ``message`` to the current run record; print it when no run is open."""
    text = str(message)
    if _current is None:
        print(text)
    else:
        _current.log(text)
```

In `python/hedgebuddy/__init__.py` add `from ._runs import log` and `"log"` to `__all__`.

- [ ] **Step 5: Run the tests**

Run: `cd python && uv run pytest -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add python
git commit -m "feat(python): locked run records and hb.log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `@hb.script` and `hb.event()`

**Files:**
- Create: `python/hedgebuddy/_script.py`, `python/tests/test_script.py`
- Modify: `python/hedgebuddy/__init__.py`

**Interfaces:**
- Consumes:
  - From Tasks 1-5: `_paths.data_dir`, `_store.load_variables`, `resolve_profile`, `_vars.Vars`, `_manifest.parse_manifest`, `check_requirements`, `_values.convert`, `_event.parse_event`, `_runs.RunLog`, `set_current`, and the errors.
  - From the test helpers: `write_profile`, `run_lines`, `validate_run_record`.
- Produces:
  - `script(func)`, the decorator.
  - `event(argv: Optional[Sequence[str]] = None) -> Event`.
  - `_script.run(func, *, source_path: Optional[str], argv: Sequence[str]) -> int`.
  - `_script.read_manifest(source_path: Optional[str]) -> Optional[Manifest]`.
- Behaviour of `run`:
  1. Resolve the data directory and the active profile. On failure, print `hedgebuddy: <error>` to stderr and return 1 without writing a record.
  2. Parse the manifest from `source_path`. Keep any error for step 4.
  3. Write the `start` record, with `app` and `event` from the manifest when it parsed, and make the run current.
  4. Raise the manifest error, if any, then load the variables. With a manifest:
     - Missing required variables raise `VariableNotFoundError` naming all of them. A variable declared without a value counts as missing.
     - Type mismatches raise `VariableTypeError`.
     - Each required variable that is set is converted, so a bad stored value fails now.
  5. Build `Vars`, with manifest defaults for absent optional variables. Parse the event. Call `func(event, vars)`.
  6. Work out the exit code:
     - `None` gives 0.
     - An `int` (including `bool`) gives `int(value)`.
     - Any other return value raises `TypeError`.
     - `SystemExit.code` follows the same rules, except that a non-integer code is printed to stderr and gives 1.
  7. On any other exception, write the traceback to stderr, write `end(error, 1, traceback)`, and return 1. Otherwise write `end("ok" if code == 0 else "failed", code)` and return the code. The current run is cleared in every case.

- [ ] **Step 1: Write the failing tests**

`python/tests/test_script.py`:
```python
import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

import hedgebuddy as hb
from hedgebuddy import _runs
from hedgebuddy._script import run
from tests.helpers import run_lines, validate_run_record, write_profile

PACKAGE_ROOT = Path(__file__).resolve().parents[1]

MANIFEST = (
    '"""\n'
    '{"hedgebuddy": 1, "app": "offshoot", "event": "FileCopyCompleted",\n'
    ' "requires": {"HOOK": {"type": "secret"}, "PROJECT_NAME": {"type": "string", "default": "Untitled"}}}\n'
    "---\n"
    "Test script.\n"
    '"""\n'
)
PAYLOAD = json.dumps(
    {
        "FileCopyCompleted_state": "Success",
        "FileCopyCompleted_destinationPath": "D:/Offload/A003",
        "FileCopyCompleted_sourceInfo": '{"label": "A003"}',
    }
)


def script_file(tmp_path: Path, header: str = MANIFEST) -> str:
    path = tmp_path / "probe.py"
    path.write_text(header + "\nimport hedgebuddy as hb\n", encoding="utf-8")
    return str(path)


def hook_profile(root: Path) -> None:
    write_profile(root, "p", {"HOOK": {"type": "secret"}}, secrets={"HOOK": "https://hook"})


def ends(root: Path) -> list:
    return [r for r in run_lines(root) if r["phase"] == "end"]


def test_a_successful_run(hb_root, tmp_path):
    hook_profile(hb_root)
    seen = {}

    def main(event, vars):
        seen.update(
            state=event.state,
            dest=event.destinationPath,
            label=event.sourceInfo["label"],
            app=event.app,
            name=event.name,
            project=vars.PROJECT_NAME,
            hook=vars.HOOK,
        )
        hb.log("posted")

    assert run(main, source_path=script_file(tmp_path), argv=["probe.py", PAYLOAD]) == 0
    assert seen == {
        "state": "Success",
        "dest": "D:/Offload/A003",
        "label": "A003",
        "app": "offshoot",
        "name": "FileCopyCompleted",
        "project": "Untitled",
        "hook": "https://hook",
    }
    records = run_lines(hb_root)
    assert [r["phase"] for r in records] == ["start", "log", "end"]
    assert len({r["run_id"] for r in records}) == 1
    start = records[0]
    assert (start["app"], start["event"], start["script"], start["profile"]) == ("offshoot", "FileCopyCompleted", "probe.py", "p")
    assert records[1]["message"] == "posted"
    assert (records[2]["status"], records[2]["exit_code"]) == ("ok", 0)
    assert "traceback" not in records[2]
    for record in records:
        validate_run_record(record)
    assert _runs._current is None


@pytest.mark.parametrize("result,code", [(3, 3), (True, 1), (0, 0)])
def test_return_values_become_exit_codes(hb_root, tmp_path, result, code):
    hook_profile(hb_root)
    assert run(lambda event, vars: result, source_path=script_file(tmp_path), argv=["probe.py"]) == code
    assert (ends(hb_root)[0]["status"], ends(hb_root)[0]["exit_code"]) == ("ok" if code == 0 else "failed", code)


def test_sys_exit_inside_main(hb_root, tmp_path):
    hook_profile(hb_root)

    def main(event, vars):
        sys.exit(4)

    assert run(main, source_path=script_file(tmp_path), argv=["probe.py"]) == 4
    assert (ends(hb_root)[0]["status"], ends(hb_root)[0]["exit_code"]) == ("failed", 4)


def test_an_exception_is_recorded_with_its_traceback(hb_root, tmp_path, capsys):
    hook_profile(hb_root)

    def main(event, vars):
        raise RuntimeError("boom")

    assert run(main, source_path=script_file(tmp_path), argv=["probe.py"]) == 1
    end = ends(hb_root)[0]
    assert (end["status"], end["exit_code"]) == ("error", 1)
    assert "RuntimeError: boom" in end["traceback"]
    assert "RuntimeError: boom" in capsys.readouterr().err


def test_a_non_integer_return_is_an_error(hb_root, tmp_path):
    hook_profile(hb_root)
    assert run(lambda event, vars: "done", source_path=script_file(tmp_path), argv=["probe.py"]) == 1
    assert "main must return None or an int" in ends(hb_root)[0]["traceback"]


def test_missing_required_variables_fail_before_main(hb_root, tmp_path):
    write_profile(hb_root, "p", {"HOOK": {"type": "secret"}})  # declared, but no value in secrets.json
    called = []
    assert run(lambda event, vars: called.append(1), source_path=script_file(tmp_path), argv=["probe.py"]) == 1
    assert called == []
    end = ends(hb_root)[0]
    assert end["status"] == "error"
    assert "VariableNotFoundError" in end["traceback"] and "HOOK" in end["traceback"]


def test_type_mismatch_fails_before_main(hb_root, tmp_path):
    write_profile(hb_root, "p", {"HOOK": {"type": "string", "value": "x"}})
    assert run(lambda event, vars: None, source_path=script_file(tmp_path), argv=["probe.py"]) == 1
    assert "HOOK must be secret but profile 'p' declares string" in ends(hb_root)[0]["traceback"]


def test_a_bad_stored_value_of_a_required_variable_fails_before_main(hb_root, tmp_path):
    header = MANIFEST.replace('"HOOK": {"type": "secret"}', '"COUNT": {"type": "int"}')
    write_profile(hb_root, "p", {"COUNT": {"type": "int", "value": "3"}})
    assert run(lambda event, vars: None, source_path=script_file(tmp_path, header), argv=["probe.py"]) == 1
    assert "COUNT is declared as int" in ends(hb_root)[0]["traceback"]


def test_an_invalid_manifest_is_recorded(hb_root, tmp_path):
    hook_profile(hb_root)
    header = '"""\n{"hedgebuddy": 2}\n---\n"""\n'
    assert run(lambda event, vars: None, source_path=script_file(tmp_path, header), argv=["probe.py"]) == 1
    records = run_lines(hb_root)
    assert "app" not in records[0]
    assert "unsupported manifest version" in records[-1]["traceback"]


def test_a_bad_payload_is_recorded(hb_root, tmp_path):
    hook_profile(hb_root)
    assert run(lambda event, vars: None, source_path=script_file(tmp_path), argv=["probe.py", "not json"]) == 1
    assert "is not JSON" in ends(hb_root)[0]["traceback"]


def test_without_a_manifest_every_variable_is_available_and_the_name_is_inferred(hb_root, tmp_path):
    write_profile(hb_root, "p", {"NOTIFY": {"type": "bool", "value": True}})
    seen = {}

    def main(event, vars):
        seen.update(name=event.name, title=event.title, app=event.app, notify=vars.NOTIFY)

    payload = json.dumps({"DiskAdded_title": "A003", "DiskAdded_rootFilePath": "/Volumes/A003"})
    assert run(main, source_path=script_file(tmp_path, "# no manifest\n"), argv=["probe.py", payload]) == 0
    assert seen == {"name": "DiskAdded", "title": "A003", "app": None, "notify": True}
    start = run_lines(hb_root)[0]
    assert "app" not in start and "event" not in start


def test_no_active_profile_exits_1_without_a_record(hb_root, tmp_path, capsys):
    assert run(lambda event, vars: None, source_path=script_file(tmp_path), argv=["probe.py"]) == 1
    assert "no active HedgeBuddy profile" in capsys.readouterr().err
    assert not (hb_root / "runs").exists()


def test_the_decorator_leaves_imported_functions_alone():
    def main(event, vars):
        return 5

    assert hb.script(main) is main


def test_event_without_the_decorator():
    event = hb.event(["probe.py", json.dumps({"DiskIdle_title": "A003"})])
    assert event.name == "DiskIdle" and event.title == "A003"


def test_the_public_api():
    assert sorted(hb.__all__) == sorted(
        [
            "Event",
            "HedgeBuddyError",
            "ManifestError",
            "StorageCorruptedError",
            "StorageNotFoundError",
            "VariableNotFoundError",
            "VariableTypeError",
            "Vars",
            "__version__",
            "all_vars",
            "event",
            "exists",
            "inject_env",
            "log",
            "script",
            "var",
        ]
    )
    for name in hb.__all__:
        assert hasattr(hb, name), name


PROGRAM = MANIFEST + textwrap.dedent(
    """
    import hedgebuddy as hb


    @hb.script
    def main(event, vars):
        print(event.state, vars.PROJECT_NAME)
        hb.log("posted")
        return 3
    """
)


def test_a_real_script_process(hb_root, tmp_path):
    hook_profile(hb_root)
    path = tmp_path / "on_copy.py"
    path.write_text(PROGRAM, encoding="utf-8")
    env = dict(os.environ, HEDGEBUDDY_DATA_DIR=str(hb_root), PYTHONPATH=str(PACKAGE_ROOT))
    done = subprocess.run([sys.executable, str(path), PAYLOAD], capture_output=True, text=True, env=env, timeout=60)
    assert done.returncode == 3, done.stderr
    assert done.stdout == "Success Untitled\n"
    records = run_lines(hb_root)
    assert [r["phase"] for r in records] == ["start", "log", "end"]
    assert records[0]["script"] == "on_copy.py"
    assert (records[2]["status"], records[2]["exit_code"]) == ("failed", 3)
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd python && uv run pytest tests/test_script.py -q`
Expected: `No module named 'hedgebuddy._script'`.

- [ ] **Step 3: Implement**

`python/hedgebuddy/_script.py`:
```python
"""The ``@hb.script`` decorator and ``hb.event()``."""

from __future__ import annotations

import sys
import traceback
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Sequence

from . import _runs
from ._errors import HedgeBuddyError, ManifestError, VariableNotFoundError, VariableTypeError
from ._event import Event, parse_event
from ._manifest import Manifest, check_requirements, parse_manifest
from ._paths import data_dir
from ._store import load_variables, resolve_profile
from ._values import convert
from ._vars import Vars

Main = Callable[[Event, Vars], Any]


def read_manifest(source_path: Optional[str]) -> Optional[Manifest]:
    """The manifest of the script at ``source_path``. ``None`` without a
    manifest, and without a real file: a console-script launcher's
    ``__main__`` (for example ``pytest.exe\\__main__.py``) is not one."""
    if not source_path or not Path(source_path).is_file():
        return None
    try:
        source = Path(source_path).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as e:
        raise ManifestError(f"cannot read {source_path}: {e}") from e
    return parse_manifest(source)


def _exit_code(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, int):
        return int(value)
    raise TypeError(f"main must return None or an int exit code, not {type(value).__name__}")


def _system_exit_code(exc: SystemExit) -> int:
    code = exc.code
    if code is None:
        return 0
    if isinstance(code, int):
        return int(code)
    print(code, file=sys.stderr)
    return 1


def run(func: Main, *, source_path: Optional[str], argv: Sequence[str]) -> int:
    """Everything ``@hb.script`` does except exiting; returns the exit code."""
    script_name = Path(source_path).name if source_path else getattr(func, "__name__", "script")
    try:
        root = data_dir()
        profile = resolve_profile(root)
    except HedgeBuddyError as e:
        print(f"hedgebuddy: {e}", file=sys.stderr)
        return 1

    manifest: Optional[Manifest] = None
    manifest_error: Optional[ManifestError] = None
    try:
        manifest = read_manifest(source_path)
    except ManifestError as e:
        manifest_error = e

    run_log = _runs.RunLog(root)
    run_log.start(
        script=script_name,
        profile=profile,
        app=manifest.app if manifest else None,
        event=manifest.event if manifest else None,
    )
    _runs.set_current(run_log)
    try:
        if manifest_error is not None:
            raise manifest_error
        variables = load_variables(root, profile)
        defaults: Dict[str, Any] = {}
        if manifest is not None:
            declared = {n: v.type for n, v in variables.items() if v.raw is not None}
            issues = check_requirements(manifest, declared)
            missing = [i.name for i in issues if i.kind == "missing"]
            if missing:
                raise VariableNotFoundError(f"this script requires {', '.join(missing)}, not set in profile '{profile}'")
            mismatched = [i for i in issues if i.kind == "type_mismatch"]
            if mismatched:
                raise VariableTypeError(
                    "; ".join(f"{i.name} must be {i.expected} but profile '{profile}' declares {i.actual}" for i in mismatched)
                )
            for name in sorted(manifest.requires):
                if name in declared:
                    convert(name, variables[name].type, variables[name].raw)
            defaults = {n: r.default for n, r in manifest.requires.items() if r.has_default}
        event = parse_event(argv, manifest)
        code = _exit_code(func(event, Vars(variables, profile, defaults)))
    except SystemExit as e:
        code = _system_exit_code(e)
    except BaseException:
        text = traceback.format_exc()
        sys.stderr.write(text)
        run_log.end("error", 1, text)
        return 1
    finally:
        _runs.set_current(None)
    run_log.end("ok" if code == 0 else "failed", code)
    return code


def script(func: Main) -> Main:
    """Run ``func(event, vars)`` as a HedgeBuddy script.

    When ``func``'s module is the program being run, this reads the manifest
    from the script's docstring, checks the required variables, parses the
    event in ``sys.argv[1]``, records the run, calls ``func`` and exits with
    its return value (``None`` means 0). When the module is imported (for
    example by a test), ``func`` is returned unchanged.
    """
    if getattr(func, "__module__", None) != "__main__":
        return func
    module = sys.modules.get("__main__")
    sys.exit(run(func, source_path=getattr(module, "__file__", None), argv=sys.argv))


def event(argv: Optional[Sequence[str]] = None) -> Event:
    """The event in ``sys.argv[1]`` for scripts that do not use ``@hb.script``."""
    module = sys.modules.get("__main__")
    manifest = read_manifest(getattr(module, "__file__", None))
    return parse_event(sys.argv if argv is None else argv, manifest)
```

Replace `python/hedgebuddy/__init__.py` with the final form:
```python
"""HedgeBuddy for Python scripts run by Hedge apps.

Typical use::

    import hedgebuddy as hb

    @hb.script
    def main(event, vars):
        hb.log(f"{event.name}: {vars.PROJECT_NAME}")

Guide: https://github.com/shakedex/hedgebuddy/tree/main/python
"""

from ._api import all_vars, exists, inject_env, var
from ._errors import (
    HedgeBuddyError,
    ManifestError,
    StorageCorruptedError,
    StorageNotFoundError,
    VariableNotFoundError,
    VariableTypeError,
)
from ._event import Event
from ._runs import log
from ._script import event, script
from ._vars import Vars

__version__ = "0.11.0"

__all__ = [
    "Event",
    "HedgeBuddyError",
    "ManifestError",
    "StorageCorruptedError",
    "StorageNotFoundError",
    "VariableNotFoundError",
    "VariableTypeError",
    "Vars",
    "__version__",
    "all_vars",
    "event",
    "exists",
    "inject_env",
    "log",
    "script",
    "var",
]
```

- [ ] **Step 4: Run the tests**

Run: `cd python && uv run pytest -q`
Expected: all pass. Also run `python scripts/sync_version.py --check` from the repo root; it must still find `__version__ = "0.11.0"`.

- [ ] **Step 5: Commit**

```bash
git add python
git commit -m "feat(python): @hb.script with requirement checks and run records, and hb.event()

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Core follow-ups: BOM in manifests and the package check in `check_script`

**Files:**
- Modify: `crates/core/src/manifest.rs`, `crates/core/src/python_env.rs`, `crates/cli/src/tools/scripts.rs`, `crates/cli/src/resources.rs`

**Interfaces:**
- Consumes: `python_env::{find_python, PythonInfo}`. `check_script` already exists in `crates/cli/src/tools/scripts.rs`.
- Produces:
  - `python_env::imports_hedgebuddy(source: &str) -> bool`.
  - `python_env::package_problem(python: &PythonInfo, expected: &str) -> Option<String>`.
  - `check_script`'s result gains `package_problem: string | null`, and `ok` is false when it is set.
  - `extract_manifest_text` skips a leading `\u{feff}`.

- [ ] **Step 1: Write the failing core tests**

In `crates/core/src/manifest.rs` tests:
```rust
    #[test]
    fn a_leading_bom_is_skipped() {
        let src = "\u{feff}\"\"\"\n{\"hedgebuddy\": 1}\n---\n\"\"\"\n";
        // The docstring text starts with the newline after the quotes, as in Python.
        assert_eq!(extract_manifest_text(src).as_deref(), Some("\n{\"hedgebuddy\": 1}"));
    }
```

In `crates/core/src/python_env.rs` tests:
```rust
    #[test]
    fn detects_hedgebuddy_imports() {
        assert!(imports_hedgebuddy("import hedgebuddy as hb\n"));
        assert!(imports_hedgebuddy("  from hedgebuddy import script\n"));
        assert!(imports_hedgebuddy("import hedgebuddy\n"));
        assert!(imports_hedgebuddy("from hedgebuddy._runs import log\n"));
        assert!(!imports_hedgebuddy("import hedgebuddyx\n"));
        assert!(!imports_hedgebuddy("print('import hedgebuddy')\n"));
        assert!(!imports_hedgebuddy("import os\n"));
    }

    #[test]
    fn package_problem_explains_missing_and_mismatched_versions() {
        let info = |v: Option<&str>| PythonInfo {
            launcher: vec!["py".into(), "-3".into()],
            executable: PathBuf::from("C:\\Python313\\python.exe"),
            version: "3.13.5".into(),
            hedgebuddy: v.map(str::to_owned),
        };
        assert_eq!(package_problem(&info(Some("0.11.0")), "0.11.0"), None);
        let missing = package_problem(&info(None), "0.11.0").unwrap();
        assert!(missing.contains("not installed"), "{missing}");
        assert!(missing.contains("py -3 -m pip install hedgebuddy==0.11.0"), "{missing}");
        let old = package_problem(&info(Some("0.10.0")), "0.11.0").unwrap();
        assert!(old.contains("0.10.0") && old.contains("needs 0.11.0"), "{old}");
    }
```

- [ ] **Step 2: Run to see the failures**

Run: `cargo test -p hedgebuddy-core a_leading_bom_is_skipped` and `cargo test -p hedgebuddy-core package_problem`
Expected: compile errors for the missing functions; the BOM test fails (`None`).

- [ ] **Step 3: Implement in core**

`manifest.rs`, first line of `extract_manifest_text`:
```rust
    let source = source.strip_prefix('\u{feff}').unwrap_or(source);
```
and add "A leading UTF-8 BOM is skipped." to its doc comment.

`python_env.rs`:
```rust
/// Whether `source` imports the `hedgebuddy` package: a line starting with
/// `import hedgebuddy` or `from hedgebuddy` (followed by the end of the line,
/// whitespace, `.` or `,`).
pub fn imports_hedgebuddy(source: &str) -> bool {
    source.lines().map(str::trim_start).any(|line| {
        let rest = line
            .strip_prefix("import hedgebuddy")
            .or_else(|| line.strip_prefix("from hedgebuddy"));
        matches!(rest, Some(r) if r.is_empty() || r.starts_with([' ', '\t', '.', ',']))
    })
}

/// Why a script importing `hedgebuddy` would fail with `python`, or `None`
/// when the installed package is exactly `expected`.
pub fn package_problem(python: &PythonInfo, expected: &str) -> Option<String> {
    let install = format!("{} -m pip install hedgebuddy=={expected}", python.launcher.join(" "));
    let exe = python.executable.display();
    match python.hedgebuddy.as_deref() {
        Some(v) if v == expected => None,
        Some(v) => Some(format!(
            "hedgebuddy {v} is installed for {exe}, but this HedgeBuddy needs {expected}; run: {install}"
        )),
        None => Some(format!("hedgebuddy is not installed for {exe}; run: {install}")),
    }
}
```

- [ ] **Step 4: Use it in `check_script`**

In `crates/cli/src/tools/scripts.rs` `check_script`:
- Keep the whole `PythonInfo` from `find_python` instead of only its executable.
- Read the source with `ctx.store.read_script`.
- Compute `package_problem` as `Some(..)` only when Python was found and `imports_hedgebuddy(&source)` is true, using `env!("CARGO_PKG_VERSION")` as the expected version.
- Add `"package_problem": package_problem` to the result, and include `package_problem.is_none()` in `ok`.
- Update the tool description to add ", and whether the hedgebuddy package the script imports is installed there at the right version".

Add a test next to `check_reports_compile_errors_from_python` (same fake-Python setup, probe reporting `"hedgebuddy": null`):
```rust
    #[test]
    fn check_reports_a_missing_hedgebuddy_package() {
        let dir = tempfile::tempdir().unwrap();
        let store_root = dir.path().join("HedgeBuddy");
        let script_s = hedgebuddy_core::Store::open(&store_root)
            .script_path("p", "uses_hb.py")
            .to_string_lossy()
            .to_string();
        let host = FakeHost::new(Os::Windows)
            .with_run_response(
                "py",
                &["-3", "-c", PROBE],
                CommandOutput {
                    status: 0,
                    stdout: "{\"executable\": \"C:\\\\Py\\\\python.exe\", \"version\": \"3.13.5\", \"hedgebuddy\": null}\n".into(),
                    stderr: String::new(),
                },
            )
            .with_run_response(
                "C:\\Py\\python.exe",
                &["-c", SYNTAX_CHECK, &script_s],
                CommandOutput { status: 0, stdout: String::new(), stderr: String::new() },
            );
        let ctx = crate::tools::Context::new(hedgebuddy_core::Store::open(&store_root), std::sync::Arc::new(host));
        ctx.store.create_profile("p", "").unwrap();
        call(&ctx, "write_script", json!({"name": "uses_hb.py", "source": "import hedgebuddy as hb\n"})).unwrap();
        let out = call(&ctx, "check_script", json!({"name": "uses_hb.py"})).unwrap();
        assert!(out["package_problem"].as_str().unwrap().contains("not installed"), "{out}");
        assert_eq!(out["ok"], false);
    }
```
Also assert, in the existing compile-error test, that `out["package_problem"]` is `null` (that script does not import hedgebuddy).

In `crates/cli/src/resources.rs` `author_script`, add this sentence after "then attach it with attach_script (dry_run first).":

> The hedgebuddy package must be installed for the Python the Hedge apps use; check_script reports it.

- [ ] **Step 5: Run everything**

```bash
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: all pass, clean.

- [ ] **Step 6: Commit**

```bash
git add crates
git commit -m "feat: check_script reports a missing hedgebuddy package; manifests skip a BOM

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Package docs, build checks, publish workflow, spec and changelog

**Files:**
- Create: `python/scripts/check_dist.py`, `.github/workflows/publish-python.yml`, `docs/releasing-python.md`
- Modify: `python/README.md`, `python/pyproject.toml`, `.github/workflows/ci.yml`, `docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md`, `CHANGELOG.md`

**Interfaces:** none (documentation, build and CI).

- [ ] **Step 1: The dist check**

`python/scripts/check_dist.py`:
```python
"""Check python/dist after `uv build`: one wheel and one sdist of the current
version, the wheel holding exactly the package files and no dependencies."""

import re
import sys
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "__init__.py",
    "_api.py",
    "_errors.py",
    "_event.py",
    "_lock.py",
    "_manifest.py",
    "_paths.py",
    "_runs.py",
    "_script.py",
    "_store.py",
    "_values.py",
    "_vars.py",
    "py.typed",
}


def main() -> int:
    init = (ROOT / "hedgebuddy" / "__init__.py").read_text(encoding="utf-8")
    version = re.search(r'^__version__\s*=\s*"([^"]+)"', init, re.MULTILINE).group(1)
    wheels = sorted((ROOT / "dist").glob(f"hedgebuddy-{version}-*.whl"))
    sdists = sorted((ROOT / "dist").glob(f"hedgebuddy-{version}.tar.gz"))
    if len(wheels) != 1 or len(sdists) != 1:
        print(f"expected one wheel and one sdist for {version}, found {wheels} and {sdists}")
        return 1
    problems = []
    with zipfile.ZipFile(wheels[0]) as wheel:
        names = set(wheel.namelist())
        dist_info = f"hedgebuddy-{version}.dist-info/"
        package = {n.split("/", 1)[1] for n in names if n.startswith("hedgebuddy/")}
        if package != FILES:
            problems.append(f"wheel package files differ: extra {sorted(package - FILES)}, missing {sorted(FILES - package)}")
        stray = sorted(n for n in names if not (n.startswith("hedgebuddy/") or n.startswith(dist_info)))
        if stray:
            problems.append(f"unexpected files in the wheel: {stray}")
        metadata = wheel.read(dist_info + "METADATA").decode("utf-8")
        if "Requires-Python: >=3.9" not in metadata:
            problems.append("wheel metadata lacks Requires-Python: >=3.9")
        if "Requires-Dist:" in metadata:
            problems.append("wheel declares dependencies; the package must have none")
    with tarfile.open(sdists[0]) as sdist:
        if f"hedgebuddy-{version}/pyproject.toml" not in sdist.getnames():
            problems.append("sdist lacks pyproject.toml")
    for problem in problems:
        print(problem)
    if not problems:
        print(f"{wheels[0].name} and {sdists[0].name} look right")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
```

In `.github/workflows/ci.yml`, python job, after `- run: uv run pytest -v` add:
```yaml
      - run: uv build
      - run: uv run python scripts/check_dist.py
```

Run locally: `cd python && uv build && uv run python scripts/check_dist.py`. Expected: "… look right". If the wheel contains `scripts/` or `tests/`, fix `[tool.hatch.build.targets.wheel]` (it already lists `packages = ["hedgebuddy"]`).

- [ ] **Step 2: The publish workflow**

`.github/workflows/publish-python.yml`:
```yaml
name: Publish Python package

# Manual only. Before the first run, add a trusted publisher on pypi.org for
# project "hedgebuddy": owner shakedex, repository hedgebuddy, workflow
# publish-python.yml, environment pypi. See docs/releasing-python.md.
on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-python@v6
        with:
          python-version: "3.13"
      - run: python scripts/sync_version.py --check
      - uses: astral-sh/setup-uv@v6
        with:
          python-version: "3.13"
      - working-directory: python
        run: |
          uv sync --frozen
          uv run pytest -q
          uv build
          uv run python scripts/check_dist.py
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: python/dist/

  publish:
    needs: build
    runs-on: ubuntu-latest
    environment: pypi
    permissions:
      id-token: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/
      - uses: pypa/gh-action-pypi-publish@release/v1
```

`docs/releasing-python.md`:
```markdown
# Releasing the Python package

The `hedgebuddy` package on PyPI is published by the **Publish Python package** workflow. It runs only when started by hand.

## One-time setup

1. On pypi.org, open the `hedgebuddy` project, then Publishing, and add a GitHub trusted publisher: owner `shakedex`, repository `hedgebuddy`, workflow `publish-python.yml`, environment `pypi`.
2. In the GitHub repository settings, create an environment named `pypi`. Adding yourself as a required reviewer makes every publish wait for your approval.

## Each release

1. Make sure `VERSION`, `python/pyproject.toml` and `python/hedgebuddy/__init__.py` agree (`python scripts/sync_version.py --check`).
2. Merge to `main` with CI green.
3. In GitHub, open Actions, then Publish Python package, then Run workflow on `main`.
4. The build job runs the tests, builds the wheel and sdist, and checks them. The publish job uploads them to PyPI.

A version can be uploaded to PyPI only once. To fix a bad release, publish the next version.
```

- [ ] **Step 3: The package README**

Replace `python/README.md` (this is also the PyPI page, so links are absolute):
````markdown
# hedgebuddy

The Python side of [HedgeBuddy](https://github.com/shakedex/hedgebuddy). Hedge apps (OffShoot, FoolCat, EditReady, Canister) run a Python script when something happens, such as a copy finishing. This package gives that script:
- its typed variables from the active HedgeBuddy profile;
- the event payload;
- a run record, so HedgeBuddy can show what happened.

Pure Python, no dependencies, Python 3.9+.

## Install

Install it for the Python the Hedge apps use:

```bash
py -3 -m pip install hedgebuddy        # Windows
python3 -m pip install hedgebuddy      # macOS
```

HedgeBuddy's `check_script` tool tells you when it is missing.

## A script

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
import json
import urllib.request

import hedgebuddy as hb


@hb.script
def main(event, vars):
    if event.state != "Success":
        hb.log(f"copy failed: {event.state}")
        return 1
    text = f"{vars.PROJECT_NAME}: {event.destinationPath} is done"
    body = json.dumps({"text": text}).encode()
    request = urllib.request.Request(vars.SLACK_WEBHOOK, body, {"Content-Type": "application/json"})
    urllib.request.urlopen(request, timeout=10)
    hb.log("posted to slack")
```

### The manifest

The JSON at the top of the docstring, ended by a `---` line, tells HedgeBuddy three things:
- which app and event the script handles;
- which variables it needs;
- the type of each variable.

A variable with a `default` is optional. HedgeBuddy uses the manifest to attach the script to the right event and to check the profile before it runs. The types are `string`, `secret`, `int`, `float`, `bool`, `path`, `url`, `string[]` and `path[]`.

### `@hb.script`

When Hedge runs the file, the decorator does the following, in order:
1. Finds the active profile.
2. Starts a run record.
3. Checks every required variable. If one is missing or has the wrong type, it stops and names it.
4. Parses the event.
5. Calls `main(event, vars)`.
6. Records the result and exits with `main`'s return value.

`None` means success. A non-zero number means the run failed. An uncaught exception is recorded with its traceback. When the file is imported rather than run, for example by a test, the decorator returns `main` unchanged.

### `vars`

`vars.NAME` or `vars["NAME"]` returns the value in its Python type:

| Type | Python value |
|---|---|
| `path` | `pathlib.Path` |
| `path[]` | list of `Path` |
| `int` | `int` |
| `float` | `float` |
| `bool` | `bool` |
| `string[]` | list of `str` |
| `string`, `secret`, `url` | `str` |

Secrets come from the profile's secrets file. `vars.get("NAME", default)` and `"NAME" in vars` work too.

### `event`

The payload's keys, without the `<EventName>_` prefix: `event.state`, `event.destinationPath`. A value that holds a JSON object or array is decoded for you. Other attributes:
- `event.raw` is the original payload.
- `event.app` and `event.name` identify the event.

A field that shares a name with one of these attributes is read with `event["name"]`.

## Other helpers

| Call | What it does |
|---|---|
| `hb.var("NAME", default=...)` | One variable of the active profile. The default applies only when the variable is missing. |
| `hb.exists("NAME")` | Whether the variable has a value. |
| `hb.all_vars()` | Every variable with a value, typed. |
| `hb.inject_env(overwrite=False)` | Copies every variable into `os.environ` as text. Bools become `1` or `0`, and lists are joined with `os.pathsep`. Useful when you bring a script that already reads environment variables. |
| `hb.log(message)` | Adds a line to the run record, or prints it outside a run. |
| `hb.event()` | Parses the payload in scripts that do not use `@hb.script`. |

Errors: `VariableNotFoundError`, `VariableTypeError`, `StorageNotFoundError`, `StorageCorruptedError` and `ManifestError`. They all derive from `HedgeBuddyError`.

## Trying a script by hand

Pass the payload as the first argument. Point `HEDGEBUDDY_DATA_DIR` at a test data folder if you do not want the run recorded in your real one:

```bash
py -3 on_copy_complete.py "{\"FileCopyCompleted_state\": \"Success\", \"FileCopyCompleted_destinationPath\": \"D:/Offload/A003\"}"
```
````

In `python/pyproject.toml`, change `description` to `"Typed variables, event payloads and run records for Python scripts run by Hedge apps"`.

- [ ] **Step 4: Spec and changelog**

In the spec, at the end of section 9 (after the "Errors:" line), add:
```markdown
Decisions made in phase 4:
- `@hb.script` runs `main` only when its module is `__main__`; imported (for example by a test), it returns the function unchanged.
- The run record opens as soon as the active profile is known, so manifest and requirement failures are recorded with status `error`. Without an active profile nothing is recorded; the error goes to stderr and the exit code is 1.
- `hb.var(name, default)` returns the default only when the variable is missing; storage errors are always raised. A variable declared without a value (a secret with nothing in `secrets.json`) counts as missing when a script runs.
- `VariableNotFoundError` is both a `KeyError` and an `AttributeError`, so `vars.get`, `getattr(vars, name, default)` and `hasattr` work.
- Payload fields named like `Event` attributes (`raw`, `app`, `name`, `get`) are read with `event["name"]`. A missing or blank `sys.argv[1]` is an empty payload; a payload that is not a JSON object raises `ValueError`.
- Run records are written under an exclusive file lock (`msvcrt.locking` on Windows, `flock` on macOS) so parallel scripts never interleave lines. A record that cannot be written is reported once on stderr and never fails the script. Run ids are ULIDs; timestamps are UTC with milliseconds; all records of one run go to the file named by the local date at its start.
- Manifest extraction skips a leading UTF-8 BOM, in core and in the library.
- `check_script` reports when a script imports `hedgebuddy` but the package is missing or at another version in the Python the Hedge apps use.
```

Under `## Unreleased` then `### Added` in `CHANGELOG.md`, append:
```markdown
- Python package `hedgebuddy` 0.11.0: `@hb.script` (manifest, requirement checks, run records, exit codes), typed `vars`, the `event` payload, `hb.var`, `hb.exists`, `hb.all_vars`, `hb.inject_env`, `hb.log`, and `hb.event`.
- Python conformance tests assert the shared `expected.json` fixtures, like core.
- `check_script` reports a missing or mismatched `hedgebuddy` package; manifests may start with a UTF-8 BOM.
- Manual PyPI publish workflow with trusted publishing (`docs/releasing-python.md`).
```

- [ ] **Step 5: Verification and commit**

```bash
cd python && uv run pytest -q && uv build && uv run python scripts/check_dist.py && cd ..
python scripts/sync_version.py --check
cargo test --workspace
git add python .github docs CHANGELOG.md
git commit -m "docs: Python package guide, dist checks, manual PyPI publish workflow, spec and changelog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** Spec §13 item 4 lists the decorator, typed vars, event, log, inject_env, run records, conformance tests and a PyPI publish:
- **Decorator:** Task 6.
- **Typed vars:** Tasks 1-2.
- **Event:** Task 4.
- **Log and run records:** Task 5.
- **inject_env:** Task 2.
- **Conformance:** Task 3 checks `expected.json` and extracts schema manifests with the library's own extractor. Task 5 validates every run record against the schema.
- **PyPI:** Task 8 adds the workflow and docs. The actual upload is left to the operator.

Spec §9 items are covered as well:
- `hb.var`, `hb.exists`, `hb.all_vars`: Task 2.
- `hb.event()`: Task 6.
- The five errors: Task 1.
- `get()` stays removed; nothing re-adds it.

§5 is covered too:
- Types: Task 1.
- Storage reading and the data directory: Tasks 1-2.
- Run-record shape: Task 5.

The parked "`check_script` package warning" carry-over is Task 7.

**Placeholder scan.** Every code step contains its full code. Two details were checked against the real tools before writing:
- An exception class can inherit from both `KeyError` and `AttributeError` on Python 3.9 and 3.12.
- Under `uv run pytest`, `__main__.__file__` is `...\pytest.exe\__main__.py`, which is not a real file, so `read_manifest` skips paths that are not files.

**Type consistency.**
- `Variable(name, type, raw, description)` is defined in Task 2 and used in Tasks 2, 3 and 6.
- `Requirement.has_default` and `Requirement.default`, `Manifest.app/event/requires`, and `RequirementIssue.kind/name/expected/actual` are defined in Task 3 and used in Task 6.
- `parse_event(argv, manifest)` (Task 4) and `RunLog.start/log/end` and `set_current` (Task 5) are used in Task 6.
- `write_profile`, `run_lines` and `validate_run_record` are defined in Tasks 2 and 5 and used in later tests.
- `hb_root` comes from Task 1's `conftest.py`.
