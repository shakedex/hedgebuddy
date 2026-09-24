import { useRef } from "react";
import { keepPreviousData, QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { BridgeError, callApp, callTool } from "./bridge";
import type { AppCommandName, AppCommandTypes, CreateProfileOutput, ToolName, ToolTypes } from "./tools.gen";

/** `path_status`'s own limit (its input's doc comment: "at most 64"). */
const PATH_STATUS_LIMIT = 64;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Retry only "busy": another HedgeBuddy finishes its write in moments.
      retry: (failures, error) => error instanceof BridgeError && error.kind === "busy" && failures < 2,
    },
  },
});

type Name = ToolName | AppCommandName;

export const queryKey = {
  tool: <N extends ToolName>(name: N, args: ToolTypes[N]["input"]) => ["tool", name, args] as const,
  app: <C extends AppCommandName>(name: C, args: AppCommandTypes[C]["input"]) => ["app", name, args] as const,
};

/** Which queries each `data-changed` category makes stale. Home's summary reads nearly everything. */
const RELOAD: Record<string, Name[]> = {
  index: ["list_profiles", "get_profile", "list_runs", "home_summary", "variables_overview", "scripts_overview"],
  runs: ["list_runs", "get_run", "home_summary"],
  activity: ["activity", "home_summary"],
  preferences: ["preferences_get"],
  catalog: ["list_apps", "describe_app", "list_attachments", "home_summary", "apps_overview", "scripts_overview"],
};
const PROFILE: Name[] = ["list_profiles", "get_profile", "list_vars", "get_var", "home_summary", "variables_overview", "scripts_overview"];
const SCRIPTS: Name[] = [
  "list_scripts",
  "read_script",
  "check_script",
  "get_profile",
  "list_attachments",
  "home_summary",
  "scripts_overview",
  "variables_overview",
];

/** Hedge app state (registry, workspace files): no `data-changed` covers it, so every attach, detach, sync
 *  and clear-stale calls this on success instead. */
const HEDGE_STATE: Name[] = ["scripts_overview", "apps_overview", "list_attachments", "describe_app", "home_summary"];

function namesFor(category: string): Name[] {
  if (category.startsWith("profile:")) return PROFILE;
  if (category.startsWith("scripts:")) return SCRIPTS;
  return RELOAD[category] ?? [];
}

/**
 * Reload the queries that read what changed. Returns the refetch's promise (most callers ignore it, fire-
 * and-forget) for the rare caller that needs to know the reload has actually landed before it does something
 * that depends on the new data — e.g. redirecting to a just-created row's own page, where a fresh mount there
 * would otherwise read the still-stale cache and conclude the row doesn't exist yet.
 */
export function invalidateFor(categories: string[]): Promise<void> {
  const names = new Set<string>(categories.flatMap(namesFor));
  return queryClient.invalidateQueries({ predicate: (q) => names.has(String(q.queryKey[1])) });
}

/** Reload everything that reads Hedge app settings (spec §6.4-6.5): call on every successful attach,
 *  detach, sync and clear-stale, since those change the registry or a workspace file, not the data folder. */
export function invalidateHedgeState() {
  const names = new Set<string>(HEDGE_STATE);
  void queryClient.invalidateQueries({ predicate: (q) => names.has(String(q.queryKey[1])) });
}

/** Everything Home and the sidebar badges show. Hedge app state lives outside the data folder, so it also reloads when the window regains focus. */
export function useHomeSummary() {
  return useQuery({
    queryKey: queryKey.app("home_summary", {}),
    queryFn: () => callApp("home_summary", {}),
    refetchOnWindowFocus: true,
  });
}

export function useProfiles() {
  return useQuery({ queryKey: queryKey.tool("list_profiles", {}), queryFn: () => callTool("list_profiles", {}) });
}

/**
 * Runs of one profile, or of every profile when `profile` is null. `enabled` (default true) lets a caller
 * hold off fetching until it actually knows which profile to scope to, e.g. until `home_summary` resolves
 * `active_profile` — otherwise a screen would fetch every profile's runs first, then immediately refetch
 * scoped to the active one once it's known.
 */
export function useRuns(profile: string | null, enabled = true) {
  const args: ToolTypes["list_runs"]["input"] = profile ? { profile, limit: 1000 } : { limit: 1000 };
  return useQuery({ queryKey: queryKey.tool("list_runs", args), queryFn: () => callTool("list_runs", args), enabled });
}

export function useRun(runId: string | null) {
  const args = { run_id: runId ?? "" };
  return useQuery({
    queryKey: queryKey.tool("get_run", args),
    queryFn: () => callTool("get_run", args),
    enabled: runId !== null,
  });
}

export function useActivateProfile() {
  return useMutation({
    mutationFn: (name: string) => callTool("set_active_profile", { name }),
    onSuccess: () => invalidateFor(["index"]),
  });
}

/**
 * Create a profile; with `activate`, also make it active (the first profile becomes active by itself).
 *
 * These are two writes, and the second can fail on its own (another HedgeBuddy is busy). The hook remembers
 * a profile it created whose activation has not gone through yet, so Try again only activates it instead of
 * creating it a second time and failing with "already exists".
 */
export function useCreateProfile() {
  const createdNotActivated = useRef<{ name: string; created: CreateProfileOutput } | null>(null);
  return useMutation({
    mutationFn: async (v: { name: string; description: string; activate: boolean }) => {
      const earlier = createdNotActivated.current;
      let created: CreateProfileOutput;
      if (earlier !== null && earlier.name === v.name) {
        created = earlier.created;
      } else {
        created = await callTool("create_profile", { name: v.name, description: v.description });
        createdNotActivated.current = { name: v.name, created };
      }
      if (v.activate && !created.active) await callTool("set_active_profile", { name: v.name });
      createdNotActivated.current = null;
      return created;
    },
    // Settled, not only succeeded: when activation fails, the profile was still created.
    onSettled: () => invalidateFor(["index"]),
  });
}

/** The Variables screen (§6.3): the active profile's variables plus what its scripts require. */
export function useVariablesOverview() {
  return useQuery({ queryKey: queryKey.app("variables_overview", {}), queryFn: () => callApp("variables_overview", {}) });
}

/**
 * The Scripts screen (§6.4): the active profile's scripts and what each targets now. Attachment state lives
 * in the Hedge app's own settings, outside the data folder, so this also refetches on window focus.
 */
export function useScriptsOverview() {
  return useQuery({
    queryKey: queryKey.app("scripts_overview", {}),
    queryFn: () => callApp("scripts_overview", {}),
    refetchOnWindowFocus: true,
  });
}

/** The Hedge apps screen (§6.5): every catalog app and its status. Outside the data folder, so it also
 *  refetches on window focus. */
export function useAppsOverview() {
  return useQuery({
    queryKey: queryKey.app("apps_overview", {}),
    queryFn: () => callApp("apps_overview", {}),
    refetchOnWindowFocus: true,
  });
}

/** One app's event table. `null` while no app is selected. */
export function useAttachments(app: string | null) {
  const args: ToolTypes["list_attachments"]["input"] = { app: app ?? "" };
  return useQuery({
    queryKey: queryKey.tool("list_attachments", args),
    queryFn: () => callTool("list_attachments", args),
    enabled: app !== null,
    refetchOnWindowFocus: true,
  });
}

/** One app's full catalog entry and resolved files, for its detail pane. `null` while no app is selected. */
export function useAppDescription(app: string | null) {
  const args: ToolTypes["describe_app"]["input"] = { app: app ?? "" };
  return useQuery({
    queryKey: queryKey.tool("describe_app", args),
    queryFn: () => callTool("describe_app", args),
    enabled: app !== null,
    refetchOnWindowFocus: true,
  });
}

/**
 * Whether each path exists and its drive is mounted (a path-typed variable's "not mounted" warning). Keyed
 * on the sorted, deduplicated, non-empty paths so re-renders with the same set share one cache entry. Over
 * the limit, only the first 64 distinct paths (in the order given) are checked rather than refusing the
 * whole call. `placeholderData` keeps the previous answer on screen while a new set of paths is checked, so
 * a caller that debounces its input (typing a path, editing a list) doesn't flash back to "unknown" between
 * keystrokes and the next settled query.
 */
export function usePathStatus(paths: string[]) {
  const seen = new Set<string>();
  const capped: string[] = [];
  for (const p of paths) {
    if (p.length === 0 || seen.has(p)) continue;
    seen.add(p);
    capped.push(p);
    if (capped.length === PATH_STATUS_LIMIT) break;
  }
  const unique = capped.sort();
  const args: AppCommandTypes["path_status"]["input"] = { paths: unique };
  return useQuery({
    queryKey: queryKey.app("path_status", args),
    queryFn: () => callApp("path_status", args),
    enabled: unique.length > 0,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

/** A script's source, for the read-only preview. `null` while no script is selected. */
export function useScriptSource(name: string | null) {
  const args: ToolTypes["read_script"]["input"] = { name: name ?? "" };
  return useQuery({
    queryKey: queryKey.tool("read_script", args),
    queryFn: () => callTool("read_script", args),
    enabled: name !== null,
  });
}

/** A script's manifest and requirement check. Starts Python, so it is cached longer than the default. */
export function useScriptCheck(name: string | null) {
  const args: ToolTypes["check_script"]["input"] = { name: name ?? "" };
  return useQuery({
    queryKey: queryKey.tool("check_script", args),
    queryFn: () => callTool("check_script", args),
    enabled: name !== null,
    staleTime: 30_000,
  });
}
