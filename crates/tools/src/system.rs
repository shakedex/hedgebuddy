//! Run records, volumes, and the environment.

use std::path::{Path, PathBuf};

use hedgebuddy_core::host::VolumeInfo;
use hedgebuddy_core::python_env::PythonInfo;
use hedgebuddy_core::volumes::VolumeReport;
use hedgebuddy_core::{python_env, volumes, Os, Run, RunFilter};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::{tool, Context, NoParams, ToolDef, ToolError, READ};

/// Arguments of `list_runs`.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ListRuns {
    /// Only runs of this profile.
    #[serde(default)]
    pub profile: Option<String>,
    /// Only runs of this script file.
    #[serde(default)]
    pub script: Option<String>,
    /// Only runs triggered by this app.
    #[serde(default)]
    pub app: Option<String>,
    /// How many runs, newest first (default 20).
    #[serde(default)]
    pub limit: Option<usize>,
}

/// A run id.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RunId {
    /// Run id from list_runs.
    pub run_id: String,
}

/// A folder or mount point.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PathArg {
    /// Mount point from list_volumes, or any folder.
    pub path: PathBuf,
}

/// Result of `list_runs`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListRunsResult {
    /// Runs, newest first.
    pub runs: Vec<Run>,
}

/// Result of `list_volumes`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListVolumesResult {
    /// Mounted volumes.
    pub volumes: Vec<VolumeInfo>,
}

/// Result of `inspect_volume`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct InspectVolumeResult {
    /// What is on the volume or folder.
    pub report: VolumeReport,
    /// The mounted volume at that path, if it is one.
    pub volume: Option<VolumeInfo>,
}

/// Catalog overrides in effect.
#[derive(Debug, Serialize, JsonSchema)]
pub struct CatalogState {
    /// Apps whose catalog file is overridden from `<data>/catalog/`.
    pub overridden: Vec<String>,
    /// Why the overrides were ignored, if they were.
    pub error: Option<String>,
}

/// One Hedge app in `environment`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct EnvironmentApp {
    /// Catalog app id.
    pub id: String,
    /// Whether it is installed.
    pub installed: bool,
    /// Installed version.
    pub version: Option<String>,
    /// Warnings such as a version newer than tested.
    pub warnings: Vec<String>,
}

/// Result of `environment`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct EnvironmentResult {
    /// HedgeBuddy's version.
    pub version: String,
    /// "windows" or "macos".
    pub os: Os,
    /// The data folder.
    pub data_dir: PathBuf,
    /// The active profile.
    pub active_profile: Option<String>,
    /// Catalog overrides.
    pub catalog: CatalogState,
    /// The Python the Hedge apps use, if found.
    pub python: Option<PythonInfo>,
    /// Whether that Python has this HedgeBuddy's `hedgebuddy` package.
    pub python_package_matches: bool,
    /// Hedge app status.
    pub apps: Vec<EnvironmentApp>,
}

/// The run and system tools.
pub fn tools() -> Vec<ToolDef> {
    vec![
        tool!(
            "list_runs",
            "List recent script runs (newest first) with status, exit code, and log lines. Runs older than 30 days are pruned.",
            READ,
            ListRuns,
            ListRunsResult,
            list_runs
        ),
        tool!(
            "get_run",
            "Show one script run with its log lines and traceback, if any.",
            READ,
            RunId,
            Run,
            get_run
        ),
        tool!(
            "list_volumes",
            "List mounted volumes with name, mount point, file system, size, free space, and whether the OS reports them removable (many card readers report false).",
            READ,
            NoParams,
            ListVolumesResult,
            list_volumes
        ),
        tool!(
            "inspect_volume",
            "Look inside a volume or folder: camera-card guess (sony, canon, panasonic, red, arri, blackmagic, avchd, dcim, audio) with evidence, clip count, media size, and top-level folders.",
            READ,
            PathArg,
            InspectVolumeResult,
            inspect_volume
        ),
        tool!(
            "environment",
            "HedgeBuddy's environment: version, data directory, active profile, catalog overrides and errors, the Python interpreter Hedge apps use and whether the hedgebuddy package there matches, and Hedge app status.",
            READ,
            NoParams,
            EnvironmentResult,
            environment
        ),
    ]
}

fn list_runs(ctx: &Context, p: ListRuns) -> Result<ListRunsResult, ToolError> {
    let filter = RunFilter {
        profile: p.profile,
        script: p.script,
        app: p.app,
        limit: Some(p.limit.unwrap_or(20)),
    };
    Ok(ListRunsResult {
        runs: ctx.store.list_recent_runs(&filter)?,
    })
}

fn get_run(ctx: &Context, p: RunId) -> Result<Run, ToolError> {
    ctx.store
        .get_run(&p.run_id)?
        .ok_or_else(|| ToolError::new(format!("run '{}' not found", p.run_id)))
}

fn list_volumes(ctx: &Context, _: NoParams) -> Result<ListVolumesResult, ToolError> {
    Ok(ListVolumesResult {
        volumes: ctx.hedge.host().volumes()?,
    })
}

fn trimmed(p: &Path) -> String {
    p.to_string_lossy()
        .trim_end_matches(['/', '\\'])
        .to_string()
}

fn inspect_volume(ctx: &Context, p: PathArg) -> Result<InspectVolumeResult, ToolError> {
    let report = volumes::inspect_volume(&p.path)?;
    let volume = ctx
        .hedge
        .host()
        .volumes()
        .unwrap_or_default()
        .into_iter()
        .find(|v| trimmed(&v.mount_point) == trimmed(&p.path));
    Ok(InspectVolumeResult { report, volume })
}

fn environment(ctx: &Context, _: NoParams) -> Result<EnvironmentResult, ToolError> {
    let host = ctx.hedge.host();
    let python = python_env::find_python(host)?;
    let matches =
        python.as_ref().and_then(|p| p.hedgebuddy.as_deref()) == Some(env!("CARGO_PKG_VERSION"));
    let apps: Vec<EnvironmentApp> = ctx
        .hedge
        .apps()?
        .into_iter()
        .map(|a| EnvironmentApp {
            id: a.id,
            installed: a.installed,
            version: a.version,
            warnings: a.warnings,
        })
        .collect();
    Ok(EnvironmentResult {
        version: env!("CARGO_PKG_VERSION").to_owned(),
        os: host.os(),
        data_dir: ctx.store.root().to_path_buf(),
        active_profile: ctx.store.active_profile_name()?,
        catalog: CatalogState {
            overridden: ctx.hedge.catalog().overridden().to_vec(),
            error: ctx.catalog_error.clone(),
        },
        python,
        python_package_matches: matches,
        apps,
    })
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::host::VolumeInfo;
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use crate::{call, test_ctx};

    #[test]
    fn runs_are_listed_newest_first_and_missing_runs_are_errors() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let today = jiff::Zoned::now().date().to_string();
        std::fs::create_dir_all(ctx.store.runs_dir()).unwrap();
        std::fs::write(
            ctx.store.runs_dir().join(format!("{today}.jsonl")),
            format!(
                "{{\"ts\":\"{today}T10:00:00Z\",\"run_id\":\"a\",\"phase\":\"start\",\"script\":\"x.py\",\"profile\":\"p\"}}\n{{\"ts\":\"{today}T11:00:00Z\",\"run_id\":\"b\",\"phase\":\"start\",\"script\":\"y.py\",\"profile\":\"p\"}}\n"
            ),
        )
        .unwrap();
        let runs = call(&ctx, "list_runs", json!({})).unwrap();
        assert_eq!(runs["runs"][0]["run_id"], "b");
        assert_eq!(
            call(&ctx, "list_runs", json!({"script": "x.py"})).unwrap()["runs"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            call(&ctx, "get_run", json!({"run_id": "a"})).unwrap()["script"],
            "x.py"
        );
        assert!(call(&ctx, "get_run", json!({"run_id": "zzz"}))
            .unwrap_err()
            .0
            .contains("not found"));
    }

    #[test]
    fn volumes_are_listed_and_inspected_with_their_info() {
        let card = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(card.path().join("PRIVATE/M4ROOT/CLIP")).unwrap();
        std::fs::write(card.path().join("PRIVATE/M4ROOT/CLIP/C0001.MP4"), [0u8; 4]).unwrap();
        let info = VolumeInfo {
            name: "A003".into(),
            mount_point: card.path().to_path_buf(),
            file_system: "exFAT".into(),
            total_bytes: 1000,
            available_bytes: 10,
            removable: true,
        };
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows).with_volume(info));
        assert_eq!(
            call(&ctx, "list_volumes", json!({})).unwrap()["volumes"][0]["name"],
            "A003"
        );
        let out = call(&ctx, "inspect_volume", json!({"path": card.path()})).unwrap();
        assert_eq!(out["report"]["card"]["kind"], "sony");
        assert_eq!(out["report"]["clip_count"], 1);
        assert_eq!(out["volume"]["file_system"], "exFAT");
    }

    #[test]
    fn environment_reports_version_catalog_and_apps() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let env = call(&ctx, "environment", json!({})).unwrap();
        assert_eq!(env["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(env["os"], "windows");
        assert_eq!(env["catalog"]["error"], serde_json::Value::Null);
        assert_eq!(env["python"], serde_json::Value::Null);
        assert_eq!(env["python_package_matches"], false);
        assert_eq!(env["apps"].as_array().unwrap().len(), 4);
    }
}
