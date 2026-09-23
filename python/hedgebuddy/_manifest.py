"""The JSON manifest at the top of a script's module docstring (spec section 6).

Extraction matches schema/README.md and core's ``extract_manifest_text``.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional

from ._errors import ManifestError, VariableTypeError
from ._values import TYPES, convert

VAR_NAME = re.compile(r"^[A-Z][A-Z0-9_]*$")
_FIELDS = {"hedgebuddy", "app", "event", "requires"}
_REQUIREMENT_FIELDS = {"type", "description", "default"}


class _NoDefault:
    def __repr__(self) -> str:
        return "<no default>"


NO_DEFAULT: Any = _NoDefault()


@dataclass(frozen=True)
class Requirement:
    """One ``requires`` entry. ``default`` is already converted to its type."""

    type: str
    description: str = ""
    default: Any = NO_DEFAULT

    @property
    def has_default(self) -> bool:
        return self.default is not NO_DEFAULT


@dataclass(frozen=True)
class Manifest:
    """A parsed manifest."""

    app: Optional[str] = None
    event: Optional[str] = None
    requires: Dict[str, Requirement] = field(default_factory=dict)


@dataclass(frozen=True)
class RequirementIssue:
    """A requirement the profile does not satisfy: ``missing`` or ``type_mismatch``."""

    kind: str
    name: str
    expected: str
    actual: Optional[str] = None


def _lines(text: str) -> List[str]:
    """Split like Rust's ``str::lines``: on ``\\n``, dropping a trailing ``\\r``
    per line and the empty piece after a final newline."""
    parts = text.split("\n")
    if parts and parts[-1] == "":
        parts.pop()
    return [p[:-1] if p.endswith("\r") else p for p in parts]


def extract_manifest_text(source: str) -> Optional[str]:
    """The text before the ``---`` line of the module docstring, when that
    docstring starts with ``{``; ``None`` when the script has no manifest."""
    if source.startswith("\ufeff"):
        source = source[1:]
    lines = _lines(source)
    i = 0
    while i < len(lines) and (lines[i].strip() == "" or lines[i].lstrip().startswith("#")):
        i += 1
    body = "\n".join(lines[i:])
    head = body.lstrip()
    if head.startswith('"""'):
        quote = '"""'
    elif head.startswith("'''"):
        quote = "'''"
    else:
        return None
    start = body.index(quote) + len(quote)
    end = body.find(quote, start)
    if end < 0:
        return None
    doc = body[start:end]
    if not doc.lstrip().startswith("{"):
        return None
    kept = []
    for line in _lines(doc):
        if line.rstrip() == "---":
            break
        kept.append(line)
    return "\n".join(kept)


def parse_manifest(source: str) -> Optional[Manifest]:
    """The script's manifest; ``None`` without one; ``ManifestError`` when invalid."""
    text = extract_manifest_text(source)
    if text is None:
        return None
    try:
        data = json.loads(text.strip())
    except ValueError as e:
        raise ManifestError(f"the manifest is not valid JSON: {e}") from e
    if not isinstance(data, dict):
        raise ManifestError("the manifest must be a JSON object")
    unknown = sorted(set(data) - _FIELDS)
    if unknown:
        raise ManifestError(f"unknown manifest field(s): {', '.join(unknown)}")
    version = data.get("hedgebuddy")
    if type(version) is not int or version != 1:
        raise ManifestError(f"unsupported manifest version {version!r} (expected 1)")
    app, event = data.get("app"), data.get("event")
    for key, value in (("app", app), ("event", event)):
        if value is not None and not isinstance(value, str):
            raise ManifestError(f"'{key}' must be a string")
    if event is not None and app is None:
        raise ManifestError("'event' requires 'app'")
    raw_requires = data.get("requires", {})
    if not isinstance(raw_requires, dict):
        raise ManifestError("'requires' must be an object")
    requires: Dict[str, Requirement] = {}
    for name, spec in raw_requires.items():
        if not VAR_NAME.fullmatch(name):
            raise ManifestError(f"requirement name {name!r} must be UPPER_SNAKE_CASE")
        if not isinstance(spec, dict):
            raise ManifestError(f"requirement {name} must be an object")
        extra = sorted(set(spec) - _REQUIREMENT_FIELDS)
        if extra:
            raise ManifestError(f"requirement {name} has unknown field(s): {', '.join(extra)}")
        ty = spec.get("type")
        if ty not in TYPES:
            raise ManifestError(f"requirement {name} has unknown type {ty!r}")
        description = spec.get("description", "")
        if not isinstance(description, str):
            raise ManifestError(f"requirement {name}: description must be a string")
        default = NO_DEFAULT
        if spec.get("default") is not None:  # "default": null means no default, as in core
            try:
                default = convert(name, ty, spec["default"])
            except VariableTypeError as e:
                raise ManifestError(f"default for {name}: {e}") from e
        requires[name] = Requirement(ty, description, default)
    return Manifest(app, event, requires)


def check_requirements(manifest: Manifest, declared: Mapping[str, str]) -> List[RequirementIssue]:
    """Requirements not satisfied by ``declared`` (variable name to type),
    sorted by name. A requirement with a default is satisfied when absent."""
    issues = []
    for name in sorted(manifest.requires):
        req = manifest.requires[name]
        actual = declared.get(name)
        if actual == req.type:
            continue
        if actual is not None:
            issues.append(RequirementIssue("type_mismatch", name, req.type, actual))
        elif not req.has_default:
            issues.append(RequirementIssue("missing", name, req.type))
    return issues
