#!/usr/bin/env python3
"""Sync the version from the root VERSION file to all project files.

Usage:
    python scripts/sync_version.py              # Print current version
    python scripts/sync_version.py --set 0.8.0  # Set version everywhere
    python scripts/sync_version.py --bump minor  # Bump and propagate
    python scripts/sync_version.py --check       # Verify all files match (CI)
"""

import argparse
import re
import sys
from pathlib import Path

# Project root is one level up from this script
ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "VERSION"

# Each target: (relative path, regex pattern to find, replacement template)
# The regex must have a capture group around the version digits.
TARGETS = [
    (
        "app/FyneApp.toml",
        r'(Version\s*=\s*")[^"]*(")',
        r'\g<1>{version}\2',
    ),
    (
        "app/internal/ui/constants.go",
        r'(AppVersion\s*=\s*")[^"]*(")',
        r'\g<1>{version}\2',
    ),
    (
        "python-lib/pyproject.toml",
        r'^(version\s*=\s*")[^"]*(")',
        r'\g<1>{version}\2',
    ),
    (
        "python-lib/hedgebuddy/__init__.py",
        r'(__version__\s*=\s*")[^"]*(")',
        r'\g<1>{version}\2',
    ),
]


def read_version() -> str:
    """Read the current version from the root VERSION file."""
    return VERSION_FILE.read_text().strip()


def write_version(version: str) -> None:
    """Write version to the root VERSION file."""
    VERSION_FILE.write_text(version + "\n")


def bump(current: str, part: str) -> str:
    """Bump a semver component: major, minor, or patch."""
    parts = current.split(".")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        print(f"Error: '{current}' is not a valid semver (X.Y.Z)", file=sys.stderr)
        sys.exit(1)
    major, minor, patch = (int(p) for p in parts)
    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    if part == "patch":
        return f"{major}.{minor}.{patch + 1}"
    print(f"Error: unknown bump part '{part}' (use major, minor, or patch)", file=sys.stderr)
    sys.exit(1)


def validate_semver(version: str) -> None:
    """Exit if version is not a valid X.Y.Z string."""
    if not re.match(r"^\d+\.\d+\.\d+$", version):
        print(f"Error: '{version}' is not a valid semver (X.Y.Z)", file=sys.stderr)
        sys.exit(1)


def propagate(version: str) -> None:
    """Update all target files with the given version."""
    for rel_path, pattern, replacement in TARGETS:
        path = ROOT / rel_path
        if not path.exists():
            print(f"  SKIP  {rel_path} (file not found)")
            continue
        original = path.read_text()
        updated = re.sub(pattern, replacement.format(version=version), original, count=1, flags=re.MULTILINE)
        if original == updated:
            # Check if it's because the version already matches
            match = re.search(pattern, original, flags=re.MULTILINE)
            if match:
                print(f"  OK    {rel_path} (already {version})")
            else:
                print(f"  SKIP  {rel_path} (no match for pattern)")
        else:
            path.write_text(updated)
            print(f"  OK    {rel_path} -> {version}")


def check(version: str) -> bool:
    """Verify all target files contain the expected version. Returns True if all match."""
    ok = True
    for rel_path, pattern, _ in TARGETS:
        path = ROOT / rel_path
        if not path.exists():
            print(f"  MISS  {rel_path} (file not found)")
            ok = False
            continue
        content = path.read_text()
        match = re.search(pattern, content, flags=re.MULTILINE)
        if not match:
            print(f"  FAIL  {rel_path} (pattern not found)")
            ok = False
            continue
        # Extract the version from between the two capture groups
        found = content[match.start(1) + len(match.group(1)):match.start(2)]
        if found == version:
            print(f"  OK    {rel_path} = {found}")
        else:
            print(f"  FAIL  {rel_path} = {found} (expected {version})")
            ok = False
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync project version across all files.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--set", metavar="X.Y.Z", help="Set version to this value")
    group.add_argument("--bump", choices=["major", "minor", "patch"], help="Bump semver component")
    group.add_argument("--check", action="store_true", help="Verify all files match VERSION")
    args = parser.parse_args()

    if args.set:
        validate_semver(args.set)
        write_version(args.set)
        print(f"Version set to {args.set}")
        propagate(args.set)
    elif args.bump:
        current = read_version()
        new_version = bump(current, args.bump)
        write_version(new_version)
        print(f"Version bumped: {current} -> {new_version}")
        propagate(new_version)
    elif args.check:
        version = read_version()
        print(f"Checking all files match VERSION = {version}")
        if check(version):
            print("All files in sync.")
        else:
            print("Version mismatch detected!", file=sys.stderr)
            sys.exit(1)
    else:
        print(read_version())


if __name__ == "__main__":
    main()
