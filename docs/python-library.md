# Python Library Guide

Complete reference for the `hedgebuddy` Python library.

---

## Installation

```bash
pip install --user hedgebuddy
```

---

## API Reference

### `hedgebuddy.var(name, default=...)`

Get a variable value.

```python
import hedgebuddy

# Required (raises error if missing)
api_key = hedgebuddy.var("API_KEY")

# Optional with fallback
api_url = hedgebuddy.var("API_URL", "https://api.example.com")

# Optional (None if missing)
email = hedgebuddy.var("REPORT_EMAIL", None)
```

**Raises:** `VariableNotFoundError`, `StorageNotFoundError`, `StorageCorruptedError`

---

### `hedgebuddy.exists(name)`

Check if a variable exists.

```python
if hedgebuddy.exists("S3_BUCKET"):
    upload_to_s3(file, hedgebuddy.var("S3_BUCKET"))
```

---

### `hedgebuddy.all_vars()`

Get all variables as a dictionary.

```python
variables = hedgebuddy.all_vars()
print(f"Loaded {len(variables)} variables")
```

---

### `hedgebuddy.inject_env(overwrite=False)`

Inject variables into `os.environ` for legacy code.

```python
hedgebuddy.inject_env()
api_key = os.environ["API_KEY"]  # Works!
```

---

## Logging

For headless scripts (OffShoot/FoolCat automation).

### `hedgebuddy.enable_logging()`

Enable automatic logging. Creates daily log files.

```python
hedgebuddy.enable_logging()
print("Transfer started...")  # Logged automatically!
```

**Log Location:** `%APPDATA%\hedgebuddy\logs\` (Windows) · `~/Library/Application Support/hedgebuddy/logs/` (macOS)

### Other logging functions

```python
hedgebuddy.log("Custom message")
hedgebuddy.log_error("Error occurred")
hedgebuddy.log_warning("Warning message")
hedgebuddy.log_debug("Debug info")
hedgebuddy.disable_logging()
hedgebuddy.get_log_dir()
hedgebuddy.is_logging_enabled()
```

---

## Exception Handling

```python
try:
    api_key = hedgebuddy.var("API_KEY")
except hedgebuddy.VariableNotFoundError as e:
    print(f"Missing: {e.variable_name}")
except hedgebuddy.StorageNotFoundError:
    print("Install the desktop app first")
except hedgebuddy.StorageCorruptedError as e:
    print(f"Corrupted: {e.reason}")
```

---

## Best Practices

1. **Use descriptive names:** `REPORT_OUTPUT_PATH` not `PATH`
2. **Provide defaults for optional config:** `hedgebuddy.var("TIMEOUT", "30")`
3. **Document required variables** in your script's docstring
4. **Graceful degradation:** Check `exists()` before optional features

---

## Storage

**Location:**

- Windows: `%APPDATA%\HedgeBuddy\profiles\<active>\vars.json`
- macOS: `~/Library/Application Support/HedgeBuddy/profiles/<active>/vars.json`

The library automatically resolves the **active profile** from `profiles.json`.

**Format:**

```json
{
  "variables": {
    "API_KEY": {
      "value": "your-key",
      "type": "string",
      "description": "API key"
    }
  }
}
```

---

## Next Steps

- [Desktop App Guide](desktop-app.md)
- [Examples](examples.md)
- [FAQ](faq.md)
