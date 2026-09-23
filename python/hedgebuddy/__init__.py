"""HedgeBuddy for Python scripts run by Hedge apps."""

from ._errors import (
    HedgeBuddyError,
    ManifestError,
    StorageCorruptedError,
    StorageNotFoundError,
    VariableNotFoundError,
    VariableTypeError,
)

__version__ = "0.11.0"

__all__ = [
    "HedgeBuddyError",
    "ManifestError",
    "StorageCorruptedError",
    "StorageNotFoundError",
    "VariableNotFoundError",
    "VariableTypeError",
    "__version__",
]
