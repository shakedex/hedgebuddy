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
