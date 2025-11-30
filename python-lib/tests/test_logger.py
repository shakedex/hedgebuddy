"""Tests for hedgebuddy.logger module."""

import sys
import logging
from pathlib import Path
from datetime import datetime, timedelta
import pytest

from hedgebuddy import (
    enable_logging,
    disable_logging,
    log,
    log_error,
    log_warning,
    log_debug,
    get_log_dir,
    is_logging_enabled,
)


@pytest.fixture(autouse=True)
def cleanup_logging():
    """Cleanup logging after each test."""
    yield
    disable_logging()


def test_enable_logging_creates_log_file(tmp_path, monkeypatch):
    """Test that enable_logging creates a log file."""
    # Mock storage directory
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    log_file = enable_logging(script_name="test-script")
    
    assert log_file.exists()
    assert log_file.parent == tmp_path / "logs"
    assert log_file.name.startswith("test-script_")
    assert log_file.name.endswith(".log")


def test_enable_logging_daily_filename(tmp_path, monkeypatch):
    """Test that log filename includes today's date."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    log_file = enable_logging(script_name="test-script")
    today = datetime.now().strftime("%Y-%m-%d")
    
    assert log_file.name == f"test-script_{today}.log"


def test_enable_logging_auto_detect_script_name(tmp_path, monkeypatch):
    """Test auto-detection of script name from __main__."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)

    # __main__.__file__ will be pytest when running tests
    log_file = enable_logging()

    # Should create a log file with some detected name and today's date
    today = datetime.now().strftime("%Y-%m-%d")
    assert log_file.name.endswith(f"_{today}.log")
    assert log_file.exists()
def test_log_function_writes_to_file(tmp_path, monkeypatch):
    """Test that log() writes messages to file."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    log_file = enable_logging(script_name="test-script")
    log("Test message")
    
    # Flush logging
    logging.shutdown()
    
    content = log_file.read_text()
    assert "Test message" in content
    assert "[INFO]" in content


def test_log_error_function(tmp_path, monkeypatch):
    """Test that log_error() writes error messages."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    log_file = enable_logging(script_name="test-script")
    log_error("Error occurred")
    
    logging.shutdown()
    
    content = log_file.read_text()
    assert "Error occurred" in content
    assert "[ERROR]" in content


def test_log_warning_function(tmp_path, monkeypatch):
    """Test that log_warning() writes warning messages."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    log_file = enable_logging(script_name="test-script")
    log_warning("Warning message")
    
    logging.shutdown()
    
    content = log_file.read_text()
    assert "Warning message" in content
    assert "[WARNING]" in content


def test_log_debug_function(tmp_path, monkeypatch):
    """Test that log_debug() writes debug messages when level is DEBUG."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    log_file = enable_logging(script_name="test-script", level="DEBUG")
    log_debug("Debug info")
    
    logging.shutdown()
    
    content = log_file.read_text()
    assert "Debug info" in content
    assert "[DEBUG]" in content


def test_capture_stdout(tmp_path, monkeypatch, capsys):
    """Test that print() statements are captured when capture_stdout=True."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    log_file = enable_logging(script_name="test-script", capture_stdout=True)
    print("Printed message")
    
    logging.shutdown()
    
    content = log_file.read_text()
    assert "Printed message" in content


def test_multiple_executions_append_to_same_file(tmp_path, monkeypatch):
    """Test that multiple script executions on same day append to same file."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    # First execution
    log_file1 = enable_logging(script_name="test-script")
    log("First execution")
    disable_logging()
    
    # Second execution (same day)
    log_file2 = enable_logging(script_name="test-script")
    log("Second execution")
    logging.shutdown()
    
    # Same file
    assert log_file1 == log_file2
    
    # Contains both messages
    content = log_file2.read_text()
    assert "First execution" in content
    assert "Second execution" in content


def test_log_rotation_deletes_old_files(tmp_path, monkeypatch):
    """Test that old log files are deleted based on max_days."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()
    
    # Create old log files
    old_date = (datetime.now() - timedelta(days=31)).strftime("%Y-%m-%d")
    old_log = logs_dir / f"test-script_{old_date}.log"
    old_log.write_text("Old log")
    
    # Enable logging with max_days=30
    enable_logging(script_name="test-script", max_days=30)
    
    # Old log should be deleted
    assert not old_log.exists()


def test_log_rotation_keeps_recent_files(tmp_path, monkeypatch):
    """Test that recent log files are kept."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()
    
    # Create recent log file
    recent_date = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
    recent_log = logs_dir / f"test-script_{recent_date}.log"
    recent_log.write_text("Recent log")
    
    # Enable logging with max_days=30
    enable_logging(script_name="test-script", max_days=30)
    
    # Recent log should still exist
    assert recent_log.exists()


def test_disable_logging_restores_stdout(tmp_path, monkeypatch):
    """Test that disable_logging() restores original stdout."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    original_stdout = sys.stdout
    
    enable_logging(script_name="test-script", capture_stdout=True)
    assert sys.stdout != original_stdout
    
    disable_logging()
    assert sys.stdout == original_stdout


def test_is_logging_enabled(tmp_path, monkeypatch):
    """Test is_logging_enabled() returns correct state."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    assert not is_logging_enabled()
    
    enable_logging(script_name="test-script")
    assert is_logging_enabled()
    
    disable_logging()
    assert not is_logging_enabled()


def test_get_log_dir(tmp_path, monkeypatch):
    """Test get_log_dir() returns correct directory."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    log_dir = get_log_dir()
    assert log_dir == tmp_path / "logs"


def test_include_context(tmp_path, monkeypatch):
    """Test that include_context=True adds system info to logs."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    log_file = enable_logging(script_name="test-script", include_context=True)
    
    logging.shutdown()
    
    content = log_file.read_text()
    # Should include at least one context field
    assert any(keyword in content for keyword in ["Hostname:", "User:", "OS:", "Python:"])


def test_prevent_multiple_initialization(tmp_path, monkeypatch, capsys):
    """Test that calling enable_logging() twice doesn't break."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    log_file1 = enable_logging(script_name="test-script")
    log_file2 = enable_logging(script_name="test-script")
    
    assert log_file1 == log_file2
    # Should log warning about already enabled
    logging.shutdown()


def test_different_log_levels(tmp_path, monkeypatch):
    """Test different log levels filter messages appropriately."""
    monkeypatch.setattr("hedgebuddy.logger._get_storage_dir", lambda: tmp_path)
    
    # Enable with WARNING level
    log_file = enable_logging(script_name="test-script", level="WARNING")
    
    log_debug("Debug message")
    log("Info message")
    log_warning("Warning message")
    log_error("Error message")
    
    logging.shutdown()
    
    content = log_file.read_text()
    
    # Should NOT include DEBUG and INFO
    assert "Debug message" not in content
    assert "Info message" not in content
    
    # Should include WARNING and ERROR
    assert "Warning message" in content
    assert "Error message" in content
