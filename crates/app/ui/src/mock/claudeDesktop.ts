/**
 * The preview's Claude Desktop config: `claude_desktop_config.json`, outside the data folder. A port of
 * `hedgebuddy-tools`' `claude_desktop` module (crates/tools/src/app/claude_desktop.rs): the same states,
 * the same merge (only `mcpServers.hedgebuddy` changes, everything else is kept), and the same backup and
 * prune rules. `model.ts` holds one instance per scenario; applying a change updates it in place, so a
 * second `claude_desktop_status` call afterwards agrees.
 */
import type {
  ClaudeDesktopApplyOutput,
  ClaudeDesktopPlanOutput,
  ClaudeDesktopState,
  ClaudeDesktopStatusOutput,
  Os,
  ServerEntry,
} from "@/api/tools.gen";
import { ToolError } from "./rules";

const CONFIG_NAME = "claude_desktop_config.json";
const ENTRY_NAME = "hedgebuddy";
const BACKUP_PREFIX = "claude_desktop_config.";
const BACKUP_SUFFIX = ".hedgebuddy-backup.json";
const BACKUP_KEEP = 5;
const NO_BINARY = "this build has no bundled hedgebuddy command, so it can't set up Claude Desktop";

/** The config file this machine's Claude Desktop reads, per platform (paths.rs / claude_desktop.rs). */
export const CLAUDE_DESKTOP_PATH: Record<Os, string> = {
  windows: "C:\\Users\\operator\\AppData\\Roaming\\Claude\\claude_desktop_config.json",
  macos: "/Users/operator/Library/Application Support/Claude/claude_desktop_config.json",
};

/** The bundled `hedgebuddy` command, per platform. */
export const HEDGEBUDDY_BINARY: Record<Os, string> = {
  windows: "C:\\Users\\operator\\AppData\\Local\\Programs\\HedgeBuddy\\hedgebuddy.exe",
  macos: "/Applications/HedgeBuddy.app/Contents/MacOS/hedgebuddy",
};

/** `path` quoted for a shell on `os` (claude_desktop.rs `shell_quote`): double quotes on Windows, POSIX
 *  single quotes on macOS (each `'` written `'\''`). */
export function shellQuote(os: Os, path: string): string {
  return os === "windows" ? `"${path}"` : `'${path.split("'").join("'\\''")}'`;
}

/** What one scenario's Claude Desktop config starts with. */
export interface ClaudeDesktopSeed {
  /** Whether the Claude folder exists (only matters while `text` is null: tells "not set up" from "no
   *  Claude Desktop"). */
  folderExists: boolean;
  /** The file's raw JSON text, or null when there is no file yet. */
  text: string | null;
}

type ParsedConfig =
  | { kind: "missing"; folderExists: boolean }
  | { kind: "object"; config: Record<string, unknown>; text: string }
  | { kind: "invalid"; problem: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseConfig(text: string | null, folderExists: boolean): ParsedConfig {
  if (text === null) return { kind: "missing", folderExists };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { kind: "invalid", problem: `${CONFIG_NAME} isn't valid: ${(e as Error).message}` };
  }
  if (!isPlainObject(raw)) return { kind: "invalid", problem: `${CONFIG_NAME} isn't valid: it is not a JSON object` };
  if ("mcpServers" in raw && !isPlainObject(raw.mcpServers)) {
    return { kind: "invalid", problem: `${CONFIG_NAME} isn't valid: "mcpServers" is not an object` };
  }
  return { kind: "object", config: raw, text };
}

function servers(parsed: ParsedConfig): Record<string, unknown> | null {
  if (parsed.kind !== "object") return null;
  const s = parsed.config.mcpServers;
  return isPlainObject(s) ? s : null;
}

function hasEntry(parsed: ParsedConfig): boolean {
  const s = servers(parsed);
  return s !== null && ENTRY_NAME in s;
}

/** The `hedgebuddy` entry as `{command, args}`, or null when there is none or it isn't shaped like one
 *  (claude_desktop.rs `ConfigFile::current`). */
function currentEntry(parsed: ParsedConfig): ServerEntry | null {
  const s = servers(parsed);
  const entry = s?.[ENTRY_NAME];
  if (!isPlainObject(entry) || typeof entry.command !== "string") return null;
  if (entry.args === undefined) return { command: entry.command, args: [] };
  if (!Array.isArray(entry.args) || !entry.args.every((a) => typeof a === "string")) return null;
  return { command: entry.command, args: entry.args };
}

/** The other `mcpServers` entries, by name, sorted (serde_json's default map is a `BTreeMap`, so core's own
 *  `other_servers` already comes out sorted). */
function otherServers(parsed: ParsedConfig): string[] {
  const s = servers(parsed);
  return s === null ? [] : Object.keys(s).filter((k) => k !== ENTRY_NAME).sort();
}

function problemOf(parsed: ParsedConfig): string | null {
  return parsed.kind === "invalid" ? parsed.problem : null;
}

/** claude_desktop.rs `ConfigFile::state`. */
function computeState(parsed: ParsedConfig, expected: ServerEntry | null): ClaudeDesktopState {
  if (parsed.kind === "invalid") return "invalid";
  if (parsed.kind === "missing") return parsed.folderExists ? "not_set_up" : "no_claude";
  if (!hasEntry(parsed)) return "not_set_up";
  const current = currentEntry(parsed);
  if (current === null) return "outdated";
  if (expected === null) return "set_up";
  return current.command === expected.command && sameArgs(current.args, expected.args) ? "set_up" : "outdated";
}

function sameArgs(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** `file` with `mcpServers.hedgebuddy` running `after`: its other keys (an `env`, say) are kept, and
 *  everything else in the file stays as it is (claude_desktop.rs `merged`/`set_entry`). */
function merged(parsed: ParsedConfig, after: ServerEntry): Record<string, unknown> {
  const config: Record<string, unknown> = parsed.kind === "object" ? { ...parsed.config } : {};
  const existingServers = servers(parsed);
  const nextServers: Record<string, unknown> = existingServers ? { ...existingServers } : {};
  const existingEntry = nextServers[ENTRY_NAME];
  const entry: Record<string, unknown> = isPlainObject(existingEntry) ? { ...existingEntry } : {};
  entry.command = after.command;
  entry.args = after.args;
  nextServers[ENTRY_NAME] = entry;
  config.mcpServers = nextServers;
  return config;
}

/** Now, in local time, as a backup stamp: `YYYYMMDD-HHMMSS` (claude_desktop.rs `backup_stamp`). */
function backupStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** The preview's Claude Desktop config: reads and writes stay in memory, per scenario. */
export class ClaudeDesktop {
  private text: string | null;
  private folderExists: boolean;
  /** Backups by file name (their content, as the config's bytes were when each was made). */
  private readonly backups = new Map<string, string>();

  constructor(
    private readonly os: Os,
    /** The bundled `hedgebuddy` command, or null in a build without one. */
    private readonly binary: string | null,
    seed: ClaudeDesktopSeed,
  ) {
    this.text = seed.text;
    this.folderExists = seed.folderExists || seed.text !== null;
  }

  get configPath(): string {
    return CLAUDE_DESKTOP_PATH[this.os];
  }

  private parsed(): ParsedConfig {
    return parseConfig(this.text, this.folderExists);
  }

  private expected(): ServerEntry | null {
    return this.binary === null ? null : { command: this.binary, args: ["mcp"] };
  }

  private besideConfig(name: string): string {
    const sep = this.os === "windows" ? "\\" : "/";
    const idx = this.configPath.lastIndexOf(sep);
    return this.configPath.slice(0, idx + 1) + name;
  }

  private backupName(stamp: string): string {
    return `${BACKUP_PREFIX}${stamp}${BACKUP_SUFFIX}`;
  }

  status(): ClaudeDesktopStatusOutput {
    const parsed = this.parsed();
    const expected = this.expected();
    return {
      config_path: this.configPath,
      state: computeState(parsed, expected),
      problem: problemOf(parsed),
      current: currentEntry(parsed),
      expected,
      other_servers: otherServers(parsed),
      binary: this.binary,
      claude_code_command:
        this.binary === null ? "claude mcp add hedgebuddy -- hedgebuddy mcp" : `claude mcp add hedgebuddy -- ${shellQuote(this.os, this.binary)} mcp`,
      client_json: JSON.stringify({ mcpServers: { [ENTRY_NAME]: expected ?? { command: "hedgebuddy", args: ["mcp"] } } }, null, 2),
    };
  }

  /** The change to make, or why none can be (claude_desktop.rs `prepare`): no bundled binary, or the config
   *  can't be read or isn't valid. */
  private prepare(): { parsed: ParsedConfig; after: ServerEntry } {
    const after = this.expected();
    if (after === null) throw new ToolError(NO_BINARY);
    const parsed = this.parsed();
    if (parsed.kind === "invalid") {
      throw new ToolError(`${parsed.problem}. HedgeBuddy leaves it as it is: fix it or move it away, then try again`);
    }
    return { parsed, after };
  }

  private unchanged(parsed: ParsedConfig, after: ServerEntry): boolean {
    return computeState(parsed, after) === "set_up";
  }

  plan(): ClaudeDesktopPlanOutput {
    const { parsed, after } = this.prepare();
    const unchanged = this.unchanged(parsed, after);
    const exists = parsed.kind === "object";
    return {
      config_path: this.configPath,
      creates_file: !exists,
      backup_path: exists && !unchanged ? this.besideConfig(this.backupName(backupStamp())) : null,
      before: currentEntry(parsed),
      after,
      other_servers: otherServers(parsed),
      unchanged,
    };
  }

  /** Set up Claude Desktop; writes nothing when it is already set up (claude_desktop.rs `claude_desktop_apply`). */
  apply(): ClaudeDesktopApplyOutput {
    const { parsed, after } = this.prepare();
    const result: ClaudeDesktopApplyOutput = { config_path: this.configPath, backup_path: null, removed_backups: [] };
    if (this.unchanged(parsed, after)) return result;
    if (parsed.kind === "object") {
      const name = this.backupName(backupStamp());
      this.backups.set(name, parsed.text);
      result.backup_path = this.besideConfig(name);
    }
    this.text = JSON.stringify(merged(parsed, after), null, 2) + "\n";
    this.folderExists = true;
    if (result.backup_path !== null) result.removed_backups = this.pruneBackups();
    return result;
  }

  /** Keep only the newest five backups (claude_desktop.rs `prune_backups`): names sort chronologically since
   *  the stamp is fixed-width. */
  private pruneBackups(): string[] {
    const names = [...this.backups.keys()].sort();
    const excess = Math.max(0, names.length - BACKUP_KEEP);
    const removed = names.slice(0, excess);
    for (const n of removed) this.backups.delete(n);
    return removed.map((n) => this.besideConfig(n));
  }
}
