"""The nine variable types and their Python values (spec section 5)."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

from ._errors import VariableTypeError

TYPES = ("string", "secret", "int", "float", "bool", "path", "url", "string[]", "path[]")

_URL = re.compile(r"^https?://")


def convert(name: str, ty: str, raw: Any) -> Any:
    """The Python value of ``raw`` for variable ``name`` declared as ``ty``.

    Raises ``VariableTypeError`` when ``raw`` does not fit the type. A secret's
    value is never included in the message.
    """

    def bad(expected: str) -> VariableTypeError:
        shown = f"a {type(raw).__name__}" if ty == "secret" else repr(raw)
        return VariableTypeError(f"{name} is declared as {ty} but its value is not {expected}: {shown}")

    if ty in ("string", "secret"):
        if isinstance(raw, str):
            return raw
        raise bad("a string")
    if ty == "int":
        if isinstance(raw, int) and not isinstance(raw, bool):
            return raw
        raise bad("an integer")
    if ty == "float":
        if isinstance(raw, (int, float)) and not isinstance(raw, bool):
            return float(raw)
        raise bad("a number")
    if ty == "bool":
        if isinstance(raw, bool):
            return raw
        raise bad("true or false")
    if ty == "path":
        if isinstance(raw, str) and raw:
            return Path(raw)
        raise bad("a non-empty path")
    if ty == "url":
        if isinstance(raw, str) and _URL.match(raw):
            return raw
        raise bad("an http or https URL")
    if ty == "string[]":
        if isinstance(raw, list) and all(isinstance(x, str) for x in raw):
            return list(raw)
        raise bad("a list of strings")
    if ty == "path[]":
        if isinstance(raw, list) and all(isinstance(x, str) and x for x in raw):
            return [Path(x) for x in raw]
        raise bad("a list of non-empty paths")
    raise VariableTypeError(f"{name} has an unknown type {ty!r}")


def to_env(value: Any) -> str:
    """A typed value as an environment variable: bools as 1/0, lists joined with os.pathsep."""
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, list):
        return os.pathsep.join(str(x) for x in value)
    return str(value)
