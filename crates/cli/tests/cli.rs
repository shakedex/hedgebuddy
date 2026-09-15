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
