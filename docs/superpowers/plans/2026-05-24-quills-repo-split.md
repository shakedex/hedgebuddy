# Quills Repo Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `service/` and `quills/` from `shakedex/hedgebuddy` into the existing empty `shakedex/quills` repo with full git history, flatten `service/` to root, rewrite all module paths and the catalog URL, drop the suite installer, and remove the extracted code from `shakedex/hedgebuddy` in a single cleanup PR.

**Architecture:** This is a one-time migration, not feature work — TDD doesn't apply. Each task is a procedural change with a verification command and expected output. Work happens in three locations: the source repo at `E:\Coding\hedgebuddy` (cleanup PR), a fresh clone at `E:\Coding\quills-split-tmp` (filter-repo workspace), and the final new repo at `E:\Coding\quills`. The split is safe at any phase boundary — abandoned partial work in either temp dir can be deleted without consequence until Phase 4 pushes to GitHub.

**Tech Stack:** `git filter-repo` (via `pip install git-filter-repo`), Go 1.25, Bun + Vite, NSIS/pkgbuild, GitHub Actions, `gh` CLI.

**Spec:** [docs/superpowers/specs/2026-05-24-quills-repo-split-design.md](../specs/2026-05-24-quills-repo-split-design.md)

---

## Phase 0 — Prerequisites

### Task 0.1: Install git-filter-repo

**Files:** none

Note: On Windows, `pip install git-filter-repo` installs `git-filter-repo.exe` into a per-user `Scripts/` directory that may not be on PATH, so the canonical `git filter-repo` git-subcommand invocation can fail. We invoke as a Python module (`python -m git_filter_repo`) throughout this plan — that works regardless of PATH state.

- [ ] **Step 1: Check whether the Python module is already importable**

Run: `python -c "import git_filter_repo; print(git_filter_repo.__file__)"`
Expected: prints the path (e.g. `…/site-packages/git_filter_repo.py`) — meaning it's already installed; skip Step 2.
If it errors with `ModuleNotFoundError: No module named 'git_filter_repo'`, proceed to Step 2.

- [ ] **Step 2: Install via pip**

Run: `pip install git-filter-repo`
Expected: `Successfully installed git-filter-repo-X.Y.Z` (any 2.x version is fine).

- [ ] **Step 3: Confirm the module is importable and the help works**

Run: `python -m git_filter_repo --help 2>&1 | head -3`
Expected: prints filter-repo's help banner (starts with `usage: git_filter_repo` or similar). Any non-error output here proves the module loads and the entry point runs.

### Task 0.2: Confirm new GitHub repo is empty

**Files:** none

- [ ] **Step 1: List branches on shakedex/quills**

Run: `gh api repos/shakedex/quills/branches --jq '.[].name'`
Expected: empty output (no branches) OR a single `main` branch with only an auto-generated initial commit.

- [ ] **Step 2: If a non-empty `main` exists, confirm it's safe to overwrite**

Run: `gh api repos/shakedex/quills/commits --jq '.[].commit.message' 2>&1 | head -5`
Expected: empty OR just `Initial commit`. If the repo has real commits, STOP and ask the user before proceeding — this plan will force-push and overwrite.

### Task 0.3: Commit in-flight Quills WIP to hedgebuddy master

The working tree has substantial uncommitted work under `service/` and `quills/`. To carry these changes into the new repo, we commit them to master before running `filter-repo` (which only operates on committed history). Non-Quills WIP (e.g. `python-lib/uv.lock`) is left alone.

**Files:** working tree of `E:\Coding\hedgebuddy`

- [ ] **Step 1: Show current dirty state**

Run: `git -C E:/Coding/hedgebuddy status --short`
Expected: a list of `M` and `??` files. The Quills-related ones (under `service/` and `quills/`) will be staged in Step 2.

- [ ] **Step 2: Stage only Quills-related WIP**

Run from `E:/Coding/hedgebuddy`:
```bash
git add service/ quills/
```
Expected: no output.

- [ ] **Step 3: Verify staging is correct (no python-lib, no app, no updater)**

Run from `E:/Coding/hedgebuddy`: `git diff --cached --name-only | head -30`
Expected: every line begins with `service/` or `quills/`. If anything else is staged, `git restore --staged <path>` it before committing.

- [ ] **Step 4: Commit**

Run from `E:/Coding/hedgebuddy`:
```bash
git commit -m "$(cat <<'EOF'
chore: snapshot in-flight Quills work before extraction

Pre-extraction snapshot so git filter-repo carries this in-progress
work to the new shakedex/quills repo. The hedgebuddy cleanup PR
later in this migration removes everything under service/ and quills/
again, so this commit's content does not persist in hedgebuddy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: commit succeeds.

- [ ] **Step 5: Verify only non-Quills WIP remains**

Run from `E:/Coding/hedgebuddy`: `git status --short`
Expected: no `service/` or `quills/` entries remain. Anything else (e.g. `python-lib/uv.lock`) stays as the user's untouched WIP.

---

## Phase 1 — Extract history into new local repo

### Task 1.1: Clean clone for filter-repo

**Files:** new directory `E:\Coding\quills-split-tmp`

- [ ] **Step 1: Ensure no leftover from a prior attempt**

Run (PowerShell): `if (Test-Path E:\Coding\quills-split-tmp) { Remove-Item -Recurse -Force E:\Coding\quills-split-tmp }`
Expected: no output.

- [ ] **Step 2: Fresh clone (filter-repo refuses to run on a non-fresh clone by default)**

Run: `git clone https://github.com/shakedex/hedgebuddy.git E:/Coding/quills-split-tmp`
Expected: `Cloning into 'E:/Coding/quills-split-tmp'...` then `done.`

- [ ] **Step 3: Spot-check the clone**

Run: `ls E:/Coding/quills-split-tmp/service E:/Coding/quills-split-tmp/quills`
Expected: contents of both directories listed.

### Task 1.2: Run filter-repo with keep + rename rules

**Files:** none directly (mutates `E:\Coding\quills-split-tmp`'s git history)

- [ ] **Step 1: Run the filter**

Run from `E:/Coding/quills-split-tmp`:

```bash
cd E:/Coding/quills-split-tmp && python -m git_filter_repo \
  --path service/ \
  --path quills/ \
  --path .github/workflows/release-quills.yml \
  --path scripts/sync_quills_version.py \
  --path-rename service/: \
  --path-rename .github/workflows/release-quills.yml:.github/workflows/release.yml \
  --path-rename scripts/sync_quills_version.py:scripts/sync_version.py
```

Note: `python -m git_filter_repo` (not `git -C … filter-repo`) — the module form is robust against PATH/Scripts-dir quirks on Windows. filter-repo requires the cwd to be the target repo, hence the `cd` rather than `git -C`.

Expected: `Parsed N commits` … `New history written in X seconds; now repacking/cleaning...` … `Completed successfully.`
Note: `--path service/:` is a "rename to empty string", which flattens `service/foo` → `foo` at the repo root. Top-level `quills/` is kept under `quills/` (no rename). The `--path` filter keeps anything matching any of the listed paths; everything else is dropped.

- [ ] **Step 2: Verify resulting tree**

Run: `ls E:/Coding/quills-split-tmp`
Expected: `main.go`, `go.mod`, `go.sum`, `tygo.yaml`, `VERSION`, `CHANGELOG.md`, `internal/`, `web/`, `installer/`, `bin/` (if present), `quills/`, `.github/`, `scripts/`. NO `service/`, NO `app/`, NO `python-lib/`, NO `updater/`, NO top-level `README.md` (it was hedgebuddy's), NO top-level `Makefile`.

- [ ] **Step 3: Verify the renamed workflow file is in the right place**

Run: `ls E:/Coding/quills-split-tmp/.github/workflows/`
Expected: exactly `release.yml` (renamed from `release-quills.yml`).

- [ ] **Step 4: Verify the renamed script**

Run: `ls E:/Coding/quills-split-tmp/scripts/`
Expected: only `sync_version.py` (renamed from `sync_quills_version.py`). No `installer/` directory, because the suite installer scripts were not in the keep-list.

- [ ] **Step 5: Verify history was preserved (not just the head snapshot)**

Run: `git -C E:/Coding/quills-split-tmp log --oneline -- internal/quills | head -10`
Expected: multiple commits listed (these are the historical commits that touched `service/internal/quills/`, now showing under the flattened path).

### Task 1.3: Relocate to final working directory

**Files:** moves `E:\Coding\quills-split-tmp` → `E:\Coding\quills`

- [ ] **Step 1: Ensure target is clear**

Run (PowerShell): `if (Test-Path E:\Coding\quills) { Write-Host 'EXISTS — investigate before proceeding'; exit 1 }`
Expected: no output. If `E:\Coding\quills` already exists, stop and ask the user whether to delete or pick a different name.

- [ ] **Step 2: Rename**

Run (PowerShell): `Rename-Item E:\Coding\quills-split-tmp E:\Coding\quills`
Expected: no output.

- [ ] **Step 3: Sanity check after rename**

Run: `git -C E:/Coding/quills log --oneline -5`
Expected: a list of the most recent retained commits.

---

## Phase 2 — Standalonify the new repo

All steps in this phase happen in `E:\Coding\quills`. Each task lists exact files to touch.

### Task 2.1: Update Go module path

**Files:**
- Modify: `E:\Coding\quills\go.mod` (line 1)

- [ ] **Step 1: Show current module line**

Run: `head -1 E:/Coding/quills/go.mod`
Expected: `module github.com/shakedex/hedgebuddy/service`

- [ ] **Step 2: Rewrite module line**

In `E:\Coding\quills\go.mod`, change line 1 from:

```
module github.com/shakedex/hedgebuddy/service
```

to:

```
module github.com/shakedex/quills
```

- [ ] **Step 3: Verify**

Run: `head -1 E:/Coding/quills/go.mod`
Expected: `module github.com/shakedex/quills`

### Task 2.2: Bulk rewrite Go import paths

**Files:** every `.go` file containing `github.com/shakedex/hedgebuddy/service/internal` (10 files, 34 occurrences identified during planning).

- [ ] **Step 1: Show before-state count**

Run: `grep -rc 'github.com/shakedex/hedgebuddy/service' E:/Coding/quills --include='*.go' | grep -v ':0$'`
Expected: a list of `.go` files with non-zero counts (~9 files).

- [ ] **Step 2: Bulk rewrite using PowerShell (preserves UTF-8 encoding)**

Run (PowerShell, from `E:\Coding\quills`):

```powershell
Get-ChildItem -Recurse -Filter *.go | ForEach-Object {
  $content = Get-Content $_.FullName -Raw
  $new = $content -replace [regex]::Escape('github.com/shakedex/hedgebuddy/service/internal'), 'github.com/shakedex/quills/internal'
  if ($new -ne $content) {
    Set-Content -Path $_.FullName -Value $new -NoNewline -Encoding utf8
    Write-Host "Updated: $($_.FullName)"
  }
}
```

Expected: prints each updated `.go` file path (should match Step 1's list).

- [ ] **Step 3: Verify no stragglers**

Run: `grep -r 'github.com/shakedex/hedgebuddy/service' E:/Coding/quills --include='*.go'`
Expected: empty output.

- [ ] **Step 4: Verify the new path is everywhere expected**

Run: `grep -rc 'github.com/shakedex/quills/internal' E:/Coding/quills --include='*.go' | grep -v ':0$'`
Expected: same file list as Step 1, with matching counts.

### Task 2.3: Update tygo.yaml package paths

**Files:**
- Modify: `E:\Coding\quills\tygo.yaml`

- [ ] **Step 1: Show before-state**

Run: `cat E:/Coding/quills/tygo.yaml`
Expected: 4 lines reference `github.com/shakedex/hedgebuddy/service/internal/...`.

- [ ] **Step 2: Rewrite**

Replace all 4 occurrences of `github.com/shakedex/hedgebuddy/service/internal` with `github.com/shakedex/quills/internal` in `tygo.yaml`. Final file:

```yaml
packages:
  - path: "github.com/shakedex/quills/internal/storage"
    output_path: "web/src/lib/generated/storage.ts"
    type_mappings:
      time.Time: "string"
      json.RawMessage: "Record<string, unknown>"

  - path: "github.com/shakedex/quills/internal/schema"
    output_path: "web/src/lib/generated/schema.ts"

  - path: "github.com/shakedex/quills/internal/actions"
    output_path: "web/src/lib/generated/actions.ts"
    include_files:
      - "meta.go"

  - path: "github.com/shakedex/quills/internal/quills"
    output_path: "web/src/lib/generated/quills.ts"
    include_files:
      - "loader.go"
```

- [ ] **Step 3: Verify**

Run: `grep 'github.com/shakedex/hedgebuddy' E:/Coding/quills/tygo.yaml`
Expected: empty.

### Task 2.4: Update DefaultRepoURL in internal/quills/remote.go

**Files:**
- Modify: `E:\Coding\quills\internal\quills\remote.go` (line 32)

- [ ] **Step 1: Show current line**

Run: `grep -n DefaultRepoURL E:/Coding/quills/internal/quills/remote.go`
Expected: `32:const DefaultRepoURL = "https://raw.githubusercontent.com/shakedex/hedgebuddy/master/quills"`

- [ ] **Step 2: Rewrite**

In `internal/quills/remote.go` line 32, replace:

```go
const DefaultRepoURL = "https://raw.githubusercontent.com/shakedex/hedgebuddy/master/quills"
```

with:

```go
const DefaultRepoURL = "https://raw.githubusercontent.com/shakedex/quills/main/quills"
```

- [ ] **Step 3: Verify**

Run: `grep DefaultRepoURL E:/Coding/quills/internal/quills/remote.go`
Expected: `const DefaultRepoURL = "https://raw.githubusercontent.com/shakedex/quills/main/quills"`

### Task 2.5: Retarget scripts/sync_version.py

**Files:**
- Modify: `E:\Coding\quills\scripts\sync_version.py` (TARGETS list + VERSION_FILE path)

- [ ] **Step 1: Show current TARGETS and VERSION_FILE**

Run: `grep -n 'VERSION_FILE\|TARGETS\|service/' E:/Coding/quills/scripts/sync_version.py | head -15`
Expected: lines showing `VERSION_FILE = ROOT / "service" / "VERSION"` and TARGETS entries with `service/...` paths.

- [ ] **Step 2: Apply edits**

Replace this block in `scripts/sync_version.py`:

```python
VERSION_FILE = ROOT / "service" / "VERSION"

# Each target: (relative path, regex pattern to find, replacement template)
TARGETS = [
    (
        "service/internal/version/version.go",
        r'(Version\s*=\s*")[^"]*(")',
        r'\g<1>{version}\2',
    ),
    (
        "service/web/package.json",
        r'("version"\s*:\s*")[^"]*(")',
        r'\g<1>{version}\2',
    ),
]
```

with:

```python
VERSION_FILE = ROOT / "VERSION"

# Each target: (relative path, regex pattern to find, replacement template)
TARGETS = [
    (
        "internal/version/version.go",
        r'(Version\s*=\s*")[^"]*(")',
        r'\g<1>{version}\2',
    ),
    (
        "web/package.json",
        r'("version"\s*:\s*")[^"]*(")',
        r'\g<1>{version}\2',
    ),
]
```

- [ ] **Step 3: Optionally update the docstring and `--help` messages**

In the same file, update the module docstring to remove the "from service/VERSION" phrasing:

Replace:
```python
"""Sync the Quills service version from service/VERSION to all service files.

Usage:
    python scripts/sync_quills_version.py              # Print current version
    python scripts/sync_quills_version.py --set 0.9.0  # Set version everywhere
    python scripts/sync_quills_version.py --bump minor  # Bump and propagate
    python scripts/sync_quills_version.py --check       # Verify all files match (CI)
"""
```

with:

```python
"""Sync the Quills version from VERSION to all version-bearing files.

Usage:
    python scripts/sync_version.py              # Print current version
    python scripts/sync_version.py --set 0.9.0  # Set version everywhere
    python scripts/sync_version.py --bump minor  # Bump and propagate
    python scripts/sync_version.py --check       # Verify all files match (CI)
"""
```

- [ ] **Step 4: Verify**

Run: `python E:/Coding/quills/scripts/sync_version.py --check`
Expected: `Checking Quills version: 0.9.2` then `OK    internal/version/version.go = 0.9.2` and `OK    web/package.json = 0.9.2`, ending with `All Quills version files match.` (exit code 0).

### Task 2.6: Rewrite .github/workflows/release.yml

**Files:**
- Modify: `E:\Coding\quills\.github\workflows\release.yml`

- [ ] **Step 1: Show the tag trigger and working-directory references**

Run: `grep -n 'quills-v\|working-directory\|cache-dependency-path\|refs/tags' E:/Coding/quills/.github/workflows/release.yml`
Expected: matches for `quills-v*.*.*` (trigger), `working-directory: service` (multiple), `cache-dependency-path: service/go.mod` (multiple), `${GITHUB_REF#refs/tags/quills-v}` (Get version step).

- [ ] **Step 2: Apply these edits**

In `.github/workflows/release.yml`:

**(a) Tag trigger** — replace:
```yaml
  push:
    tags:
      - "quills-v*.*.*"
```
with:
```yaml
  push:
    tags:
      - "v*.*.*"
```

**(b) Manual-dispatch tag creation step** — replace:
```yaml
          git tag -a "quills-v${{ github.event.inputs.version }}" \
            -m "Quills v${{ github.event.inputs.version }}"
          git push origin "quills-v${{ github.event.inputs.version }}"
```
with:
```yaml
          git tag -a "v${{ github.event.inputs.version }}" \
            -m "Quills v${{ github.event.inputs.version }}"
          git push origin "v${{ github.event.inputs.version }}"
```

**(c) Verify version sync step** — replace:
```yaml
      - name: Verify version sync
        run: python3 scripts/sync_quills_version.py --check
```
with:
```yaml
      - name: Verify version sync
        run: python3 scripts/sync_version.py --check
```

**(d) Web build install/build steps** — replace:
```yaml
      - name: Install dependencies
        working-directory: service/web
        run: bun install --frozen-lockfile

      - name: Build web UI
        working-directory: service/web
        run: bun run build
```
with:
```yaml
      - name: Install dependencies
        working-directory: web
        run: bun install --frozen-lockfile

      - name: Build web UI
        working-directory: web
        run: bun run build
```

**(e) Web dist upload/download paths** — replace every `service/web/dist` with `web/dist`. There are 3 references (upload artifact path, two download artifact paths).

**(f) Go setup cache paths** — replace every `cache-dependency-path: service/go.mod` with `cache-dependency-path: go.mod`. There are 2 references (Windows + macOS jobs).

**(g) Go build working-directory and binary paths** — replace:
```yaml
      - name: Build Quills binary
        working-directory: service
        env:
          CGO_ENABLED: "1"
        run: |
          go build -ldflags "-H windowsgui" -o bin\quills.exe .
```
with:
```yaml
      - name: Build Quills binary
        env:
          CGO_ENABLED: "1"
        run: |
          go build -ldflags "-H windowsgui" -o bin\quills.exe .
```

Apply the same removal of `working-directory: service` to the two macOS go-build steps and the lipo step. Update the Windows binary upload path `service/bin/quills.exe` → `bin/quills.exe`, and macOS paths `service/bin/quills*` → `bin/quills*`.

**(h) Tag parsing in "Get version" steps** — replace both occurrences of:
```bash
TAG="${GITHUB_REF#refs/tags/quills-v}"
echo "version=${TAG}" >> "$GITHUB_OUTPUT"
```
with:
```bash
TAG="${GITHUB_REF#refs/tags/v}"
echo "version=${TAG}" >> "$GITHUB_OUTPUT"
```

Same swap for the release-creation step:
```bash
echo "version=${GITHUB_REF#refs/tags/quills-v}" >> "$GITHUB_OUTPUT"
echo "tag=${GITHUB_REF#refs/tags/}" >> "$GITHUB_OUTPUT"
```
The second line is already correct; only the first needs `quills-v` → `v`.

**(i) Release-creation `tag_name`** — replace:
```yaml
          tag_name: ${{ steps.version.outputs.tag }}
          name: Quills v${{ steps.version.outputs.version }}
```
The tag_name is already correct (uses `steps.version.outputs.tag` which now resolves to `v0.9.2`). Name stays the same.

**(j) Release body — remove the "HedgeBuddy Suite installer" recommendation**, since the suite is being dropped. Replace:
```
            > **Looking for an easy install?** Use the [HedgeBuddy Suite installer](../../releases) which bundles HedgeBuddy and Quills together.

            ### Standalone Binaries
```
with:
```
            ### Standalone Binaries
```

- [ ] **Step 3: Lint the YAML (sanity check)**

Run: `python -c "import yaml; yaml.safe_load(open('E:/Coding/quills/.github/workflows/release.yml'))"`
Expected: no output (i.e. the YAML parses).

- [ ] **Step 4: Confirm no stragglers**

Run: `grep -n 'service/\|quills-v\|sync_quills_version' E:/Coding/quills/.github/workflows/release.yml`
Expected: empty output.

### Task 2.7: Write new README.md

**Files:**
- Create: `E:\Coding\quills\README.md`

- [ ] **Step 1: Write file**

Create `E:\Coding\quills\README.md` with this exact content:

```markdown
# Quills

**Quills is the automation engine for the [Hedge](https://hedge.co) ecosystem.** It runs in the background, listens for events from Hedge apps (OffShoot, FoolCat, EditReady), and executes user-defined workflows built from a library of reusable actions and community "quills".

> Built originally for the [HedgeBuddy](https://github.com/shakedex/hedgebuddy) suite; extracted here as a standalone product.

## Install

Download the latest binary for your platform from [Releases](https://github.com/shakedex/quills/releases):

- **Windows**: `quills.exe`
- **macOS (Universal)**: `quills`

Run the binary directly — it boots a local HTTP server, opens a dashboard in your browser, and lives in the system tray. Data lives under `%APPDATA%\Quills` (Windows) or `~/Library/Application Support/Quills` (macOS).

## What's inside

| Path | Purpose |
|---|---|
| `main.go`, `internal/` | Go service: event ingest, workflow engine, action registry, sqlite event log, HTTP API, tray UI |
| `web/` | React + Vite dashboard, embedded into the Go binary at build time |
| `installer/` | NSIS + pkgbuild scripts for platform installers |
| `quills/` | Community quill catalog (this directory is what the running app fetches from raw.githubusercontent.com to populate the in-app marketplace) |
| `scripts/sync_version.py` | One-command version bump across `VERSION`, `internal/version/version.go`, `web/package.json` |
| `.github/workflows/release.yml` | CI: tag `v0.x.y` → builds Windows + macOS universal binaries → publishes a GitHub Release |

## Development

```bash
# Web UI (hot-reload)
cd web && bun install && bun run dev

# Go service (separate terminal, requires CGO + msys64 on Windows)
go run . -no-browser

# Full standalone build
cd web && bun run build && cd ..
go build -o bin/quills .
```

See the [HedgeBuddy integration doc](docs/hedgebuddy-integration.md) for how Quills surfaces HedgeBuddy variables at runtime when both products are installed.

## Releasing

```bash
python scripts/sync_version.py --bump patch   # or --set 0.10.0
git commit -am "chore: bump version to <new>"
git tag v<new> && git push origin v<new>
```

The `release.yml` workflow builds and publishes from the tag.

## License

MIT
```

- [ ] **Step 2: Verify**

Run: `head -3 E:/Coding/quills/README.md`
Expected: title line `# Quills` and the first paragraph.

### Task 2.8: Add .gitignore

**Files:**
- Create: `E:\Coding\quills\.gitignore`

- [ ] **Step 1: Write file**

Create `E:\Coding\quills\.gitignore` with this exact content:

```
# Go
bin/
*.exe
vendor/

# Web
node_modules
dist
dist-ssr
*.local
.env
.nitro
.tanstack
.wrangler
.output
.vinxi
__unconfig*

# Build artifacts
web/dist
build/

# OS / editor
.DS_Store
.vscode/
.idea/

# Local skill state
.agents/
skills-lock.json

# Sqlite / runtime
*.db
*.db-journal
```

- [ ] **Step 2: Verify git respects it**

Run from `E:/Coding/quills`: `git status --short`
Expected: no `bin/`, no `web/dist/`, no `node_modules/` listed (these may or may not exist depending on whether you've already built, but they should never appear in `git status`).

### Task 2.9: Add docs/hedgebuddy-integration.md

**Files:**
- Create: `E:\Coding\quills\docs\hedgebuddy-integration.md`

- [ ] **Step 1: Create directory and write file**

Run (PowerShell): `New-Item -ItemType Directory -Force E:\Coding\quills\docs | Out-Null`

Then create `E:\Coding\quills\docs\hedgebuddy-integration.md` with this exact content:

```markdown
# HedgeBuddy Integration

Quills optionally surfaces variables managed by [HedgeBuddy](https://github.com/shakedex/hedgebuddy) when both products are installed on the same machine. There is no code dependency in either direction — Quills reads HedgeBuddy's storage file by a hardcoded OS-conventional path. If HedgeBuddy is not installed, the integration silently degrades to "no variables available".

## File-format contract

Quills reads HedgeBuddy's active profile's `vars.json` from:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\HedgeBuddy\profiles\<active>\vars.json` |
| macOS | `~/Library/Application Support/HedgeBuddy/profiles/<active>/vars.json` |

The active profile name is read from `<base>\profiles.json` (key `active`, defaulting to `default`).

The `vars.json` schema Quills expects:

```json
{
  "variables": {
    "MY_VAR": {
      "value": "the-value",
      "type": "string|secure|secret",
      "description": "optional human label"
    }
  }
}
```

Implementation: `internal/hbvars/`. Public API: `Available()`, `ActiveProfile()`, `Load()`, `LoadValues()`.

## Impact of changes on the HedgeBuddy side

Any of the following changes to HedgeBuddy will break this integration:

- Renaming the storage directory.
- Renaming `vars.json` or `profiles.json`.
- Removing the `variables` wrapper key.
- Removing or renaming the `value`, `type`, or `description` fields on a Variable record.
- Encrypting `vars.json` such that it can't be read by an unrelated process.

Type values currently understood: `string` (default), `secure`/`secret` (treated identically — value masked when returned over the API).

## Decoupling

If you want to remove this integration entirely, delete `internal/hbvars/` and the `/api/hbvars` route in `internal/server/hedgebuddy.go`, then audit `internal/engine/` and `internal/actions/` for `HBVars` field references.
```

- [ ] **Step 2: Verify**

Run: `head -1 E:/Coding/quills/docs/hedgebuddy-integration.md`
Expected: `# HedgeBuddy Integration`.

---

## Phase 3 — Verify the build

### Task 3.1: Verify go build + go mod tidy

**Files:** none (verifying)

- [ ] **Step 1: go mod tidy**

Run from `E:/Coding/quills`: `go mod tidy`
Expected: no errors; may add/remove lines in `go.sum`. If it fails with "no Go files in …" investigate immediately — likely a leftover import path issue.

- [ ] **Step 2: go vet (catches stale references early)**

Run from `E:/Coding/quills`: `go vet ./...`
Expected: no output (exit 0). If it complains about missing packages, the import-rewrite missed a file — go back to Task 2.2 Step 3.

- [ ] **Step 3: Full build (CGO required — Windows users need msys64/ucrt64 on PATH)**

Run from `E:/Coding/quills` (PowerShell): `$env:PATH = 'C:\msys64\ucrt64\bin;' + $env:PATH; $env:CGO_ENABLED = '1'; go build -o bin/quills.exe .`
Expected: exits 0, produces `bin/quills.exe` (~30-60 MB).

- [ ] **Step 4: Confirm binary exists**

Run (PowerShell): `Get-Item E:/Coding/quills/bin/quills.exe | Select-Object Length`
Expected: file size > 10 MB.

### Task 3.2: Verify web build

**Files:** none

- [ ] **Step 1: bun install**

Run from `E:/Coding/quills/web`: `bun install --frozen-lockfile`
Expected: `Done in Xms`.

- [ ] **Step 2: bun run build**

Run from `E:/Coding/quills/web`: `bun run build`
Expected: Vite output ending with `✓ built in Xs`, producing `web/dist/index.html` and assets.

- [ ] **Step 3: Confirm dist exists**

Run: `ls E:/Coding/quills/web/dist/`
Expected: `index.html` and an `assets/` directory.

### Task 3.3: Smoke-test the binary

**Files:** none

- [ ] **Step 1: Rebuild Go now that web/dist exists (so the embed picks it up)**

Run from `E:/Coding/quills` (PowerShell): `$env:PATH = 'C:\msys64\ucrt64\bin;' + $env:PATH; $env:CGO_ENABLED = '1'; go build -o bin/quills.exe .`
Expected: rebuilds.

- [ ] **Step 2: Run headless on a non-default port and stop after 5s**

Run (PowerShell):
```powershell
$proc = Start-Process -FilePath E:/Coding/quills/bin/quills.exe -ArgumentList '-no-tray','-no-browser','-port','12399' -PassThru
Start-Sleep -Seconds 3
$resp = try { Invoke-WebRequest -UseBasicParsing -Uri http://localhost:12399/api/quills/repo -TimeoutSec 5 } catch { $_.Exception.Response }
$resp.StatusCode
Stop-Process -Id $proc.Id -Force
```
Expected: `200` (the catalog fetch succeeds against the NEW URL because the binary has the updated `DefaultRepoURL`, but the new repo's `quills/index.json` hasn't been pushed to GitHub yet — so this may also return 404 from the upstream fetch. If it returns 200, great. If it returns 500 with an upstream 404 message, that's also OK at this stage — proves the binary's local routing works. The real catalog smoke test happens in Task 4.4 after the push.)

- [ ] **Step 3: Confirm process cleaned up**

Run: `Get-Process -Name quills -ErrorAction SilentlyContinue`
Expected: nothing.

---

## Phase 4 — Push to GitHub and cut a release

### Task 4.1: Single cleanup commit

**Files:** none (committing all the work from Phase 2)

- [ ] **Step 1: Review staged changes**

Run from `E:/Coding/quills`: `git status`
Expected: many modified `.go` files, plus modified `go.mod`, `tygo.yaml`, `scripts/sync_version.py` (note: shown as modified because filter-repo preserved its content), `.github/workflows/release.yml`; plus new `README.md`, `.gitignore`, `docs/hedgebuddy-integration.md`.

- [ ] **Step 2: Stage everything**

Run from `E:/Coding/quills`: `git add -A`
Expected: no output.

- [ ] **Step 3: Commit**

Run from `E:/Coding/quills`:
```bash
git commit -m "$(cat <<'EOF'
chore: rewrite paths for standalone repo

- module path: github.com/shakedex/hedgebuddy/service -> github.com/shakedex/quills
- bulk-rewrite Go imports to the new module path
- update tygo.yaml package paths
- DefaultRepoURL now points at shakedex/quills/main/quills
- retarget scripts/sync_version.py to root-relative paths
- rewrite release.yml: tag trigger v*.*.*, drop service/ working-directory
- add README, .gitignore, docs/hedgebuddy-integration.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: `[main <sha>] chore: rewrite paths for standalone repo` with the file count.

### Task 4.2: Push to shakedex/quills

**Files:** none

- [ ] **Step 1: Add remote**

Run from `E:/Coding/quills`: `git remote add origin https://github.com/shakedex/quills.git`
Expected: no output.

- [ ] **Step 2: Verify remote**

Run from `E:/Coding/quills`: `git remote -v`
Expected: `origin  https://github.com/shakedex/quills.git (fetch)` and `(push)`.

- [ ] **Step 3: Rename branch to main if necessary**

Run from `E:/Coding/quills`: `git branch --show-current`
Expected: `master` (filter-repo preserves the source branch name; hedgebuddy uses `master`).

If output is `master`, rename: `git branch -m master main`
Expected: no output.

Re-verify: `git branch --show-current` → `main`.

- [ ] **Step 4: Push (use --force so a possible auto-`main` from GitHub gets overwritten)**

Run from `E:/Coding/quills`: `git push -u origin main --force`
Expected: `Branch 'main' set up to track remote branch 'main' from 'origin'.` and the push succeeds.

- [ ] **Step 5: Confirm on GitHub**

Run: `gh repo view shakedex/quills --json defaultBranchRef,pushedAt`
Expected: `defaultBranchRef.name: main` and a recent `pushedAt`.

If the default branch on GitHub is still something else (e.g. an auto-created `main` from when the repo was made — possible), set it:
Run: `gh repo edit shakedex/quills --default-branch main`
Expected: no error.

### Task 4.3: Tag and release v0.9.2

**Files:** none

- [ ] **Step 1: Read current VERSION**

Run: `cat E:/Coding/quills/VERSION`
Expected: `0.9.2` (or whatever is current — match the tag to it).

- [ ] **Step 2: Tag**

Run from `E:/Coding/quills`: `git tag -a v0.9.2 -m "Quills v0.9.2 (first standalone release)"`
Expected: no output.

- [ ] **Step 3: Push tag (triggers release workflow)**

Run from `E:/Coding/quills`: `git push origin v0.9.2`
Expected: `* [new tag] v0.9.2 -> v0.9.2`.

- [ ] **Step 4: Watch the release workflow**

Run: `gh run watch --repo shakedex/quills`
Expected: lists "Release Quills Service" run in progress, then completes successfully (all three jobs: build-web, build-windows, build-macos, create-release). If it fails, drill in with `gh run view --log-failed --repo shakedex/quills`.

- [ ] **Step 5: Verify release exists with both binaries**

Run: `gh release view v0.9.2 --repo shakedex/quills --json assets --jq '.assets[].name'`
Expected: `quills.exe` and `quills`.

### Task 4.4: Verify the catalog URL works end-to-end

**Files:** none

- [ ] **Step 1: Curl the new catalog URL**

Run: `curl -sSL https://raw.githubusercontent.com/shakedex/quills/main/quills/index.json | head -20`
Expected: a JSON array containing entries for `slack-notify`, `email-notify`, `arri-art-cmd`.

- [ ] **Step 2: Curl a sample quill.yaml**

Run: `curl -sSL https://raw.githubusercontent.com/shakedex/quills/main/quills/arri-art-cmd/quill.yaml | head -5`
Expected: `id: arri-art-cmd` and other YAML keys.

- [ ] **Step 3: Re-run the binary smoke test from Task 3.3 Step 2**

Same command. Expected `200` and a non-empty body listing remote quills.

---

## Phase 5 — Hedgebuddy cleanup PR

All steps here happen in `E:\Coding\hedgebuddy`. Recall that Phase 0 Task 0.3 stashed the user's WIP — it will be restored at the very end.

### Task 5.1: Create cleanup branch

**Files:** none

- [ ] **Step 1: Verify on master and up to date**

Run: `git -C E:/Coding/hedgebuddy fetch origin && git -C E:/Coding/hedgebuddy status -sb`
Expected: `## master...origin/master` with no divergence noted.

- [ ] **Step 2: Create branch**

Run: `git -C E:/Coding/hedgebuddy checkout -b chore/remove-quills`
Expected: `Switched to a new branch 'chore/remove-quills'`.

### Task 5.2: Delete extracted code

**Files:**
- Delete: `service/`, `quills/`, `.github/workflows/release-quills.yml`, `.github/workflows/release-bundle.yml`, `scripts/sync_quills_version.py`, `scripts/installer/macos/build-bundle-pkg.sh`, `scripts/installer/macos/postinstall-bundle`, `scripts/installer/macos/io.github.shakedex.quills.plist`, `scripts/installer/windows/suite.nsi`

- [ ] **Step 1: Confirm each target exists before deletion (sanity)**

Run from `E:/Coding/hedgebuddy`:
```bash
ls service quills .github/workflows/release-quills.yml .github/workflows/release-bundle.yml scripts/sync_quills_version.py scripts/installer/macos/build-bundle-pkg.sh scripts/installer/macos/postinstall-bundle scripts/installer/macos/io.github.shakedex.quills.plist scripts/installer/windows/suite.nsi 2>&1 | head -30
```
Expected: each shows up. If any are missing, investigate before deleting the rest.

- [ ] **Step 2: Delete via git rm**

Run from `E:/Coding/hedgebuddy`:
```bash
git rm -r service quills
git rm .github/workflows/release-quills.yml .github/workflows/release-bundle.yml scripts/sync_quills_version.py scripts/installer/macos/build-bundle-pkg.sh scripts/installer/macos/postinstall-bundle scripts/installer/macos/io.github.shakedex.quills.plist scripts/installer/windows/suite.nsi
```
Expected: long list of `rm '...'` lines.

- [ ] **Step 3: Verify scripts/installer/macos/ and scripts/installer/windows/ are now empty (and remove if so)**

Run: `ls E:/Coding/hedgebuddy/scripts/installer/macos E:/Coding/hedgebuddy/scripts/installer/windows`
Expected: empty output for both.

If both are empty:
```bash
rmdir E:/Coding/hedgebuddy/scripts/installer/macos
rmdir E:/Coding/hedgebuddy/scripts/installer/windows
rmdir E:/Coding/hedgebuddy/scripts/installer
```
Expected: no errors. (Empty dirs don't exist in git anyway, so no `git rm` needed.)

If either still has files (e.g. a non-suite installer), leave that dir alone.

### Task 5.3: Trim .vscode/tasks.json

**Files:**
- Modify: `E:\Coding\hedgebuddy\.vscode\tasks.json`

- [ ] **Step 1: Open the file** and remove these task entries:
  - `dev:web` (lines ~4-17)
  - `build:web` (lines ~18-30)
  - `test:web` (lines ~31-43)
  - `typecheck:web` (lines ~44-56)
  - `tsc:emit:web` (lines ~57-69)
  - `dev:service` (lines ~70-83)
  - `build:service` (lines ~84-96)
  - `vet:service` (lines ~97-109)
  - `run:service-binary` (lines ~110-123)
  - `build:suite` (lines ~203-215)
  - `dev:full-stack` (lines ~216-224 — depends on `dev:service` + `dev:web`)
  - `generate-types` (lines ~225-234 — calls `tygo generate` against `service/tygo.yaml`)

  Keep: `test:python-lib`, `install:python-lib-editable`, `dev:app`, `build:app`, `build:updater`, `vet:updater`.

- [ ] **Step 2: Verify the file is still valid JSON**

Run: `python -c "import json; json.load(open('E:/Coding/hedgebuddy/.vscode/tasks.json'))"`
Expected: no output (parses OK).

- [ ] **Step 3: Verify the remaining task list is what you expect**

Run: `python -c "import json; print('\n'.join(t['label'] for t in json.load(open('E:/Coding/hedgebuddy/.vscode/tasks.json'))['tasks']))"`
Expected: exactly: `test:python-lib`, `install:python-lib-editable`, `dev:app`, `build:app`, `build:updater`, `vet:updater` (in some order).

### Task 5.4: Update CHANGELOG.md with split note

**Files:**
- Modify: `E:\Coding\hedgebuddy\CHANGELOG.md`

- [ ] **Step 1: Read the top of CHANGELOG.md to find the right insertion point**

Run: `head -20 E:/Coding/hedgebuddy/CHANGELOG.md`
Expected: the changelog header and most-recent entry.

- [ ] **Step 2: Insert this note as a new entry at the very top (under the `# Changelog` header, before any other entries)**

```markdown
## [Unreleased]

### Changed

- **Quills extracted to its own repository at [shakedex/quills](https://github.com/shakedex/quills).** The `service/` and `quills/` directories, the Quills release workflow, and the combined "HedgeBuddy Suite" installer have been removed. Historical entries below that describe Quills work remain for context, but Quills development continues in the new repo.
```

(If the changelog already has an `## [Unreleased]` section, append the bullet to its `### Changed` subsection instead of adding a duplicate section.)

- [ ] **Step 3: Verify the insertion**

Run: `head -10 E:/Coding/hedgebuddy/CHANGELOG.md`
Expected: the new note visible.

### Task 5.5: Verify hedgebuddy still builds

**Files:** none

- [ ] **Step 1: Python lib tests**

Run: `cd E:/Coding/hedgebuddy/python-lib && python -m pytest -q`
Expected: all tests pass.

- [ ] **Step 2: App build**

Run from `E:/Coding/hedgebuddy/app` (PowerShell): `$env:PATH = 'C:\msys64\ucrt64\bin;' + $env:PATH; $env:CGO_ENABLED = '1'; go build -o hedgebuddy-smoke.exe .`
Expected: exits 0; binary produced.

Clean up: `Remove-Item E:/Coding/hedgebuddy/app/hedgebuddy-smoke.exe`

- [ ] **Step 3: Updater build**

Run from `E:/Coding/hedgebuddy/updater`: `go build -o updater-smoke.exe .`
Expected: exits 0.

Clean up: `Remove-Item E:/Coding/hedgebuddy/updater/updater-smoke.exe`

- [ ] **Step 4: Final search for orphan references**

Run from `E:/Coding/hedgebuddy`:
```bash
grep -rn 'service/\|sync_quills_version\|release-quills\|release-bundle\|build-bundle-pkg\|suite.nsi\|postinstall-bundle' --include='*.yml' --include='*.yaml' --include='*.sh' --include='*.py' --include='*.go' --include='*.md' --include='*.json' --include='*.nsi' .
```
Expected: any remaining matches should be either (a) inside CHANGELOG.md historical entries (OK — keep), or (b) something we missed (fix before committing).

### Task 5.6: Commit cleanup

**Files:** none

- [ ] **Step 1: Review the diff scope**

Run from `E:/Coding/hedgebuddy`: `git status --short`
Expected: many `D` (deleted) lines for `service/*` and `quills/*`; `D` lines for the workflows and installer scripts; `M` for `CHANGELOG.md` and `.vscode/tasks.json`.

- [ ] **Step 2: Commit**

Run from `E:/Coding/hedgebuddy`:
```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: extract Quills service to shakedex/quills

Quills (the service/ tree and the top-level quills/ community catalog)
now lives at https://github.com/shakedex/quills with full git history
preserved. This commit removes the extracted code, the Quills release
workflow, the dropped HedgeBuddy Suite bundle installer, and the related
.vscode tasks. The hbvars file-format contract Quills depends on is
unchanged in this repo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: commit succeeds; reports many file deletions and the two modifications.

### Task 5.7: Push branch and open PR

**Files:** none

- [ ] **Step 1: Push branch**

Run from `E:/Coding/hedgebuddy`: `git push -u origin chore/remove-quills`
Expected: branch created on origin.

- [ ] **Step 2: Open the PR**

Run from `E:/Coding/hedgebuddy`:
```bash
gh pr create --title "chore: extract Quills service to shakedex/quills" --body "$(cat <<'EOF'
## Summary

- Extracts the Quills service (`service/` + top-level `quills/` community catalog) to its own repo at [shakedex/quills](https://github.com/shakedex/quills) with full git history preserved.
- Drops the combined "HedgeBuddy Suite" installer: `release-bundle.yml` and the macOS/Windows suite-installer scripts are removed. Each product now ships standalone.
- Trims `.vscode/tasks.json` to only the tasks relevant to what remains in this repo (HedgeBuddy app, Python lib, updater).
- Notes the split at the top of `CHANGELOG.md`.

## Cross-repo coupling

Quills still reads HedgeBuddy's \`vars.json\` by hardcoded OS-conventional path. That contract is documented in the new repo at [docs/hedgebuddy-integration.md](https://github.com/shakedex/quills/blob/main/docs/hedgebuddy-integration.md). No code in this repo needs to change to maintain it.

## Test plan

- [ ] Confirm \`python-lib\` tests still pass: \`cd python-lib && pytest -q\`
- [ ] Confirm \`app/\` still builds: \`cd app && go build .\`
- [ ] Confirm \`updater/\` still builds: \`cd updater && go build .\`
- [ ] Confirm \`release.yml\` (HedgeBuddy desktop app release) still parses: GitHub Actions tab → no syntax errors.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: prints the PR URL.

- [ ] **Step 3: Decision point — DO NOT MERGE YET if a grace period is wanted**

Per the spec, the safest course is to merge this PR only after one Quills release has propagated and existing users have had a chance to upgrade (so old binaries with the old `DefaultRepoURL` still find the catalog under `shakedex/hedgebuddy/master/quills`). Mark the PR as draft if you want to enforce that gate:

Run: `gh pr ready --undo` (toggles to draft) — *only if* you want to defer the merge.

If there are no out-in-the-wild installs to worry about, the PR can be merged immediately. The user makes this call.

### Task 5.8: Return to master

**Files:** working tree of `E:\Coding\hedgebuddy`

- [ ] **Step 1: Switch back to master**

Run: `git -C E:/Coding/hedgebuddy checkout master`
Expected: `Switched to branch 'master'`.

- [ ] **Step 2: Verify any non-Quills WIP is still present (it should be — we never touched it)**

Run: `git -C E:/Coding/hedgebuddy status --short`
Expected: shows any pre-existing non-Quills WIP (e.g. `python-lib/uv.lock`). No `service/` or `quills/` entries (those were committed in Task 0.3 and then deleted in the cleanup PR).

---

## Phase 6 — Done / done-criteria

- [ ] **Final check 1:** `gh release view v0.9.2 --repo shakedex/quills` shows a release with both `quills.exe` and `quills` binaries.
- [ ] **Final check 2:** `curl -sSL https://raw.githubusercontent.com/shakedex/quills/main/quills/index.json` returns the catalog JSON.
- [ ] **Final check 3:** The `chore: extract Quills service to shakedex/quills` PR exists against `shakedex/hedgebuddy` and is either merged or intentionally held as draft for the grace period.
- [ ] **Final check 4:** `git -C E:/Coding/quills log --oneline -- internal/` shows historical commits, not just the cleanup commit.

## Rollback notes

- Phases 0-3 are entirely local; abandoning means `Remove-Item -Recurse -Force E:\Coding\quills` and `git -C E:/Coding/hedgebuddy stash pop`.
- Phase 4 (push to GitHub): the only destructive op is `git push --force` against an empty repo. To roll back, delete the repo on GitHub or force-push an empty branch. The release tag can be deleted with `gh release delete v0.9.2 --repo shakedex/quills` and `git push --delete origin v0.9.2`.
- Phase 5 (hedgebuddy cleanup): until the PR merges, just `git checkout master && git branch -D chore/remove-quills && git push origin --delete chore/remove-quills`.
