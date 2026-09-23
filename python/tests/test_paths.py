import sys
from pathlib import Path

from hedgebuddy._paths import DATA_DIR_ENV, data_dir


def test_override_wins(monkeypatch, tmp_path):
    monkeypatch.setenv(DATA_DIR_ENV, str(tmp_path / "custom"))
    assert data_dir() == tmp_path / "custom"


def test_platform_defaults_match_core(monkeypatch):
    monkeypatch.setenv(DATA_DIR_ENV, "")  # empty means "not set", as in core
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setenv("APPDATA", str(Path("C:/Users/x/AppData/Roaming")))
    assert data_dir() == Path("C:/Users/x/AppData/Roaming") / "HedgeBuddy"
    monkeypatch.delenv("APPDATA")
    assert data_dir() == Path.home() / "AppData" / "Roaming" / "HedgeBuddy"

    monkeypatch.setattr(sys, "platform", "darwin")
    assert data_dir() == Path.home() / "Library" / "Application Support" / "HedgeBuddy"

    monkeypatch.setattr(sys, "platform", "linux")
    xdg = Path.home() / "xdg-config"
    monkeypatch.setenv("XDG_CONFIG_HOME", str(xdg))
    assert data_dir() == xdg / "HedgeBuddy"
    monkeypatch.setenv("XDG_CONFIG_HOME", "relative/dir")  # core ignores a relative XDG path
    assert data_dir() == Path.home() / ".config" / "HedgeBuddy"
