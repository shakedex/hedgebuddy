//! `hedgebuddy` command line. Every subcommand is a thin call into
//! `hedgebuddy_cli` / `hedgebuddy_core`; no logic lives here.

use std::io::Read;
use std::process::ExitCode;
use std::time::Duration;

use clap::{Parser, Subcommand};
use hedgebuddy_cli::tools::{self, Context};
use serde_json::Value;

#[derive(Parser)]
#[command(
    name = "hedgebuddy",
    version,
    about = "HedgeBuddy command line",
    arg_required_else_help = true
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Print environment information (data directory and overrides in effect)
    Env,
    /// List every tool `call` and MCP clients can use
    Tools,
    /// Run one tool with JSON arguments ("-" reads them from stdin) and print its JSON result
    Call {
        /// Tool name, as listed by `hedgebuddy tools`
        tool: String,
        /// JSON object of arguments, or "-" to read them from stdin
        #[arg(default_value = "{}")]
        args: String,
    },
    /// Serve MCP over stdio (for Claude Desktop, Claude Code, and other MCP clients)
    Mcp,
}

fn main() -> ExitCode {
    match Cli::parse().command {
        Command::Env => match hedgebuddy_core::data_dir() {
            Ok(dir) => {
                println!("data_dir={}", dir.display());
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("error: {e}");
                ExitCode::FAILURE
            }
        },
        Command::Tools => {
            for t in tools::all() {
                println!("{:<24} {}", t.name, t.description);
            }
            ExitCode::SUCCESS
        }
        Command::Call { tool, args } => run_call(&tool, &args),
        Command::Mcp => run_mcp(),
    }
}

/// Serve MCP over stdio. Nothing here may print to stdout: it carries only
/// protocol messages, so diagnostics go to stderr.
fn run_mcp() -> ExitCode {
    let ctx = match Context::real() {
        Ok(c) => std::sync::Arc::new(c),
        Err(e) => {
            eprintln!("error: {e}");
            return ExitCode::FAILURE;
        }
    };
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("error: cannot start the async runtime: {e}");
            return ExitCode::FAILURE;
        }
    };
    let served = runtime.block_on(hedgebuddy_cli::mcp::serve(ctx));
    // tokio reads stdin on a blocking thread that can't be cancelled; if the
    // server stops while a read is pending (the client still holds stdin
    // open), dropping the runtime would wait for that read forever.
    runtime.shutdown_timeout(Duration::from_secs(1));
    match served {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run_call(tool: &str, args: &str) -> ExitCode {
    let text = if args == "-" {
        let mut buf = String::new();
        if let Err(e) = std::io::stdin().read_to_string(&mut buf) {
            eprintln!("error: cannot read arguments from stdin: {e}");
            return ExitCode::FAILURE;
        }
        buf
    } else {
        args.to_owned()
    };
    let args: Value = match serde_json::from_str(if text.trim().is_empty() { "{}" } else { &text })
    {
        Ok(v) => v,
        Err(e) => {
            eprintln!("error: arguments are not JSON: {e}");
            return ExitCode::FAILURE;
        }
    };
    let ctx = match Context::real() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("error: {e}");
            return ExitCode::FAILURE;
        }
    };
    match tools::call(&ctx, tool, args) {
        Ok(v) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&v).expect("JSON values serialize")
            );
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::FAILURE
        }
    }
}
