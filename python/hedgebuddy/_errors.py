"""Errors raised by hedgebuddy, and ``_warn`` for problems it only reports."""

from __future__ import annotations

import sys


def _warn(text: object) -> None:
    """Print ``text`` on stderr. Never raises: a stderr that is ``None``
    (``pythonw``) or closed, or text that cannot be printed, is ignored."""
    try:
        stream = sys.stderr
        if stream is not None:  # print(file=None) would write to stdout
            print(text, file=stream)
    except Exception:
        pass


class HedgeBuddyError(Exception):
    """Base class of every error hedgebuddy raises."""


class VariableNotFoundError(HedgeBuddyError, KeyError, AttributeError):
    """A variable is not set in the active profile and has no default.

    It is a ``KeyError`` for ``vars["NAME"]`` and an ``AttributeError`` for
    ``vars.NAME``, so ``vars.get("NAME")``, ``getattr(vars, "NAME", None)``
    and ``hasattr(vars, "NAME")`` all work.
    """

    def __str__(self) -> str:
        # KeyError would quote the message; show it as written.
        return str(self.args[0]) if self.args else ""


class VariableTypeError(HedgeBuddyError, TypeError):
    """A variable's value does not match its declared type, or a script
    requires a different type than the profile declares."""


class StorageNotFoundError(HedgeBuddyError):
    """There is no active profile, or its files cannot be found or read."""


class StorageCorruptedError(HedgeBuddyError, ValueError):
    """A HedgeBuddy file exists but is not valid JSON or not in the expected shape."""


class ManifestError(HedgeBuddyError, ValueError):
    """A script's manifest block is not valid."""
