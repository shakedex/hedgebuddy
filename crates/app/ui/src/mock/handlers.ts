import { BridgeError } from "@/api/bridge";
import type { AppCommandName, AppCommandTypes, ToolName, ToolTypes } from "@/api/tools.gen";
import { MOCK_EVENT } from "@/api/events";
import { loadScenario } from "./fixtures";

type ToolHandlers = { [N in ToolName]?: (args: ToolTypes[N]["input"]) => ToolTypes[N]["output"] };
type AppHandlers = { [C in AppCommandName]?: (args: AppCommandTypes[C]["input"]) => AppCommandTypes[C]["output"] };

/** Feels like a real round trip, so loading states show. */
const LATENCY_MS = 180;
const pause = () => new Promise((r) => setTimeout(r, LATENCY_MS));

const data = loadScenario(new URLSearchParams(window.location.search).get("scenario") ?? "problems");

const toolHandlers: ToolHandlers = {
  list_profiles: () => data.listProfiles(),
  list_runs: (args) => data.listRuns(args),
  get_run: (args) => data.getRun(args.run_id),
  set_active_profile: (args) => data.setActive(args.name),
  create_profile: (args) => data.createProfile(args.name, args.description ?? ""),
};

const appHandlers: AppHandlers = {
  home_summary: () => data.homeSummary(),
  activity: (args) => data.activity(args.limit ?? 200),
  preferences_get: () => data.preferences(),
};

const WRITES = new Set<string>(["set_active_profile", "create_profile", "preferences_set"]);

/** In `busy`, the writes that report busy: every write unless narrowed with `window.__hb.busy([...])`. */
let busyWrites: ReadonlySet<string> = WRITES;

function check(name: string) {
  if (data.scenario === "error") throw new BridgeError("error", "cannot read hedgebuddy.json: invalid JSON at line 1");
  if (data.scenario === "busy" && busyWrites.has(name)) throw new BridgeError("busy", "another HedgeBuddy is busy; try again");
}

export async function callTool<N extends ToolName>(name: N, args: ToolTypes[N]["input"]): Promise<ToolTypes[N]["output"]> {
  await pause();
  check(name);
  const handler = toolHandlers[name] as ((a: ToolTypes[N]["input"]) => ToolTypes[N]["output"]) | undefined;
  if (!handler) throw new BridgeError("error", `${name} is not available in the preview`);
  const result = handler(args);
  if (WRITES.has(name)) emit(["index"]);
  return result;
}

export async function callApp<C extends AppCommandName>(name: C, args: AppCommandTypes[C]["input"]): Promise<AppCommandTypes[C]["output"]> {
  await pause();
  check(name);
  const handler = appHandlers[name] as ((a: AppCommandTypes[C]["input"]) => AppCommandTypes[C]["output"]) | undefined;
  if (!handler) throw new BridgeError("error", `${name} is not available in the preview`);
  return handler(args);
}

/** Fire a fake `data-changed`, as the app does when files change. */
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
window.__hb = { emit, busy, scenario: data.scenario };
