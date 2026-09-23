//! Loads every `schema/fixtures/valid/<case>` through `Store` and compares
//! the result with that case's `expected.json`.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use hedgebuddy_core::{RunFilter, Store};
use serde_json::{json, Value};

fn cases() -> Vec<PathBuf> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../schema/fixtures/valid");
    let mut v: Vec<PathBuf> = fs::read_dir(root)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.is_dir())
        .collect();
    v.sort();
    v
}

fn summarize(store: &Store) -> Value {
    let mut profiles = serde_json::Map::new();
    for name in store.list_profiles().unwrap() {
        let profile = store.load_profile(&name).unwrap();
        let types: BTreeMap<&str, &str> = profile
            .variables
            .iter()
            .map(|(k, v)| (k.as_str(), v.ty.as_str()))
            .collect();
        let secret_names: Vec<&str> = profile
            .variables
            .iter()
            .filter(|(_, v)| v.ty == hedgebuddy_core::VarType::Secret)
            .map(|(k, _)| k.as_str())
            .collect();
        let mut scripts = serde_json::Map::new();
        for info in store.list_scripts(&name).unwrap() {
            let check = store.check_script(&name, &info.name).unwrap();
            let m = info.manifest.expect("fixture scripts carry manifests");
            let unmet: Vec<String> = check
                .issues
                .iter()
                .map(|i| match i {
                    hedgebuddy_core::RequirementIssue::Missing { name, .. } => name.clone(),
                    hedgebuddy_core::RequirementIssue::TypeMismatch { name, .. } => name.clone(),
                })
                .collect();
            scripts.insert(
                info.name,
                json!({
                    "app": m.app, "event": m.event,
                    "requires": m.requires.keys().collect::<Vec<_>>(),
                    "unmet": unmet,
                }),
            );
        }
        profiles.insert(
            name,
            json!({
                "variable_count": profile.variables.len(),
                "types": types,
                "secret_names": secret_names,
                "scripts": scripts,
            }),
        );
    }
    let runs: Vec<Value> = store
        .list_runs(&RunFilter::default())
        .unwrap()
        .into_iter()
        .map(|r| {
            json!({
                "run_id": r.run_id, "script": r.script,
                "status": r.status.map(|s| serde_json::to_value(s).unwrap()),
                "log_count": r.logs.len(),
            })
        })
        .collect();
    json!({
        "active_profile": store.active_profile_name().unwrap(),
        "profiles": profiles,
        "runs": runs,
    })
}

#[test]
fn every_valid_fixture_matches_its_expected_json() {
    let cases = cases();
    assert!(cases.len() >= 2);
    for case in cases {
        let expected: Value =
            serde_json::from_str(&fs::read_to_string(case.join("expected.json")).unwrap()).unwrap();
        let actual = summarize(&Store::open(&case));
        assert_eq!(
            actual,
            expected,
            "fixture {} does not match expected.json",
            case.display()
        );
    }
}
