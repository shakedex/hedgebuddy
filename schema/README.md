# HedgeBuddy schemas and fixtures

The JSON Schemas here (draft 2020-12) are the contract between the Rust core and the Python library. Both test suites validate the same fixtures against the same schemas, so the storage format cannot drift between them.

| Schema | Describes |
|---|---|
| `hedgebuddy.schema.json` | `<data>/hedgebuddy.json` |
| `profile.schema.json` | `<data>/profiles/<name>/profile.json` |
| `secrets.schema.json` | `<data>/profiles/<name>/secrets.json` |
| `run-record.schema.json` | one line of `<data>/runs/*.jsonl` |
| `script-manifest.schema.json` | the JSON block at the top of a script's module docstring |
| `activity-record.schema.json` | one line of `<data>/activity.jsonl` |
| `preferences.schema.json` | `<data>/preferences.json` |

## Fixture convention

`fixtures/valid/<case>/` is a data directory. `hedgebuddy.json` is always present; `profiles/` and `runs/` may be absent (the `empty` case has neither, because a fresh install has no profiles yet and `active_profile` is `null`). Every file that is present must validate:

- `hedgebuddy.json` against `hedgebuddy.schema.json`
- `profiles/*/profile.json` against `profile.schema.json`
- `profiles/*/secrets.json` against `secrets.schema.json`, when the file exists (a profile with no secret-typed variables has none)
- every line of `runs/*.jsonl` against `run-record.schema.json`
- the manifest extracted from every `profiles/*/scripts/*.py` against `script-manifest.schema.json`
- every line of `activity.jsonl` against `activity-record.schema.json`, when the file is present
- `preferences.json` against `preferences.schema.json`, when the file is present

Across all valid cases together there must be at least one profile, one script, and one run-record line, so that every schema is exercised by a valid instance and not only by invalid ones.

`fixtures/invalid/<schema-stem>/*.json` are single documents that must **fail** validation against `<schema-stem>.schema.json`.

Manifest extraction: the module docstring is the first statement in the file after any blank lines and `#` comment lines; it may use `"""` or `'''`; the text before the first line that is `---` (trailing whitespace ignored) is the manifest when it starts with `{`; otherwise there is no manifest. A leading UTF-8 BOM is skipped before any of this.

## Expected parse results

Each valid case also carries `expected.json`: a language-neutral summary of what a correct loader produces from that directory (active profile, per-profile variable count and types, secret names, per-script manifest summary and unmet requirements, and per-run id, script, status, and log count). The Rust core asserts it in `crates/core/tests/store_fixture.rs`; the Python library asserts the same file once it has a loader (phase 4). `expected.json` is not validated against any schema and is ignored by the schema-validity tests.

`requires`, `secret_names`, and `unmet` are sorted ascending by name; `runs` are newest first by the start record's `ts`; a run with no `end` record has `"status": null`; `unmet` lists variable names only (missing and type-mismatch are not distinguished); `types` maps every variable name to its schema type string.
