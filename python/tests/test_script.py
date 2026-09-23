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


def test_sys_exit_with_a_reason_inside_main(hb_root, tmp_path, capsys):
    hook_profile(hb_root)

    def main(event, vars):
        sys.exit("reason")

    assert run(main, source_path=script_file(tmp_path), argv=["probe.py"]) == 1
    assert "reason" in capsys.readouterr().err
    assert (ends(hb_root)[0]["status"], ends(hb_root)[0]["exit_code"]) == ("failed", 1)


def test_sys_exit_with_no_code_inside_main(hb_root, tmp_path):
    hook_profile(hb_root)

    def main(event, vars):
        sys.exit()

    assert run(main, source_path=script_file(tmp_path), argv=["probe.py"]) == 0
    assert (ends(hb_root)[0]["status"], ends(hb_root)[0]["exit_code"]) == ("ok", 0)


def test_an_exception_is_recorded_with_its_traceback(hb_root, tmp_path, capsys):
    hook_profile(hb_root)

    def main(event, vars):
        raise RuntimeError("boom")

    assert run(main, source_path=script_file(tmp_path), argv=["probe.py"]) == 1
    end = ends(hb_root)[0]
    assert (end["status"], end["exit_code"]) == ("error", 1)
    assert "RuntimeError: boom" in end["traceback"]
    assert "RuntimeError: boom" in capsys.readouterr().err
    assert _runs._current is None


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


def test_an_optional_requirements_default_is_used_when_declared_without_a_value(hb_root, tmp_path):
    write_profile(
        hb_root,
        "p",
        {"HOOK": {"type": "secret"}, "PROJECT_NAME": {"type": "string"}},  # PROJECT_NAME: no "value"
        secrets={"HOOK": "https://hook"},
    )
    seen = {}

    def main(event, vars):
        seen["project"] = vars.PROJECT_NAME

    assert run(main, source_path=script_file(tmp_path), argv=["probe.py", PAYLOAD]) == 0
    assert seen == {"project": "Untitled"}
    assert (ends(hb_root)[0]["status"], ends(hb_root)[0]["exit_code"]) == ("ok", 0)


def test_a_closed_or_missing_stderr_does_not_lose_the_end_record(hb_root, tmp_path, monkeypatch):
    hook_profile(hb_root)
    monkeypatch.setattr(sys, "stderr", None)

    def main(event, vars):
        raise RuntimeError("boom")

    assert run(main, source_path=script_file(tmp_path), argv=["probe.py"]) == 1
    end = ends(hb_root)[0]
    assert (end["status"], end["exit_code"]) == ("error", 1)
    assert "RuntimeError: boom" in end["traceback"]


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
