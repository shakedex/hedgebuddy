//! Hedge app integration: detection, script attachment, commands, presets and
//! logs. Everything is driven by the [`Catalog`] and executed through a
//! [`Host`].

use std::path::PathBuf;
use std::sync::Arc;

use crate::catalog::{expand_path, Catalog};
use crate::error::Result;
use crate::host::Host;

mod apps;
mod attach;
mod sync;

pub use apps::{compare_versions, AppDescription, AppStatus, ResolvedFiles, ScriptingSupport};
pub use attach::{managed_script, Action, AttachState, EventAttachment};
pub use sync::{validate_manifest, SyncConflict, SyncItem, SyncReport, SyncSkip};

/// Hedge app operations on one machine.
pub struct Hedge {
    host: Arc<dyn Host>,
    catalog: Catalog,
}

impl Hedge {
    /// Combine a host and a catalog.
    pub fn new(host: Arc<dyn Host>, catalog: Catalog) -> Hedge {
        Hedge { host, catalog }
    }

    /// The catalog in use.
    pub fn catalog(&self) -> &Catalog {
        &self.catalog
    }

    /// The host in use.
    pub fn host(&self) -> &dyn Host {
        self.host.as_ref()
    }

    pub(crate) fn expand(&self, template: &str) -> Result<PathBuf> {
        expand_path(self.host.as_ref(), template)
    }
}
