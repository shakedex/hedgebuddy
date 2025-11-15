"""Unit tests for HedgeBuddy library."""

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest # type: ignore

from hedgebuddy import (
    var,
    get,
    exists,
    all_vars,
    inject_env,
    VariableNotFoundError,
    StorageNotFoundError,
    StorageCorruptedError,
)
from hedgebuddy.core import get_storage_path


# Sample test data
TEST_VARS = {
    "variables": {
        "API_KEY": {
            "value": "test-api-key-123",
            "type": "string",
            "description": "Test API key"
        },
        "DATABASE_URL": {
            "value": "postgresql://localhost/testdb",
            "type": "url",
            "description": "Test database URL"
        },
        "REPORT_PATH": {
            "value": "C:\\Reports",
            "type": "path",
            "description": "Report output path"
        },
        "DEBUG_MODE": {
            "value": "true",
            "type": "string",
            "description": "Enable debug mode"
        }
    }
}


@pytest.fixture
def mock_storage_file(tmp_path):
    """Create a temporary vars.json file for testing."""
    storage_file = tmp_path / "vars.json"
    storage_file.write_text(json.dumps(TEST_VARS), encoding="utf-8")
    
    with patch("hedgebuddy.core.get_storage_path", return_value=storage_file):
        yield storage_file


@pytest.fixture
def mock_missing_storage(tmp_path):
    """Mock a missing vars.json file."""
    storage_file = tmp_path / "nonexistent.json"
    
    with patch("hedgebuddy.core.get_storage_path", return_value=storage_file):
        yield storage_file


@pytest.fixture
def mock_corrupted_storage(tmp_path):
    """Create a corrupted vars.json file."""
    storage_file = tmp_path / "vars.json"
    storage_file.write_text("{ invalid json }", encoding="utf-8")
    
    with patch("hedgebuddy.core.get_storage_path", return_value=storage_file):
        yield storage_file


class TestVarFunction:
    """Tests for the var() function."""
    
    def test_var_returns_existing_variable(self, mock_storage_file):
        """Test that var() returns the value of an existing variable."""
        assert var("API_KEY") == "test-api-key-123"
        assert var("DATABASE_URL") == "postgresql://localhost/testdb"
        assert var("REPORT_PATH") == "C:\\Reports"
    
    def test_var_raises_error_for_missing_variable(self, mock_storage_file):
        """Test that var() raises VariableNotFoundError for missing variables."""
        with pytest.raises(VariableNotFoundError) as exc_info:
            var("NONEXISTENT_VAR")
        
        assert exc_info.value.variable_name == "NONEXISTENT_VAR"
        assert "NONEXISTENT_VAR" in str(exc_info.value)
    
    def test_var_with_default_returns_default_for_missing(self, mock_storage_file):
        """Test that var() with default returns default for missing variables."""
        assert var("NONEXISTENT_VAR", "default-value") == "default-value"
        assert var("MISSING", "fallback") == "fallback"
    
    def test_var_with_none_default(self, mock_storage_file):
        """Test that var() can use None as default."""
        assert var("NONEXISTENT_VAR", None) is None
    
    def test_var_with_default_returns_value_if_exists(self, mock_storage_file):
        """Test that var() returns actual value even when default is provided."""
        assert var("API_KEY", "default") == "test-api-key-123"
    
    def test_var_raises_storage_not_found(self, mock_missing_storage):
        """Test that var() raises StorageNotFoundError when file doesn't exist."""
        with pytest.raises(StorageNotFoundError):
            var("API_KEY")
    
    def test_var_with_default_on_missing_storage(self, mock_missing_storage):
        """Test that var() returns default when storage file doesn't exist."""
        assert var("API_KEY", "fallback") == "fallback"
    
    def test_var_raises_corrupted_error(self, mock_corrupted_storage):
        """Test that var() raises StorageCorruptedError for invalid JSON."""
        with pytest.raises(StorageCorruptedError) as exc_info:
            var("API_KEY")
        
        assert "Invalid JSON" in str(exc_info.value)
    
    def test_var_with_default_on_corrupted_storage(self, mock_corrupted_storage):
        """Test that var() returns default when storage is corrupted."""
        assert var("API_KEY", "fallback") == "fallback"


class TestGetFunction:
    """Tests for the get() function (deprecated but maintained)."""
    
    def test_get_returns_existing_variable(self, mock_storage_file):
        """Test that get() returns existing variable value."""
        assert get("API_KEY") == "test-api-key-123"
    
    def test_get_returns_default_for_missing(self, mock_storage_file):
        """Test that get() returns default for missing variables."""
        assert get("NONEXISTENT", "default") == "default"
    
    def test_get_returns_none_by_default(self, mock_storage_file):
        """Test that get() returns None when no default specified."""
        assert get("NONEXISTENT") is None


class TestExistsFunction:
    """Tests for the exists() function."""
    
    def test_exists_returns_true_for_existing(self, mock_storage_file):
        """Test that exists() returns True for existing variables."""
        assert exists("API_KEY") is True
        assert exists("DATABASE_URL") is True
    
    def test_exists_returns_false_for_missing(self, mock_storage_file):
        """Test that exists() returns False for missing variables."""
        assert exists("NONEXISTENT") is False
        assert exists("MISSING_VAR") is False
    
    def test_exists_returns_false_when_storage_missing(self, mock_missing_storage):
        """Test that exists() returns False when storage file doesn't exist."""
        assert exists("API_KEY") is False
    
    def test_exists_raises_corrupted_error(self, mock_corrupted_storage):
        """Test that exists() raises error for corrupted storage."""
        with pytest.raises(StorageCorruptedError):
            exists("API_KEY")


class TestAllVarsFunction:
    """Tests for the all_vars() function."""
    
    def test_all_vars_returns_dict(self, mock_storage_file):
        """Test that all_vars() returns a dictionary."""
        variables = all_vars()
        assert isinstance(variables, dict)
    
    def test_all_vars_contains_all_variables(self, mock_storage_file):
        """Test that all_vars() contains all stored variables."""
        variables = all_vars()
        assert len(variables) == 4
        assert "API_KEY" in variables
        assert "DATABASE_URL" in variables
        assert "REPORT_PATH" in variables
        assert "DEBUG_MODE" in variables
    
    def test_all_vars_returns_values_only(self, mock_storage_file):
        """Test that all_vars() returns only values, not full objects."""
        variables = all_vars()
        assert variables["API_KEY"] == "test-api-key-123"
        assert variables["DATABASE_URL"] == "postgresql://localhost/testdb"
    
    def test_all_vars_raises_storage_not_found(self, mock_missing_storage):
        """Test that all_vars() raises error when storage doesn't exist."""
        with pytest.raises(StorageNotFoundError):
            all_vars()


class TestInjectEnvFunction:
    """Tests for the inject_env() function."""
    
    def test_inject_env_adds_variables_to_os_environ(self, mock_storage_file):
        """Test that inject_env() adds variables to os.environ."""
        # Clear any existing test variables
        for key in ["API_KEY", "DATABASE_URL"]:
            os.environ.pop(key, None)
        
        count = inject_env()
        
        assert count == 4
        assert os.environ["API_KEY"] == "test-api-key-123"
        assert os.environ["DATABASE_URL"] == "postgresql://localhost/testdb"
        
        # Cleanup
        for key in ["API_KEY", "DATABASE_URL", "REPORT_PATH", "DEBUG_MODE"]:
            os.environ.pop(key, None)
    
    def test_inject_env_respects_existing_without_overwrite(self, mock_storage_file):
        """Test that inject_env() doesn't overwrite existing vars by default."""
        os.environ["API_KEY"] = "existing-value"
        
        count = inject_env(overwrite=False)
        
        # Should skip API_KEY since it exists
        assert os.environ["API_KEY"] == "existing-value"
        assert count == 3  # Only injected the 3 that didn't exist
        
        # Cleanup
        for key in ["API_KEY", "DATABASE_URL", "REPORT_PATH", "DEBUG_MODE"]:
            os.environ.pop(key, None)
    
    def test_inject_env_overwrites_with_flag(self, mock_storage_file):
        """Test that inject_env() overwrites existing vars when asked."""
        os.environ["API_KEY"] = "existing-value"
        
        count = inject_env(overwrite=True)
        
        assert os.environ["API_KEY"] == "test-api-key-123"
        assert count == 4
        
        # Cleanup
        for key in ["API_KEY", "DATABASE_URL", "REPORT_PATH", "DEBUG_MODE"]:
            os.environ.pop(key, None)


class TestStoragePath:
    """Tests for platform-specific storage path resolution."""
    
    @patch("sys.platform", "win32")
    def test_windows_storage_path(self):
        """Test that Windows uses correct APPDATA path."""
        with patch.dict(os.environ, {"APPDATA": "C:\\Users\\Test\\AppData\\Roaming"}):
            path = get_storage_path()
            # Check path components (works cross-platform)
            assert str(path).endswith("hedgebuddy") or str(path).endswith("vars.json")
            assert "AppData" in str(path)
            assert "Roaming" in str(path)
            assert path.name == "vars.json"
    
    @patch("sys.platform", "darwin")
    def test_macos_storage_path(self):
        """Test that macOS uses correct Library path."""
        with patch("pathlib.Path.home", return_value=Path("/Users/test")):
            path = get_storage_path()
            assert "Library" in str(path)
            assert "Application Support" in str(path)
            assert "hedgebuddy" in str(path)
            assert path.name == "vars.json"
    
    @patch("sys.platform", "linux")
    def test_linux_storage_path(self):
        """Test that Linux uses .local/share path (future support)."""
        with patch("pathlib.Path.home", return_value=Path("/home/test")):
            path = get_storage_path()
            assert ".local" in str(path)
            assert "share" in str(path)
            assert "hedgebuddy" in str(path)
            assert path.name == "vars.json"


class TestEdgeCases:
    """Tests for edge cases and error conditions."""
    
    def test_empty_variables_object(self, tmp_path):
        """Test handling of empty variables object."""
        storage_file = tmp_path / "vars.json"
        storage_file.write_text(json.dumps({"variables": {}}), encoding="utf-8")
        
        with patch("hedgebuddy.core.get_storage_path", return_value=storage_file):
            assert all_vars() == {}
            assert exists("ANY_VAR") is False
    
    def test_missing_variables_key(self, tmp_path):
        """Test handling of JSON without 'variables' key."""
        storage_file = tmp_path / "vars.json"
        storage_file.write_text(json.dumps({"other": "data"}), encoding="utf-8")
        
        with patch("hedgebuddy.core.get_storage_path", return_value=storage_file):
            with pytest.raises(StorageCorruptedError) as exc_info:
                var("API_KEY")
            
            assert "Missing 'variables' key" in str(exc_info.value)
    
    def test_variables_not_dict(self, tmp_path):
        """Test handling of 'variables' not being a dict."""
        storage_file = tmp_path / "vars.json"
        storage_file.write_text(json.dumps({"variables": "not a dict"}), encoding="utf-8")
        
        with patch("hedgebuddy.core.get_storage_path", return_value=storage_file):
            with pytest.raises(StorageCorruptedError) as exc_info:
                var("API_KEY")
            
            assert "'variables' must be an object" in str(exc_info.value)
    
    def test_root_not_dict(self, tmp_path):
        """Test handling of root JSON not being a dict."""
        storage_file = tmp_path / "vars.json"
        storage_file.write_text(json.dumps(["array", "instead"]), encoding="utf-8")
        
        with patch("hedgebuddy.core.get_storage_path", return_value=storage_file):
            with pytest.raises(StorageCorruptedError) as exc_info:
                var("API_KEY")
            
            assert "Root element must be an object" in str(exc_info.value)
