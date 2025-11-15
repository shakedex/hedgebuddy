# Python Examples

## Basic Usage

```python
import hedgebuddy

# Read a variable
report_path = hedgebuddy.var("REPORT_PATH")

# Read with default value
api_url = hedgebuddy.var("API_URL", "https://api.hedge.co/v1")
```

## Running Examples

1. Install HedgeBuddy Python library:

   ```bash
   pip install hedgebuddy
   ```

2. Set up variables using the HedgeBuddy GUI app

3. Run the example:
   ```bash
   python basic_usage.py
   ```

## Variable Setup

For the examples to work, create these variables in HedgeBuddy GUI:

- **REPORT_PATH** (type: path) - Path to reports directory
- **API_URL** (type: url) - API endpoint URL
- **API_KEY** (type: secure) - Your API key
- **OUTPUT_DIR** (type: path) - Output directory for files
