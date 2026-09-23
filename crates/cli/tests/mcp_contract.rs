//! Speaks raw JSON-RPC (newline-delimited, MCP stdio transport) to
//! `hedgebuddy mcp`, so the test depends on the protocol, not on any SDK's
//! client API. Only tools that touch the data directory or the catalog are
//! called, so the test never changes the real machine.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

use serde_json::{json, Value};

struct Client {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<String>,
    next_id: u64,
}

impl Client {
    fn start(data_dir: &std::path::Path) -> Client {
        let mut child = Command::new(env!("CARGO_BIN_EXE_hedgebuddy"))
            .arg("mcp")
            .env("HEDGEBUDDY_DATA_DIR", data_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("hedgebuddy mcp starts");
        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let (tx, lines) = channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if tx.send(line).is_err() {
                    break;
                }
            }
        });
        Client {
            child,
            stdin,
            lines,
            next_id: 1,
        }
    }

    fn send(&mut self, msg: Value) {
        writeln!(self.stdin, "{msg}").unwrap();
        self.stdin.flush().unwrap();
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        self.send(json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params}));
        loop {
            let line = self
                .lines
                .recv_timeout(Duration::from_secs(20))
                .expect("server answered in time");
            let msg: Value = serde_json::from_str(&line)
                .unwrap_or_else(|e| panic!("stdout is not JSON-RPC ({e}): {line}"));
            if msg["id"] == json!(id) {
                return msg;
            }
        }
    }

    fn call_tool(&mut self, name: &str, args: Value) -> Value {
        let msg = self.request("tools/call", json!({"name": name, "arguments": args}));
        msg["result"].clone()
    }
}

fn text_json(result: &Value) -> Value {
    serde_json::from_str(result["content"][0]["text"].as_str().expect("text content"))
        .expect("JSON text")
}

#[test]
fn mcp_server_speaks_the_protocol() {
    let dir = tempfile::tempdir().unwrap();
    let mut c = Client::start(dir.path());

    let init = c.request(
        "initialize",
        json!({"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "contract-test", "version": "0"}}),
    );
    let result = &init["result"];
    assert!(
        result["serverInfo"]["name"]
            .as_str()
            .unwrap()
            .contains("hedgebuddy"),
        "{init}"
    );
    for cap in ["tools", "resources", "prompts"] {
        assert!(
            result["capabilities"].get(cap).is_some(),
            "missing capability {cap}: {init}"
        );
    }
    assert!(result["instructions"]
        .as_str()
        .unwrap_or_default()
        .contains("dry_run"));
    c.send(json!({"jsonrpc": "2.0", "method": "notifications/initialized"}));

    let listed = c.request("tools/list", json!({}));
    let tools = listed["result"]["tools"].as_array().unwrap();
    let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    let expected: Vec<&str> = hedgebuddy_tools::all().iter().map(|t| t.name).collect();
    assert_eq!(names, expected);
    let by_name = |n: &str| tools.iter().find(|t| t["name"] == n).unwrap().clone();
    assert_eq!(
        by_name("delete_profile")["annotations"]["destructiveHint"],
        true
    );
    assert_eq!(
        by_name("list_profiles")["annotations"]["readOnlyHint"],
        true
    );
    assert_eq!(by_name("set_var")["inputSchema"]["type"], "object");
    for t in tools {
        assert_eq!(
            t["outputSchema"]["type"], "object",
            "{} has no object outputSchema",
            t["name"]
        );
    }

    let created = c.call_tool("create_profile", json!({"name": "p"}));
    assert_eq!(
        created["structuredContent"],
        text_json(&created),
        "{created}"
    );
    assert_ne!(created["isError"], true, "{created}");
    assert_eq!(text_json(&created)["active"], true);
    c.call_tool(
        "set_var",
        json!({"name": "HOOK", "type": "secret", "value": "https://hook"}),
    );
    let vars = text_json(&c.call_tool("list_vars", json!({})));
    assert_eq!(vars["variables"][0]["value"], "********");

    let missing = c.call_tool("get_var", json!({"name": "NOPE"}));
    assert!(
        missing.get("structuredContent").is_none(),
        "errors are text only: {missing}"
    );
    assert_eq!(missing["isError"], true, "{missing}");
    let unknown = c.request("tools/call", json!({"name": "nope", "arguments": {}}));
    assert!(unknown.get("error").is_some(), "{unknown}");

    let resources = c.request("resources/list", json!({}));
    let uris: Vec<&str> = resources["result"]["resources"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["uri"].as_str().unwrap())
        .collect();
    assert!(uris.contains(&"hedgebuddy://catalog/offshoot"), "{uris:?}");
    let schema = c.request(
        "resources/read",
        json!({"uri": "hedgebuddy://schema/profile"}),
    );
    assert!(schema["result"]["contents"][0]["text"]
        .as_str()
        .unwrap()
        .contains("HedgeBuddy profile"));

    let prompts = c.request("prompts/list", json!({}));
    assert!(prompts["result"]["prompts"]
        .as_array()
        .unwrap()
        .iter()
        .any(|p| p["name"] == "author_script"));
    let prompt = c.request(
        "prompts/get",
        json!({"name": "author_script", "arguments": {"app": "offshoot", "event": "DiskAdded"}}),
    );
    let text = prompt["result"]["messages"][0]["content"]["text"]
        .as_str()
        .unwrap();
    assert!(text.contains("DiskAdded_rootFilePath"), "{text}");

    drop(c.stdin);
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    loop {
        if let Some(status) = c.child.try_wait().unwrap() {
            assert!(status.success(), "server exited with {status}");
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "server did not exit after stdin closed"
        );
        std::thread::sleep(Duration::from_millis(100));
    }
}
