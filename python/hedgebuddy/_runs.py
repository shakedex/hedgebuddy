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

    def log(self, message: Any) -> None:
        self._write({"ts": utc_timestamp(), "run_id": self.run_id, "phase": "log", "message": str(message)})

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
        try:
            line = (json.dumps(record, ensure_ascii=True) + "\n").encode("ascii")
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.path, "ab") as f:
                with locked(f):
                    f.write(line)
                    f.flush()
        except (OSError, TypeError, ValueError) as e:
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
