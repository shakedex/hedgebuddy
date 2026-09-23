"""The ``@hb.script`` decorator and ``hb.event()``."""

from __future__ import annotations

import sys
import traceback
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Sequence

from . import _runs
from ._errors import HedgeBuddyError, ManifestError, VariableNotFoundError, VariableTypeError, _warn
from ._event import Event, parse_event
from ._manifest import Manifest, check_requirements, parse_manifest
from ._paths import data_dir
from ._store import load_variables, resolve_profile
from ._values import convert
from ._vars import Vars

Main = Callable[[Event, Vars], Any]


def read_manifest(source_path: Optional[str]) -> Optional[Manifest]:
    """The manifest of the script at ``source_path``. ``None`` without a
    manifest, and without a real file: a console-script launcher's
    ``__main__`` (for example ``pytest.exe\\__main__.py``) is not one."""
    if not source_path or not Path(source_path).is_file():
        return None
    try:
        source = Path(source_path).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as e:
        raise ManifestError(f"cannot read {source_path}: {e}") from e
    return parse_manifest(source)


def _exit_code(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, int):
        if not 0 <= value <= 255:  # the range an exit code has on every platform
            raise ValueError(f"main must return an exit code from 0 to 255, not {value}")
        return int(value)
    raise TypeError(f"main must return None or an int exit code, not {type(value).__name__}")


def _system_exit_code(exc: SystemExit) -> int:
    code = exc.code
    if code is None:
        return 0
    if isinstance(code, int):
        return int(code)
    _warn(code)
    return 1


def run(func: Main, *, source_path: Optional[str], argv: Sequence[str]) -> int:
    """Everything ``@hb.script`` does except exiting; returns the exit code."""
    script_name = Path(source_path).name if source_path else getattr(func, "__name__", "script")
    try:
        root = data_dir()
        profile = resolve_profile(root)
    except HedgeBuddyError as e:
        _warn(f"hedgebuddy: {e}")
        return 1

    manifest: Optional[Manifest] = None
    manifest_error: Optional[ManifestError] = None
    try:
        manifest = read_manifest(source_path)
    except ManifestError as e:
        manifest_error = e

    run_log = _runs.RunLog(root)
    run_log.start(
        script=script_name,
        profile=profile,
        app=manifest.app if manifest else None,
        event=manifest.event if manifest else None,
    )
    _runs.set_current(run_log)
    try:
        if manifest_error is not None:
            raise manifest_error
        variables = load_variables(root, profile)
        # Keep secret values out of the run record and the stderr traceback.
        run_log.hide(v.raw for v in variables.values() if v.type == "secret")
        defaults: Dict[str, Any] = {}
        if manifest is not None:
            declared = {n: v.type for n, v in variables.items() if v.raw is not None}
            issues = check_requirements(manifest, declared)
            missing = [i.name for i in issues if i.kind == "missing"]
            if missing:
                raise VariableNotFoundError(f"this script requires {', '.join(missing)}, not set in profile '{profile}'")
            mismatched = [i for i in issues if i.kind == "type_mismatch"]
            if mismatched:
                raise VariableTypeError(
                    "; ".join(f"{i.name} must be {i.expected} but profile '{profile}' declares {i.actual}" for i in mismatched)
                )
            for name in sorted(manifest.requires):
                if name in declared:
                    convert(name, variables[name].type, variables[name].raw)
            defaults = {n: r.default for n, r in manifest.requires.items() if r.has_default}
        event = parse_event(argv, manifest)
        code = _exit_code(func(event, Vars(variables, profile, defaults)))
    except SystemExit as e:
        code = _system_exit_code(e)
    except BaseException:
        text = run_log.mask(traceback.format_exc())
        run_log.end("error", 1, text)
        try:
            print(text, end="", file=sys.stderr)
        except Exception:
            pass
        return 1
    finally:
        _runs.set_current(None)
    run_log.end("ok" if code == 0 else "failed", code)
    return code


def script(func: Main) -> Main:
    """Run ``func(event, vars)`` as a HedgeBuddy script.

    When ``func``'s module is the program being run, this reads the manifest
    from the script's docstring, checks the required variables, parses the
    event in ``sys.argv[1]``, records the run, calls ``func`` and exits with
    its return value (``None`` means 0). When the module is imported (for
    example by a test), ``func`` is returned unchanged.

    ``func`` runs immediately, while the module is still being executed at
    the ``@hb.script`` line -- so the decorated function must be the last
    top-level definition in the file. Anything defined below it (helpers,
    constants, further imports) has not run yet, so referencing it from
    inside the function raises ``NameError``. Put imports and helper
    definitions above the decorated function.
    """
    if getattr(func, "__module__", None) != "__main__":
        return func
    module = sys.modules.get("__main__")
    sys.exit(run(func, source_path=getattr(module, "__file__", None), argv=sys.argv))


def event(argv: Optional[Sequence[str]] = None) -> Event:
    """The event in ``sys.argv[1]`` for scripts that do not use ``@hb.script``."""
    module = sys.modules.get("__main__")
    manifest = read_manifest(getattr(module, "__file__", None))
    return parse_event(sys.argv if argv is None else argv, manifest)
