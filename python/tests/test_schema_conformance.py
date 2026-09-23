"""Validates schema/fixtures against schema/*.schema.json.

Mirrors crates/core/tests/schema_conformance.rs. The convention is documented in
schema/README.md. Manifest extraction is the library's own `extract_manifest_text`.
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from hedgebuddy._manifest import extract_manifest_text

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


def valid_cases():
    return sorted(p for p in (SCHEMA_ROOT / "fixtures" / "valid").iterdir() if p.is_dir())


@pytest.mark.parametrize("case", valid_cases(), ids=lambda p: p.name)
def test_valid_fixture_data_dir_validates(case: Path):
    hedgebuddy = validator("hedgebuddy")
    profile = validator("profile")
    secrets = validator("secrets")
    run_record = validator("run-record")
    manifest = validator("script-manifest")
    activity_record = validator("activity-record")
    preferences = validator("preferences")

    assert_valid(hedgebuddy, load_json(case / "hedgebuddy.json"), f"{case.name}/hedgebuddy.json")

    profiles_dir = case / "profiles"
    for prof in sorted(p for p in profiles_dir.iterdir() if p.is_dir()) if profiles_dir.exists() else []:
        assert_valid(profile, load_json(prof / "profile.json"), f"{case.name}/{prof.name}/profile.json")
        if (prof / "secrets.json").exists():
            assert_valid(secrets, load_json(prof / "secrets.json"), f"{case.name}/{prof.name}/secrets.json")
        for script in sorted((prof / "scripts").glob("*.py")):
            text = extract_manifest_text(script.read_text(encoding="utf-8"))
            if text is not None:
                assert_valid(manifest, json.loads(text.strip()), str(script))

    runs = case / "runs"
    if runs.exists():
        for log in sorted(runs.glob("*.jsonl")):
            for i, line in enumerate(log.read_text(encoding="utf-8").splitlines(), start=1):
                if line.strip():
                    assert_valid(run_record, json.loads(line), f"{log}:{i}")

    activity = case / "activity.jsonl"
    if activity.exists():
        for i, line in enumerate(activity.read_text(encoding="utf-8").splitlines(), start=1):
            if line.strip():
                assert_valid(activity_record, json.loads(line), f"{activity}:{i}")

    prefs = case / "preferences.json"
    if prefs.exists():
        assert_valid(preferences, load_json(prefs), f"{case.name}/preferences.json")


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


def invalid_files():
    root = SCHEMA_ROOT / "fixtures" / "invalid"
    return sorted((group.name, f) for group in root.iterdir() if group.is_dir() for f in group.glob("*.json"))


@pytest.mark.parametrize("stem,file", invalid_files(), ids=lambda x: x.name if isinstance(x, Path) else x)
def test_invalid_fixture_fails_its_schema(stem: str, file: Path):
    v = validator(stem)
    assert not v.is_valid(load_json(file)), f"{file} should be INVALID against {stem}.schema.json"


def test_there_are_invalid_fixtures():
    assert len(invalid_files()) >= 11
