"""HedgeBuddy for Python scripts run by Hedge apps.

Typical use::

    import hedgebuddy as hb

    @hb.script
    def main(event, vars):
        hb.log(f"{event.name}: {vars.PROJECT_NAME}")

Guide: https://github.com/shakedex/hedgebuddy/tree/main/python
"""

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
from ._script import event, script
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
    "event",
    "exists",
    "inject_env",
    "log",
    "script",
    "var",
]
