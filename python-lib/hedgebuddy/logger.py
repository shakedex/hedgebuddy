"""
HedgeBuddy Logging Module
=========================

Automatic logging for headless scripts with daily rotation.

Usage:
    import hedgebuddy
    
    # Enable logging at start of script
    hedgebuddy.enable_logging()
    
    # All print() statements now logged automatically
    print("Transfer started...")
    
    # Or use logger directly
    hedgebuddy.log("Custom message")
    hedgebuddy.log_error("Error occurred")

Features:
    - One log file per script per day (automatic append)
    - Captures stdout/stderr (all print() statements)
    - Automatic log rotation (keeps last N days)
    - Structured format with timestamps
    - Cross-platform (Windows & macOS)

Log Location:
    - Windows: %APPDATA%\\hedgebuddy\\logs\\
    - macOS: ~/Library/Application Support/hedgebuddy/logs/
"""

import sys
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Literal

# Import from core instead of non-existent storage module
from .core import get_storage_path


def _get_storage_dir() -> Path:
    """Get the storage directory (parent of vars.json)."""
    return get_storage_path().parent


# Global flag to prevent multiple initialization
_logging_enabled = False
_original_stdout = None
_original_stderr = None


class _StreamToLogger:
    """
    Redirects writes to a logger instance.
    Preserves original stream for console output.
    """
    
    def __init__(self, logger_func, original_stream):
        self.logger_func = logger_func
        self.original_stream = original_stream
        self.buffer = ""
        
    def write(self, message):
        # Write to both log and original stream (console)
        if self.original_stream:
            self.original_stream.write(message)
            self.original_stream.flush()
        
        # Buffer messages and log on newline
        if message:
            self.buffer += message
            if '\n' in self.buffer:
                lines = self.buffer.split('\n')
                for line in lines[:-1]:
                    if line.strip():
                        self.logger_func(line.strip())
                self.buffer = lines[-1]
    
    def flush(self):
        if self.buffer.strip():
            self.logger_func(self.buffer.strip())
            self.buffer = ""
        if self.original_stream:
            self.original_stream.flush()


def enable_logging(
    script_name: Optional[str] = None,
    capture_stdout: bool = True,
    capture_stderr: bool = True,
    level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO",
    max_days: int = 30,
    include_context: bool = False
) -> Path:
    """
    Enable automatic logging for the script.
    
    Creates one log file per script per day in append mode.
    All executions on the same day append to the same log file.
    
    Args:
        script_name: Custom script name for log file (auto-detected if None)
        capture_stdout: Redirect print() to log file (default: True)
        capture_stderr: Redirect errors to log file (default: True)
        level: Log level - DEBUG, INFO, WARNING, ERROR (default: INFO)
        max_days: Keep logs for this many days (default: 30)
        include_context: Add system info to logs (default: False)
    
    Returns:
        Path to the log file
    
    Example:
        >>> import hedgebuddy
        >>> hedgebuddy.enable_logging()
        >>> print("This gets logged automatically!")
    
    Log File Format:
        script-name_YYYY-MM-DD.log
        
        Example: offshoot-slack-notifier_2025-11-17.log
    """
    global _logging_enabled, _original_stdout, _original_stderr
    
    # Prevent multiple initialization
    if _logging_enabled:
        logging.warning("Logging already enabled, skipping re-initialization")
        return _get_log_file_path(script_name)
    
    # Auto-detect script name from __main__
    if not script_name:
        script_name = _get_script_name()
    
    # Create logs directory
    storage_dir = _get_storage_dir()
    logs_dir = storage_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    
    # Daily log file: script-name_YYYY-MM-DD.log
    log_file = _get_log_file_path(script_name, logs_dir)
    
    # Configure logging
    log_level = getattr(logging, level.upper())
    
    # Clear any existing handlers
    logger = logging.getLogger()
    logger.handlers.clear()
    logger.setLevel(log_level)
    
    # File handler (append mode - multiple executions per day)
    file_handler = logging.FileHandler(log_file, mode='a', encoding='utf-8')
    file_handler.setLevel(log_level)
    
    # Formatter with timestamp
    formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    
    # Capture stdout/stderr if requested
    _original_stdout = sys.stdout
    _original_stderr = sys.stderr
    
    if capture_stdout:
        sys.stdout = _StreamToLogger(logging.info, _original_stdout)
    
    if capture_stderr:
        sys.stderr = _StreamToLogger(logging.error, _original_stderr)
    
    # Mark as enabled
    _logging_enabled = True
    
    # Log execution separator
    logging.info("=" * 60)
    logging.info(f"Script: {script_name}")
    logging.info(f"Log file: {log_file}")
    
    if include_context:
        _log_system_context()
    
    # Rotate old logs
    _rotate_daily_logs(logs_dir, script_name, max_days)
    
    return log_file


def disable_logging():
    """
    Disable logging and restore original stdout/stderr.
    
    Useful for cleanup or testing.
    """
    global _logging_enabled, _original_stdout, _original_stderr
    
    if not _logging_enabled:
        return
    
    # Restore original streams
    if _original_stdout:
        sys.stdout = _original_stdout
    if _original_stderr:
        sys.stderr = _original_stderr
    
    # Clear handlers
    logger = logging.getLogger()
    for handler in logger.handlers[:]:
        handler.close()
        logger.removeHandler(handler)
    
    _logging_enabled = False
    _original_stdout = None
    _original_stderr = None


def log(message: str, level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"):
    """
    Log a message directly (alternative to print()).
    
    Args:
        message: Message to log
        level: Log level (default: INFO)
    
    Example:
        >>> hedgebuddy.log("Transfer completed successfully")
        >>> hedgebuddy.log("Database connection failed", level="ERROR")
    """
    log_level = getattr(logging, level.upper())
    logging.log(log_level, message)


def log_error(message: str):
    """
    Log an error message.
    
    Shorthand for log(message, level="ERROR")
    
    Args:
        message: Error message to log
    
    Example:
        >>> hedgebuddy.log_error("Failed to connect to API")
    """
    logging.error(message)


def log_warning(message: str):
    """
    Log a warning message.
    
    Shorthand for log(message, level="WARNING")
    
    Args:
        message: Warning message to log
    
    Example:
        >>> hedgebuddy.log_warning("API rate limit approaching")
    """
    logging.warning(message)


def log_debug(message: str):
    """
    Log a debug message.
    
    Shorthand for log(message, level="DEBUG")
    
    Args:
        message: Debug message to log
    
    Example:
        >>> hedgebuddy.log_debug(f"Payload: {payload}")
    """
    logging.debug(message)


def _get_script_name() -> str:
    """Auto-detect script name from __main__."""
    try:
        import __main__
        if hasattr(__main__, '__file__') and __main__.__file__:
            return Path(__main__.__file__).stem
    except Exception:
        pass
    
    # Fallback to generic name
    return "hedgebuddy-script"


def _get_log_file_path(script_name: Optional[str] = None, logs_dir: Optional[Path] = None) -> Path:
    """Get path to today's log file for the script."""
    if not script_name:
        script_name = _get_script_name()
    
    if not logs_dir:
        storage_dir = _get_storage_dir()
        logs_dir = storage_dir / "logs"
    
    today = datetime.now().strftime("%Y-%m-%d")
    return logs_dir / f"{script_name}_{today}.log"


def _rotate_daily_logs(logs_dir: Path, script_name: str, max_days: int):
    """
    Delete log files older than max_days.
    
    Args:
        logs_dir: Directory containing log files
        script_name: Script name to match
        max_days: Keep logs for this many days
    """
    if max_days <= 0:
        return
    
    cutoff_date = datetime.now() - timedelta(days=max_days)
    
    # Find all log files for this script
    pattern = f"{script_name}_*.log"
    
    for log_file in logs_dir.glob(pattern):
        try:
            # Extract date from filename: script-name_2025-11-17.log
            date_str = log_file.stem.split('_')[-1]
            file_date = datetime.strptime(date_str, "%Y-%m-%d")
            
            # Delete if older than cutoff
            if file_date < cutoff_date:
                log_file.unlink()
                logging.debug(f"Deleted old log file: {log_file.name}")
        except (ValueError, IndexError):
            # Skip files that don't match expected pattern
            continue


def _log_system_context():
    """Log system context information."""
    import platform
    import getpass
    
    try:
        logging.info(f"Hostname: {platform.node()}")
        logging.info(f"User: {getpass.getuser()}")
        logging.info(f"OS: {platform.system()} {platform.release()}")
        logging.info(f"Python: {platform.python_version()}")
    except Exception:
        # Don't fail if we can't get context
        pass


def get_log_dir() -> Path:
    """
    Get the logs directory path.
    
    Returns:
        Path to the logs directory
    
    Example:
        >>> import hedgebuddy
        >>> log_dir = hedgebuddy.get_log_dir()
        >>> print(f"Logs stored at: {log_dir}")
    """
    storage_dir = _get_storage_dir()
    return storage_dir / "logs"


def is_logging_enabled() -> bool:
    """
    Check if logging is currently enabled.
    
    Returns:
        True if logging is enabled, False otherwise
    
    Example:
        >>> import hedgebuddy
        >>> if not hedgebuddy.is_logging_enabled():
        ...     hedgebuddy.enable_logging()
    """
    return _logging_enabled
