//! Validates the shared fixtures in `schema/fixtures` against the shared
//! schemas in `schema/`. The Python test suite runs the same check, so this
//! is what keeps the Rust and Python sides of the storage contract in step.

use std::fs;
use std::path::{Path, PathBuf};

use jsonschema::Validator;
use serde_json::Value;

fn schema_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../schema")
}

fn load_json(path: &Path) -> Value {
    let text = fs::read_to_string(path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("parse {}: {e}", path.display()))
}

fn validator(stem: &str) -> Validator {
    let schema = load_json(&schema_root().join(format!("{stem}.schema.json")));
    jsonschema::validator_for(&schema).unwrap_or_else(|e| panic!("schema {stem}: {e}"))
}

fn assert_valid(v: &Validator, instance: &Value, what: &str) {
    let errors: Vec<String> = v.iter_errors(instance).map(|e| e.to_string()).collect();
    assert!(
        errors.is_empty(),
        "{what} should be valid but:\n{}",
        errors.join("\n")
    );
}

/// Manifest extraction as documented in schema/README.md. Phase 2 moves this
/// into the core crate proper; until then the test owns it.
fn extract_manifest(py_source: &str) -> Value {
    let start = py_source.find("\"\"\"").expect("docstring start") + 3;
    let end = py_source[start..].find("\"\"\"").expect("docstring end") + start;
    let doc = &py_source[start..end];
    let json_part = doc
        .lines()
        .take_while(|line| line.trim_end() != "---")
        .collect::<Vec<_>>()
        .join("\n");
    serde_json::from_str(json_part.trim()).expect("manifest JSON")
}

fn dirs_in(path: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = match fs::read_dir(path) {
        Ok(rd) => rd
            .map(|e| e.unwrap().path())
            .filter(|p| p.is_dir())
            .collect(),
        Err(_) => Vec::new(),
    };
    v.sort();
    v
}

fn files_in(path: &Path, ext: &str) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = match fs::read_dir(path) {
        Ok(rd) => rd
            .map(|e| e.unwrap().path())
            .filter(|p| p.is_file() && p.extension().map(|x| x == ext).unwrap_or(false))
            .collect(),
        Err(_) => Vec::new(),
    };
    v.sort();
    v
}

#[test]
fn every_valid_fixture_data_dir_validates() {
    let hedgebuddy = validator("hedgebuddy");
    let profile = validator("profile");
    let secrets = validator("secrets");
    let run_record = validator("run-record");
    let manifest = validator("script-manifest");

    let cases = dirs_in(&schema_root().join("fixtures/valid"));
    assert!(!cases.is_empty(), "no valid fixture cases found");

    let (mut profiles_seen, mut scripts_seen, mut run_lines_seen) = (0, 0, 0);

    for case in cases {
        let name = case.file_name().unwrap().to_string_lossy().to_string();

        assert_valid(
            &hedgebuddy,
            &load_json(&case.join("hedgebuddy.json")),
            &format!("{name}/hedgebuddy.json"),
        );

        for prof in dirs_in(&case.join("profiles")) {
            profiles_seen += 1;
            let pname = prof.file_name().unwrap().to_string_lossy().to_string();
            assert_valid(
                &profile,
                &load_json(&prof.join("profile.json")),
                &format!("{name}/{pname}/profile.json"),
            );
            if prof.join("secrets.json").exists() {
                assert_valid(
                    &secrets,
                    &load_json(&prof.join("secrets.json")),
                    &format!("{name}/{pname}/secrets.json"),
                );
            }
            for script in files_in(&prof.join("scripts"), "py") {
                scripts_seen += 1;
                let src = fs::read_to_string(&script).unwrap();
                assert_valid(
                    &manifest,
                    &extract_manifest(&src),
                    &script.display().to_string(),
                );
            }
        }

        for log in files_in(&case.join("runs"), "jsonl") {
            let text = fs::read_to_string(&log).unwrap();
            for (i, line) in text.lines().filter(|l| !l.trim().is_empty()).enumerate() {
                run_lines_seen += 1;
                let v: Value = serde_json::from_str(line).unwrap();
                assert_valid(&run_record, &v, &format!("{}:{}", log.display(), i + 1));
            }
        }
    }

    assert!(
        profiles_seen >= 1,
        "valid fixtures must contain at least one profile"
    );
    assert!(
        scripts_seen >= 1,
        "valid fixtures must contain at least one script"
    );
    assert!(
        run_lines_seen >= 1,
        "valid fixtures must contain at least one run record"
    );
}

#[test]
fn every_invalid_fixture_fails_its_schema() {
    let groups = dirs_in(&schema_root().join("fixtures/invalid"));
    assert!(!groups.is_empty(), "no invalid fixture groups found");
    let mut checked = 0;
    for group in groups {
        let stem = group.file_name().unwrap().to_string_lossy().to_string();
        let v = validator(&stem);
        for file in files_in(&group, "json") {
            let instance = load_json(&file);
            assert!(
                !v.is_valid(&instance),
                "{} should be INVALID against {stem}.schema.json",
                file.display()
            );
            checked += 1;
        }
    }
    assert!(
        checked >= 7,
        "expected at least 7 invalid fixtures, checked {checked}"
    );
}
