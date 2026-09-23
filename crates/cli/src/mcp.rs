//! The MCP server: an `rmcp` `ServerHandler` over `hedgebuddy_tools`'
//! [`tools`] and [`resources`]. Nothing here contains HedgeBuddy logic.

use std::sync::Arc;

use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, GetPromptRequestParams,
    GetPromptResponse, GetPromptResult, Implementation, ListPromptsResult, ListResourcesResult,
    ListToolsResult, PaginatedRequestParams, Prompt, PromptArgument, PromptMessage,
    ReadResourceRequestParams, ReadResourceResponse, ReadResourceResult, Resource,
    ResourceContents, Role, ServerCapabilities, ServerConfig, Tool, ToolAnnotations,
};
use rmcp::service::RequestContext;
use rmcp::{ErrorData as McpError, RoleServer, ServerHandler, ServiceExt};

use hedgebuddy_tools::{self as tools, resources, Context};

const INSTRUCTIONS: &str = "HedgeBuddy manages variables, profiles and Python scripts for Hedge apps (OffShoot, FoolCat, EditReady, Canister) and drives those apps through their URL commands. Secret values are masked; pass reveal only when the operator explicitly asks to see one. Tools that change a Hedge app's settings, run app commands, or delete something accept dry_run: run them with dry_run first and show the operator the result before applying. run_app_command refuses commands that need confirmation until it is called with confirmed: true after the operator agrees. Start with environment and list_apps; describe_app lists each app's events, payload keys and commands; the author_script prompt gives a script template.";

/// The HedgeBuddy MCP server.
#[derive(Clone)]
pub struct Server {
    ctx: Arc<Context>,
}

impl Server {
    /// A server over a tool context.
    pub fn new(ctx: Arc<Context>) -> Server {
        Server { ctx }
    }
}

fn tool_list() -> Vec<Tool> {
    let object = |v: serde_json::Value| match v {
        serde_json::Value::Object(map) => map,
        _ => serde_json::Map::new(),
    };
    tools::all()
        .into_iter()
        .map(|t| {
            Tool::new(t.name, t.description, Arc::new(object((t.schema)())))
                .with_raw_output_schema(Arc::new(object((t.output_schema)())))
                .with_annotations(
                    ToolAnnotations::new()
                        .read_only(t.hints.read_only)
                        .destructive(t.hints.destructive)
                        .idempotent(t.hints.idempotent)
                        .open_world(false),
                )
        })
        .collect()
}

impl ServerHandler for Server {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .enable_prompts()
                .build(),
        )
        .with_server_info(Implementation::new("hedgebuddy", env!("CARGO_PKG_VERSION")))
        .with_instructions(INSTRUCTIONS)
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult::with_all_items(tool_list()))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, McpError> {
        let name = request.name.to_string();
        if !tools::all().iter().any(|t| t.name == name) {
            return Err(McpError::invalid_params(
                format!("unknown tool '{name}'"),
                None,
            ));
        }
        let args = request
            .arguments
            .map(serde_json::Value::Object)
            .unwrap_or(serde_json::Value::Null);
        let ctx = self.ctx.clone();
        let result = tokio::task::spawn_blocking(move || tools::call(&ctx, &name, args))
            .await
            .map_err(|e| McpError::internal_error(format!("tool panicked: {e}"), None))?;
        let result = match result {
            Ok(value) => {
                let mut ok = CallToolResult::success(vec![ContentBlock::text(
                    serde_json::to_string_pretty(&value).expect("JSON values serialize"),
                )]);
                ok.structured_content = Some(value);
                ok
            }
            Err(e) => CallToolResult::error(vec![ContentBlock::text(e.0)]),
        };
        Ok(result.into())
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        let items = resources::list(&self.ctx)
            .into_iter()
            .map(|r| {
                Resource::new(r.uri, r.name)
                    .with_description(r.description)
                    .with_mime_type(r.mime_type)
            })
            .collect();
        Ok(ListResourcesResult::with_all_items(items))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, McpError> {
        let (mime, text) = resources::read(&self.ctx, &request.uri).ok_or_else(|| {
            McpError::resource_not_found(format!("unknown resource {}", request.uri), None)
        })?;
        let contents = ResourceContents::text(text, request.uri).with_mime_type(mime);
        Ok(ReadResourceResult::new(vec![contents]).into())
    }

    async fn list_prompts(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListPromptsResult, McpError> {
        let arg = |name: &str, description: &str| {
            PromptArgument::new(name)
                .with_description(description)
                .with_required(true)
        };
        Ok(ListPromptsResult::with_all_items(vec![Prompt::new(
            "author_script",
            Some("A template for a HedgeBuddy script handling one Hedge app event, with its payload fields."),
            Some(vec![
                arg("app", "Catalog app id, e.g. offshoot"),
                arg("event", "Event id, e.g. FileCopyCompleted"),
            ]),
        )]))
    }

    async fn get_prompt(
        &self,
        request: GetPromptRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<GetPromptResponse, McpError> {
        if request.name != "author_script" {
            return Err(McpError::invalid_params(
                format!("unknown prompt '{}'", request.name),
                None,
            ));
        }
        let args = request.arguments.unwrap_or_default();
        let get = |k: &str| args.get(k).and_then(|v| v.as_str()).map(str::to_owned);
        let (Some(app), Some(event)) = (get("app"), get("event")) else {
            return Err(McpError::invalid_params(
                "author_script needs app and event",
                None,
            ));
        };
        let text = resources::author_script(&self.ctx, &app, &event)
            .map_err(|e| McpError::invalid_params(e.0, None))?;
        Ok(
            GetPromptResult::new(vec![PromptMessage::new_text(Role::User, text)])
                .with_description(format!("Script template for {app} {event}"))
                .into(),
        )
    }
}

/// Serve MCP over stdin/stdout until the client disconnects.
pub async fn serve(ctx: Arc<Context>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let service = Server::new(ctx).serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}
