"""
HedgeBuddy Demo - Error Handling
=================================

This script demonstrates proper error handling with HedgeBuddy,
showing best practices for production code.
"""

import hedgebuddy


def example_1_basic_error_handling():
    """Basic error handling for required variables."""
    print("Example 1: Basic error handling")
    print("-" * 50)
    
    try:
        api_key = hedgebuddy.var("API_KEY")
        print(f"✓ Successfully loaded API_KEY: {api_key[:10]}...")
    except hedgebuddy.VariableNotFoundError as e:
        print(f"❌ Missing variable: {e.variable_name}")
        print("   Please add it using the HedgeBuddy app!")
    except hedgebuddy.StorageNotFoundError:
        print("❌ HedgeBuddy storage not found!")
        print("   Please install and run the HedgeBuddy desktop app.")
    except hedgebuddy.StorageCorruptedError as e:
        print(f"❌ Storage file is corrupted: {e.reason}")
        print("   Please use the HedgeBuddy app to fix it.")
    print()


def example_2_graceful_degradation():
    """Gracefully degrade features when variables are missing."""
    print("Example 2: Graceful degradation")
    print("-" * 50)
    
    # Essential variable - must exist
    try:
        report_path = hedgebuddy.var("REPORT_PATH")
        print(f"✓ Reports will be saved to: {report_path}")
    except hedgebuddy.VariableNotFoundError:
        print("❌ REPORT_PATH is required but not configured!")
        print("   Cannot continue without it.")
        return
    
    # Optional feature - use default if missing
    timeout = int(hedgebuddy.var("REQUEST_TIMEOUT", "30"))
    print(f"✓ Using request timeout: {timeout}s")
    
    # Optional feature - disable if missing
    if hedgebuddy.exists("PREMIUM_API_KEY"):
        print("✓ Premium features enabled")
    else:
        print("ℹ Premium features disabled (no PREMIUM_API_KEY)")
    
    print()


def example_3_validation():
    """Validate variable values after loading."""
    print("Example 3: Validation")
    print("-" * 50)
    
    try:
        # Load and validate
        timeout_str = hedgebuddy.var("REQUEST_TIMEOUT", "30")
        
        try:
            timeout = int(timeout_str)
            if timeout <= 0:
                raise ValueError("Timeout must be positive")
            print(f"✓ Valid timeout: {timeout}s")
        except ValueError as e:
            print(f"❌ Invalid timeout value: {timeout_str}")
            print(f"   Error: {e}")
            print("   Using default: 30s")
            timeout = 30
        
        # Load and validate URL
        api_url = hedgebuddy.var("API_URL", "https://api.example.com")
        if not api_url.startswith(("http://", "https://")):
            print(f"⚠ Warning: API_URL doesn't look like a URL: {api_url}")
        else:
            print(f"✓ Valid API URL: {api_url}")
        
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
    
    print()


def example_4_conditional_features():
    """Enable/disable features based on configuration."""
    print("Example 4: Conditional features")
    print("-" * 50)
    
    # Check which features are configured
    features = {
        "Email Notifications": hedgebuddy.exists("SMTP_SERVER"),
        "S3 Upload": hedgebuddy.exists("S3_BUCKET"),
        "Slack Integration": hedgebuddy.exists("SLACK_WEBHOOK_URL"),
        "Database Logging": hedgebuddy.exists("DATABASE_URL"),
    }
    
    print("Feature Status:")
    for feature, enabled in features.items():
        status = "✓ Enabled" if enabled else "○ Disabled"
        print(f"  {status}: {feature}")
    
    print()


def main():
    print("=" * 70)
    print("HedgeBuddy Demo - Error Handling Best Practices")
    print("=" * 70)
    print()

    example_1_basic_error_handling()
    example_2_graceful_degradation()
    example_3_validation()
    example_4_conditional_features()

    print("=" * 70)
    print("Key Takeaways:")
    print("-" * 70)
    print("1. Always handle VariableNotFoundError for required variables")
    print("2. Use defaults for optional configuration")
    print("3. Use exists() for optional features")
    print("4. Validate values after loading")
    print("5. Provide clear error messages to users")
    print("=" * 70)


if __name__ == "__main__":
    main()
