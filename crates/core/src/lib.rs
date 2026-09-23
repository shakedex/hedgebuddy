//! HedgeBuddy core.
//!
//! Everything HedgeBuddy does lives here. The CLI, the MCP server, and the
//! desktop app are thin front ends over this crate. This crate has no UI and
//! never parses command-line arguments.
//!
//! Entry point: [`Store`], opened on a data directory ([`Store::at_default`]
//! for the platform location). Profiles, variables, secrets, scripts, and run
//! records are all methods on `Store`; [`watch()`] reports external changes.
//! Every file `Store` writes conforms to the JSON Schemas under `schema/`.
//!
//! Hedge app integration lives in [`hedge::Hedge`] (a [`host::Host`] plus a
//! [`catalog::Catalog`]); every change outside the data directory is planned
//! as a list of [`hedge::Action`]s and executed only by [`hedge::Hedge::apply`].
//! [`volumes::inspect_volume`] and [`python_env::find_python`] cover camera
//! cards and the Python interpreter.

pub mod activity;
pub mod catalog;
pub mod clock;
pub mod error;
pub(crate) mod fs_util;
pub mod hedge;
pub mod host;
pub mod lock;
pub mod manifest;
pub mod paths;
pub mod profile;
pub mod python_env;
pub mod runs;
pub mod scripts;
pub mod secrets;
pub mod store;
pub mod variable;
pub mod volumes;
pub mod watch;

pub use activity::{
    activity_target, ActivityOutcome, ActivityRecord, ACTIVITY_KEEP, ACTIVITY_TRIM_AT,
};
pub use catalog::Catalog;
pub use clock::now_rfc3339;
pub use error::{CoreError, Result};
pub use hedge::Hedge;
pub use host::{FakeHost, Host, Os, RealHost};
pub use lock::{DataLock, BUSY_MESSAGE, LOCK_TIMEOUT};
pub use manifest::{
    check_requirements, extract_manifest_text, parse_manifest, Manifest, Requirement,
    RequirementIssue,
};
pub use paths::{data_dir, PathError, DATA_DIR_ENV};
pub use profile::Profile;
pub use runs::{LogLine, Run, RunFilter, RunRecord, RunStatus, RUN_RETENTION_DAYS};
pub use scripts::{validate_script_name, ScriptCheck, ScriptInfo};
pub use secrets::{ResolvedVariable, VariableInput};
pub use store::{Index, Store};
pub use variable::{validate_slug, validate_var_name, VarType, VarValue, Variable};
pub use watch::{
    categories, watch, watch_batched, Category, Change, ChangeKind, WatchHandle, BATCH_WINDOW,
};
