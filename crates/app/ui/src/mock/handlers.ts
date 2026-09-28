import { BridgeError } from "@/api/bridge";
import type { AppCommandName, AppCommandTypes, ToolName, ToolTypes } from "@/api/tools.gen";
import { MOCK_EVENT } from "@/api/events";
import { parseScenario } from "./fixtures";
import { Model } from "./model";

type ToolHandlers = { [N in ToolName]?: (args: ToolTypes[N]["input"]) => ToolTypes[N]["output"] };
type AppHandlers = { [C in AppCommandName]?: (args: AppCommandTypes[C]["input"]) => AppCommandTypes[C]["output"] };

/** Feels like a real round trip, so loading states show. */
const LATENCY_MS = 180;
const pause = () => new Promise((r) => setTimeout(r, LATENCY_MS));

const model = new Model(parseScenario(new URLSearchParams(window.location.search).get("scenario")));

const toolHandlers: ToolHandlers = {
  list_profiles: () => model.listProfiles(),
  get_profile: (args) => model.getProfile(args),
  create_profile: (args) => model.createProfile(args),
  set_active_profile: (args) => model.setActiveProfile(args),
  delete_profile: (args) => model.deleteProfile(args),
  list_vars: (args) => model.listVars(args),
  get_var: (args) => model.getVar(args),
  set_var: (args) => model.setVar(args),
  delete_var: (args) => model.deleteVar(args),
  list_scripts: (args) => model.listScripts(args),
  read_script: (args) => model.readScript(args),
  write_script: (args) => model.writeScript(args),
  delete_script: (args) => model.deleteScript(args),
  check_script: (args) => model.checkScript(args),
  list_attachments: (args) => model.listAttachments(args),
  attach_script: (args) => model.attachScript(args),
  detach_script: (args) => model.detachScript(args),
  sync_attachments: (args) => model.syncAttachments(args),
  clear_stale_attachment: (args) => model.clearStaleAttachment(args),
  list_apps: () => model.listApps(),
  describe_app: (args) => model.describeApp(args),
  list_runs: (args) => model.listRuns(args),
  get_run: (args) => model.getRun(args),
};

const appHandlers: AppHandlers = {
  home_summary: () => model.homeSummary(),
  activity: (args) => model.activity(args),
  preferences_get: () => model.preferencesGet(),
  variables_overview: (args) => model.variablesOverview(args),
  scripts_overview: (args) => model.scriptsOverview(args),
  apps_overview: () => model.appsOverview(),
  path_status: (args) => model.pathStatus(args),
  script_template: (args) => model.scriptTemplate(args),
  export_profile: (args) => model.exportProfile(args),
  import_profile: (args) => model.importProfile(args),
  open_in_editor: (args) => model.openInEditor(args),
  reveal_path: (args) => model.revealPath(args),
  open_app_docs: (args) => model.openAppDocs(args),
  pick_folder: () => model.pickFolder(),
  pick_export_path: (args) => model.pickExportPath(args),
  pick_import_file: () => model.pickImportFile(),
};

/** What takes the data folder's write lock, as in the real app: every non-read tool (dry runs too), import, preferences. */
const WRITES = new Set<string>([
  "create_profile",
  "set_active_profile",
  "delete_profile",
  "set_var",
  "delete_var",
  "write_script",
  "delete_script",
  "attach_script",
  "detach_script",
  "sync_attachments",
  "clear_stale_attachment",
  "import_profile",
  "preferences_set",
]);

/** In `busy`, the writes that report busy: every write unless narrowed with `window.__hb.busy([...])`. */
let busyWrites: ReadonlySet<string> = WRITES;

function check(name: string) {
  if (model.scenario === "error") throw new BridgeError("error", "cannot read hedgebuddy.json: invalid JSON at line 1");
  if (model.scenario === "busy" && busyWrites.has(name)) throw new BridgeError("busy", "another HedgeBuddy is busy; try again");
}

/** Run a handler: a copy of its result (so screens never share the model's objects), then the watcher's event. */
function run<A, R>(handler: ((a: A) => R) | undefined, name: string, args: A): R {
  if (!handler) throw new BridgeError("error", `${name} is not available in the preview`);
  let result: R;
  try {
    result = structuredClone(handler(args));
  } catch (e) {
    model.takeChanges();
    throw e instanceof BridgeError ? e : new BridgeError("error", e instanceof Error ? e.message : String(e));
  }
  const changed = model.takeChanges();
  if (changed.length > 0) emit(changed);
  return result;
}

export async function callTool<N extends ToolName>(name: N, args: ToolTypes[N]["input"]): Promise<ToolTypes[N]["output"]> {
  await pause();
  check(name);
  return run(toolHandlers[name] as ((a: ToolTypes[N]["input"]) => ToolTypes[N]["output"]) | undefined, name, args);
}

export async function callApp<C extends AppCommandName>(name: C, args: AppCommandTypes[C]["input"]): Promise<AppCommandTypes[C]["output"]> {
  await pause();
  check(name);
  return run(appHandlers[name] as ((a: AppCommandTypes[C]["input"]) => AppCommandTypes[C]["output"]) | undefined, name, args);
}

/** Fire a fake `data-changed`, as the app does when files in the data folder change. */
function emit(categories: string[]) {
  window.dispatchEvent(new CustomEvent(MOCK_EVENT, { detail: { categories } }));
}

/**
 * Narrow which writes report busy in the `busy` scenario, e.g. `["set_active_profile"]` to fail only the
 * second step of creating and activating a profile; `null` restores every write.
 */
function busy(names: string[] | null) {
  busyWrites = names === null ? WRITES : new Set(names);
}

declare global {
  interface Window {
    __hb?: { emit: (categories: string[]) => void; busy: (names: string[] | null) => void; scenario: string };
  }
}
window.__hb = { emit, busy, scenario: model.scenario };
