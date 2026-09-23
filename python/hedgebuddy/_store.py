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
