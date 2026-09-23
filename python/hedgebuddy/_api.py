"""Module-level helpers that read the active profile directly."""

from __future__ import annotations

import os
from typing import Any, Dict, List

from ._errors import VariableNotFoundError
from ._paths import data_dir
from ._store import load_variables, resolve_profile
from ._values import to_env
from ._vars import Vars

_MISSING = object()


def _current() -> Vars:
    root = data_dir()
    profile = resolve_profile(root)
    return Vars(load_variables(root, profile), profile)


def var(name: str, default: Any = _MISSING) -> Any:
    """One variable of the active profile, typed. ``default`` is returned only
    when the variable is missing; storage errors are always raised."""
    try:
        return _current()[name]
    except VariableNotFoundError:
        if default is _MISSING:
            raise
        return default


def exists(name: str) -> bool:
    """Whether the active profile has a value for ``name``."""
    return name in _current()


def all_vars() -> Dict[str, Any]:
    """Every variable of the active profile that has a value, typed."""
    values = _current()
    return {name: values[name] for name in values}


def inject_env(overwrite: bool = False) -> List[str]:
    """Copy every variable into ``os.environ`` as a string (bools as 1/0,
    lists joined with ``os.pathsep``). Existing environment variables are
    kept unless ``overwrite``. Returns the names set, sorted."""
    names = []
    for name, value in all_vars().items():
        if overwrite or name not in os.environ:
            os.environ[name] = to_env(value)
            names.append(name)
    return names
