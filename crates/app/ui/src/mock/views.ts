/**
 * What Home and the editing screens list, derived from the model the way the app's commands derive it
 * (crates/tools/src/app/home.rs and overview.rs), so Home, the sidebar badges and the Variables, Scripts
 * and Hedge apps screens always agree with each other and with the tools.
 */
import type {
  ActivityRecord,
  AppsOverviewOutput,
  AttachState,
  AttentionItem,
  HomeSummaryOutput,
  Manifest,
  PythonStatus,
  RequirementRow,
  Run,
  ScriptRow,
  ScriptsOverviewOutput,
  TargetAttachment,
  VariableProblem,
  VariablesOverviewOutput,
  VarType,
  VarView,
} from "@/api/tools.gen";
import { CATALOG, catalogApp, catalogEvent } from "./catalog";
import type { Hedge } from "./hedge";
import type { ResolvedVariable, Store } from "./store";

/** What a masked secret value looks like (variables.rs). */
const MASK = "********";
const RECENT_RUNS = 5;
const RECENT_ACTIVITY = 3;
const FAILED_RUNS_LISTED = 3;

/** A variable as the tools return it, the secret value masked unless `reveal`. */
export function varView(v: ResolvedVariable, reveal: boolean): VarView {
  const masked = v.type === "secret" && !reveal;
  const value = v.value === null ? null : masked ? MASK : (structuredClone(v.value) as VarView["value"]);
  return { name: v.name, type: v.type, description: v.description, value, missing: v.value === null };
}

/** `null` when the manifest's app and event are in the catalog, else why not (sync.rs `validate_manifest`). */
export function catalogError(m: Manifest): string | null {
  try {
    if (m.app) {
      const app = catalogApp(m.app);
      if (m.event) catalogEvent(app, m.event);
    }
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

function isFailure(r: Run): boolean {
  return r.status === "failed" || r.status === "error";
}

/** The profile's unmet requirements, one item per variable, sorted by name. */
function variableIssues(store: Store, profile: string): AttentionItem[] {
  const byName = new Map<string, { type: VarType; problem: VariableProblem; actual: VarType | null; scripts: string[] }>();
  for (const info of store.listScripts(profile)) {
    if (!info.manifest) continue;
    for (const issue of store.checkScript(profile, info.name).issues) {
      const entry =
        byName.get(issue.name) ??
        (issue.kind === "missing"
          ? { type: issue.ty, problem: "missing" as const, actual: null, scripts: [] }
          : { type: issue.expected, problem: "type_mismatch" as const, actual: issue.actual, scripts: [] });
      entry.scripts.push(info.name);
      byName.set(issue.name, entry);
    }
  }
  return [...byName.keys()].sort().map((name) => {
    const e = byName.get(name)!;
    return { kind: "variable_issue", name, type: e.type, problem: e.problem, actual: e.actual, scripts: e.scripts };
  });
}

/** Everything Home shows, in one call. */
export function homeSummary(
  store: Store,
  hedge: Hedge,
  python: PythonStatus,
  history: { runs: Run[]; activity: ActivityRecord[]; since: string | null },
): HomeSummaryOutput {
  const { runs, activity, since } = history;
  const newRuns = since === null ? runs : runs.filter((r) => r.started_at > since);
  const failed = newRuns.filter(isFailure);
  const attention: AttentionItem[] = failed.slice(0, FAILED_RUNS_LISTED).map((r) => ({
    kind: "run_failed",
    run_id: r.run_id,
    script: r.script,
    profile: r.profile,
    started_at: r.started_at,
  }));
  if (failed.length > FAILED_RUNS_LISTED) attention.push({ kind: "more_failed_runs", count: failed.length - FAILED_RUNS_LISTED });

  const active = store.activeProfile;
  const variableItems = active === null ? [] : variableIssues(store, active);
  attention.push(...variableItems);

  let staleTotal = 0;
  const attached = new Set<string>();
  const staleItems: AttentionItem[] = [];
  const newerItems: AttentionItem[] = [];
  const offItems: AttentionItem[] = [];
  for (const status of hedge.apps()) {
    if (status.installed && status.newer_than_tested && status.version !== null) {
      newerItems.push({ kind: "app_newer", app: status.id, app_name: status.name, version: status.version, tested_against: status.tested_against });
    }
    let stale = 0;
    let inUse = 0;
    for (const e of hedge.attachments(status.id)) {
      if (e.state === "stale") stale++;
      if (e.state === "attached" || e.state === "staged" || e.state === "external") inUse++;
      if (e.state === "attached" && e.profile === active) attached.add(e.script);
      if (e.state === "staged") {
        const managed = hedge.managedScript(e.path);
        if (managed && managed.profile === active) attached.add(managed.script);
      }
    }
    if (stale > 0) {
      staleTotal += stale;
      staleItems.push({ kind: "stale_entries", app: status.id, app_name: status.name, count: stale });
    }
    if (status.scripting_enabled === false && inUse > 0) {
      offItems.push({ kind: "scripting_off", app: status.id, app_name: status.name, events: inUse });
    }
  }
  // Grouped by kind across apps (spec §6.1): stale entries, the package problem, newer apps, scripting off.
  attention.push(...staleItems);
  if (python.problem !== null) {
    attention.push({ kind: "package_problem", python_found: python.found, installed: python.installed, required: python.required });
  }
  attention.push(...newerItems, ...offItems);

  return {
    since,
    active_profile: active,
    profiles: store.listProfiles(),
    counts: {
      runs_since: newRuns.length,
      failed_since: failed.length,
      scripts_attached: attached.size,
      variables: active === null ? 0 : Object.keys(store.profile(active).variables).length,
    },
    badges: { runs: failed.length, variables: variableItems.length, apps: staleTotal, settings: python.problem !== null ? 1 : 0 },
    attention,
    recent_runs: runs.slice(0, RECENT_RUNS),
    recent_activity: activity.slice(0, RECENT_ACTIVITY),
    python,
  };
}

/** The profile's variables (masked) and every variable its scripts require, with whether it is met. */
export function variablesOverview(store: Store, profile: string): VariablesOverviewOutput {
  const resolved = store.listVariables(profile);
  const valued = new Set(resolved.filter((v) => v.value !== null).map((v) => v.name));
  const rows = new Map<string, RequirementRow>();
  for (const info of store.listScripts(profile)) {
    if (!info.manifest) continue;
    const check = store.checkScript(profile, info.name);
    const manifest = check.manifest!;
    for (const name of Object.keys(manifest.requires).sort()) {
      const req = manifest.requires[name];
      const row = rows.get(name) ?? { name, type: req.type, description: "", has_default: false, required_by: [], state: "set", actual: null };
      if (row.description === "") row.description = req.description;
      row.has_default ||= req.default !== undefined;
      row.required_by.push({ script: info.name, app: manifest.app ?? null, event: manifest.event ?? null });
      rows.set(name, row);
    }
    for (const issue of check.issues) {
      const row = rows.get(issue.name);
      if (!row) continue;
      if (issue.kind === "type_mismatch") {
        row.state = "type_mismatch";
        row.actual = issue.actual;
      } else if (row.state !== "type_mismatch") {
        row.state = "missing";
      }
    }
  }
  for (const row of rows.values()) {
    if (row.state === "set" && !valued.has(row.name)) row.state = "defaulted";
  }
  return {
    profile,
    variables: resolved.map((v) => varView(v, false)),
    requirements: [...rows.keys()].sort().map((k) => rows.get(k)!),
  };
}

/** What a target event's state means for `profile/script` (overview.rs `target_attachment`). */
function targetAttachment(hedge: Hedge, state: AttachState, profile: string, script: string): TargetAttachment {
  switch (state.state) {
    case "attached":
      return state.profile === profile && state.script === script
        ? { state: "attached" }
        : { state: "other_script", profile: state.profile, script: state.script };
    case "staged": {
      const managed = hedge.managedScript(state.path);
      if (!managed) return { state: "external", path: state.path };
      return managed.profile === profile && managed.script === script ? { state: "staged" } : { state: "other_script", ...managed };
    }
    case "external":
      return { state: "external", path: state.path };
    case "stale":
      return { state: "stale", path: state.path };
    case "detached":
      return { state: "free" };
    case "manual":
      return { state: "manual", note: state.note };
    case "unsupported":
      return { state: "unsupported" };
  }
}

/** The profile's scripts, each with its target event, what that event runs now, and its unmet requirements. */
export function scriptsOverview(store: Store, hedge: Hedge, profile: string): ScriptsOverviewOutput {
  const scripts = store.listScripts(profile).map((info): ScriptRow => {
    let target: ScriptRow["target"] = null;
    let catalog_error: string | null = null;
    if (info.manifest) {
      catalog_error = catalogError(info.manifest);
      if (catalog_error === null && info.manifest.app && info.manifest.event) {
        target = { app: info.manifest.app, app_name: catalogApp(info.manifest.app).app.name, event: info.manifest.event };
      }
    }
    return {
      name: info.name,
      path: store.scriptPath(profile, info.name),
      manifest: info.manifest,
      manifest_error: info.manifest_error,
      target,
      catalog_error,
      attachment: target === null ? { state: "no_target" } : targetAttachment(hedge, hedge.attachment(target.app, target.event), profile, info.name),
      attached_to: hedge.attachedTo(profile, info.name),
      unmet: info.manifest ? store.checkScript(profile, info.name).issues : [],
    };
  });
  return { profile, scripts };
}

/** Every catalog app with its status, whether it can exist here, and how many events run or miss a file. */
export function appsOverview(hedge: Hedge): AppsOverviewOutput {
  return {
    os: hedge.os,
    apps: CATALOG.map((m) => {
      let attached = 0;
      let stale = 0;
      for (const a of hedge.attachments(m.app.id)) {
        if (a.state === "attached" || a.state === "staged" || a.state === "external") attached++;
        if (a.state === "stale") stale++;
      }
      return {
        status: hedge.status(m),
        available_here: hedge.availableHere(m),
        docs: m.app.docs,
        events: m.events.map((e) => ({ id: e.id, description: e.description })),
        attached,
        stale,
      };
    }),
  };
}
