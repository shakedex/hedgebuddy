"""Core functionality for HedgeBuddy library."""

import json
import os
import sys
from pathlib import Path
from typing import Any, Optional, Union, overload

from .exceptions import (
    StorageCorruptedError,
    StorageNotFoundError,
    VariableNotFoundError,
)

# Sentinel value for "no default provided"
_NO_DEFAULT = object()


def get_storage_path() -> Path:
    """Get the platform-specific path to the vars.json file.
    
    Returns:
        Path: Absolute path to vars.json
        
    Platform-specific locations:
        - Windows: %APPDATA%\\hedgebuddy\\vars.json
        - macOS: ~/Library/Application Support/hedgebuddy/vars.json
        - Linux: ~/.local/share/hedgebuddy/vars.json (future support)
    """
    if sys.platform == "win32":
        # Windows: %APPDATA%\hedgebuddy\vars.json
        app_data = os.environ.get("APPDATA")
        if not app_data:
            raise StorageNotFoundError("APPDATA environment variable not found")
        return Path(app_data) / "hedgebuddy" / "vars.json"
    elif sys.platform == "darwin":
        # macOS: ~/Library/Application Support/hedgebuddy/vars.json
        return Path.home() / "Library" / "Application Support" / "hedgebuddy" / "vars.json"
    else:
        # Linux/Unix: ~/.local/share/hedgebuddy/vars.json (not officially supported yet)
        return Path.home() / ".local" / "share" / "hedgebuddy" / "vars.json"


def _load_variables() -> dict[str, Any]:
    """Load and parse the vars.json file.
    
    Returns:
        dict: The parsed JSON data containing variables
        
    Raises:
        StorageNotFoundError: If vars.json doesn't exist
        StorageCorruptedError: If vars.json contains invalid JSON
    """
    storage_path = get_storage_path()
    
    if not storage_path.exists():
        raise StorageNotFoundError(str(storage_path))
    
    try:
        with open(storage_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        raise StorageCorruptedError(str(storage_path), f"Invalid JSON: {e}")
    except Exception as e:
        raise StorageCorruptedError(str(storage_path), str(e))
    
    # Validate structure
    if not isinstance(data, dict):
        raise StorageCorruptedError(str(storage_path), "Root element must be an object")
    
    if "variables" not in data:
        raise StorageCorruptedError(str(storage_path), "Missing 'variables' key")
    
    if not isinstance(data["variables"], dict):
        raise StorageCorruptedError(str(storage_path), "'variables' must be an object")
    
    return data["variables"]


@overload
def var(name: str) -> str: ...

@overload
def var(name: str, default: str) -> str: ...

@overload
def var(name: str, default: None) -> Optional[str]: ...


def var(name: str, default: Union[str, None, object] = _NO_DEFAULT) -> Optional[str]:
    """Get the value of a HedgeBuddy variable.
    
    Args:
        name: The variable name to retrieve
        default: Optional fallback value if variable doesn't exist.
                If not provided, raises VariableNotFoundError when variable is missing.
        
    Returns:
        str: The variable value or default
        
    Raises:
        VariableNotFoundError: If variable doesn't exist and no default provided
        StorageNotFoundError: If vars.json doesn't exist
        StorageCorruptedError: If vars.json is invalid
        
    Examples:
        >>> # Required variable - raises error if missing
        >>> api_key = var("API_KEY")
        
        >>> # Optional variable with fallback
        >>> api_url = var("API_URL", "https://api.hedge.co/v1")
        
        >>> # Optional variable, returns None if missing
        >>> email = var("NOTIFICATION_EMAIL", None)
    """
    try:
        variables = _load_variables()
        
        if name not in variables:
            # If no default provided, raise error
            if default is _NO_DEFAULT:
                raise VariableNotFoundError(name)
            return default  # type: ignore
        
        variable_data = variables[name]
        
        # Variables are stored as objects with 'value', 'type', 'description' keys
        if isinstance(variable_data, dict) and "value" in variable_data:
            return variable_data["value"]
        
        # Fallback for older/simpler format (just in case)
        return str(variable_data)
    except (StorageNotFoundError, StorageCorruptedError):
        # If storage issues and no default, re-raise
        if default is _NO_DEFAULT:
            raise
        return default  # type: ignore


def get(name: str, default: Optional[str] = None) -> Optional[str]:
    """DEPRECATED: Use var(name, default) instead.
    
    Get a HedgeBuddy variable with a default fallback.
    This function is kept for backwards compatibility.
    
    Args:
        name: The variable name to retrieve
        default: Value to return if variable doesn't exist
        
    Returns:
        str | None: The variable value or default
    """
    return var(name, default)


def exists(name: str) -> bool:
    """Check if a HedgeBuddy variable exists.
    
    Args:
        name: The variable name to check
        
    Returns:
        bool: True if variable exists, False otherwise
        
    Raises:
        StorageNotFoundError: If vars.json doesn't exist
        StorageCorruptedError: If vars.json is invalid
        
    Example:
        >>> if exists("OPTIONAL_VAR"):
        ...     value = var("OPTIONAL_VAR")
    """
    try:
        variables = _load_variables()
        return name in variables
    except StorageNotFoundError:
        return False


def all_vars() -> dict[str, str]:
    """Get all HedgeBuddy variables as a dictionary.
    
    Returns:
        dict: Dictionary mapping variable names to values
        
    Raises:
        StorageNotFoundError: If vars.json doesn't exist
        StorageCorruptedError: If vars.json is invalid
        
    Example:
        >>> all_variables = all_vars()
        >>> for name, value in all_variables.items():
        ...     print(f"{name} = {value}")
    """
    variables = _load_variables()
    
    # Extract just the values from the variable objects
    result = {}
    for name, variable_data in variables.items():
        if isinstance(variable_data, dict) and "value" in variable_data:
            result[name] = variable_data["value"]
        else:
            result[name] = str(variable_data)
    
    return result


def inject_env(overwrite: bool = False) -> int:
    """Inject HedgeBuddy variables into os.environ.
    
    This allows scripts that already use os.environ to work with HedgeBuddy
    without code changes.
    
    Args:
        overwrite: If True, HedgeBuddy variables overwrite existing env vars.
                   If False (default), existing env vars take priority.
                   
    Returns:
        int: Number of variables injected
        
    Raises:
        StorageNotFoundError: If vars.json doesn't exist
        StorageCorruptedError: If vars.json is invalid
        
    Example:
        >>> from hedgebuddy import inject_env
        >>> inject_env()  # Now os.environ contains HedgeBuddy variables
        >>> import os
        >>> api_key = os.environ["API_KEY"]  # Works!
    """
    variables = all_vars()
    injected_count = 0
    
    for name, value in variables.items():
        if overwrite or name not in os.environ:
            os.environ[name] = value
            injected_count += 1
    
    return injected_count

