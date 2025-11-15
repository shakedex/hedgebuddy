# Publishing to PyPI

This guide explains how to publish new versions of the HedgeBuddy Python library to PyPI.

## Prerequisites

✅ PyPI account created
✅ API token created at https://pypi.org/manage/account/token/
✅ Token added to GitHub secrets as `PYPI_TOKEN`

## Method 1: Automatic (via GitHub Release) - RECOMMENDED

This method automatically publishes when you create a GitHub release:

1. **Update version number** in `python-lib/pyproject.toml` and `python-lib/hedgebuddy/__init__.py`
   ```toml
   version = "0.1.0"  # Update this
   ```
   ```python
   __version__ = "0.1.0"  # And this
   ```

2. **Commit and push changes**
   ```bash
   git add python-lib/pyproject.toml python-lib/hedgebuddy/__init__.py
   git commit -m "Bump version to 0.1.0"
   git push
   ```

3. **Create a GitHub Release**
   - Go to https://github.com/shakedex/hedgebuddy/releases/new
   - Tag: `v0.1.0` (must match package version with 'v' prefix)
   - Title: `v0.1.0 - Initial Release`
   - Description: Release notes
   - Click "Publish release"

4. **Workflow automatically**:
   - ✅ Verifies version matches
   - ✅ Runs tests
   - ✅ Builds package
   - ✅ Publishes to PyPI

## Method 2: Manual Trigger

For testing or special cases:

1. Go to: https://github.com/shakedex/hedgebuddy/actions/workflows/publish-pypi.yml

2. Click "Run workflow"

3. Enter version number (e.g., `0.1.0`)

4. Click "Run workflow"

This will automatically update version numbers and publish.

## After Publishing

1. **Verify on PyPI**: https://pypi.org/project/hedgebuddy/

2. **Test installation**:
   ```bash
   pip install --user hedgebuddy
   python -c "import hedgebuddy; print(hedgebuddy.__version__)"
   ```

3. **Update documentation** if needed

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** version (1.0.0): Incompatible API changes
- **MINOR** version (0.1.0): Add functionality (backwards compatible)
- **PATCH** version (0.1.1): Bug fixes (backwards compatible)

Examples:
- `0.1.0` - Initial release
- `0.1.1` - Bug fix
- `0.2.0` - New feature (exists() function, new exception types)
- `1.0.0` - First stable release

## Troubleshooting

### "Version already exists"
- PyPI doesn't allow overwriting versions
- Increment version number and republish

### "Invalid token"
- Verify `PYPI_TOKEN` secret is set correctly
- Regenerate token at https://pypi.org/manage/account/token/

### "Tests failed"
- Fix failing tests before publishing
- Run `pytest tests/ -v` locally to debug

### "Version mismatch"
- Ensure `pyproject.toml` version matches Git tag (without 'v' prefix)
- Tag: `v0.1.0` → Package: `0.1.0`

## Publishing Checklist

Before creating a release:

- [ ] All tests pass: `pytest tests/ -v`
- [ ] Version updated in `pyproject.toml`
- [ ] Version updated in `hedgebuddy/__init__.py`
- [ ] README.md is up to date
- [ ] Examples work correctly
- [ ] Changelog/release notes prepared
- [ ] Committed and pushed to main branch

Then create the GitHub release and the workflow handles the rest! 🚀
