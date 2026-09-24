import type { Action, AttachState, RegValue } from "@/api/tools.gen";

/** What a ledger row is about; each maps to one Lucide icon in the change-preview dialog (Design direction, 5B). */
export type ChangeKind = "registry" | "registry_delete" | "workspace" | "file" | "delete" | "attach" | "detach";

/**
 * Plain words with an optional embedded path or registry value, so the change-preview dialog can show that
 * part in mono (with wrap-friendly breaks at its separators) while everything else stays plain text.
 */
export interface Words {
  /** The words before the path (or the whole sentence, when there is no path). */
  text: string;
  /** A file path or registry value worth setting in mono, if these words carry one. */
  path?: string;
}

/** One line of the change preview (spec §7: the words come from the dry-run result). */
export interface ChangeRow {
  kind: ChangeKind;
  /** What changes, shown in mono: a registry value, a file. */
  target: string;
  /** How it changes, in plain words. */
  detail?: Words;
}

function regValue(v: RegValue): string {
  return v.type === "string" ? v.data : String(v.data);
}

/** Turns the actions a dry run reports into plain-words ledger rows (spec §7). */
export function describeActions(actions: Action[]): ChangeRow[] {
  return actions.map((a): ChangeRow => {
    switch (a.action) {
      case "registry_set":
        return {
          kind: "registry",
          target: `${a.key}\\${a.value}`,
          // Only a string registry value is a path worth its own mono run; a dword is a flag or a counter.
          detail: a.data.type === "string" ? { text: "set to ", path: a.data.data } : { text: `set to ${regValue(a.data)}` },
        };
      case "registry_delete":
        return { kind: "registry_delete", target: `${a.key}\\${a.value}`, detail: { text: "removed" } };
      case "workspace_prefs":
        return {
          kind: "workspace",
          target: a.path,
          detail: {
            text: Object.entries(a.set)
              .map(([k, v]) => `${k} = ${typeof v === "string" ? v : JSON.stringify(v)}`)
              .join(", "),
          },
        };
      case "write_file":
        return { kind: "file", target: a.path, detail: { text: "written" } };
      default: {
        const exhaustive: never = a;
        throw new Error(`unknown action: ${JSON.stringify(exhaustive)}`);
      }
    }
  });
}

/** Plain words for what an app event runs now, so a change preview can say what an attach would replace (spec §7). */
export function describeState(state: AttachState): Words {
  switch (state.state) {
    case "attached":
      return { text: `${state.script} from profile ${state.profile}` };
    case "external":
      return { text: "your own file ", path: state.path };
    case "stale":
      return { text: "a file that no longer exists: ", path: state.path };
    case "staged":
      return { text: "a change waiting in OffShoot Helper" };
    case "detached":
      return { text: "nothing" };
    case "manual":
      return { text: state.note };
    case "unsupported":
      return { text: "nothing (not supported here)" };
    default: {
      const exhaustive: never = state;
      throw new Error(`unknown attach state: ${JSON.stringify(exhaustive)}`);
    }
  }
}
