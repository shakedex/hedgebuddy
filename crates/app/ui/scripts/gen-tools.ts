/**
 * Generates src/api/tools.gen.ts from the Rust JSON Schemas:
 *   - `hedgebuddy tools --schemas`                          (every tool)
 *   - `cargo run -p hedgebuddy-tools --example app_schemas` (app-only commands)
 *
 *   bun scripts/gen-tools.ts           write the file
 *   bun scripts/gen-tools.ts --check   exit 1 when the committed file is stale
 *
 * A small converter for the JSON Schema subset schemars emits. Shared
 * definitions from all schemas land in one namespace; two different Rust
 * types with the same name are an error.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Schema = boolean | { [key: string]: any };
type Entry = { input: Schema; output: Schema };

const UI = resolve(import.meta.dir, "..");
const REPO = resolve(UI, "../../..");
const OUT = resolve(UI, "src/api/tools.gen.ts");

function cargoJson(args: string[]): Record<string, Entry> {
  const run = spawnSync("cargo", ["run", "--quiet", ...args], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) {
    process.stderr.write(run.stderr ?? "");
    throw new Error(`cargo run ${args.join(" ")} failed`);
  }
  return JSON.parse(run.stdout);
}

const pascal = (s: string) =>
  s
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
const camel = (s: string) => {
  const p = pascal(s);
  return p[0].toLowerCase() + p.slice(1);
};

const defs = new Map<string, { schema: Schema; from: string }>();

/** Stable JSON without prose, so two copies of one Rust type compare equal. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (key, v) => {
    if (key === "description" || key === "title") return undefined;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
    }
    return v;
  });
}

function register(schema: Schema, from: string) {
  if (typeof schema !== "object") return;
  const local: Record<string, Schema> = schema.$defs ?? schema.definitions ?? {};
  for (const [raw, def] of Object.entries(local)) {
    const name = pascal(raw);
    const seen = defs.get(name);
    if (!seen) defs.set(name, { schema: def, from });
    else if (canonical(seen.schema) !== canonical(def)) {
      throw new Error(
        `Two different Rust types are named ${name} (${seen.from}, ${from}); give one #[schemars(rename = "...")].`,
      );
    }
  }
}

function refName(ref: string): string {
  const m = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(ref);
  if (!m) throw new Error(`unsupported $ref ${ref}`);
  return pascal(decodeURIComponent(m[1]));
}

function doc(schema: Schema, indent: string): string {
  if (typeof schema !== "object" || typeof schema.description !== "string") return "";
  const text = schema.description
    .split("\n")
    .map((l: string) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\*\//g, "*\\/");
  return `${indent}/** ${text} */\n`;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function ts(schema: Schema, indent = ""): string {
  if (schema === true) return "unknown";
  if (schema === false) return "never";
  const s = schema;
  if (typeof s.$ref === "string") return refName(s.$ref);
  if ("const" in s) return JSON.stringify(s.const);
  if (Array.isArray(s.enum)) return s.enum.map((v: Json) => JSON.stringify(v)).join(" | ");
  const parts: string[] = [];
  const own = ownType(s, indent);
  if (own) parts.push(own);
  for (const key of ["oneOf", "anyOf"]) {
    if (Array.isArray(s[key])) parts.push(s[key].map((x: Schema) => ts(x, indent)).join(" | "));
  }
  if (Array.isArray(s.allOf)) for (const x of s.allOf) parts.push(ts(x, indent));
  if (parts.length === 0) return "unknown";
  if (parts.length === 1) return parts[0];
  return parts.map((p) => `(${p})`).join(" & ");
}

function ownType(s: { [key: string]: any }, indent: string): string | null {
  const types: string[] | undefined = Array.isArray(s.type)
    ? s.type
    : typeof s.type === "string"
      ? [s.type]
      : s.properties
        ? ["object"]
        : undefined;
  if (!types) return null;
  return types
    .map((t) => {
      switch (t) {
        case "null":
          return "null";
        case "string":
          return "string";
        case "integer":
        case "number":
          return "number";
        case "boolean":
          return "boolean";
        case "array":
          if (Array.isArray(s.prefixItems)) return `[${s.prefixItems.map((x: Schema) => ts(x, indent)).join(", ")}]`;
          return s.items === undefined || s.items === true ? "unknown[]" : `Array<${ts(s.items, indent)}>`;
        case "object":
          return objectType(s, indent);
        default:
          throw new Error(`unsupported JSON Schema type ${t}`);
      }
    })
    .join(" | ");
}

function objectType(s: { [key: string]: any }, indent: string): string {
  const props: Record<string, Schema> = s.properties ?? {};
  const required = new Set<string>(s.required ?? []);
  const inner = `${indent}  `;
  const lines = Object.entries(props).map(
    ([k, v]) =>
      `${doc(v, inner)}${inner}${IDENT.test(k) ? k : JSON.stringify(k)}${required.has(k) ? "" : "?"}: ${ts(v, inner)};`,
  );
  const extra = s.additionalProperties;
  if (extra !== undefined && extra !== false) {
    const value = lines.length ? "unknown" : ts(extra, inner);
    lines.push(`${inner}[key: string]: ${value};`);
  }
  if (lines.length === 0) return extra === false ? "Record<string, never>" : "Record<string, unknown>";
  return `{\n${lines.join("\n")}\n${indent}}`;
}

function takesNoArgs(schema: Schema): boolean {
  return typeof schema === "object" && (!schema.required || schema.required.length === 0);
}

function emit(tools: Record<string, Entry>, app: Record<string, Entry>): string {
  for (const [name, e] of Object.entries(tools)) {
    register(e.input, name);
    register(e.output, name);
  }
  for (const [name, e] of Object.entries(app)) {
    register(e.input, name);
    register(e.output, name);
  }
  const out: string[] = [
    "// Generated by scripts/gen-tools.ts from the Rust JSON Schemas. Do not edit by hand:",
    "// run `bun run gen` after changing a tool or app command, and commit the result.",
    "",
    'import { callApp, callTool } from "./bridge";',
    "",
  ];
  const group = (entries: Record<string, Entry>, map: string, alias: string, obj: string, call: string) => {
    const names = Object.keys(entries).sort();
    for (const name of names) {
      const e = entries[name];
      out.push(`${doc(e.input, "")}export type ${pascal(name)}Input = ${ts(e.input)};`, "");
      out.push(`${doc(e.output, "")}export type ${pascal(name)}Output = ${ts(e.output)};`, "");
    }
    out.push(`export interface ${map} {`);
    for (const name of names) out.push(`  ${name}: { input: ${pascal(name)}Input; output: ${pascal(name)}Output };`);
    out.push("}", "", `export type ${alias} = keyof ${map};`, "", `export const ${obj} = {`);
    for (const name of names) {
      const arg = takesNoArgs(entries[name].input)
        ? `args: ${pascal(name)}Input = {}`
        : `args: ${pascal(name)}Input`;
      out.push(`  ${camel(name)}: (${arg}) => ${call}("${name}", args),`);
    }
    out.push("} as const;", "");
  };
  group(tools, "ToolTypes", "ToolName", "tools", "callTool");
  group(app, "AppCommandTypes", "AppCommandName", "app", "callApp");
  for (const name of [...defs.keys()].sort()) {
    const { schema } = defs.get(name)!;
    out.push(`${doc(schema, "")}export type ${name} = ${ts(schema)};`, "");
  }
  return out.join("\n");
}

const text = emit(
  cargoJson(["-p", "hedgebuddy-cli", "--bin", "hedgebuddy", "--", "tools", "--schemas"]),
  cargoJson(["-p", "hedgebuddy-tools", "--example", "app_schemas"]),
);

if (process.argv.includes("--check")) {
  // Git on Windows may check the file out with CRLF line endings.
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== text) {
    console.error("src/api/tools.gen.ts is stale: run `bun run gen` in crates/app/ui and commit it.");
    process.exit(1);
  }
  console.log("src/api/tools.gen.ts is up to date");
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}`);
}
