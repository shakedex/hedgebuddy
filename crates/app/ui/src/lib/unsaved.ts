import { useEffect, useSyncExternalStore } from "react";

/**
 * A dirty key's scope (Task 7 ruling): `"profile"` (the default) blocks both a route navigation and a
 * profile action (switch, delete, import-and-switch, create-and-activate) — the ordinary case, since most
 * editors show one profile's own data. `"route"` blocks only a route navigation: the Settings editor command
 * is global, not per-profile, so switching profiles must not ask about it, even though leaving Settings for
 * another screen still should.
 */
export type UnsavedScope = "route" | "profile";

/** Edits that are not saved yet, by editor key, with the scope each was registered under (spec §7: leaving
 *  with unsaved changes asks first). */
const dirty = new Map<string, UnsavedScope>();
const listeners = new Set<() => void>();
let pending: { decide: (leave: boolean) => void } | null = null;
const notify = () => listeners.forEach((l) => l());

/**
 * Mark an editor dirty while `isDirty` is true; cleared on unmount. Deliberately has no dependency array: it
 * re-syncs the shared set on *every* render, not only when `isDirty`'s value changes. Without that, a form
 * that stays dirty (same `true` value across renders) while something else forcibly clears its key —
 * `markSaved`, below — would never get re-added, since an effect keyed on `[key, isDirty]` only re-runs on a
 * genuine change. Re-syncing every render makes the shared set self-correcting instead.
 */
export function useUnsaved(key: string, isDirty: boolean, opts?: { scope?: UnsavedScope }) {
  const scope = opts?.scope ?? "profile";
  useEffect(() => {
    if (isDirty) dirty.set(key, scope);
    else dirty.delete(key);
    return () => {
      dirty.delete(key);
    };
  });
}

/** Whether anything is unsaved. With a `scope`, only keys registered under that exact scope count — used by
 *  a profile action to ignore a route-only key (the Settings editor command). With no `scope`, every key
 *  counts, regardless of its own scope — a route navigation always asks about everything unsaved. */
export const hasUnsaved = (scope?: UnsavedScope) => {
  if (scope === undefined) return dirty.size > 0;
  for (const s of dirty.values()) if (s === scope) return true;
  return false;
};

/**
 * Clears `key` unconditionally, for when the thing it names is gone for good (a delete) and there is nothing
 * left to ask about, dirty or not. Not for "this just saved, so it must be clean now" — a save's own success
 * handler should instead update the state that `isDirty` is computed from and let the resulting re-render
 * (and `useUnsaved`'s effect above) put the set in step, since the operator may have kept typing after the
 * save started; forcing the key out while a *newer* edit is still unsaved would silently drop it.
 */
export function markSaved(key: string) {
  dirty.delete(key);
}

/**
 * True to go ahead (discarding the edits), false to stay. Asks only when something is unsaved — pass
 * `"profile"` from a profile action (switch, delete, import-and-switch, create-and-activate) so a
 * `"route"`-scoped key (Settings' editor command) never blocks it; a guarded route navigation calls this with
 * no scope, so it still asks about every key regardless of scope.
 *
 * Deliberately does not clear `dirty` on "Discard": the actual leaving (a navigate, a profile switch, a
 * delete) unmounts whichever form was dirty, and `useUnsaved`'s own cleanup unregisters its key then. Until
 * that leaving genuinely happens — Discard doesn't guarantee it does, since the caller can still bail out
 * afterwards (Cancel on a delete's own preview, say) — the form is still on screen and still unsaved, so a
 * *different* attempt to leave should still ask. Forcing the set clean here left exactly that gap.
 */
export function confirmLeave(scope?: UnsavedScope): Promise<boolean> {
  if (!hasUnsaved(scope)) return Promise.resolve(true);
  if (pending) return Promise.resolve(false);
  return new Promise((resolve) => {
    pending = {
      decide: (leave) => {
        pending = null;
        notify();
        resolve(leave);
      },
    };
    notify();
  });
}

/** The open question, for UnsavedDialog. */
export function useLeavePrompt() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pending,
  );
}
