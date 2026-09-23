//! The `hedgebuddy` binary's library: the MCP server over the shared tool
//! layer in `hedgebuddy_tools`. Every tool is defined once there and reached
//! both from `hedgebuddy call` and from MCP clients.

pub mod mcp;
