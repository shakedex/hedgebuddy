"""Core functionality for reading variables from HedgeBuddy storage."""

import json
import os
import sys
from pathlib import Path
from typing import Optional, Any


def get_storage_path() -> Path:
    """
    Get the platform-specific path to the HedgeBuddy vars.json file.
    
    Returns:
        Path to vars.json:
            - Windows: %APPDATA%\\HedgeBuddy\\vars.json
            - macOS: ~/Library/Application Support/HedgeBuddy/vars.json
    
    Raises:
        RuntimeError: If platform is not Windows or macOS
    """
    if sys.platform == "win32":
        # Windows: Use APPDATA environment variable
        appdata = os.environ.get("APPDATA")
        if not appdata:
            raise RuntimeError("APPDATA environment variable not found")
        return Path(appdata) / "HedgeBuddy" / "vars.json"
    
    elif sys.platform == "darwin":
        # macOS: Use ~/Library/Application Support
        return Path.home() / "Library" / "Application Support" / "HedgeBuddy" / "vars.json"
    
    else:
        raise RuntimeError(f"Unsupported platform: {sys.platform}. HedgeBuddy only supports Windows and macOS.")


def var(name: str, default: Optional[Any] = None) -> Optional[str]:
    """
    Read a variable from HedgeBuddy storage.
    
    Args:
        name: The variable name to retrieve
        default: Value to return if variable is not found (default: None)
    
    Returns:
        The variable value as a string, or the default value if not found
    
    Examples:
        >>> import hedgebuddy
        >>> report_path = hedgebuddy.var("REPORT_PATH")
        >>> api_url = hedgebuddy.var("API_URL", "https://api.hedge.co/v1")
    """
    try:
        storage_path = get_storage_path()
        
        # If storage file doesn't exist, return default
        if not storage_path.exists():
            return default
        
        # Read and parse JSON file
        with open(storage_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Extract variable value from nested structure
        variables = data.get("variables", {})
        if name in variables:
            var_data = variables[name]
            # Handle both simple string values and structured objects
            if isinstance(var_data, dict):
                return var_data.get("value", default)
            else:
                return var_data
        
        return default
    
    except json.JSONDecodeError:
        # Corrupted JSON file - return default
        return default
    
    except Exception:
        # Any other error (permissions, etc.) - return default
        return default
