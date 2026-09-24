/**
 * The preview's Hedge apps: a registry (Windows) or the OffShoot Helper workspace (macOS), installed apps,
 * and the operator's own files. A port of `hedgebuddy-core`'s hedge module (apps.rs, attach.rs, sync.rs):
 * attachment states are read from the stored values the same way, plans produce the same actions, and
 * applying a plan changes the stored values, so every screen reads one consistent state.
 */
import type {
  Action,
  AppManifest,
  AppStatus,
  AttachScriptOutput,
  AttachState,
  DescribeAppOutput,
  EventAttachment,
  EventSpec,
  Os,
  RegValue,
  RequirementIssue,
  ScriptingSupport,
  SyncAttachmentsOutput,
  SyncItem,
} from "@/api/tools.gen";
import { CATALOG, catalogApp, catalogEvent } from "./catalog";
import { compareVersions, describeIssues, ToolError } from "./rules";
import type { Store } from "./store";

/** The OffShoot Helper note every applied attach, detach, sync or clear carries (attachments.rs). */
export const APPLY_NOTE =
  "On macOS the change is staged in the OffShoot Helper workspace HedgeBuddy.json; the operator applies it from the OffShoot Helper menu. The Hedge app may need a restart to pick up the change (unverified).";

/** The operator's home folder, per platform. */
export const HOME: Record<Os, string> = { windows: "C:\\Users\\you", macos: "/Users/you" };

/** Where HedgeBuddy keeps its data, per platform (paths.rs: `%APPDATA%` and Application Support). */
export const DATA_DIR: Record<Os, string> = {
  windows: "C:\\Users\\you\\AppData\\Roaming\\HedgeBuddy",
  macos: "/Users/you/Library/Application Support/HedgeBuddy",
};

/** What a scenario's Hedge apps start with. */
export interface HedgeSeed {
  /** Windows: registry key → value name → value (an app's `BuildVersion` makes it installed). */
  registry: Record<string, Record<string, RegValue>>;
  /** macOS: the `setPreferences` of `HedgeBuddy.json`, or null when the workspace file does not exist. */
  workspace: Record<string, unknown> | null;
  /** macOS: installed app bundles by path, with their version. */
  bundles: Record<string, string>;
  /** Files outside the data folder that exist (the operator's own scripts). */
  files: string[];
}

/** `attach_script`'s plan, before `applied` and `note` are added. */
export type AttachPlan = Omit<AttachScriptOutput, "applied" | "note">;

/** A sync report, before the `note` is added. */
export type SyncReport = Omit<SyncAttachmentsOutput, "note">;

function unsupported(message: string): ToolError {
  return new ToolError(`not supported: ${message}`);
}

export class Hedge {
  private readonly registry = new Map<string, Map<string, RegValue>>();
  private workspace: Map<string, unknown> | null;
  private readonly bundles: Map<string, string>;
  private readonly files: Set<string>;

  constructor(
    readonly os: Os,
    private readonly store: Store,
    seed: HedgeSeed,
  ) {
    for (const [key, values] of Object.entries(seed.registry)) this.registry.set(key, new Map(Object.entries(values)));
    this.workspace = seed.workspace === null ? null : new Map(Object.entries(seed.workspace));
    this.bundles = new Map(Object.entries(seed.bundles));
    this.files = new Set(seed.files.map((f) => this.pathKey(f)));
  }

  // ---- paths --------------------------------------------------------------------------------------

  /** `%APPDATA%` and `~` expanded for this machine (catalog.rs `expand_path`). */
  expand(template: string): string {
    if (this.os === "windows") {
      return template
        .replaceAll("%APPDATA%", `${HOME.windows}\\AppData\\Roaming`)
        .replaceAll("%LOCALAPPDATA%", `${HOME.windows}\\AppData\\Local`)
        .replaceAll("%USERPROFILE%", HOME.windows);
    }
    return template.startsWith("~") ? HOME.macos + template.slice(1) : template;
  }

  /** A path's components, compared case-insensitively on Windows as NTFS does. */
  private components(path: string): string[] {
    const parts = path.split(this.os === "windows" ? /[\\/]+/ : /\/+/).filter((p) => p !== "");
    return this.os === "windows" ? parts.map((p) => p.toLowerCase()) : parts;
  }

  /** A path as a comparable key: separators unified, and case folded on Windows. */
  pathKey(path: string): string {
    return this.components(path).join("/");
  }

  /** Whether `path` is inside `root` (or is it), by text. */
  inside(path: string, root: string): boolean {
    const p = this.components(path);
    const r = this.components(root);
    return p.length >= r.length && r.every((c, i) => c === p[i]);
  }

  /** `{profile, script}` when `path` is `<data>/profiles/<profile>/scripts/<script>` (attach.rs `managed_script`). */
  managedScript(path: string): { profile: string; script: string } | null {
    const base = this.components(this.store.profilesDir);
    const full = this.components(path);
    const raw = path.split(this.os === "windows" ? /[\\/]+/ : /\/+/).filter((p) => p !== "");
    if (full.length !== base.length + 3 || !base.every((c, i) => c === full[i]) || full[base.length + 1] !== "scripts") return null;
    return { profile: raw[base.length], script: raw[base.length + 2] };
  }

  /** Whether a file exists: a script of the data folder, or one of the operator's own files. */
  fileExists(path: string): boolean {
    const managed = this.managedScript(path);
    if (managed) return this.store.scriptExists(managed.profile, managed.script);
    return this.files.has(this.pathKey(path));
  }

  // ---- attachment state ---------------------------------------------------------------------------

  private classify(path: string): AttachState {
    if (!this.fileExists(path)) return { state: "stale", path };
    const managed = this.managedScript(path);
    return managed ? { state: "attached", path, ...managed } : { state: "external", path };
  }

  private workspacePath(dir: string, file: string): string {
    return `${this.expand(dir)}/${file}`;
  }

  private stateOf(m: AppManifest, e: EventSpec): AttachState {
    const scripting = m.scripting[this.os];
    if (!scripting) return { state: "unsupported" };
    switch (scripting.kind) {
      case "manual":
        return { state: "manual", note: scripting.note };
      case "registry": {
        if (!e.registry_name) return { state: "unsupported" };
        const value = this.registry.get(scripting.key)?.get(scripting.value_pattern.replace("{registry_name}", e.registry_name));
        return value?.type === "string" && value.data.trim() !== "" ? this.classify(value.data.trim()) : { state: "detached" };
      }
      case "helper_workspace": {
        if (!e.pref_name) return { state: "unsupported" };
        const workspace = this.workspacePath(scripting.workspace_dir, scripting.workspace_file);
        const value = this.workspace?.get(scripting.pref_pattern.replace("{pref_name}", e.pref_name));
        // Core never checks a staged path exists (parked for 5C), so a staged entry is never `stale`.
        return typeof value === "string" && value !== "" ? { state: "staged", path: value, workspace } : { state: "detached" };
      }
    }
  }

  /** Every event of `app` and what it runs, in catalog order. */
  attachments(app: string): EventAttachment[] {
    const m = catalogApp(app);
    return m.events.map((e) => ({ app: m.app.id, event: e.id, ...this.stateOf(m, e) }));
  }

  attachment(app: string, event: string): AttachState {
    const m = catalogApp(app);
    return this.stateOf(m, catalogEvent(m, event));
  }

  /** Whether an event runs (or is staged for) `profile/script` (scripts.rs `runs_script`). */
  runsScript(a: AttachState, profile: string, script: string): boolean {
    if (a.state !== "attached" && a.state !== "staged") return false;
    const managed = this.managedScript(a.path);
    return managed !== null && managed.profile === profile && managed.script === script;
  }

  /** Every app event attached to (or staged for) `profile/script`, across all apps. */
  attachedTo(profile: string, script: string): { app: string; event: string }[] {
    return CATALOG.flatMap((m) => this.attachments(m.app.id))
      .filter((a) => this.runsScript(a, profile, script))
      .map((a) => ({ app: a.app, event: a.event }));
  }

  // ---- plans --------------------------------------------------------------------------------------

  /** The actions that attach `scriptPath` to `app`'s `event` (attach.rs `plan_attach`). */
  planAttach(app: string, event: string, scriptPath: string): Action[] {
    const m = catalogApp(app);
    const e = catalogEvent(m, event);
    const scripting = m.scripting[this.os];
    const noLocation = () => unsupported(`${m.app.name} event ${e.id} has no known attachment location on this platform`);
    if (!scripting) throw unsupported(`${m.app.name} has no script attachment on this platform`);
    if (scripting.kind === "manual") {
      throw unsupported(`${m.app.name} scripts are attached by hand on this platform: ${scripting.note}. Script to attach: ${scriptPath}`);
    }
    if (!this.fileExists(scriptPath)) throw new ToolError(`script ${scriptPath} does not exist`);
    if (scripting.kind === "registry") {
      if (!e.registry_name) throw noLocation();
      return [
        { action: "registry_set", key: scripting.key, value: scripting.enable_value, data: { type: "dword", data: 1 } },
        {
          action: "registry_set",
          key: scripting.key,
          value: scripting.value_pattern.replace("{registry_name}", e.registry_name),
          data: { type: "string", data: scriptPath },
        },
      ];
    }
    if (!e.pref_name) throw noLocation();
    return [
      {
        action: "workspace_prefs",
        path: this.workspacePath(scripting.workspace_dir, scripting.workspace_file),
        set: { [scripting.enable_pref]: true, [scripting.pref_pattern.replace("{pref_name}", e.pref_name)]: scriptPath },
      },
    ];
  }

  /** The actions that detach whatever `app`'s `event` runs (attach.rs `plan_detach`). */
  planDetach(app: string, event: string): Action[] {
    const m = catalogApp(app);
    const e = catalogEvent(m, event);
    const scripting = m.scripting[this.os];
    const noLocation = () => unsupported(`${m.app.name} event ${e.id} has no known attachment location on this platform`);
    if (!scripting) throw unsupported(`${m.app.name} has no script attachment on this platform`);
    switch (scripting.kind) {
      case "manual":
        throw unsupported(`${m.app.name} scripts are detached by hand on this platform: ${scripting.note}`);
      case "registry":
        if (!e.registry_name) throw noLocation();
        return [{ action: "registry_delete", key: scripting.key, value: scripting.value_pattern.replace("{registry_name}", e.registry_name) }];
      case "helper_workspace":
        if (!e.pref_name) throw noLocation();
        return [
          {
            action: "workspace_prefs",
            path: this.workspacePath(scripting.workspace_dir, scripting.workspace_file),
            set: { [scripting.pref_pattern.replace("{pref_name}", e.pref_name)]: "" },
          },
        ];
    }
  }

  /** Run actions in order: registry values and workspace preferences change; nothing emits `data-changed`. */
  apply(actions: Action[]) {
    for (const a of actions) {
      switch (a.action) {
        case "registry_set": {
          const key = this.registry.get(a.key) ?? new Map<string, RegValue>();
          key.set(a.value, a.data);
          this.registry.set(a.key, key);
          break;
        }
        case "registry_delete":
          this.registry.get(a.key)?.delete(a.value);
          break;
        case "workspace_prefs": {
          const prefs = this.workspace ?? new Map<string, unknown>();
          for (const [k, v] of Object.entries(a.set)) prefs.set(k, v);
          this.workspace = prefs;
          break;
        }
        case "write_file":
          break;
      }
    }
  }

  // ---- attach, detach, sync, clear (sync.rs) ------------------------------------------------------

  /** The script's manifest, naming an app and an event, or core's refusal. */
  private target(profile: string, script: string, detaching: boolean): { app: string; event: string; issues: RequirementIssue[] } {
    const check = this.store.checkScript(profile, script);
    if (!check.manifest) {
      throw new ToolError(detaching ? `${script} has no manifest, so it is not attached` : `${script} has no manifest; add one naming the app and event`);
    }
    const { app, event } = check.manifest;
    if (!app || !event) throw new ToolError(`${script}'s manifest does not name an app and an event`);
    return { app, event, issues: check.issues };
  }

  /** What an attach replaces: nothing when the event is free or cannot hold a script here. */
  private static replaced(state: AttachState): AttachState | null {
    return state.state === "detached" || state.state === "unsupported" || state.state === "manual" ? null : state;
  }

  attachScript(profile: string, script: string, dryRun: boolean): AttachPlan {
    const { app, event, issues } = this.target(profile, script, false);
    catalogEvent(catalogApp(app), event);
    if (issues.length > 0) throw new ToolError(`${script} has unmet requirements: ${describeIssues(issues)}`);
    const replaces = Hedge.replaced(this.attachment(app, event));
    const actions = this.planAttach(app, event, this.store.scriptPath(profile, script));
    if (!dryRun) this.apply(actions);
    return { app, event, script, ...(replaces ? { replaces } : {}), actions };
  }

  detachScript(profile: string, script: string, dryRun: boolean): Action[] {
    const { app, event } = this.target(profile, script, true);
    if (!this.runsScript(this.attachment(app, event), profile, script)) {
      throw new ToolError(`${app} ${event} is not attached to ${profile}/${script}; nothing to detach`);
    }
    return this.detachEvent(app, event, dryRun);
  }

  private detachEvent(app: string, event: string, dryRun: boolean): Action[] {
    const actions = this.planDetach(app, event);
    if (!dryRun) this.apply(actions);
    return actions;
  }

  clearStale(app: string, event: string, dryRun: boolean): Action[] {
    const state = this.attachment(app, event);
    if (state.state !== "stale") {
      throw new ToolError(`${app} ${event} is not stale (state: ${state.state}); use detach_script or sync_attachments instead`);
    }
    return this.detachEvent(app, event, dryRun);
  }

  /** Make the apps run `profile`'s scripts and nothing else of HedgeBuddy's (sync.rs `sync_attachments`). */
  sync(profile: string, dryRun: boolean): SyncReport {
    const report: SyncReport = { profile, attach: [], detach: [], conflicts: [], skipped: [], actions: [], applied: false };
    const pushUnique = (actions: Action[]) => {
      for (const a of actions) {
        if (!report.actions.some((b) => JSON.stringify(b) === JSON.stringify(a))) report.actions.push(a);
      }
    };
    const targets = new Map<string, { app: string; event: string; scripts: string[] }>();
    for (const info of this.store.listScripts(profile)) {
      if (info.manifest_error !== null) {
        report.skipped.push({ script: info.name, reason: info.manifest_error });
        continue;
      }
      const m = info.manifest;
      if (!m || !m.app || !m.event) continue;
      try {
        catalogEvent(catalogApp(m.app), m.event);
      } catch (e) {
        report.skipped.push({ script: info.name, reason: (e as Error).message });
        continue;
      }
      const issues = this.store.checkScript(profile, info.name).issues;
      if (issues.length > 0) {
        report.skipped.push({ script: info.name, reason: `unmet requirements: ${describeIssues(issues)}` });
        continue;
      }
      const key = `${m.app} ${m.event}`;
      const t = targets.get(key) ?? { app: m.app, event: m.event, scripts: [] };
      t.scripts.push(info.name);
      targets.set(key, t);
    }

    const ordered = [...targets.values()].sort((a, b) => (a.app + " " + a.event < b.app + " " + b.event ? -1 : 1));
    for (const { app, event, scripts } of ordered) {
      if (scripts.length > 1) {
        report.conflicts.push({ app, event, scripts });
        continue;
      }
      const script = scripts[0];
      const current = this.attachment(app, event);
      if (this.runsScript(current, profile, script)) continue;
      try {
        pushUnique(this.planAttach(app, event, this.store.scriptPath(profile, script)));
        const item: SyncItem = { app, event, script };
        const replaces = Hedge.replaced(current);
        if (replaces) item.replaces = replaces;
        report.attach.push(item);
      } catch (e) {
        const message = (e as Error).message;
        if (!message.startsWith("not supported: ")) throw e;
        report.skipped.push({ script, reason: message.slice("not supported: ".length) });
      }
    }

    for (const m of CATALOG) {
      for (const e of m.events) {
        if (ordered.some((t) => t.app === m.app.id && t.event === e.id)) continue;
        const state = this.stateOf(m, e);
        if (state.state !== "attached" && state.state !== "staged" && state.state !== "stale") continue;
        const managed = this.managedScript(state.path);
        if (!managed) continue;
        pushUnique(this.planDetach(m.app.id, e.id));
        report.detach.push({ app: m.app.id, event: e.id, script: `${managed.profile}/${managed.script}` });
      }
    }

    if (!dryRun) {
      this.apply(report.actions);
      report.applied = true;
    }
    return report;
  }

  // ---- apps ---------------------------------------------------------------------------------------

  private detect(m: AppManifest): { installed: boolean; version: string | null } {
    const d = m.detect[this.os];
    if (!d) return { installed: false, version: null };
    if (this.os === "windows") {
      if (!d.registry_key || !this.registry.has(d.registry_key)) return { installed: false, version: null };
      if (!d.version_value) return { installed: true, version: null };
      const v = this.registry.get(d.registry_key)?.get(d.version_value);
      return v?.type === "string" && v.data.trim() !== "" ? { installed: true, version: v.data.trim() } : { installed: false, version: null };
    }
    const version = d.app_path ? this.bundles.get(d.app_path) : undefined;
    return version === undefined ? { installed: false, version: null } : { installed: true, version };
  }

  /** What HedgeBuddy knows about one app on this machine (apps.rs `status_of`). */
  status(m: AppManifest): AppStatus {
    const { installed, version } = this.detect(m);
    const scripting = m.scripting[this.os];
    const support: ScriptingSupport = scripting ? scripting.kind : "none";
    let scriptingEnabled: boolean | null = null;
    if (installed && scripting?.kind === "registry") {
      const v = this.registry.get(scripting.key)?.get(scripting.enable_value);
      scriptingEnabled = v?.type === "dword" ? v.data === 1 : false;
    }
    const newer = version !== null && compareVersions(version, m.tested_against) > 0;
    const warnings = newer
      ? [
          `${m.app.name} ${version} is newer than the catalog was tested against (${m.tested_against}); attachment and command details may have changed`,
        ]
      : [];
    return {
      id: m.app.id,
      name: m.app.name,
      installed,
      version,
      tested_against: m.tested_against,
      newer_than_tested: newer,
      requires_pro: m.app.requires_pro,
      scripting: support,
      scripting_enabled: scriptingEnabled,
      warnings,
    };
  }

  /** Every catalog app's status, sorted by id. */
  apps(): AppStatus[] {
    return CATALOG.map((m) => this.status(m));
  }

  /** Whether the catalog knows how to find the app on this platform. */
  availableHere(m: AppManifest): boolean {
    return m.detect[this.os] !== undefined && m.detect[this.os] !== null;
  }

  private presetsDir(m: AppManifest): string | null {
    const spec = m.presets[this.os];
    if (!spec) return null;
    const override = spec.registry_key && spec.location_override_value ? this.registry.get(spec.registry_key)?.get(spec.location_override_value) : undefined;
    return override?.type === "string" && override.data.trim() !== "" ? override.data.trim() : this.expand(spec.dir);
  }

  /** Status, catalog entry and resolved files of one app. */
  describe(app: string): DescribeAppOutput {
    const m = catalogApp(app);
    const files = m.files[this.os];
    return {
      status: this.status(m),
      manifest: structuredClone(m),
      files: {
        callback_log: files?.callback_log ? this.expand(files.callback_log) : null,
        event_log: files?.event_log ? this.expand(files.event_log) : null,
        presets_dir: this.presetsDir(m),
      },
    };
  }

  /** Hedge app files `reveal_path` admits: every app's resolved logs, and anything inside a presets folder. */
  isAppFile(path: string): boolean {
    return CATALOG.some((m) => {
      const d = this.describe(m.app.id).files;
      const logs = [d.callback_log, d.event_log].filter((f): f is string => f !== null);
      return logs.some((f) => this.pathKey(f) === this.pathKey(path)) || (d.presets_dir !== null && this.inside(path, d.presets_dir));
    });
  }
}
