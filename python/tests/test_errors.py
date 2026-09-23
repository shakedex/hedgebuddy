import hedgebuddy as hb


def test_variable_not_found_is_a_key_and_attribute_error_with_a_plain_message():
    e = hb.VariableNotFoundError("X is not set")
    assert isinstance(e, KeyError)
    assert isinstance(e, AttributeError)
    assert isinstance(e, hb.HedgeBuddyError)
    assert str(e) == "X is not set"


def test_error_hierarchy():
    assert issubclass(hb.VariableTypeError, TypeError)
    assert issubclass(hb.ManifestError, ValueError)
    assert issubclass(hb.StorageCorruptedError, ValueError)
    for cls in (hb.VariableTypeError, hb.ManifestError, hb.StorageCorruptedError, hb.StorageNotFoundError):
        assert issubclass(cls, hb.HedgeBuddyError)
