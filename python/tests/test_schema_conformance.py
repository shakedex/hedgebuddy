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
