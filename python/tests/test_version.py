from pathlib import Path

import hedgebuddy

ROOT = Path(__file__).resolve().parents[2]


def test_package_version_matches_root_version_file():
    assert hedgebuddy.__version__ == (ROOT / "VERSION").read_text(encoding="utf-8").strip()
