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

/// The Python snippet [`find_python`] runs (public so front ends can fake its
/// output in tests).
pub const PROBE: &str = "import json, sys\ntry:\n    from importlib import metadata\n    v = metadata.version('hedgebuddy')\nexcept Exception:\n    v = None\nprint(json.dumps({'executable': sys.executable, 'version': '%d.%d.%d' % tuple(sys.version_info[:3]), 'hedgebuddy': v}))\n";

/// The Python snippet [`syntax_check`] runs; it compiles without executing.
/// Compiles (never runs) the script, reading bytes so a BOM or coding cookie
/// is honoured. `compile` also rejects code `ast.parse` accepts, such as a
/// top-level `return` or a `break` outside a loop.
pub const SYNTAX_CHECK: &str = "import sys\nsrc = open(sys.argv[1], 'rb').read()\ncompile(src, sys.argv[1], 'exec', dont_inherit=True)\n";

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

/// Whether `source` imports the `hedgebuddy` package: a line starting with
/// `import hedgebuddy` or `from hedgebuddy` (followed by the end of the line,
/// whitespace, `.` or `,`).
pub fn imports_hedgebuddy(source: &str) -> bool {
    source.lines().map(str::trim_start).any(|line| {
        let rest = line
            .strip_prefix("import hedgebuddy")
            .or_else(|| line.strip_prefix("from hedgebuddy"));
        matches!(rest, Some(r) if r.is_empty() || r.starts_with([' ', '\t', '.', ',']))
    })
}

/// Why a script importing `hedgebuddy` would fail with `python`, or `None`
/// when the installed package is exactly `expected`.
pub fn package_problem(python: &PythonInfo, expected: &str) -> Option<String> {
    let install = format!(
        "{} -m pip install hedgebuddy=={expected}",
        python.launcher.join(" ")
    );
    let exe = python.executable.display();
    match python.hedgebuddy.as_deref() {
        Some(v) if v == expected => None,
        Some(v) => Some(format!(
            "hedgebuddy {v} is installed for {exe}, but this HedgeBuddy needs {expected}; run: {install}"
        )),
        None => Some(format!(
            "hedgebuddy is not installed for {exe}; run: {install}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::{CommandOutput, FakeHost};

    #[test]
    fn detects_hedgebuddy_imports() {
        assert!(imports_hedgebuddy("import hedgebuddy as hb\n"));
        assert!(imports_hedgebuddy("  from hedgebuddy import script\n"));
        assert!(imports_hedgebuddy("import hedgebuddy\n"));
        assert!(imports_hedgebuddy("from hedgebuddy._runs import log\n"));
        assert!(!imports_hedgebuddy("import hedgebuddyx\n"));
        assert!(!imports_hedgebuddy("print('import hedgebuddy')\n"));
        assert!(!imports_hedgebuddy("import os\n"));
    }

    #[test]
    fn package_problem_explains_missing_and_mismatched_versions() {
        let info = |v: Option<&str>| PythonInfo {
            launcher: vec!["py".into(), "-3".into()],
            executable: PathBuf::from("C:\\Python313\\python.exe"),
            version: "3.13.5".into(),
            hedgebuddy: v.map(str::to_owned),
        };
        assert_eq!(package_problem(&info(Some("0.11.0")), "0.11.0"), None);
        let missing = package_problem(&info(None), "0.11.0").unwrap();
        assert!(missing.contains("not installed"), "{missing}");
        assert!(
            missing.contains("py -3 -m pip install hedgebuddy==0.11.0"),
            "{missing}"
        );
        let old = package_problem(&info(Some("0.10.0")), "0.11.0").unwrap();
        assert!(
            old.contains("0.10.0") && old.contains("needs 0.11.0"),
            "{old}"
        );
    }

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
