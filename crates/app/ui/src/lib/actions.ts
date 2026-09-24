import type { Action, AttachState, RegValue } from "@/api/tools.gen";

/** What a ledger row is about; each maps to one Lucide icon in the change-preview dialog (Design direction, 5B). */
export type ChangeKind = "registry" | "registry_delete" | "workspace" | "file" | "delete" | "attach" | "detach";

/** One line of the change preview (spec §7: the words come from the dry-run result). */
export interface ChangeRow {
  kind: ChangeKind;
  /** What changes, shown in mono: a registry value, a file. */
  target: string;
  /** How it changes, in plain words. */
  detail?: string;
}

function regValue(v: RegValue): string {
  return v.type === "string" ? v.data : String(v.data);
}

/** Turns the actions a dry run reports into plain-words ledger rows (spec §7). */
export function describeActions(actions: Action[]): ChangeRow[] {
  return actions.map((a): ChangeRow => {
    switch (a.action) {
      case "registry_set":
        return { kind: "registry", target: `${a.key}\\${a.value}`, detail: `set to ${regValue(a.data)}` };
      case "registry_delete":
        return { kind: "registry_delete", target: `${a.key}\\${a.value}`, detail: "removed" };
      case "workspace_prefs":
        return {
          kind: "workspace",
          target: a.path,
          detail: Object.entries(a.set)
            .map(([k, v]) => `${k} = ${typeof v === "string" ? v : JSON.stringify(v)}`)
            .join(", "),
        };
      case "write_file":
        return { kind: "file", target: a.path, detail: "written" };
      default: {
        const exhaustive: never = a;
        throw new Error(`unknown action: ${JSON.stringify(exhaustive)}`);
      }
    }
  });
}

/** Plain words for what an app event runs now, so a change preview can say what an attach would replace (spec §7). */
export function describeState(state: AttachState): string {
  switch (state.state) {
    case "attached":
      return `${state.script} from profile ${state.profile}`;
    case "external":
      return `your own file ${state.path}`;
    case "stale":
      return `a file that no longer exists: ${state.path}`;
    case "staged":
      return "a change waiting in OffShoot Helper";
    case "detached":
      return "nothing";
    case "manual":
      return state.note;
    case "unsupported":
      return "nothing (not supported here)";
    default: {
      const exhaustive: never = state;
      throw new Error(`unknown attach state: ${JSON.stringify(exhaustive)}`);
    }
  }
}
