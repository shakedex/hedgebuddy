import pytest

from hedgebuddy._errors import StorageCorruptedError, StorageNotFoundError
from hedgebuddy._store import Variable, active_profile, load_variables, profile_names, resolve_profile
from tests.helpers import write_profile


def test_missing_index_means_no_active_profile(hb_root):
    assert active_profile(hb_root) is None
    with pytest.raises(StorageNotFoundError, match="no active HedgeBuddy profile"):
        resolve_profile(hb_root)


def test_null_active_profile(hb_root):
    (hb_root / "hedgebuddy.json").write_text('{"version": 1, "active_profile": null}', encoding="utf-8")
    assert active_profile(hb_root) is None


def test_active_profile(hb_root):
    write_profile(hb_root, "commercial-one-day", {})
    assert active_profile(hb_root) == "commercial-one-day"
    assert resolve_profile(hb_root) == "commercial-one-day"


@pytest.mark.parametrize(
    "text",
    [
        "not json",
        "[]",
        '{"version": 2, "active_profile": null}',
        '{"version": true, "active_profile": null}',
        '{"version": 1, "active_profile": "../evil"}',
        '{"version": 1, "active_profile": 3}',
    ],
)
def test_bad_index_is_corrupted(hb_root, text):
    (hb_root / "hedgebuddy.json").write_text(text, encoding="utf-8")
    with pytest.raises(StorageCorruptedError):
        active_profile(hb_root)


def test_load_variables_merges_secrets(hb_root):
    write_profile(
        hb_root,
        "p",
        {
            "PROJECT_NAME": {"type": "string", "value": "Spot", "description": "Shown in Slack"},
            "HOOK": {"type": "secret", "description": ""},
            "TOKEN": {"type": "secret"},
        },
        secrets={"HOOK": "https://hook"},
    )
    variables = load_variables(hb_root, "p")
    assert variables["PROJECT_NAME"] == Variable("PROJECT_NAME", "string", "Spot", "Shown in Slack")
    assert variables["HOOK"].raw == "https://hook"
    assert variables["TOKEN"].raw is None
    assert variables["TOKEN"].description == ""


def test_missing_secrets_file_means_no_secret_values(hb_root):
    write_profile(hb_root, "p", {"HOOK": {"type": "secret"}})
    assert load_variables(hb_root, "p")["HOOK"].raw is None


def test_missing_profile(hb_root):
    with pytest.raises(StorageNotFoundError, match="profile 'nope' does not exist"):
        load_variables(hb_root, "nope")


def test_invalid_profile_name_is_rejected_before_touching_the_disk(hb_root):
    with pytest.raises(StorageNotFoundError, match="not a valid profile name"):
        load_variables(hb_root, "../x")


@pytest.mark.parametrize(
    "profile_json",
    [
        "{",
        '{"version": 1, "name": "p"}',
        '{"version": 2, "name": "p", "variables": {}}',
        '{"version": 1, "name": "p", "variables": {"lower": {"type": "string", "value": "x"}}}',
        '{"version": 1, "name": "p", "variables": {"X": {"type": "date", "value": "x"}}}',
        '{"version": 1, "name": "p", "variables": {"X": "string"}}',
    ],
)
def test_corrupted_profiles(hb_root, profile_json):
    folder = hb_root / "profiles" / "p"
    folder.mkdir(parents=True)
    (folder / "profile.json").write_text(profile_json, encoding="utf-8")
    with pytest.raises(StorageCorruptedError):
        load_variables(hb_root, "p")


def test_corrupted_secrets(hb_root):
    write_profile(hb_root, "p", {"HOOK": {"type": "secret"}})
    (hb_root / "profiles" / "p" / "secrets.json").write_text("[1]", encoding="utf-8")
    with pytest.raises(StorageCorruptedError, match="secrets.json"):
        load_variables(hb_root, "p")


def test_profile_names_lists_folders_with_a_profile_json(hb_root):
    write_profile(hb_root, "b", {})
    write_profile(hb_root, "a", {}, active=False)
    (hb_root / "profiles" / "not-a-profile").mkdir()
    assert profile_names(hb_root) == ["a", "b"]
