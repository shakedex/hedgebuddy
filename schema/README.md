# HedgeBuddy schemas and fixtures

The JSON Schemas here (draft 2020-12) are the contract between the Rust core and the Python library. Both test suites validate the same fixtures against the same schemas, so the storage format cannot drift between them.

| Schema | Describes |
|---|---|
| `hedgebuddy.schema.json` | `<data>/hedgebuddy.json` |
| `profile.schema.json` | `<data>/profiles/<name>/profile.json` |
| `secrets.schema.json` | `<data>/profiles/<name>/secrets.json` |
| `run-record.schema.json` | one line of `<data>/runs/*.jsonl` |
| `script-manifest.schema.json` | the JSON block at the top of a script's module docstring |

## Fixture convention

`fixtures/valid/<case>/` is a data directory. `hedgebuddy.json` is always present; `profiles/` and `runs/` may be absent (the `empty` case has neither, because a fresh install has no profiles yet and `active_profile` is `null`). Every file that is present must validate:

- `hedgebuddy.json` against `hedgebuddy.schema.json`
- `profiles/*/profile.json` against `profile.schema.json`
- `profiles/*/secrets.json` against `secrets.schema.json`, when the file exists (a profile with no secret-typed variables has none)
- every line of `runs/*.jsonl` against `run-record.schema.json`
- the manifest extracted from every `profiles/*/scripts/*.py` against `script-manifest.schema.json`

Across all valid cases together there must be at least one profile, one script, and one run-record line, so that every schema is exercised by a valid instance and not only by invalid ones.

`fixtures/invalid/<schema-stem>/*.json` are single documents that must **fail** validation against `<schema-stem>.schema.json`.

Manifest extraction: take the module docstring (the first `"""..."""` block in the file), keep the text before the first line that is `---` (trailing whitespace on that line is ignored), parse it as JSON.
