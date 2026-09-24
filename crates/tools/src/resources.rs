//! MCP resources and the `author_script` prompt, as plain functions so they
//! can be tested without a server.

use crate::{Context, ToolError};

const SCHEMAS: [(&str, &str); 8] = [
    (
        "hedgebuddy",
        include_str!("../../../schema/hedgebuddy.schema.json"),
    ),
    (
        "profile",
        include_str!("../../../schema/profile.schema.json"),
    ),
    (
        "secrets",
        include_str!("../../../schema/secrets.schema.json"),
    ),
    (
        "profile-export",
        include_str!("../../../schema/profile-export.schema.json"),
    ),
    (
        "run-record",
        include_str!("../../../schema/run-record.schema.json"),
    ),
    (
        "script-manifest",
        include_str!("../../../schema/script-manifest.schema.json"),
    ),
    (
        "activity-record",
        include_str!("../../../schema/activity-record.schema.json"),
    ),
    (
        "preferences",
        include_str!("../../../schema/preferences.schema.json"),
    ),
];

const HEDGE_LLMS: &str = "Hedge's own documentation for AI agents: https://docs.hedge.video/llms.txt\nOffShoot automation: https://docs.hedge.video/offshoot/features/automation\n";

/// One readable resource.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourceInfo {
    pub uri: String,
    pub name: String,
    pub description: String,
    pub mime_type: &'static str,
}

/// Every resource: one per catalog app, one per schema, and the Hedge docs pointer.
pub fn list(ctx: &Context) -> Vec<ResourceInfo> {
    let mut out: Vec<ResourceInfo> = ctx
        .hedge
        .catalog()
        .apps()
        .map(|m| ResourceInfo {
            uri: format!("hedgebuddy://catalog/{}", m.app.id),
            name: format!("{} catalog entry", m.app.name),
            description: format!(
                "Events, payload keys, commands and files HedgeBuddy knows for {}.",
                m.app.name
            ),
            mime_type: "application/json",
        })
        .collect();
    out.extend(SCHEMAS.iter().map(|(name, _)| ResourceInfo {
        uri: format!("hedgebuddy://schema/{name}"),
        name: format!("{name} schema"),
        description: format!("JSON Schema of HedgeBuddy's {name} format."),
        mime_type: "application/schema+json",
    }));
    out.push(ResourceInfo {
        uri: "hedgebuddy://docs/hedge-llms".into(),
        name: "Hedge documentation".into(),
        description: "Where Hedge publishes documentation for AI agents.".into(),
        mime_type: "text/plain",
    });
    out
}

/// The content of a resource, or `None` for an unknown URI.
pub fn read(ctx: &Context, uri: &str) -> Option<(&'static str, String)> {
    if let Some(id) = uri.strip_prefix("hedgebuddy://catalog/") {
        let m = ctx.hedge.catalog().app(id).ok()?;
        return Some(("application/json", serde_json::to_string_pretty(m).ok()?));
    }
    if let Some(name) = uri.strip_prefix("hedgebuddy://schema/") {
        return SCHEMAS
            .iter()
            .find(|(n, _)| *n == name)
            .map(|(_, text)| ("application/schema+json", (*text).to_owned()));
    }
    (uri == "hedgebuddy://docs/hedge-llms").then(|| ("text/plain", HEDGE_LLMS.to_owned()))
}

/// The Python source of a new script for `app`'s `event`: the manifest
/// docstring, and a `main` listing the payload fields.
pub(crate) fn script_template_source(
    ctx: &Context,
    app: &str,
    event: &str,
) -> Result<String, ToolError> {
    let m = ctx.hedge.catalog().app(app)?;
    let e = m.event(event)?;
    let prefix = format!("{}_", e.id);
    let mut fields = String::new();
    for key in &e.payload {
        let attr = key.strip_prefix(&prefix).unwrap_or(key);
        let json = if e.json_fields.contains(key) {
            "  (JSON, decoded for you)"
        } else {
            ""
        };
        fields.push_str(&format!("#   event.{attr:<28} <- {key}{json}\n"));
    }
    if fields.is_empty() {
        fields.push_str("#   (this event has no payload)\n");
    }
    Ok(format!(
        "\"\"\"\n{{\"hedgebuddy\": 1, \"app\": \"{app}\", \"event\": \"{event}\", \"requires\": {{}}}}\n---\n\
Describe what this script does.\n\"\"\"\nimport hedgebuddy as hb\n\n\n@hb.script\ndef main(event, vars):\n\
    # Payload fields for {name} {event}:\n{fields}\
    # Variables declared in \"requires\" are available as vars.NAME, typed.\n\
    hb.log(\"started\")\n    return 0\n",
        name = m.app.name,
    ))
}

/// A starting point for a script handling `app`'s `event`.
pub fn author_script(ctx: &Context, app: &str, event: &str) -> Result<String, ToolError> {
    let m = ctx.hedge.catalog().app(app)?;
    let e = m.event(event)?;
    let source = script_template_source(ctx, app, event)?;
    let fence = "`".repeat(3);
    Ok(format!(
        "Write a HedgeBuddy script for {name} event {event}: {description}\n\n\
Save it with write_script, set any required variables with set_var, check it with check_script, \
then attach it with attach_script (dry_run first). The hedgebuddy package must be installed for \
the Python the Hedge apps use; check_script reports it. Template:\n\n\
{fence}python\n{source}{fence}\n\n\
List every variable the script reads in \"requires\" as {{\"NAME\": {{\"type\": \"string\"}}}} \
(types: string, secret, int, float, bool, path, url, string[], path[]; add \"default\" to make one optional).\n",
        name = m.app.name,
        description = e.description,
    ))
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::{FakeHost, Os};

    use super::*;
    use crate::test_ctx;

    #[test]
    fn resources_cover_catalog_schemas_and_docs() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let all = list(&ctx);
        assert_eq!(all.len(), 13);
        let (mime, text) = read(&ctx, "hedgebuddy://catalog/offshoot").unwrap();
        assert_eq!(mime, "application/json");
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["app"]["id"], "offshoot");
        assert!(read(&ctx, "hedgebuddy://schema/profile")
            .unwrap()
            .1
            .contains("HedgeBuddy profile"));
        assert!(read(&ctx, "hedgebuddy://docs/hedge-llms")
            .unwrap()
            .1
            .contains("llms.txt"));
        assert!(read(&ctx, "hedgebuddy://schema/nope").is_none());
        assert!(read(&ctx, "https://example.com").is_none());
        for r in &all {
            assert!(read(&ctx, &r.uri).is_some(), "{} does not read", r.uri);
        }
    }

    #[test]
    fn the_template_source_is_a_valid_script_for_its_event() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let source = script_template_source(&ctx, "offshoot", "FileCopyCompleted").unwrap();
        let manifest = hedgebuddy_core::parse_manifest(&source).unwrap().unwrap();
        assert_eq!(manifest.app.as_deref(), Some("offshoot"));
        assert_eq!(manifest.event.as_deref(), Some("FileCopyCompleted"));
        assert!(source.contains("@hb.script"));
        assert!(author_script(&ctx, "offshoot", "FileCopyCompleted")
            .unwrap()
            .contains(&source));
        assert!(script_template_source(&ctx, "offshoot", "Nope").is_err());
    }

    #[test]
    fn author_script_template_lists_payload_fields() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let t = author_script(&ctx, "offshoot", "FileCopyCompleted").unwrap();
        assert!(t.contains("\"app\": \"offshoot\", \"event\": \"FileCopyCompleted\""));
        assert!(t.contains("event.destinationPath"));
        assert!(t.contains("FileCopyCompleted_sourceInfo  (JSON, decoded for you)"));
        assert!(t.contains("@hb.script"));
        assert!(author_script(&ctx, "offshoot", "OffShootStarted")
            .unwrap()
            .contains("no payload"));
        assert!(author_script(&ctx, "offshoot", "Nope").is_err());
    }
}
