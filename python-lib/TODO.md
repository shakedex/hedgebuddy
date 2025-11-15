# Python Library TODO

## Phase 1 - Core Functionality ✅ COMPLETE

### ✅ Completed

- [x] Project structure setup (pyproject.toml, package metadata)
- [x] Python 3.13+ compatibility
- [x] `uv` package manager integration
- [x] Core variable reading function `hedgebuddy.var("VAR_NAME")`
  - [x] Read from platform-specific vars.json location
  - [x] Windows: `%APPDATA%\hedgebuddy\vars.json`
  - [x] macOS: `~/Library/Application Support/hedgebuddy/vars.json`
  - [x] Linux: `~/.local/share/hedgebuddy/vars.json` (future support)
  - [x] Return variable value as string
  - [x] Support optional default parameter
  - [x] Raise clear exception if variable not found (no default)
  - [x] Raise clear exception if vars.json doesn't exist
- [x] Custom exceptions:
  - [x] `VariableNotFoundError` - Variable doesn't exist in vars.json
  - [x] `StorageNotFoundError` - vars.json file doesn't exist
  - [x] `StorageCorruptedError` - vars.json is invalid/malformed JSON
- [x] Optional features:
  - [x] `hedgebuddy.get(name, default=None)` - Deprecated (use var with default)
  - [x] `hedgebuddy.all_vars()` - Return all variables as dict
  - [x] `hedgebuddy.exists(name)` - Check if variable exists (returns bool)
  - [x] `hedgebuddy.inject_env(overwrite=False)` - Inject into os.environ
- [x] Comprehensive testing (30 tests, 95% coverage):
  - [x] Unit tests for `var()` function with defaults
  - [x] Unit tests for error cases (missing file, missing variable)
  - [x] Unit tests for platform-specific path resolution
  - [x] Mock vars.json for testing
  - [x] Test invalid JSON handling
  - [x] Test edge cases (empty vars, malformed structure)
  - [x] Cross-platform CI testing (Linux/GitHub Actions)
- [x] Documentation:
  - [x] README.md with usage examples
  - [x] Installation instructions (`pip install --user hedgebuddy`)
  - [x] API reference documentation
  - [x] Migration guide from `os.environ`
  - [x] 5 practical example scripts (basic, real-world, legacy, error handling, quickstart)
  - [x] Examples README with quick reference
- [x] Distribution:
  - [x] Build package configuration
  - [x] GitHub Actions workflow for PyPI publishing
  - [x] **Published to PyPI v0.5.0** 🎉
  - [x] Version tagging and changelog (PUBLISHING.md)
  - [x] Automated testing in CI/CD

## Phase 2 - Potential Enhancements (Low Priority)

### Nice to Have

- [ ] Integration examples showing HedgeBuddy with popular frameworks (FastAPI, Flask, Django)
- [ ] Video tutorial / quick screencast showing installation and basic usage

## Notes

- ✅ Library is lightweight (stdlib only)
- ✅ Simple API: single import, single function call (`import hedgebuddy; hedgebuddy.var()`)
- ✅ Clear error messages for debugging
- ✅ Cross-platform compatibility (Windows, macOS, Linux ready)
- ✅ 95% test coverage
- ✅ Published on PyPI: <https://pypi.org/project/hedgebuddy/>
- ✅ Namespace pattern to avoid conflicts
- ✅ Complete documentation with 5 practical examples
- ✅ Built-in fallback functionality via default parameters

## Current Status: ✅ PRODUCTION READY & FEATURE COMPLETE

**Version 0.5.0** is live on PyPI and fully functional!

**Design Philosophy:**

- Scripts execute on-demand (no need for caching, file watching, or async)
- GUI app manages variables (no need for CLI tools or .env files)
- Simple, focused API (no feature bloat)

The Python library is **complete** and ready for real-world use! 🎉
