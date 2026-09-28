/**
 * The browser preview's in-memory model: one scenario's data folder (`store.ts`), Hedge apps (`hedge.ts`),
 * Python, runs and activity, behind every tool and app command the screens call. Results are typed against
 * the generated types and shaped the way the Rust tools shape them (crates/tools/src), dry runs included;
 * applying a change changes the model, so Home, the sidebar and every screen agree after each call.
 */
import type { ActivityRecord, AppCommandTypes, Os, PythonStatus, Run, ToolTypes } from "@/api/tools.gen";
import { catalogApp, catalogEvent } from "./catalog";
import { ClaudeDesktop, HEDGEBUDDY_BINARY, type ClaudeDesktopSeed } from "./claudeDesktop";
import { commercialOneDay, IMPORT_FILE, REQUIRED_VERSION, scenarioSeed, type PythonSeed, type Scenario } from "./fixtures";
import { APPLY_NOTE, DATA_DIR, Hedge } from "./hedge";
import { importsHedgebuddy, parseManifest, parseVarType, snakeCase, ToolError, validateScriptName } from "./rules";
import { bundleInfo, NO_WHEEL, pipCommandLine, pipSuccessOutput, PIP_FAIL_OUTPUT } from "./settings";
import { Store, type ProfileExport, type ResolvedVariable } from "./store";
import { appsOverview, catalogError, homeSummary, scriptsOverview, variablesOverview, varView } from "./views";

type In<N extends keyof ToolTypes> = ToolTypes[N]["input"];
type Out<N extends keyof ToolTypes> = ToolTypes[N]["output"];
type AppIn<C extends keyof AppCommandTypes> = AppCommandTypes[C]["input"];
type AppOut<C extends keyof AppCommandTypes> = AppCommandTypes[C]["output"];

const ACTIVITY_KEEP = 200;
const PATH_STATUS_MAX = 64;
const REVEAL_REFUSED = "HedgeBuddy only reveals its data folder and Hedge app files";
const FILE_MANAGER: Record<Os, string> = { windows: "File Explorer", macos: "Finder" };
const TEXT_EDITOR: Record<Os, string> = { windows: "Notepad", macos: "the default text editor" };

/** The apply note, only on a change that was applied (attachments.rs `note`). */
function note(applied: boolean): { note?: string } {
  return applied ? { note: APPLY_NOTE } : {};
}

/** Drive `X:` and `/Volumes/Offline` stand for an unplugged drive. */
function offline(path: string): boolean {
  return /^[Xx]:/.test(path) || path === "/Volumes/Offline" || path.startsWith("/Volumes/Offline/");
}

/** A strictly parsed IPv4 dotted quad's octets, or null for anything else (a decimal or hex number included:
 *  those never parse as dotted-quad, matching files.rs's `Ipv4Addr::from_str`). */
function parseIpv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || (p.length > 1 && p[0] === "0")) return null;
    const n = Number(p);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets as [number, number, number, number];
}

/** Whether a strictly parsed IPv4 literal is private (RFC 1918), loopback or link-local. */
function isLocalIpv4(host: string): boolean {
  const octets = parseIpv4(host);
  if (!octets) return false;
  const [a, b] = octets;
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/** Whether a (bracket-stripped) IPv6 literal is loopback (`::1`) or link-local (`fe80::/10`): the same two
 *  shapes files.rs's `is_local_ip_literal` checks, by hand rather than a strict full-address parse \u2014 plenty
 *  for the mock, which only ever sees the fixtures' own test addresses. */
function isLocalIpv6(host: string): boolean {
  return host === "::1" || /^fe[89ab][0-9a-f]:/i.test(host);
}

/** Whether `host` (optionally bracketed, `[::1]`) is a strictly parsed IPv4 or IPv6 literal that stays on the
 *  local network: private, loopback or link-local (files.rs `is_local_ip_literal`). */
function isLocalIpLiteral(host: string): boolean {
  const unbracketed = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  return isLocalIpv4(unbracketed) || isLocalIpv6(unbracketed);
}

/** Whether `host` is a DNS-shaped `*.local` name (mDNS): one or more labels of ASCII letters, digits and
 *  hyphens, joined by single dots, the last of which is `local` (case-insensitive) \u2014 stricter than "ends
 *  with .local" (files.rs `is_dot_local`). A UNC server text smuggled through the verbatim-prefix regex above
 *  can carry a slash, as in `evil.example.com/x.local`: that ends with ".local" but fails a label's
 *  alnum-or-hyphen check here, so the whole host is rejected and falls through to the "any dot" check below. */
function isDotLocal(host: string): boolean {
  const labels = host.split(".");
  return labels.length >= 2 && /^local$/i.test(labels[labels.length - 1]) && labels.every((l) => /^[A-Za-z0-9-]+$/.test(l));
}

/** A share whose server is named with a dot, or is an IP address, which `path_status` never contacts
 *  (files.rs `is_remote_host_path`): `\\files.example.com\x`, `//8.8.8.8/x`, `\\?\UNC\[2001:db8::1]\x`,
 *  `\\167772165\x` \u2014 except a strictly parsed private, loopback or link-local IP literal, or a strictly
 *  DNS-shaped `*.local` name (mDNS, [`isDotLocal`]), which stay on the local network and are checked instead
 *  (`\\10.0.0.5\x`, `\\nas.local\x`). */
function remoteShare(path: string): boolean {
  const verbatim = /^\\\\\?\\UNC[\\/]([^\\]*)/i.exec(path);
  const plain = /^[\\/]{2}([^\\/]*)/.exec(path);
  const server = verbatim ? verbatim[1] : plain && plain[1] !== "?" && plain[1] !== "." ? plain[1] : null;
  if (server === null) return false;
  const host = server.split("@")[0];
  if (isLocalIpLiteral(host) || isDotLocal(host)) return false;
  return /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host) || /[.:[\]\u3002\uff0e\uff61]/.test(host);
}

function isAbsolute(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\") || path.startsWith("/");
}

/** A new script's source for `app`'s `event` (resources.rs `script_template_source`). */
function templateSource(app: string, event: string): string {
  const m = catalogApp(app);
  const e = catalogEvent(m, event);
  const prefix = `${e.id}_`;
  let fields = e.payload
    .map((key) => {
      const attr = key.startsWith(prefix) ? key.slice(prefix.length) : key;
      const json = e.json_fields.includes(key) ? "  (JSON, decoded for you)" : "";
      return `    #   event.${attr.padEnd(28)} <- ${key}${json}\n`;
    })
    .join("");
  if (fields === "") fields = "    #   (this event has no payload)\n";
  return (
    `"""\n{"hedgebuddy": 1, "app": "${app}", "event": "${event}", "requires": {}}\n---\n` +
    `Describe what this script does.\n"""\nimport hedgebuddy as hb\n\n\n@hb.script\ndef main(event, vars):\n` +
    `    # Payload fields for ${m.app.name} ${event}:\n${fields}` +
    `    # Variables declared in "requires" are available as vars.NAME, typed.\n` +
    `    hb.log("started")\n    return 0\n`
  );
}

export class Model {
  readonly scenario: Scenario;
  readonly os: Os;
  private readonly store: Store;
  private readonly hedge: Hedge;
  /** Not `readonly`: a successful `pip_install` updates `installed` in place. */
  private python: PythonSeed | null;
  private readonly runs: Run[];
  private readonly activityLog: ActivityRecord[];
  private readonly since: string | null;
  private readonly preferences: AppOut<"preferences_get">;
  private readonly claudeDesktop: ClaudeDesktop;
  /** The bundled `hedgebuddy` command, or null (`?nobinary=1`: a build without one). */
  private readonly binary: string | null;
  /** The bundled wheel, or null (`macos`, or `?nowheel=1`: either way Settings' Install is disabled). */
  private readonly wheel: string | null;
  /** `?pipfail=1` forces `pip_install` to fail with a PEP 668-style message, in any scenario. */
  private readonly pipFail: boolean;
  /** Export files by path: the fixed import file, plus whatever `export_profile` writes. */
  private readonly exportFiles = new Map<string, ProfileExport>();

  constructor(scenario: Scenario) {
    const seed = scenarioSeed(scenario);
    // `?claude=invalid`, `?nobinary=1`, `?nowheel=1` and `?pipfail=1` each force an otherwise-unreachable
    // state, in any scenario, so Connect and Settings can be checked visually against every state.
    const params = new URLSearchParams(window.location.search);
    this.scenario = scenario;
    this.os = seed.os;
    this.store = new Store(DATA_DIR[seed.os], seed.os === "windows" ? "\\" : "/", seed.store);
    this.hedge = new Hedge(seed.os, this.store, seed.hedge);
    this.python = seed.python;
    this.runs = seed.runs;
    this.activityLog = seed.activity;
    this.since = seed.since;
    this.preferences = seed.preferences;
    this.binary = params.get("nobinary") === "1" ? null : HEDGEBUDDY_BINARY[seed.os];
    const claudeDesktopSeed: ClaudeDesktopSeed =
      params.get("claude") === "invalid"
        ? { ...seed.claudeDesktop, forceInvalidProblem: "expected value at line 1 column 1" }
        : seed.claudeDesktop;
    this.claudeDesktop = new ClaudeDesktop(seed.os, this.binary, claudeDesktopSeed);
    this.wheel = params.get("nowheel") === "1" ? null : seed.wheel;
    this.pipFail = params.get("pipfail") === "1";
    const source = new Store(DATA_DIR.windows, "\\", { profiles: { "commercial-one-day": commercialOneDay(false) }, active: null });
    this.exportFiles.set(this.hedge.pathKey(IMPORT_FILE), source.exportProfile("commercial-one-day", false));
  }

  /** The `data-changed` categories the last call touched, as the app's watcher would report them. */
  takeChanges(): string[] {
    return this.store.takeChanges();
  }

  /** The given profile, else the active one (lib.rs `Context::profile`). */
  private profileName(given: string | null | undefined): string {
    if (given !== undefined && given !== null) return given;
    const active = this.store.activeProfile;
    if (active === null) throw new ToolError("no active profile; create one with create_profile or pass `profile`");
    return active;
  }

  // ---- profiles -----------------------------------------------------------------------------------

  listProfiles(): Out<"list_profiles"> {
    return { active: this.store.activeProfile, profiles: this.store.listProfiles() };
  }

  getProfile(args: In<"get_profile">): Out<"get_profile"> {
    const name = this.profileName(args.profile);
    const profile = this.store.profile(name);
    return { profile, active: this.store.activeProfile === name, scripts: this.store.scriptNames(name) };
  }

  createProfile(args: In<"create_profile">): Out<"create_profile"> {
    const profile = this.store.createProfile(args.name, args.description ?? "");
    return { profile, active: this.store.activeProfile === args.name };
  }

  setActiveProfile(args: In<"set_active_profile">): Out<"set_active_profile"> {
    this.store.setActive(args.name);
    return { active: args.name };
  }

  deleteProfile(args: In<"delete_profile">): Out<"delete_profile"> {
    const profile = this.store.profile(args.name);
    const scripts = this.store.scriptNames(args.name);
    // App events attached to its scripts go stale once it is gone.
    const attached = scripts.flatMap((script) => this.hedge.attachedTo(args.name, script).map((a) => ({ ...a, script })));
    if (args.dry_run) {
      return {
        dry_run: true,
        would_delete: { profile: args.name, variables: Object.keys(profile.variables).length, scripts },
        attached_to: attached,
      };
    }
    this.store.deleteProfile(args.name);
    return { deleted: args.name, active: this.store.activeProfile, attached_to: attached };
  }

  // ---- variables ----------------------------------------------------------------------------------

  listVars(args: In<"list_vars">): Out<"list_vars"> {
    const profile = this.profileName(args.profile);
    return { profile, variables: this.store.listVariables(profile).map((v) => varView(v, args.reveal ?? false)) };
  }

  getVar(args: In<"get_var">): Out<"get_var"> {
    const profile = this.profileName(args.profile);
    return { ...varView(this.store.getVariable(profile, args.name), args.reveal ?? false), profile };
  }

  /** Create or replace a variable; an omitted value keeps the current one of the same type. */
  setVar(args: In<"set_var">): Out<"set_var"> {
    const profile = this.profileName(args.profile);
    const type = parseVarType(args.type);
    const description = args.description ?? this.store.profile(profile).variables[args.name]?.description ?? "";
    let value = args.value;
    if (value === undefined || value === null) {
      const keep = () => new ToolError(`variable '${args.name}' has no ${type} value to keep; pass a value`);
      let existing: ResolvedVariable;
      try {
        existing = this.store.getVariable(profile, args.name);
      } catch {
        throw keep();
      }
      if (existing.type !== type || existing.value === null) throw keep();
      value = existing.value;
    }
    this.store.setVariable(profile, args.name, type, value, description);
    return { profile, name: args.name, type, description };
  }

  deleteVar(args: In<"delete_var">): Out<"delete_var"> {
    const profile = this.profileName(args.profile);
    const v = this.store.getVariable(profile, args.name);
    if (args.dry_run) return { dry_run: true, would_delete: { profile, name: v.name, type: v.type } };
    this.store.deleteVariable(profile, args.name);
    return { deleted: args.name, profile };
  }

  // ---- scripts ------------------------------------------------------------------------------------

  listScripts(args: In<"list_scripts">): Out<"list_scripts"> {
    const profile = this.profileName(args.profile);
    return { profile, scripts: this.store.listScripts(profile) };
  }

  readScript(args: In<"read_script">): Out<"read_script"> {
    const profile = this.profileName(args.profile);
    return { profile, name: args.name, source: this.store.readScript(profile, args.name) };
  }

  writeScript(args: In<"write_script">): Out<"write_script"> {
    const profile = this.profileName(args.profile);
    validateScriptName(args.name);
    const manifest = parseManifest(args.source);
    if (manifest) {
      const error = catalogError(manifest);
      if (error !== null) throw new ToolError(error);
    }
    const replaced = this.store.scriptExists(profile, args.name);
    this.store.writeScript(profile, args.name, args.source);
    const check = this.store.checkScript(profile, args.name);
    return {
      profile,
      name: args.name,
      replaced,
      attached_to: replaced ? this.hedge.attachedTo(profile, args.name) : [],
      manifest: check.manifest,
      unmet: check.issues,
    };
  }

  deleteScript(args: In<"delete_script">): Out<"delete_script"> {
    const profile = this.profileName(args.profile);
    this.store.readScript(profile, args.name);
    const attached = this.hedge.attachedTo(profile, args.name);
    if (args.dry_run) return { dry_run: true, would_delete: { profile, name: args.name }, attached_to: attached };
    this.store.deleteScript(profile, args.name);
    return { deleted: args.name, profile, left_attached: attached };
  }

  /** The real check also compiles the script with Python; the preview reports no syntax errors. */
  checkScript(args: In<"check_script">): Out<"check_script"> {
    const profile = this.profileName(args.profile);
    const check = this.store.checkScript(profile, args.name);
    const catalog_error = check.manifest ? catalogError(check.manifest) : null;
    const source = this.store.readScript(profile, args.name);
    const package_problem = this.python && importsHedgebuddy(source) ? this.packageProblem(this.python) : null;
    return {
      profile,
      name: args.name,
      manifest: check.manifest,
      unmet: check.issues,
      catalog_error,
      syntax_checked: this.python !== null,
      python: this.python?.executable ?? null,
      syntax_error: null,
      package_problem,
      ok: check.issues.length === 0 && catalog_error === null && package_problem === null,
    };
  }

  // ---- attachments --------------------------------------------------------------------------------

  listAttachments(args: In<"list_attachments">): Out<"list_attachments"> {
    return { app: args.app, events: this.hedge.attachments(args.app) };
  }

  attachScript(args: In<"attach_script">): Out<"attach_script"> {
    const profile = this.profileName(args.profile);
    const applied = !args.dry_run;
    return { ...this.hedge.attachScript(profile, args.name, !applied), applied, ...note(applied) };
  }

  detachScript(args: In<"detach_script">): Out<"detach_script"> {
    const profile = this.profileName(args.profile);
    const applied = !args.dry_run;
    const actions = this.hedge.detachScript(profile, args.name, !applied);
    return { profile, script: args.name, actions, applied, ...note(applied) };
  }

  syncAttachments(args: In<"sync_attachments">): Out<"sync_attachments"> {
    const report = this.hedge.sync(this.profileName(args.profile), args.dry_run ?? false);
    return { ...report, ...note(report.applied) };
  }

  clearStaleAttachment(args: In<"clear_stale_attachment">): Out<"clear_stale_attachment"> {
    const applied = !args.dry_run;
    const actions = this.hedge.clearStale(args.app, args.event, !applied);
    return { app: args.app, event: args.event, actions, applied, ...note(applied) };
  }

  // ---- apps ---------------------------------------------------------------------------------------

  listApps(): Out<"list_apps"> {
    return { apps: this.hedge.apps() };
  }

  describeApp(args: In<"describe_app">): Out<"describe_app"> {
    return this.hedge.describe(args.app);
  }

  // ---- runs and activity (as in 5A) ---------------------------------------------------------------

  listRuns(args: In<"list_runs">): Out<"list_runs"> {
    let list = this.runs;
    if (args.profile) list = list.filter((r) => r.profile === args.profile);
    if (args.script) list = list.filter((r) => r.script === args.script);
    if (args.app) list = list.filter((r) => r.app === args.app);
    return { runs: list.slice(0, args.limit ?? 20) };
  }

  getRun(args: In<"get_run">): Out<"get_run"> {
    const found = this.runs.find((r) => r.run_id === args.run_id);
    if (!found) throw new ToolError(`run '${args.run_id}' not found`);
    return found;
  }

  activity(args: AppIn<"activity">): AppOut<"activity"> {
    return { records: this.activityLog.slice(0, Math.min(args.limit ?? ACTIVITY_KEEP, ACTIVITY_KEEP)) };
  }

  preferencesGet(): AppOut<"preferences_get"> {
    return { ...this.preferences };
  }

  // ---- Python and Home ---------------------------------------------------------------------------

  private packageProblem(py: PythonSeed): string | null {
    const install = `${py.launcher.join(" ")} -m pip install hedgebuddy==${REQUIRED_VERSION}`;
    if (py.installed === REQUIRED_VERSION) return null;
    if (py.installed !== null) {
      return `hedgebuddy ${py.installed} is installed for ${py.executable}, but this HedgeBuddy needs ${REQUIRED_VERSION}; run: ${install}`;
    }
    return `hedgebuddy is not installed for ${py.executable}; run: ${install}`;
  }

  private pythonStatus(): PythonStatus {
    const py = this.python;
    if (py === null) {
      return {
        found: false,
        executable: null,
        version: null,
        installed: null,
        required: REQUIRED_VERSION,
        problem: "Python 3 was not found; the Hedge apps need it to run scripts",
      };
    }
    return { found: true, executable: py.executable, version: py.version, installed: py.installed, required: REQUIRED_VERSION, problem: this.packageProblem(py) };
  }

  homeSummary(): AppOut<"home_summary"> {
    return homeSummary(this.store, this.hedge, this.pythonStatus(), { runs: this.runs, activity: this.activityLog, since: this.since });
  }

  // ---- Claude Desktop (spec §6.6, §10) ------------------------------------------------------------

  claudeDesktopStatus(): AppOut<"claude_desktop_status"> {
    return this.claudeDesktop.status();
  }

  claudeDesktopPlan(): AppOut<"claude_desktop_plan"> {
    return this.claudeDesktop.plan();
  }

  claudeDesktopApply(): AppOut<"claude_desktop_apply"> {
    return this.claudeDesktop.apply();
  }

  // ---- Settings (spec §6.7) ------------------------------------------------------------------------

  /** `args.recheck` has nothing to do here: the preview keeps no Python cache to invalidate, so every call
   *  already reads the current (possibly just-installed) value. */
  settingsOverview(_args: AppIn<"settings_overview">): AppOut<"settings_overview"> {
    return {
      os: this.os,
      data_dir: this.store.dataDir,
      catalog_overrides: this.scenario === "problems" ? ["offshoot"] : [],
      catalog_error: null,
      python: this.pythonStatus(),
      install_command: this.python && this.wheel ? pipCommandLine(this.os, this.wheel) : null,
      bundle: bundleInfo(this.binary, this.wheel),
      editor_command: this.preferences.editor_command,
      preferences_error: null,
    };
  }

  /** Installs the bundled wheel offline; a success updates `installed` in place, so a later `home_summary`
   *  or `settings_overview` (recheck or not) already shows it. `?pipfail=1` forces a PEP 668-style failure. */
  pipInstall(): AppOut<"pip_install"> {
    if (this.python === null) throw new ToolError("Python 3 was not found; the Hedge apps need it to run scripts");
    if (this.wheel === null) throw new ToolError(NO_WHEEL);
    const command = pipCommandLine(this.os, this.wheel);
    if (this.pipFail) {
      return { ok: false, exit_code: 1, command, output: PIP_FAIL_OUTPUT, installed: this.python.installed };
    }
    this.python = { ...this.python, installed: REQUIRED_VERSION };
    return { ok: true, exit_code: 0, command, output: pipSuccessOutput(this.wheel, REQUIRED_VERSION), installed: REQUIRED_VERSION };
  }

  // ---- overviews (views.ts) -----------------------------------------------------------------------

  variablesOverview(args: AppIn<"variables_overview">): AppOut<"variables_overview"> {
    return variablesOverview(this.store, this.profileName(args.profile));
  }

  scriptsOverview(args: AppIn<"scripts_overview">): AppOut<"scripts_overview"> {
    return scriptsOverview(this.store, this.hedge, this.profileName(args.profile));
  }

  appsOverview(): AppOut<"apps_overview"> {
    return appsOverview(this.hedge);
  }

  // ---- files, pickers and opening (files.rs, the app's commands.rs) -------------------------------

  /** Drive `X:` and `/Volumes/Offline` are unplugged; an empty path, and a share on a server that may be outside
   *  the network, are not checked; everything else exists. */
  pathStatus(args: AppIn<"path_status">): AppOut<"path_status"> {
    if (args.paths.length > PATH_STATUS_MAX) throw new ToolError(`path_status checks at most ${PATH_STATUS_MAX} paths at a time`);
    return {
      paths: args.paths.map((path) => {
        if (path === "" || remoteShare(path)) return { path, exists: false, mounted: true, checked: false };
        if (offline(path)) return { path, exists: false, mounted: false, checked: true };
        return { path, exists: true, mounted: true, checked: true };
      }),
    };
  }

  /** A new script for `app`'s `event` and a free name: `on_<event>.py`, then `_2`, `_3` … */
  scriptTemplate(args: AppIn<"script_template">): AppOut<"script_template"> {
    const source = templateSource(args.app, args.event);
    const profile = this.profileName(args.profile);
    this.store.profile(profile);
    const stem = `on_${snakeCase(args.event)}`;
    let name = `${stem}.py`;
    for (let n = 2; this.store.scriptExists(profile, name); n++) name = `${stem}_${n}.py`;
    validateScriptName(name);
    return { name, source };
  }

  exportProfile(args: AppIn<"export_profile">): AppOut<"export_profile"> {
    if (!isAbsolute(args.dest)) throw new ToolError(`the export destination must be an absolute path, not '${args.dest}'`);
    if (this.hedge.inside(args.dest, DATA_DIR[this.os])) {
      throw new ToolError(`${args.dest} is inside the data folder; export to a place outside it`);
    }
    const file = this.store.exportProfile(args.name, args.include_secrets);
    this.exportFiles.set(this.hedge.pathKey(args.dest), file);
    return {
      path: args.dest,
      variables: Object.keys(file.profile.variables).length,
      scripts: Object.keys(file.scripts).length,
      secrets_included: file.secrets !== undefined && Object.keys(file.secrets).length > 0,
    };
  }

  /** Reads the fixed import file (a copy of `commercial-one-day` without secret values) or a file exported here. */
  importProfile(args: AppIn<"import_profile">): AppOut<"import_profile"> {
    if (!isAbsolute(args.path)) throw new ToolError(`the export file must be an absolute path, not '${args.path}'`);
    const file = this.exportFiles.get(this.hedge.pathKey(args.path));
    if (!file) throw new ToolError(`i/o error at ${args.path}: the file does not exist`);
    return this.store.importProfile(structuredClone(file), args.name);
  }

  openInEditor(args: AppIn<"open_in_editor">): AppOut<"open_in_editor"> {
    const profile = this.profileName(args.profile);
    validateScriptName(args.script);
    this.store.readScript(profile, args.script);
    const opened = { path: this.store.scriptPath(profile, args.script), with: this.preferences.editor_command ?? TEXT_EDITOR[this.os] };
    console.info(`[preview] open_in_editor: ${opened.path} with ${opened.with}`);
    return opened;
  }

  /** Only the data folder and Hedge app files, as the real allow-list. */
  revealPath(args: AppIn<"reveal_path">): AppOut<"reveal_path"> {
    const inData = isAbsolute(args.path) && this.hedge.inside(args.path, DATA_DIR[this.os]);
    if (!inData && !(isAbsolute(args.path) && this.hedge.isAppFile(args.path))) throw new ToolError(REVEAL_REFUSED);
    if (this.hedge.managedScript(args.path) && !this.hedge.fileExists(args.path)) throw new ToolError(`${args.path} does not exist`);
    const opened = { path: args.path, with: FILE_MANAGER[this.os] };
    console.info(`[preview] reveal_path: ${opened.path} in ${opened.with}`);
    return opened;
  }

  openAppDocs(args: AppIn<"open_app_docs">): AppOut<"open_app_docs"> {
    const docs = catalogApp(args.app).app.docs;
    if (!docs.startsWith("https://")) throw new ToolError(`the docs link of ${args.app} is not an https:// address: ${docs}`);
    console.info(`[preview] open_app_docs: ${docs}`);
    return { path: docs, with: "the browser" };
  }

  pickFolder(): AppOut<"pick_folder"> {
    return { path: "D:/Offload/NEW" };
  }

  pickExportPath(args: AppIn<"pick_export_path">): AppOut<"pick_export_path"> {
    return { path: `C:/Users/you/Documents/${args.default_name}` };
  }

  pickImportFile(): AppOut<"pick_import_file"> {
    return { path: IMPORT_FILE };
  }
}
