/**
 * The preview's copy of `catalog/*.toml`, typed as `describe_app` returns it (the Rust serialization:
 * absent optional keys are left out, `params`/`platforms`/`confirm` are always present). One deliberate
 * difference: Canister has no `detect.windows` here, so the preview shows an app that is not available on
 * this platform (the real catalog lists an unverified Windows location).
 */
import { ToolError } from "./rules";
import type { AppManifest, CommandForm, CommandSpec, EventSpec } from "@/api/tools.gen";

function event(
  id: string,
  description: string,
  payload: string[],
  names: { registry_name?: string; pref_name?: string; json_fields?: string[] } = {},
): EventSpec {
  const spec: EventSpec = { id, description, payload, json_fields: names.json_fields ?? [] };
  if (names.registry_name) spec.registry_name = names.registry_name;
  if (names.pref_name) spec.pref_name = names.pref_name;
  return spec;
}

function command(
  id: string,
  description: string,
  form: CommandForm,
  opts: { params?: Record<string, string>; confirm?: boolean; list_separator?: string } = {},
): CommandSpec {
  const spec: CommandSpec = { id, description, form, params: opts.params ?? {}, platforms: [], confirm: opts.confirm ?? false };
  if (opts.list_separator) spec.list_separator = opts.list_separator;
  return spec;
}

const OFFSHOOT: AppManifest = {
  catalog_version: 1,
  tested_against: "26.1",
  app: { id: "offshoot", name: "OffShoot", scheme: "offshoot", requires_pro: true, docs: "https://docs.hedge.video/offshoot/features/automation" },
  detect: {
    windows: { registry_key: "HKCU\\Software\\Hedge", version_value: "BuildVersion" },
    macos: { app_path: "/Applications/OffShoot.app", bundle_id: "nl.syncfactory.Hedge.Mac" },
  },
  scripting: {
    windows: { kind: "registry", key: "HKCU\\Software\\Hedge", enable_value: "EventScriptAllowScripting", value_pattern: "EventScript{registry_name}" },
    macos: {
      kind: "helper_workspace",
      workspace_dir: "~/Library/Preferences/Hedge/Workspaces",
      workspace_file: "HedgeBuddy.json",
      enable_pref: "scripting_opt_in",
      pref_pattern: "scripting_events_{pref_name}",
    },
  },
  events: [
    event("OffShootStarted", "OffShoot launched. Empty payload.", [], { registry_name: "AppStarted" }),
    event(
      "DiskAdded",
      "A disk was mounted.",
      [
        "DiskAdded_allowed",
        "DiskAdded_availableDiskSpace",
        "DiskAdded_deviceName",
        "DiskAdded_diskSize",
        "DiskAdded_hidden",
        "DiskAdded_modelName",
        "DiskAdded_mountedAt",
        "DiskAdded_protocolName",
        "DiskAdded_rootFilePath",
        "DiskAdded_title",
        "DiskAdded_volumeKind",
      ],
      { registry_name: "DiskAdded", pref_name: "disk_added" },
    ),
    event("DiskRemoved", "A disk was unmounted.", ["DiskRemoved_rootFilePath", "DiskRemoved_title", "DiskRemoved_unmountedAt"], {
      registry_name: "DiskRemoved",
      pref_name: "disk_removed",
    }),
    event("DiskBusy", "A disk started transferring.", ["DiskBusy_rootFilePath", "DiskBusy_title"], {
      registry_name: "DiskBusy",
      pref_name: "disk_busy",
    }),
    event(
      "DiskIdle",
      "A disk finished all its transfers.",
      ["DiskIdle_diskType", "DiskIdle_hasFailedTransfers", "DiskIdle_rootFilePath", "DiskIdle_title"],
      { registry_name: "DiskIdle", pref_name: "disk_idle" },
    ),
    event("DisksIdle", "All disks finished their transfers. Empty payload.", [], { registry_name: "AllDisksIdle", pref_name: "disks_idle" }),
    event("TransfersAdded", "Transfers were queued. These keys are not prefixed with the event name.", ["transferType", "addedAt", "transferGroups"], {
      registry_name: "TransfersAdded",
    }),
    event("SourceAdded", "A source was added (new in 26.1). Attachment location unverified on both platforms.", ["SourceAdded_name", "SourceAdded_paths"]),
    event(
      "FileCopyCompleted",
      "A transfer finished (state is Success, Failed, Warnings, Canceled or Stopped).",
      [
        "FileCopyCompleted_sourcePaths",
        "FileCopyCompleted_presetName",
        "FileCopyCompleted_state",
        "FileCopyCompleted_sourceInfo",
        "FileCopyCompleted_startedAt",
        "FileCopyCompleted_destinationPath",
        "FileCopyCompleted_verification_mode",
        "FileCopyCompleted_duration",
        "FileCopyCompleted_bytesCopied",
        "FileCopyCompleted_id",
        "FileCopyCompleted_transferLogJSONPath",
      ],
      { registry_name: "FileCopyCompleted", pref_name: "file_copy_completed", json_fields: ["FileCopyCompleted_sourceInfo"] },
    ),
    event("VerificationIssue", "Verification found a problem with a file.", ["VerificationIssue_description", "VerificationIssue_filePath"], {
      registry_name: "CheckpointIssue",
      pref_name: "checkpoint_issue",
    }),
  ],
  commands: [
    command("open", "Launch or focus OffShoot.", "url"),
    command("quit", "Quit OffShoot.", "url", { confirm: true }),
    command("restart", "Restart OffShoot.", "url", { confirm: true }),
    command("reloadPresets", "Reload presets from disk after writing one.", "url"),
    command("reset", "Clear sources or destinations. type is 'sources' or 'destinations'.", "url", { params: { type: "string" }, confirm: true }),
    command("setSource", "Add a source with an optional label.", "action", { params: { label: "string?", paths: "path[]" } }),
    command("setDestination", "Add a destination.", "action", { params: { path: "path" } }),
    command("addTransfers", "Start transfers for the current sources and destinations.", "url", { confirm: true }),
    command("restartTransfer", "Restart a transfer by its id (FileCopyCompleted_id).", "action", { params: { id: "string" }, confirm: true }),
  ],
  files: {
    windows: { callback_log: "%APPDATA%\\Hedge\\HedgeCallback.log", event_log: "%APPDATA%\\Hedge\\Hedge.log" },
    macos: { callback_log: "~/Library/Logs/Hedge/urlSchemeResponseLog.txt" },
  },
  presets: {
    windows: {
      dir: "%APPDATA%\\Hedge\\Presets",
      registry_key: "HKCU\\Software\\Hedge",
      location_override_value: "PresetsLocation",
      selected_value: "SessionVariableSelectedPreset",
    },
  },
};

const FOOLCAT: AppManifest = {
  catalog_version: 1,
  tested_against: "26.1.1",
  app: { id: "foolcat", name: "FoolCat", scheme: "foolcat", requires_pro: true, docs: "https://docs.hedge.video/foolcat/automation" },
  detect: {
    windows: { registry_key: "HKCU\\Software\\FoolCat", version_value: "BuildVersion" },
    macos: { app_path: "/Applications/FoolCat.app" },
  },
  scripting: {
    windows: { kind: "registry", key: "HKCU\\Software\\FoolCat", enable_value: "EventScriptAllowScripting", value_pattern: "EventScript{registry_name}" },
    macos: { kind: "manual", note: "Attach the script in FoolCat > Settings > Scripting" },
  },
  events: [
    event("FoolCatStarted", "FoolCat launched. Empty payload.", [], { registry_name: "AppStarted" }),
    event("ReportCreated", "A report finished rendering.", ["ReportCreated_status", "ReportCreated_error", "ReportCreated_pdfPath", "ReportCreated_htmlPath"], {
      registry_name: "ReportCreated",
    }),
  ],
  commands: [
    command("open", "Launch or focus FoolCat.", "url"),
    command("create", "Create a report from a source folder into a destination folder.", "url", {
      params: { description: "string?", destination: "path", name: "string?", source: "path" },
      confirm: true,
    }),
  ],
  files: { macos: { event_log: "~/Library/Application Support/FoolCat/Event Log/FoolCatEvents.log" } },
  presets: {},
};

const EDITREADY: AppManifest = {
  catalog_version: 1,
  tested_against: "25.4",
  app: { id: "editready", name: "EditReady", scheme: "editready", requires_pro: true, docs: "https://docs.hedge.video/editready/automation" },
  detect: {
    windows: { registry_key: "HKCU\\Software\\EditReady", version_value: "BuildVersion" },
    macos: { app_path: "/Applications/EditReady.app" },
  },
  scripting: {
    windows: { kind: "manual", note: "Attach the script in EditReady's Scripting settings (Windows scripting is not documented)" },
    macos: { kind: "manual", note: "Attach the script in EditReady > Settings > Scripting" },
  },
  events: [
    event("EditReadyStarted", "EditReady launched. Empty payload.", []),
    event("FileConversionCompleted", "A conversion finished.", [
      "FileConversionCompleted_sourcePath",
      "FileConversionCompleted_destinationPath",
      "FileConversionCompleted_status",
      "FileConversionCompleted_error",
    ]),
  ],
  commands: [
    command("open", "Launch or focus EditReady.", "url"),
    command("add", "Add a source file.", "url", { params: { sourcePath: "path" } }),
    command("transcode", "Transcode a file with a named preset.", "url", {
      params: { destinationPath: "path", preset: "string", sourcePath: "path" },
      confirm: true,
    }),
  ],
  files: { macos: { event_log: "~/Library/Application Support/EditReady/Event Log/EditReadyEvents.log" } },
  presets: {},
};

const CANISTER: AppManifest = {
  catalog_version: 1,
  tested_against: "26.1",
  app: { id: "canister", name: "Canister", scheme: "canister", requires_pro: false, docs: "https://docs.hedge.video/canister/features/automation" },
  // No `windows` entry: see the file comment.
  detect: { macos: { app_path: "/Applications/Canister.app" } },
  scripting: {},
  events: [],
  commands: [
    command("open", "Launch or focus Canister.", "url"),
    command("addarchive", "Archive sources to tape.", "url", {
      params: { destinationfolder: "string?", destinationtape: "string?", sources: "path[]" },
      confirm: true,
      list_separator: "|",
    }),
    command("addretrieve", "Retrieve sources from a tape.", "url", {
      params: { destinationpath: "path", sources: "path[]", sourcetape: "string" },
      confirm: true,
      list_separator: "|",
    }),
    command("gettapes", "Write the tape list as JSON to a file. The path is required on macOS.", "url", { params: { path: "path?" }, confirm: true }),
  ],
  files: {},
  presets: {},
};

/** Every catalog app, sorted by id (the order the real catalog lists them in). */
export const CATALOG: readonly AppManifest[] = [CANISTER, EDITREADY, FOOLCAT, OFFSHOOT];

/** The app with this id, or core's "not in the catalog" error. */
export function catalogApp(id: string): AppManifest {
  const found = CATALOG.find((m) => m.app.id === id);
  if (!found) throw new ToolError(`app '${id}' is not in the catalog`);
  return found;
}

/** The app's event with this id, or core's "has no event" error. */
export function catalogEvent(m: AppManifest, id: string): EventSpec {
  const found = m.events.find((e) => e.id === id);
  if (!found) throw new ToolError(`${m.app.id} has no event '${id}'`);
  return found;
}
