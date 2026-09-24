/**
 * What each browser-preview scenario starts with: the data folder (profiles, variables, secrets, scripts),
 * the Hedge apps (registry or OffShoot Helper workspace, installed apps, the operator's own files), the
 * Python the apps use, runs and Claude activity. `model.ts` runs every tool and command against it. Every
 * timestamp is relative to `Date.now()`, so "Today" and "since you last opened" always have content no
 * matter when the preview runs.
 */
import type { ActivityRecord, Os, PreferencesGetOutput, RegValue, Run, Variable } from "@/api/tools.gen";
import { DATA_DIR, type HedgeSeed } from "./hedge";
import type { ProfileData, StoreSeed } from "./store";

export type Scenario = "problems" | "healthy" | "empty" | "error" | "busy" | "macos";

const SCENARIOS: readonly Scenario[] = ["problems", "healthy", "empty", "error", "busy", "macos"];

/** Unknown `?scenario=` values fall back to the default, `problems`. */
export function parseScenario(raw: string | null): Scenario {
  return (SCENARIOS as readonly string[]).includes(raw ?? "") ? (raw as Scenario) : "problems";
}

/** The version this preview pretends HedgeBuddy needs (matches the workspace version). */
export const REQUIRED_VERSION = "0.11.0";

const OFFSHOOT = "offshoot";
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

// ---- scripts --------------------------------------------------------------------------------------

/** Line 24 and line 41 are the lines the runs' tracebacks above point at. */
const ON_COPY_COMPLETE = `"""
{"hedgebuddy": 1, "app": "offshoot", "event": "FileCopyCompleted",
 "requires": {
   "SLACK_WEBHOOK": {"type": "secret", "description": "Incoming webhook URL"},
   "PROJECT_NAME": {"type": "string"},
   "CLIENT_EMAIL": {"type": "string", "description": "Who gets the delivery report"}
 }}
---
Posts each finished card to Slack, then checks how the copy ended.
"""
import json
import urllib.request

import hedgebuddy as hb


@hb.script
def main(event, vars):
    label = event.sourceInfo.get("label", "card")
    hb.log(f"copy of {label} finished, posting to Slack")
    text = f"{vars.PROJECT_NAME}: {label} copied to {event.destinationPath} ({event.state})"
    body = json.dumps({"text": text}).encode()
    request = urllib.request.Request(vars.SLACK_WEBHOOK, data=body)
    urllib.request.urlopen(request, timeout=10)
    hb.log(f"posted; the delivery report goes to {vars.CLIENT_EMAIL}")

    state = event.state.lower()
    if state == "success":
        return 0
    if state in ("failed", "canceled", "stopped"):
        hb.log(f"copy ended as {state}")
        return 1
    if state == "warnings":
        hb.log(f"copy finished with warnings; see {event.transferLogJSONPath}")
        return 0

    # Any other state means OffShoot sent the event before the copy
    # settled. Fail loudly so the run shows up on Home instead of being
    # counted as a success.
    hb.log(f"state was {event.state!r}")
    raise RuntimeError(f"unexpected state: {state}")
`;

const ON_DISK_ADDED = `"""
{"hedgebuddy": 1, "app": "offshoot", "event": "DiskAdded",
 "requires": {"NOTIFY": {"type": "bool", "description": "Log each card as it is mounted"}}}
---
Logs each card as OffShoot mounts it.
"""
import hedgebuddy as hb


@hb.script
def main(event, vars):
    if vars.NOTIFY:
        hb.log(f"{event.title} mounted at {event.rootFilePath} ({event.volumeKind})")
    return 0
`;

const FOOLCAT_REPORT = `"""
{"hedgebuddy": 1, "app": "foolcat", "event": "ReportCreated", "requires": {}}
---
Logs where each FoolCat report was written.
"""
import hedgebuddy as hb


@hb.script
def main(event, vars):
    if event.status != "success":
        hb.log(f"report failed: {event.error}")
        return 1
    hb.log(f"report ready: {event.pdfPath}")
    return 0
`;

const HELPERS_NOTES = `# Notes for the crew, kept with the scripts. This file has no manifest, so
# it is never attached to an app event.
#
# - Card labels are the camera letter plus a roll number: A001, B014.
# - Offloads go to every folder in DEST_ROOTS.


def card_label(camera, roll):
    return f"{camera}{roll:03d}"
`;

const RENDER_PROXIES = `"""
{"hedgebuddy": 1, "app": "offshoot", "event": "FileCopyCompleted",
 "requires": {"PROXY_ROOT": {"type": "path", "description": "Where proxies are written"}}}
---
Queues proxies for each finished card.
"""
import hedgebuddy as hb


@hb.script
def main(event, vars):
    hb.log(f"queueing proxies for {event.destinationPath} in {vars.PROXY_ROOT}")
    return 0
`;

// ---- profiles -------------------------------------------------------------------------------------

function vars(entries: [string, Variable][]): Map<string, Variable> {
  return new Map(entries);
}

const SLACK_WEBHOOK = "https://hooks.slack.com/services/T000/B000/XXXX";

/** The mockups' profile. `healthy` sets `CLIENT_EMAIL` and moves `REPORT_DIR` to a mounted drive. */
export function commercialOneDay(healthy: boolean): ProfileData {
  const variables = vars([
    ["API_URL", { type: "url", value: "https://api.example.com/v1", description: "Delivery API" }],
    ["CAMERAS", { type: "string[]", value: ["A", "B"], description: "Camera letters on this shoot" }],
    ["DEST_ROOTS", { type: "path[]", value: ["D:/Offload", "F:/Offload"], description: "Offload destinations" }],
    ["NOTIFY", { type: "bool", value: true, description: "Log each card as it is mounted" }],
    ["PROJECT_NAME", { type: "string", value: "ClientX Spot", description: "Client and project name" }],
    ["REPORT_DIR", { type: "path", value: healthy ? "D:/Reports" : "X:/Reports", description: "Where FoolCat reports are copied" }],
    ["RETRIES", { type: "int", value: 3, description: "How often to retry a failed upload" }],
    ["SLACK_WEBHOOK", { type: "secret", description: "Incoming webhook URL" }],
    // No description, so the screens show that state too.
    ["THRESHOLD", { type: "float", value: 0.5, description: "" }],
  ]);
  if (healthy) variables.set("CLIENT_EMAIL", { type: "string", value: "delivery@clientx.example", description: "Who gets the delivery report" });
  return {
    description: "One-day commercial for Client X",
    variables,
    secrets: new Map([["SLACK_WEBHOOK", SLACK_WEBHOOK]]),
    scripts: new Map([
      ["foolcat_report.py", FOOLCAT_REPORT],
      ["helpers_notes.py", HELPERS_NOTES],
      ["on_copy_complete.py", ON_COPY_COMPLETE],
      ["on_disk_added.py", ON_DISK_ADDED],
    ]),
  };
}

function docSeries(): ProfileData {
  return {
    description: "Documentary series, weekly offloads",
    variables: vars([
      ["PROXY_ROOT", { type: "path", value: "D:/Proxies", description: "Where proxies are written" }],
      ["SERIES_NAME", { type: "string", value: "The Long Road", description: "Series title" }],
    ]),
    secrets: new Map(),
    scripts: new Map([["render_proxies.py", RENDER_PROXIES]]),
  };
}

// ---- Hedge apps -----------------------------------------------------------------------------------

const OFFSHOOT_KEY = "HKCU\\Software\\Hedge";
const FOOLCAT_KEY = "HKCU\\Software\\FoolCat";

/** The operator's own script (VerificationIssue), outside HedgeBuddy. */
const OWN_SCRIPT = "C:\\Tools\\notify_dit.py";

/** Scripts an old tool left attached and then deleted. */
const STALE_DIR = "C:\\Users\\you\\Quills\\service";

function scriptPath(os: Os, script: string): string {
  const sep = os === "windows" ? "\\" : "/";
  return [DATA_DIR[os], "profiles", "commercial-one-day", "scripts", script].join(sep);
}

const str = (data: string): RegValue => ({ type: "string", data });
const dword = (data: number): RegValue => ({ type: "dword", data });

/** Windows: OffShoot and FoolCat installed with scripting on, this profile's scripts attached. */
function windowsApps(stale: boolean): HedgeSeed {
  const offshoot: Record<string, RegValue> = {
    BuildVersion: str("26.1 (1023)"),
    EventScriptAllowScripting: dword(1),
    EventScriptFileCopyCompleted: str(scriptPath("windows", "on_copy_complete.py")),
    EventScriptDiskAdded: str(scriptPath("windows", "on_disk_added.py")),
    EventScriptCheckpointIssue: str(OWN_SCRIPT),
  };
  if (stale) {
    offshoot.EventScriptDiskIdle = str(`${STALE_DIR}\\on_disk_idle.py`);
    offshoot.EventScriptAllDisksIdle = str(`${STALE_DIR}\\on_all_disks_idle.py`);
    offshoot.EventScriptDiskBusy = str(`${STALE_DIR}\\on_disk_busy.py`);
  }
  return {
    registry: {
      [OFFSHOOT_KEY]: offshoot,
      [FOOLCAT_KEY]: {
        BuildVersion: str("26.1.1"),
        EventScriptAllowScripting: dword(1),
        EventScriptReportCreated: str(scriptPath("windows", "foolcat_report.py")),
      },
    },
    workspace: null,
    bundles: {},
    files: [OWN_SCRIPT],
  };
}

/** macOS: OffShoot, FoolCat and Canister installed; FileCopyCompleted staged in the Helper workspace. */
function macosApps(): HedgeSeed {
  return {
    registry: {},
    workspace: { scripting_opt_in: true, scripting_events_file_copy_completed: scriptPath("macos", "on_copy_complete.py") },
    bundles: { "/Applications/OffShoot.app": "26.1 (1023)", "/Applications/FoolCat.app": "26.1.1", "/Applications/Canister.app": "26.1" },
    files: [],
  };
}

/** A first launch: the apps are installed, nothing is attached and scripting is not turned on yet. */
function freshApps(): HedgeSeed {
  return {
    registry: { [OFFSHOOT_KEY]: { BuildVersion: str("26.1 (1023)") }, [FOOLCAT_KEY]: { BuildVersion: str("26.1.1") } },
    workspace: null,
    bundles: {},
    files: [],
  };
}

// ---- Python ---------------------------------------------------------------------------------------

/** The interpreter the Hedge apps use (python_env.rs `PythonInfo`), or null when none is found. */
export interface PythonSeed {
  executable: string;
  version: string;
  /** How the apps start it, e.g. `py -3`. */
  launcher: string[];
  /** The `hedgebuddy` version installed there, if any. */
  installed: string | null;
}

function python(os: Os, installed: string | null): PythonSeed {
  return os === "windows"
    ? { executable: "C:\\Python313\\python.exe", version: "3.13.5", launcher: ["py", "-3"], installed }
    : { executable: "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3", version: "3.13.5", launcher: ["python3"], installed };
}

// ---- scenarios ------------------------------------------------------------------------------------

/** Everything one scenario starts with. */
export interface ScenarioSeed {
  scenario: Scenario;
  os: Os;
  store: StoreSeed;
  hedge: HedgeSeed;
  python: PythonSeed | null;
  runs: Run[];
  activity: ActivityRecord[];
  /** When the app was last opened before this session, or null on a first launch. */
  since: string | null;
  preferences: PreferencesGetOutput;
}

/**
 * `problems` matches the mockups; `healthy` has nothing to flag; `empty` is a first launch; `error` and
 * `busy` read like `problems` (their failures are injected in `handlers.ts`); `macos` is `problems` on a Mac.
 */
export function scenarioSeed(scenario: Scenario): ScenarioSeed {
  if (scenario === "empty") {
    return {
      scenario,
      os: "windows",
      store: { profiles: {}, active: null },
      hedge: freshApps(),
      python: python("windows", REQUIRED_VERSION),
      runs: [],
      activity: [],
      since: null,
      preferences: { version: 1, last_opened: null, editor_command: null },
    };
  }
  const healthy = scenario === "healthy";
  const os: Os = scenario === "macos" ? "macos" : "windows";
  const since = ago(120);
  return {
    scenario,
    os,
    store: { profiles: { "commercial-one-day": commercialOneDay(healthy), "doc-series": docSeries() }, active: "commercial-one-day" },
    hedge: os === "macos" ? macosApps() : windowsApps(!healthy),
    python: python(os, healthy ? REQUIRED_VERSION : "0.10.0"),
    runs: buildRuns(healthy),
    activity: buildActivity(),
    since,
    preferences: { version: 1, last_opened: since, editor_command: null },
  };
}

/** Where `pick_import_file` points: an export of `problems`' `commercial-one-day`, without secret values. */
export const IMPORT_FILE = "C:/Users/you/Documents/commercial-one-day.hedgebuddy.json";
