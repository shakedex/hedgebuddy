# Releasing the Python package

The `hedgebuddy` package on PyPI is published by the **Publish Python package** workflow. It runs only when started by hand.

## One-time setup

1. On pypi.org, open the `hedgebuddy` project, then Publishing, and add a GitHub trusted publisher: owner `shakedex`, repository `hedgebuddy`, workflow `publish-python.yml`, environment `pypi`.
2. In the GitHub repository settings, create an environment named `pypi`. Adding yourself as a required reviewer makes every publish wait for your approval.
3. In the same environment, under Deployment branches and tags, choose Selected branches and tags and allow only `main`. A run started from any other branch then cannot publish.

## Each release

1. Make sure `VERSION`, `python/pyproject.toml` and `python/hedgebuddy/__init__.py` agree (`python scripts/sync_version.py --check`).
2. Merge to `main` with CI green.
3. In GitHub, open Actions, then Publish Python package, then Run workflow on `main`.
4. The build job runs the tests, builds the wheel and sdist, and checks them. The publish job uploads them to PyPI.

A version can be uploaded to PyPI only once. To fix a bad release, publish the next version.
