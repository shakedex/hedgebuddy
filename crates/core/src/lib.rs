//! HedgeBuddy core.
//!
//! Everything HedgeBuddy does lives here. The CLI, the MCP server, and the
//! desktop app are thin front ends over this crate. This crate has no UI and
//! never parses command-line arguments.

pub mod error;
pub mod fs_util;
pub mod paths;
pub mod store;
pub mod variable;

pub use error::{CoreError, Result};
pub use paths::{data_dir, PathError, DATA_DIR_ENV};
pub use store::{Index, Store};
pub use variable::{VarType, VarValue, Variable};
