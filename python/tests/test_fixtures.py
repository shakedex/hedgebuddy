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
        # A variable counts as declared only when it has a value, as
        # _script.py checks when the script runs.
        declared = {n: v.type for n, v in variables.items() if v.raw is not None}
        scripts = {}
        for script in sorted((root / "profiles" / name / "scripts").glob("*.py")):
            m = parse_manifest(script.read_text(encoding="utf-8"))
            assert m is not None, f"{script} should carry a manifest"
            scripts[script.name] = {
                "app": m.app,
                "event": m.event,
                "requires": sorted(m.requires),
                "unmet": [issue.name for issue in check_requirements(m, declared)],
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
