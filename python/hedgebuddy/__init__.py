"""HedgeBuddy for Python scripts run by Hedge apps."""

from ._api import all_vars, exists, inject_env, var
from ._errors import (
    HedgeBuddyError,
    ManifestError,
    StorageCorruptedError,
    StorageNotFoundError,
    VariableNotFoundError,
    VariableTypeError,
)
from ._event import Event
from ._runs import log
from ._vars import Vars

__version__ = "0.11.0"

__all__ = [
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
    "exists",
    "inject_env",
    "log",
    "var",
]
