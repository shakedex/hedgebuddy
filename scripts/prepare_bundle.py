#!/usr/bin/env python3
"""Place the files the desktop app's installer ships with (spec section 8).

    python scripts/prepare_bundle.py               # build the CLI and the wheel, then place them
    python scripts/prepare_bundle.py --skip-build  # place the ones already built

It puts, for `tauri build --config tauri.bundle.conf.json` in crates/app:

    crates/app/binaries/hedgebuddy-<host triple>[.exe]
        the `hedgebuddy` command, built with `cargo build --release -p hedgebuddy-cli`.
        Tauri's externalBin wants the target triple in the name; it installs
        the file as `hedgebuddy[.exe]` beside the app.
    crates/app/bundle/wheel/hedgebuddy-<VERSION>-py3-none-any.whl
        the Python package, built with `uv build --wheel` in python/. Tauri
        installs it as the resource `wheel/<same name>`.

Both folders are git-ignored and cleared before each run. VERSION (the repo
root file) names the wheel; the placed command must report the same version.
Runs from any folder; stdlib only, Python 3.9+.
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List, NoReturn

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "crates" / "app"
BINARIES = APP / "binaries"
WHEEL_DIR = APP / "bundle" / "wheel"
PYTHON = ROOT / "python"


def fail(message: str) -> NoReturn:
    sys.exit(f"prepare_bundle: {message}")


def run(argv: List[str], cwd: Path) -> None:
    """Run `argv` in `cwd`, showing its output; stop on failure."""
    print(f"$ {' '.join(argv)}  (in {cwd.relative_to(ROOT)})", flush=True)
    try:
        result = subprocess.run(argv, cwd=cwd)
    except FileNotFoundError:
        fail(f"'{argv[0]}' was not found; install it and run this again")
    if result.returncode != 0:
        fail(f"'{' '.join(argv)}' failed (exit {result.returncode})")


def capture(argv: List[str]) -> str:
    """Run `argv` and return its stdout."""
    try:
        result = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True)
    except FileNotFoundError:
        fail(f"'{argv[0]}' was not found; install it and run this again")
    if result.returncode != 0:
        fail(f"'{' '.join(argv)}' failed (exit {result.returncode}): {result.stderr.strip()}")
    return result.stdout


def read_version() -> str:
    try:
        version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    except OSError as e:
        fail(f"could not read VERSION: {e}")
    if not version:
        fail("VERSION is empty")
    return version


def host_triple() -> str:
    for line in capture(["rustc", "-vV"]).splitlines():
        if line.startswith("host:"):
            return line.split(":", 1)[1].strip()
    fail("'rustc -vV' printed no 'host:' line")


def target_dir() -> Path:
    custom = os.environ.get("CARGO_TARGET_DIR")
    return Path(custom) if custom else ROOT / "target"


def fresh_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)


def place_binary(version: str, build: bool) -> Path:
    if build:
        run(["cargo", "build", "--release", "-p", "hedgebuddy-cli"], ROOT)
    triple = host_triple()
    suffix = ".exe" if "windows" in triple else ""
    source = target_dir() / "release" / f"hedgebuddy{suffix}"
    if not source.is_file():
        fail(f"{source} is missing; run without --skip-build")
    reported = capture([str(source), "--version"]).strip()
    if reported.split()[-1:] != [version]:
        fail(f"{source} reports '{reported}', not version {version}; run without --skip-build")
    fresh_dir(BINARIES)
    dest = BINARIES / f"hedgebuddy-{triple}{suffix}"
    shutil.copy2(source, dest)
    return dest


def place_wheel(version: str, build: bool) -> Path:
    if build:
        run(["uv", "build", "--wheel"], PYTHON)
    name = f"hedgebuddy-{version}-py3-none-any.whl"
    source = PYTHON / "dist" / name
    if not source.is_file():
        hint = "run without --skip-build" if not build else "check the uv build output above"
        fail(f"{source} is missing; {hint}")
    fresh_dir(WHEEL_DIR)
    dest = WHEEL_DIR / name
    shutil.copy2(source, dest)
    return dest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="reuse target/release/hedgebuddy and python/dist's wheel instead of building them",
    )
    args = parser.parse_args()
    version = read_version()
    build = not args.skip_build
    binary = place_binary(version, build)
    wheel = place_wheel(version, build)
    print(f"placed {binary.relative_to(ROOT)}")
    print(f"placed {wheel.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
