# Quick Start

Get up and running with HedgeBuddy in 5 minutes.

---

## For Script Users (Non-Technical)

Just want to run existing Python scripts that use HedgeBuddy?

### Step 1: Install Python

If you don't have Python 3.13+:

- **Windows**: [Download Python](https://www.python.org/downloads/) and run installer
- **macOS**: Run `brew install python` or [download](https://www.python.org/downloads/)

### Step 2: Install HedgeBuddy Library

Open Terminal/Command Prompt and run:

```bash
pip install --user hedgebuddy
```

### Step 3: Install Desktop App

1. Download from [GitHub Releases](https://github.com/shakedex/hedgebuddy/releases)
2. Extract and run the app

### Step 4: Configure Variables

The script you're trying to run will tell you what variables it needs. For example, if you get this error:

```bash
VariableNotFoundError: Variable 'API_KEY' not found in HedgeBuddy storage.
```

1. Open the HedgeBuddy desktop app
2. Click **"Add Variable"**
3. Fill in:
   - **Name**: `API_KEY`
   - **Value**: Your API key (provided by the script author)
   - **Type**: `Secure` (for sensitive data) or `String`
4. Click **Save**

### Step 5: Run Your Script

Now the script will work! Just run it:

```bash
python your_script.py
```

---

## For Script Developers

Want to make your Python scripts configurable with HedgeBuddy?

### Basic Usage

```python
import hedgebuddy

# Required variable (raises error if missing)
api_key = hedgebuddy.var("API_KEY")

# Optional variable with fallback
api_url = hedgebuddy.var("API_URL", "https://api.example.com")

# Optional variable (None if missing)
email = hedgebuddy.var("REPORT_EMAIL", None)
if email:
    send_report(email)
```

### Complete Example

```python
import hedgebuddy

def main():
    # Required configuration
    api_key = hedgebuddy.var("API_KEY")
    report_path = hedgebuddy.var("REPORT_PATH")

    # Optional configuration
    api_url = hedgebuddy.var("API_URL", "https://api.hedge.co/v1")
    timeout = int(hedgebuddy.var("TIMEOUT", "30"))

    # Conditional features
    if hedgebuddy.exists("S3_BUCKET"):
        bucket = hedgebuddy.var("S3_BUCKET")
        print(f"Will upload to S3: {bucket}")

    # Your script logic here
    print(f"Connecting to {api_url}...")
    print(f"Saving reports to {report_path}")

if __name__ == "__main__":
    main()
```

---

## What Variables to Use?

Choose variable types based on what you're storing:

| Type       | Use For             | Example                     |
| ---------- | ------------------- | --------------------------- |
| **String** | General text values | `API_KEY`, `USERNAME`       |
| **Path**   | File/folder paths   | `REPORT_PATH`, `CONFIG_DIR` |
| **URL**    | Web addresses       | `API_URL`, `WEBHOOK_URL`    |
| **Secure** | Sensitive data      | `PASSWORD`, `SECRET_TOKEN`  |

!> **Security Note**: In the current version, all variable types (including `Secure`) are stored as plaintext in `vars.json`. Keychain integration is planned for a future release.

---

## Next Steps

- [Python Library Guide](python-library.md) - Complete API documentation
- [Desktop App Guide](desktop-app.md) - Using the GUI in detail
- [Examples](examples.md) - Real-world usage patterns
- [FAQ](faq.md) - Common questions and troubleshooting
