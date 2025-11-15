# HedgeBuddy Examples

This directory contains practical examples demonstrating how to use HedgeBuddy in your Python scripts.

## Installation

Since HedgeBuddy is designed for standalone scripts, **install it globally** so it's available to all your scripts:

```bash
pip install --user hedgebuddy
```

### Verify installation

```bash
python -c "import hedgebuddy; print('HedgeBuddy installed successfully!')"
```

## Running the Examples

Make sure you have:

1. ✅ Installed HedgeBuddy globally (see above)
2. ✅ Installed the HedgeBuddy desktop app
3. ✅ Configured at least one variable (e.g., `API_KEY`) using the app

Then run any example:

```bash
python examples/basic_usage.py
python examples/real_world_example.py
python examples/legacy_migration.py
python examples/error_handling.py
```

## Examples Overview

### 1. `basic_usage.py` - Getting Started

**Best for**: First-time users

Shows the core HedgeBuddy functions:

- Reading required variables with `var()`
- Using optional variables with defaults
- Checking if variables exist with `exists()`
- Getting all variables with `all_vars()`

**Required variables**: `API_KEY`

---

### 2. `real_world_example.py` - Practical Scenario

**Best for**: Understanding real-world usage patterns

Simulates a report generation workflow:

- Fetching data from an API (configurable endpoint)
- Generating a sales report
- Saving locally (required)
- Optionally uploading to S3 (if configured)
- Optionally emailing the report (if configured)

**Required variables**: `REPORT_PATH`

**Optional variables**: `S3_BUCKET`, `REPORT_EMAIL`, `API_URL`

---

### 3. `legacy_migration.py` - Working with Existing Code

**Best for**: Teams migrating from `os.environ`

Shows two approaches:

- Using `inject_env()` to populate `os.environ` (minimal code changes)
- Using `var()` directly (recommended for new code)

Demonstrates how to gradually migrate existing codebases.

**Required variables**: `API_KEY`

---

### 4. `error_handling.py` - Production-Ready Code

**Best for**: Learning error handling best practices

Covers:

- Catching and handling specific exceptions
- Graceful feature degradation when variables are missing
- Validating variable values after loading
- Conditional feature enablement

**Required variables**: None (demonstrates handling missing variables)

---

## Quick Reference

### Reading Variables

```python
import hedgebuddy

# Required variable (raises error if missing)
api_key = hedgebuddy.var("API_KEY")

# Optional with default
api_url = hedgebuddy.var("API_URL", "https://api.example.com")

# Optional, returns None if missing
email = hedgebuddy.var("NOTIFICATION_EMAIL", None)
```

**Note**: Using `import hedgebuddy` avoids naming conflicts with other libraries.

### Checking Variables

```python
import hedgebuddy

if hedgebuddy.exists("PREMIUM_FEATURES"):
    enable_premium()
else:
    use_free_tier()
```

### Getting All Variables

```python
import hedgebuddy

variables = hedgebuddy.all_vars()
print(f"Configured {len(variables)} variables")
```

### Legacy Support

```python
import hedgebuddy
import os

# Inject HedgeBuddy variables into os.environ
hedgebuddy.inject_env()

# Now your existing code works
api_key = os.environ["API_KEY"]
```

## Tips

1. **Start simple**: Run `basic_usage.py` first to understand the core concepts
2. **Use defaults**: Prefer `var("NAME", "default")` over try/except for optional config
3. **Validate values**: Always validate numeric/boolean values after loading
4. **Clear errors**: Use specific exceptions for better error messages
5. **Feature flags**: Use `exists()` for optional features rather than hardcoding checks

## Need Help?

- Check the [main README](../README.md) for full documentation
- Open an issue on [GitHub](https://github.com/shakedex/hedgebuddy/issues)
- Make sure the HedgeBuddy desktop app is installed and running
