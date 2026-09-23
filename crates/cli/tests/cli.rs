use assert_cmd::Command;
use predicates::prelude::*;

fn hb() -> Command {
    Command::cargo_bin("hedgebuddy").expect("binary built")
}

#[test]
fn version_flag_prints_the_workspace_version() {
    hb().arg("--version")
        .assert()
        .success()
        .stdout(predicate::str::contains(env!("CARGO_PKG_VERSION")));
}

#[test]
fn env_prints_the_data_dir_and_honours_the_override() {
    hb().env("HEDGEBUDDY_DATA_DIR", "Z:/hb-cli-test")
        .arg("env")
        .assert()
        .success()
        .stdout(predicate::str::contains("data_dir=Z:/hb-cli-test"));
}

#[test]
fn no_subcommand_is_a_usage_error() {
    hb().assert()
        .failure()
        .stderr(predicate::str::contains("Usage"));
}

#[test]
fn tools_lists_every_tool() {
    hb().arg("tools")
        .assert()
        .success()
        .stdout(predicate::str::contains("list_profiles"))
        .stdout(predicate::str::contains("delete_profile"));
}

#[test]
fn call_runs_a_tool_and_prints_json() {
    let dir = tempfile::tempdir().unwrap();
    hb().env("HEDGEBUDDY_DATA_DIR", dir.path())
        .args(["call", "create_profile", r#"{"name": "p"}"#])
        .assert()
        .success()
        .stdout(predicate::str::contains("\"active\": true"));
    hb().env("HEDGEBUDDY_DATA_DIR", dir.path())
        .args(["call", "list_profiles"])
        .assert()
        .success()
        .stdout(predicate::str::contains("\"profiles\": [\n    \"p\"\n  ]"));
    hb().env("HEDGEBUDDY_DATA_DIR", dir.path())
        .args(["call", "get_profile", "-"])
        .write_stdin(r#"{"profile": "p"}"#)
        .assert()
        .success()
        .stdout(predicate::str::contains("\"name\": \"p\""));
}

#[test]
fn call_reports_errors_on_stderr() {
    let dir = tempfile::tempdir().unwrap();
    hb().env("HEDGEBUDDY_DATA_DIR", dir.path())
        .args(["call", "nope"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("unknown tool 'nope'"));
    hb().env("HEDGEBUDDY_DATA_DIR", dir.path())
        .args(["call", "list_profiles", "{not json"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("not JSON"));
}
