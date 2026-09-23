/**
 * One in-memory data set per browser-preview scenario, built from the
 * generated types so a Rust result change the preview can no longer satisfy
 * fails `bun run typecheck`. Every timestamp is relative to `Date.now()`, so
 * "Today" and "since you last opened" always have content no matter when
 * the preview runs.
 */
import { BridgeError } from "@/api/bridge";
import type {
  ActivityOutput,
  ActivityRecord,
  AttentionItem,
  CreateProfileOutput,
  HomeCounts,
  HomeSummaryOutput,
  ListProfilesOutput,
  ListRunsInput,
  ListRunsOutput,
  PreferencesGetOutput,
  Profile,
  PythonStatus,
  Run,
  SetActiveProfileOutput,
  SidebarBadges,
} from "@/api/tools.gen";

export type Scenario = "problems" | "healthy" | "empty" | "error" | "busy";

const SCENARIOS: readonly Scenario[] = ["problems", "healthy", "empty", "error", "busy"];

/** Unknown `?scenario=` values fall back to the default, `problems`. */
export function parseScenario(raw: string | null): Scenario {
  return (SCENARIOS as readonly string[]).includes(raw ?? "") ? (raw as Scenario) : "problems";
}

/** The version this preview's fixtures pretend HedgeBuddy needs (matches the workspace version). */
const REQUIRED_VERSION = "0.11.0";

const OFFSHOOT = "offshoot";
const OFFSHOOT_NAME = "OffShoot";
const FOOLCAT = "foolcat";

const URLLIB_TRACEBACK = [
  "Traceback (most recent call last):",
  '  File "on_copy_complete.py", line 24, in main',
  "    urllib.request.urlopen(request, timeout=10)",
  "urllib.error.URLError: <urlopen error timed out>",
].join("\n");

const RUNTIME_ERROR_TRACEBACK = [
  "Traceback (most recent call last):",
  '  File "on_copy_complete.py", line 41, in main',
  '    raise RuntimeError(f"unexpected state: {state}")',
  "RuntimeError: unexpected state: verifying",
].join("\n");

/** `minutesAgo` minutes before now, as an RFC 3339 timestamp. */
function ago(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

/** One run. Omitting `status` makes it unfinished (no end record yet). */
function run(opts: {
  id: string;
  startMinutesAgo: number;
  durationSeconds: number;
  script: string;
  profile: string;
  app?: string;
  event?: string;
  status?: "ok" | "failed" | "error";
  exitCode?: number;
  traceback?: string;
  logMessage?: string;
}): Run {
  const ended = opts.status !== undefined;
  const endMinutesAgo = opts.startMinutesAgo - opts.durationSeconds / 60;
  const midMinutesAgo = opts.startMinutesAgo - opts.durationSeconds / 60 / 2;
  return {
    run_id: opts.id,
    started_at: ago(opts.startMinutesAgo),
    app: opts.app ?? null,
    event: opts.event ?? null,
    script: opts.script,
    profile: opts.profile,
    logs: opts.logMessage ? [{ ts: ago(midMinutesAgo), message: opts.logMessage }] : [],
    ended_at: ended ? ago(endMinutesAgo) : null,
    status: ended ? (opts.status as Run["status"]) : null,
    exit_code: ended ? opts.exitCode ?? (opts.status === "ok" ? 0 : 1) : null,
    traceback: opts.traceback ?? null,
  };
}

/**
 * Every run: today (some before the two-hour `since` cutoff, most after),
 * yesterday, and two days ago. `healthy` turns the one `failed` and one
 * `error` run today into `ok`, so the `healthy` scenario shares this same
 * shape with zero failures.
 */
function buildRuns(healthy: boolean): Run[] {
  const runs: Run[] = [
    // Today, before the "since" cutoff (2 hours ago): these do not count
    // towards "runs since you last opened".
    run({
      id: "copy-170",
      startMinutesAgo: 170,
      durationSeconds: 1.1,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
      status: "ok",
    }),
    run({
      id: "disk-150",
      startMinutesAgo: 150,
      durationSeconds: 0.6,
      script: "on_disk_added.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "DiskAdded",
      status: "ok",
    }),
    run({
      id: "copy-135",
      startMinutesAgo: 135,
      durationSeconds: 0.8,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
      status: "ok",
    }),

    // Today, after the cutoff (14 runs: this is the mockup's "14-ish runs
    // since you last opened").
    run({
      id: "copy-115",
      startMinutesAgo: 115,
      durationSeconds: 0.9,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
      status: "ok",
    }),
    run({
      id: "disk-108",
      startMinutesAgo: 108,
      durationSeconds: 0.5,
      script: "on_disk_added.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "DiskAdded",
      status: "ok",
    }),
    run({
      id: "copy-95",
      startMinutesAgo: 95,
      durationSeconds: 1.4,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
      status: "ok",
    }),
    run({
      id: "copy-88",
      startMinutesAgo: 88,
      durationSeconds: 0.7,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
      status: "ok",
    }),
    run({
      id: "disk-80",
      startMinutesAgo: 80,
      durationSeconds: 0.3,
      script: "on_disk_added.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "DiskAdded",
      status: "ok",
    }),
    run({
      id: "copy-70",
      startMinutesAgo: 70,
      durationSeconds: 2.0,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
      status: "ok",
    }),
    run({
      id: "copy-60-failed",
      startMinutesAgo: 60,
      durationSeconds: 1.0,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
      status: healthy ? "ok" : "failed",
      logMessage: "copy of A003 finished, posting to Slack",
      traceback: healthy ? undefined : URLLIB_TRACEBACK,
    }),
    run({
      id: "copy-50-error",
      startMinutesAgo: 50,
      durationSeconds: 0.4,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
      status: healthy ? "ok" : "error",
      traceback: healthy ? undefined : RUNTIME_ERROR_TRACEBACK,
    }),
    run({
      id: "disk-42",
      startMinutesAgo: 42,
      durationSeconds: 0.6,
      script: "on_disk_added.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "DiskAdded",
      status: "ok",
    }),
    run({
      id: "copy-35",
      startMinutesAgo: 35,
      durationSeconds: 1.2,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
      status: "ok",
    }),
    run({
      id: "report-28",
      startMinutesAgo: 28,
      durationSeconds: 1.8,
      script: "foolcat_report.py",
      profile: "commercial-one-day",
      app: FOOLCAT,
      event: "ReportCreated",
      status: "ok",
    }),
    run({
      id: "docseries-20",
      startMinutesAgo: 20,
      durationSeconds: 3.5,
      script: "render_proxies.py",
      profile: "doc-series",
      status: "ok",
    }),
    run({
      // No `status`: still running when the preview loaded.
      id: "copy-15-unfinished",
      startMinutesAgo: 15,
      durationSeconds: 0,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
    }),
    run({
      id: "docseries-8",
      startMinutesAgo: 8,
      durationSeconds: 4.2,
      script: "transcode_interview.py",
      profile: "doc-series",
      status: "ok",
    }),

    // Yesterday: a handful of ok runs.
    run({
      id: "y-copy-1",
      startMinutesAgo: 24 * 60 + 30,
      durationSeconds: 1.0,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
      status: "ok",
    }),
    run({
      id: "y-disk-1",
      startMinutesAgo: 24 * 60 + 60,
      durationSeconds: 0.5,
      script: "on_disk_added.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "DiskAdded",
      status: "ok",
    }),
    run({
      id: "y-copy-2",
      startMinutesAgo: 24 * 60 + 95,
      durationSeconds: 0.8,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
      status: "ok",
    }),
    run({
      id: "y-docseries-1",
      startMinutesAgo: 24 * 60 + 140,
      durationSeconds: 2.5,
      script: "render_proxies.py",
      profile: "doc-series",
      status: "ok",
    }),

    // Two days ago: a handful of ok runs.
    run({
      id: "d2-copy-1",
      startMinutesAgo: 2 * 24 * 60 + 45,
      durationSeconds: 0.9,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
      status: "ok",
    }),
    run({
      id: "d2-disk-1",
      startMinutesAgo: 2 * 24 * 60 + 80,
      durationSeconds: 0.4,
      script: "on_disk_added.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "DiskAdded",
      status: "ok",
    }),
    run({
      id: "d2-copy-2",
      startMinutesAgo: 2 * 24 * 60 + 130,
      durationSeconds: 1.3,
      script: "on_copy_complete.py",
      profile: "commercial-one-day",
      app: OFFSHOOT,
      event: "FileCopyCompleted",
      status: "ok",
    }),
  ];
  // Newest first, as list_runs and get_run's caller expect.
  return runs.sort((a, b) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0));
}

function buildActivity(): ActivityRecord[] {
  // Newest first.
  return [
    { ts: ago(2), tool: "sync_attachments", target: "commercial-one-day", outcome: "ok" },
    { ts: ago(6), tool: "write_script", target: "on_copy_complete.py", outcome: "ok" },
    { ts: ago(11), tool: "run_app_command", target: "offshoot", outcome: "needs_confirmation" },
    { ts: ago(18), tool: "get_var", target: "NOPE", outcome: "error" },
  ];
}

function isFailure(status: Run["status"]): boolean {
  return status === "failed" || status === "error";
}

/** Runs since `sinceIso` (every run, newest first, when it is null) and, of those, the failed ones. */
function sinceSplit(runs: Run[], sinceIso: string | null): { newRuns: Run[]; failed: Run[] } {
  const newRuns = sinceIso === null ? runs : runs.filter((r) => r.started_at > sinceIso);
  return { newRuns, failed: newRuns.filter((r) => isFailure(r.status)) };
}

const FAILED_RUNS_LISTED = 3;

/** `run_failed` for the newest failures, then one `more_failed_runs` for the rest. */
function attentionFromFailures(failed: Run[]): AttentionItem[] {
  const items: AttentionItem[] = failed.slice(0, FAILED_RUNS_LISTED).map((r) => ({
    kind: "run_failed",
    run_id: r.run_id,
    script: r.script,
    profile: r.profile,
    started_at: r.started_at,
  }));
  if (failed.length > FAILED_RUNS_LISTED) {
    items.push({ kind: "more_failed_runs", count: failed.length - FAILED_RUNS_LISTED });
  }
  return items;
}

/** The scenario's fixed problems, beyond whatever the runs themselves produce: none when `healthy`. */
function fixedAttention(healthy: boolean): AttentionItem[] {
  if (healthy) return [];
  return [
    {
      kind: "variable_issue",
      name: "CLIENT_EMAIL",
      type: "string",
      problem: "missing",
      actual: null,
      scripts: ["on_copy_complete.py"],
    },
    { kind: "stale_entries", app: OFFSHOOT, app_name: OFFSHOOT_NAME, count: 3 },
    { kind: "package_problem", python_found: true, installed: "0.10.0", required: REQUIRED_VERSION },
    { kind: "app_newer", app: OFFSHOOT, app_name: OFFSHOOT_NAME, version: "26.2 (1)", tested_against: "26.1" },
  ];
}

function pythonStatus(healthy: boolean): PythonStatus {
  return {
    found: true,
    executable: "C:\\Python313\\python.exe",
    version: "3.13.5",
    installed: healthy ? REQUIRED_VERSION : "0.10.0",
    required: REQUIRED_VERSION,
    problem: healthy
      ? null
      : `the installed hedgebuddy package is 0.10.0; this HedgeBuddy needs ${REQUIRED_VERSION}`,
  };
}

/** Everything one scenario's mock handlers read and write. */
export interface ScenarioData {
  /** The scenario this data was built for (drives `handlers.ts`'s error/busy injection). */
  scenario: Scenario;
  listProfiles(): ListProfilesOutput;
  listRuns(args: ListRunsInput): ListRunsOutput;
  getRun(runId: string): Run;
  setActive(name: string): SetActiveProfileOutput;
  createProfile(name: string, description: string): CreateProfileOutput;
  homeSummary(): HomeSummaryOutput;
  activity(limit: number): ActivityOutput;
  preferences(): PreferencesGetOutput;
}

function filterRuns(all: Run[], args: ListRunsInput): Run[] {
  let list = all;
  if (args.profile) list = list.filter((r) => r.profile === args.profile);
  if (args.script) list = list.filter((r) => r.script === args.script);
  if (args.app) list = list.filter((r) => r.app === args.app);
  return list.slice(0, args.limit ?? 20);
}

/** `problems`, `healthy`, `busy` and `error` all share this shape: reads behave identically for `busy` and `error` (their scenario's writes or every call, respectively, are rejected in `handlers.ts` before a handler ever runs). */
function liveData(scenario: Scenario): ScenarioData {
  const healthy = scenario === "healthy";
  const since = ago(120);
  const runs = buildRuns(healthy);
  const activityLog = buildActivity();
  const profiles: string[] = ["commercial-one-day", "doc-series"];
  let active: string | null = "commercial-one-day";
  const variableIssues = healthy ? 0 : 1;
  const staleCount = healthy ? 0 : 3;

  return {
    scenario,
    listProfiles: () => ({ active, profiles: [...profiles] }),
    listRuns: (args) => ({ runs: filterRuns(runs, args) }),
    getRun: (runId) => {
      const found = runs.find((r) => r.run_id === runId);
      if (!found) throw new BridgeError("error", `run '${runId}' not found`);
      return found;
    },
    setActive: (name) => {
      active = name;
      return { active: name };
    },
    createProfile: (name, description) => {
      const becameActive = profiles.length === 0;
      profiles.push(name);
      if (becameActive) active = name;
      const profile: Profile = { version: 1, name, description, variables: {} };
      return { profile, active: becameActive };
    },
    homeSummary: () => {
      const { newRuns, failed } = sinceSplit(runs, since);
      const python = pythonStatus(healthy);
      const counts: HomeCounts = {
        runs_since: newRuns.length,
        failed_since: failed.length,
        scripts_attached: healthy ? 2 : 2,
        variables: healthy ? 1 : 0,
      };
      const badges: SidebarBadges = {
        runs: failed.length,
        variables: variableIssues,
        apps: staleCount,
        settings: python.problem !== null ? 1 : 0,
      };
      return {
        since,
        active_profile: active,
        profiles: [...profiles],
        counts,
        badges,
        attention: [...attentionFromFailures(failed), ...fixedAttention(healthy)],
        recent_runs: runs.slice(0, 5),
        recent_activity: activityLog.slice(0, 3),
        python,
      };
    },
    activity: (limit) => ({ records: activityLog.slice(0, limit) }),
    preferences: () => ({ version: 1, last_opened: since, editor_command: null }),
  };
}

/** First launch: no profiles, no runs, no activity, nothing to flag. */
function emptyData(scenario: Scenario): ScenarioData {
  const profiles: string[] = [];
  let active: string | null = null;
  return {
    scenario,
    listProfiles: () => ({ active, profiles: [...profiles] }),
    listRuns: () => ({ runs: [] }),
    getRun: (runId) => {
      throw new BridgeError("error", `run '${runId}' not found`);
    },
    setActive: (name) => {
      active = name;
      return { active: name };
    },
    createProfile: (name, description) => {
      const becameActive = profiles.length === 0;
      profiles.push(name);
      if (becameActive) active = name;
      return { profile: { version: 1, name, description, variables: {} }, active: becameActive };
    },
    homeSummary: () => ({
      since: null,
      active_profile: active,
      profiles: [...profiles],
      counts: { runs_since: 0, failed_since: 0, scripts_attached: 0, variables: 0 },
      badges: { runs: 0, variables: 0, apps: 0, settings: 0 },
      attention: [],
      recent_runs: [],
      recent_activity: [],
      python: pythonStatus(true),
    }),
    activity: () => ({ records: [] }),
    preferences: () => ({ version: 1, last_opened: null, editor_command: null }),
  };
}

/** Build the data set for `?scenario=`, defaulting to `problems`. */
export function loadScenario(raw: string | null): ScenarioData {
  const scenario = parseScenario(raw);
  return scenario === "empty" ? emptyData(scenario) : liveData(scenario);
}
