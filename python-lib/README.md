# HedgeBuddy Python Library

Cross-platform environment variable management without system pollution.

## Installation

```bash
pip install --user hedgebuddy
```

## Quick Start

```python
import hedgebuddy

# Required variable (raises error if missing)
api_key = hedgebuddy.var("API_KEY")

# Optional with fallback
api_url = hedgebuddy.var("API_URL", "https://api.example.com")

# Optional (None if missing)
email = hedgebuddy.var("REPORT_EMAIL", None)
```

## API

### Core Functions

```python
hedgebuddy.var(name, default=...)  # Get variable
hedgebuddy.exists(name)            # Check if exists
hedgebuddy.all_vars()              # Get all as dict
hedgebuddy.inject_env()            # Inject into os.environ
```

### Logging (for headless scripts)

```python
hedgebuddy.enable_logging()        # Enable daily log files
print("This is logged!")           # Captured automatically

hedgebuddy.log("Message")          # Log directly
hedgebuddy.log_error("Error")
hedgebuddy.log_warning("Warning")
```

**Log Location:** `%APPDATA%\hedgebuddy\logs\` (Windows) · `~/Library/Application Support/hedgebuddy/logs/` (macOS)

### Exceptions

```python
hedgebuddy.VariableNotFoundError   # Variable missing (no default)
hedgebuddy.StorageNotFoundError    # vars.json not found
hedgebuddy.StorageCorruptedError   # Invalid JSON
```

## Storage

- **Windows:** `%APPDATA%\hedgebuddy\vars.json`
- **macOS:** `~/Library/Application Support/hedgebuddy/vars.json`

## Desktop App

Download from [Releases](https://github.com/shakedex/hedgebuddy/releases) to manage variables with a GUI.

## Links

[GitHub](https://github.com/shakedex/hedgebuddy) · [Issues](https://github.com/shakedex/hedgebuddy/issues) · [PyPI](https://pypi.org/project/hedgebuddy/)

MIT License
