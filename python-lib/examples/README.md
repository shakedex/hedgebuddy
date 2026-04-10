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

1. Installed HedgeBuddy globally (see above)
2. Installed the HedgeBuddy desktop app
3. Configured at least one variable (e.g., `API_KEY`) using the app

Then run any example:

```bash
python examples/basic_usage.py
python examples/real_world_example.py
python examples/legacy_migration.py
python examples/error_handling.py
```

## Examples Overview

### 1. `basic_usage.py` — Getting Started

Core functions: `var()`, defaults, `exists()`, `all_vars()`.

**Required variables:** `API_KEY`

### 2. `logging_example.py` — Automatic Logging

Daily log files with `enable_logging()`, automatic `print()` capture, direct logging helpers, log rotation (30 days).

**Required variables:** `API_KEY` (for demo)

### 3. `real_world_example.py` — Practical Scenario

Report generation workflow: API fetch, local save, optional S3 upload and email.

**Required variables:** `REPORT_PATH` | **Optional:** `S3_BUCKET`, `REPORT_EMAIL`, `API_URL`

### 4. `legacy_migration.py` — Working with Existing Code

Two migration approaches: `inject_env()` for minimal changes, `var()` for new code.

**Required variables:** `API_KEY`

### 5. `error_handling.py` — Production-Ready Code

Exception handling, graceful degradation, value validation, conditional features.

**Required variables:** None

## Need Help?

- [Main README](../README.md)
- [GitHub Issues](https://github.com/shakedex/hedgebuddy/issues)
