#!/usr/bin/env python3
"""Sync the Quills service version from service/VERSION to all service files.

Usage:
    python scripts/sync_quills_version.py              # Print current version
    python scripts/sync_quills_version.py --set 0.9.0  # Set version everywhere
    python scripts/sync_quills_version.py --bump minor  # Bump and propagate
    python scripts/sync_quills_version.py --check       # Verify all files match (CI)
"""

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "service" / "VERSION"

# Each target: (relative path, regex pattern to find, replacement template)
TARGETS = [
    (
        "service/internal/version/version.go",
        r'(Version\s*=\s*")[^"]*(")',
        r'\g<1>{version}\2',
    ),
    (
        "service/web/package.json",
        r'("version"\s*:\s*")[^"]*(")',
        r'\g<1>{version}\2',
    ),
]


def read_version() -> str:
    return VERSION_FILE.read_text().strip()


def write_version(version: str) -> None:
    VERSION_FILE.write_text(version + "\n")


def bump(current: str, part: str) -> str:
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
    if not re.match(r"^\d+\.\d+\.\d+$", version):
        print(f"Error: '{version}' is not a valid semver (X.Y.Z)", file=sys.stderr)
        sys.exit(1)


def propagate(version: str) -> None:
    for rel_path, pattern, replacement in TARGETS:
        path = ROOT / rel_path
        if not path.exists():
            print(f"  SKIP  {rel_path} (file not found)")
            continue
        original = path.read_text()
        updated = re.sub(pattern, replacement.format(version=version), original, count=1, flags=re.MULTILINE)
        if original == updated:
            match = re.search(pattern, original, flags=re.MULTILINE)
            if match:
                print(f"  OK    {rel_path} (already {version})")
            else:
                print(f"  SKIP  {rel_path} (no match for pattern)")
        else:
            path.write_text(updated)
            print(f"  OK    {rel_path} -> {version}")


def check(version: str) -> bool:
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
        found = content[match.start(1) + len(match.group(1)):match.start(2)]
        if found == version:
            print(f"  OK    {rel_path} = {found}")
        else:
            print(f"  FAIL  {rel_path} = {found} (expected {version})")
            ok = False
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Quills service version across all service files.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--set", metavar="X.Y.Z", help="Set version to this value")
    group.add_argument("--bump", choices=["major", "minor", "patch"], help="Bump semver component")
    group.add_argument("--check", action="store_true", help="Verify all files match service/VERSION")
    args = parser.parse_args()

    if args.set:
        validate_semver(args.set)
        write_version(args.set)
        print(f"Quills version set to {args.set}")
        propagate(args.set)
    elif args.bump:
        current = read_version()
        new_version = bump(current, args.bump)
        write_version(new_version)
        print(f"Quills version bumped {current} -> {new_version}")
        propagate(new_version)
    elif args.check:
        version = read_version()
        print(f"Checking Quills version: {version}")
        if not check(version):
            sys.exit(1)
        print("All Quills version files match.")
    else:
        print(f"Quills version: {read_version()}")


if __name__ == "__main__":
    main()
