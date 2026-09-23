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
