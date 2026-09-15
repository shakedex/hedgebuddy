#!/usr/bin/env python3
"""Keep the version identical everywhere it is declared.

    python scripts/sync_version.py            # print the version from VERSION
    python scripts/sync_version.py --check    # exit 1 if any target disagrees with VERSION
    python scripts/sync_version.py --set 0.12.0

The root VERSION file is the source of truth. `--set` rewrites VERSION and every
target, then prints the follow-up commands that refresh lock files.
"""

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "VERSION"

# (relative path, regex with the version in group 2, human label)
# Group 1 is the prefix to keep, group 3 the suffix to keep.
TARGETS = [
    ("Cargo.toml", r'(^version\s*=\s*")([^"]+)(")', "workspace package version"),
    ("python/pyproject.toml", r'(^version\s*=\s*")([^"]+)(")', "python package version"),
    ("python/hedgebuddy/__init__.py", r'(^__version__\s*=\s*")([^"]+)(")', "python __version__"),
    ("crates/app/tauri.conf.json", r'(^\s*"version"\s*:\s*")([^"]+)(")', "tauri.conf.json version"),
    ("crates/app/ui/package.json", r'(^\s*"version"\s*:\s*")([^"]+)(")', "ui package.json version"),
]

SEMVER = re.compile(r"^0\.\d+\.\d+$")  # ZeroVer: major is always 0


def read_version() -> str:
    return VERSION_FILE.read_text(encoding="utf-8").strip()


def find(path: Path, pattern: str) -> str:
    m = re.search(pattern, path.read_text(encoding="utf-8"), flags=re.MULTILINE)
    if not m:
        sys.exit(f"pattern not found in {path.relative_to(ROOT)}")
    return m.group(2)


def replace(path: Path, pattern: str, version: str) -> None:
    text = path.read_text(encoding="utf-8")
    new, n = re.subn(pattern, lambda m: f"{m.group(1)}{version}{m.group(3)}", text, count=1, flags=re.MULTILINE)
    if n != 1:
        sys.exit(f"pattern not found in {path.relative_to(ROOT)}")
    path.write_text(new, encoding="utf-8")


def check() -> int:
    expected = read_version()
    bad = 0
    for rel, pattern, label in TARGETS:
        actual = find(ROOT / rel, pattern)
        status = "ok " if actual == expected else "BAD"
        if actual != expected:
            bad += 1
        print(f"{status}  {label:28} {actual:10} ({rel})")
    print(f"VERSION = {expected}")
    return 1 if bad else 0


def set_version(version: str) -> None:
    if not SEMVER.match(version):
        sys.exit(f"'{version}' is not a ZeroVer version (0.MINOR.PATCH)")
    VERSION_FILE.write_text(version + "\n", encoding="utf-8")
    for rel, pattern, _ in TARGETS:
        replace(ROOT / rel, pattern, version)
    print(f"set {version} in VERSION and {len(TARGETS)} targets")
    print("now refresh lock files:")
    print("  cargo update --workspace")
    print("  (cd python && uv lock)")
    print("  (cd crates/app/ui && bun install)")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group()
    g.add_argument("--check", action="store_true")
    g.add_argument("--set", metavar="VERSION")
    a = p.parse_args()
    if a.check:
        return check()
    if a.set:
        set_version(a.set)
        return 0
    print(read_version())
    return 0


if __name__ == "__main__":
    sys.exit(main())
