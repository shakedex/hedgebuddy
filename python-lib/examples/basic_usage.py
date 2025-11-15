"""
HedgeBuddy Demo - Basic Usage
==============================

This script demonstrates the core functionality of HedgeBuddy:
- Reading required variables
- Using optional variables with defaults
- Checking if variables exist
- Getting all variables

PREREQUISITES:
1. Install HedgeBuddy globally:
   pip install --user hedgebuddy

2. Install and run the HedgeBuddy desktop app

3. Add these variables using the HedgeBuddy app:
   - API_KEY (required)
   - DATABASE_URL (optional, has default)
   - REPORT_EMAIL (optional)
"""

import hedgebuddy


def main():
    print("=" * 60)
    print("HedgeBuddy Demo - Basic Usage")
    print("=" * 60)
    print()

    # 1. Reading a required variable (raises error if missing)
    print("1. Reading required variable:")
    try:
        api_key = hedgebuddy.var("API_KEY")
        print(f"   ✓ API_KEY: {api_key[:10]}..." if len(api_key) > 10 else f"   ✓ API_KEY: {api_key}")
    except Exception as e:
        print(f"   ✗ Error: {e}")
    print()

    # 2. Reading an optional variable with a default fallback
    print("2. Optional variable with default:")
    database_url = hedgebuddy.var("DATABASE_URL", "sqlite:///local.db")
    print(f"   ✓ DATABASE_URL: {database_url}")
    print()

    # 3. Reading an optional variable (returns None if missing)
    print("3. Optional variable (None if missing):")
    report_email = hedgebuddy.var("REPORT_EMAIL", None)
    if report_email:
        print(f"   ✓ Will send reports to: {report_email}")
    else:
        print("   ℹ No report email configured (will save locally)")
    print()

    # 4. Checking if a variable exists before using it
    print("4. Checking if variable exists:")
    if hedgebuddy.exists("DEBUG_MODE"):
        debug_mode = hedgebuddy.var("DEBUG_MODE")
        print(f"   ✓ Debug mode is: {debug_mode}")
    else:
        print("   ℹ DEBUG_MODE not configured (using default: false)")
    print()

    # 5. Getting all variables
    print("5. All configured variables:")
    variables = hedgebuddy.all_vars()
    print(f"   ✓ Found {len(variables)} variable(s):")
    for name in sorted(variables.keys()):
        value = variables[name]
        # Truncate long values for display
        display_value = f"{value[:30]}..." if len(value) > 30 else value
        print(f"      - {name}: {display_value}")
    print()

    print("=" * 60)
    print("Demo completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    main()
