# Python Library TODO

## Phase 1 - Core Functionality

### ✅ Completed

- [x] Project structure setup (pyproject.toml, package metadata)
- [x] Python 3.13+ compatibility
- [x] `uv` package manager integration

### 🔲 To Do

#### 1. Core Variable Reading Function

- [ ] Implement `hedgebuddy.var("VAR_NAME")` function
  - Read from platform-specific vars.json location
  - Windows: `%APPDATA%\HedgeBuddy\vars.json`
  - macOS: `~/Library/Application Support/HedgeBuddy/vars.json`
  - Return variable value as string
  - Raise clear exception if variable not found
  - Raise clear exception if vars.json doesn't exist

#### 2. Error Handling

- [ ] Create custom exceptions:
  - `VariableNotFoundError` - Variable doesn't exist in vars.json
  - `StorageNotFoundError` - vars.json file doesn't exist
  - `StorageCorruptedError` - vars.json is invalid/malformed JSON

#### 3. Optional Features

- [ ] `hedgebuddy.get(name, default=None)` - Return default instead of raising exception
- [ ] `hedgebuddy.all()` - Return all variables as dict
- [ ] `hedgebuddy.exists(name)` - Check if variable exists (returns bool)

#### 4. Environment Variable Override (Optional)

- [ ] `hedgebuddy.inject_env()` - Optionally override `os.environ` with HedgeBuddy variables
  - Useful for scripts that already use `os.environ["VAR"]`
  - Should be opt-in, not automatic on import
  - Decide merge strategy (HedgeBuddy overwrites? os.environ takes priority?)

#### 5. Testing

- [ ] Unit tests for `var()` function
- [ ] Unit tests for error cases (missing file, missing variable)
- [ ] Unit tests for platform-specific path resolution
- [ ] Mock vars.json for testing
- [ ] Test invalid JSON handling

#### 6. Documentation

- [ ] README.md with usage examples
- [ ] Installation instructions (`pip install hedgebuddy`)
- [ ] API reference documentation
- [ ] Migration guide from `os.environ`

#### 7. Distribution

- [ ] Build package (`uv build`)
- [ ] Test installation in clean environment
- [ ] Publish to PyPI (when ready)
- [ ] Version tagging and changelog

## Phase 2 - Advanced Features (Future)

- [ ] Caching mechanism (avoid reading JSON on every call)
- [ ] Watch for file changes and auto-reload
- [ ] Support for `.env` file as fallback
- [ ] Type hints and return type annotations
- [ ] Async version for async applications
- [ ] CLI tool for testing variable access (`python -m hedgebuddy get VAR_NAME`)

## Notes

- Keep library lightweight (stdlib only for Phase 1)
- Focus on simplicity - single import, single function call
- Clear error messages for debugging
- Cross-platform compatibility is critical
