"""Every test runs against its own empty data directory, never the real one."""

from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def hb_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "HedgeBuddy"
    root.mkdir()
    monkeypatch.setenv("HEDGEBUDDY_DATA_DIR", str(root))
    return root
