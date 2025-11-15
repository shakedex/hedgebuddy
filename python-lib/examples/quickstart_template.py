"""
HedgeBuddy Quick Start - Copy & Paste Template
===============================================

This is a minimal template you can copy and paste to get started quickly.
Just replace the variable names and add your logic!

INSTALLATION:
Install HedgeBuddy globally so all your scripts can use it:

    pip install --user hedgebuddy
"""

import hedgebuddy

# ============================================================================
# Step 1: Load your variables
# ============================================================================

# Required variables (script will fail if not configured)
API_KEY = hedgebuddy.var("API_KEY")
DATABASE_URL = hedgebuddy.var("DATABASE_URL")

# Optional variables with defaults
API_TIMEOUT = int(hedgebuddy.var("API_TIMEOUT", "30"))
DEBUG_MODE = hedgebuddy.var("DEBUG_MODE", "false") == "true"
MAX_RETRIES = int(hedgebuddy.var("MAX_RETRIES", "3"))

# Optional variables (None if not configured)
REPORT_EMAIL = hedgebuddy.var("REPORT_EMAIL", None)
WEBHOOK_URL = hedgebuddy.var("WEBHOOK_URL", None)

# ============================================================================
# Step 2: Use your variables in your logic
# ============================================================================

def main():
    print("Starting your script...")
    print(f"API Key: {API_KEY[:10]}...")
    print(f"Database: {DATABASE_URL}")
    print(f"Timeout: {API_TIMEOUT}s")
    print(f"Debug Mode: {DEBUG_MODE}")
    
    # Your main logic here
    # ...
    
    # Conditional features based on optional variables
    if REPORT_EMAIL:
        print(f"Will send report to: {REPORT_EMAIL}")
    
    if hedgebuddy.exists("WEBHOOK_URL"):
        print(f"Will notify webhook: {WEBHOOK_URL}")
    
    print("Script completed!")


# ============================================================================
# Step 3: Run with error handling
# ============================================================================

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Error: {e}")
        print("\nMake sure you've configured these variables using HedgeBuddy:")
        print("  - API_KEY (required)")
        print("  - DATABASE_URL (required)")
