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
