"""
HedgeBuddy Quick Start - OffShoot Automation Template
=====================================================

This is a minimal template for OffShoot automation scripts.
Copy and paste this to get started quickly!

INSTALLATION:
Install HedgeBuddy globally so all your scripts can use it:

    pip install --user hedgebuddy
"""

import sys
import json
import hedgebuddy

# ============================================================================
# Step 1: Load your variables
# ============================================================================

# Required variables (script will fail if not configured)
SLACK_WEBHOOK = hedgebuddy.var("HB_SLACK_WEBHOOK_URL")
LOG_PATH = hedgebuddy.var("HB_LOG_PATH")

# Optional variables with defaults
S3_BUCKET = hedgebuddy.var("HB_S3_BUCKET", None)
NOTIFY_FAILED_ONLY = hedgebuddy.var("HB_NOTIFY_ON_FAILED_ONLY", "false") == "true"
PRODUCTION_FOLDER = hedgebuddy.var("HB_PRODUCTION_FOLDER", None)

# ============================================================================
# Step 2: Parse OffShoot event (if triggered by OffShoot)
# ============================================================================

def parse_event():
    """Parse OffShoot event data from command line."""
    if len(sys.argv) < 2:
        return None
    
    try:
        return json.loads(sys.argv[1])
    except json.JSONDecodeError:
        return None

# ============================================================================
# Step 3: Your automation logic
# ============================================================================

def main():
    print("Starting OffShoot automation...")
    
    # Parse event
    event_data = parse_event()
    if event_data:
        state = event_data.get("FileCopyCompleted_state", "Unknown")
        source = event_data.get("FileCopyCompleted_sourcePaths", "Unknown")
        print(f"Transfer {state}: {source}")
    
    # Use your variables
    print(f"Slack webhook: {SLACK_WEBHOOK[:50]}...")
    print(f"Log path: {LOG_PATH}")
    
    # Your main logic here
    # ...
    
    # Conditional features based on optional variables
    if S3_BUCKET:
        print(f"Will upload to S3: {S3_BUCKET}")
    
    if PRODUCTION_FOLDER:
        print(f"Will move files to: {PRODUCTION_FOLDER}")
    
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
