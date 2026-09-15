//! HedgeBuddy core.
//!
//! Everything HedgeBuddy does lives here. The CLI, the MCP server, and the
//! desktop app are thin front ends over this crate. This crate has no UI and
//! never parses command-line arguments.
//!
//! Entry point: [`Store`], opened on a data directory ([`Store::at_default`]
//! for the platform location). Profiles, variables, secrets, scripts, and run
//! records are all methods on `Store`; [`watch`] reports external changes.
//! Every file `Store` writes conforms to the JSON Schemas under `schema/`.

pub mod error;
pub mod fs_util;
pub mod manifest;
pub mod paths;
pub mod profile;
pub mod runs;
pub mod scripts;
pub mod secrets;
pub mod store;
pub mod variable;
pub mod watch;

pub use error::{CoreError, Result};
pub use manifest::{
    check_requirements, extract_manifest_text, parse_manifest, Manifest, Requirement,
    RequirementIssue,
};
pub use paths::{data_dir, PathError, DATA_DIR_ENV};
pub use profile::Profile;
pub use runs::{Run, RunFilter, RunRecord, RunStatus, RUN_RETENTION_DAYS};
pub use scripts::{validate_script_name, ScriptCheck, ScriptInfo};
pub use secrets::{ResolvedVariable, VariableInput};
pub use store::{Index, Store};
pub use variable::{VarType, VarValue, Variable};
pub use watch::{watch, Change, ChangeKind, WatchHandle};
