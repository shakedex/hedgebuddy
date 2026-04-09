"""HedgeBuddy - Cross-platform environment variable management for Python scripts.

This library reads environment variables stored by the HedgeBuddy desktop app,
providing a clean alternative to system environment variables.

Basic usage:
    >>> from hedgebuddy import var
    >>> api_key = var("API_KEY")
    >>> report_path = var("REPORT_PATH")

Advanced usage:
    >>> from hedgebuddy import get, exists, all_vars
    >>> api_key = get("API_KEY", default="fallback-key")
    >>> if exists("OPTIONAL_VAR"):
    ...     value = var("OPTIONAL_VAR")
    >>> all_variables = all_vars()

Logging (for headless scripts):
    >>> from hedgebuddy import enable_logging
    >>> enable_logging()  # All print() now logged to daily file
    >>> print("This gets logged automatically!")
"""

from .core import var, get, exists, all_vars, inject_env
from .exceptions import (
    HedgeBuddyError,
    VariableNotFoundError,
    StorageNotFoundError,
    StorageCorruptedError,
)
from .logger import (
    enable_logging,
    disable_logging,
    log,
    log_error,
    log_warning,
    log_debug,
    get_log_dir,
    is_logging_enabled,
)

__version__ = "0.8.5"
__all__ = [
    "var",
    "get",
    "exists",
    "all_vars",
    "inject_env",
    "HedgeBuddyError",
    "VariableNotFoundError",
    "StorageNotFoundError",
    "StorageCorruptedError",
    "enable_logging",
    "disable_logging",
    "log",
    "log_error",
    "log_warning",
    "log_debug",
    "get_log_dir",
    "is_logging_enabled",
]
