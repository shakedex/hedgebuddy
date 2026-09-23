<p align="center">
  <img src="branding/github.png" alt="HedgeBuddy" width="640" />
</p>

# HedgeBuddy

HedgeBuddy is a small setup tool for DITs who automate Hedge's apps (OffShoot, FoolCat, EditReady, Canister) with Python scripts. It stores the variables and profiles those scripts read, keeps the scripts per profile, attaches them to Hedge app events, and exposes all of that to AI agents through an MCP server.

**Status:** being rebuilt from scratch. This branch is the 0.11 line. The previous Go/Fyne app and 0.10 Python library are archived under the git tag `legacy/0.10.0` and are not compatible with anything here.

## Layout

| Path | What it is |
|---|---|
| `crates/core` | All logic: storage, profiles, catalog, Hedge app integration |
| `crates/cli` | The `hedgebuddy` binary; `hedgebuddy mcp` serves MCP over stdio |
| `crates/app` | Tauri 2 desktop app; frontend in `crates/app/ui` |
| `python` | Pure-Python `hedgebuddy` package that scripts import |
| `schema` | JSON Schemas and fixtures shared by the Rust and Python test suites |
| `docs/superpowers/specs` | Design specs |

## Use it from Claude (MCP)

Build and install the binary (it lands in `~/.cargo/bin`, which rustup puts on PATH):

```bash
cargo install --path crates/cli
hedgebuddy tools
```

**Claude Code:**

```bash
claude mcp add hedgebuddy -- hedgebuddy mcp
```

**Claude Desktop:** add this to `claude_desktop_config.json` (`%APPDATA%\Claude\` on Windows, `~/Library/Application Support/Claude/` on macOS), using the full path to the binary if `hedgebuddy` is not on the PATH Claude Desktop sees, then restart Claude Desktop:

```json
{
  "mcpServers": {
    "hedgebuddy": { "command": "hedgebuddy", "args": ["mcp"] }
  }
}
```

**From a shell:** every MCP tool also runs as `hedgebuddy call <tool> '<json arguments>'` (or `-` to read the arguments from stdin), for example `hedgebuddy call list_apps`.

Tools that change a Hedge app's settings or start transfers take `dry_run`, and commands that start transfers need `confirmed: true`, so the agent shows you the plan first.

## Development

```bash
# Rust (build the frontend first; the app crate embeds it)
cd crates/app/ui && bun install && bun run build && cd ../../..
cargo test --workspace

# Python
cd python && uv sync && uv run pytest
```

## License

MIT. HedgeBuddy is an independent, open-source project, not affiliated with Hedge (hedge.co).
