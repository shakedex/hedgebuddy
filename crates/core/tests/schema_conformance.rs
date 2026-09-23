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
    let activity_record = validator("activity-record");

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
                let text = hedgebuddy_core::manifest::extract_manifest_text(&src)
                    .unwrap_or_else(|| panic!("{} has no manifest block", script.display()));
                let value: Value = serde_json::from_str(text.trim()).expect("manifest JSON");
                assert_valid(&manifest, &value, &script.display().to_string());
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

        let activity = case.join("activity.jsonl");
        if activity.exists() {
            let text = fs::read_to_string(&activity).unwrap();
            for (i, line) in text.lines().filter(|l| !l.trim().is_empty()).enumerate() {
                let v: Value = serde_json::from_str(line).unwrap();
                assert_valid(
                    &activity_record,
                    &v,
                    &format!("{}:{}", activity.display(), i + 1),
                );
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
        checked >= 9,
        "expected at least 9 invalid fixtures, checked {checked}"
    );
}

#[test]
fn activity_records_core_writes_conform() {
    let dir = tempfile::tempdir().unwrap();
    let store = hedgebuddy_core::Store::open(dir.path());
    let args = serde_json::json!({"app": "offshoot"});
    let rec = hedgebuddy_core::ActivityRecord::now(
        "run_app_command",
        hedgebuddy_core::activity_target(&args),
        hedgebuddy_core::ActivityOutcome::NeedsConfirmation,
    );
    store.append_activity(&rec).unwrap();
    let v = validator("activity-record");
    for line in std::fs::read_to_string(store.activity_path())
        .unwrap()
        .lines()
    {
        assert_valid(&v, &serde_json::from_str(line).unwrap(), "activity line");
    }
}
