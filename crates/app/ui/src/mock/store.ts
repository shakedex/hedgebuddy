/**
 * The preview's data folder: profiles with their variables, secrets and scripts, and the active profile.
 * Mirrors `hedgebuddy-core`'s `Store` (profile.rs, secrets.rs, scripts.rs, export.rs): the same checks,
 * errors and sort orders. Every write records the `data-changed` categories the real watcher would emit.
 */
import type { ImportProfileOutput, Manifest, Profile, RequirementIssue, ScriptInfo, VarType, Variable } from "@/api/tools.gen";
import {
  checkRequirements,
  checkValue,
  manifestOf,
  parseManifest,
  ToolError,
  validateScriptName,
  validateSlug,
  validateVarName,
} from "./rules";

/** One profile's files: `profile.json`'s description and variables, `secrets.json`, and `scripts/`. */
export interface ProfileData {
  description: string;
  variables: Map<string, Variable>;
  secrets: Map<string, string>;
  scripts: Map<string, string>;
}

/** A variable with its value resolved from whichever file holds it. */
export interface ResolvedVariable {
  name: string;
  type: VarType;
  value: unknown;
  description: string;
}

/** A profile export file (core's `ProfileExport`). */
export interface ProfileExport {
  profile: Profile;
  secrets?: Record<string, string>;
  scripts: Record<string, string>;
}

/** What a scenario starts with. */
export interface StoreSeed {
  profiles: Record<string, ProfileData>;
  active: string | null;
}

function sorted<T>(map: ReadonlyMap<string, T>): [string, T][] {
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function cloneProfile(p: ProfileData): ProfileData {
  return {
    description: p.description,
    variables: new Map([...p.variables].map(([k, v]) => [k, structuredClone(v)])),
    secrets: new Map(p.secrets),
    scripts: new Map(p.scripts),
  };
}

export class Store {
  private readonly profiles = new Map<string, ProfileData>();
  private active: string | null;
  private readonly changes = new Set<string>();

  /** `dataDir` and `sep` give script paths their platform's shape. */
  constructor(
    readonly dataDir: string,
    readonly sep: string,
    seed: StoreSeed,
  ) {
    for (const [name, p] of Object.entries(seed.profiles)) this.profiles.set(name, cloneProfile(p));
    this.active = seed.active;
  }

  /** The `data-changed` categories touched since the last call, sorted. */
  takeChanges(): string[] {
    const out = [...this.changes].sort();
    this.changes.clear();
    return out;
  }

  private touch(...categories: string[]) {
    for (const c of categories) this.changes.add(c);
  }

  get activeProfile(): string | null {
    return this.active;
  }

  /** `<data>/profiles`. */
  get profilesDir(): string {
    return [this.dataDir, "profiles"].join(this.sep);
  }

  scriptPath(profile: string, script: string): string {
    return [this.profilesDir, profile, "scripts", script].join(this.sep);
  }

  exists(name: string): boolean {
    return this.profiles.has(name);
  }

  /** The profile's files, after core's slug check; `profile 'x' not found` when it does not exist. */
  private require(name: string): ProfileData {
    validateSlug(name);
    const p = this.profiles.get(name);
    if (!p) throw new ToolError(`profile '${name}' not found`);
    return p;
  }

  listProfiles(): string[] {
    return [...this.profiles.keys()].sort();
  }

  /** `profile.json` as the tools return it: variables sorted by name, no secret values. */
  profile(name: string): Profile {
    const p = this.require(name);
    return { version: 1, name, description: p.description, variables: Object.fromEntries(sorted(p.variables).map(([k, v]) => [k, structuredClone(v)])) };
  }

  variableMap(name: string): ReadonlyMap<string, Variable> {
    return this.require(name).variables;
  }

  secretMap(name: string): ReadonlyMap<string, string> {
    return this.require(name).secrets;
  }

  /** An empty profile; it becomes active when nothing else is. */
  createProfile(name: string, description: string): Profile {
    validateSlug(name);
    if (this.profiles.has(name)) throw new ToolError(`profile '${name}' already exists`);
    this.profiles.set(name, { description, variables: new Map(), secrets: new Map(), scripts: new Map() });
    this.touch(`profile:${name}`, `scripts:${name}`);
    if (this.active === null) {
      this.active = name;
      this.touch("index");
    }
    return this.profile(name);
  }

  setActive(name: string) {
    this.require(name);
    this.active = name;
    this.touch("index");
  }

  deleteProfile(name: string) {
    this.require(name);
    if (this.active === name) {
      this.active = null;
      this.touch("index");
    }
    this.profiles.delete(name);
    this.touch(`profile:${name}`, `scripts:${name}`);
  }

  private resolve(p: ProfileData, name: string, v: Variable): ResolvedVariable {
    const value = v.type === "secret" ? (p.secrets.get(name) ?? null) : (v.value ?? null);
    return { name, type: v.type, value, description: v.description };
  }

  /** Every variable, sorted by name, with secret values resolved (callers mask them). */
  listVariables(profile: string): ResolvedVariable[] {
    const p = this.require(profile);
    return sorted(p.variables).map(([name, v]) => this.resolve(p, name, v));
  }

  getVariable(profile: string, name: string): ResolvedVariable {
    const p = this.require(profile);
    const v = p.variables.get(name);
    if (!v) throw new ToolError(`variable '${name}' not found`);
    return this.resolve(p, name, v);
  }

  /** Create or replace a variable; a secret's value goes to the secrets map, never into the profile. */
  setVariable(profile: string, name: string, type: VarType, value: unknown, description: string) {
    validateVarName(name);
    const p = this.require(profile);
    if (type === "secret") {
      if (typeof value !== "string") throw new ToolError(`variable '${name}': secret variables require a string value`);
      p.variables.set(name, { type, description });
      p.secrets.set(name, value);
    } else {
      checkValue(type, value, name);
      p.variables.set(name, { type, value: structuredClone(value), description });
      p.secrets.delete(name);
    }
    this.touch(`profile:${profile}`);
  }

  deleteVariable(profile: string, name: string) {
    const p = this.require(profile);
    const inProfile = p.variables.delete(name);
    const inSecrets = p.secrets.delete(name);
    if (!inProfile && !inSecrets) throw new ToolError(`variable '${name}' not found`);
    this.touch(`profile:${profile}`);
  }

  /** Script file names, sorted. */
  scriptNames(profile: string): string[] {
    return [...this.require(profile).scripts.keys()].sort();
  }

  scriptExists(profile: string, name: string): boolean {
    return this.profiles.get(profile)?.scripts.has(name) ?? false;
  }

  readScript(profile: string, name: string): string {
    const p = this.require(profile);
    validateScriptName(name);
    const source = p.scripts.get(name);
    if (source === undefined) throw new ToolError(`script '${name}' not found`);
    return source;
  }

  /** Every script with its manifest, or the reason the manifest does not parse. */
  listScripts(profile: string): ScriptInfo[] {
    const p = this.require(profile);
    return sorted(p.scripts).map(([name, source]) => ({ name, ...manifestOf(source) }));
  }

  /** Checks the name and (if present) the manifest block, then writes. */
  writeScript(profile: string, name: string, source: string) {
    const p = this.require(profile);
    validateScriptName(name);
    parseManifest(source);
    p.scripts.set(name, source);
    this.touch(`scripts:${profile}`);
  }

  deleteScript(profile: string, name: string) {
    this.readScript(profile, name);
    this.require(profile).scripts.delete(name);
    this.touch(`scripts:${profile}`);
  }

  /** The manifest and the requirements the profile does not meet; throws when the manifest does not parse. */
  checkScript(profile: string, name: string): { manifest: Manifest | null; issues: RequirementIssue[] } {
    const manifest = parseManifest(this.readScript(profile, name));
    const p = this.require(profile);
    return { manifest, issues: manifest ? checkRequirements(manifest, p.variables, p.secrets) : [] };
  }

  /** The profile, its scripts and, with `includeSecrets`, its secret-typed variables' values. */
  exportProfile(name: string, includeSecrets: boolean): ProfileExport {
    const p = this.require(name);
    const broken = this.listScripts(name)
      .filter((s) => s.manifest_error !== null)
      .map((s) => s.name);
    if (broken.length > 0) throw new ToolError(`fix the manifest of ${broken.join(", ")} before exporting`);
    const out: ProfileExport = { profile: this.profile(name), scripts: Object.fromEntries(sorted(p.scripts)) };
    if (includeSecrets) {
      out.secrets = Object.fromEntries(sorted(p.secrets).filter(([k]) => p.variables.get(k)?.type === "secret"));
    }
    return out;
  }

  /** Create profile `name` from an export, after checking all of it (export.rs `import_profile`). */
  importProfile(file: ProfileExport, name: string): ImportProfileOutput {
    validateSlug(name);
    if (this.profiles.has(name)) throw new ToolError(`profile '${name}' already exists`);
    const variables = new Map(Object.entries(file.profile.variables).map(([k, v]) => [k, structuredClone(v)]));
    for (const [k, v] of variables) {
      validateVarName(k);
      if (v.type !== "secret") checkValue(v.type, v.value, k);
      else if (v.value !== undefined) throw new ToolError(`variable '${k}': secret variables must not carry a value in profile.json`);
    }
    const secretNames = [...variables].filter(([, v]) => v.type === "secret").map(([k]) => k);
    const secrets = new Map(Object.entries(file.secrets ?? {}));
    for (const key of secrets.keys()) {
      if (!secretNames.includes(key)) {
        throw new ToolError(`the file has a secret value for '${key}', which is not a secret variable of the profile`);
      }
    }
    const seen = new Set<string>();
    for (const [script, source] of Object.entries(file.scripts)) {
      validateScriptName(script);
      parseManifest(source);
      if (seen.has(script.toLowerCase())) {
        throw new ToolError(`script name '${script}' differs only by case from another script in this file`);
      }
      seen.add(script.toLowerCase());
    }
    this.createProfile(name, file.profile.description);
    const p = this.require(name);
    p.variables = variables;
    p.secrets = secrets;
    p.scripts = new Map(Object.entries(file.scripts));
    return {
      profile: name,
      active: this.active === name,
      variables: variables.size,
      scripts: p.scripts.size,
      secrets_imported: secrets.size,
      secrets_missing: secretNames.filter((n) => !secrets.has(n)).sort(),
    };
  }
}
