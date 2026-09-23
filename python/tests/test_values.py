import os
import re
from pathlib import Path

import pytest

from hedgebuddy._errors import VariableTypeError
from hedgebuddy._values import TYPES, convert, to_env


def test_nine_types():
    assert TYPES == ("string", "secret", "int", "float", "bool", "path", "url", "string[]", "path[]")


@pytest.mark.parametrize(
    "ty,raw,expected",
    [
        ("string", "x", "x"),
        ("secret", "s3cret", "s3cret"),
        ("int", 3, 3),
        ("float", 1, 1.0),
        ("float", 0.5, 0.5),
        ("bool", True, True),
        ("path", "D:/Offload", Path("D:/Offload")),
        ("url", "https://example.com/api", "https://example.com/api"),
        ("string[]", ["A", "B"], ["A", "B"]),
        ("path[]", ["D:/A", "F:/B"], [Path("D:/A"), Path("F:/B")]),
    ],
)
def test_convert_accepts_each_type(ty, raw, expected):
    value = convert("X", ty, raw)
    assert value == expected
    assert type(value) is type(expected)


@pytest.mark.parametrize(
    "ty,raw",
    [
        ("string", 1),
        ("int", True),
        ("int", 1.5),
        ("int", "3"),
        ("float", True),
        ("float", "1"),
        ("bool", 1),
        ("path", ""),
        ("path", 3),
        ("url", "ftp://example.com"),
        ("url", "example.com"),
        ("string[]", ["a", 1]),
        ("string[]", "a"),
        ("path[]", [""]),
    ],
)
def test_convert_rejects_wrong_values(ty, raw):
    with pytest.raises(VariableTypeError, match=re.escape(f"X is declared as {ty}")):
        convert("X", ty, raw)


def test_secret_values_never_appear_in_errors():
    with pytest.raises(VariableTypeError) as err:
        convert("TOKEN", "secret", ["hunter2"])
    assert "hunter2" not in str(err.value)


def test_unknown_type():
    with pytest.raises(VariableTypeError, match="unknown type 'date'"):
        convert("X", "date", "x")


def test_to_env():
    assert to_env(True) == "1"
    assert to_env(False) == "0"
    assert to_env(3) == "3"
    assert to_env(0.5) == "0.5"
    assert to_env("x") == "x"
    assert to_env(Path("D:/A")) == str(Path("D:/A"))
    assert to_env(["x", "y"]) == f"x{os.pathsep}y"
    assert to_env([Path("D:/A"), Path("F:/B")]) == os.pathsep.join([str(Path("D:/A")), str(Path("F:/B"))])
