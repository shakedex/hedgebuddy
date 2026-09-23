from pathlib import Path

import pytest

from hedgebuddy._errors import VariableNotFoundError, VariableTypeError
from hedgebuddy._store import Variable
from hedgebuddy._vars import Vars


def make(**defaults):
    variables = {
        "PROJECT_NAME": Variable("PROJECT_NAME", "string", "Spot", ""),
        "ROOTS": Variable("ROOTS", "path[]", ["D:/A", "F:/B"], ""),
        "HOOK": Variable("HOOK", "secret", "https://hook", ""),
        "TOKEN": Variable("TOKEN", "secret", None, ""),
        "BROKEN": Variable("BROKEN", "int", "3", ""),
    }
    return Vars(variables, "p", defaults)


def test_attribute_and_item_access_are_typed():
    v = make()
    assert v.PROJECT_NAME == "Spot"
    assert v["PROJECT_NAME"] == "Spot"
    assert v.ROOTS == [Path("D:/A"), Path("F:/B")]
    assert v.HOOK == "https://hook"


def test_missing_and_unset_variables():
    v = make()
    with pytest.raises(VariableNotFoundError, match="NOPE is not set in profile 'p'"):
        v.NOPE
    with pytest.raises(VariableNotFoundError, match="TOKEN has no value in profile 'p'"):
        v["TOKEN"]
    assert getattr(v, "NOPE", None) is None
    assert not hasattr(v, "TOKEN")
    assert v.get("NOPE", 5) == 5


def test_defaults_fill_only_missing_or_unset_values():
    v = make(TOKEN="fallback", PROJECT_NAME="Untitled", EXTRA=1)
    assert v.TOKEN == "fallback"
    assert v.PROJECT_NAME == "Spot"
    assert v.EXTRA == 1


def test_membership_iteration_and_length():
    v = make(EXTRA=1)
    assert "PROJECT_NAME" in v
    assert "TOKEN" not in v
    assert "EXTRA" in v
    assert list(v) == ["BROKEN", "EXTRA", "HOOK", "PROJECT_NAME", "ROOTS"]
    assert len(v) == 5


def test_a_bad_stored_value_fails_on_access():
    with pytest.raises(VariableTypeError, match="BROKEN is declared as int"):
        make().BROKEN


def test_repr_shows_names_but_never_values():
    text = repr(make())
    assert "HOOK" in text
    assert "https://hook" not in text
    assert "Spot" not in text


def test_private_attributes_are_plain_attribute_errors():
    with pytest.raises(AttributeError) as err:
        make()._missing
    assert not isinstance(err.value, VariableNotFoundError)
