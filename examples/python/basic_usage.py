"""
Example: Basic usage of HedgeBuddy
"""

import hedgebuddy

# Read a variable (returns None if not found)
report_path = hedgebuddy.var("REPORT_PATH")
print(f"Report path: {report_path}")

# Read a variable with a default value
api_url = hedgebuddy.var("API_URL", "https://api.hedge.co/v1")
print(f"API URL: {api_url}")

# Read an API key (will be plaintext in Phase 1, encrypted in Phase 2)
api_key = hedgebuddy.var("API_KEY")
if api_key:
    print(f"API Key: {api_key[:8]}..." if len(api_key) > 8 else "API Key: (set)")
else:
    print("API Key: (not set)")

# Use in a real script scenario
output_dir = hedgebuddy.var("OUTPUT_DIR", "./output")
print(f"\nSaving files to: {output_dir}")
