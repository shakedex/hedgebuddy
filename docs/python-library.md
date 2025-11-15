# Python Library Guide

Complete reference for the `hedgebuddy` Python library.

---

## Installation

```bash
pip install --user hedgebuddy
```

We recommend global installation (`--user`) so all your scripts can use it.

---

## Import

```python
import hedgebuddy
```

?> **Tip**: We recommend `import hedgebuddy` instead of `from hedgebuddy import var` to avoid potential naming conflicts with other libraries.

---

## API Reference

### `hedgebuddy.var(name, default=...)`

Get the value of a variable.

**Parameters:**

- `name` (str): Variable name to retrieve
- `default` (str | None, optional): Fallback value if variable doesn't exist

**Returns:** `str` or `None`

**Raises:**

- `VariableNotFoundError` - Variable doesn't exist (only when no default provided)
- `StorageNotFoundError` - vars.json file doesn't exist
- `StorageCorruptedError` - vars.json is invalid

**Behavior:**

- **No default**: Raises `VariableNotFoundError` if variable is missing (required variable)
- **With default**: Returns default if variable is missing (optional variable)

#### Examples

**Required variable (no default):**

```python
import hedgebuddy

# Raises error if API_KEY is not configured
api_key = hedgebuddy.var("API_KEY")
```

**Optional variable with fallback:**

```python
import hedgebuddy

# Uses default if not configured
api_url = hedgebuddy.var("API_URL", "https://api.hedge.co/v1")
timeout = int(hedgebuddy.var("TIMEOUT", "30"))
debug = hedgebuddy.var("DEBUG", "false") == "true"
```

**Optional variable (None if missing):**

```python
import hedgebuddy

# Returns None if not configured
email = hedgebuddy.var("REPORT_EMAIL", None)
if email:
    send_report_to(email)
else:
    print("No email configured, saving locally")
```

---

### `hedgebuddy.exists(name)`

Check if a variable exists.

**Parameters:**

- `name` (str): Variable name to check

**Returns:** `bool` - `True` if variable exists, `False` otherwise

**Raises:**

- `StorageNotFoundError` - vars.json file doesn't exist
- `StorageCorruptedError` - vars.json is invalid

#### Examples

```python
import hedgebuddy

# Enable premium features only if key is configured
if hedgebuddy.exists("PREMIUM_API_KEY"):
    premium_key = hedgebuddy.var("PREMIUM_API_KEY")
    enable_premium_features(premium_key)
else:
    use_free_tier()

# Conditional S3 upload
if hedgebuddy.exists("S3_BUCKET"):
    upload_to_s3(file, hedgebuddy.var("S3_BUCKET"))
else:
    save_locally(file)
```

---

### `hedgebuddy.all_vars()`

Get all configured variables as a dictionary.

**Returns:** `dict[str, str]` - Dictionary mapping variable names to values

**Raises:**

- `StorageNotFoundError` - vars.json file doesn't exist
- `StorageCorruptedError` - vars.json is invalid

#### Examples

```python
import hedgebuddy

# Get all variables
variables = hedgebuddy.all_vars()
print(f"Loaded {len(variables)} variables")

# Iterate over all variables
for name, value in variables.items():
    print(f"{name}: {value}")

# Check if any variables are configured
if not hedgebuddy.all_vars():
    print("No variables configured!")
```

---

### `hedgebuddy.inject_env(overwrite=False)`

Inject HedgeBuddy variables into `os.environ` for legacy code compatibility.

**Parameters:**

- `overwrite` (bool, optional): Whether to overwrite existing environment variables. Default: `False`

**Returns:** `int` - Number of variables injected

**Raises:**

- `StorageNotFoundError` - vars.json file doesn't exist
- `StorageCorruptedError` - vars.json is invalid

?> **Note**: This is primarily for migrating legacy code. New code should use `var()` directly.

#### Examples

**Basic injection:**

```python
import hedgebuddy
import os

# Inject all HedgeBuddy variables into os.environ
hedgebuddy.inject_env()

# Now legacy code works
api_key = os.environ["API_KEY"]
database_url = os.environ.get("DATABASE_URL", "default")
```

**With overwrite:**

```python
import hedgebuddy
import os

# Overwrite existing environment variables
count = hedgebuddy.inject_env(overwrite=True)
print(f"Injected {count} variables (with overwrite)")
```

**Migration pattern:**

```python
import hedgebuddy
import os

# Inject at the start of your script
hedgebuddy.inject_env()

# Now all your existing code works without changes
def legacy_function():
    api_key = os.environ["API_KEY"]  # Works!
    return api_key

# Gradually migrate to direct usage
def modern_function():
    api_key = hedgebuddy.var("API_KEY")  # Better!
    return api_key
```

---

## Exception Handling

### Built-in Exceptions

All HedgeBuddy exceptions inherit from `HedgeBuddyError`:

```python
import hedgebuddy

try:
    api_key = hedgebuddy.var("API_KEY")
except hedgebuddy.VariableNotFoundError as e:
    print(f"Missing variable: {e.variable_name}")
    print("Please configure it in the HedgeBuddy app")
except hedgebuddy.StorageNotFoundError as e:
    print(f"Storage not found: {e.storage_path}")
    print("Please install the HedgeBuddy desktop app")
except hedgebuddy.StorageCorruptedError as e:
    print(f"Storage corrupted: {e.reason}")
    print("Please fix or recreate your variables")
```

### Exception Classes

#### `VariableNotFoundError`

Raised when requesting a variable that doesn't exist (only when no default is provided).

**Attributes:**

- `variable_name` (str): Name of the missing variable

**Example:**

```python
import hedgebuddy

try:
    value = hedgebuddy.var("MISSING_VAR")
except hedgebuddy.VariableNotFoundError as e:
    print(f"Variable '{e.variable_name}' not configured")
```

#### `StorageNotFoundError`

Raised when the `vars.json` file doesn't exist.

**Attributes:**

- `storage_path` (str): Expected path to vars.json

**Example:**

```python
import hedgebuddy

try:
    value = hedgebuddy.var("API_KEY")
except hedgebuddy.StorageNotFoundError as e:
    print(f"Please install the desktop app")
    print(f"Expected storage at: {e.storage_path}")
```

#### `StorageCorruptedError`

Raised when `vars.json` exists but contains invalid JSON.

**Attributes:**

- `storage_path` (str): Path to corrupted vars.json
- `reason` (str): Description of corruption

**Example:**

```python
import hedgebuddy

try:
    value = hedgebuddy.var("API_KEY")
except hedgebuddy.StorageCorruptedError as e:
    print(f"Storage file corrupted: {e.reason}")
    print("Please use the desktop app to fix it")
```

---

## Best Practices

### 1. Use Descriptive Variable Names

**Good:**

```python
api_key = hedgebuddy.var("API_KEY")
report_output_path = hedgebuddy.var("REPORT_OUTPUT_PATH")
smtp_server_url = hedgebuddy.var("SMTP_SERVER_URL")
```

**Bad:**

```python
key = hedgebuddy.var("KEY")  # What key?
path = hedgebuddy.var("PATH")  # What path?
url = hedgebuddy.var("URL")  # What URL?
```

### 2. Provide Sensible Defaults for Optional Config

```python
# Good defaults for optional configuration
api_url = hedgebuddy.var("API_URL", "https://api.hedge.co/v1")
timeout = int(hedgebuddy.var("TIMEOUT_SECONDS", "30"))
max_retries = int(hedgebuddy.var("MAX_RETRIES", "3"))
debug_mode = hedgebuddy.var("DEBUG_MODE", "false") == "true"
```

### 3. Validate Variable Values

```python
import hedgebuddy
from pathlib import Path

# Validate timeout is positive
timeout_str = hedgebuddy.var("TIMEOUT", "30")
timeout = int(timeout_str)
if timeout <= 0:
    raise ValueError("TIMEOUT must be positive")

# Validate path exists
report_path = Path(hedgebuddy.var("REPORT_PATH"))
if not report_path.exists():
    raise ValueError(f"REPORT_PATH does not exist: {report_path}")

# Validate URL format
api_url = hedgebuddy.var("API_URL")
if not api_url.startswith(("http://", "https://")):
    raise ValueError(f"API_URL must be http/https: {api_url}")
```

### 4. Document Required Variables

Add this to your script's docstring or README:

```python
"""
Sales Report Generator

Required HedgeBuddy Variables:
- API_KEY: Your Hedge.co API key
- REPORT_PATH: Directory to save reports (e.g., C:\\Reports)

Optional HedgeBuddy Variables:
- API_URL: Custom API endpoint (default: https://api.hedge.co/v1)
- REPORT_EMAIL: Email address for report delivery
- S3_BUCKET: AWS S3 bucket for cloud backup
"""

import hedgebuddy

def main():
    api_key = hedgebuddy.var("API_KEY")
    # ... rest of script
```

### 5. Graceful Degradation for Optional Features

```python
import hedgebuddy

# Required core functionality
report_path = hedgebuddy.var("REPORT_PATH")

# Optional S3 upload
if hedgebuddy.exists("S3_BUCKET"):
    bucket = hedgebuddy.var("S3_BUCKET")
    upload_to_s3(report, bucket)
    print(f"✓ Uploaded to S3: {bucket}")
else:
    print("ℹ S3_BUCKET not configured, skipping upload")

# Optional email notification
email = hedgebuddy.var("REPORT_EMAIL", None)
if email:
    send_email(email, report)
    print(f"✓ Emailed to: {email}")
```

---

## Storage Details

### File Location

Variables are stored in a JSON file at:

- **Windows**: `%APPDATA%\hedgebuddy\vars.json`
- **macOS**: `~/Library/Application Support/hedgebuddy/vars.json`

### File Format

```json
{
  "variables": {
    "API_KEY": {
      "value": "your-api-key-here",
      "type": "secure",
      "description": "API authentication key"
    },
    "REPORT_PATH": {
      "value": "C:\\Users\\John\\Reports",
      "type": "path",
      "description": "Where reports are saved"
    },
    "API_URL": {
      "value": "https://api.hedge.co/v1",
      "type": "url",
      "description": "API endpoint"
    }
  }
}
```

The Python library only reads the `value` field. The `type` and `description` fields are used by the desktop app for validation and documentation.

---

## Full Example

See the [Examples](examples.md) page for complete, runnable examples.

---

## Next Steps

- [Desktop App Guide](desktop-app.md) - How to manage variables with the GUI
- [Examples](examples.md) - Real-world usage patterns
- [FAQ](faq.md) - Common questions and troubleshooting
