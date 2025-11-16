# Examples

Production-ready automation examples for Hedge's software suite (OffShoot, FoolCat, EditReady).

---

## Real-World Automation Scripts

These are complete, production-ready scripts for DIT/data wrangling workflows. Each includes a JSON import template for easy setup.

### OffShoot Slack Notifier

Send beautifully formatted Slack notifications when OffShoot transfers complete.

**Location:** [`examples/scripts/offshoot-slack-notifier/`](https://github.com/shakedex/hedgebuddy/tree/master/examples/scripts/offshoot-slack-notifier)

**What it does:**

- Instant Slack notifications for all transfers
- Status emojis (✅/❌/⚠️) and color-coded messages
- Auto-formatted file sizes and durations
- Optional "failures only" mode
- Configurable webhook and channel per production

**Setup:**

1. Install: `pip install --user hedgebuddy requests`
2. Create Slack webhook at <https://api.slack.com/messaging/webhooks>
3. Import `offshoot-slack-notifier-template.json` in HedgeBuddy app
4. Update webhook URL in HedgeBuddy
5. Add script to OffShoot's "File Copy Completed" event

**Variables:**

- `HB_OS_SLACK_WEBHOOK_URL` (required)
- `HB_OS_SLACK_CHANNEL` (optional)
- `HB_OS_NOTIFY_ON_FAILED_ONLY` (optional)

[View Complete Documentation →](https://github.com/shakedex/hedgebuddy/tree/master/examples/scripts/offshoot-slack-notifier)

---

### FoolCat Report Mover

Automatically move or copy FoolCat PDF reports to a destination folder.

**Location:** [`examples/scripts/foolcat-pdf-mover/`](https://github.com/shakedex/hedgebuddy/tree/master/examples/scripts/foolcat-pdf-mover)

**What it does:**

- Auto-routes PDF camera reports on creation
- Move or copy mode (configurable)
- Creates destination folders automatically
- Cross-platform (Windows & macOS)

**Setup:**

1. Install: `pip install --user hedgebuddy`
2. Import `foolcat-report-mover-template.json` in HedgeBuddy app
3. Set your destination folder path
4. Add script to FoolCat's "Report Created" event

**Variables:**

- `HB_FC_DESTINATION_PATH` (required)
- `HB_FC_OPERATION_TYPE` (optional: "move" or "copy")

[View Complete Documentation →](https://github.com/shakedex/hedgebuddy/tree/master/examples/scripts/foolcat-pdf-mover)

---

### Hedge Payload Inspector

Debug tool for capturing and inspecting event payloads from Hedge apps.

**Location:** [`examples/scripts/hedge-payload-inspector/`](https://github.com/shakedex/hedgebuddy/tree/master/examples/scripts/hedge-payload-inspector)

**What it does:**

- Captures complete event payloads as JSON
- Saves with timestamps for debugging
- Works with OffShoot, FoolCat, EditReady events
- Essential for script development

**Setup:**

1. Install: `pip install --user hedgebuddy`
2. Import `hedge-payload-inspector-template.json` in HedgeBuddy app
3. Set output file path
4. Add to any Hedge app event

**Variables:**

- `HB_PAYLOAD_OUTPUT_PATH` (required)

[View Complete Documentation →](https://github.com/shakedex/hedgebuddy/tree/master/examples/scripts/hedge-payload-inspector)

---

## 💡 Pro Tip: Include JSON Templates

**Always include a `.json` import template with your scripts!**

This makes setup trivial for end-users:

```json
{
  "variables": {
    "HB_SCRIPT_DESTINATION": {
      "value": "",
      "type": "path",
      "description": "Where to save output files"
    },
    "HB_SCRIPT_API_KEY": {
      "value": "",
      "type": "secure",
      "description": "API key for service"
    }
  }
}
```

**Benefits:**

- Users just import and fill in values
- No manual variable creation
- Fewer support questions
- Professional user experience

---

## Developer Library Examples

These examples demonstrate HedgeBuddy's Python library features. Perfect for learning the API.

**Location:** [`python-lib/examples/`](https://github.com/shakedex/hedgebuddy/tree/master/python-lib/examples)

### Basic Usage

**File:** [`basic_usage.py`](https://github.com/shakedex/hedgebuddy/blob/master/python-lib/examples/basic_usage.py)

Core HedgeBuddy functions:

- Reading required variables
- Default values for optional variables
- Checking variable existence
- Getting all variables

### Real-World OffShoot Automation

**File:** [`real_world_example.py`](https://github.com/shakedex/hedgebuddy/blob/master/python-lib/examples/real_world_example.py)

Complete OffShoot automation example:

- Slack notifications
- S3 cloud uploads
- Transfer logging
- Production file routing

### Legacy Code Migration

**File:** [`legacy_migration.py`](https://github.com/shakedex/hedgebuddy/blob/master/python-lib/examples/legacy_migration.py)

Using HedgeBuddy with existing code:

- `inject_env()` for legacy compatibility
- Gradual migration from `os.environ`
- When to use each approach

### Error Handling

**File:** [`error_handling.py`](https://github.com/shakedex/hedgebuddy/blob/master/python-lib/examples/error_handling.py)

Production-ready error handling:

- Catching specific exceptions
- Graceful feature degradation
- Validating variable values
- Conditional feature enablement

### Quick Start Template

**File:** [`quickstart_template.py`](https://github.com/shakedex/hedgebuddy/blob/master/python-lib/examples/quickstart_template.py)

Copy-paste template for OffShoot automation:

- OffShoot event parsing
- HedgeBuddy variable loading
- Ready to customize

---

## Running the Examples

**Prerequisites:**

1. Install HedgeBuddy: `pip install --user hedgebuddy`
2. Install and launch the desktop app
3. Configure the required variables (noted in each example)

**Download and run:**

```bash
# Clone the repository
git clone https://github.com/shakedex/hedgebuddy.git

# Run production scripts
cd hedgebuddy/examples/scripts/offshoot-slack-notifier
python offshoot-slack-notifier.py

# Run developer library examples
cd hedgebuddy/python-lib/examples
python basic_usage.py
python real_world_example.py
```

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
