#!/usr/bin/env python3
"""Check that an app bundle ships the `hedgebuddy` command and the wheel where
the app looks for them (spec section 8; `bundle()` in crates/app/src/commands.rs:
the command beside the app's executable, the wheel in the resource folder's
`wheel/`).

    python scripts/check_bundle.py target

Run after `python scripts/prepare_bundle.py` and, in crates/app,
`tauri build --config tauri.bundle.conf.json --bundles nsis` (Windows) or
`--bundles app` (macOS). <target-dir> is the Cargo target folder.

Layout confirmed by real builds (V is the VERSION file):

Windows (tauri-cli 2.11, NSIS; CI pins @tauri-apps/cli to one 2.11 release,
since the installer-script checks below match that CLI's wording):
    target/release/hedgebuddy-app.exe                 the app
    target/release/hedgebuddy.exe                     cargo's own build of the command, beside
        the app; always there after prepare_bundle.py, so it says nothing about the installer
    crates/app/binaries/hedgebuddy-<host triple>.exe  the sidecar the installer packs, placed by
        prepare_bundle.py; its --version is the one checked
    target/release/wheel/hedgebuddy-V-py3-none-any.whl  the resource, copied by the build
    target/release/bundle/nsis/HedgeBuddy_V_<arch>-setup.exe  the installer
    target/release/nsis/<arch>/installer.nsi          the script it was made from, which
        installs, all into $INSTDIR (Tauri's resource folder on Windows):
        hedgebuddy-app.exe, hedgebuddy.exe (from crates/app/binaries/hedgebuddy-<host triple>.exe)
        and wheel\\hedgebuddy-V-py3-none-any.whl

macOS (app bundle):
    target/release/bundle/macos/HedgeBuddy.app/Contents/MacOS/hedgebuddy-app  the app
    target/release/bundle/macos/HedgeBuddy.app/Contents/MacOS/hedgebuddy      the sidecar
    target/release/bundle/macos/HedgeBuddy.app/Contents/Resources/wheel/hedgebuddy-V-py3-none-any.whl

Each check also runs the packed command's `--version` and reads the wheel's
metadata, and both must name VERSION. Stdlib only (plus `rustc -vV` on Windows,
for the host triple in the sidecar's name), Python 3.9+.
"""

import argparse
import os
import re
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import List, NoReturn

ROOT = Path(__file__).resolve().parent.parent
DESCRIPTION = (
    "Check that an app bundle ships the hedgebuddy command and the wheel "
    "where the app looks for them."
)
# How long the packed command's --version, or rustc -vV, may take, in seconds.
VERSION_TIMEOUT = 60
APP_NAME = "hedgebuddy-app"
PRODUCT = "HedgeBuddy"


class Checks:
    def __init__(self) -> None:
        self.failed: List[str] = []

    def ok(self, what: str) -> None:
        print(f"ok   {what}")

    def bad(self, what: str) -> None:
        print(f"BAD  {what}")
        self.failed.append(what)

    def file(self, path: Path, what: str) -> bool:
        if path.is_file():
            self.ok(f"{what}: {path}")
            return True
        self.bad(f"{what} missing: {path}")
        return False

    def command_version(self, path: Path, version: str) -> None:
        if not os.access(path, os.X_OK):
            self.bad(f"{path} is not executable")
            return
        try:
            out = subprocess.run(
                [str(path), "--version"], capture_output=True, text=True, timeout=VERSION_TIMEOUT
            )
        except OSError as e:
            self.bad(f"{path} --version could not run: {e}")
            return
        except subprocess.TimeoutExpired:
            self.bad(f"{path} --version took longer than {VERSION_TIMEOUT} seconds")
            return
        reported = out.stdout.strip()
        if out.returncode == 0 and reported.split()[-1:] == [version]:
            self.ok(f"{path.name} --version: {reported}")
        else:
            self.bad(f"{path} --version printed '{reported}' (exit {out.returncode}), not {version}")

    def wheel_version(self, path: Path, version: str) -> None:
        metadata = f"hedgebuddy-{version}.dist-info/METADATA"
        try:
            with zipfile.ZipFile(path) as wheel:
                text = wheel.read(metadata).decode("utf-8")
        except (OSError, KeyError, zipfile.BadZipFile) as e:
            self.bad(f"{path} has no readable {metadata}: {e}")
            return
        if re.search(rf"^Version: {re.escape(version)}$", text, flags=re.MULTILINE):
            self.ok(f"{path.name} metadata: Version {version}")
        else:
            self.bad(f"{path} metadata does not say Version: {version}")

    def contains(self, text: str, pattern: str, what: str) -> None:
        if re.search(pattern, text, flags=re.MULTILINE):
            self.ok(what)
        else:
            self.bad(f"{what} (no match for {pattern!r})")


def fail(message: str) -> NoReturn:
    sys.exit(f"check_bundle: {message}")


def wheel_name(version: str) -> str:
    return f"hedgebuddy-{version}-py3-none-any.whl"


def host_triple() -> str:
    """The Rust host triple, which names the sidecar prepare_bundle.py placed."""
    try:
        out = subprocess.run(
            ["rustc", "-vV"], capture_output=True, text=True, timeout=VERSION_TIMEOUT
        )
    except OSError as e:
        fail(f"'rustc -vV' could not run: {e}")
    except subprocess.TimeoutExpired:
        fail(f"'rustc -vV' took longer than {VERSION_TIMEOUT} seconds")
    if out.returncode != 0:
        fail(f"'rustc -vV' failed (exit {out.returncode}): {out.stderr.strip()}")
    for line in out.stdout.splitlines():
        if line.startswith("host:"):
            return line.split(":", 1)[1].strip()
    fail("'rustc -vV' printed no 'host:' line")


def check_windows(release: Path, version: str, c: Checks) -> None:
    app = release / f"{APP_NAME}.exe"
    built = release / "hedgebuddy.exe"
    sidecar_name = f"hedgebuddy-{host_triple()}.exe"
    sidecar = ROOT / "crates" / "app" / "binaries" / sidecar_name
    wheel = release / "wheel" / wheel_name(version)
    c.file(app, "app")
    c.file(built, "cargo's hedgebuddy.exe beside the built app (not the installer's copy)")
    if c.file(sidecar, "sidecar the installer packs"):
        c.command_version(sidecar, version)
    if c.file(wheel, "wheel resource"):
        c.wheel_version(wheel, version)

    installers = sorted((release / "bundle" / "nsis").glob(f"{PRODUCT}_{version}_*-setup.exe"))
    if len(installers) == 1:
        c.ok(f"installer: {installers[0]}")
    else:
        c.bad(f"expected one {PRODUCT}_{version}_*-setup.exe in bundle/nsis, found {len(installers)}")

    scripts = sorted((release / "nsis").glob("*/installer.nsi"))
    if len(scripts) != 1:
        c.bad(f"expected one nsis/<arch>/installer.nsi, found {len(scripts)}")
        return
    nsi = scripts[0].read_text(encoding="utf-8", errors="replace")
    c.ok(f"installer script: {scripts[0]}")
    c.contains(nsi, r"^\s*SetOutPath \$INSTDIR\s*$", "installs into $INSTDIR")
    c.contains(nsi, rf'^!define MAINBINARYNAME "{re.escape(APP_NAME)}"$', f"installs {APP_NAME}.exe")
    c.contains(
        nsi,
        rf'^\s*File /a "/oname=hedgebuddy\.exe" "[^"]*[\\/]binaries[\\/]{re.escape(sidecar_name)}"$',
        f"installs {sidecar_name} as $INSTDIR\\hedgebuddy.exe",
    )
    name = re.escape(wheel_name(version))
    c.contains(
        nsi,
        rf'^\s*File /a "/oname=wheel\\{name}" "[^"]*[\\/]bundle[\\/]wheel[\\/]{name}"$',
        f"installs the wheel as $INSTDIR\\wheel\\{wheel_name(version)}",
    )


def check_macos(release: Path, version: str, c: Checks) -> None:
    contents = release / "bundle" / "macos" / f"{PRODUCT}.app" / "Contents"
    app = contents / "MacOS" / APP_NAME
    sidecar = contents / "MacOS" / "hedgebuddy"
    wheel = contents / "Resources" / "wheel" / wheel_name(version)
    c.file(app, "app")
    if c.file(sidecar, "sidecar beside the app"):
        c.command_version(sidecar, version)
    if c.file(wheel, "wheel resource"):
        c.wheel_version(wheel, version)


def main() -> int:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("target_dir", type=Path, help="the Cargo target folder, e.g. target")
    args = parser.parse_args()
    try:
        version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    except OSError as e:
        fail(f"could not read VERSION: {e}")
    release = args.target_dir / "release"
    if not release.is_dir():
        fail(f"{release} is not a folder; build the bundle first")

    c = Checks()
    print(f"VERSION = {version}")
    if sys.platform == "win32":
        check_windows(release, version, c)
    elif sys.platform == "darwin":
        check_macos(release, version, c)
    else:
        fail(f"no bundle layout is defined for {sys.platform}")
    if c.failed:
        print(f"{len(c.failed)} check(s) failed", file=sys.stderr)
        return 1
    print("bundle ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
