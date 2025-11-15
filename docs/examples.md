# Examples

Real-world examples showing how to use HedgeBuddy in your Python scripts.

---

## Running the Examples

All example scripts are available in the [GitHub repository](https://github.com/shakedex/hedgebuddy/tree/main/python-lib/examples).

**Prerequisites:**

1. Install HedgeBuddy: `pip install --user hedgebuddy`
2. Install and launch the desktop app
3. Configure the required variables (noted in each example)

**Download and run:**

```bash
# Clone the repository
git clone https://github.com/shakedex/hedgebuddy.git
cd hedgebuddy/python-lib/examples

# Run any example
python basic_usage.py
python real_world_example.py
python legacy_migration.py
python error_handling.py
```

---

## Example 1: Basic Usage

**File:** [`basic_usage.py`](https://github.com/shakedex/hedgebuddy/blob/main/python-lib/examples/basic_usage.py)

Demonstrates the core HedgeBuddy functions.

**Required Variables:**

- `API_KEY`

**Optional Variables:**

- `DATABASE_URL`
- `REPORT_EMAIL`
- `DEBUG_MODE`

### Code

```python
import hedgebuddy

def main():
    # 1. Reading a required variable (raises error if missing)
    api_key = hedgebuddy.var("API_KEY")
    print(f"✓ API_KEY: {api_key[:10]}...")

    # 2. Optional variable with default fallback
    database_url = hedgebuddy.var("DATABASE_URL", "sqlite:///local.db")
    print(f"✓ DATABASE_URL: {database_url}")

    # 3. Optional variable (None if missing)
    report_email = hedgebuddy.var("REPORT_EMAIL", None)
    if report_email:
        print(f"✓ Will send reports to: {report_email}")
    else:
        print("ℹ No report email configured")

    # 4. Check if variable exists
    if hedgebuddy.exists("DEBUG_MODE"):
        debug_mode = hedgebuddy.var("DEBUG_MODE")
        print(f"✓ Debug mode: {debug_mode}")
    else:
        print("ℹ DEBUG_MODE not configured (using default: false)")

    # 5. Get all variables
    variables = hedgebuddy.all_vars()
    print(f"✓ Found {len(variables)} variable(s)")

if __name__ == "__main__":
    main()
```

### What You'll Learn

- How to read required variables
- How to provide default values for optional variables
- How to check if a variable exists
- How to get all configured variables

[View Full Code on GitHub →](https://github.com/shakedex/hedgebuddy/blob/main/python-lib/examples/basic_usage.py)

---

## Example 2: Real-World Scenario

**File:** [`real_world_example.py`](https://github.com/shakedex/hedgebuddy/blob/main/python-lib/examples/real_world_example.py)

Simulates a sales report generator that:

- Fetches data from an API
- Generates a report
- Saves locally (required)
- Optionally uploads to S3
- Optionally sends via email

**Required Variables:**

- `REPORT_PATH` - Where to save reports locally

**Optional Variables:**

- `API_URL` - Custom API endpoint (default: `https://api.hedge.co/v1`)
- `S3_BUCKET` - AWS S3 bucket for cloud backup
- `REPORT_EMAIL` - Email address for delivery

### Code Highlights

```python
import hedgebuddy
from pathlib import Path
from datetime import datetime

def generate_report():
    """Simulate report generation."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_content = f"""
    Sales Report - {timestamp}
    ================================

    Total Sales: $125,450.00
    New Customers: 42
    Revenue Growth: +15.3%
    """
    return report_content, f"sales_report_{timestamp}.txt"

def save_report_locally(report_content, filename):
    """Save report to local filesystem."""
    report_path = Path(hedgebuddy.var("REPORT_PATH"))
    report_path.mkdir(parents=True, exist_ok=True)

    file_path = report_path / filename
    file_path.write_text(report_content, encoding="utf-8")
    print(f"✓ Report saved to: {file_path}")
    return file_path

def main():
    # Fetch data from configurable API
    api_url = hedgebuddy.var("API_URL", "https://api.hedge.co/v1")
    print(f"Fetching data from: {api_url}/sales")

    # Generate and save report (required)
    report_content, filename = generate_report()
    file_path = save_report_locally(report_content, filename)

    # Optional S3 upload
    if hedgebuddy.exists("S3_BUCKET"):
        bucket = hedgebuddy.var("S3_BUCKET")
        print(f"✓ Would upload to: s3://{bucket}/{filename}")
    else:
        print("ℹ S3_BUCKET not configured, skipping upload")

    # Optional email delivery
    email = hedgebuddy.var("REPORT_EMAIL", None)
    if email:
        print(f"✓ Would email to: {email}")
    else:
        print("ℹ REPORT_EMAIL not configured, skipping email")

if __name__ == "__main__":
    main()
```

### What You'll Learn

- Configurable API endpoints with sensible defaults
- Required vs optional functionality
- Graceful degradation when optional features aren't configured
- Working with file paths

[View Full Code on GitHub →](https://github.com/shakedex/hedgebuddy/blob/main/python-lib/examples/real_world_example.py)

---

## Example 3: Legacy Code Migration

**File:** [`legacy_migration.py`](https://github.com/shakedex/hedgebuddy/blob/main/python-lib/examples/legacy_migration.py)

Shows how to use HedgeBuddy with existing code that uses `os.environ`.

**Required Variables:**

- `API_KEY`
- `DATABASE_URL` (optional, has default)

### Code Highlights

```python
import hedgebuddy
import os

def legacy_function_using_os_environ():
    """
    Old code that expects environment variables.
    No changes needed when using inject_env()!
    """
    api_key = os.environ.get("API_KEY", "default-key")
    database_url = os.environ.get("DATABASE_URL", "sqlite:///default.db")

    print(f"API_KEY (from os.environ): {api_key[:10]}...")
    print(f"DATABASE_URL (from os.environ): {database_url}")

def modern_function_using_hedgebuddy():
    """
    New code using HedgeBuddy directly.
    Cleaner and more explicit!
    """
    api_key = hedgebuddy.var("API_KEY")
    database_url = hedgebuddy.var("DATABASE_URL", "sqlite:///default.db")

    print(f"API_KEY (from HedgeBuddy): {api_key[:10]}...")
    print(f"DATABASE_URL (from HedgeBuddy): {database_url}")

def main():
    # Approach 1: Use inject_env() for legacy compatibility
    print("Approach 1: Using inject_env() for legacy code")
    count = hedgebuddy.inject_env(overwrite=False)
    print(f"✓ Injected {count} variables into os.environ")
    legacy_function_using_os_environ()

    # Approach 2: Use var() directly (recommended)
    print("\nApproach 2: Using var() directly (recommended)")
    modern_function_using_hedgebuddy()

if __name__ == "__main__":
    main()
```

### What You'll Learn

- How to use `inject_env()` for compatibility with legacy code
- Gradual migration from `os.environ` to `hedgebuddy.var()`
- When to use each approach

[View Full Code on GitHub →](https://github.com/shakedex/hedgebuddy/blob/main/python-lib/examples/legacy_migration.py)

---

## Example 4: Error Handling

**File:** [`error_handling.py`](https://github.com/shakedex/hedgebuddy/blob/main/python-lib/examples/error_handling.py)

Demonstrates proper error handling for production-ready code.

**Required Variables:** None (demonstrates handling missing variables)

### Code Highlights

```python
import hedgebuddy

def example_1_basic_error_handling():
    """Basic error handling for required variables."""
    try:
        api_key = hedgebuddy.var("API_KEY")
        print(f"✓ Successfully loaded API_KEY")
    except hedgebuddy.VariableNotFoundError as e:
        print(f"❌ Missing variable: {e.variable_name}")
        print("Please add it using the HedgeBuddy app")
    except hedgebuddy.StorageNotFoundError:
        print("❌ HedgeBuddy storage not found!")
        print("Please install the desktop app")
    except hedgebuddy.StorageCorruptedError as e:
        print(f"❌ Storage corrupted: {e.reason}")

def example_2_graceful_degradation():
    """Gracefully degrade features when variables are missing."""
    # Essential variable - must exist
    try:
        report_path = hedgebuddy.var("REPORT_PATH")
        print(f"✓ Reports will be saved to: {report_path}")
    except hedgebuddy.VariableNotFoundError:
        print("❌ REPORT_PATH is required but not configured!")
        return

    # Optional feature - use default if missing
    timeout = int(hedgebuddy.var("REQUEST_TIMEOUT", "30"))
    print(f"✓ Using request timeout: {timeout}s")

    # Optional feature - disable if missing
    if hedgebuddy.exists("PREMIUM_API_KEY"):
        print("✓ Premium features enabled")
    else:
        print("ℹ Premium features disabled")

def example_3_validation():
    """Validate variable values after loading."""
    timeout_str = hedgebuddy.var("REQUEST_TIMEOUT", "30")

    try:
        timeout = int(timeout_str)
        if timeout <= 0:
            raise ValueError("Timeout must be positive")
        print(f"✓ Valid timeout: {timeout}s")
    except ValueError as e:
        print(f"❌ Invalid timeout value: {timeout_str}")
        print("Using default: 30s")
        timeout = 30
```

### What You'll Learn

- Catching and handling specific exceptions
- Graceful feature degradation
- Validating variable values after loading
- Conditional feature enablement

[View Full Code on GitHub →](https://github.com/shakedex/hedgebuddy/blob/main/python-lib/examples/error_handling.py)

---

## Quick Reference Template

Use this as a starting template for your own scripts:

```python
"""
Your Script Name

Required HedgeBuddy Variables:
- API_KEY: Your API key from the service
- OUTPUT_PATH: Directory to save output files

Optional HedgeBuddy Variables:
- API_URL: Custom API endpoint (default: https://api.example.com)
- TIMEOUT: Request timeout in seconds (default: 30)
"""

import hedgebuddy
from pathlib import Path

def main():
    # Load required configuration
    try:
        api_key = hedgebuddy.var("API_KEY")
        output_path = Path(hedgebuddy.var("OUTPUT_PATH"))
    except hedgebuddy.VariableNotFoundError as e:
        print(f"❌ Missing required variable: {e.variable_name}")
        print("Please configure it using the HedgeBuddy desktop app")
        return

    # Load optional configuration with defaults
    api_url = hedgebuddy.var("API_URL", "https://api.example.com")
    timeout = int(hedgebuddy.var("TIMEOUT", "30"))

    # Your script logic here
    print(f"Using API: {api_url}")
    print(f"Saving output to: {output_path}")
    print("Processing...")

    # ... your code ...

if __name__ == "__main__":
    main()
```

---

## Common Patterns

### Pattern 1: Conditional Features

Enable features based on configuration:

```python
import hedgebuddy

# Core functionality (always runs)
data = fetch_data()
result = process_data(data)

# Optional S3 upload
if hedgebuddy.exists("S3_BUCKET"):
    upload_to_s3(result, hedgebuddy.var("S3_BUCKET"))

# Optional email notification
if hedgebuddy.exists("NOTIFICATION_EMAIL"):
    send_email(hedgebuddy.var("NOTIFICATION_EMAIL"), result)

# Optional premium features
if hedgebuddy.exists("PREMIUM_API_KEY"):
    enhanced_result = apply_premium_features(result)
```

### Pattern 2: Configuration Objects

Group related configuration:

```python
import hedgebuddy
from dataclasses import dataclass

@dataclass
class Config:
    api_key: str
    api_url: str = "https://api.example.com"
    timeout: int = 30
    debug: bool = False

def load_config() -> Config:
    return Config(
        api_key=hedgebuddy.var("API_KEY"),
        api_url=hedgebuddy.var("API_URL", "https://api.example.com"),
        timeout=int(hedgebuddy.var("TIMEOUT", "30")),
        debug=hedgebuddy.var("DEBUG", "false") == "true"
    )

config = load_config()
```

### Pattern 3: Environment-Specific Configuration

Different settings for dev/staging/prod:

```python
import hedgebuddy

# Determine environment
env = hedgebuddy.var("ENVIRONMENT", "production")

# Load environment-specific config
if env == "development":
    api_url = hedgebuddy.var("DEV_API_URL", "http://localhost:8000")
    debug = True
elif env == "staging":
    api_url = hedgebuddy.var("STAGING_API_URL")
    debug = False
else:  # production
    api_url = hedgebuddy.var("PROD_API_URL")
    debug = False

print(f"Running in {env} mode")
print(f"API URL: {api_url}")
```

---

## Next Steps

- [Python Library Guide](python-library.md) - Complete API reference
- [Desktop App Guide](desktop-app.md) - How to configure variables
- [FAQ](faq.md) - Common questions and troubleshooting
