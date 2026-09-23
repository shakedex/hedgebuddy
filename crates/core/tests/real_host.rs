//! Read-only checks against the real machine. Ignored by default because the
//! results depend on what is installed. Run with:
//!
//! ```text
//! cargo test -p hedgebuddy-core --test real_host -- --ignored --nocapture
//! ```
//!
//! Nothing here writes to the registry, app settings, or the data directory.

use std::sync::Arc;

use hedgebuddy_core::catalog::Catalog;
use hedgebuddy_core::hedge::{Hedge, LogKind};
use hedgebuddy_core::host::{Host, RealHost};
use hedgebuddy_core::{python_env, volumes, Store};

#[test]
#[ignore = "reads the real machine; run with --ignored"]
fn real_host_read_only_smoke() {
    let host = Arc::new(RealHost);
    let vols = host.volumes().unwrap();
    assert!(!vols.is_empty());
    for v in &vols {
        println!(
            "volume {} at {} ({}; removable: {})",
            v.name,
            v.mount_point.display(),
            v.file_system,
            v.removable
        );
    }
    if let Some(first) = vols.iter().find(|v| v.removable) {
        println!(
            "inspect {:?}",
            volumes::inspect_volume(&first.mount_point).map(|r| (r.card, r.clip_count))
        );
    }

    let hedge = Hedge::new(host.clone(), Catalog::embedded().unwrap());
    for status in hedge.apps().unwrap() {
        println!("app {status:?}");
    }
    let store = Store::at_default().unwrap();
    for app in ["offshoot", "foolcat"] {
        match hedge.attachments(app, &store) {
            Ok(list) => {
                for a in list {
                    println!("{app} {} {:?}", a.event, a.state);
                }
            }
            Err(e) => println!("{app}: {e}"),
        }
    }
    println!(
        "offshoot presets {:?}",
        hedge.list_presets("offshoot").map(|p| p.len())
    );
    println!(
        "offshoot selected preset {:?}",
        hedge.selected_preset("offshoot")
    );
    println!(
        "offshoot event log tail {:?}",
        hedge.read_app_log("offshoot", LogKind::Event, 3)
    );
    println!(
        "python {:?}",
        python_env::find_python(host.as_ref()).unwrap()
    );
}
