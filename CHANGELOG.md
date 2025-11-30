# Changelog

All notable changes to HedgeBuddy will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.6.0] - 2025-11-30

- Desktop app with full CRUD for variables (add, edit, delete)
- Variable types: String, Path, URL
- Path validation (checks existence), URL validation (http/https)
- Import variables from JSON template files
- Browse button for path selection
- Refresh/Open folder buttons
- About screen, toast notifications
- Python library: `var()`, `exists()`, `all_vars()`, `inject_env()`
- Logging module for headless scripts
- Custom exceptions with helpful messages
- Example scripts for FoolCat, OffShoot integrations
- `secure` type planned for future (OS keychain)

## [0.5.1] - 2025-11-17

- Initial Python library release on PyPI
- Basic variable reading from vars.json

## [0.5.0] - 2025-11-15

- Initial project structure
- Wails app skeleton
- Python library skeleton
