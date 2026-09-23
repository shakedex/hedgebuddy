"""The event payload Hedge apps pass to scripts as JSON in ``sys.argv[1]``."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, Dict, Iterator, Mapping, Optional, Sequence

if TYPE_CHECKING:
    from ._manifest import Manifest


def _decode(value: Any) -> Any:
    """A string holding a JSON object or array is decoded; anything else is kept."""
    if isinstance(value, str) and value.lstrip()[:1] in ("{", "["):
        try:
            decoded = json.loads(value)
        except ValueError:
            return value
        if isinstance(decoded, (dict, list)):
            return decoded
    return value


def _infer_name(raw: Mapping[str, Any]) -> Optional[str]:
    """The event name when every key starts with the same ``<Name>_`` prefix."""
    prefixes = set()
    for key in raw:
        head, sep, _ = key.partition("_")
        if not sep or not head:
            return None
        prefixes.add(head)
    return prefixes.pop() if len(prefixes) == 1 else None


class Event:
    """One Hedge app event.

    Fields are the payload keys without their ``<EventName>_`` prefix, read as
    attributes (``event.state``) or items (``event["state"]``). String values
    holding a JSON object or array are decoded. ``raw`` is the original
    payload; ``app`` and ``name`` come from the script's manifest, or ``name``
    from the key prefix when there is no manifest. A field named like one of
    those attributes (``raw``, ``app``, ``name``, ``get``) is read with
    ``event["name"]``.
    """

    def __init__(self, raw: Mapping[str, Any], name: Optional[str] = None, app: Optional[str] = None) -> None:
        self.raw: Dict[str, Any] = dict(raw)
        self.app = app
        self.name = name if name is not None else _infer_name(self.raw)
        prefix = f"{self.name}_" if self.name else ""
        fields: Dict[str, Any] = {}
        for key, value in self.raw.items():
            short = key[len(prefix):] if prefix and key.startswith(prefix) and len(key) > len(prefix) else key
            fields[short] = _decode(value)
        self._fields = fields

    def __getattr__(self, attr: str) -> Any:
        if attr.startswith("_"):
            raise AttributeError(attr)
        try:
            return self._fields[attr]
        except KeyError:
            available = ", ".join(sorted(self._fields)) or "none"
            raise AttributeError(f"{self.name or 'the event'} has no field {attr!r}; fields: {available}") from None

    def __getitem__(self, key: str) -> Any:
        return self._fields[key]

    def __contains__(self, key: object) -> bool:
        return key in self._fields

    def __iter__(self) -> Iterator[str]:
        return iter(self._fields)

    def __len__(self) -> int:
        return len(self._fields)

    def get(self, key: str, default: Any = None) -> Any:
        """A field, or ``default`` when the payload does not have it."""
        return self._fields.get(key, default)

    def __repr__(self) -> str:
        return f"Event(app={self.app!r}, name={self.name!r}, fields={sorted(self._fields)!r})"


def parse_event(argv: Sequence[str], manifest: Optional[Manifest] = None) -> Event:
    """The event in ``argv[1]``. A missing or blank argument is an empty payload."""
    text = argv[1] if len(argv) > 1 else ""
    if text.strip():
        try:
            raw = json.loads(text)
        except ValueError as e:
            raise ValueError(f"the event payload in sys.argv[1] is not JSON: {e}") from e
        if not isinstance(raw, dict):
            raise ValueError("the event payload in sys.argv[1] must be a JSON object")
    else:
        raw = {}
    return Event(raw, name=manifest.event if manifest else None, app=manifest.app if manifest else None)
