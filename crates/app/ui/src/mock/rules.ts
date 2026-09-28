/**
 * Small JS ports of `hedgebuddy-core`'s rules, so the preview's screens meet the same verdicts the real
 * tools give: the script manifest (crates/core/src/manifest.rs), requirement checks, variable values
 * (variable.rs), and profile, variable and script names. Messages follow core's wording; a JSON syntax
 * error's text comes from the browser rather than serde.
 */
import type { Manifest, Requirement, RequirementIssue, VarType, Variable } from "@/api/tools.gen";

export const VAR_TYPES: readonly VarType[] = ["string", "secret", "int", "float", "bool", "path", "url", "string[]", "path[]"];

/** A rule violation; callers turn it into a tool error. */
export class ToolError extends Error {}

function isVarType(s: unknown): s is VarType {
  return typeof s === "string" && (VAR_TYPES as readonly string[]).includes(s);
}

/** `unknown variable type 'x'` unless `s` is one of the nine types. */
export function parseVarType(s: string): VarType {
  if (!isVarType(s)) throw new ToolError(`unknown variable type '${s}'`);
  return s;
}

/** `^[A-Z][A-Z0-9_]*$` */
export function validateVarName(name: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new ToolError(`variable name '${name}' must match ^[A-Z][A-Z0-9_]*$`);
}

/** `^[a-z0-9][a-z0-9-]{0,63}$` */
export function validateSlug(name: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new ToolError(`profile name '${name}' must match ^[a-z0-9][a-z0-9-]{0,63}$`);
}

const RESERVED = ["CON", "PRN", "AUX", "NUL", ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`COM${n}`, `LPT${n}`])];

/** A single file name ending in `.py`, usable on Windows and macOS. */
export function validateScriptName(name: string): void {
  const stem = name.endsWith(".py") ? name.slice(0, -3) : "";
  const forbidden = [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || '/\\:*?"<>|'.includes(c));
  const reserved = RESERVED.includes((name.split(".")[0] ?? name).toUpperCase());
  const bad =
    stem.trim() === "" || name.startsWith(".") || name.endsWith(".") || name.endsWith(" ") || name.includes("..") || forbidden || reserved;
  if (bad) throw new ToolError(`script name '${name}' must be a single file name ending in .py`);
}

/** Core's `Variable::typed` check of `value` against `ty` (a secret's value is checked as a string by callers). */
export function checkValue(ty: VarType, value: unknown, name = ""): void {
  const fail = (msg: string): never => {
    throw new ToolError(name ? `variable '${name}': ${msg}` : msg);
  };
  if (value === undefined || value === null) fail(`${ty} variables require a value`);
  const list = (nonEmpty: boolean) => {
    if (!Array.isArray(value)) fail("value must be an array of strings");
    for (const item of value as unknown[]) {
      if (typeof item !== "string") fail("every list item must be a string");
      if (nonEmpty && item === "") fail("list items must be non-empty");
    }
  };
  switch (ty) {
    case "secret":
    case "string":
      if (typeof value !== "string") fail("value must be a string");
      return;
    case "int":
      if (typeof value !== "number" || !Number.isSafeInteger(value)) fail("value must be an integer");
      return;
    case "float":
      if (typeof value !== "number" || !Number.isFinite(value)) fail("value must be a number");
      return;
    case "bool":
      if (typeof value !== "boolean") fail("value must be true or false");
      return;
    case "path":
      if (typeof value !== "string") fail("value must be a string path");
      if (value === "") fail("path must be non-empty");
      return;
    case "url":
      if (typeof value !== "string") fail("value must be a string URL");
      if (!(value as string).startsWith("http://") && !(value as string).startsWith("https://")) fail("url must start with http:// or https://");
      return;
    case "string[]":
      return list(false);
    case "path[]":
      return list(true);
  }
}

/** Rust's `str::lines`: split on `\n`, drop a trailing `\r`, no empty last line for a final newline. */
function lines(s: string): string[] {
  const out = s.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  if (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

/**
 * The text before the `---` line of the first `"""` or `'''` docstring, when that text begins with `{`.
 * Leading blank and comment lines are skipped, as is a leading BOM.
 */
export function extractManifestText(source: string): string | null {
  const src = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const all = lines(src);
  let first = 0;
  while (first < all.length && (all[first].trim() === "" || all[first].trimStart().startsWith("#"))) first++;
  const body = all.slice(first).join("\n");
  const quote = body.trimStart().startsWith('"""') ? '"""' : body.trimStart().startsWith("'''") ? "'''" : null;
  if (quote === null) return null;
  const start = body.indexOf(quote) + quote.length;
  const end = body.indexOf(quote, start);
  if (end < 0) return null;
  const doc = body.slice(start, end);
  if (!doc.trimStart().startsWith("{")) return null;
  const kept: string[] = [];
  for (const line of lines(doc)) {
    if (line.trimEnd() === "---") break;
    kept.push(line);
  }
  return kept.join("\n");
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function unknownField(obj: Record<string, unknown>, allowed: string[]): string | undefined {
  return Object.keys(obj).find((k) => !allowed.includes(k));
}

function expected(allowed: string[]): string {
  return allowed.map((k) => `\`${k}\``).join(", ");
}

/** The manifest's JSON checked the way serde and core check it; throws the reason (without core's prefix). */
function manifestFromJson(raw: unknown): Manifest {
  if (!isObject(raw)) throw new ToolError("expected a JSON object");
  const top = ["hedgebuddy", "app", "event", "requires"];
  const extra = unknownField(raw, top);
  if (extra !== undefined) throw new ToolError(`unknown field \`${extra}\`, expected one of ${expected(top)}`);
  if (!("hedgebuddy" in raw)) throw new ToolError("missing field `hedgebuddy`");
  const version = raw.hedgebuddy;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) throw new ToolError("invalid type: `hedgebuddy` must be a whole number");
  for (const key of ["app", "event"] as const) {
    if (raw[key] !== undefined && raw[key] !== null && typeof raw[key] !== "string") throw new ToolError(`invalid type: \`${key}\` must be a string`);
  }
  if (raw.requires !== undefined && !isObject(raw.requires)) throw new ToolError("invalid type: `requires` must be an object");
  const requires: Record<string, Requirement> = {};
  const fields = ["type", "description", "default"];
  for (const name of Object.keys(raw.requires ?? {}).sort()) {
    const req = (raw.requires as Record<string, unknown>)[name];
    if (!isObject(req)) throw new ToolError(`invalid type: requirement ${name} must be an object`);
    const bad = unknownField(req, fields);
    if (bad !== undefined) throw new ToolError(`unknown field \`${bad}\`, expected one of ${expected(fields)}`);
    if (!("type" in req)) throw new ToolError("missing field `type`");
    if (!isVarType(req.type)) throw new ToolError(`unknown variant \`${String(req.type)}\`, expected one of ${expected([...VAR_TYPES])}`);
    if (req.description !== undefined && typeof req.description !== "string") throw new ToolError("invalid type: `description` must be a string");
    const r: Requirement = { type: req.type, description: (req.description as string | undefined) ?? "" };
    if (req.default !== undefined && req.default !== null) r.default = req.default;
    requires[name] = r;
  }
  // Key order as serde writes it; an absent app or event is left out.
  return {
    hedgebuddy: version,
    ...(typeof raw.app === "string" ? { app: raw.app } : {}),
    ...(typeof raw.event === "string" ? { event: raw.event } : {}),
    requires,
  };
}

/** `null` when the script has no manifest block; throws `invalid script manifest: …` when it does not parse. */
export function parseManifest(source: string): Manifest | null {
  const text = extractManifestText(source);
  if (text === null) return null;
  try {
    let raw: unknown;
    try {
      raw = JSON.parse(text.trim());
    } catch (e) {
      throw new ToolError(e instanceof Error ? e.message : String(e));
    }
    const m = manifestFromJson(raw);
    if (m.hedgebuddy !== 1) throw new ToolError(`unsupported manifest version ${m.hedgebuddy} (expected 1)`);
    if (m.event != null && m.app == null) throw new ToolError("'event' requires 'app'");
    for (const [name, req] of Object.entries(m.requires)) {
      validateVarName(name);
      if (req.default !== undefined) {
        try {
          checkValue(req.type === "secret" ? "string" : req.type, req.default);
        } catch (e) {
          throw new ToolError(`default for ${name}: ${(e as Error).message}`);
        }
      }
    }
    return m;
  } catch (e) {
    throw new ToolError(`invalid script manifest: ${(e as Error).message}`);
  }
}

/** A script's manifest, or the reason it does not parse (as `list_scripts` reports it). */
export function manifestOf(source: string): { manifest: Manifest | null; manifest_error: string | null } {
  try {
    return { manifest: parseManifest(source), manifest_error: null };
  } catch (e) {
    return { manifest: null, manifest_error: (e as Error).message };
  }
}

/**
 * Requirements the profile does not meet, sorted by name. A variable counts as declared only when it has a
 * value (a secret: an entry in `secrets`); a type mismatch beats missing; a default satisfies an absent one.
 */
export function checkRequirements(
  manifest: Manifest,
  variables: ReadonlyMap<string, Variable>,
  secrets: ReadonlyMap<string, string>,
): RequirementIssue[] {
  const issues: RequirementIssue[] = [];
  for (const name of Object.keys(manifest.requires).sort()) {
    const req = manifest.requires[name];
    const v = variables.get(name);
    const declared = v !== undefined && (v.type === "secret" ? secrets.has(name) : v.value !== undefined && v.value !== null);
    if (v !== undefined && declared) {
      if (v.type !== req.type) issues.push({ kind: "type_mismatch", name, expected: req.type, actual: v.type });
    } else if (req.default === undefined) {
      issues.push({ kind: "missing", name, ty: req.type });
    }
  }
  return issues;
}

/** `NAME (type missing), NAME (is a, needs b)`, as core's sync and attach explain unmet requirements. */
export function describeIssues(issues: RequirementIssue[]): string {
  return issues
    .map((i) => (i.kind === "missing" ? `${i.name} (${i.ty} missing)` : `${i.name} (is ${i.actual}, needs ${i.expected})`))
    .join(", ");
}

/** Whether a script imports the `hedgebuddy` package (python_env.rs). */
export function importsHedgebuddy(source: string): boolean {
  return lines(source)
    .map((l) => l.trimStart())
    .some((line) => {
      const rest = line.startsWith("import hedgebuddy")
        ? line.slice("import hedgebuddy".length)
        : line.startsWith("from hedgebuddy")
          ? line.slice("from hedgebuddy".length)
          : null;
      return rest !== null && (rest === "" || [" ", "\t", ".", ","].includes(rest[0]));
    });
}

/** Leading dotted numbers compared numerically: `"26.1 (1023)"` equals `"26.1"` (apps.rs). */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => {
    const start = v.search(/[0-9]/);
    const rest = start < 0 ? "" : v.slice(start);
    const end = rest.search(/[^0-9.]/);
    return (end < 0 ? rest : rest.slice(0, end))
      .split(".")
      .filter((p) => p !== "")
      .map((p) => Number.parseInt(p, 10) || 0);
  };
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

/** `FileCopyCompleted` → `file_copy_completed` (files.rs `snake_case`). */
export function snakeCase(id: string): string {
  const chars = [...id];
  let out = "";
  const upper = (c: string | undefined) => c !== undefined && /[A-Z]/.test(c);
  const lowerOrDigit = (c: string | undefined) => c !== undefined && /[a-z0-9]/.test(c);
  chars.forEach((c, i) => {
    if (upper(c)) {
      const prev = chars[i - 1];
      const next = chars[i + 1];
      const boundary = lowerOrDigit(prev) || (upper(prev) && next !== undefined && /[a-z]/.test(next));
      if (boundary && !out.endsWith("_")) out += "_";
      out += c.toLowerCase();
    } else if (/[A-Za-z0-9]/.test(c)) {
      out += c;
    } else if (out !== "" && !out.endsWith("_")) {
      out += "_";
    }
  });
  return out.replace(/_+$/, "");
}
