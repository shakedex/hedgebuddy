//! The Python interpreter Hedge apps run scripts with: finding it, checking
//! whether the `hedgebuddy` package is installed in it, and syntax-checking
//! scripts without running them.
//!
//! Hedge apps start scripts with the `py` launcher on Windows and `python3`
//! on macOS (the exact macOS interpreter OffShoot resolves is unverified).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::host::{Host, Os};

pub(crate) const PROBE: &str = "import json, sys\ntry:\n    from importlib import metadata\n    v = metadata.version('hedgebuddy')\nexcept Exception:\n    v = None\nprint(json.dumps({'executable': sys.executable, 'version': '%d.%d.%d' % tuple(sys.version_info[:3]), 'hedgebuddy': v}))\n";

pub(crate) const SYNTAX_CHECK: &str =
    "import ast, sys\nsrc = open(sys.argv[1], 'rb').read()\nast.parse(src, sys.argv[1])\n";

/// The interpreter Hedge apps use.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PythonInfo {
    pub launcher: Vec<String>,
    pub executable: PathBuf,
    pub version: String,
    pub hedgebuddy: Option<String>,
}

/// The command Hedge apps use to start Python on `os`.
pub fn launcher(os: Os) -> Vec<&'static str> {
    match os {
        Os::Windows => vec!["py", "-3"],
        Os::Macos => vec!["python3"],
    }
}

/// Find the interpreter and the installed `hedgebuddy` version, if any.
pub fn find_python(host: &dyn Host) -> Result<Option<PythonInfo>> {
    #[derive(Deserialize)]
    struct Probe {
        executable: PathBuf,
        version: String,
        hedgebuddy: Option<String>,
    }
    let command = launcher(host.os());
    let mut args: Vec<&str> = command[1..].to_vec();
    args.extend(["-c", PROBE]);
    let Ok(out) = host.run(command[0], &args) else {
        return Ok(None);
    };
    if out.status != 0 {
        return Ok(None);
    }
    let Some(line) = out.stdout.lines().rev().find(|l| !l.trim().is_empty()) else {
        return Ok(None);
    };
    let Ok(probe) = serde_json::from_str::<Probe>(line.trim()) else {
        return Ok(None);
    };
    Ok(Some(PythonInfo {
        launcher: command.iter().map(|s| s.to_string()).collect(),
        executable: probe.executable,
        version: probe.version,
        hedgebuddy: probe.hedgebuddy,
    }))
}

/// Parse `script` with `python` without running it. `None` means valid.
pub fn syntax_check(host: &dyn Host, python: &Path, script: &Path) -> Result<Option<String>> {
    let python = python.to_string_lossy();
    let script = script.to_string_lossy();
    let out = host.run(&python, &["-c", SYNTAX_CHECK, &script])?;
    if out.status == 0 {
        return Ok(None);
    }
    let message = out
        .stderr
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("syntax check failed")
        .trim()
        .to_owned();
    Ok(Some(message))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::{CommandOutput, FakeHost};

    fn ok(stdout: &str) -> CommandOutput {
        CommandOutput {
            status: 0,
            stdout: stdout.into(),
            stderr: String::new(),
        }
    }

    #[test]
    fn finds_python_through_the_platform_launcher() {
        let win = FakeHost::new(Os::Windows).with_run_response(
            "py",
            &["-3", "-c", PROBE],
            ok("{\"executable\": \"C:\\\\Python313\\\\python.exe\", \"version\": \"3.13.5\", \"hedgebuddy\": \"0.11.0\"}\n"),
        );
        let info = find_python(&win).unwrap().unwrap();
        assert_eq!(info.launcher, vec!["py", "-3"]);
        assert_eq!(info.executable, PathBuf::from("C:\\Python313\\python.exe"));
        assert_eq!(info.version, "3.13.5");
        assert_eq!(info.hedgebuddy.as_deref(), Some("0.11.0"));

        let mac = FakeHost::new(Os::Macos).with_run_response(
            "python3",
            &["-c", PROBE],
            ok("noise\n{\"executable\": \"/usr/bin/python3\", \"version\": \"3.9.6\", \"hedgebuddy\": null}\n"),
        );
        let info = find_python(&mac).unwrap().unwrap();
        assert_eq!(info.launcher, vec!["python3"]);
        assert_eq!(info.hedgebuddy, None);
    }

    #[test]
    fn missing_failing_or_garbled_python_is_none() {
        assert_eq!(find_python(&FakeHost::new(Os::Windows)).unwrap(), None);
        let failing = FakeHost::new(Os::Windows).with_run_response(
            "py",
            &["-3", "-c", PROBE],
            CommandOutput {
                status: 103,
                stdout: String::new(),
                stderr: "No suitable Python runtime found".into(),
            },
        );
        assert_eq!(find_python(&failing).unwrap(), None);
        let garbled = FakeHost::new(Os::Windows).with_run_response(
            "py",
            &["-3", "-c", PROBE],
            ok("not json"),
        );
        assert_eq!(find_python(&garbled).unwrap(), None);
    }

    #[test]
    fn syntax_check_reports_the_error_line() {
        let host = FakeHost::new(Os::Macos)
            .with_run_response("/usr/bin/python3", &["-c", SYNTAX_CHECK, "/s/good.py"], ok(""))
            .with_run_response(
                "/usr/bin/python3",
                &["-c", SYNTAX_CHECK, "/s/bad.py"],
                CommandOutput {
                    status: 1,
                    stdout: String::new(),
                    stderr: "  File \"/s/bad.py\", line 2\n    x =\n       ^\nSyntaxError: invalid syntax\n".into(),
                },
            );
        let py = Path::new("/usr/bin/python3");
        assert_eq!(
            syntax_check(&host, py, Path::new("/s/good.py")).unwrap(),
            None
        );
        assert_eq!(
            syntax_check(&host, py, Path::new("/s/bad.py"))
                .unwrap()
                .as_deref(),
            Some("SyntaxError: invalid syntax")
        );
        assert!(syntax_check(&host, py, Path::new("/s/unknown.py")).is_err());
    }
}
