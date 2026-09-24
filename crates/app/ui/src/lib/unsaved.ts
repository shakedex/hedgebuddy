import { useEffect, useSyncExternalStore } from "react";

/** Edits that are not saved yet, by editor key (spec §7: leaving with unsaved changes asks first). */
const dirty = new Set<string>();
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
export function useUnsaved(key: string, isDirty: boolean) {
  useEffect(() => {
    if (isDirty) dirty.add(key);
    else dirty.delete(key);
    return () => {
      dirty.delete(key);
    };
  });
}

export const hasUnsaved = () => dirty.size > 0;

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

/** True to go ahead (discarding the edits), false to stay. Asks only when something is unsaved. */
export function confirmLeave(): Promise<boolean> {
  if (!hasUnsaved()) return Promise.resolve(true);
  if (pending) return Promise.resolve(false);
  return new Promise((resolve) => {
    pending = {
      decide: (leave) => {
        pending = null;
        if (leave) dirty.clear();
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
