"""The ``vars`` object scripts receive."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Dict, Iterator, List, Optional

from ._errors import VariableNotFoundError
from ._store import Variable
from ._values import convert


class Vars(Mapping):
    """Typed, read-only access to a profile's variables: ``vars.NAME`` or
    ``vars["NAME"]``. Values are converted on access, so one bad value only
    fails the script that reads it."""

    def __init__(self, variables: Mapping[str, Variable], profile: str, defaults: Optional[Mapping[str, Any]] = None) -> None:
        self._variables: Dict[str, Variable] = dict(variables)
        self._profile = profile
        self._defaults: Dict[str, Any] = dict(defaults or {})

    def __getitem__(self, name: str) -> Any:
        var = self._variables.get(name)
        if var is not None and var.raw is not None:
            return convert(name, var.type, var.raw)
        if name in self._defaults:
            return self._defaults[name]
        if var is not None:
            raise VariableNotFoundError(f"{name} has no value in profile '{self._profile}'")
        raise VariableNotFoundError(f"{name} is not set in profile '{self._profile}'")

    def __getattr__(self, name: str) -> Any:
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]

    def __contains__(self, name: object) -> bool:
        if not isinstance(name, str):
            return False
        var = self._variables.get(name)
        return (var is not None and var.raw is not None) or name in self._defaults

    def __iter__(self) -> Iterator[str]:
        names = {n for n, v in self._variables.items() if v.raw is not None} | set(self._defaults)
        return iter(sorted(names))

    def __len__(self) -> int:
        return sum(1 for _ in self)

    def __dir__(self) -> List[str]:
        return sorted(set(super().__dir__()) | set(self))

    def __repr__(self) -> str:
        return f"Vars(profile={self._profile!r}, names={list(self)!r})"
