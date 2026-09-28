import type { Action, AttachState, RegValue } from "@/api/tools.gen";

/** What a ledger row is about; each maps to one Lucide icon in the change-preview dialog (Design direction,
 *  5B; `backup` and `new_file` added in 5C for Connect's Claude Desktop preview, spec §6.6/§7). */
export type ChangeKind = "registry" | "registry_delete" | "workspace" | "file" | "delete" | "attach" | "detach" | "backup" | "new_file";

/**
 * Plain words with an optional embedded path or registry value, so the change-preview dialog can show that
 * part in mono (with wrap-friendly breaks at its separators) while everything else stays plain text.
 */
export interface Words {
  /** The words before the path (or the whole sentence, when there is no path). */
  text: string;
  /** A file path, registry value or script name worth setting in mono, if these words carry one. */
  path?: string;
  /** Plain words after the mono segment, for the rare sentence that has more to say once it ("… from
   *  profile doc-series"). */
  after?: string;
  /** A second mono segment following `after`'s plain words — a profile name, typically ("from profile "
   *  + this, in mono, same typography rule as `path`). Nothing renders after it: every caller's sentence
   *  ends here or continues outside this `Words` entirely. */
  afterPath?: string;
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

/** One phrase of a `describeSkipReason` result: `text` is plain words, `name` (when present, instead of
 *  `text`) is a variable's name — mono everywhere, including here (typography rule). */
export interface SkipReasonPart {
  text?: string;
  name?: string;
}

/**
 * A sync skip's raw `reason` in plain words (Task 12 ruling: "Sync skip reasons"). Core's own text for unmet
 * requirements reads `"unmet requirements: NAME (TYPE missing)"` or `"NAME (is X, needs Y)"`
 * (`describe_issues`, `crates/core/src/hedge/sync.rs`); this turns each into "needs NAME" or "NAME should be
 * Y", with NAME its own part so the caller can set it in mono. Everything else — a bad manifest, an unknown
 * app or event, an unsupported location — is already plain English from core, so it passes through unchanged
 * (one plain-text part, nothing to set in mono).
 */
export function describeSkipReason(reason: string): SkipReasonPart[] {
  const m = /^unmet requirements: (.+)$/.exec(reason);
  if (!m) return [{ text: reason }];
  const parts = m[1].split(/,\s*(?=[A-Z][A-Z0-9_]*\s*\()/);
  const out: SkipReasonPart[] = [];
  parts.forEach((part, i) => {
    if (i > 0) out.push({ text: ", " });
    const trimmed = part.trim();
    const missing = /^([A-Z][A-Z0-9_]*)\s*\([^)]*missing\)$/.exec(trimmed);
    if (missing) {
      out.push({ text: "needs " }, { name: missing[1] });
      return;
    }
    const mismatch = /^([A-Z][A-Z0-9_]*)\s*\(is\s+[^,]+,\s*needs\s+([^)]+)\)$/.exec(trimmed);
    if (mismatch) {
      out.push({ name: mismatch[1] }, { text: ` should be ${mismatch[2]}` });
      return;
    }
    out.push({ text: trimmed });
  });
  return out;
}

/** Plain words for what an app event runs now, so a change preview can say what an attach would replace (spec §7). */
export function describeState(state: AttachState): Words {
  switch (state.state) {
    case "attached":
      // The script name is the mono segment (typography rule: script names are mono everywhere); "from
      // profile …" is plain words after it, not before, so `path` (not `text`) carries the name. The
      // profile name in that trailing text is itself mono (same rule), hence `afterPath`.
      return { text: "", path: state.script, after: " from profile ", afterPath: state.profile };
    case "external":
      return { text: "your own file ", path: state.path };
    case "stale":
      return { text: "a missing file: ", path: state.path };
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
