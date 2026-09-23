import json

import pytest

import hedgebuddy as hb
from hedgebuddy._event import parse_event
from hedgebuddy._manifest import Manifest

COPY = {
    "FileCopyCompleted_state": "Success",
    "FileCopyCompleted_destinationPath": "D:/Offload/A003",
    "FileCopyCompleted_sourceInfo": '{"label": "A003", "clips": 12}',
    "FileCopyCompleted_sourcePaths": '["E:/A003"]',
    "FileCopyCompleted_verification_mode": "checksum",
    "FileCopyCompleted_presetName": "{not json",
}


def test_prefix_is_stripped_and_json_fields_decoded():
    event = hb.Event(COPY, name="FileCopyCompleted", app="offshoot")
    assert event.state == "Success"
    assert event.destinationPath == "D:/Offload/A003"
    assert event.sourceInfo == {"label": "A003", "clips": 12}
    assert event.sourcePaths == ["E:/A003"]
    assert event.verification_mode == "checksum"
    assert event.presetName == "{not json"  # starts with { but is not JSON: kept as text
    assert event.raw == COPY
    assert event.app == "offshoot"
    assert event.name == "FileCopyCompleted"


def test_name_is_inferred_from_a_shared_key_prefix():
    event = hb.Event({"DiskAdded_title": "A003", "DiskAdded_rootFilePath": "/Volumes/A003"})
    assert event.name == "DiskAdded"
    assert event.app is None
    assert event.title == "A003"


def test_no_shared_prefix_means_no_name_and_keys_as_given():
    event = hb.Event({"transferType": "copy", "addedAt": "now"})
    assert event.name is None
    assert event.transferType == "copy"
    assert hb.Event({}).name is None


def test_unprefixed_keys_stay_as_given_under_a_manifest_name():
    event = hb.Event({"transferType": "copy", "transferGroups": "[1, 2]"}, name="TransfersAdded")
    assert event.transferType == "copy"
    assert event.transferGroups == [1, 2]


def test_fields_that_collide_with_event_attributes_use_item_access():
    event = hb.Event({"SourceAdded_name": "A003", "SourceAdded_paths": '["E:/"]'}, name="SourceAdded")
    assert event.name == "SourceAdded"
    assert event["name"] == "A003"
    assert event.paths == ["E:/"]


def test_mapping_style_access():
    event = hb.Event(COPY, name="FileCopyCompleted")
    assert "state" in event
    assert "nope" not in event
    assert event.get("nope", 5) == 5
    assert len(event) == len(COPY)
    assert sorted(event) == sorted(["state", "destinationPath", "sourceInfo", "sourcePaths", "verification_mode", "presetName"])
    with pytest.raises(KeyError):
        event["nope"]


def test_a_missing_field_names_the_available_ones():
    event = hb.Event({"DiskIdle_title": "A003"})
    with pytest.raises(AttributeError, match="DiskIdle has no field 'state'; fields: title"):
        event.state
    with pytest.raises(AttributeError):
        event._private


def test_parse_event_uses_argv_and_the_manifest():
    manifest = Manifest(app="offshoot", event="FileCopyCompleted")
    event = parse_event(["script.py", json.dumps(COPY)], manifest)
    assert event.app == "offshoot"
    assert event.state == "Success"


@pytest.mark.parametrize("argv", [["script.py"], ["script.py", ""], ["script.py", "   "]])
def test_no_payload_is_an_empty_event(argv):
    event = parse_event(argv, Manifest(app="offshoot", event="OffShootStarted"))
    assert len(event) == 0
    assert event.name == "OffShootStarted"


@pytest.mark.parametrize("payload,message", [("not json", "is not JSON"), ("[1, 2]", "must be a JSON object")])
def test_bad_payloads(payload, message):
    with pytest.raises(ValueError, match=message):
        parse_event(["script.py", payload])
