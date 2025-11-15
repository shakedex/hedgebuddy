# Contributing

Thank you for your interest in contributing to HedgeBuddy!

---

## Project Overview

HedgeBuddy is a **dual-component system** for cross-platform environment variable management:

1. **Python Library** (`python-lib/`) - PyPI package for reading variables
2. **Go GUI App** (`hedgebuddy-wails/`) - Desktop app for managing variables

Both components are developed in the same monorepo: [`shakedex/hedgebuddy`](https://github.com/shakedex/hedgebuddy)

---

## Ways to Contribute

### 🐛 Report Bugs

Found a bug? [Open an issue](https://github.com/shakedex/hedgebuddy/issues/new) with:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, Python version, etc.)

### 💡 Suggest Features

Have an idea? [Start a discussion](https://github.com/shakedex/hedgebuddy/discussions) or [open an issue](https://github.com/shakedex/hedgebuddy/issues/new) describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternative solutions you considered

### 📖 Improve Documentation

Documentation improvements are always welcome:

- Fix typos or unclear explanations
- Add examples or tutorials
- Improve API documentation
- Translate documentation (future)

### 🔧 Submit Code

See the development setup sections below for each component.

---

## Development Setup

### Python Library (`python-lib/`)

**Prerequisites:**

- Python 3.13+
- [uv](https://github.com/astral-sh/uv) (modern Python package manager)

**Setup:**

```bash
# Clone the repository
git clone https://github.com/shakedex/hedgebuddy.git
cd hedgebuddy/python-lib

# Install uv if you don't have it
pip install uv

# Install in editable mode
uv pip install -e .

# Install development dependencies
uv pip install pytest pytest-cov

# Run tests
pytest

# Run tests with coverage
pytest --cov=hedgebuddy --cov-report=html
```

**Project Structure:**

```
python-lib/
├── hedgebuddy/          # Core library code
│   ├── __init__.py
│   ├── core.py          # Main functions (var, exists, etc.)
│   └── exceptions.py    # Custom exceptions
├── tests/               # Unit tests
│   └── test_hedgebuddy.py
├── examples/            # Example scripts
├── pyproject.toml       # Package metadata
└── README.md
```

**Before submitting:**

- ✅ Add tests for new functionality
- ✅ Ensure all tests pass (`pytest`)
- ✅ Maintain 90%+ test coverage
- ✅ Follow existing code style
- ✅ Update docstrings

---

### Go GUI App (`hedgebuddy-wails/`)

**Prerequisites:**

- [Go 1.25+](https://go.dev/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

**Install Wails:**

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

**Setup:**

```bash
cd hedgebuddy/hedgebuddy-wails

# Install frontend dependencies
cd frontend
npm install
cd ..

# Run in development mode (with hot-reload)
wails dev

# Build for production
wails build
```

**Project Structure:**

```
hedgebuddy-wails/
├── frontend/            # Svelte + TypeScript UI
│   ├── src/
│   │   ├── App.svelte   # Main app component
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Main views
│   │   └── styles/      # Global styles
│   └── package.json
├── internal/            # Go backend
│   ├── storage/         # JSON storage layer
│   └── validator/       # Variable validation
├── app.go               # Main app logic
├── main.go              # Entry point
└── wails.json           # Wails configuration
```

**Development Workflow:**

1. Run `wails dev` for hot-reload development
2. Frontend: Edit Svelte files in `frontend/src/`
3. Backend: Edit Go files in `app.go` or `internal/`
4. Test on both Windows and macOS (if possible)

**Before submitting:**

- ✅ Test on Windows (primary platform)
- ✅ Test on macOS if possible
- ✅ Follow Go best practices
- ✅ Follow Svelte/TypeScript conventions
- ✅ Test variable validation thoroughly

---

## Code Style

### Python

- Follow [PEP 8](https://pep8.org/)
- Use type hints
- Write docstrings for public functions
- Keep functions focused and small

**Example:**

```python
def var(name: str, default: Union[str, None, object] = _NO_DEFAULT) -> Optional[str]:
    """Get the value of a HedgeBuddy variable.

    Args:
        name: The variable name to retrieve
        default: Optional fallback value if variable doesn't exist

    Returns:
        str: The variable value or default

    Raises:
        VariableNotFoundError: Variable doesn't exist (only when no default)
    """
    # Implementation...
```

### Go

- Follow standard Go conventions (`gofmt`, `golint`)
- Use meaningful variable names
- Write comments for exported functions
- Keep error handling explicit

### TypeScript/Svelte

- Use TypeScript for type safety
- Follow Svelte component conventions
- Keep components small and focused
- Use Tailwind CSS for styling

---

## Testing

### Python Tests

```bash
cd python-lib

# Run all tests
pytest

# Run specific test file
pytest tests/test_hedgebuddy.py

# Run with coverage
pytest --cov=hedgebuddy --cov-report=html

# View coverage report
open htmlcov/index.html  # macOS
start htmlcov/index.html # Windows
```

**Writing Tests:**

```python
import pytest
import hedgebuddy

def test_var_with_default():
    """Test var() with default value."""
    result = hedgebuddy.var("NONEXISTENT", "default")
    assert result == "default"

def test_var_without_default_raises():
    """Test var() without default raises error."""
    with pytest.raises(hedgebuddy.VariableNotFoundError) as exc:
        hedgebuddy.var("NONEXISTENT")
    assert exc.value.variable_name == "NONEXISTENT"
```

### Manual Testing

For GUI changes, manually test:

1. ✅ Add variable (all types: String, Path, URL, Secure)
2. ✅ Edit variable
3. ✅ Delete variable
4. ✅ Import variables from JSON
5. ✅ Export variables to JSON
6. ✅ Path validation (existing and non-existing paths)
7. ✅ URL validation (valid and invalid URLs)
8. ✅ Python integration (verify scripts can read variables)

---

## Pull Request Process

1. **Fork the repository**
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Test thoroughly**
5. **Commit with clear messages**:
   ```bash
   git commit -m "Add feature: describe what you added"
   ```
6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request** with:
   - Clear description of changes
   - Link to related issues
   - Screenshots (for UI changes)

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Tests added/updated and passing
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly documented)
- [ ] Tested on target platforms (Windows/macOS)

---

## Development Roadmap

See current priorities and planned features:

- [TASKS.md](https://github.com/shakedex/hedgebuddy/blob/master/TASKS.md) - Detailed task list
- [Issues](https://github.com/shakedex/hedgebuddy/issues) - Current bugs and feature requests
- [Discussions](https://github.com/shakedex/hedgebuddy/discussions) - Ideas and questions

**Phase 1 (Current):**

- ✅ Python library core functionality
- ✅ Wails GUI with CRUD operations
- ✅ Variable validation (Path, URL)
- ✅ Import/Export
- 🔨 Cross-platform testing and refinement

**Phase 2 (Planned):**

- 🔮 Encryption for `Secure` type (OS keychain integration)
- 🔮 Optional HTTP API (localhost endpoint)
- 🔮 Auto-injection into `os.environ`
- 🔮 Multi-profile support

**Phase 3 (Future):**

- 🔮 Linux support
- 🔮 Environment-based configuration (dev/staging/prod)
- 🔮 CLI tool for variable management
- 🔮 Team collaboration features

---

## Getting Help

Need help contributing?

- **Discussions**: [Ask questions](https://github.com/shakedex/hedgebuddy/discussions)
- **Issues**: [Report problems](https://github.com/shakedex/hedgebuddy/issues)
- **Discord/Chat**: Coming soon

---

## Code of Conduct

Be respectful, inclusive, and constructive. We're all here to make HedgeBuddy better!

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT License).

---

## Recognition

Contributors will be recognized in:

- **README.md** - Contributors section
- **Release Notes** - Credited in relevant releases
- **GitHub** - Contributor badge on your profile

Thank you for making HedgeBuddy better! 🎉
