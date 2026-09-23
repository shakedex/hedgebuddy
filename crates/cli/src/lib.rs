//! The HedgeBuddy tool layer and MCP server. The `hedgebuddy` binary is a thin
//! wrapper over this library; every tool is defined once in [`tools`] and
//! reached both from `hedgebuddy call` and from MCP clients.

pub mod mcp;
pub mod resources;
pub mod tools;
