Project Brief: HedgeBuddy
Overview

HedgeBuddy is a small, cross-platform utility designed for the Hedge.co suite (Offshoot, Foolcat, etc.) to make Python scripts more accessible and configurable. The goal is to centralize environment variables required by scripts without requiring end-users to touch the system environment or edit scripts manually.

Script developers continue using normal Python environment variable calls (e.g., os.environ["REPORT_PATH"]), but HedgeBuddy injects or exposes these values dynamically via a local file or service.

Key Goals

Zero-friction for script developers

No changes required in existing scripts beyond importing the HedgeBuddy library.

Developers can continue using $VAR style variables or os.environ["VAR"].

No global system pollution

Variables are stored locally in a secure, app-controlled location.

Avoids writing to HKCU/launchctl or global PATH.

User-friendly for end-users

Simple GUI for adding/editing environment variables.

Variables automatically used by scripts without the user needing technical knowledge.

Cross-platform support

Must run natively on Windows and macOS.

Scripts should behave identically on both platforms.

Core Components

HedgeBuddy Library (Python module)

Name: hedgebuddy

Provides a single function: hedgebuddy.var("VAR_NAME") which reads the variable from HedgeBuddy’s local storage.

Optional: override Python’s os.environ temporarily when scripts are loaded.

Reads from a local JSON/SQLite file or a local HTTP endpoint exposed by HedgeBuddy.

HedgeBuddy App (GUI + backend)

GUI for managing variables:

Add, edit, remove variables

Set type: string, path, secure (password)

Validate entries (paths exist, URLs well-formed)

Stores variables in local JSON/SQLite, encrypted if necessary.

Optionally exposes variables over a local HTTP API (e.g., http://localhost:12345/vars/REPORT_PATH) for HedgeBuddy Python module to consume.

Workflow

User opens HedgeBuddy app → edits/creates variables.

Variables are saved in a local, secure storage.

Python scripts call hedgebuddy.var("VAR_NAME") → returns the value.

Scripts continue to run in Hedge normally with all variables injected dynamically.

Developer Notes

No need to touch system environment.

Support Windows (%APPDATA%/HedgeBuddy/vars.json) and macOS (~/Library/Application Support/HedgeBuddy/vars.json).

Python module should have fallback: return None if variable not set.

Consider optional automatic injection into os.environ when module is imported.

GUI framework can be Tauri, Fyne, Wails, or Electron, depending on preferred stack.

Local HTTP API (optional) should be lightweight, only accessible from localhost.

Deliverables

Python library hedgebuddy (PyPI-ready)

Cross-platform GUI app to manage variables

Documentation:

How to install Python module

How to configure variables

How script developers use it

Optional: local HTTP API for more advanced scripts