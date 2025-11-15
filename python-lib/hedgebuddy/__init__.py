"""
HedgeBuddy - Cross-platform environment variable management for Python scripts.

This module provides a simple interface to read environment variables stored
by the HedgeBuddy GUI application without polluting the system environment.
"""

from .core import var

__version__ = "0.1.0"
__all__ = ["var"]
