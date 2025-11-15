# HedgeBuddy Development Tasks

## Phase 1: Core Functionality

### Python Library (`python-lib/`)

- [ ] Implement `hedgebuddy.var(var_name)` function
  - [ ] Read from platform-specific JSON file location
    - Windows: `%APPDATA%\HedgeBuddy\vars.json`
    - macOS: `~/Library/Application Support/HedgeBuddy/vars.json`
  - [ ] Return `None` if variable not found (with optional default parameter)
  - [ ] Handle missing/corrupted JSON file gracefully
- [ ] Add platform detection utility (Windows vs macOS path resolution)
- [ ] Write unit tests for core functionality
- [ ] Update `pyproject.toml` with proper metadata
- [ ] Create usage examples in `examples/python/`

### Go GUI App (`go-app/`)

- [ ] Initialize Wails project structure
  - [ ] Set up Go backend with Wails CLI (`wails init`)
  - [ ] Configure TypeScript + Tailwind CSS frontend
  - [ ] Test hot-reload with `wails dev`
- [ ] Implement JSON storage layer
  - [ ] Create/read/write to `vars.json` at platform-specific locations
  - [ ] Define variable struct: `{name, value, type, description}`
  - [ ] Handle JSON marshaling/unmarshaling
- [ ] Build variable CRUD interface
  - [ ] List all variables (table/card view)
  - [ ] Add new variable form (name, value, type dropdown, description)
  - [ ] Edit existing variable (inline or modal)
  - [ ] Delete variable with confirmation
- [ ] Implement validation system
  - [ ] Path validator: Check if path exists on filesystem
  - [ ] URL validator: Verify http/https scheme + valid format
  - [ ] Required fields: Non-empty name and value
  - [ ] Display validation errors to user
  - [ ] Create extensible validator interface for adding new types
- [ ] Build frontend UI
  - [ ] Main window layout (list + action buttons)
  - [ ] Add/Edit variable form with Tailwind styling
  - [ ] Variable type selector (string/path/url/secure)
  - [ ] Success/error toast notifications
- [ ] Cross-platform testing
  - [ ] Test on Windows (build `.exe`)
  - [ ] Test on macOS (build app bundle)
  - [ ] Verify identical behavior on both platforms

### Integration & Testing

- [ ] Test Python library reading variables created by GUI
- [ ] Create end-to-end example script using `hedgebuddy.var()`
- [ ] Document installation process (GUI app + Python library)
- [ ] Write README for `examples/` directory

## Phase 2: Security & Advanced Features

### Encryption (OS Keychain Integration)

- [ ] Windows: Integrate Windows Credential Manager API
  - [ ] Store `secure` type variables in Credential Manager
  - [ ] Update JSON to reference keychain entry: `"value": "keychain:hedgebuddy_api_key"`
- [ ] macOS: Integrate macOS Keychain API
  - [ ] Store `secure` type variables in Keychain
  - [ ] Match Windows behavior with keychain references
- [ ] Update Python library to read from OS keychain
  - [ ] Detect `keychain:` prefix in JSON values
  - [ ] Query Windows Credential Manager / macOS Keychain
  - [ ] Return decrypted value to calling script

### Optional HTTP API

- [ ] Design lightweight REST API (`/vars/<VAR_NAME>`)
- [ ] Implement localhost-only HTTP server in Go app
- [ ] Add toggle in GUI to enable/disable API
- [ ] Update Python library with optional HTTP fallback

### Auto-Injection Feature

- [ ] Add optional `os.environ` override on module import
- [ ] Make it configurable (opt-in via environment flag or config)
- [ ] Test compatibility with existing Python scripts

## Documentation

- [ ] Write user guide for GUI app (screenshots + walkthrough)
- [ ] Write developer guide for Python library API
- [ ] Document variable types and when to use each
- [ ] Create troubleshooting section (common errors)
- [ ] Write PyPI package description and README

## Release Preparation

- [ ] Set up CI/CD for Python library (PyPI publishing)
- [ ] Set up CI/CD for Go app builds (Windows + macOS binaries)
- [ ] Create GitHub releases with downloadable executables
- [ ] Version tagging strategy (semantic versioning)
- [ ] License file and contributor guidelines

---

**Legend:**

- [ ] Not started
- [x] Completed
- [~] In progress (add `~` when working on a task)
