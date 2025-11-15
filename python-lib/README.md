# HedgeBuddy Python Library

Cross-platform environment variable management for Python scripts without system pollution.

## Installation

HedgeBuddy is designed for standalone scripts. **Install it globally** so all your scripts can use it:

### Using pip

```bash
pip install --user hedgebuddy
```

### Using uv (modern, fast, reccommended)

```bash
# Install uv package manager
pip install uv

# Install hedgebuddy globally
uv pip install --system hedgebuddy
```

### Verify installation

```bash
python -c "import hedgebuddy; print('✓ HedgeBuddy ready!')"
```

## Quick Start

```python
import hedgebuddy

# Required variable (raises error if missing)
api_key = hedgebuddy.var("API_KEY")

# Optional variable with fallback
api_url = hedgebuddy.var("API_URL", "https://api.hedge.co/v1")

# Optional variable (returns None if missing)
email = hedgebuddy.var("REPORT_EMAIL", None)
```

**Note**: We recommend `import hedgebuddy` instead of `from hedgebuddy import var` to avoid potential naming conflicts with other libraries.

## Why HedgeBuddy?

- ✅ **No system pollution** - Variables stored locally, not in system environment
- ✅ **Cross-platform** - Works on Windows and macOS
- ✅ **GUI management** - Easy desktop app to manage variables
- ✅ **Simple API** - Just `var("NAME")` or `var("NAME", "default")`

## Usage

### Required Variables

When a variable **must** exist (like API keys), don't provide a default:

```python
import hedgebuddy

api_key = hedgebuddy.var("API_KEY")  # Raises error if missing
database_url = hedgebuddy.var("DATABASE_URL")  # Raises error if missing
```

### Optional Variables with Defaults

When you have a sensible fallback:

```python
import hedgebuddy

# Use default URL if not configured
api_url = hedgebuddy.var("API_URL", "https://api.hedge.co/v1")

# Use default timeout
timeout = int(hedgebuddy.var("TIMEOUT_SECONDS", "30"))

# Use default debug mode
debug = hedgebuddy.var("DEBUG_MODE", "false") == "true"
```

### Optional Variables (None if Missing)

When the absence of a variable has meaning:

```python
import hedgebuddy

# Only send email if configured
email = hedgebuddy.var("REPORT_EMAIL", None)
if email:
    send_report_to(email)

# Only use S3 if configured
bucket = hedgebuddy.var("S3_BUCKET", None)
if bucket:
    upload_to_s3(file, bucket)
else:
    save_locally(file)
```

### Check if Variable Exists

```python
import hedgebuddy

# Check before using
if hedgebuddy.exists("PREMIUM_API_KEY"):
    use_premium_features()
else:
    use_free_tier()
```

### Get All Variables

```python
import hedgebuddy

# Get everything as a dict
variables = hedgebuddy.all_vars()
print(f"Loaded {len(variables)} variables")
```

### Legacy os.environ Support

For scripts already using `os.environ`:

```python
import hedgebuddy
import os

# Inject HedgeBuddy variables into os.environ
hedgebuddy.inject_env()

# Now standard code works
api_key = os.environ["API_KEY"]
```

## Storage Location

Variables are stored locally:

- **Windows**: `%APPDATA%\hedgebuddy\vars.json`
- **macOS**: `~/Library/Application Support/hedgebuddy/vars.json`

## Desktop App

Download the HedgeBuddy desktop app to manage your variables with a GUI:

**[Download for Windows](https://github.com/shakedex/hedgebuddy/releases)** | **[Download for macOS](https://github.com/shakedex/hedgebuddy/releases)**

After installing:

1. Launch HedgeBuddy app
2. Add your first variable (e.g., `API_KEY`)
3. Start using it in your scripts with `var("API_KEY")`

## Error Handling

```python
import hedgebuddy

try:
    api_key = hedgebuddy.var("API_KEY")
except hedgebuddy.VariableNotFoundError:
    print("API_KEY not configured. Please use the HedgeBuddy app.")
except hedgebuddy.StorageNotFoundError:
    print("HedgeBuddy storage not found. Install the desktop app.")
```

## API Reference

### Functions

- **`hedgebuddy.var(name, default=...)`** - Get variable value

  - No default = raises error if missing (required variable)
  - With default = returns default if missing (optional variable)

- **`hedgebuddy.exists(name)`** - Returns `True` if variable exists

- **`hedgebuddy.all_vars()`** - Returns dict of all variables

- **`hedgebuddy.inject_env(overwrite=False)`** - Inject into `os.environ`

### Exceptions

- **`hedgebuddy.VariableNotFoundError`** - Variable doesn't exist (only when no default)
- **`hedgebuddy.StorageNotFoundError`** - vars.json file doesn't exist
- **`hedgebuddy.StorageCorruptedError`** - vars.json is invalid

## License

MIT

## Links

- [GitHub](https://github.com/shakedex/hedgebuddy)
- [Issues](https://github.com/shakedex/hedgebuddy/issues)
- [Releases](https://github.com/shakedex/hedgebuddy/releases)
