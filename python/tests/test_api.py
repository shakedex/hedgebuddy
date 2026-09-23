import os
from pathlib import Path

import pytest

import hedgebuddy as hb
from tests.helpers import write_profile

VARIABLES = {
    "PROJECT_NAME": {"type": "string", "value": "Spot"},
    "NOTIFY": {"type": "bool", "value": True},
    "ROOTS": {"type": "path[]", "value": ["D:/A", "F:/B"]},
    "HOOK": {"type": "secret"},
    "TOKEN": {"type": "secret"},
}


@pytest.fixture
def profile(hb_root):
    write_profile(hb_root, "p", VARIABLES, secrets={"HOOK": "https://hook"})
    return hb_root


def test_var_reads_typed_values(profile):
    assert hb.var("PROJECT_NAME") == "Spot"
    assert hb.var("NOTIFY") is True
    assert hb.var("HOOK") == "https://hook"
    assert hb.var("ROOTS") == [Path("D:/A"), Path("F:/B")]


def test_var_default_covers_missing_variables_only(profile):
    assert hb.var("NOPE", default="x") == "x"
    assert hb.var("TOKEN", default=None) is None
    with pytest.raises(hb.VariableNotFoundError):
        hb.var("NOPE")


def test_storage_errors_are_not_hidden_by_defaults():
    with pytest.raises(hb.StorageNotFoundError):
        hb.var("X", default=1)


def test_exists_and_all_vars(profile):
    assert hb.exists("HOOK")
    assert not hb.exists("TOKEN")
    assert not hb.exists("NOPE")
    values = hb.all_vars()
    assert sorted(values) == ["HOOK", "NOTIFY", "PROJECT_NAME", "ROOTS"]
    assert values["ROOTS"] == [Path("D:/A"), Path("F:/B")]


def test_inject_env(profile, monkeypatch):
    for name in VARIABLES:
        # setenv then delenv: monkeypatch removes whatever inject_env sets.
        monkeypatch.setenv(name, "placeholder")
        monkeypatch.delenv(name)
    monkeypatch.setenv("NOTIFY", "keep")
    assert hb.inject_env() == ["HOOK", "PROJECT_NAME", "ROOTS"]
    assert os.environ["NOTIFY"] == "keep"
    assert os.environ["PROJECT_NAME"] == "Spot"
    assert os.environ["HOOK"] == "https://hook"
    assert os.environ["ROOTS"] == os.pathsep.join([str(Path("D:/A")), str(Path("F:/B"))])
    assert "TOKEN" not in os.environ
    assert hb.inject_env(overwrite=True) == ["HOOK", "NOTIFY", "PROJECT_NAME", "ROOTS"]
    assert os.environ["NOTIFY"] == "1"
