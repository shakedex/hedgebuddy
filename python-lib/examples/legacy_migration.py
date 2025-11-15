"""
HedgeBuddy Demo - Legacy Code Migration
========================================

This script shows how to use HedgeBuddy with existing code that uses os.environ.

Two approaches:
1. Using inject_env() to populate os.environ (minimal code changes)
2. Gradually migrating to use var() directly (recommended)
"""

import os
import hedgebuddy


def legacy_function_using_os_environ():
    """
    Old code that expects environment variables.
    No changes needed when using inject_env()!
    """
    api_key = os.environ.get("API_KEY", "default-key")
    database_url = os.environ.get("DATABASE_URL", "sqlite:///default.db")
    
    print(f"   API_KEY (from os.environ): {api_key[:10]}...")
    print(f"   DATABASE_URL (from os.environ): {database_url}")


def modern_function_using_hedgebuddy():
    """
    New code using HedgeBuddy directly.
    Cleaner and more explicit!
    """
    api_key = hedgebuddy.var("API_KEY")
    database_url = hedgebuddy.var("DATABASE_URL", "sqlite:///default.db")
    
    print(f"   API_KEY (from HedgeBuddy): {api_key[:10]}...")
    print(f"   DATABASE_URL (from HedgeBuddy): {database_url}")


def main():
    print("=" * 70)
    print("HedgeBuddy Demo - Legacy Code Migration")
    print("=" * 70)
    print()

    # Approach 1: Use inject_env() for legacy code
    print("Approach 1: Using inject_env() for legacy compatibility")
    print("-" * 70)
    
    # Inject HedgeBuddy variables into os.environ
    count = hedgebuddy.inject_env(overwrite=False)
    print(f"✓ Injected {count} variables into os.environ")
    print()
    
    print("Calling legacy function (uses os.environ):")
    legacy_function_using_os_environ()
    print()

    # Approach 2: Use var() directly (recommended)
    print("Approach 2: Using var() directly (recommended)")
    print("-" * 70)
    print("Calling modern function (uses HedgeBuddy):")
    modern_function_using_hedgebuddy()
    print()

    # Show the difference
    print("Key Differences:")
    print("-" * 70)
    print("✓ os.environ approach:")
    print("  - Works with existing code")
    print("  - Requires inject_env() call")
    print("  - Pollutes os.environ namespace")
    print()
    print("✓ var() approach:")
    print("  - Explicit and clear")
    print("  - No namespace pollution")
    print("  - Better error messages")
    print("  - Type hints and IDE support")
    print()

    print("=" * 70)
    print("💡 Recommendation: Gradually migrate to var() for new code,")
    print("   use inject_env() for compatibility with existing code.")
    print("=" * 70)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\n💡 Make sure you've configured API_KEY using the HedgeBuddy app!")
