"""Where the HedgeBuddy data directory is (the same rules as the Rust core)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

DATA_DIR_ENV = "HEDGEBUDDY_DATA_DIR"


def data_dir() -> Path:
    """The HedgeBuddy data directory. A non-empty ``HEDGEBUDDY_DATA_DIR`` wins."""
    override = os.environ.get(DATA_DIR_ENV)
    if override:
        return Path(override)
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        base = Path(appdata) if appdata else Path.home() / "AppData" / "Roaming"
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        xdg = os.environ.get("XDG_CONFIG_HOME")
        base = Path(xdg) if xdg and os.path.isabs(xdg) else Path.home() / ".config"
    return base / "HedgeBuddy"
