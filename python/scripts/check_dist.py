"""Check python/dist after `uv build`: one wheel and one sdist of the current
version, the wheel holding exactly the package files and no dependencies."""

import re
import sys
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "__init__.py",
    "_api.py",
    "_errors.py",
    "_event.py",
    "_lock.py",
    "_manifest.py",
    "_paths.py",
    "_runs.py",
    "_script.py",
    "_store.py",
    "_values.py",
    "_vars.py",
    "py.typed",
}


def main() -> int:
    init = (ROOT / "hedgebuddy" / "__init__.py").read_text(encoding="utf-8")
    version = re.search(r'^__version__\s*=\s*"([^"]+)"', init, re.MULTILINE).group(1)
    wheels = sorted((ROOT / "dist").glob(f"hedgebuddy-{version}-*.whl"))
    sdists = sorted((ROOT / "dist").glob(f"hedgebuddy-{version}.tar.gz"))
    if len(wheels) != 1 or len(sdists) != 1:
        print(f"expected one wheel and one sdist for {version}, found {wheels} and {sdists}")
        return 1
    problems = []
    with zipfile.ZipFile(wheels[0]) as wheel:
        names = set(wheel.namelist())
        dist_info = f"hedgebuddy-{version}.dist-info/"
        package = {n.split("/", 1)[1] for n in names if n.startswith("hedgebuddy/")}
        if package != FILES:
            problems.append(f"wheel package files differ: extra {sorted(package - FILES)}, missing {sorted(FILES - package)}")
        stray = sorted(n for n in names if not (n.startswith("hedgebuddy/") or n.startswith(dist_info)))
        if stray:
            problems.append(f"unexpected files in the wheel: {stray}")
        metadata = wheel.read(dist_info + "METADATA").decode("utf-8")
        if "Requires-Python: >=3.9" not in metadata:
            problems.append("wheel metadata lacks Requires-Python: >=3.9")
        if "Requires-Dist:" in metadata:
            problems.append("wheel declares dependencies; the package must have none")
    with tarfile.open(sdists[0]) as sdist:
        if f"hedgebuddy-{version}/pyproject.toml" not in sdist.getnames():
            problems.append("sdist lacks pyproject.toml")
    for problem in problems:
        print(problem)
    if not problems:
        print(f"{wheels[0].name} and {sdists[0].name} look right")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
