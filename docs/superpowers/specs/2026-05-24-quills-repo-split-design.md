# Quills repo split — design

**Date:** 2026-05-24
**Status:** Approved, pending implementation plan
**Source repo:** `shakedex/hedgebuddy`
**Target repo:** `shakedex/quills` (already created on GitHub, default branch `main`)

## Goal

Extract the Quills product from `shakedex/hedgebuddy` into a new standalone repo `shakedex/quills`. The split must:

- Preserve git history for the moved files.
- Flatten `service/` to the new repo's root.
- Keep the community quill catalog at `/quills` so the runtime catalog URL remains valid.
- Remove the extracted code from `shakedex/hedgebuddy` in a single cleanup commit.
- Drop the combined "HedgeBuddy Suite" installer entirely — each product ships standalone.

## What moves and what stays

### Moves to `shakedex/quills`

| Source (in hedgebuddy) | Destination (in quills) |
|---|---|
| `service/` (entire tree) | repo root |
| `quills/` (community catalog) | `quills/` |
| `.github/workflows/release-quills.yml` | `.github/workflows/release.yml` (renamed, tag scheme updated) |
| `scripts/sync_quills_version.py` | `scripts/sync_version.py` (renamed, paths retargeted) |

### Stays in `shakedex/hedgebuddy`

- `python-lib/`, `app/`, `updater/`, `branding/`, `docs/`, `examples/`, `tests/`, `outside-resources/`, `build/`
- Workflows: `release.yml`, `publish-pypi.yml`, `deploy-docs.yml`
- Top-level `README.md`, `CHANGELOG.md`, `LICENSE`, `Makefile`, `VERSION`

### Deleted from both sides

- `.github/workflows/release-bundle.yml` — suite installer is being dropped.
- `scripts/installer/macos/build-bundle-pkg.sh`
- `scripts/installer/macos/postinstall-bundle`
- `scripts/installer/macos/io.github.shakedex.quills.plist`
- `scripts/installer/windows/suite.nsi`

(`service/installer/macos/` — including its own `io.github.shakedex.quills.plist`, `postinstall`, `build-pkg.sh` — moves with `service/` and remains useful for Quills' standalone macOS release.)

## New repo structure

```
shakedex/quills/
├── main.go
├── go.mod
├── go.sum
├── tygo.yaml
├── VERSION
├── CHANGELOG.md
├── README.md                 (new — Quills-focused)
├── bin/                      (gitignored build output)
├── installer/                (was service/installer/)
├── internal/                 (was service/internal/)
├── web/                      (was service/web/)
├── quills/                   (community catalog — path preserved so DefaultRepoURL stays valid)
│   ├── index.json
│   ├── arri-art-cmd/
│   ├── email-notify/
│   └── slack-notify/
├── .github/workflows/
│   └── release.yml
├── scripts/
│   └── sync_version.py
└── .gitignore                (new — mirrors hedgebuddy's relevant entries)
```

## Module / path / branch / tag changes

| Concern | From | To |
|---|---|---|
| Go module path | `github.com/shakedex/hedgebuddy/service` | `github.com/shakedex/quills` |
| Internal imports | `…/hedgebuddy/service/internal/...` | `…/quills/internal/...` |
| `DefaultRepoURL` in `internal/quills/remote.go:32` | `https://raw.githubusercontent.com/shakedex/hedgebuddy/master/quills` | `https://raw.githubusercontent.com/shakedex/quills/main/quills` |
| Default branch of new repo | n/a | `main` |
| Release tag scheme | `quills-v*` (when in hedgebuddy) | `v*` (in standalone repo) |
| Release workflow trigger | `tags: quills-v*.*.*` | `tags: v*.*.*` |

## History extraction strategy

Use `git filter-repo` on a fresh clone of `hedgebuddy`. The invocation keeps only:

- `service/`
- `quills/`
- `.github/workflows/release-quills.yml`
- `scripts/sync_quills_version.py`

…and applies `--path-rename` to flatten `service/` → repo root and rename the workflow and script to their new names.

After the rewrite, push the resulting branch as `main` to the empty `shakedex/quills` repo.

Trade-off accepted: `git blame` won't follow files across the flatten rename without `--follow`. Acceptable given the small number of commits (~9 touching service, ~2 touching quills).

## Post-rewrite cleanup commit in new repo

A single commit titled e.g. `chore: rewrite paths for standalone repo` that performs:

1. `go.mod`: change module path to `github.com/shakedex/quills`.
2. Bulk rewrite Go imports: `github.com/shakedex/hedgebuddy/service/internal` → `github.com/shakedex/quills/internal`.
3. Update `DefaultRepoURL` in `internal/quills/remote.go`.
4. Retarget `scripts/sync_version.py` `TARGETS` to root-relative paths (`internal/version/version.go`, `web/package.json`).
5. Rewrite `.github/workflows/release.yml`:
   - Tag trigger `quills-v*.*.*` → `v*.*.*`.
   - Remove `working-directory: service` from all steps.
   - Update `cache-dependency-path: service/go.mod` → `go.mod`.
   - Update version-parsing logic (`refs/tags/quills-v` → `refs/tags/v`).
   - Remove "Quills" prefix from release name, or keep — author's choice; default: keep "Quills v…" naming since the product name is unchanged.
6. Write new `README.md` (Quills-focused).
7. Add `.gitignore` (port relevant entries from hedgebuddy: `bin/`, `web/dist/`, `web/node_modules/`, `*.db`, etc.).
8. Add a short `docs/hedgebuddy-integration.md` documenting the `vars.json` file-format contract that `internal/hbvars/` depends on.

Verify before committing:
- `go build ./...` succeeds.
- `cd web && bun install && bun run build` succeeds.
- Binary launches and serves the embedded UI.

## hbvars integration — kept as-is

`internal/hbvars/` continues to read HedgeBuddy's `vars.json` by hardcoded OS-conventional path (`%APPDATA%\HedgeBuddy\...` / `~/Library/Application Support/HedgeBuddy/...`). The package already returns `Available: false` gracefully when HedgeBuddy isn't installed, so no code change is required for the split.

The only deliverable is the new `docs/hedgebuddy-integration.md` describing the contract for future-proofing (so a change in HedgeBuddy's storage format has a known impact on Quills).

## Hedgebuddy cleanup commit (after new repo is verified)

One PR against `shakedex/hedgebuddy` `master` that deletes:

- `service/` (entire tree)
- `quills/` (entire tree)
- `.github/workflows/release-quills.yml`
- `.github/workflows/release-bundle.yml`
- `scripts/sync_quills_version.py`
- `scripts/installer/macos/build-bundle-pkg.sh`
- `scripts/installer/macos/postinstall-bundle`
- `scripts/installer/macos/io.github.shakedex.quills.plist`
- `scripts/installer/windows/suite.nsi`

And edits:

- `.vscode/tasks.json` — remove `dev:web` and `build:web` tasks (which target `service/web`).
- `CHANGELOG.md` — leave existing Quills history entries in place (they happened in this repo). Add a note at the top: "Quills extracted to [shakedex/quills](https://github.com/shakedex/quills) on 2026-05-24."

Not touched: `README.md` (already doesn't mention Quills).

## Order of operations

1. **Extract.** On a fresh clone of `hedgebuddy`, run `git filter-repo` with the keep/rename rules, then push to `shakedex/quills` as `main`.
2. **Standalonify.** In the new repo, apply the cleanup commit (module path, imports, URL, workflow, README, gitignore, integration doc). Verify build.
3. **Release new Quills.** Cut tag `v0.x.0` from `shakedex/quills` matching the current `service/VERSION`. Confirm the released binary fetches the catalog from the new URL successfully (manual smoke test).
4. **Grace period.** Leave `quills/` in `shakedex/hedgebuddy` for one release cycle so older Quills binaries (which still point at the old catalog URL) can continue to fetch built-in quills until users upgrade.
5. **Cleanup PR.** After the grace period (or immediately, if there are no out-in-the-wild Quills installs to worry about), open the hedgebuddy cleanup PR. Merge.

## Out of scope

- Cross-repo automation between hedgebuddy and quills (no submodules, no shared CI).
- Renaming `hbvars` package or formalizing the integration contract beyond a docs note.
- Authoring new tests during the split — existing tests come along unchanged.
- Re-signing or re-notarizing installers; existing per-platform workflows handle signing.
- Migrating any GitHub Issues or Discussions from hedgebuddy to quills.

## Risks

| Risk | Mitigation |
|---|---|
| Catalog URL breakage for existing installs | Grace period in step 4 — keep `quills/` in hedgebuddy until users have upgraded to a Quills release with the new URL. |
| `filter-repo` flattens break `git blame` | Accepted; use `git blame --follow` when needed. |
| Drift between the two repos during grace period | The `quills/` catalog in hedgebuddy goes into freeze the moment the split happens — all catalog updates go to the new repo only. |
| Bundle installer users expect the suite to keep shipping | Document in the next hedgebuddy release notes that the suite installer is retired; recommend installing each product separately. |

## Success criteria

- `shakedex/quills` builds (`go build .`) and the binary serves the embedded UI.
- The released `shakedex/quills` binary successfully fetches `index.json` from `https://raw.githubusercontent.com/shakedex/quills/main/quills/index.json`.
- `shakedex/hedgebuddy` cleanup PR merges cleanly with no lingering references to `service/`, `quills/`, or the dropped workflows/scripts.
- `git log --oneline -- internal/` in the new repo shows the historical commits that touched `service/internal/` in hedgebuddy.
