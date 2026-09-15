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

`fixtures/valid/<case>/` is a complete data directory. Every file in it must validate:

- `hedgebuddy.json` against `hedgebuddy.schema.json`
- `profiles/*/profile.json` against `profile.schema.json`
- `profiles/*/secrets.json` against `secrets.schema.json`
- every line of `runs/*.jsonl` against `run-record.schema.json`
- the manifest extracted from every `profiles/*/scripts/*.py` against `script-manifest.schema.json`

`fixtures/invalid/<schema-stem>/*.json` are single documents that must **fail** validation against `<schema-stem>.schema.json`.

Manifest extraction: take the module docstring (the first `"""..."""` block in the file), keep the text before the first line that is exactly `---`, parse it as JSON.
