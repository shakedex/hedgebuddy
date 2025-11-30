#!/usr/bin/env python3
"""
Example: Using HedgeBuddy Logging

Demonstrates automatic logging for headless scripts.
Perfect for debugging OffShoot/FoolCat automation scripts.
"""

import hedgebuddy

# Enable logging at the start of your script
# This creates one log file per day and captures all print() statements
hedgebuddy.enable_logging()

# Now all print() statements get logged automatically!
print("Script started")
print("=" * 60)

# Load variables as usual
try:
    api_key = hedgebuddy.var("API_KEY")
    print(f"✓ Loaded API_KEY: {api_key[:10]}...")
except hedgebuddy.VariableNotFoundError:
    print("❌ API_KEY not configured")
    exit(1)

# Your script logic
print("Processing data...")

# Use the logger directly for specific log levels
hedgebuddy.log("Transfer completed successfully")
hedgebuddy.log_warning("Disk space running low")

# Errors are automatically logged
try:
    result = 10 / 0
except ZeroDivisionError as e:
    hedgebuddy.log_error(f"Calculation failed: {e}")
    print(f"ERROR: {e}")

print("=" * 60)
print("Script finished")

# All output is in: %APPDATA%\hedgebuddy\logs\logging_example_2025-11-17.log
# (or ~/Library/Application Support/hedgebuddy/logs/ on macOS)
