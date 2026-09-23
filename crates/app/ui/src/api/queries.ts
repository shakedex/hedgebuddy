import { QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { BridgeError, callApp, callTool } from "./bridge";
import type { AppCommandName, AppCommandTypes, ToolName, ToolTypes } from "./tools.gen";

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
  index: ["list_profiles", "get_profile", "list_runs", "home_summary"],
  runs: ["list_runs", "get_run", "home_summary"],
  activity: ["activity", "home_summary"],
  preferences: ["preferences_get"],
  catalog: ["list_apps", "describe_app", "list_attachments", "home_summary"],
};
const PROFILE: Name[] = ["list_profiles", "get_profile", "list_vars", "get_var", "home_summary"];
const SCRIPTS: Name[] = ["list_scripts", "read_script", "check_script", "get_profile", "list_attachments", "home_summary"];

function namesFor(category: string): Name[] {
  if (category.startsWith("profile:")) return PROFILE;
  if (category.startsWith("scripts:")) return SCRIPTS;
  return RELOAD[category] ?? [];
}

/** Reload the queries that read what changed. */
export function invalidateFor(categories: string[]) {
  const names = new Set<string>(categories.flatMap(namesFor));
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

/** Create a profile; with `activate`, also make it active (the first profile becomes active by itself). */
export function useCreateProfile() {
  return useMutation({
    mutationFn: async (v: { name: string; description: string; activate: boolean }) => {
      const created = await callTool("create_profile", { name: v.name, description: v.description });
      if (v.activate && !created.active) await callTool("set_active_profile", { name: v.name });
      return created;
    },
    onSuccess: () => invalidateFor(["index"]),
  });
}
