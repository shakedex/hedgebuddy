import datetime
import io
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import pytest

import hedgebuddy as hb
from hedgebuddy import _runs
from hedgebuddy._lock import locked
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


@pytest.mark.parametrize("stderr", [None, "closed"])
def test_write_failures_never_raise_without_a_usable_stderr(tmp_path, monkeypatch, capsys, stderr):
    closed = io.StringIO()
    closed.close()
    monkeypatch.setattr(sys, "stderr", closed if stderr == "closed" else None)
    blocker = tmp_path / "not-a-folder"
    blocker.write_text("x", encoding="utf-8")
    run = RunLog(blocker)
    run.start(script="a.py", profile="p")
    run.end("ok", 0)
    assert capsys.readouterr().out == ""  # the warning never falls back to stdout


def test_non_serializable_end_warns_once_and_never_raises(hb_root, capsys):
    run = RunLog(hb_root)
    run.end("ok", 0, traceback=object())  # not JSON-serializable
    assert capsys.readouterr().err.count("cannot write the run record") == 1


def test_hidden_values_are_masked_in_logs_and_tracebacks(hb_root):
    run = RunLog(hb_root)
    run.hide(["s3cret-token", "abc", None, 1234, "s3cret"])  # "abc" is too short to hide
    run.start(script="s3cret-token.py", profile="p")  # only log and end are masked
    run.log("sent s3cret-token and abc")
    run.end("error", 1, traceback="ValueError: 's3cret'")
    records = run_lines(hb_root)
    assert records[0]["script"] == "s3cret-token.py"
    assert records[1]["message"] == "sent ******** and abc"  # the longer value is masked whole
    assert records[2]["traceback"] == "ValueError: '********'"
    assert run.mask("x s3cret y") == "x ******** y"


def test_run_log_log_coerces_message_to_str(hb_root):
    run = RunLog(hb_root)
    run.log(42)
    assert run_lines(hb_root)[-1]["message"] == "42"


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


@pytest.mark.skipif(os.name != "nt", reason="Windows byte-range locks are mandatory; flock is advisory")
def test_the_lock_does_not_block_readers(tmp_path):
    path = tmp_path / "runs.jsonl"
    path.write_bytes(b'{"phase": "log"}\n')
    with open(path, "ab") as f:
        with locked(f):
            with open(path, "rb") as reader:  # a second handle, as core's list_runs opens one
                assert reader.read() == b'{"phase": "log"}\n'
            f.write(b"x\n")
            f.flush()
    assert path.read_bytes() == b'{"phase": "log"}\nx\n'  # the write still went to the end


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
