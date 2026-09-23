import pytest

from hedgebuddy._errors import ManifestError
from hedgebuddy._manifest import Requirement, RequirementIssue, check_requirements, extract_manifest_text, parse_manifest
from tests.helpers import SCHEMA_ROOT

SCRIPTS = SCHEMA_ROOT / "fixtures" / "valid" / "basic" / "profiles" / "commercial-one-day" / "scripts"


def manifest(text: str) -> str:
    return f'"""\n{text}\n---\nProse.\n"""\n'


def test_fixture_manifests_parse():
    m = parse_manifest((SCRIPTS / "on_copy_complete.py").read_text(encoding="utf-8"))
    assert m.app == "offshoot"
    assert m.event == "FileCopyCompleted"
    assert m.requires["SLACK_WEBHOOK"] == Requirement("secret", "Incoming webhook URL")
    assert not m.requires["SLACK_WEBHOOK"].has_default
    assert m.requires["PROJECT_NAME"].default == "Untitled"
    d = parse_manifest((SCRIPTS / "on_disk_added.py").read_text(encoding="utf-8"))
    assert d.event == "DiskAdded"
    assert d.requires["NOTIFY"].default is True


@pytest.mark.parametrize(
    "source",
    [
        "print('x')\n",
        '"""Just prose."""\n',
        "# comment\nx = 1\n",
        '"""\n{"hedgebuddy": 1}\n',  # docstring never closed
        "x = '''{\"hedgebuddy\": 1}'''\n",  # first statement is not a docstring
    ],
)
def test_no_manifest(source):
    assert parse_manifest(source) is None


def test_extraction_follows_the_shared_rules():
    source = "\ufeff# comment\n\n'''\n{\"hedgebuddy\": 1}\n---   \nprose\n'''\n"
    assert extract_manifest_text(source) == '\n{"hedgebuddy": 1}'
    crlf = '"""\r\n{"hedgebuddy": 1}\r\n---\r\n"""\r\n'
    assert extract_manifest_text(crlf) == '\n{"hedgebuddy": 1}'


def test_optional_app_and_event():
    m = parse_manifest(manifest('{"hedgebuddy": 1}'))
    assert m.app is None and m.event is None and m.requires == {}


@pytest.mark.parametrize(
    "text,message",
    [
        ("{not json", "not valid JSON"),
        ('{"hedgebuddy": 2}', "unsupported manifest version"),
        ('{"hedgebuddy": true}', "unsupported manifest version"),
        ('{"app": "offshoot"}', "unsupported manifest version"),
        ('{"hedgebuddy": 1, "event": "DiskAdded"}', "'event' requires 'app'"),
        ('{"hedgebuddy": 1, "app": 3}', "'app' must be a string"),
        ('{"hedgebuddy": 1, "color": "red"}', "unknown manifest field"),
        ('{"hedgebuddy": 1, "requires": []}', "'requires' must be an object"),
        ('{"hedgebuddy": 1, "requires": {"lower": {"type": "string"}}}', "UPPER_SNAKE_CASE"),
        ('{"hedgebuddy": 1, "requires": {"X": "string"}}', "requirement X must be an object"),
        ('{"hedgebuddy": 1, "requires": {"X": {"type": "date"}}}', "unknown type"),
        ('{"hedgebuddy": 1, "requires": {"X": {"type": "string", "optional": true}}}', "unknown field"),
        ('{"hedgebuddy": 1, "requires": {"X": {"type": "string", "description": 3}}}', "description"),
        ('{"hedgebuddy": 1, "requires": {"X": {"type": "int", "default": "3"}}}', "default for X"),
        ('{"hedgebuddy": 1, "requires": {"PORT": {"type": "int", "default": "8080"}}}', "default for PORT"),
        ('{"hedgebuddy": 1, "requires": {"X": {"type": "secret", "default": 5}}}', "default for X"),
    ],
)
def test_invalid_manifests(text, message):
    with pytest.raises(ManifestError, match=message):
        parse_manifest(manifest(text))


def test_requirement_name_rejects_a_trailing_newline():
    # `$` matches just before a trailing newline in Python regexes; the name
    # check must use `fullmatch` so this is rejected like core rejects it.
    with pytest.raises(ManifestError, match="UPPER_SNAKE_CASE"):
        parse_manifest(manifest('{"hedgebuddy": 1, "requires": {"AB\\n": {"type": "string"}}}'))


def test_defaults_are_converted_to_their_type():
    m = parse_manifest(manifest('{"hedgebuddy": 1, "requires": {"ROOT": {"type": "path", "default": "D:/A"}}}'))
    assert str(m.requires["ROOT"].default).replace("\\", "/") == "D:/A"


def test_a_null_default_means_no_default():
    m = parse_manifest(manifest('{"hedgebuddy": 1, "requires": {"PORT": {"type": "int", "default": null}}}'))
    assert not m.requires["PORT"].has_default
    assert check_requirements(m, {}) == [RequirementIssue("missing", "PORT", "int")]


def test_check_requirements():
    m = parse_manifest(
        manifest(
            '{"hedgebuddy": 1, "requires": {"B": {"type": "int"}, "A": {"type": "string"},'
            ' "C": {"type": "bool", "default": false}, "D": {"type": "path"}}}'
        )
    )
    assert check_requirements(m, {"A": "string", "B": "string"}) == [
        RequirementIssue("type_mismatch", "B", "int", "string"),
        RequirementIssue("missing", "D", "path"),
    ]
