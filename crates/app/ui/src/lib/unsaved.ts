import { useEffect, useSyncExternalStore } from "react";

/** Edits that are not saved yet, by editor key (spec §7: leaving with unsaved changes asks first). */
const dirty = new Set<string>();
const listeners = new Set<() => void>();
let pending: { decide: (leave: boolean) => void } | null = null;
const notify = () => listeners.forEach((l) => l());

/** Mark an editor dirty while `isDirty` is true; cleared on unmount. */
export function useUnsaved(key: string, isDirty: boolean) {
  useEffect(() => {
    if (isDirty) dirty.add(key);
    else dirty.delete(key);
    return () => {
      dirty.delete(key);
    };
  }, [key, isDirty]);
}

export const hasUnsaved = () => dirty.size > 0;

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
