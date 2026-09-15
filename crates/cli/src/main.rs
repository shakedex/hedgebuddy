//! `hedgebuddy` command line. Every subcommand is a thin call into
//! `hedgebuddy_core`; no logic lives here.

use std::process::ExitCode;

use clap::{Parser, Subcommand};

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
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.command {
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
    }
}
